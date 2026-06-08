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

export function computeDayRoomsFromEventText(eventText: string): DayRoomSnapshot {
  const parsed = parseEventCellText(eventText);
  const issues: ParseIssue[] = [...parsed.issues];
  const paidServices: string[] = [];

  let placement: RoomPlacementSets = {
    availableBlue: [...DEFAULT_CALENDAR_ROOM_LIST],
    availableGreen: [],
    closedRed: [],
  };

  for (const block of parsed.blocks) {
    paidServices.push(...block.paidServices);

    if (block.usedRooms.length === 0) continue;

    const blockPlacement = placementForStatus(block.status);
    placement = mergeRoomPlacement(placement, block.usedRooms, blockPlacement);
  }

  return {
    availableBlue: sortRoomsByDefaultOrder(placement.availableBlue, DEFAULT_CALENDAR_ROOM_LIST),
    availableGreen: sortRoomsByDefaultOrder(placement.availableGreen, DEFAULT_CALENDAR_ROOM_LIST),
    closedRed: sortRoomsByDefaultOrder(placement.closedRed, DEFAULT_CALENDAR_ROOM_LIST),
    paidServices,
    issues,
  };
}

export function formatClosedRoomText(closedRooms: readonly RoomDisplay[]): string {
  return formatRoomList(closedRooms);
}
