// Univer Sheets로 월간 예약 캘린더를 렌더링하는 대시보드 컴포넌트입니다.
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreKoKR from "@univerjs/preset-sheets-core/locales/ko-KR";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";

const DEFAULT_CALENDAR_ROOM_LIST = [
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

const DISPLAY_TO_CODE: Record<string, string> = {
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

function formatRoomList(displays: readonly string[]) {
  return displays.join(", ");
}

type BookingRow = {
  id: string | number;
  title?: string | null;
};

type BookingRoomRow = {
  id: string | number;
  booking_id: string | number;
  room_id: string | number;
  use_date: string; // date (YYYY-MM-DD)
  start_time: string; // time
  end_time: string; // time
  active: boolean;
  room?: { code?: string | null } | null;
  booking?: { title?: string | null } | null;
};

export default function Dashboard() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const containerRef = useRef<HTMLDivElement>(null);
  const univerApiRef = useRef<ReturnType<typeof createUniver>["univerAPI"] | null>(
    null,
  );

  const [rooms, setRooms] = useState<string[] | null>(null);
  const [bookingRooms, setBookingRooms] = useState<BookingRoomRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const byBookingIdRooms = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const br of bookingRooms ?? []) {
      const id = String(br.booking_id);
      const code = br.room?.code ?? null;
      if (!code) continue;
      const prev = map.get(id) ?? [];
      if (!prev.includes(code)) prev.push(code);
      map.set(id, prev);
    }
    return map;
  }, [bookingRooms]);

  const byDateUsedRooms = useMemo(() => {
    const used = new Map<string, Set<string>>();
    for (const br of bookingRooms ?? []) {
      if (!br.active) continue;
      const dateKey = br.use_date;
      const roomsForBooking = byBookingIdRooms.get(String(br.booking_id)) ?? [];
      if (!used.has(dateKey)) used.set(dateKey, new Set());
      const set = used.get(dateKey)!;
      roomsForBooking.forEach((r) => set.add(r));
    }
    return used;
  }, [bookingRooms, byBookingIdRooms]);

  const byDateEvents = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const br of bookingRooms ?? []) {
      if (!br.active) continue;
      const dateKey = br.use_date;
      const title = br.booking?.title ?? "예약";
      const room = br.room?.code ?? "?";
      const line = `${title} (${br.start_time}-${br.end_time}) [${room}]`;

      const prev = map.get(dateKey) ?? [];
      prev.push(line);
      map.set(dateKey, prev);
    }
    return map;
  }, [bookingRooms]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadError(null);

      const { createSupabaseBrowserClient } = await import("@/lib/supabase");
      const supabase = createSupabaseBrowserClient();

      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const [roomsRes, bookingRoomsRes] = await Promise.all([
        supabase.from("rooms").select("code,sort_order,active").order("sort_order"),
        supabase
          .from("booking_rooms")
          .select(
            "id,booking_id,room_id,use_date,start_time,end_time,active,room:rooms(code),booking:bookings(title)",
          )
          .gte("use_date", startDate)
          .lte("use_date", endDate),
      ]);

      if (cancelled) return;

      if (roomsRes.error || bookingRoomsRes.error) {
        setLoadError(
          [roomsRes.error?.message, bookingRoomsRes.error?.message]
            .filter(Boolean)
            .join("\n"),
        );
        setRooms(null);
        setBookingRooms(null);
        return;
      }

      setRooms(
        (roomsRes.data ?? [])
          .filter((r: { active: boolean }) => r.active)
          .map((r: { code: string }) => r.code),
      );
      setBookingRooms((bookingRoomsRes.data ?? []) as BookingRoomRow[]);
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
    });

    univerApiRef.current = univerAPI;

    const fWorkbook = univerAPI.createWorkbook({
      id: String(year),
      name: `${year}년`,
    });
    for (let m = 1; m <= 12; m++) {
      const monthName = `${m}월`;
      const built = buildMonthSheetSkeleton(year, m, {
        byDateUsedRooms,
        byDateEvents,
      });
      const fWorksheet = fWorkbook.create(
        monthName,
        built.rowCount,
        built.columnCount,
        { sheet: built.sheetSnapshot },
      );
      const sheetFacade = fWorksheet as unknown as CalendarSheetFacade;
      applyMonthSheetStyles(sheetFacade, built, univerAPI);
    }

    return () => {
      univerAPI.dispose();
    };
  }, [year, byDateUsedRooms, byDateEvents]);

  return (
    <div className="flex flex-col h-screen bg-white text-slate-800 overflow-hidden">
      <div className="flex items-center p-4 border-b border-slate-200 bg-slate-50 shrink-0 gap-4">
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

      <div className="flex-1 overflow-hidden">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
}

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"] as const;
const CALENDAR_WEEK_COUNT = 6;
/** 날짜 블록 4행: 날짜(0)·이용가능(1)·마감(2)·행사(3). 추가 행은 사용자가 직접 삽입 */
const CALENDAR_BLOCK_ROW_COUNT = 4;
const CALENDAR_BLOCK_ROW_HEIGHT = 150;
const BLOCK_ROW_DATE = 0;
const BLOCK_ROW_AVAILABLE = 1;
const BLOCK_ROW_CLOSED = 2;
const BLOCK_ROW_EVENTS = 3;
const AVAILABLE_ROOM_COLOR = "#1d4ed8";
const CLOSED_ROOM_COLOR = "#dc2626";
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

type MonthSheetData = {
  byDateUsedRooms: Map<string, Set<string>>;
  byDateEvents: Map<string, string[]>;
};

function buildMonthSheetSkeleton(year: number, month: number, data: MonthSheetData) {
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
  const blockRowHeight = ensurePositiveSize(CALENDAR_BLOCK_ROW_HEIGHT);
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

    for (let blockRow = 0; blockRow < blockRowCount; blockRow++) {
      rowData[topRow + blockRow] = { h: blockRowHeight };
    }

    for (let dow = 0; dow < 7; dow++) {
      if (w === 0 && dow < startingDayOfWeek) continue;
      if (day > daysInMonth) continue;

      const dateRow = topRow + BLOCK_ROW_DATE;
      const availableRow = topRow + BLOCK_ROW_AVAILABLE;
      const closedRow = topRow + BLOCK_ROW_CLOSED;
      const eventRow = topRow + BLOCK_ROW_EVENTS;
      const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const usedCodes = data.byDateUsedRooms.get(dateKey) ?? new Set<string>();

      const closedDisplays = DEFAULT_CALENDAR_ROOM_LIST.filter((display) =>
        usedCodes.has(DISPLAY_TO_CODE[display] ?? display),
      );
      const availableDisplays =
        usedCodes.size === 0
          ? DEFAULT_CALENDAR_ROOM_LIST
          : DEFAULT_CALENDAR_ROOM_LIST.filter(
              (display) => !usedCodes.has(DISPLAY_TO_CODE[display] ?? display),
            );
      const events = data.byDateEvents.get(dateKey) ?? [];

      cellData[dateRow] = cellData[dateRow] ?? {};
      cellData[dateRow][dow] = { v: `${day}일 (${DAY_LABELS[dow]})` };

      cellData[availableRow] = cellData[availableRow] ?? {};
      cellData[availableRow][dow] = { v: formatRoomList(availableDisplays) };

      cellData[closedRow] = cellData[closedRow] ?? {};
      cellData[closedRow][dow] = { v: formatRoomList(closedDisplays) };

      cellData[eventRow] = cellData[eventRow] ?? {};
      if (events.length > 0) {
        cellData[eventRow][dow] = { v: events.join("\n") };
      }

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
    defaultRowHeight: blockRowHeight,
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
  const blockRowHeight = ensurePositiveSize(CALENDAR_BLOCK_ROW_HEIGHT);
  const columnWidth = ensurePositiveSize(CALENDAR_COLUMN_WIDTH);

  fWorksheet.setColumnWidths(0, built.columnCount, columnWidth);
  fWorksheet.setRowHeightsForced(0, built.rowCount, blockRowHeight);
  fWorksheet.getRange(built.calendarA1).setVerticalAlignment("top");

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
    range.setBackgroundColor(CLOSED_ROW_BACKGROUND);
  }

  for (const { row, col } of built.eventRowCells) {
    const a1 = `${columnIndexToLetter(col)}${row + 1}`;
    fWorksheet.getRange(a1).setBackgroundColor(EVENT_ROW_BACKGROUND);
  }

  for (const { topRow, bottomRow, col } of built.dayBlockRanges) {
    const colLetter = columnIndexToLetter(col);
    const a1 = `${colLetter}${topRow + 1}:${colLetter}${bottomRow + 1}`;
    fWorksheet
      .getRange(a1)
      .setBorder(BorderType.OUTSIDE, BorderStyleTypes.THIN, DAY_BLOCK_BORDER_COLOR);
  }
}

function columnIndexToLetter(index: number) {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}
