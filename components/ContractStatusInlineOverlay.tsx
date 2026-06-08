// 행사 셀 우상단(첫 줄 높이)에 계약 상태 버튼·드롭다운을 그립니다.
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { FUniver } from "@univerjs/core/facade";
import type { FRange } from "@univerjs/sheets/facade";
import {
  contractStatusBadgeLabel,
  resolvePrimaryCellContractStatus,
} from "@/lib/calendar/cell-contract-status";
import {
  backgroundColorForStatus,
  CONTRACT_STATUS_OPTIONS,
  type ContractStatusKind,
} from "@/lib/calendar/contract-status";
import { readEventCellText } from "@/lib/calendar/cell-text";
import { countEventBlocks } from "@/lib/calendar/event-text-parser";
import {
  BLOCK_ROW_EVENTS,
  CALENDAR_BLOCK_ROW_COUNT,
} from "@/lib/calendar/grid";
import { getUniverAPIRef } from "@/lib/univer/univer-api-ref";

type RangeWithCellRect = FRange & {
  getCellRect: () => DOMRect;
};

type ButtonPlacement = {
  key: string;
  row: number;
  col: number;
  left: number;
  top: number;
  label: string;
  background: string;
  hasStatus: boolean;
};

type ContractStatusInlineOverlayProps = {
  univerAPI: FUniver | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  refreshToken: number;
};

const STATUS_BUTTON_WIDTH = 52;
const EMPTY_BOX_SIZE = 14;
const CELL_TOP_PADDING = 4;
const CELL_RIGHT_PADDING = 4;

function contractStatusCommandId(kind: ContractStatusKind) {
  return `calendar.command.set-contract-status.${kind}`;
}

function todayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function optionLabel(option: (typeof CONTRACT_STATUS_OPTIONS)[number]) {
  if (!option.needsDate) return option.label;
  return `${option.label}(${todayDateString()})`;
}

function collectButtons(univerAPI: FUniver, container: HTMLDivElement): ButtonPlacement[] {
  const fWorkbook = univerAPI.getActiveWorkbook();
  const fWorksheet = fWorkbook?.getActiveSheet();
  if (!fWorksheet) return [];

  const containerRect = container.getBoundingClientRect();
  const rowCount = fWorksheet.getMaxRows();
  const columnCount = fWorksheet.getMaxColumns();
  const buttons: ButtonPlacement[] = [];

  for (let row = BLOCK_ROW_EVENTS; row < rowCount; row += CALENDAR_BLOCK_ROW_COUNT) {
    for (let col = 0; col < columnCount; col++) {
      const range = fWorksheet.getRange(row, col) as RangeWithCellRect;

      let rect: DOMRect;
      try {
        rect = range.getCellRect();
      } catch {
        continue;
      }

      if (rect.width <= 0 || rect.height <= 0) continue;

      const text = readEventCellText(range);
      const blockCount = Math.max(countEventBlocks(text), 1);
      const status = resolvePrimaryCellContractStatus(range, blockCount);
      const hasStatus = status != null;
      const label = status ? contractStatusBadgeLabel(status) : "";
      const buttonWidth = hasStatus ? STATUS_BUTTON_WIDTH : EMPTY_BOX_SIZE;

      const cellLeft = rect.left - containerRect.left;
      const cellTop = rect.top - containerRect.top;
      const cellRight = rect.right - containerRect.left;

      buttons.push({
        key: `${row}-${col}`,
        row,
        col,
        left: cellRight - buttonWidth - CELL_RIGHT_PADDING,
        top: cellTop + CELL_TOP_PADDING,
        label,
        background: backgroundColorForStatus(status),
        hasStatus,
      });
    }
  }

  return buttons;
}

function StatusDropdown({
  placement,
  onClose,
}: {
  placement: ButtonPlacement;
  onClose: () => void;
}) {
  const univerAPI = getUniverAPIRef();

  const applyStatus = async (kind: ContractStatusKind) => {
    if (!univerAPI) return;
    await univerAPI.getActiveWorkbook()?.endEditingAsync(true);
    await univerAPI.executeCommand(contractStatusCommandId(kind), {
      kind,
      row: placement.row,
      col: placement.col,
      blockIndex: 0,
    });
    onClose();
  };

  return (
    <div
      className="absolute z-[200] min-w-[10rem] rounded border border-slate-200 bg-white py-1 shadow-lg"
      style={{ left: placement.left, top: placement.top + 16 }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {CONTRACT_STATUS_OPTIONS.map((option) => (
        <button
          key={option.kind}
          type="button"
          className="block w-full px-2 py-1 text-left text-[11px] hover:bg-slate-100"
          onClick={() => {
            void applyStatus(option.kind);
          }}
        >
          {optionLabel(option)}
        </button>
      ))}
    </div>
  );
}

export function ContractStatusInlineOverlay({
  univerAPI,
  containerRef,
  refreshToken,
}: ContractStatusInlineOverlayProps) {
  const [buttons, setButtons] = useState<ButtonPlacement[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    const container = containerRef.current;
    if (!univerAPI || !container) {
      setButtons([]);
      return;
    }
    setButtons(collectButtons(univerAPI, container));
  }, [containerRef, univerAPI]);

  const scheduleRefresh = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      refresh();
    });
  }, [refresh]);

  const closeDropdown = useCallback(() => {
    setOpenKey(null);
    scheduleRefresh();
  }, [scheduleRefresh]);

  useEffect(() => {
    scheduleRefresh();
  }, [scheduleRefresh, refreshToken]);

  useEffect(() => {
    if (!univerAPI) return;

    const disposables = [
      univerAPI.addEvent(univerAPI.Event.ActiveSheetChanged, scheduleRefresh),
      univerAPI.addEvent(univerAPI.Event.SheetValueChanged, scheduleRefresh),
      univerAPI.addEvent(univerAPI.Event.SheetEditEnded, scheduleRefresh),
    ];

    const sheetsUiEvent = univerAPI.Event as typeof univerAPI.Event & { Scroll?: "Scroll" };
    if (sheetsUiEvent.Scroll) {
      disposables.push(
        univerAPI.addEvent(sheetsUiEvent.Scroll, scheduleRefresh as () => void),
      );
    }

    const container = containerRef.current;
    const onResize = () => scheduleRefresh();
    window.addEventListener("resize", onResize);
    container?.addEventListener("scroll", onResize, true);

    return () => {
      disposables.forEach((item) => item.dispose());
      window.removeEventListener("resize", onResize);
      container?.removeEventListener("scroll", onResize, true);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef, scheduleRefresh, univerAPI]);

  useEffect(() => {
    if (!openKey) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (overlayRef.current?.contains(target)) return;
      closeDropdown();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDropdown();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeDropdown, openKey]);

  if (!univerAPI || buttons.length === 0) return null;

  const openPlacement = buttons.find((button) => button.key === openKey) ?? null;

  return (
    <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      {buttons.map((button) => (
        <button
          key={button.key}
          type="button"
          className={
            button.hasStatus
              ? "pointer-events-auto absolute max-w-[3.25rem] truncate rounded border border-slate-400 px-0.5 py-0 text-[10px] font-medium leading-4 text-slate-800"
              : "pointer-events-auto absolute h-3.5 w-3.5 rounded-sm border border-slate-500 bg-white"
          }
          style={{
            left: button.left,
            top: button.top,
            backgroundColor: button.hasStatus ? button.background : "#ffffff",
          }}
          title={button.hasStatus ? button.label : "계약 상태 선택"}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setOpenKey((current) => (current === button.key ? null : button.key));
          }}
        >
          {button.hasStatus ? button.label : null}
        </button>
      ))}

      {openPlacement && (
        <StatusDropdown placement={openPlacement} onClose={closeDropdown} />
      )}
    </div>
  );
}
