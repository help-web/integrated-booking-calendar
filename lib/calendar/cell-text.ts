// Univer 행사 셀의 줄바꿈을 보존하며 읽고 쓰는 유틸입니다.

import type { ICellData, IDocumentData } from "@univerjs/core";
import type { FUniver } from "@univerjs/core/facade";
import type { FRange } from "@univerjs/sheets/facade";

function normalizeNewlines(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u000b/g, "\n")
    .replace(/\n+$/, "");
}

function pickLongestText(candidates: Array<string | null | undefined>): string {
  let best = "";
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const normalized = normalizeNewlines(candidate);
    if (normalized.length > best.length) {
      best = normalized;
    }
  }
  return best;
}

/** Facade Range에서 줄바꿈을 유지한 텍스트를 읽습니다. */
export function readEventCellText(range: FRange): string {
  const cellData = range.getCellData();
  const stream = cellData?.p?.body?.dataStream;

  const raw = range.getValue();
  const rich = range.getValue(true);
  let richStream: string | null = null;
  if (rich && typeof rich === "object") {
    const doc = (rich as { getData?: () => IDocumentData }).getData?.();
    if (typeof doc?.body?.dataStream === "string") {
      richStream = doc.body.dataStream;
    }
  }

  return pickLongestText([
    typeof stream === "string" ? stream : null,
    richStream,
    typeof cellData?.v === "string" ? cellData.v : null,
    typeof raw === "string" ? raw : null,
    raw == null ? null : String(raw),
  ]);
}

/** Facade API로 행사 셀에 여러 줄 텍스트를 씁니다. (`\r\n` 줄바꿈) */
export function writeEventCellText(univerAPI: FUniver, range: FRange, text: string) {
  const normalized = text.replace(/\r\n/g, "\n");
  const dataStream = normalized.length > 0 ? `${normalized.split("\n").join("\r\n")}\r\n` : "\r\n";
  const richText = univerAPI.newRichText({ body: { dataStream } } as IDocumentData);
  range.setRichTextValueForCell(richText as never);
  range.setWrap(true);
}
