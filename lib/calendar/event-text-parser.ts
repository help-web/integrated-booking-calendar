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
