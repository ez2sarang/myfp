"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Field } from "@/components/shared/field";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { registerImportAction } from "@/lib/actions/import";
import { buildCandidates } from "@/lib/import/classify";
import { detectLayout } from "@/lib/import/parse";
import {
  CONFIDENCE_LABELS,
  REASON_LABELS,
  canBulkSelect,
  categoriesFor,
  categoryLabel,
  defaultCategory,
  defaultRow,
  highlights,
  photoNotices,
  toPayload,
  type RowState,
  type RowTarget,
} from "@/lib/import/rows";
import type { CaptureContext, ImportCandidate, Layout, OcrLineInput, Point } from "@/lib/import/types";
import { prepareBitmap } from "@/lib/ocr/prepare-image";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 10;
const MAX_BYTES = 20 * 1024 * 1024;

const LAYOUT_LABELS: Record<Layout, string> = { card: "카드 목록", receipt: "영수증", bill: "고지서", handwriting: "손글씨" };
const TARGET_LABELS: Record<RowTarget, string> = { fixed: "고정지출", planned: "예정·일회성", asset: "자산", liability: "부채", skip: "제외" };
const DATE_LABELS: Record<RowTarget, string> = { fixed: "날짜(납부일)", planned: "예정일", asset: "기준일", liability: "기준일", skip: "날짜" };
const STATUS_LABELS = { queued: "대기", preparing: "사진 준비", loading: "모델 확인", recognizing: "글자 읽는 중", done: "완료", error: "실패", cancelled: "취소됨" } as const;

type PhotoStatus = keyof typeof STATUS_LABELS;
interface Photo {
  id: number;
  label: string;
  source: "screenshot" | "photo";
  layout: Layout | "auto";
  status: PhotoStatus;
  error?: string;
  width: number;
  height: number;
  lines: OcrLineInput[];
}
type Reply =
  | { type: "progress"; id: number; stage: "loading" | "recognizing" }
  | { type: "result"; id: number; lines: OcrLineInput[]; width: number; height: number }
  | { type: "error"; id: number; message: string };
type Outcome =
  | { kind: "idle" }
  | { kind: "error"; message: string; rowErrors: Record<string, string>; duplicates: string[] }
  | { kind: "done"; message: string; counts: { fixed: number; planned: number; asset: number; liability: number } };

// 사진 → 항목 인식 → 확인·수정 → 등록. 사진·인식 결과는 이 화면의 메모리에만 있고(저장소·IndexedDB 없음) 페이지를 떠나면 사라진다.
// 고른 File 은 fetch·FormData 로 보내지 않는다. 서버로 가는 것은 사용자가 고른 행의 JSON(이름·금액·분류·날짜)뿐이다.
export function PhotoImport({ today, sharedWithGroup }: { today: string; sharedWithGroup: boolean }) {
  const workerRef = useRef<Worker | null>(null);
  const filesRef = useRef(new Map<number, File>());
  const canvasesRef = useRef(new Map<number, OffscreenCanvas>());
  const runningRef = useRef<number | null>(null);
  const nextId = useRef(1);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [edits, setEdits] = useState<Record<string, RowState>>({});
  const [isPrivate, setPrivate] = useState(false);
  const [notice, setNotice] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );

  const update = (id: number, patch: Partial<Photo>) => setPhotos((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  function worker(): Worker {
    if (workerRef.current) return workerRef.current;
    const created = new Worker(new URL("../../lib/ocr/ocr.worker.ts", import.meta.url), { type: "module" });
    created.onmessage = (e: MessageEvent<Reply>) => {
      const reply = e.data;
      if (reply.id !== runningRef.current) return; // 취소한 사진의 늦은 응답은 버린다
      if (reply.type === "progress") return update(reply.id, { status: reply.stage });
      runningRef.current = null;
      if (reply.type === "result") update(reply.id, { status: "done", lines: reply.lines, width: reply.width, height: reply.height });
      else update(reply.id, { status: "error", error: reply.message });
    };
    created.onerror = () => {
      if (runningRef.current !== null) update(runningRef.current, { status: "error", error: "인식 모듈을 시작하지 못했습니다." });
      runningRef.current = null;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
    workerRef.current = created;
    return created;
  }

  // 한 번에 한 장씩: 대기 중인 첫 사진을 준비해 워커로 보낸다
  useEffect(() => {
    if (runningRef.current !== null) return;
    const next = photos.find((p) => p.status === "queued");
    if (!next) return;
    const file = filesRef.current.get(next.id);
    filesRef.current.delete(next.id);
    if (!file) return update(next.id, { status: "error", error: "사진을 읽지 못했습니다." });
    runningRef.current = next.id;
    update(next.id, { status: "preparing" });
    prepareBitmap(file)
      .then((bitmap) => {
        if (runningRef.current !== next.id) return bitmap.close();
        // 금액 조각 미리보기용 사본(메모리 안 캔버스, 저장·전송 없음)
        const keep = new OffscreenCanvas(bitmap.width, bitmap.height);
        keep.getContext("2d")?.drawImage(bitmap, 0, 0);
        canvasesRef.current.set(next.id, keep);
        worker().postMessage({ type: "run", id: next.id, bitmap }, [bitmap]);
      })
      .catch(() => {
        if (runningRef.current === next.id) runningRef.current = null;
        update(next.id, { status: "error", error: "사진을 읽지 못했습니다. 다른 사진을 골라 주세요." });
      });
  }, [photos]);

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    const room = MAX_PHOTOS - photos.filter((p) => p.status !== "cancelled").length;
    const accepted = picked.filter((f) => f.type.startsWith("image/") && f.size <= MAX_BYTES).slice(0, Math.max(0, room));
    const skipped = picked.length - accepted.length;
    setNotice(skipped > 0 ? `${skipped}장은 넣지 않았습니다 (최대 ${MAX_PHOTOS}장, 장당 20MB 이하 이미지만).` : "");
    const added = accepted.map((file) => {
      const id = nextId.current++;
      filesRef.current.set(id, file);
      return { id, label: `사진 ${id}`, source: file.type === "image/png" ? "screenshot" : "photo", layout: "auto", status: "queued", width: 0, height: 0, lines: [] } satisfies Photo;
    });
    setOutcome({ kind: "idle" });
    setPhotos((list) => [...list, ...added]);
  }

  function cancel(id: number) {
    filesRef.current.delete(id);
    canvasesRef.current.delete(id);
    if (runningRef.current === id) {
      runningRef.current = null;
      workerRef.current?.terminate(); // 진행 중인 인식을 바로 멈춘다(다음 사진에서 워커를 다시 만든다)
      workerRef.current = null;
    }
    update(id, { status: "cancelled", lines: [] });
    dropEdits(id);
  }

  const dropEdits = (photoId: number) => setEdits((all) => Object.fromEntries(Object.entries(all).filter(([k]) => !k.startsWith(`${photoId}:`))));

  // 인식이 끝난 사진들 → 후보 (카드 목록은 앞 사진의 마지막 날짜를 이어받는다)
  const done = useMemo(() => photos.filter((p) => p.status === "done"), [photos]);
  const candidates = useMemo(() => {
    const ctxOf = (p: Photo, inheritedDate: string | null): CaptureContext => ({
      width: p.width,
      height: p.height,
      source: p.source,
      today,
      layout: p.layout === "auto" ? undefined : p.layout,
      inheritedDate,
    });
    const first = buildCandidates(done.map((p) => ({ lines: p.lines, ctx: ctxOf(p, null) })));
    const lastDate = done.map((_, i) => first.filter((c) => c.capture === i && c.date).at(-1)?.date ?? null);
    return buildCandidates(done.map((p, i) => ({ lines: p.lines, ctx: ctxOf(p, i > 0 ? lastDate[i - 1]! : null) })));
  }, [done, today]);

  const keyOf = (c: ImportCandidate) => `${done[c.capture]!.id}:${c.index - candidates.findIndex((x) => x.capture === c.capture)}`;
  const rows = candidates.map((c) => edits[keyOf(c)] ?? defaultRow(c, keyOf(c)));
  const setRow = (key: string, patch: Partial<RowState>) =>
    setEdits((all) => {
      const base = all[key] ?? rows.find((r) => r.key === key);
      return base ? { ...all, [key]: { ...base, ...patch } } : all;
    });

  function bulkSelect(on: boolean) {
    setEdits((all) => {
      const next = { ...all };
      candidates.forEach((c, i) => {
        const row = rows[i]!;
        if (!on || canBulkSelect(c, row)) next[row.key] = { ...row, selected: on };
      });
      return next;
    });
  }

  function submit(confirmDuplicates: boolean) {
    const out = toPayload(rows, { private: isPrivate, confirmDuplicates });
    if (!out.ok) {
      setOutcome({ kind: "error", message: out.message, rowErrors: out.key ? { [out.key]: out.message } : {}, duplicates: [] });
      return;
    }
    startTransition(async () => {
      const res = await registerImportAction(out.payload).catch(() => null);
      if (!res) return setOutcome({ kind: "error", message: "등록하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", rowErrors: {}, duplicates: [] });
      if (res.ok) {
        setOutcome({ kind: "done", message: res.message, counts: res.counts });
        filesRef.current.clear();
        canvasesRef.current.clear();
        setPhotos([]);
        setEdits({});
        return;
      }
      setOutcome({
        kind: "error",
        message: res.message,
        rowErrors: Object.fromEntries((res.rowErrors ?? []).map((e) => [out.keys[e.index] ?? "", e.message])),
        duplicates: (res.possibleDuplicate ?? []).map((i) => out.keys[i] ?? ""),
      });
    });
  }

  const busy = photos.some((p) => !["done", "error", "cancelled"].includes(p.status));
  const selectedCount = rows.filter((r) => r.selected && r.target !== "skip").length;
  const anyShared = rows.some((r) => r.selected && (r.target === "fixed" || r.target === "asset" || r.target === "liability"));

  return (
    <div className="flex flex-col gap-4">
      <Card className="shadow-raised">
        <CardHeader>
          <CardTitle>1. 사진 고르기</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <label className={cn(buttonClass("secondary", "md"), "w-fit cursor-pointer focus-within:ring-2 focus-within:ring-brand")}>
            사진 고르기 (최대 {MAX_PHOTOS}장)
            <input type="file" accept="image/*" multiple onChange={onPick} className="sr-only" />
          </label>
          {notice ? (
            <p role="alert" className="text-sm text-danger">
              {notice}
            </p>
          ) : null}
          {photos.length > 0 ? (
            <ul className="flex flex-col gap-2" aria-label="고른 사진">
              {photos.map((p) => {
                const detected = p.status === "done" ? detectLayout(p.lines, { width: p.width, height: p.height, source: p.source, today }) : null;
                const notices = detected ? photoNotices(p.layout === "auto" ? detected : p.layout, candidates.filter((c) => c.capture === done.indexOf(p))) : [];
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line px-3 py-2 text-sm">
                    {notices.map((n) => (
                      <p key={n} className="basis-full rounded-sm bg-warn-bg px-2 py-1 text-xs text-warn-ink">
                        {n}
                      </p>
                    ))}
                    <span className="font-semibold">{p.label}</span>
                    <span role="status" className={cn("text-muted", p.status === "error" && "text-danger")}>
                      {STATUS_LABELS[p.status]}
                      {p.error ? ` — ${p.error}` : ""}
                    </span>
                    {p.status === "done" ? (
                      <>
                        <Select aria-label={`${p.label} 종류`} value={p.layout} onChange={(e) => (dropEdits(p.id), update(p.id, { layout: e.currentTarget.value as Photo["layout"] }))}>
                          <option value="auto">자동 ({detected ? LAYOUT_LABELS[detected] : ""})</option>
                          {(Object.keys(LAYOUT_LABELS) as Layout[]).map((l) => (
                            <option key={l} value={l}>
                              {LAYOUT_LABELS[l]}
                            </option>
                          ))}
                        </Select>
                        <Select aria-label={`${p.label} 입력 방식`} value={p.source} onChange={(e) => (dropEdits(p.id), update(p.id, { source: e.currentTarget.value as Photo["source"] }))}>
                          <option value="screenshot">화면 캡처</option>
                          <option value="photo">카메라 사진</option>
                        </Select>
                      </>
                    ) : null}
                    {["queued", "preparing", "loading", "recognizing"].includes(p.status) ? (
                      <Button variant="ghost" size="sm" className="min-h-11" onClick={() => cancel(p.id)}>
                        취소
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">카드 앱 이용내역(스크린샷)·영수증·관리비 고지서 사진을 고르세요. 손글씨 메모는 줄 구분만 도와주니 항목 이름과 금액은 직접 고쳐 주세요. 처음 한 번 <span className="whitespace-nowrap">인식 모델(약 16MB)을</span> 내려받습니다.</p>
          )}
        </CardBody>
      </Card>

      {rows.length > 0 ? (
        <Card className="shadow-raised">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>2. 확인·수정 ({selectedCount}건 선택)</CardTitle>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="min-h-11" onClick={() => bulkSelect(true)}>
                확인 필요까지 모두 선택
              </Button>
              <Button variant="ghost" size="sm" className="min-h-11" onClick={() => bulkSelect(false)}>
                모두 해제
              </Button>
            </div>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            <p className="text-xs text-muted">
              노란 칸은 인식이 불확실한 값입니다. 신뢰도 「높음」만 미리 선택했고, 「낮음」(손글씨 포함)은 하나씩 확인해 직접 선택하세요.
            </p>
            <ol className="flex flex-col gap-3">
              {candidates.map((c, i) => (
                <CandidateRow
                  key={rows[i]!.key}
                  candidate={c}
                  row={rows[i]!}
                  duplicateOf={c.duplicateOf === null ? null : c.duplicateOf + 1}
                  canvas={canvasesRef.current.get(done[c.capture]!.id)}
                  error={outcome.kind === "error" ? outcome.rowErrors[rows[i]!.key] : undefined}
                  existing={outcome.kind === "error" && outcome.duplicates.includes(rows[i]!.key)}
                  onChange={(patch) => setRow(rows[i]!.key, patch)}
                  number={i + 1}
                />
              ))}
            </ol>
          </CardBody>
        </Card>
      ) : null}

      {rows.length > 0 || outcome.kind === "done" ? (
        <Card className="shadow-raised">
          <CardHeader>
            <CardTitle>3. 등록</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            {rows.length > 0 ? (
              <>
                <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.currentTarget.checked)} className="size-5" />
                  나만 보기 (고정지출·자산·부채를 함께 보기 그룹 합산에서 뺀다)
                </label>
                {sharedWithGroup && anyShared && !isPrivate ? <p className="-mt-2 text-xs text-muted">그룹에 보임 — 숨기려면 「나만 보기」를 체크하세요.</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button size="md" disabled={pending || busy || selectedCount === 0} onClick={() => submit(false)}>
                    {pending ? "등록하는 중…" : `선택한 ${selectedCount}건 등록`}
                  </Button>
                  {outcome.kind === "error" && outcome.duplicates.length > 0 ? (
                    <Button variant="secondary" size="md" disabled={pending} onClick={() => submit(true)}>
                      중복 확인했음 — 그래도 등록
                    </Button>
                  ) : null}
                </div>
              </>
            ) : null}
            <div role="status" aria-live="polite" className="text-sm">
              {outcome.kind === "error" ? <p className="font-medium text-danger">{outcome.message}</p> : null}
              {outcome.kind === "done" ? (
                <div className="flex flex-col gap-2">
                  <p className="font-semibold">{outcome.message}</p>
                  <p className="text-muted">
                    고정지출 {outcome.counts.fixed}건 · 예정지출 {outcome.counts.planned}건 · 자산 {outcome.counts.asset}건 · 부채 {outcome.counts.liability}건
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {outcome.counts.fixed > 0 ? <Link className={buttonClass("secondary", "sm", "min-h-11")} href="/app/fixed">고정지출 보기</Link> : null}
                    {outcome.counts.planned > 0 ? <Link className={buttonClass("secondary", "sm", "min-h-11")} href="/app?tab=planned">예정지출 보기</Link> : null}
                    {outcome.counts.asset + outcome.counts.liability > 0 ? <Link className={buttonClass("secondary", "sm", "min-h-11")} href="/app/assets">자산·부채 보기</Link> : null}
                  </div>
                </div>
              ) : null}
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function CandidateRow({
  candidate: c,
  row,
  number,
  duplicateOf,
  canvas,
  error,
  existing,
  onChange,
}: {
  candidate: ImportCandidate;
  row: RowState;
  number: number;
  duplicateOf: number | null;
  canvas: OffscreenCanvas | undefined;
  error: string | undefined;
  existing: boolean;
  onChange: (patch: Partial<RowState>) => void;
}) {
  const id = `import-${row.key.replace(":", "-")}`;
  const mark = highlights(c);
  const warn = "border-warn-ink/60 bg-warn-bg";
  const tone = c.confidence === "high" ? "positive" : c.confidence === "check" ? "warn" : "negative";
  return (
    <li className={cn("flex flex-col gap-3 rounded-md border border-line p-3", row.selected && row.target !== "skip" && "border-brand/50", error && "border-danger")}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-11 min-w-11 items-center gap-2 font-semibold">
          <input
            type="checkbox"
            checked={row.selected && row.target !== "skip"}
            disabled={row.target === "skip"}
            onChange={(e) => onChange({ selected: e.currentTarget.checked })}
            className="size-5"
          />
          {number}번 등록
        </label>
        <Badge tone={tone}>신뢰도 {CONFIDENCE_LABELS[c.confidence]}</Badge>
        {c.reasons.map((r) => (
          <Badge key={r} tone="warn">
            {REASON_LABELS[r]}
          </Badge>
        ))}
        {duplicateOf !== null ? <Badge tone="warn">{duplicateOf}번과 중복 의심</Badge> : null}
        {existing ? <Badge tone="warn">이미 등록된 항목과 이름·금액 같음</Badge> : null}
        {c.cancelled ? <Badge tone="negative">취소 거래</Badge> : null}
        {c.installment ? <Badge tone="info">할부{c.installment.current && c.installment.total ? ` ${c.installment.current}/${c.installment.total}회` : ""}</Badge> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-target`} label="등록 대상">
          <Select
            id={`${id}-target`}
            value={row.target}
            onChange={(e) => {
              const target = e.currentTarget.value as RowTarget;
              onChange({ target, category: defaultCategory(target), selected: target !== "skip" && row.selected });
            }}
          >
            {(Object.keys(TARGET_LABELS) as RowTarget[]).map((t) => (
              <option key={t} value={t}>
                {TARGET_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        {row.target !== "skip" ? (
          <Field id={`${id}-category`} label="분류">
            <Select id={`${id}-category`} value={row.category} onChange={(e) => onChange({ category: e.currentTarget.value })}>
              {categoriesFor(row.target).map((cat) => (
                <option key={cat} value={cat}>
                  {categoryLabel(row.target, cat)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field id={`${id}-name`} label="이름" hint={mark.name ? `인식: ${row.nameHint} (손글씨는 직접 입력해 주세요)` : undefined}>
          <Input id={`${id}-name`} value={row.name} placeholder={row.nameHint} maxLength={100} onChange={(e) => onChange({ name: e.currentTarget.value })} className={cn(mark.name && warn)} />
        </Field>
        <Field
          id={`${id}-date`}
          label={DATE_LABELS[row.target]}
          hint={row.target === "asset" || row.target === "liability" ? "기준일은 오늘(서울 기준)까지 고를 수 있습니다." : undefined}
        >
          <Input id={`${id}-date`} type="date" value={row.date} onChange={(e) => onChange({ date: e.currentTarget.value })} className={cn(mark.date && warn)} />
        </Field>
        <Field id={`${id}-amount`} label="금액(원)" error={error}>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={`${id}-amount`}
              inputMode="numeric"
              value={row.amount}
              onChange={(e) => onChange({ amount: e.currentTarget.value })}
              className={cn("max-w-48", mark.amount && warn)}
              aria-invalid={error ? true : undefined}
            />
            <AmountCrop canvas={canvas} box={c.box} />
          </div>
        </Field>
        {row.target === "planned" ? (
          <Field id={`${id}-count`} label="분할 횟수" hint="2 이상이면 같은 금액으로 매달 나눠 넣습니다.">
            <Input id={`${id}-count`} type="number" min={1} max={36} value={row.count} onChange={(e) => onChange({ count: e.currentTarget.value })} className="max-w-28" />
          </Field>
        ) : null}
      </div>
    </li>
  );
}

/** 사진의 금액 부분만 잘라 보여 준다(메모리 안 캔버스 → 화면 캔버스, 저장·전송 없음) */
function AmountCrop({ canvas, box }: { canvas: OffscreenCanvas | undefined; box: Point[] | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !canvas || !box || box.length === 0) return;
    const xs = box.map((p) => p[0]);
    const ys = box.map((p) => p[1]);
    const sx = Math.max(0, Math.floor(Math.min(...xs)) - 4);
    const sy = Math.max(0, Math.floor(Math.min(...ys)) - 4);
    const sw = Math.min(canvas.width, Math.ceil(Math.max(...xs)) + 4) - sx;
    const sh = Math.min(canvas.height, Math.ceil(Math.max(...ys)) + 4) - sy;
    if (sw <= 0 || sh <= 0) return;
    const scale = Math.min(40 / sh, 220 / sw, 2);
    el.width = Math.max(1, Math.round(sw * scale));
    el.height = Math.max(1, Math.round(sh * scale));
    el.getContext("2d")?.drawImage(canvas, sx, sy, sw, sh, 0, 0, el.width, el.height);
  }, [canvas, box]);
  if (!canvas || !box) return null;
  return <canvas ref={ref} role="img" aria-label="사진 속 금액 부분" className="max-h-10 max-w-[220px] rounded-sm border border-line bg-surface" />;
}
