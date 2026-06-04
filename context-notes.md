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

