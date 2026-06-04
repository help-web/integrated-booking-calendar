// Univer Sheets로 월간 예약 캘린더를 렌더링하는 대시보드 컴포넌트입니다.
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreKoKR from "@univerjs/preset-sheets-core/locales/ko-KR";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";

const FALLBACK_ROOMS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "R1",
  "R2",
  "S1",
  "S2",
  "T",
  "P1",
  "P2",
  "V1",
  "V2",
  "U1",
  "U2",
];

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

  const roomCodes = useMemo(() => {
    if (rooms && rooms.length > 0) return rooms;
    return FALLBACK_ROOMS;
  }, [rooms]);

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
      const built = buildMonthSheetSkeleton(year, m);
      const fWorksheet = fWorkbook.create(
        monthName,
        built.rowCount,
        built.columnCount,
        { sheet: built.sheetSnapshot },
      );
      const sheetFacade = fWorksheet as {
        getRange: (a1: string) => {
          setFontColor: (color: string) => unknown;
          setBorder: (type: unknown, style: unknown, color?: string) => unknown;
        };
      };
      applyMonthDateColors(sheetFacade, built.dateColorCells);
      applyMonthDayBlockBorders(sheetFacade, built.dayBlockRanges, univerAPI);
    }

    return () => {
      univerAPI.dispose();
    };
  }, [year]);

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
/** CALENDAR_LAYOUT.md 블록 내부 행: 날짜·이용가능·마감·예약(2)·특이사항 */
const CALENDAR_BLOCK_ROW_COUNT = 6;
const BLOCK_ROW_DATE = 0;
const BLOCK_ROW_AVAILABLE = 1;
const BLOCK_ROW_CLOSED = 2;
const BLOCK_ROW_RESERVATION_START = 3;
const BLOCK_ROW_NOTES = 5;
const SATURDAY_DATE_COLOR = "#1d4ed8";
const SUNDAY_DATE_COLOR = "#dc2626";
const DAY_BLOCK_BORDER_COLOR = "#94a3b8";

type DateColorCell = {
  row: number;
  col: number;
  color: string;
};

type DayBlockRange = {
  topRow: number;
  bottomRow: number;
  col: number;
};

function buildMonthSheetSkeleton(year: number, month: number) {
  const weekCount = CALENDAR_WEEK_COUNT;
  const blockRowCount = CALENDAR_BLOCK_ROW_COUNT;
  const rowCount = 1 + weekCount * blockRowCount;
  const columnCount = 7;

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

  const cellData: Record<number, Record<number, { v: string }>> = {};
  const dateColorCells: DateColorCell[] = [];
  const dayBlockRanges: DayBlockRange[] = [];
  const rowData: Record<number, { h: number }> = { 0: { h: 28 } };

  for (let col = 0; col < 7; col++) {
    cellData[0] = cellData[0] ?? {};
    cellData[0][col] = { v: DAY_LABELS[col] };
  }

  let day = 1;
  for (let w = 0; w < weekCount; w++) {
    const topRow = 1 + w * blockRowCount;
    const bottomRow = topRow + blockRowCount - 1;

    for (let col = 0; col < 7; col++) {
      dayBlockRanges.push({ topRow, bottomRow, col });
    }

    rowData[topRow + BLOCK_ROW_DATE] = { h: 24 };
    rowData[topRow + BLOCK_ROW_AVAILABLE] = { h: 20 };
    rowData[topRow + BLOCK_ROW_CLOSED] = { h: 20 };
    for (let r = BLOCK_ROW_RESERVATION_START; r < BLOCK_ROW_NOTES; r++) {
      rowData[topRow + r] = { h: 22 };
    }
    rowData[topRow + BLOCK_ROW_NOTES] = { h: 22 };

    for (let dow = 0; dow < 7; dow++) {
      if (w === 0 && dow < startingDayOfWeek) continue;
      if (day > daysInMonth) continue;

      const dateRow = topRow + BLOCK_ROW_DATE;
      cellData[dateRow] = cellData[dateRow] ?? {};
      cellData[dateRow][dow] = { v: `${day}일 (${DAY_LABELS[dow]})` };

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
    defaultColumnWidth: 132,
    defaultRowHeight: 20,
    rowData,
  };

  return { rowCount, columnCount, sheetSnapshot, dateColorCells, dayBlockRanges };
}

function applyMonthDateColors(
  fWorksheet: { getRange: (a1: string) => { setFontColor: (color: string) => unknown } },
  dateColorCells: DateColorCell[],
) {
  for (const { row, col, color } of dateColorCells) {
    const a1 = `${columnIndexToLetter(col)}${row + 1}`;
    fWorksheet.getRange(a1).setFontColor(color);
  }
}

function applyMonthDayBlockBorders(
  fWorksheet: {
    getRange: (a1: string) => {
      setBorder: (type: unknown, style: unknown, color?: string) => unknown;
    };
  },
  dayBlockRanges: DayBlockRange[],
  univerAPI: ReturnType<typeof createUniver>["univerAPI"],
) {
  const { BorderType, BorderStyleTypes } = univerAPI.Enum;
  for (const { topRow, bottomRow, col } of dayBlockRanges) {
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
