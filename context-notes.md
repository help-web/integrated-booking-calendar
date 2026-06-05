# Context Notes

## 2026-06-02
- Supabase는 사용자 말대로 프로젝트 생성 및 `schema.sql` 실행이 완료된 상태로 진행한다.
- Next.js 관련 변경은 `node_modules/next/dist/docs/`를 기준으로 확인하면서 적용한다.
- 기존 메인 화면은 HTML `table`/`textarea` 기반이었고, Univer Sheets 프리셋 모드로 교체한다.
- 데이터 마이그레이션(체크리스트 1번)은 2027년부터 신규 운영이라 생략한다.

## 2026-06-04
- CALENDAR_LAYOUT.md 작업 순서 1번. 월별 시트는 요일 헤더 1행 + 주당 6행 블록 × 6주, 열 7개(월~일).
- 날짜 블록은 `mergeData`로 열별 세로 병합. 날짜 라벨만 `N일 (요일)` 형식, 토 `#1d4ed8`·일 `#dc2626`.
- 회의실·예약·아르바이트 표는 2단계 이후. Supabase 로드는 유지하되 시트에는 아직 반영하지 않음.

## 2026-06-04 (2)
- Univer locale `LocaleType.KO_KR` + `@univerjs/preset-sheets-core/locales/ko-KR` (공식 preset i18n 방식).
- 날짜 블록 세로 병합 제거. 주당 6행(날짜·이용가능·마감·예약×2·특이사항)을 각각 독립 셀, 열별 `OUTSIDE` 테두리로 블록 구분.

## 2026-06-04 (3) — CALENDAR_LAYOUT 2단계
- 요일 헤더 행 제거. 날짜 라벨에만 요일 표기.
- 시트 전체 `setVerticalAlignment('top')`. 빈 회의실=파랑·마감=빨강 (명세 수정 반영).
- 빈 회의실 행에 `DEFAULT_CALENDAR_ROOMS` 기본 표시, 마감 행은 예약 연동 전까지 비움.

## 2026-06-04 (4)
- 줄바꿈: `setWrapText` 없음 → 공식 API `setWrap(true)` + `setWrapStrategy(WrapStrategy.WRAP)`.
- 열 너비: `columnData[].w`·`setColumnWidths`·`ensurePositiveSize`로 0 이하 방지.

## 2026-06-04 (5)
- 마감 행 `setBackgroundColor('#f1f5f9')`, 빈 회의실 `setFontSize(7)` + `setWrap(false)`.
- 열 너비는 회의실 코드 한 줄 길이 기준 `setColumnWidths`·`columnData.w` (~537px).

## 2026-06-04 (6)
- 날짜 블록 2행(날짜·마감). 행 높이 150px — `rowData.h` + `setRowHeightsForced`.
- 마감 행 배경 `#E2E2D3` (`setBackgroundColor`). 빈 회의실 자동 채움은 제거(추가 행은 사용자 삽입).

## 2026-06-05
- CALENDAR_LAYOUT 2단계 복구. 블록 4행(날짜·이용가능·마감·행사).
- 이용 가능 회의실. `DEFAULT_CALENDAR_ROOM_LIST` 전체 목록, `setFontColor('#1d4ed8')` + `setFontSize(7)` + `setWrap(false)`.
- 마감 회의실. `setFontColor('#dc2626')` + `setBackgroundColor('#E2E2D3')` — 실제 날짜 셀의 마감 행에만 적용(빈 칸·행사 줄 제외).
- 행사 줄. `setBackgroundColor('#ffffff')` — 행사 텍스트가 들어가는 날짜 셀만.
- Univer 공식 Facade API. `setFontColor`·`setBackgroundColor`·`setWrap` (docs.univer.ai/reference/facade/range).

