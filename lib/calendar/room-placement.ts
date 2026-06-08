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
