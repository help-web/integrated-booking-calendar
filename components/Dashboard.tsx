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
