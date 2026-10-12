// 브라우저 OCR 전·후처리 (순수 모듈, 의존성 없음). RapidOCR 3.9.2(Apache-2.0) Python 구현을 명세로 이식했다:
//  - 검출(DB): 짧은 변을 736 으로 맞춘 뒤 32 배수로 크기 조정 → (x/255 − 0.5)/0.5 → 확률 지도 → 임계값(thresh) 이진화·2×2 팽창 →
//    연결 요소마다 최소 외접 사각형 → 상자 점수(box_thresh) → 확장(unclip 1.6) → 원본 좌표로 → 위→아래·왼→오른 정렬.
//  - 인식: 상자를 원근 변환으로 잘라 높이 48 로 맞추고(세로가 1.5배 이상이면 90도 회전), 6개씩 너비 비율 순으로 묶어
//    가장 넓은 비율에 맞춰 0 으로 채운 뒤 인식 → CTC 디코드(연속 중복·blank 제거, 평균 확률) → 점수 0.5 미만 버림.
//  - 줄 방향 분류(cls)는 쓰지 않는다(짧은 금액 줄을 뒤집힌 줄로 오판해 평가에서 끔). 회전은 EXIF 와 화면의 회전 버튼이 맡는다.
//  - 이미지는 BGR 순서(모델 학습 순서)의 8비트 3채널 배열이다. 원본과의 차이(근사): OpenCV 의 윤곽선 대신 8-연결 요소의 볼록 껍질,
//    다각형 채우기는 화소 중심 판정, 보간(쌍선형 고정소수점·쌍삼차)의 반올림은 OpenCV 와 근사. 동등성은 저장소 밖 스크립트로 평가 세트에서 확인한다.

export interface Image3 {
  width: number;
  height: number;
  /** BGR 순서, 길이 width × height × 3 */
  data: Uint8Array;
}

export type Point = [number, number];
export type Quad = [Point, Point, Point, Point];

export interface DetOptions {
  limitSideLen: number;
  thresh: number;
  boxThresh: number;
  unclipRatio: number;
  maxCandidates: number;
}

export const DET_DEFAULTS: DetOptions = { limitSideLen: 736, thresh: 0.2, boxThresh: 0.3, unclipRatio: 1.6, maxCandidates: 1000 };
export const REC_HEIGHT = 48;
export const REC_BASE_WIDTH = 320;
export const REC_BATCH = 6;
export const TEXT_SCORE = 0.5;
/** 화면 쪽에서 다시 그릴 때의 긴 변 상한 */
export const MAX_SIDE = 1280;

/** 긴 변이 maxSide 를 넘으면 비율을 유지해 줄인 크기 (넘지 않으면 그대로) */
export function fitWithin(width: number, height: number, maxSide = MAX_SIDE): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxSide) return { width, height };
  const s = maxSide / long;
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

/** RGBA(캔버스 ImageData) → BGR 3채널 */
export function rgbaToBgr(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Image3 {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < width * height; i += 1, j += 3) {
    data[j] = rgba[i * 4 + 2] as number;
    data[j + 1] = rgba[i * 4 + 1] as number;
    data[j + 2] = rgba[i * 4] as number;
  }
  return { width, height, data };
}

/** 쌍선형 크기 조정 (OpenCV INTER_LINEAR 8비트 경로: 반화소 중심 좌표, 가중치 11비트 고정소수점) */
export function resizeBilinear(img: Image3, width: number, height: number): Image3 {
  const SCALE = 2048;
  const out = new Uint8Array(width * height * 3);
  const sx = img.width / width;
  const sy = img.height / height;
  const xs = new Int32Array(width);
  const ax = new Int32Array(width * 2);
  for (let x = 0; x < width; x += 1) {
    const f = Math.fround((x + 0.5) * sx - 0.5);
    let x0 = Math.floor(f);
    let fx = Math.fround(f - x0);
    if (x0 < 0) (x0 = 0), (fx = 0);
    if (x0 >= img.width - 1) (x0 = img.width - 1), (fx = 0);
    xs[x] = x0;
    ax[x * 2] = Math.round(Math.fround(1 - fx) * SCALE);
    ax[x * 2 + 1] = Math.round(fx * SCALE);
  }
  const rowAt = (y: number) => {
    const row = new Int32Array(width * 3);
    const yy = Math.min(Math.max(y, 0), img.height - 1) * img.width;
    for (let x = 0; x < width; x += 1) {
      const x0 = xs[x] as number;
      const x1 = Math.min(x0 + 1, img.width - 1);
      for (let c = 0; c < 3; c += 1) {
        row[x * 3 + c] = (img.data[(yy + x0) * 3 + c] as number) * (ax[x * 2] as number) + (img.data[(yy + x1) * 3 + c] as number) * (ax[x * 2 + 1] as number);
      }
    }
    return row;
  };
  // 세로 합성은 OpenCV 의 SIMD 경로(16·8 묶음)와 남은 꼬리(스칼라) 반올림이 다르다
  const n = width * 3;
  let vecEnd = Math.floor(n / 16) * 16;
  while (vecEnd < n - 8) vecEnd += 8;
  for (let y = 0; y < height; y += 1) {
    const f = Math.fround((y + 0.5) * sy - 0.5);
    const y0 = Math.floor(f);
    const fy = Math.fround(f - y0);
    const b0 = Math.round(Math.fround(1 - fy) * SCALE);
    const b1 = Math.round(fy * SCALE);
    const r0 = rowAt(y0);
    const r1 = rowAt(y0 + 1);
    for (let e = 0; e < n; e += 1) {
      const s0 = r0[e] as number;
      const s1 = r1[e] as number;
      const v = e < vecEnd ? (((b0 * (s0 >> 4)) >> 16) + ((b1 * (s1 >> 4)) >> 16) + 2) >> 2 : (s0 * b0 + s1 * b1 + (1 << 21)) / (1 << 22);
      out[y * n + e] = Math.min(255, Math.max(0, Math.floor(v)));
    }
  }
  return { width, height, data: out };
}

/** 검출 입력 크기: 짧은 변이 limit 보다 작으면 limit 으로 키우고, 양 변을 32 배수로 반올림 (limit_type=min) */
export function detInputSize(width: number, height: number, limit = DET_DEFAULTS.limitSideLen): { width: number; height: number } {
  const ratio = Math.min(width, height) < limit ? limit / Math.min(width, height) : 1;
  const w = Math.max(32, Math.round(Math.trunc(width * ratio) / 32) * 32);
  const h = Math.max(32, Math.round(Math.trunc(height * ratio) / 32) * 32);
  return { width: w, height: h };
}

/** HWC 8비트 → CHW float32, (x/255 − 0.5)/0.5. width 가 주어지면 그 너비로 0 채움(인식 묶음용) */
export function normalizeChw(img: Image3, padWidth = img.width): Float32Array {
  const out = new Float32Array(3 * img.height * padWidth);
  const plane = img.height * padWidth;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      for (let c = 0; c < 3; c += 1) {
        out[c * plane + y * padWidth + x] = ((img.data[(y * img.width + x) * 3 + c] as number) / 255 - 0.5) / 0.5;
      }
    }
  }
  return out;
}

// ---------- 검출 후처리 ----------

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** 볼록 껍질 (monotone chain) */
export function convexHull(points: readonly Point[]): Point[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 2) return pts;
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2] as Point, lower[lower.length - 1] as Point, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i] as Point;
    while (upper.length >= 2 && cross(upper[upper.length - 2] as Point, upper[upper.length - 1] as Point, p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** 최소 외접 사각형 (회전 캘리퍼스): 네 꼭짓점과 짧은 변 */
export function minAreaRect(points: readonly Point[]): { corners: Quad; width: number; height: number } {
  const hull = convexHull(points);
  if (hull.length === 1) {
    const p = hull[0] as Point;
    return { corners: [p, p, p, p], width: 0, height: 0 };
  }
  let best: { area: number; corners: Quad; width: number; height: number } | null = null;
  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i] as Point;
    const b = hull[(i + 1) % hull.length] as Point;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len === 0) continue;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of hull) {
      const u = p[0] * ux + p[1] * uy;
      const v = -p[0] * uy + p[1] * ux;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const w = maxU - minU;
    const h = maxV - minV;
    const area = w * h;
    if (!best || area < best.area - 1e-9) {
      const at = (u: number, v: number): Point => [u * ux - v * uy, u * uy + v * ux];
      best = { area, width: w, height: h, corners: [at(minU, minV), at(maxU, minV), at(maxU, maxV), at(minU, maxV)] };
    }
  }
  return best ?? { corners: [hull[0] as Point, hull[0] as Point, hull[0] as Point, hull[0] as Point], width: 0, height: 0 };
}

/** RapidOCR get_mini_boxes 의 꼭짓점 순서(왼쪽 위·오른쪽 위·오른쪽 아래·왼쪽 아래)와 짧은 변 */
export function miniBox(points: readonly Point[]): { box: Quad; sside: number } {
  const rect = minAreaRect(points);
  const p = [...rect.corners].sort((a, b) => a[0] - b[0]);
  const [i1, i4] = (p[1] as Point)[1] > (p[0] as Point)[1] ? [0, 1] : [1, 0];
  const [i2, i3] = (p[3] as Point)[1] > (p[2] as Point)[1] ? [2, 3] : [3, 2];
  return { box: [p[i1] as Point, p[i2] as Point, p[i3] as Point, p[i4] as Point], sside: Math.min(rect.width, rect.height) };
}

function insidePolygon(x: number, y: number, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i] as Point;
    const [xj, yj] = poly[j] as Point;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** box_score_fast: 상자(정수로 내린 꼭짓점) 안 화소의 평균 확률 */
export function boxScore(prob: Float32Array, w: number, h: number, box: Quad): number {
  const xs = box.map((p) => p[0]);
  const ys = box.map((p) => p[1]);
  const clamp = (v: number, hi: number) => Math.min(Math.max(v, 0), hi);
  const xmin = clamp(Math.floor(Math.min(...xs)), w - 1);
  const xmax = clamp(Math.ceil(Math.max(...xs)), w - 1);
  const ymin = clamp(Math.floor(Math.min(...ys)), h - 1);
  const ymax = clamp(Math.ceil(Math.max(...ys)), h - 1);
  const poly = box.map((p) => [Math.trunc(p[0]), Math.trunc(p[1])] as Point);
  let sum = 0;
  let n = 0;
  for (let y = ymin; y <= ymax; y += 1) {
    for (let x = xmin; x <= xmax; x += 1) {
      // 경계 화소도 포함하도록 화소 중심을 조금 안쪽으로 본다(fillPoly 는 경계를 칠한다)
      if (insidePolygon(x + 0.5, y + 0.5, poly) || insidePolygon(x, y, poly)) {
        sum += prob[y * w + x] as number;
        n += 1;
      }
    }
  }
  return n === 0 ? 0 : sum / n;
}

/** unclip: 사각형을 면적 × 비율 ÷ 둘레 만큼 넓힌 뒤의 최소 외접 사각형(둥근 모서리 확장의 외접 사각형과 같다) */
export function unclipRect(box: Quad, ratio: number): Point[] {
  let area = 0;
  let perimeter = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = box[i] as Point;
    const b = box[(i + 1) % 4] as Point;
    area += a[0] * b[1] - b[0] * a[1];
    perimeter += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  area = Math.abs(area) / 2;
  if (perimeter === 0) return [...box];
  const d = (area * ratio) / perimeter;
  const [p0, p1, , p3] = box;
  const len01 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
  const len03 = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) || 1;
  const u: Point = [(p1[0] - p0[0]) / len01, (p1[1] - p0[1]) / len01];
  const v: Point = [(p3[0] - p0[0]) / len03, (p3[1] - p0[1]) / len03];
  const move = (p: Point, su: number, sv: number): Point => [p[0] + (su * u[0] + sv * v[0]) * d, p[1] + (su * u[1] + sv * v[1]) * d];
  return [move(box[0], -1, -1), move(box[1], 1, -1), move(box[2], 1, 1), move(box[3], -1, 1)];
}

export interface DetBox {
  box: Quad;
  score: number;
}

/** 확률 지도(predW × predH) → 원본(srcW × srcH) 좌표의 상자 목록 */
export function dbPostprocess(prob: Float32Array, predW: number, predH: number, srcW: number, srcH: number, opts: DetOptions = DET_DEFAULTS): DetBox[] {
  // 이진화 + 2×2 팽창 (각 화소 = 자신·왼쪽·위·왼쪽 위 중 하나라도 켜짐)
  const bin = new Uint8Array(predW * predH);
  for (let i = 0; i < bin.length; i += 1) bin[i] = (prob[i] as number) > opts.thresh ? 1 : 0;
  const mask = new Uint8Array(predW * predH);
  for (let y = 0; y < predH; y += 1) {
    for (let x = 0; x < predW; x += 1) {
      const at = (xx: number, yy: number) => (xx >= 0 && yy >= 0 ? (bin[yy * predW + xx] as number) : 0);
      mask[y * predW + x] = at(x, y) | at(x - 1, y) | at(x, y - 1) | at(x - 1, y - 1);
    }
  }
  // 8-연결 요소 → 행마다 양 끝 점 (볼록 껍질은 이것만으로 같다)
  const label = new Int32Array(predW * predH);
  const out: DetBox[] = [];
  let components = 0;
  const stack: number[] = [];
  for (let start = 0; start < mask.length && components < opts.maxCandidates; start += 1) {
    if (!mask[start] || label[start]) continue;
    components += 1;
    label[start] = components;
    stack.push(start);
    const rowMin = new Map<number, number>();
    const rowMax = new Map<number, number>();
    while (stack.length > 0) {
      const idx = stack.pop() as number;
      const x = idx % predW;
      const y = (idx - x) / predW;
      if (!rowMin.has(y) || x < (rowMin.get(y) as number)) rowMin.set(y, x);
      if (!rowMax.has(y) || x > (rowMax.get(y) as number)) rowMax.set(y, x);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= predW || ny >= predH) continue;
          const n = ny * predW + nx;
          if (mask[n] && !label[n]) {
            label[n] = components;
            stack.push(n);
          }
        }
      }
    }
    const pts: Point[] = [];
    for (const [y, x0] of rowMin) {
      pts.push([x0, y]);
      const x1 = rowMax.get(y) as number;
      if (x1 !== x0) pts.push([x1, y]);
    }
    const first = miniBox(pts);
    if (first.sside < 3) continue;
    const score = boxScore(prob, predW, predH, first.box);
    if (opts.boxThresh > score) continue;
    const second = miniBox(unclipRect(first.box, opts.unclipRatio));
    if (second.sside < 5) continue;
    const scaled = second.box.map(
      (p) => [Math.min(Math.max(Math.round((p[0] / predW) * srcW), 0), srcW), Math.min(Math.max(Math.round((p[1] / predH) * srcH), 0), srcH)] as Point,
    ) as Quad;
    // order_points_clockwise + clip_det_res + 너무 작은 상자 제거
    const byX = [...scaled].sort((a, b) => a[0] - b[0]);
    const left = byX.slice(0, 2).sort((a, b) => a[1] - b[1]);
    const right = byX.slice(2).sort((a, b) => a[1] - b[1]);
    const ordered = [left[0], right[0], right[1], left[1]].map(
      (p) => [Math.trunc(Math.min(Math.max((p as Point)[0], 0), srcW - 1)), Math.trunc(Math.min(Math.max((p as Point)[1], 0), srcH - 1))] as Point,
    ) as Quad;
    const rw = Math.trunc(Math.hypot(ordered[0][0] - ordered[1][0], ordered[0][1] - ordered[1][1]));
    const rh = Math.trunc(Math.hypot(ordered[0][0] - ordered[3][0], ordered[0][1] - ordered[3][1]));
    if (rw <= 3 || rh <= 3) continue;
    out.push({ box: ordered, score });
  }
  return sortBoxes(out);
}

/** 위→아래(같은 줄 판정: 인접 y 차이 10 미만)·왼→오른 정렬 (RapidOCR sorted_boxes) */
export function sortBoxes<T extends { box: Quad }>(boxes: readonly T[]): T[] {
  const byY = [...boxes].map((b, i) => ({ b, i })).sort((a, b) => a.b.box[0][1] - b.b.box[0][1] || a.i - b.i);
  let line = 0;
  const withLine = byY.map((e, k) => {
    if (k > 0 && e.b.box[0][1] - (byY[k - 1] as { b: T }).b.box[0][1] >= 10) line += 1;
    return { ...e, line };
  });
  return withLine.sort((a, b) => a.line - b.line || a.b.box[0][0] - b.b.box[0][0] || a.i - b.i).map((e) => e.b);
}

// ---------- 줄 잘라내기 ----------

/** 네 점 → 사각형 원근 변환 행렬(dst→src, 3×3) */
function perspective(src: Quad, w: number, h: number): number[] {
  const dst: Quad = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  // dst 좌표 → src 좌표로 가는 행렬을 푼다 (8 미지수)
  const a: number[][] = [];
  const bvec: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = dst[i] as Point;
    const [u, v] = src[i] as Point;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    bvec.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    bvec.push(v);
  }
  // 가우스 소거
  const n = 8;
  for (let c = 0; c < n; c += 1) {
    let piv = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs((a[r] as number[])[c] as number) > Math.abs((a[piv] as number[])[c] as number)) piv = r;
    [a[c], a[piv]] = [a[piv] as number[], a[c] as number[]];
    [bvec[c], bvec[piv]] = [bvec[piv] as number, bvec[c] as number];
    const div = (a[c] as number[])[c] as number;
    if (Math.abs(div) < 1e-12) return [1, 0, src[0][0], 0, 1, src[0][1], 0, 0, 1];
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = ((a[r] as number[])[c] as number) / div;
      for (let k = c; k < n; k += 1) (a[r] as number[])[k] = ((a[r] as number[])[k] as number) - f * ((a[c] as number[])[k] as number);
      bvec[r] = (bvec[r] as number) - f * (bvec[c] as number);
    }
  }
  const sol = bvec.map((v, i) => v / ((a[i] as number[])[i] as number));
  return [...sol, 1];
}

/** 쌍삼차 가중치 (OpenCV INTER_CUBIC, A = −0.75) */
function cubicWeights(t: number): [number, number, number, number] {
  const A = -0.75;
  const w0 = ((A * (t + 1) - 5 * A) * (t + 1) + 8 * A) * (t + 1) - 4 * A;
  const w1 = ((A + 2) * t - (A + 3)) * t * t + 1;
  const w2 = ((A + 2) * (1 - t) - (A + 3)) * (1 - t) * (1 - t) + 1;
  return [w0, w1, w2, 1 - w0 - w1 - w2];
}

/** 상자 영역을 펴서 잘라낸다 (OpenCV warpPerspective: 쌍삼차, 좌표 1/32 화소 양자화, 경계는 가장자리 화소 반복).
 *  세로가 가로의 1.5배 이상이면 반시계 90도 회전 */
export function cropQuad(img: Image3, quad: Quad): Image3 {
  const w = Math.trunc(Math.max(Math.hypot(quad[0][0] - quad[1][0], quad[0][1] - quad[1][1]), Math.hypot(quad[2][0] - quad[3][0], quad[2][1] - quad[3][1])));
  const h = Math.trunc(Math.max(Math.hypot(quad[0][0] - quad[3][0], quad[0][1] - quad[3][1]), Math.hypot(quad[1][0] - quad[2][0], quad[1][1] - quad[2][1])));
  const cw = Math.max(1, w);
  const ch = Math.max(1, h);
  const m = perspective(quad, cw, ch);
  const out = new Uint8Array(cw * ch * 3);
  const px = (x: number, y: number, c: number) =>
    img.data[(Math.min(Math.max(y, 0), img.height - 1) * img.width + Math.min(Math.max(x, 0), img.width - 1)) * 3 + c] as number;
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const den = (m[6] as number) * x + (m[7] as number) * y + 1;
      const qx = Math.round((((m[0] as number) * x + (m[1] as number) * y + (m[2] as number)) / den) * 32);
      const qy = Math.round((((m[3] as number) * x + (m[4] as number) * y + (m[5] as number)) / den) * 32);
      const x0 = Math.floor(qx / 32);
      const y0 = Math.floor(qy / 32);
      const wx = cubicWeights((qx - x0 * 32) / 32);
      const wy = cubicWeights((qy - y0 * 32) / 32);
      for (let c = 0; c < 3; c += 1) {
        let v = 0;
        for (let j = 0; j < 4; j += 1) {
          let row = 0;
          for (let i = 0; i < 4; i += 1) row += wx[i]! * px(x0 - 1 + i, y0 - 1 + j, c);
          v += wy[j]! * row;
        }
        out[(y * cw + x) * 3 + c] = Math.min(255, Math.max(0, Math.round(v)));
      }
    }
  }
  const crop: Image3 = { width: cw, height: ch, data: out };
  return ch / cw >= 1.5 ? rotate90ccw(crop) : crop;
}

/** 반시계 90도 회전 (np.rot90) */
export function rotate90ccw(img: Image3): Image3 {
  const w = img.height;
  const h = img.width;
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = img.width - 1 - y;
      const sy = x;
      for (let c = 0; c < 3; c += 1) out[(y * w + x) * 3 + c] = img.data[(sy * img.width + sx) * 3 + c] as number;
    }
  }
  return { width: w, height: h, data: out };
}

// ---------- 인식 ----------

/** 인식 입력 한 장: 높이 48, 너비 ceil(48 × 비율)(최대 batchWidth), 나머지는 0 채움 */
export function recTensor(crop: Image3, batchWidth: number): Float32Array {
  const ratio = crop.width / crop.height;
  const resizedW = Math.min(batchWidth, Math.ceil(REC_HEIGHT * ratio));
  const resized = resizeBilinear(crop, Math.max(1, resizedW), REC_HEIGHT);
  return normalizeChw(resized, batchWidth);
}

/** CTC 디코드: 시간 축마다 최댓값 → 연속 중복·blank(0) 제거, 점수는 남은 글자 확률의 평균(없으면 0) */
export function ctcDecode(probs: Float32Array, steps: number, classes: number, labels: readonly string[]): { text: string; score: number } {
  let text = "";
  const confs: number[] = [];
  let prev = -1;
  for (let t = 0; t < steps; t += 1) {
    let best = 0;
    let bestP = -Infinity;
    for (let c = 0; c < classes; c += 1) {
      const p = probs[t * classes + c] as number;
      if (p > bestP) {
        bestP = p;
        best = c;
      }
    }
    if (best !== 0 && best !== prev) {
      text += labels[best] ?? "";
      confs.push(Math.round(bestP * 1e5) / 1e5);
    }
    prev = best;
  }
  const score = confs.length === 0 ? 0 : confs.reduce((s, v) => s + v, 0) / confs.length;
  return { text, score: Math.round(score * 1e5) / 1e5 };
}

/** 인식 사전(한 줄에 한 글자) → CTC 라벨: 0 = blank, 끝에 공백 추가 */
export function ctcLabels(dictText: string): string[] {
  return ["blank", ...dictText.split("\n"), " "];
}

// ---------- 전체 흐름 ----------

export interface OcrModels {
  /** 검출: 입력 [1,3,h,w] → 확률 지도 [1,1,h,w] */
  det(input: Float32Array, width: number, height: number): Promise<Float32Array>;
  /** 인식: 입력 [n,3,48,w] → [n, steps, classes] */
  rec(input: Float32Array, count: number, width: number): Promise<{ data: Float32Array; steps: number; classes: number }>;
}

export interface OcrLine {
  text: string;
  score: number;
  box: Quad;
}

/** 이미지(BGR, 긴 변 1280 이하) → 줄 목록 (위→아래, 점수 0.5 미만 제외) */
export async function runOcr(img: Image3, models: OcrModels, labels: readonly string[], opts: DetOptions = DET_DEFAULTS): Promise<OcrLine[]> {
  const size = detInputSize(img.width, img.height, opts.limitSideLen);
  const detIn = normalizeChw(resizeBilinear(img, size.width, size.height));
  const prob = await models.det(detIn, size.width, size.height);
  const boxes = dbPostprocess(prob, size.width, size.height, img.width, img.height, opts);
  const crops = boxes.map((b) => cropQuad(img, b.box));
  const order = crops.map((c, i) => ({ i, r: c.width / c.height })).sort((a, b) => a.r - b.r || a.i - b.i);
  const results: { text: string; score: number }[] = new Array(crops.length);
  for (let start = 0; start < order.length; start += REC_BATCH) {
    const group = order.slice(start, start + REC_BATCH);
    const maxRatio = Math.max(REC_BASE_WIDTH / REC_HEIGHT, ...group.map((g) => g.r));
    const batchWidth = Math.trunc(REC_HEIGHT * maxRatio);
    const tensors = group.map((g) => recTensor(crops[g.i] as Image3, batchWidth));
    const input = new Float32Array(tensors.length * tensors[0]!.length);
    tensors.forEach((t, k) => input.set(t, k * t.length));
    const out = await models.rec(input, group.length, batchWidth);
    const per = out.steps * out.classes;
    group.forEach((g, k) => {
      results[g.i] = ctcDecode(out.data.subarray(k * per, (k + 1) * per), out.steps, out.classes, labels);
    });
  }
  return boxes
    .map((b, i) => ({ text: (results[i] as { text: string }).text, score: (results[i] as { score: number }).score, box: b.box }))
    .filter((l) => l.text.length > 0 && l.score >= TEXT_SCORE);
}
