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
