// 프로그램적 회의실 동기화 중 SheetValueChanged 재진입을 막는 가드입니다.

let suppressDepth = 0;

export function isCalendarSyncSuppressed(): boolean {
  return suppressDepth > 0;
}

export function runWithCalendarSyncSuppress<T>(fn: () => T): T {
  suppressDepth += 1;
  try {
    return fn();
  } finally {
    suppressDepth -= 1;
  }
}
