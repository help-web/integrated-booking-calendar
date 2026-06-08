// 행사 셀 텍스트를 파싱해 같은 날짜 블록의 빈/마감 회의실 행을 Facade API로 갱신합니다.

import type { FUniver } from "@univerjs/core/facade";
import type { FWorksheet } from "@univerjs/sheets/facade";
import type { ContractStatus } from "./contract-status";
import { backgroundColorForStatus } from "./contract-status";
import { readCellContractStatuses } from "./cell-contract-status";
import { readEventCellText } from "./cell-text";
import type { ParseIssue } from "./event-text-parser";
import { resolveEventCellBackgroundStatus } from "./event-text-parser";
import {
  BLOCK_ROW_EVENTS,
  CALENDAR_BLOCK_ROW_COUNT,
  getDayBlockRowsFromEventRow,
} from "./grid";
import {
  buildOrderedAvailableRooms,
  CLOSED_ROOM_COLOR,
  computeDayRoomsFromEventText,
  formatClosedRoomText,
} from "./room-placement";
import { runWithCalendarSyncSuppress } from "./sync-guard";

const ROOM_ROW_FONT_SIZE = 7;
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
  explicitStatus?: ContractStatus,
): SyncDayRoomsResult {
  return runWithCalendarSyncSuppress(() => {
    const { availableRow, closedRow, eventRow: resolvedEventRow } =
      getDayBlockRowsFromEventRow(eventRow);

    const eventRange = fWorksheet.getRange(resolvedEventRow, col);
    const eventText = readEventCellText(eventRange);
    const contractStatuses = readCellContractStatuses(eventRange);
    const snapshot = computeDayRoomsFromEventText(eventText, contractStatuses);

    const backgroundStatus = resolveEventCellBackgroundStatus(
      eventText,
      explicitStatus,
      contractStatuses,
    );
    eventRange.setBackgroundColor(backgroundColorForStatus(backgroundStatus));

    const availableRange = fWorksheet.getRange(availableRow, col);
    const closedRange = fWorksheet.getRange(closedRow, col);
    const orderedAvailable = buildOrderedAvailableRooms(snapshot);

    if (orderedAvailable.length === 0) {
      availableRange.setValueForCell("");
    } else {
      const richText = buildAvailableRichText(univerAPI, orderedAvailable);
      if (richText) {
        availableRange.setRichTextValueForCell(richText as never);
      } else {
        availableRange.setValueForCell("");
      }
    }

    availableRange.setFontSize(ROOM_ROW_FONT_SIZE);
    availableRange.setWrap(false);

    const closedText = formatClosedRoomText(snapshot.closedRed);
    closedRange.setValueForCell(closedText);
    closedRange.setFontColor(CLOSED_ROOM_COLOR);
    closedRange.setFontSize(ROOM_ROW_FONT_SIZE);
    closedRange.setWrap(false);
    closedRange.setBackgroundColor(CLOSED_ROW_BACKGROUND);

    return {
      issues: snapshot.issues,
      paidServices: snapshot.paidServices,
    };
  });
}

function buildAvailableRichText(
  univerAPI: FUniver,
  orderedRooms: ReadonlyArray<{ room: string; color: string }>,
) {
  type RichTextChain = {
    insertText: (text: string) => RichTextChain;
    setStyle: (start: number, end: number, style: object) => RichTextChain;
  };

  const segments: Array<{ text: string; color: string }> = [];

  for (const item of orderedRooms) {
    if (segments.length > 0) segments.push({ text: ", ", color: item.color });
    segments.push({ text: item.room, color: item.color });
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
