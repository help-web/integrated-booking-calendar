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
