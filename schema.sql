-- 회의실 예약/근무 캘린더의 Supabase(PostgreSQL) 스키마. 테이블·제약·시드를 한 파일에 정의한다.
-- 실행 방법. Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여넣고 Run 한다. (Cursor가 아니라 Supabase에서 실행한다.)
-- 설계 원칙. 핵심 데이터는 정규 테이블에 두고, 빈/마감 회의실 색상 같은 "표현"은 데이터에서 파생시킨다. 폴더 URL·주차지원여부는 웹앱에서 제외한다.

-- 시간 범위 겹침을 막는 EXCLUDE 제약에 필요한 확장.
create extension if not exists btree_gist;

-- =========================================================
-- 공통. updated_at 자동 갱신 트리거 함수
-- =========================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- 1. customers. 고객 명함 DB (기존 '고객DM' 시트를 대체한다)
-- =========================================================
create table customers (
  id         bigint generated always as identity primary key,
  name       text not null,            -- 성명
  org        text,                     -- 기관명
  dept       text,                     -- 부서명
  mobile     text,                     -- 휴대폰
  office     text,                     -- 사무실 전화
  email      text,                     -- 이메일
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_customers_name on customers (name);
create index idx_customers_org  on customers (org);
create trigger trg_customers_updated_at
  before update on customers
  for each row execute function set_updated_at();

-- =========================================================
-- 2. rooms. 회의실 마스터. 단위룸과 통합룸을 함께 보관한다.
--    예약 슬롯(booking_rooms)에는 '단위룸'만 저장한다. 통합룸 선택 시 앱이 구성 단위룸으로 펼쳐 넣는다.
-- =========================================================
create table rooms (
  id          bigint generated always as identity primary key,
  code        text not null unique,    -- A, B, U1, U(=통합) 등
  name        text,
  floor       int,                     -- 층. 확인 후 채운다.
  capacity    int,                     -- 수용 인원. 확인 후 채운다.
  is_combined boolean not null default false,  -- 통합룸 여부
  active      boolean not null default true,
  sort_order  int not null default 0
);

-- 통합룸이 어떤 단위룸들로 구성되는지 매핑한다. (예. U = U1 + U2)
create table room_components (
  combined_room_id bigint not null references rooms(id) on delete cascade,
  unit_room_id     bigint not null references rooms(id) on delete cascade,
  primary key (combined_room_id, unit_room_id)
);

-- =========================================================
-- 3. bookings. 행사(예약) 단위. 한 행사가 여러 회의실·여러 날짜를 쓸 수 있다.
-- =========================================================
create table bookings (
  id           bigint generated always as identity primary key,
  title        text,                   -- 행사명. 미정/비공개 가능하므로 null 허용.
  client_org   text,                   -- 고객사/기관명 (빠른 입력용)
  contact_name text,                   -- 담당자명 (빠른 입력용)
  customer_id  bigint references customers(id) on delete set null,  -- 연결된 명함(선택)
  status       text not null default '문의',  -- 문의/견적/계약완료/카드결제완료/예약확정/취소
  headcount    int,                    -- 인원
  note         text,                   -- 행사 준비사항 등 (기존 메모 대체)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_bookings_status on bookings (status);
create trigger trg_bookings_updated_at
  before update on bookings
  for each row execute function set_updated_at();

-- =========================================================
-- 4. booking_rooms. 실제 예약 슬롯. 회의실 + 날짜 + 시간.
--    여기서 회의실 중복예약을 DB가 자동으로 막는다.
-- =========================================================
create table booking_rooms (
  id         bigint generated always as identity primary key,
  booking_id bigint not null references bookings(id) on delete cascade,
  room_id    bigint not null references rooms(id),
  use_date   date not null,
  start_time time not null,
  end_time   time not null,
  active     boolean not null default true,  -- 취소/홀드 시 false. false면 중복예약 검사 대상에서 빠진다.
  -- 날짜+시간을 시간범위로 만들어 둔다. (immutable 식이라 generated stored 가능)
  during     tsrange generated always as
               (tsrange(use_date + start_time, use_date + end_time, '[)')) stored,
  check (end_time > start_time)
);
-- 같은 회의실에서 시간이 겹치는 활성 예약을 금지한다. (중복예약 자동 차단의 핵심)
alter table booking_rooms
  add constraint no_double_booking
  exclude using gist (room_id with =, during with &&)
  where (active);
create index idx_booking_rooms_date on booking_rooms (use_date);
create index idx_booking_rooms_booking on booking_rooms (booking_id);

-- =========================================================
-- 5. service_items / booking_services. 유료서비스.
-- =========================================================
create table service_items (
  id     bigint generated always as identity primary key,
  code   text unique,        -- 노, 커, 샌드 등 약어
  name   text not null,      -- 노트북, 커피, 샌드위치 등
  unit   text default '개',   -- 수량 단위
  active boolean not null default true
);

create table booking_services (
  id             bigint generated always as identity primary key,
  booking_id     bigint not null references bookings(id) on delete cascade,
  item_id        bigint not null references service_items(id),
  quantity       numeric not null default 0,
  scheduled_time time,                  -- 준비 시각 (예. 오후 4시)
  note           text
);
create index idx_booking_services_booking on booking_services (booking_id);

-- =========================================================
-- 6. contact_logs. 컨택 이력. 날짜별 누적 (기존 [12.24] 형식 메모 대체)
-- =========================================================
create table contact_logs (
  id         bigint generated always as identity primary key,
  booking_id bigint not null references bookings(id) on delete cascade,
  log_date   date not null,
  content    text not null,
  created_at timestamptz not null default now()
);
create index idx_contact_logs_booking on contact_logs (booking_id, log_date);

-- =========================================================
-- 7. staff. 아르바이트
-- =========================================================
create table staff (
  id     bigint generated always as identity primary key,
  name   text not null,
  phone  text,
  active boolean not null default true,
  note   text
);

-- =========================================================
-- 8. shifts. 일자별 근무. 한 사람당 하루 한 행(가용/확정)을 기록한다.
-- =========================================================
create table shifts (
  id         bigint generated always as identity primary key,
  staff_id   bigint not null references staff(id) on delete cascade,
  work_date  date not null,
  status     text not null default '미정',  -- 가능/불가/미정/확정/휴무
  start_time time,
  end_time   time,
  booking_id bigint references bookings(id) on delete set null,  -- 배정된 행사(선택)
  note       text,
  unique (staff_id, work_date)
);
create index idx_shifts_date on shifts (work_date);

-- =========================================================
-- 9. day_notes. 행사 외 일자별 특이사항 (신정, 연차, 알바공고, 알바면접 등)
-- =========================================================
create table day_notes (
  id         bigint generated always as identity primary key,
  note_date  date not null,
  content    text not null,
  created_at timestamptz not null default now()
);
create index idx_day_notes_date on day_notes (note_date);

-- =========================================================
-- 시드. 회의실 목록 (기존 시트의 코드 기준). 층/수용인원은 확인 후 채운다.
-- =========================================================
insert into rooms (code, name, is_combined, sort_order) values
  ('A','A',false,10), ('B','B',false,20), ('C','C',false,30),
  ('E','E',false,40), ('F','F',false,50), ('J','J',false,60),
  ('D','D',false,70), ('K','K',false,80), ('L','L',false,90),
  ('M','M',false,100),('N','N',false,110),('O','O',false,120),
  ('T','T',false,130),
  ('R1','R-1',false,140),('R2','R-2',false,150),('R','R통합',true,160),
  ('S1','S-1',false,170),('S2','S-2',false,180),('S','S통합',true,190),
  ('P1','P-1',false,200),('P2','P-2',false,210),('P','P통합',true,220),
  ('U1','U-1',false,230),('U2','U-2',false,240),('U','U통합',true,250),
  ('V1','V-1',false,260),('V2','V-2',false,270),('V3','V-3',false,280),
  ('W1','W-1',false,290),('W2','W-2',false,300),('W3','W-3',false,310);

-- 통합룸 구성 매핑. (V, W는 통합 단위가 없어 제외했다. 필요하면 추가한다.)
insert into room_components (combined_room_id, unit_room_id)
select c.id, u.id from rooms c, rooms u
where (c.code='R' and u.code in ('R1','R2'))
   or (c.code='S' and u.code in ('S1','S2'))
   or (c.code='P' and u.code in ('P1','P2'))
   or (c.code='U' and u.code in ('U1','U2'));

-- 시드. 유료서비스 항목 (기존 시트에서 보이던 항목들)
insert into service_items (code, name, unit) values
  ('노','노트북','대'),
  ('커','커피','잔'),
  ('다과','다과','세트'),
  ('샌드','샌드위치','개'),
  ('컵과일','컵과일','개'),
  ('화상','화상장비','대'),
  ('유마','유선마이크','개'),
  ('컬프','컬러출력','장');

-- =========================================================
-- RLS. 일단 로그인 사용자(authenticated) 전체 허용으로 시작한다.
--      추후 직원/아르바이트 역할 분리는 정책을 좁혀서 적용한다.
-- =========================================================
alter table customers        enable row level security;
alter table rooms            enable row level security;
alter table room_components  enable row level security;
alter table bookings         enable row level security;
alter table booking_rooms    enable row level security;
alter table service_items    enable row level security;
alter table booking_services enable row level security;
alter table contact_logs     enable row level security;
alter table staff            enable row level security;
alter table shifts           enable row level security;
alter table day_notes        enable row level security;

create policy "auth full" on customers        for all to authenticated using (true) with check (true);
create policy "auth full" on rooms            for all to authenticated using (true) with check (true);
create policy "auth full" on room_components  for all to authenticated using (true) with check (true);
create policy "auth full" on bookings         for all to authenticated using (true) with check (true);
create policy "auth full" on booking_rooms    for all to authenticated using (true) with check (true);
create policy "auth full" on service_items    for all to authenticated using (true) with check (true);
create policy "auth full" on booking_services for all to authenticated using (true) with check (true);
create policy "auth full" on contact_logs     for all to authenticated using (true) with check (true);
create policy "auth full" on staff            for all to authenticated using (true) with check (true);
create policy "auth full" on shifts           for all to authenticated using (true) with check (true);
create policy "auth full" on day_notes        for all to authenticated using (true) with check (true);
