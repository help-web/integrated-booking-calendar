// 달력 시트의 날짜 블록 행 인덱스·행사 셀 여부를 판별합니다.

export const CALENDAR_WEEK_COUNT = 6;
export const CALENDAR_BLOCK_ROW_COUNT = 4;
export const BLOCK_ROW_DATE = 0;
export const BLOCK_ROW_AVAILABLE = 1;
export const BLOCK_ROW_CLOSED = 2;
export const BLOCK_ROW_EVENTS = 3;

export function isEventRow(row: number): boolean {
  return row % CALENDAR_BLOCK_ROW_COUNT === BLOCK_ROW_EVENTS;
}

export function getDayBlockRowsFromEventRow(eventRow: number) {
  const blockTop = eventRow - BLOCK_ROW_EVENTS;
  return {
    dateRow: blockTop + BLOCK_ROW_DATE,
    availableRow: blockTop + BLOCK_ROW_AVAILABLE,
    closedRow: blockTop + BLOCK_ROW_CLOSED,
    eventRow: blockTop + BLOCK_ROW_EVENTS,
  };
}

export function columnIndexToLetter(index: number) {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}
