// 달력에 표시되는 회의실 코드·통합룸 매핑·표시 형식 변환을 정의합니다.

export const DEFAULT_CALENDAR_ROOM_LIST = [
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

export type RoomDisplay = (typeof DEFAULT_CALENDAR_ROOM_LIST)[number];

/** DB 코드 → 달력 표시명 */
export const DISPLAY_TO_CODE: Record<string, string> = {
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

/** 통합룸 키워드 → 구성 단위룸(표시명) */
export const INTEGRATED_ROOM_MAP: Record<string, readonly RoomDisplay[]> = {
  P통합: ["P-1", "P-2"],
  R통합: ["R-1", "R-2"],
  S통합: ["S-1", "S-2"],
  U통합: ["U-1", "U-2"],
  K통합: ["K"],
  L통합: ["L"],
};

const INTEGRATED_ROOM_KEYS = Object.keys(INTEGRATED_ROOM_MAP).sort(
  (a, b) => b.length - a.length,
);

const DISPLAY_SET = new Set<string>(DEFAULT_CALENDAR_ROOM_LIST);
const CODE_TO_DISPLAY: Record<string, RoomDisplay> = {};

for (const display of DEFAULT_CALENDAR_ROOM_LIST) {
  CODE_TO_DISPLAY[display] = display;
  const code = DISPLAY_TO_CODE[display];
  if (code) CODE_TO_DISPLAY[code] = display;
}

export function isKnownRoomDisplay(value: string): value is RoomDisplay {
  return DISPLAY_SET.has(value);
}

export function normalizeRoomToken(token: string): RoomDisplay | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  if (isKnownRoomDisplay(trimmed)) return trimmed;

  const mapped = CODE_TO_DISPLAY[trimmed];
  if (mapped) return mapped;

  return null;
}

export function expandIntegratedRoomKeyword(keyword: string): readonly RoomDisplay[] | null {
  const rooms = INTEGRATED_ROOM_MAP[keyword];
  return rooms ?? null;
}

export function extractIntegratedRoomsFromText(text: string): RoomDisplay[] {
  const found: RoomDisplay[] = [];
  let remaining = text;

  for (const keyword of INTEGRATED_ROOM_KEYS) {
    if (!remaining.includes(keyword)) continue;
    found.push(...INTEGRATED_ROOM_MAP[keyword]);
    remaining = remaining.split(keyword).join(" ");
  }

  return found;
}

export function formatRoomList(displays: readonly string[]) {
  return displays.join(", ");
}
