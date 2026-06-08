// 행사 셀 텍스트에서 시스템 인식 줄(-)을 파싱해 회의실·유료서비스·계약 상태를 추출합니다.

import {
  expandIntegratedRoomKeyword,
  extractIntegratedRoomsFromText,
  normalizeRoomToken,
  type RoomDisplay,
} from "./room-codes";
import {
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

function splitEventBlocks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function parseEventBlock(blockText: string): ParsedEventBlock {
  const lines = blockText.split("\n").map((line) => line.trimEnd());
  const issues: ParseIssue[] = [];
  const systemLines: ParsedSystemLine[] = [];
  let status: ContractStatus | null = null;

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

  const statusText = formatStatusForBlock(status);
  const lines = blocks[blockIndex].split("\n");
  const statusLineIndex = lines.findIndex((line) => isStatusLine(line.trim()));

  if (statusLineIndex >= 0) {
    lines[statusLineIndex] = statusText;
  } else {
    const insertAt = lines.findIndex(
      (line) => line.trim() && !line.trim().startsWith("-") && !line.trim().startsWith(">"),
    );
    if (insertAt >= 0) {
      lines.splice(insertAt + 1, 0, statusText);
    } else {
      lines.unshift(statusText);
    }
  }

  blocks[blockIndex] = lines.join("\n");
  return blocks.join("\n\n");
}

function looksLikeRoomCode(token: string): boolean {
  if (/통합$/.test(token)) return true;
  if (/^[A-Z](?:-\d+)?$/i.test(token)) return true;
  if (/^[A-Z]\d$/i.test(token)) return true;
  return false;
}

function formatStatusForBlock(status: ContractStatus): string {
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

export function getCellPlainText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object" && value !== null && "toPlainText" in value) {
    const plain = (value as { toPlainText: () => string }).toPlainText();
    return typeof plain === "string" ? plain : "";
  }
  return String(value);
}
