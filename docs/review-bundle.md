# 코드 리뷰용 번들

===== lib/calendar/cell-contract-status.ts =====

// 행사 셀 custom 메타데이터에 계약 상태를 저장·조회합니다.

import type { CustomData } from "@univerjs/core";
import type { FRange } from "@univerjs/sheets/facade";
import type { ContractStatus } from "./contract-status";
import { formatContractStatus } from "./contract-status";

export const BOOKING_CELL_META_KEY = "bookingCalendar";

export type BookingCellCustomMeta = CustomData & {
  contractStatuses?: Record<string, ContractStatus>;
};

export function readCellContractStatuses(range: FRange): Record<number, ContractStatus> {
  const custom = range.getCustomMetaData() as BookingCellCustomMeta | null;
  const raw = custom?.contractStatuses;
  if (!raw) return {};

  const result: Record<number, ContractStatus> = {};
  for (const [key, value] of Object.entries(raw)) {
    const index = Number(key);
    if (Number.isInteger(index) && index >= 0 && value) {
      result[index] = value;
    }
  }
  return result;
}

export function writeCellContractStatus(
  range: FRange,
  blockIndex: number,
  status: ContractStatus,
): void {
  const currentCustom = (range.getCustomMetaData() ?? {}) as BookingCellCustomMeta;
  const statuses = { ...readCellContractStatuses(range), [blockIndex]: status };
  const serialized: Record<string, ContractStatus> = {};
  for (const [key, value] of Object.entries(statuses)) {
    serialized[String(key)] = value;
  }

  range.setCustomMetaData({
    ...currentCustom,
    [BOOKING_CELL_META_KEY]: true,
    contractStatuses: serialized,
  });
}

/** 셀에 저장된 계약 상태 중 첫 번째(또는 0번 블록)를 반환합니다. */
export function resolvePrimaryCellContractStatus(
  range: FRange,
  blockCount: number,
): ContractStatus | null {
  const stored = readCellContractStatuses(range);
  if (stored[0]) return stored[0];

  const indices = Object.keys(stored)
    .map(Number)
    .filter((index) => index >= 0 && index < blockCount)
    .sort((a, b) => a - b);

  if (indices.length > 0) return stored[indices[0]] ?? null;
  return null;
}

export function contractStatusBadgeLabel(status: ContractStatus | null): string {
  if (!status) return "계약상태";
  return formatContractStatus(status);
}

===== lib/calendar/cell-text.ts =====

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

===== lib/calendar/contract-status.ts =====

// 행사 계약 상태 타입·표시 문자열·회의실 배치 규칙을 정의합니다.

import type { RoomDisplay } from "./room-codes";

export type ContractStatusKind =
  | "inquiry"
  | "contract_reply_needed"
  | "contract_complete"
  | "reservation_complete"
  | "wait_first"
  | "wait_second";

export type ContractStatus =
  | { kind: "inquiry" }
  | { kind: "contract_reply_needed" }
  | { kind: "contract_complete"; date: string }
  | { kind: "reservation_complete"; date: string }
  | { kind: "wait_first" }
  | { kind: "wait_second" };

export const CONTRACT_STATUS_OPTIONS: ReadonlyArray<{
  kind: ContractStatusKind;
  label: string;
  needsDate: boolean;
}> = [
  { kind: "inquiry", label: "문의중", needsDate: false },
  { kind: "contract_reply_needed", label: "계약서 회신 필요", needsDate: false },
  { kind: "contract_complete", label: "계약완료", needsDate: true },
  { kind: "reservation_complete", label: "예약완료", needsDate: true },
  { kind: "wait_first", label: "대기 1순위", needsDate: false },
  { kind: "wait_second", label: "대기 2순위", needsDate: false },
];

const STATUS_LINE_PATTERNS: Array<{ regex: RegExp; parse: (m: RegExpMatchArray) => ContractStatus }> = [
  { regex: /^문의중$/, parse: () => ({ kind: "inquiry" }) },
  { regex: /^계약서 회신 필요$/, parse: () => ({ kind: "contract_reply_needed" }) },
  {
    regex: /^계약완료\((.+)\)$/,
    parse: (m) => ({ kind: "contract_complete", date: m[1].trim() }),
  },
  {
    regex: /^예약완료\((.+)\)$/,
    parse: (m) => ({ kind: "reservation_complete", date: m[1].trim() }),
  },
  { regex: /^대기 1순위$/, parse: () => ({ kind: "wait_first" }) },
  { regex: /^대기 2순위$/, parse: () => ({ kind: "wait_second" }) },
];

export function formatContractStatus(status: ContractStatus): string {
  switch (status.kind) {
    case "inquiry":
      return "문의중";
    case "contract_reply_needed":
      return "계약서 회신 필요";
    case "contract_complete":
      return `계약완료(${status.date})`;
    case "reservation_complete":
      return `예약완료(${status.date})`;
    case "wait_first":
      return "대기 1순위";
    case "wait_second":
      return "대기 2순위";
  }
}

export function parseContractStatusLine(line: string): ContractStatus | null {
  const trimmed = line.trim();
  for (const { regex, parse } of STATUS_LINE_PATTERNS) {
    const match = trimmed.match(regex);
    if (match) return parse(match);
  }
  return null;
}

export function isStatusLine(line: string): boolean {
  return parseContractStatusLine(line) !== null;
}

/** 행사 셀 기본 배경(흰색) */
export const EVENT_CELL_DEFAULT_BACKGROUND = "#ffffff";

/** 문의중·계약서 회신 필요 — RGB(224, 240, 209) */
export const STATUS_BG_INQUIRY = "#E0F0D1";

/** 대기 1·2순위 — RGB(207, 226, 243) */
export const STATUS_BG_WAITING = "#CFE2F3";

export function backgroundColorForStatus(status: ContractStatus | null): string {
  if (!status) return EVENT_CELL_DEFAULT_BACKGROUND;

  switch (status.kind) {
    case "inquiry":
    case "contract_reply_needed":
      return STATUS_BG_INQUIRY;
    case "contract_complete":
    case "reservation_complete":
      return EVENT_CELL_DEFAULT_BACKGROUND;
    case "wait_first":
    case "wait_second":
      return STATUS_BG_WAITING;
  }
}

export type RoomPlacement = "available_blue" | "available_green" | "closed_red";

export function placementForStatus(status: ContractStatus | null): RoomPlacement {
  if (!status) return "available_blue";

  switch (status.kind) {
    case "inquiry":
    case "contract_reply_needed":
    case "wait_first":
    case "wait_second":
      return "available_green";
    case "contract_complete":
    case "reservation_complete":
      return "closed_red";
  }
}

export type RoomPlacementSets = {
  availableBlue: RoomDisplay[];
  availableGreen: RoomDisplay[];
  closedRed: RoomDisplay[];
};

export function mergeRoomPlacement(
  current: RoomPlacementSets,
  rooms: readonly RoomDisplay[],
  placement: RoomPlacement,
): RoomPlacementSets {
  const next: RoomPlacementSets = {
    availableBlue: [...current.availableBlue],
    availableGreen: [...current.availableGreen],
    closedRed: [...current.closedRed],
  };

  for (const room of rooms) {
    next.availableBlue = next.availableBlue.filter((r) => r !== room);
    next.availableGreen = next.availableGreen.filter((r) => r !== room);
    next.closedRed = next.closedRed.filter((r) => r !== room);

    switch (placement) {
      case "available_blue":
        next.availableBlue.push(room);
        break;
      case "available_green":
        next.availableGreen.push(room);
        break;
      case "closed_red":
        next.closedRed.push(room);
        break;
    }
  }

  return next;
}

export function sortRoomsByDefaultOrder(
  rooms: readonly RoomDisplay[],
  order: readonly RoomDisplay[],
): RoomDisplay[] {
  const set = new Set(rooms);
  return order.filter((room) => set.has(room));
}

===== lib/calendar/event-text-parser.ts =====

// 행사 셀 텍스트에서 시스템 인식 줄(-)을 파싱해 회의실·유료서비스·계약 상태를 추출합니다.

import {
  expandIntegratedRoomKeyword,
  extractIntegratedRoomsFromText,
  normalizeRoomToken,
  type RoomDisplay,
} from "./room-codes";
import {
  formatContractStatus,
  isStatusLine,
  parseContractStatusLine,
  type ContractStatus,
} from "./contract-status";

export type ParseIssue = {
  line: string;
  token?: string;
  message: string;
};

export type ParsedSystemLine = {
  rawLine: string;
  rooms: RoomDisplay[];
  paidServices: string[];
  issues: ParseIssue[];
};

export type ParsedEventBlock = {
  lines: string[];
  status: ContractStatus | null;
  systemLines: ParsedSystemLine[];
  usedRooms: RoomDisplay[];
  paidServices: string[];
  issues: ParseIssue[];
};

export type ParsedEventCell = {
  blocks: ParsedEventBlock[];
  issues: ParseIssue[];
};

const TIME_RANGE_PATTERN = /\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/g;
const PLAN_SUFFIX_PATTERN = /\d+안\)/g;

/** 첫 줄 끝에 붙는 상태 표시(별도 줄·접미사 모두 인식) */
const FIRST_LINE_STATUS_SUFFIX_PATTERNS: Array<{
  regex: RegExp;
  parse: (m: RegExpMatchArray) => ContractStatus;
}> = [
  { regex: / 문의중$/, parse: () => ({ kind: "inquiry" }) },
  { regex: / 계약서 회신 필요$/, parse: () => ({ kind: "contract_reply_needed" }) },
  {
    regex: / 계약완료\((.+)\)$/,
    parse: (m) => ({ kind: "contract_complete", date: m[1].trim() }),
  },
  {
    regex: / 예약완료\((.+)\)$/,
    parse: (m) => ({ kind: "reservation_complete", date: m[1].trim() }),
  },
  { regex: / 대기 1순위$/, parse: () => ({ kind: "wait_first" }) },
  { regex: / 대기 2순위$/, parse: () => ({ kind: "wait_second" }) },
];

const FIRST_LINE_STATUS_STRIP_REGEXES = FIRST_LINE_STATUS_SUFFIX_PATTERNS.map((p) => p.regex);

function stripIgnoredFragments(text: string): string {
  return text.replace(TIME_RANGE_PATTERN, " ").replace(PLAN_SUFFIX_PATTERN, " ").trim();
}

function tokenizeRemainder(text: string): string[] {
  return text
    .split(/[,，、\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseSystemLineContent(content: string): ParsedSystemLine {
  const issues: ParseIssue[] = [];
  const rooms: RoomDisplay[] = [];
  const paidServices: string[] = [];
  const roomSet = new Set<RoomDisplay>();

  const cleaned = stripIgnoredFragments(content);

  for (const room of extractIntegratedRoomsFromText(cleaned)) {
    roomSet.add(room);
  }

  let remainder = cleaned;
  for (const keyword of Object.keys({
    P통합: 1,
    R통합: 1,
    S통합: 1,
    U통합: 1,
    K통합: 1,
    L통합: 1,
  })) {
    remainder = remainder.split(keyword).join(" ");
  }

  for (const token of tokenizeRemainder(remainder)) {
    const integrated = expandIntegratedRoomKeyword(token);
    if (integrated) {
      integrated.forEach((room) => roomSet.add(room));
      continue;
    }

    const normalized = normalizeRoomToken(token);
    if (normalized) {
      roomSet.add(normalized);
      continue;
    }

    if (/^\d+안$/.test(token)) continue;

    if (looksLikeRoomCode(token)) {
      issues.push({
        line: content,
        token,
        message: `회의실 코드를 인식하지 못했습니다: "${token}"`,
      });
      continue;
    }

    paidServices.push(token);
  }

  rooms.push(...roomSet);

  return {
    rawLine: content,
    rooms,
    paidServices,
    issues,
  };
}

/** 행사 구분: `▶`로 시작하는 새 줄이 나올 때만 다음 행사. 빈 줄은 같은 행사 안 메모 구분 */
function splitEventBlocks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("▶") && current.length > 0) {
      blocks.push(current.join("\n").trim());
      current = [line];
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) {
    blocks.push(current.join("\n").trim());
  }

  return blocks.filter(Boolean);
}

function isTitleLine(line: string): boolean {
  const trimmed = line.trim();
  return Boolean(trimmed) && !trimmed.startsWith("-") && !trimmed.startsWith(">");
}

function findEventTitleLineIndex(lines: string[]): number {
  const triangleIndex = lines.findIndex((line) => line.trim().startsWith("▶"));
  if (triangleIndex >= 0) return triangleIndex;
  return lines.findIndex((line) => isTitleLine(line));
}

function parseStatusFromFirstLine(line: string): ContractStatus | null {
  for (const { regex, parse } of FIRST_LINE_STATUS_SUFFIX_PATTERNS) {
    const match = line.match(regex);
    if (match) return parse(match);
  }
  return null;
}

export function stripStatusSuffixFromFirstLine(line: string): string {
  let result = line;
  for (const regex of FIRST_LINE_STATUS_STRIP_REGEXES) {
    result = result.replace(regex, "");
  }
  return result.trimEnd();
}

/** 첫 행사 블록의 ▶ 제목 줄(상태 접미사 제외)을 반환합니다. */
export function getTitleLineBaseForStatusButton(cellText: string): string {
  const normalized = cellText.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";

  const blocks = splitEventBlocks(normalized);
  if (blocks.length === 0) return "";

  const lines = blocks[0].split("\n");
  const titleIndex = findEventTitleLineIndex(lines);
  if (titleIndex < 0) return "";

  return stripStatusSuffixFromFirstLine(lines[titleIndex]);
}

function appendStatusToFirstLine(line: string, status: ContractStatus): string {
  const base = stripStatusSuffixFromFirstLine(line);
  return `${base} ${formatContractStatus(status)}`;
}

function parseEventBlock(blockText: string): ParsedEventBlock {
  const lines = blockText.split("\n").map((line) => line.trimEnd());
  const issues: ParseIssue[] = [];
  const systemLines: ParsedSystemLine[] = [];
  let status: ContractStatus | null = null;

  const titleIndex = findEventTitleLineIndex(lines);
  if (titleIndex >= 0) {
    status = parseStatusFromFirstLine(lines[titleIndex]);
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith(">")) continue;

    if (!status && isStatusLine(trimmed)) {
      status = parseContractStatusLine(trimmed);
      continue;
    }

    if (!trimmed.startsWith("-")) continue;

    const content = trimmed.slice(1).trim();
    if (!content) {
      issues.push({ line: trimmed, message: "시스템 줄(-)에 내용이 없습니다." });
      continue;
    }

    const parsed = parseSystemLineContent(content);
    systemLines.push(parsed);
    issues.push(...parsed.issues);
  }

  const usedRooms: RoomDisplay[] = [];
  const paidServices: string[] = [];
  const roomSet = new Set<RoomDisplay>();

  for (const sys of systemLines) {
    for (const room of sys.rooms) roomSet.add(room);
    paidServices.push(...sys.paidServices);
  }

  usedRooms.push(...roomSet);

  return {
    lines,
    status,
    systemLines,
    usedRooms,
    paidServices,
    issues,
  };
}

export function parseEventCellText(text: string): ParsedEventCell {
  const blocks = splitEventBlocks(text).map(parseEventBlock);
  const issues = blocks.flatMap((block) => block.issues);
  return { blocks, issues };
}

export function updateEventBlockStatus(
  cellText: string,
  blockIndex: number,
  status: ContractStatus,
): string {
  const normalized = cellText.replace(/\r\n/g, "\n");
  const blocks = splitEventBlocks(normalized);
  if (blockIndex < 0 || blockIndex >= blocks.length) return cellText;

  const lines = blocks[blockIndex].split("\n");
  const titleIndex = findEventTitleLineIndex(lines);

  if (titleIndex >= 0) {
    lines[titleIndex] = appendStatusToFirstLine(lines[titleIndex], status);
  } else {
    lines.unshift(formatContractStatus(status));
  }

  const withoutStandaloneStatus = lines.filter((line) => !isStatusLine(line.trim()));
  blocks[blockIndex] = withoutStandaloneStatus.join("\n");

  if (blocks.length === 1) return blocks[0];
  return blocks.join("\n\n");
}

export function countEventBlocks(cellText: string): number {
  return splitEventBlocks(cellText.replace(/\r\n/g, "\n")).length;
}

/** 행사 셀 배경색 결정용. custom 메타·명시 상태·텍스트 접미사 순으로 확인 */
export function resolveEventCellBackgroundStatus(
  cellText: string,
  explicitStatus?: ContractStatus,
  contractStatuses?: Record<number, ContractStatus>,
): ContractStatus | null {
  if (explicitStatus) return explicitStatus;

  if (contractStatuses) {
    const indices = Object.keys(contractStatuses)
      .map(Number)
      .filter((index) => index >= 0)
      .sort((a, b) => a - b);
    for (const index of indices) {
      const status = contractStatuses[index];
      if (status) return status;
    }
  }

  const parsed = parseEventCellText(cellText);
  for (const block of parsed.blocks) {
    if (block.status) return block.status;
  }
  return null;
}

function looksLikeRoomCode(token: string): boolean {
  if (/통합$/.test(token)) return true;
  if (/^[A-Z](?:-\d+)?$/i.test(token)) return true;
  if (/^[A-Z]\d$/i.test(token)) return true;
  return false;
}

/** @deprecated readEventCellText(FRange) 사용 */
export function getCellPlainText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && value !== null) {
    const doc = value as { getData?: () => { body?: { dataStream?: string } } };
    const stream = doc.getData?.()?.body?.dataStream;
    if (typeof stream === "string") return stream.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }
  return String(value);
}

===== lib/calendar/grid.ts =====

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

===== lib/calendar/room-codes.ts =====

// 달력에 표시되는 회의실 코드·통합룸 매핑·표시 형식 변환을 정의합니다.

export const DEFAULT_CALENDAR_ROOM_LIST = [
  "A",
  "B",
  "C",
  "E",
  "F",
  "J",
  "D",
  "K",
  "L",
  "N",
  "M",
  "R-1",
  "R-2",
  "S-1",
  "S-2",
  "T",
  "P-1",
  "P-2",
  "V-1",
  "V-2",
  "V-3",
  "U-1",
  "U-2",
  "W-1",
  "W-2",
  "W-3",
] as const;

export type RoomDisplay = (typeof DEFAULT_CALENDAR_ROOM_LIST)[number];

/** DB 코드 → 달력 표시명 */
export const DISPLAY_TO_CODE: Record<string, string> = {
  "R-1": "R1",
  "R-2": "R2",
  "S-1": "S1",
  "S-2": "S2",
  "P-1": "P1",
  "P-2": "P2",
  "V-1": "V1",
  "V-2": "V2",
  "V-3": "V3",
  "U-1": "U1",
  "U-2": "U2",
  "W-1": "W1",
  "W-2": "W2",
  "W-3": "W3",
};

/** 통합룸 키워드 → 구성 단위룸(표시명) */
export const INTEGRATED_ROOM_MAP: Record<string, readonly RoomDisplay[]> = {
  P통합: ["P-1", "P-2"],
  R통합: ["R-1", "R-2"],
  S통합: ["S-1", "S-2"],
  U통합: ["U-1", "U-2"],
  K통합: ["K"],
  L통합: ["L"],
};

const INTEGRATED_ROOM_KEYS = Object.keys(INTEGRATED_ROOM_MAP).sort(
  (a, b) => b.length - a.length,
);

const DISPLAY_SET = new Set<string>(DEFAULT_CALENDAR_ROOM_LIST);
const CODE_TO_DISPLAY: Record<string, RoomDisplay> = {};

for (const display of DEFAULT_CALENDAR_ROOM_LIST) {
  CODE_TO_DISPLAY[display] = display;
  const code = DISPLAY_TO_CODE[display];
  if (code) CODE_TO_DISPLAY[code] = display;
}

export function isKnownRoomDisplay(value: string): value is RoomDisplay {
  return DISPLAY_SET.has(value);
}

export function normalizeRoomToken(token: string): RoomDisplay | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  if (isKnownRoomDisplay(trimmed)) return trimmed;

  const mapped = CODE_TO_DISPLAY[trimmed];
  if (mapped) return mapped;

  return null;
}

export function expandIntegratedRoomKeyword(keyword: string): readonly RoomDisplay[] | null {
  const rooms = INTEGRATED_ROOM_MAP[keyword];
  return rooms ?? null;
}

export function extractIntegratedRoomsFromText(text: string): RoomDisplay[] {
  const found: RoomDisplay[] = [];
  let remaining = text;

  for (const keyword of INTEGRATED_ROOM_KEYS) {
    if (!remaining.includes(keyword)) continue;
    found.push(...INTEGRATED_ROOM_MAP[keyword]);
    remaining = remaining.split(keyword).join(" ");
  }

  return found;
}

export function formatRoomList(displays: readonly string[]) {
  return displays.join(", ");
}

===== lib/calendar/room-placement.ts =====

// 행사 셀 파싱 결과로 날짜별 빈/대기/마감 회의실 목록을 계산합니다.

import {
  DEFAULT_CALENDAR_ROOM_LIST,
  formatRoomList,
  type RoomDisplay,
} from "./room-codes";
import {
  mergeRoomPlacement,
  placementForStatus,
  sortRoomsByDefaultOrder,
  type ContractStatus,
  type RoomPlacementSets,
} from "./contract-status";
import { parseEventCellText, type ParseIssue } from "./event-text-parser";

export const AVAILABLE_ROOM_COLOR = "#1d4ed8";
export const PENDING_ROOM_COLOR = "#16a34a";
export const CLOSED_ROOM_COLOR = "#dc2626";

export type DayRoomSnapshot = {
  availableBlue: RoomDisplay[];
  availableGreen: RoomDisplay[];
  closedRed: RoomDisplay[];
  paidServices: string[];
  issues: ParseIssue[];
};

export type OrderedAvailableRoom = {
  room: RoomDisplay;
  color: string;
};

export function computeDayRoomsFromEventText(
  eventText: string,
  contractStatuses?: Record<number, ContractStatus>,
): DayRoomSnapshot {
  const parsed = parseEventCellText(eventText);
  const issues: ParseIssue[] = [...parsed.issues];
  const paidServices: string[] = [];

  let placement: RoomPlacementSets = {
    availableBlue: [...DEFAULT_CALENDAR_ROOM_LIST],
    availableGreen: [],
    closedRed: [],
  };

  parsed.blocks.forEach((block, blockIndex) => {
    paidServices.push(...block.paidServices);

    if (block.usedRooms.length === 0) return;

    const status = contractStatuses?.[blockIndex] ?? block.status;
    const blockPlacement = placementForStatus(status);
    placement = mergeRoomPlacement(placement, block.usedRooms, blockPlacement);
  });

  return {
    availableBlue: sortRoomsByDefaultOrder(placement.availableBlue, DEFAULT_CALENDAR_ROOM_LIST),
    availableGreen: sortRoomsByDefaultOrder(placement.availableGreen, DEFAULT_CALENDAR_ROOM_LIST),
    closedRed: sortRoomsByDefaultOrder(placement.closedRed, DEFAULT_CALENDAR_ROOM_LIST),
    paidServices,
    issues,
  };
}

/** 기본 회의실 순서를 유지하며 색만 파랑/초록으로 구분합니다. */
export function buildOrderedAvailableRooms(snapshot: DayRoomSnapshot): OrderedAvailableRoom[] {
  const greenSet = new Set(snapshot.availableGreen);
  const blueSet = new Set(snapshot.availableBlue);
  const closedSet = new Set(snapshot.closedRed);

  return DEFAULT_CALENDAR_ROOM_LIST.filter((room) => !closedSet.has(room)).map((room) => ({
    room,
    color: greenSet.has(room) ? PENDING_ROOM_COLOR : blueSet.has(room) ? AVAILABLE_ROOM_COLOR : AVAILABLE_ROOM_COLOR,
  }));
}

export function formatClosedRoomText(closedRooms: readonly RoomDisplay[]): string {
  return formatRoomList(closedRooms);
}

===== lib/calendar/sync-day-rooms.ts =====

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

===== lib/calendar/sync-guard.ts =====

// 프로그램적 회의실 동기화 중 SheetValueChanged 재진입을 막는 가드입니다.

let suppressDepth = 0;

export function isCalendarSyncSuppressed(): boolean {
  return suppressDepth > 0;
}

export function runWithCalendarSyncSuppress<T>(fn: () => T): T {
  suppressDepth += 1;
  try {
    return fn();
  } finally {
    suppressDepth -= 1;
  }
}

===== lib/univer/alt-color-shortcuts-plugin.ts =====

// Univer Sheets에서 Alt+`·숫자 색상·기호 단축키를 등록하는 플러그인입니다.

import type { IAccessor, ICommand } from "@univerjs/core";
import {
  CommandType,
  EDITOR_ACTIVATED,
  FOCUSING_COMMON_DRAWINGS,
  FOCUSING_SHEET,
  ICommandService,
  IContextService,
  Inject,
  Injector,
  Plugin,
  UniverInstanceType,
} from "@univerjs/core";
import { InsertCommand, IEditorService } from "@univerjs/docs-ui";
import { SetBackgroundColorCommand } from "@univerjs/sheets";
import { SetRangeTextColorCommand, whenSheetEditorActivated } from "@univerjs/sheets-ui";
import { IShortcutService, KeyCode, MetaKeys } from "@univerjs/ui";

const PLUGIN_NAME = "INTEGRATED_BOOKING_CALENDAR_ALT_SHORTCUTS_PLUGIN";

/** 브라우저 keyCode 192 = Backquote(`). KeyCode enum에 없어 리터럴 사용. */
const BACK_QUOTE_KEY = 192;

const InsertSymbolCommandId = "calendar.shortcut.insert-symbol";
const SetPartialFontColorCommandId = "calendar.shortcut.set-partial-font-color";
const SetCellBackgroundColorCommandId = "calendar.shortcut.set-cell-background-color";

const TRIANGLE_SYMBOL = "▶";

type ColorParams = { color: string };

/** 셀 선택·편집 중 모두 배경색 단축키가 동작하도록 시트 포커스만 요구 */
function whenSheetCellActive(contextService: IContextService) {
  return (
    contextService.getContextValue(FOCUSING_SHEET) &&
    !contextService.getContextValue(FOCUSING_COMMON_DRAWINGS)
  );
}

function getFocusEditor(accessor: IAccessor) {
  return accessor.get(IEditorService).getFocusEditor();
}

function hasPartialTextSelection(accessor: IAccessor) {
  const editor = getFocusEditor(accessor);
  if (!editor) return false;

  return editor.getSelectionRanges().some((range) => {
    const start = range.startOffset;
    const end = range.endOffset;
    return start != null && end != null && start !== end;
  });
}

const InsertSymbolCommand: ICommand = {
  id: InsertSymbolCommandId,
  type: CommandType.OPERATION,
  handler: async (accessor) => {
    const contextService = accessor.get(IContextService);
    if (!contextService.getContextValue(EDITOR_ACTIVATED)) return false;

    const editor = getFocusEditor(accessor);
    if (!editor) return false;

    const ranges = editor.getSelectionRanges();
    const activeRange = ranges.find((range) => range.isActive) ?? ranges[0];
    if (!activeRange) return false;

    return accessor.get(ICommandService).executeCommand(InsertCommand.id, {
      unitId: editor.getEditorId(),
      body: { dataStream: TRIANGLE_SYMBOL },
      range: activeRange,
      segmentId: activeRange.segmentId,
    });
  },
};

const SetPartialFontColorCommand: ICommand<ColorParams> = {
  id: SetPartialFontColorCommandId,
  type: CommandType.OPERATION,
  handler: async (accessor, params) => {
    if (!params?.color) return false;
    if (!hasPartialTextSelection(accessor)) return false;

    return accessor.get(ICommandService).executeCommand(SetRangeTextColorCommand.id, {
      value: params.color,
    });
  },
};

const SetCellBackgroundColorCommand: ICommand<ColorParams> = {
  id: SetCellBackgroundColorCommandId,
  type: CommandType.OPERATION,
  handler: async (accessor, params) => {
    if (!params?.color) return false;

    return accessor.get(ICommandService).executeCommand(SetBackgroundColorCommand.id, {
      value: params.color,
    });
  },
};

const FONT_COLOR_SHORTCUTS = [
  { binding: KeyCode.Digit1 | MetaKeys.ALT, color: "#000000" }, // RGB(0, 0, 0)
  { binding: KeyCode.Digit2 | MetaKeys.ALT, color: "#980000" }, // RGB(152, 0, 0)
  { binding: KeyCode.Digit3 | MetaKeys.ALT, color: "#334D1A" }, // RGB(51, 77, 26)
  { binding: KeyCode.Digit4 | MetaKeys.ALT, color: "#0000CC" }, // RGB(0, 0, 204)
] as const;

const BACKGROUND_COLOR_SHORTCUTS = [
  { binding: KeyCode.Digit5 | MetaKeys.ALT, color: "#E0F0D1" }, // RGB(224, 240, 209)
  { binding: KeyCode.Digit6 | MetaKeys.ALT, color: "#CFE2F3" }, // RGB(207, 226, 243)
  { binding: KeyCode.Digit7 | MetaKeys.ALT, color: "#FFF2CC" }, // RGB(255, 242, 204)
] as const;

export class UniverSheetsAltColorShortcutsPlugin extends Plugin {
  static override type = UniverInstanceType.UNIVER_SHEET;
  static override pluginName = PLUGIN_NAME;

  constructor(@Inject(Injector) protected readonly _injector: Injector) {
    super();
  }

  override onStarting(): void {
    const commandService = this._injector.get(ICommandService);
    this.disposeWithMe(commandService.registerCommand(InsertSymbolCommand));
    this.disposeWithMe(commandService.registerCommand(SetPartialFontColorCommand));
    this.disposeWithMe(commandService.registerCommand(SetCellBackgroundColorCommand));
  }

  override onRendered(): void {
    const shortcutService = this._injector.get(IShortcutService);

    this.disposeWithMe(
      shortcutService.registerShortcut({
        id: InsertSymbolCommandId,
        binding: BACK_QUOTE_KEY | MetaKeys.ALT,
        preconditions: whenSheetEditorActivated,
      }),
    );

    for (const { binding, color } of FONT_COLOR_SHORTCUTS) {
      this.disposeWithMe(
        shortcutService.registerShortcut({
          id: SetPartialFontColorCommandId,
          binding,
          staticParameters: { color },
          preconditions: whenSheetEditorActivated,
        }),
      );
    }

    for (const { binding, color } of BACKGROUND_COLOR_SHORTCUTS) {
      this.disposeWithMe(
        shortcutService.registerShortcut({
          id: SetCellBackgroundColorCommandId,
          binding,
          staticParameters: { color },
          preconditions: whenSheetCellActive,
        }),
      );
    }
  }
}

===== lib/univer/calendar-booking-plugin.ts =====

// 행사 셀 계약 상태 컨텍스트 메뉴·값 변경 시 회의실 행 자동 갱신 플러그인입니다.

import type { Dependency, IAccessor, ICommand } from "@univerjs/core";
import {
  CommandType,
  Disposable,
  ICommandService,
  Inject,
  Injector,
  Plugin,
  touchDependencies,
  UniverInstanceType,
} from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { Observable } from "rxjs";
import {
  ContextMenuGroup,
  ContextMenuPosition,
  IMenuManagerService,
  type IMenuButtonItem,
  type IMenuSelectorItem,
  MenuItemType,
} from "@univerjs/ui";
import { InsertRowCommand, type IInsertRowCommandParams } from "@univerjs/sheets";
import { writeCellContractStatus } from "@/lib/calendar/cell-contract-status";
import { readEventCellText } from "@/lib/calendar/cell-text";
import type { ContractStatus, ContractStatusKind } from "@/lib/calendar/contract-status";
import { CONTRACT_STATUS_OPTIONS } from "@/lib/calendar/contract-status";
import { countEventBlocks } from "@/lib/calendar/event-text-parser";
import { isEventRow } from "@/lib/calendar/grid";
import type { ParseIssue } from "@/lib/calendar/event-text-parser";
import { isCalendarSyncSuppressed, runWithCalendarSyncSuppress } from "@/lib/calendar/sync-guard";
import { syncDayRoomsFromEventCell } from "@/lib/calendar/sync-day-rooms";

const PLUGIN_NAME = "INTEGRATED_BOOKING_CALENDAR_BOOKING_PLUGIN";
const CONTRACT_STATUS_MENU_ID = "calendar.menu.contract-status";
const EVENT_ROW_HEIGHT = 150;

export type CalendarBookingPluginConfig = {
  onParseIssues?: (issues: ParseIssue[]) => void;
};

type SetContractStatusParams = {
  kind: ContractStatusKind;
  blockIndex?: number;
  row?: number;
  col?: number;
};

function commandIdForStatus(kind: ContractStatusKind) {
  return `calendar.command.set-contract-status.${kind}`;
}

function createStatusCommand(kind: ContractStatusKind): ICommand<SetContractStatusParams> {
  return {
    id: commandIdForStatus(kind),
    type: CommandType.OPERATION,
    handler: (accessor, params) => {
      const option = CONTRACT_STATUS_OPTIONS.find((item) => item.kind === kind);
      if (!option) return false;

      const status = buildContractStatus(option);
      if (!status) return false;

      return applyContractStatus(
        accessor,
        status,
        params?.blockIndex ?? 0,
        params?.row,
        params?.col,
      );
    },
  };
}

function applyContractStatus(
  accessor: IAccessor,
  status: ContractStatus,
  blockIndex: number,
  targetRow?: number,
  targetCol?: number,
): boolean {
  const univerAPI = getFacadeAPI(accessor);
  const fWorkbook = univerAPI.getActiveWorkbook();
  if (!fWorkbook) return false;

  const fWorksheet = fWorkbook.getActiveSheet();
  if (!fWorksheet) return false;

  let row = targetRow;
  let col = targetCol;

  if (row == null || col == null) {
    const fRange = fWorksheet.getActiveRange();
    if (!fRange) return false;
    row = fRange.getRow();
    col = fRange.getColumn();
  }

  if (!isEventRow(row)) return false;

  const fRange = fWorksheet.getRange(row, col);
  const currentText = readEventCellText(fRange);
  const eventCount = countEventBlocks(currentText);

  let targetBlockIndex = blockIndex;
  if (eventCount > 1) {
    const picked = window.prompt(
      `이 셀에 행사가 ${eventCount}개 있습니다. 적용할 행사 번호(1~${eventCount})를 입력하세요.`,
      "1",
    );
    if (!picked?.trim()) return false;
    const num = Number(picked.trim());
    if (!Number.isInteger(num) || num < 1 || num > eventCount) {
      window.alert("올바른 행사 번호가 아닙니다.");
      return false;
    }
    targetBlockIndex = num - 1;
  }

  return runWithCalendarSyncSuppress(() => {
    writeCellContractStatus(fRange, targetBlockIndex, status);
    const issues = syncDayRoomsFromEventCell(univerAPI, fWorksheet, row, col, status).issues;
    publishIssues(accessor, issues);
    return true;
  });
}

function todayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildContractStatus(
  option: (typeof CONTRACT_STATUS_OPTIONS)[number],
): ContractStatus | null {
  if (!option.needsDate) {
    return { kind: option.kind } as ContractStatus;
  }

  const date = todayDateString();
  if (option.kind === "contract_complete") return { kind: "contract_complete", date };
  if (option.kind === "reservation_complete") return { kind: "reservation_complete", date };
  return null;
}

function getFacadeAPI(accessor: IAccessor) {
  return FUniver.newAPI(accessor.get(Injector));
}

class CalendarBookingConfigHolder {
  constructor(public readonly config: CalendarBookingPluginConfig) {}
}

function publishIssues(accessor: IAccessor, issues: ParseIssue[]) {
  const holder = accessor.get(CalendarBookingConfigHolder);
  holder.config.onParseIssues?.(issues);
}

function isActiveCellEventRow(accessor: IAccessor): boolean {
  const univerAPI = getFacadeAPI(accessor);
  const range = univerAPI.getActiveWorkbook()?.getActiveSheet()?.getActiveRange();
  if (!range) return false;
  return isEventRow(range.getRow());
}

function contractStatusMenuFactory(accessor: IAccessor): IMenuSelectorItem<string> {
  return {
    id: CONTRACT_STATUS_MENU_ID,
    type: MenuItemType.SUBITEMS,
    title: "계약 상태",
    hidden$: new Observable((subscriber) => {
      subscriber.next(!isActiveCellEventRow(accessor));
      const univerAPI = getFacadeAPI(accessor);
      const sub = univerAPI.addEvent(univerAPI.Event.SheetEditEnded, () => {
        subscriber.next(!isActiveCellEventRow(accessor));
      });
      return () => sub.dispose();
    }),
  };
}

function statusMenuItemFactory(kind: ContractStatusKind): (accessor: IAccessor) => IMenuButtonItem<string> {
  const option = CONTRACT_STATUS_OPTIONS.find((item) => item.kind === kind)!;
  return () => ({
    id: commandIdForStatus(kind),
    type: MenuItemType.BUTTON,
    title: option.label,
  });
}

class CalendarBookingController extends Disposable {
  constructor(
    @Inject(Injector) private readonly _injector: Injector,
    @ICommandService private readonly _commandService: ICommandService,
    @IMenuManagerService private readonly _menuManagerService: IMenuManagerService,
    @Inject(CalendarBookingConfigHolder)
    private readonly _configHolder: CalendarBookingConfigHolder,
  ) {
    super();
    this._initCommands();
    this._initMenus();
    this._initInsertRowHeightListener();
    this._initSheetValueListener();
  }

  private _initCommands(): void {
    for (const option of CONTRACT_STATUS_OPTIONS) {
      this.disposeWithMe(this._commandService.registerCommand(createStatusCommand(option.kind)));
    }
  }

  private _initMenus(): void {
    const children: Record<string, { order: number; menuItemFactory: (accessor: IAccessor) => IMenuButtonItem<string> }> =
      {};

    CONTRACT_STATUS_OPTIONS.forEach((option, index) => {
      children[commandIdForStatus(option.kind)] = {
        order: index,
        menuItemFactory: statusMenuItemFactory(option.kind),
      };
    });

    this._menuManagerService.mergeMenu({
      [ContextMenuPosition.MAIN_AREA]: {
        [ContextMenuGroup.DATA]: {
          [CONTRACT_STATUS_MENU_ID]: {
            order: 5,
            menuItemFactory: contractStatusMenuFactory,
            ...children,
          },
        },
      },
    });
  }

  private _initInsertRowHeightListener(): void {
    const univerAPI = FUniver.newAPI(this._injector);
    this.disposeWithMe(
      univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => {
        if (event.id !== InsertRowCommand.id) return;

        const target = univerAPI.getCommandSheetTarget({
          id: event.id,
          params: event.params,
        });
        if (!target) return;

        const params = event.params as IInsertRowCommandParams | undefined;
        const range = params?.range;
        if (!range) return;

        const numRows = range.endRow - range.startRow + 1;
        if (numRows <= 0) return;

        target.worksheet.setRowHeightsForced(range.startRow, numRows, EVENT_ROW_HEIGHT);
      }),
    );
  }

  private _initSheetValueListener(): void {
    const univerAPI = FUniver.newAPI(this._injector);
    this.disposeWithMe(
      univerAPI.addEvent(univerAPI.Event.SheetValueChanged, (params) => {
        if (isCalendarSyncSuppressed()) return;

        const fWorkbook = univerAPI.getActiveWorkbook();
        const fWorksheet = fWorkbook?.getActiveSheet();
        if (!fWorksheet) return;

        for (const range of params.effectedRanges) {
          const row = range.getRow();
          const col = range.getColumn();
          if (!isEventRow(row)) continue;

          const issues = syncDayRoomsFromEventCell(univerAPI, fWorksheet, row, col).issues;
          this._configHolder.config.onParseIssues?.(issues);
        }
      }),
    );
  }
}

export class UniverSheetsCalendarBookingPlugin extends Plugin {
  static override type = UniverInstanceType.UNIVER_SHEET;
  static override pluginName = PLUGIN_NAME;

  private readonly _config: CalendarBookingPluginConfig;

  constructor(
    config: CalendarBookingPluginConfig = {},
    @Inject(Injector) protected readonly _injector: Injector,
  ) {
    super();
    this._config = config;
  }

  override onStarting(): void {
    ([
      [CalendarBookingConfigHolder, { useValue: new CalendarBookingConfigHolder(this._config) }],
      [CalendarBookingController],
    ] as Dependency[]).forEach((dep) => this._injector.add(dep));
  }

  override onRendered(): void {
    touchDependencies(this._injector, [[CalendarBookingController]]);
  }
}

===== components/Dashboard.tsx =====

// Univer Sheets로 월간 예약 캘린더를 렌더링하는 대시보드 컴포넌트입니다.
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreKoKR from "@univerjs/preset-sheets-core/locales/ko-KR";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import { DEFAULT_CALENDAR_ROOM_LIST, formatRoomList } from "@/lib/calendar/room-codes";
import {
  AVAILABLE_ROOM_COLOR,
  CLOSED_ROOM_COLOR,
} from "@/lib/calendar/room-placement";
import { syncAllEventRowsInSheet } from "@/lib/calendar/sync-day-rooms";
import type { ParseIssue } from "@/lib/calendar/event-text-parser";
import {
  BLOCK_ROW_AVAILABLE,
  BLOCK_ROW_CLOSED,
  BLOCK_ROW_DATE,
  BLOCK_ROW_EVENTS,
  CALENDAR_BLOCK_ROW_COUNT,
  CALENDAR_WEEK_COUNT,
  columnIndexToLetter,
} from "@/lib/calendar/grid";
import { UniverSheetsAltColorShortcutsPlugin } from "@/lib/univer/alt-color-shortcuts-plugin";
import {
  UniverSheetsCalendarBookingPlugin,
  type CalendarBookingPluginConfig,
} from "@/lib/univer/calendar-booking-plugin";
const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"] as const;
const BLOCK_ROW_DATE_HEIGHT = 35;
const BLOCK_ROW_AVAILABLE_HEIGHT = 25;
const BLOCK_ROW_CLOSED_HEIGHT = 25;
const BLOCK_ROW_EVENTS_HEIGHT = 150;
const SATURDAY_DATE_COLOR = "#1d4ed8";
const SUNDAY_DATE_COLOR = "#dc2626";
const DAY_BLOCK_BORDER_COLOR = "#94a3b8";
const CLOSED_ROW_BACKGROUND = "#E2E2D3";
const EVENT_ROW_BACKGROUND = "#ffffff";
const AVAILABLE_ROOM_FONT_SIZE = 7;
const CALENDAR_COLUMN_WIDTH = 537;
const MIN_CELL_SIZE_PX = 1;

type CalendarSheetFacade = {
  setColumnWidths: (startColumn: number, numColumns: number, width: number) => unknown;
  setRowHeightsForced: (startRow: number, numRows: number, height: number) => unknown;
  getRange: (a1: string) => {
    setFontColor: (color: string) => unknown;
    setBackgroundColor: (color: string) => unknown;
    setBorder: (type: unknown, style: unknown, color?: string) => unknown;
    setVerticalAlignment: (alignment: string) => unknown;
    setFontSize: (size: number) => unknown;
    setWrap: (enabled: boolean) => unknown;
  };
};

function ensurePositiveSize(size: number) {
  if (!Number.isFinite(size)) return MIN_CELL_SIZE_PX;
  return Math.max(MIN_CELL_SIZE_PX, Math.floor(size));
}

type DateColorCell = {
  row: number;
  col: number;
  color: string;
};

type StyledDayCell = {
  row: number;
  col: number;
};

type DayBlockRange = {
  topRow: number;
  bottomRow: number;
  col: number;
};

function buildMonthSheetSkeleton(year: number, month: number) {
  const weekCount = CALENDAR_WEEK_COUNT;
  const blockRowCount = CALENDAR_BLOCK_ROW_COUNT;
  const rowCount = weekCount * blockRowCount;
  const columnCount = 7;

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

  const cellData: Record<number, Record<number, { v: string }>> = {};
  const dateColorCells: DateColorCell[] = [];
  const availableRowCells: StyledDayCell[] = [];
  const closedRowCells: StyledDayCell[] = [];
  const eventRowCells: StyledDayCell[] = [];
  const dayBlockRanges: DayBlockRange[] = [];
  const rowData: Record<number, { h: number }> = {};
  const columnData: Record<number, { w: number }> = {};
  const dateRowHeight = ensurePositiveSize(BLOCK_ROW_DATE_HEIGHT);
  const availableRowHeight = ensurePositiveSize(BLOCK_ROW_AVAILABLE_HEIGHT);
  const closedRowHeight = ensurePositiveSize(BLOCK_ROW_CLOSED_HEIGHT);
  const eventRowHeight = ensurePositiveSize(BLOCK_ROW_EVENTS_HEIGHT);
  const columnWidth = ensurePositiveSize(CALENDAR_COLUMN_WIDTH);

  for (let col = 0; col < columnCount; col++) {
    columnData[col] = { w: columnWidth };
  }

  let day = 1;
  for (let w = 0; w < weekCount; w++) {
    const topRow = w * blockRowCount;
    const bottomRow = topRow + blockRowCount - 1;

    for (let col = 0; col < 7; col++) {
      dayBlockRanges.push({ topRow, bottomRow, col });
    }

    rowData[topRow + BLOCK_ROW_DATE] = { h: dateRowHeight };
    rowData[topRow + BLOCK_ROW_AVAILABLE] = { h: availableRowHeight };
    rowData[topRow + BLOCK_ROW_CLOSED] = { h: closedRowHeight };
    rowData[topRow + BLOCK_ROW_EVENTS] = { h: eventRowHeight };

    for (let dow = 0; dow < 7; dow++) {
      if (w === 0 && dow < startingDayOfWeek) continue;
      if (day > daysInMonth) continue;

      const dateRow = topRow + BLOCK_ROW_DATE;
      const availableRow = topRow + BLOCK_ROW_AVAILABLE;
      const closedRow = topRow + BLOCK_ROW_CLOSED;
      const eventRow = topRow + BLOCK_ROW_EVENTS;

      cellData[dateRow] = cellData[dateRow] ?? {};
      cellData[dateRow][dow] = { v: `${day}일 (${DAY_LABELS[dow]})` };

      cellData[availableRow] = cellData[availableRow] ?? {};
      cellData[availableRow][dow] = { v: formatRoomList(DEFAULT_CALENDAR_ROOM_LIST) };

      cellData[closedRow] = cellData[closedRow] ?? {};
      cellData[closedRow][dow] = { v: "" };

      cellData[eventRow] = cellData[eventRow] ?? {};

      availableRowCells.push({ row: availableRow, col: dow });
      closedRowCells.push({ row: closedRow, col: dow });
      eventRowCells.push({ row: eventRow, col: dow });

      if (dow === 5) {
        dateColorCells.push({ row: dateRow, col: dow, color: SATURDAY_DATE_COLOR });
      } else if (dow === 6) {
        dateColorCells.push({ row: dateRow, col: dow, color: SUNDAY_DATE_COLOR });
      }

      day++;
    }
  }

  const sheetSnapshot = {
    rowCount,
    columnCount,
    cellData,
    mergeData: [],
    defaultColumnWidth: columnWidth,
    defaultRowHeight: eventRowHeight,
    rowData,
    columnData,
  };

  const calendarA1 = `A1:${columnIndexToLetter(columnCount - 1)}${rowCount}`;

  return {
    rowCount,
    columnCount,
    sheetSnapshot,
    dateColorCells,
    availableRowCells,
    closedRowCells,
    eventRowCells,
    dayBlockRanges,
    calendarA1,
  };
}

function applyMonthSheetStyles(
  fWorksheet: CalendarSheetFacade,
  built: {
    rowCount: number;
    columnCount: number;
    calendarA1: string;
    dateColorCells: DateColorCell[];
    availableRowCells: StyledDayCell[];
    closedRowCells: StyledDayCell[];
    eventRowCells: StyledDayCell[];
    dayBlockRanges: DayBlockRange[];
  },
  univerAPI: ReturnType<typeof createUniver>["univerAPI"],
) {
  const { BorderType, BorderStyleTypes } = univerAPI.Enum;
  const dateRowHeight = ensurePositiveSize(BLOCK_ROW_DATE_HEIGHT);
  const availableRowHeight = ensurePositiveSize(BLOCK_ROW_AVAILABLE_HEIGHT);
  const closedRowHeight = ensurePositiveSize(BLOCK_ROW_CLOSED_HEIGHT);
  const eventRowHeight = ensurePositiveSize(BLOCK_ROW_EVENTS_HEIGHT);
  const columnWidth = ensurePositiveSize(CALENDAR_COLUMN_WIDTH);
  const lastColLetter = columnIndexToLetter(built.columnCount - 1);

  fWorksheet.setColumnWidths(0, built.columnCount, columnWidth);

  for (let w = 0; w < CALENDAR_WEEK_COUNT; w++) {
    const topRow = w * CALENDAR_BLOCK_ROW_COUNT;
    fWorksheet.setRowHeightsForced(topRow + BLOCK_ROW_DATE, 1, dateRowHeight);
    fWorksheet.setRowHeightsForced(topRow + BLOCK_ROW_AVAILABLE, 1, availableRowHeight);
    fWorksheet.setRowHeightsForced(topRow + BLOCK_ROW_CLOSED, 1, closedRowHeight);
    fWorksheet.setRowHeightsForced(topRow + BLOCK_ROW_EVENTS, 1, eventRowHeight);

    fWorksheet
      .getRange(`A${topRow + BLOCK_ROW_DATE + 1}:${lastColLetter}${topRow + BLOCK_ROW_DATE + 1}`)
      .setVerticalAlignment("middle");
    fWorksheet
      .getRange(
        `A${topRow + BLOCK_ROW_AVAILABLE + 1}:${lastColLetter}${topRow + BLOCK_ROW_AVAILABLE + 1}`,
      )
      .setVerticalAlignment("middle");
    fWorksheet
      .getRange(`A${topRow + BLOCK_ROW_CLOSED + 1}:${lastColLetter}${topRow + BLOCK_ROW_CLOSED + 1}`)
      .setVerticalAlignment("middle");
    fWorksheet
      .getRange(`A${topRow + BLOCK_ROW_EVENTS + 1}:${lastColLetter}${topRow + BLOCK_ROW_EVENTS + 1}`)
      .setVerticalAlignment("top");
  }

  for (const { row, col, color } of built.dateColorCells) {
    const a1 = `${columnIndexToLetter(col)}${row + 1}`;
    fWorksheet.getRange(a1).setFontColor(color);
  }

  for (const { row, col } of built.availableRowCells) {
    const a1 = `${columnIndexToLetter(col)}${row + 1}`;
    const range = fWorksheet.getRange(a1);
    range.setFontColor(AVAILABLE_ROOM_COLOR);
    range.setFontSize(AVAILABLE_ROOM_FONT_SIZE);
    range.setWrap(false);
  }

  for (const { row, col } of built.closedRowCells) {
    const a1 = `${columnIndexToLetter(col)}${row + 1}`;
    const range = fWorksheet.getRange(a1);
    range.setFontColor(CLOSED_ROOM_COLOR);
    range.setFontSize(AVAILABLE_ROOM_FONT_SIZE);
    range.setWrap(false);
    range.setBackgroundColor(CLOSED_ROW_BACKGROUND);
  }

  for (const { row, col } of built.eventRowCells) {
    const a1 = `${columnIndexToLetter(col)}${row + 1}`;
    const range = fWorksheet.getRange(a1);
    range.setBackgroundColor(EVENT_ROW_BACKGROUND);
    range.setWrap(true);
  }

  for (const { topRow, bottomRow, col } of built.dayBlockRanges) {
    const colLetter = columnIndexToLetter(col);
    const a1 = `${colLetter}${topRow + 1}:${colLetter}${bottomRow + 1}`;
    fWorksheet
      .getRange(a1)
      .setBorder(BorderType.OUTSIDE, BorderStyleTypes.THIN, DAY_BLOCK_BORDER_COLOR);
  }
}

function formatParseIssues(issues: ParseIssue[]): string {
  if (issues.length === 0) return "";
  return issues
    .map((issue) => {
      const tokenPart = issue.token ? ` [${issue.token}]` : "";
      return `• ${issue.message}${tokenPart} — ${issue.line}`;
    })
    .join("\n");
}

export default function Dashboard() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const containerRef = useRef<HTMLDivElement>(null);
  const univerApiRef = useRef<ReturnType<typeof createUniver>["univerAPI"] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [parseIssues, setParseIssues] = useState<ParseIssue[]>([]);

  const handleParseIssues = useCallback((issues: ParseIssue[]) => {
    setParseIssues(issues);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadError(null);

      const { createSupabaseBrowserClient } = await import("@/lib/supabase");
      const supabase = createSupabaseBrowserClient();

      const roomsRes = await supabase
        .from("rooms")
        .select("code,sort_order,active")
        .order("sort_order");

      if (cancelled) return;

      if (roomsRes.error) {
        setLoadError(roomsRes.error.message);
      }
    }

    load().catch((e) => {
      if (cancelled) return;
      setLoadError(e instanceof Error ? e.message : String(e));
    });

    return () => {
      cancelled = true;
    };
  }, [year]);

  useEffect(() => {
    if (!containerRef.current) return;

    univerApiRef.current?.dispose();

    const bookingPluginConfig: CalendarBookingPluginConfig = {
      onParseIssues: handleParseIssues,
    };

    const { univerAPI } = createUniver({
      locale: LocaleType.KO_KR,
      locales: {
        [LocaleType.KO_KR]: mergeLocales(UniverPresetSheetsCoreKoKR),
      },
      presets: [
        UniverSheetsCorePreset({
          container: containerRef.current,
        }),
      ],
      plugins: [
        UniverSheetsAltColorShortcutsPlugin,
        [UniverSheetsCalendarBookingPlugin, bookingPluginConfig],
      ],
    });

    univerApiRef.current = univerAPI;

    const fWorkbook = univerAPI.createWorkbook({
      id: String(year),
      name: `${year}년`,
    });

    const allIssues: ParseIssue[] = [];

    for (let m = 1; m <= 12; m++) {
      const monthName = `${m}월`;
      const built = buildMonthSheetSkeleton(year, m);
      const fWorksheet = fWorkbook.create(
        monthName,
        built.rowCount,
        built.columnCount,
        { sheet: built.sheetSnapshot },
      );
      const sheetFacade = fWorksheet as unknown as CalendarSheetFacade;
      applyMonthSheetStyles(sheetFacade, built, univerAPI);

      const issues = syncAllEventRowsInSheet(
        univerAPI,
        fWorksheet,
        built.rowCount,
        built.columnCount,
      );
      allIssues.push(...issues);
    }

    setParseIssues(allIssues);

    return () => {
      univerAPI.dispose();
      univerApiRef.current = null;
    };
  }, [year, handleParseIssues]);

  return (
    <div className="flex flex-col h-screen bg-white text-slate-800 overflow-hidden">
      <div className="flex flex-col p-4 border-b border-slate-200 bg-slate-50 shrink-0 gap-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setYear((y) => y - 1)}
              className="p-1 hover:bg-slate-200 rounded"
              aria-label="이전 연도"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-xl font-bold w-24 text-center">{year}년</span>
            <button
              onClick={() => setYear((y) => y + 1)}
              className="p-1 hover:bg-slate-200 rounded"
              aria-label="다음 연도"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {loadError && (
            <div className="text-sm text-red-600 whitespace-pre-wrap">
              Supabase 데이터 로드 실패.
              {"\n"}
              {loadError}
            </div>
          )}
        </div>

        {parseIssues.length > 0 && (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3 whitespace-pre-wrap max-h-32 overflow-y-auto">
            <div className="font-semibold mb-1">행사 텍스트 인식 경고 ({parseIssues.length}건)</div>
            {formatParseIssues(parseIssues)}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
}

