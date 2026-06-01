// 엑셀형 행/열 자동 조절 및 우클릭 컨텍스트 메뉴 기능이 포함된 월간 캘린더 대시보드 컴포넌트입니다.
"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const ALL_ROOMS = [
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
const DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"];

interface RowData {
  id: string;
  data: Record<string, string>; // { "2026-06-01": "내용..." }
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  weekIndex: number;
  rowIndex: number;
}

export default function Dashboard() {
  const [year, setYear] = useState<number>(2026);
  const [month, setMonth] = useState<number>(6); // 1 ~ 12

  // 주차별 행 데이터 상태 관리 { weekIndex: RowData[] }
  const [weekRows, setWeekRows] = useState<Record<number, RowData[]>>({});

  // 컨텍스트 메뉴 및 클립보드 상태
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    weekIndex: -1,
    rowIndex: -1,
  });
  const [clipboardRow, setClipboardRow] = useState<RowData | null>(null);
  const [clipboardAction, setClipboardAction] = useState<"copy" | "cut" | null>(
    null,
  );

  // 현재 월의 주차 및 날짜 계산
  const weeks = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();

    const startingDayOfWeek =
      firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    let currentDay = 1;
    const weekArray = [];
    let weekIndex = 0;

    while (currentDay <= daysInMonth) {
      const weekDays = [];
      for (let i = 0; i < 7; i++) {
        if (weekIndex === 0 && i < startingDayOfWeek) {
          weekDays.push(null); // 이전 달 빈칸
        } else if (currentDay > daysInMonth) {
          weekDays.push(null); // 다음 달 빈칸
        } else {
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(currentDay).padStart(2, "0")}`;
          weekDays.push({
            dateObj: new Date(year, month - 1, currentDay),
            dateStr,
          });
          currentDay++;
        }
      }
      weekArray.push(weekDays);
      weekIndex++;
    }
    return weekArray;
  }, [year, month]);

  // 초기 렌더링 시 현재 월의 빈 행(Row) 생성
  useEffect(() => {
    const initialRows: Record<number, RowData[]> = {};
    weeks.forEach((_, idx) => {
      if (!weekRows[idx] || weekRows[idx].length === 0) {
        initialRows[idx] = [
          { id: `row_${Date.now()}_${idx}_0`, data: {} },
        ];
      } else {
        initialRows[idx] = weekRows[idx];
      }
    });
    setWeekRows((prev) => ({ ...prev, ...initialRows }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks]);

  // 컨텍스트 메뉴 닫기 (외부 클릭 시)
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible)
        setContextMenu((prev) => ({ ...prev, visible: false }));
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [contextMenu.visible]);

  // 셀 데이터 업데이트
  const handleCellChange = (
    wIdx: number,
    rIdx: number,
    dateStr: string,
    value: string,
  ) => {
    setWeekRows((prev) => {
      const newRows = [...(prev[wIdx] || [])];
      newRows[rIdx] = {
        ...newRows[rIdx],
        data: { ...newRows[rIdx].data, [dateStr]: value },
      };
      return { ...prev, [wIdx]: newRows };
    });
  };

  // 컨텍스트 메뉴 호출
  const handleRightClick = (
    e: React.MouseEvent,
    wIdx: number,
    rIdx: number,
  ) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.pageX,
      y: e.pageY,
      weekIndex: wIdx,
      rowIndex: rIdx,
    });
  };

  // 행(Row) 조작 함수들
  const addRow = (direction: "above" | "below") => {
    const { weekIndex, rowIndex } = contextMenu;
    setWeekRows((prev) => {
      const rows = [...(prev[weekIndex] || [])];
      const newRow = { id: `row_${Date.now()}`, data: {} };
      const targetIndex = direction === "above" ? rowIndex : rowIndex + 1;
      rows.splice(targetIndex, 0, newRow);
      return { ...prev, [weekIndex]: rows };
    });
  };

  const deleteRow = () => {
    const { weekIndex, rowIndex } = contextMenu;
    setWeekRows((prev) => {
      const rows = [...(prev[weekIndex] || [])];
      if (rows.length > 1) {
        rows.splice(rowIndex, 1);
      } else {
        rows[0] = { id: `row_${Date.now()}`, data: {} }; // 최소 1개 행 유지, 데이터만 초기화
      }
      return { ...prev, [weekIndex]: rows };
    });
  };

  const copyRow = (action: "copy" | "cut") => {
    const { weekIndex, rowIndex } = contextMenu;
    const rowToCopy = weekRows[weekIndex][rowIndex];
    setClipboardRow(rowToCopy);
    setClipboardAction(action);
  };

  const pasteRow = () => {
    if (!clipboardRow) return;
    const { weekIndex, rowIndex } = contextMenu;
    setWeekRows((prev) => {
      const rows = [...(prev[weekIndex] || [])];
      // 선택된 행을 클립보드 데이터로 덮어쓰기
      rows[rowIndex] = { ...rows[rowIndex], data: { ...clipboardRow.data } };
      return { ...prev, [weekIndex]: rows };
    });

    if (clipboardAction === "cut") {
      setClipboardRow(null);
      setClipboardAction(null);
    }
  };

  // 예약된 방 계산 (해당 날짜의 모든 행 텍스트 검사)
  const getUsedRooms = (wIdx: number, dateStr: string) => {
    const rows = weekRows[wIdx] || [];
    const combinedText = rows.map((r) => r.data[dateStr] || "").join(" ");
    return ALL_ROOMS.filter((room) => combinedText.includes(room));
  };

  return (
    <div className="flex flex-col h-screen bg-white text-slate-800 font-sans overflow-hidden">
      {/* 헤더 컨트롤 영역 */}
      <div className="flex items-center p-4 border-b border-slate-300 bg-slate-50 shrink-0 gap-8">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="p-1 hover:bg-slate-200 rounded"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-xl font-bold w-20 text-center">{year}년</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="p-1 hover:bg-slate-200 rounded"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="flex gap-1">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
            <button
              key={m}
              onClick={() => setMonth(m)}
              className={`w-10 h-10 rounded-full text-sm font-bold transition-colors ${month === m ? "bg-blue-600 text-white shadow-md" : "bg-transparent text-slate-600 hover:bg-slate-200"}`}
            >
              {m}월
            </button>
          ))}
        </div>
      </div>

      {/* 엑셀형 보드 스크롤 영역 */}
      <div className="flex-1 overflow-auto bg-slate-300 p-2">
        <div className="min-w-[1600px] flex flex-col gap-6">
          {weeks.map((week, wIdx) => {
            const rows = weekRows[wIdx] || [];

            return (
              <div
                key={wIdx}
                className="bg-white border border-slate-400 shadow-sm rounded-sm overflow-hidden"
              >
                <table className="w-full table-fixed border-collapse">
                  {/* 요일 및 날짜 헤더 */}
                  <thead>
                    <tr>
                      <th className="w-12 bg-slate-200 border-r border-b border-slate-300"></th>
                      {week.map((day, dIdx) => (
                        <th
                          key={dIdx}
                          className="border-b border-r border-slate-300 bg-slate-100 p-2 relative"
                        >
                          {day ? (
                            <div className="flex flex-col">
                              <div className="flex justify-between items-center mb-1">
                                <span
                                  className={`text-sm font-bold ${dIdx === 5 ? "text-blue-600" : dIdx === 6 ? "text-red-500" : "text-slate-700"}`}
                                >
                                  {day.dateObj.getDate()}일 ({DAY_NAMES[dIdx]}
                                  )
                                </span>
                              </div>

                              {/* 가용성 요약 (파란색: 가능, 빨간색: 예약됨) */}
                              <div className="flex flex-col gap-1 text-[10px] text-left">
                                @@@AVAILABLE_ROOMS@@@
                                <div className="text-blue-600 break-words leading-tight bg-blue-50 p-1 rounded">
                                  이용 가능:{" "}
                                  {ALL_ROOMS.filter(
                                    (r) =>
                                      !getUsedRooms(wIdx, day.dateStr).includes(
                                        r,
                                      ),
                                  ).join(", ")}
                                </div>
                                @@@BOOKED_ROOMS@@@
                                {getUsedRooms(wIdx, day.dateStr).length >
                                  0 && (
                                  <div className="text-red-600 font-bold break-words leading-tight bg-red-50 p-1 rounded">
                                    예약 완료:{" "}
                                    {getUsedRooms(wIdx, day.dateStr).join(", ")}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-slate-300 text-sm">빈 칸</div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  {/* 데이터 행(Row) */}
                  <tbody>
                    {rows.map((row, rIdx) => (
                      <tr key={row.id}>
                        {/* 좌측 번호 및 우클릭 영역 */}
                        <td
                          className="bg-slate-200 text-center text-xs text-slate-500 font-bold border-r border-b border-slate-300 cursor-context-menu hover:bg-slate-300 select-none"
                          onContextMenu={(e) =>
                            handleRightClick(e, wIdx, rIdx)
                          }
                        >
                          {rIdx + 1}
                        </td>

                        {/* 입력 셀들 */}
                        {week.map((day, dIdx) => (
                          <td
                            key={dIdx}
                            className={`border-r border-b border-slate-300 align-top ${!day ? "bg-slate-100/50" : ""}`}
                          >
                            {day && (
                              <textarea
                                value={row.data[day.dateStr] || ""}
                                onChange={(e) =>
                                  handleCellChange(
                                    wIdx,
                                    rIdx,
                                    day.dateStr,
                                    e.target.value,
                                  )
                                }
                                className="w-full h-full min-h-[100px] p-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 resize-y"
                                spellCheck={false}
                                placeholder="내용 입력..."
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>

      {/* 우클릭 컨텍스트 메뉴 */}
      {contextMenu.visible && (
        <div
          className="fixed bg-white border border-slate-200 shadow-xl rounded-md py-1 z-50 text-sm w-48 text-slate-700"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="w-full text-left px-4 py-2 hover:bg-slate-100"
            onClick={() => addRow("above")}
          >
            위에 행 1개 삽입
          </button>
          <button
            className="w-full text-left px-4 py-2 hover:bg-slate-100"
            onClick={() => addRow("below")}
          >
            아래에 행 1개 삽입
          </button>
          <div className="border-t border-slate-200 my-1"></div>
          <button
            className="w-full text-left px-4 py-2 hover:bg-slate-100"
            onClick={() => copyRow("cut")}
          >
            잘라내기
          </button>
          <button
            className="w-full text-left px-4 py-2 hover:bg-slate-100"
            onClick={() => copyRow("copy")}
          >
            복사
          </button>
          <button
            className="w-full text-left px-4 py-2 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!clipboardRow}
            onClick={pasteRow}
          >
            붙여넣기
          </button>
          <div className="border-t border-slate-200 my-1"></div>
          <button
            className="w-full text-left px-4 py-2 hover:bg-slate-100 text-red-600"
            onClick={deleteRow}
          >
            행 삭제
          </button>
        </div>
      )}
    </div>
  );
}
