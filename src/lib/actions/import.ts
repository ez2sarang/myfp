"use server";

// 사진 인식 등록 서버 액션. assertSameOrigin → requireActiveUser 순서로 시작하고, 소유자는 세션의 viewer.id 뿐이다.
// 입력은 확인 화면이 만든 JSON 문자열 하나뿐이다(사진·인식 원문·상자 좌표·FormData 없음). 전부 저장하거나 아무것도 저장하지 않는다.
import { revalidatePath } from "next/cache";
import { db, withTransaction } from "@/lib/db/pool";
import { seoulToday } from "@/lib/finance/dates";
import { assertSameOrigin } from "@/lib/http/assert-same-origin";
import { ImportLimitError, LIMIT_MESSAGES, parseImportPayload, possibleDuplicates, saveImport, type ImportCounts, type RowError } from "@/lib/import/register";
import { requireActiveUser } from "@/lib/session";

export type ImportActionResult =
  | { ok: true; message: string; counts: ImportCounts }
  | { ok: false; message: string; rowErrors?: RowError[]; possibleDuplicate?: number[] };

const FAILED = { ok: false as const, message: "등록하지 못했습니다. 잠시 뒤 다시 시도해 주세요. (아무것도 저장되지 않았습니다)" };

export async function registerImportAction(payload: string): Promise<ImportActionResult> {
  await assertSameOrigin();
  const viewer = await requireActiveUser("/app/import/photo");
  const parsed = parseImportPayload(payload, seoulToday());
  if (!parsed.ok) return { ok: false, message: parsed.message, rowErrors: parsed.rowErrors };
  const plan = parsed.value;
  let counts: ImportCounts;
  try {
    if (!plan.confirmDuplicates) {
      const duplicates = await possibleDuplicates(db, viewer.id, plan.items);
      if (duplicates.length > 0) {
        return { ok: false, message: "이미 같은 이름·금액의 항목이 있습니다. 확인한 뒤 그래도 등록하거나 해당 항목을 빼 주세요.", possibleDuplicate: duplicates };
      }
    }
    counts = await withTransaction((tx) => saveImport(tx, viewer.id, plan.items));
  } catch (error) {
    if (error instanceof ImportLimitError) {
      return { ok: false, message: `${LIMIT_MESSAGES[error.target]} (아무것도 저장되지 않았습니다)`, rowErrors: [{ index: error.index, message: LIMIT_MESSAGES[error.target] }] };
    }
    console.error("[import]", error instanceof Error ? error.name : "Error");
    return FAILED;
  }
  revalidatePath("/app", "layout");
  const total = counts.fixed + counts.planned + counts.asset + counts.liability;
  return { ok: true, message: `${total}건을 등록했습니다.`, counts };
}
