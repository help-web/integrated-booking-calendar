// 행사 셀 텍스트를 파싱해 같은 날짜 블록의 빈/마감 회의실 행을 Facade API로 갱신합니다.

import type { FUniver } from "@univerjs/core/facade";
import type { FWorksheet } from "@univerjs/sheets/facade";
import type { ParseIssue } from "./event-text-parser";
import { getCellPlainText } from "./event-text-parser";
import {
  BLOCK_ROW_EVENTS,
  CALENDAR_BLOCK_ROW_COUNT,
  columnIndexToLetter,
  getDayBlockRowsFromEventRow,
} from "./grid";
import {
  AVAILABLE_ROOM_COLOR,
  CLOSED_ROOM_COLOR,
  computeDayRoomsFromEventText,
  formatClosedRoomText,
  PENDING_ROOM_COLOR,
} from "./room-placement";

const AVAILABLE_ROOM_FONT_SIZE = 7;
const CLOSED_ROW_BACKGROUND = "#E2E2D3";

export type SyncDayRoomsResult = {
  issues: ParseIssue[];
  paidServices: string[];
};

export function syncDayRoomsFromEventCell(
  univerAPI: FUniver,
  fWorksheet: FWorksheet,
  eventRow: number,
  col: number,
): SyncDayRoomsResult {
  const { availableRow, closedRow } = getDayBlockRowsFromEventRow(eventRow);
  const colLetter = columnIndexToLetter(col);
  const eventA1 = `${colLetter}${eventRow + 1}`;
  const availableA1 = `${colLetter}${availableRow + 1}`;
  const closedA1 = `${colLetter}${closedRow + 1}`;

  const eventValue = fWorksheet.getRange(eventA1).getValue(true);
  const eventText = getCellPlainText(eventValue);
  const snapshot = computeDayRoomsFromEventText(eventText);

  const availableRange = fWorksheet.getRange(availableA1);
  const closedRange = fWorksheet.getRange(closedA1);

  if (snapshot.availableBlue.length === 0 && snapshot.availableGreen.length === 0) {
    availableRange.setValueForCell("");
  } else {
    const richText = buildAvailableRichText(univerAPI, snapshot.availableBlue, snapshot.availableGreen);
    if (richText) {
      availableRange.setRichTextValueForCell(richText as never);
    } else {
      availableRange.setValueForCell("");
    }
  }

  availableRange.setFontSize(AVAILABLE_ROOM_FONT_SIZE);
  availableRange.setWrap(false);

  const closedText = formatClosedRoomText(snapshot.closedRed);
  closedRange.setValueForCell(closedText);
  closedRange.setFontColor(CLOSED_ROOM_COLOR);
  closedRange.setBackgroundColor(CLOSED_ROW_BACKGROUND);

  return {
    issues: snapshot.issues,
    paidServices: snapshot.paidServices,
  };
}

function buildAvailableRichText(
  univerAPI: FUniver,
  blueRooms: readonly string[],
  greenRooms: readonly string[],
) {
  type RichTextChain = {
    insertText: (text: string) => RichTextChain;
    setStyle: (start: number, end: number, style: object) => RichTextChain;
  };

  const segments: Array<{ text: string; color: string }> = [];

  for (const room of blueRooms) {
    if (segments.length > 0) segments.push({ text: ", ", color: AVAILABLE_ROOM_COLOR });
    segments.push({ text: room, color: AVAILABLE_ROOM_COLOR });
  }
  for (const room of greenRooms) {
    if (segments.length > 0) segments.push({ text: ", ", color: PENDING_ROOM_COLOR });
    segments.push({ text: room, color: PENDING_ROOM_COLOR });
  }

  if (segments.length === 0) return null;

  let offset = 0;
  let chain = univerAPI.newRichText().insertText(segments[0].text) as RichTextChain;
  chain.setStyle(0, segments[0].text.length, univerAPI.newTextStyle({ cl: { rgb: segments[0].color } }));

  offset = segments[0].text.length;
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const start = offset;
    const end = offset + seg.text.length;
    chain = chain.insertText(seg.text);
    chain.setStyle(start, end, univerAPI.newTextStyle({ cl: { rgb: seg.color } }));
    offset = end;
  }

  return chain;
}

export function syncAllEventRowsInSheet(
  univerAPI: FUniver,
  fWorksheet: FWorksheet,
  rowCount: number,
  columnCount: number,
): ParseIssue[] {
  const allIssues: ParseIssue[] = [];

  for (let row = BLOCK_ROW_EVENTS; row < rowCount; row += CALENDAR_BLOCK_ROW_COUNT) {
    for (let col = 0; col < columnCount; col++) {
      const result = syncDayRoomsFromEventCell(univerAPI, fWorksheet, row, col);
      allIssues.push(...result.issues);
    }
  }

  return allIssues;
}
