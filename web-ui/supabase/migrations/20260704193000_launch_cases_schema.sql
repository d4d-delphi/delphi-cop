-- Layer 2+ 스키마: 과거 미사일 발사사례 지식 베이스
-- 근거: docs/DATASET-SCHEMA.md §5 (발사사례 매칭/weapon_class/outcome는 Layer 1 observation이 아닌
--       Layer 2+ 에서 관리). observation(Layer 1 첩보)과 공존.
-- 데이터 출처: CNS North Korea Missile Test Database (CSV) + nagix/nk-missile-tests (bearing/착탄지 계산).
-- 참고: 과거 20260704071600_init_nl_cop_schema.sql 의 historical_cases(embedding vector(1536)) 설계 계승,
--       CNS 실데이터에 맞춰 궤적/물리 필드(apogee/distance/bearing/landing) 확장.

create extension if not exists pgcrypto;
create extension if not exists vector;

-- =========================================================
-- launch_facilities — 발사 시설 마스터 (CNS Facilities.csv)
-- =========================================================
create table if not exists launch_facilities (
  facility_id           uuid primary key default gen_random_uuid(),
  facility_name         text not null unique,        -- CNS "Facility" 명칭 (정규화)
  facility_name_raw     text,                        -- CNS 원문 그대로
  region                text,                        -- 도/지역
  lat                   double precision,
  lng                   double precision,
  first_test_date       date,
  most_recent_test_date date,
  number_of_tests       integer,
  created_at            timestamptz not null default now()
);
comment on table launch_facilities is 'launch_facilities — 북한 미사일 발사 시설 마스터 (CNS)';

-- =========================================================
-- launch_cases — 발사사례 1건 (CNS Missile Tests.csv + nagix bearing/landing)
-- =========================================================
create type launch_weapon_class as enum
  ('SRBM','MRBM','IRBM','ICBM','SLBM','SLV','CM','HGV','Unknown');
create type launch_outcome as enum ('success','failure','unknown');
create type launch_confirmation as enum ('confirmed','unconfirmed');
create type launch_region as enum
  ('sea_of_japan','yellow_sea','pacific','orbital','na','unknown');

create table if not exists launch_cases (
  case_id              uuid primary key default gen_random_uuid(),

  -- 식별
  case_no              integer unique,                -- CNS F1 순번 (멱등키)
  launch_date          date not null,
  launch_time_utc      time without time zone,        -- 일부만 존재

  -- 분류 (원문 보존 + 정규화)
  missile_name         text not null,                 -- CNS 원문 (예: Hwasong-17, Scud-B)
  missile_slug         text,                          -- 정규화 슬러그 (nagix join 키)
  kn_designation       text,                          -- 엄격 정규식 추출 (\bKN-\d+[A-Z]?\b), 없으면 null
  weapon_class         launch_weapon_class not null,
  launch_authority     text,                          -- 발사 부대/기관 (CNS "Launch Agency/Authority")

  -- 공간
  facility_id          uuid references launch_facilities(facility_id) on delete set null,
  facility_name_raw    text,
  facility_lat         double precision,              -- 비정규화 (조인 없이 지도 표출)
  facility_lng         double precision,
  landing_location     text,                          -- CNS 원문 (예: "Sea of Japan or East Sea")
  landing_region       launch_region,
  landing_lat          double precision,              -- 계산값: facility + bearing + distance 대권 목적점
  landing_lng          double precision,
  bearing_deg          numeric(6,2),                  -- nagix(일본 방위성) 발사 방향

  -- 측정
  apogee_km            numeric(8,2),
  apogee_raw           text,                          -- 비정형 원문 보존 (예: "between 25 and 90 km")
  distance_km          numeric(8,2),
  distance_raw         text,

  -- 상태
  confirmation_status  launch_confirmation,
  outcome              launch_outcome,

  -- RAG / 보고
  indicators           text[] not null default '{}',  -- 키워드 유사도용 (facts-derived 중립)
  description          text,                          -- 한국어 자연어 요약

  -- 출처
  sources              text[] not null default '{}',  -- CNS "Source(s)" ";" split
  additional_info      text,                          -- CNS "Additional Information"
  source_ref           text,                          -- 대표 출처 URL

  -- 임베딩 (후속 pgvector RAG; 초기 전부 null)
  embedding            vector(1536),

  created_at           timestamptz not null default now()
);
comment on table launch_cases is 'launch_cases — 북한 미사일 발사사례 1건 (Layer 2+ 과거사례 지식)';

create index if not exists launch_cases_launch_date_idx   on launch_cases (launch_date);
create index if not exists launch_cases_weapon_class_idx  on launch_cases (weapon_class);
create index if not exists launch_cases_facility_id_idx   on launch_cases (facility_id);
create index if not exists launch_cases_kn_idx            on launch_cases (kn_designation);
create index if not exists launch_cases_indicators_gin    on launch_cases using gin (indicators);

-- RLS: observation과 동일 — 해커톤 데이터 파이프라인 단계, 공개 read/write/update/delete.
alter table launch_facilities enable row level security;
alter table launch_cases      enable row level security;

create policy launch_facilities_read   on launch_facilities for select to public using (true);
create policy launch_facilities_write  on launch_facilities for insert to public with check (true);
create policy launch_facilities_update on launch_facilities for update to public using (true);
create policy launch_facilities_delete on launch_facilities for delete to public using (true);

create policy launch_cases_read   on launch_cases for select to public using (true);
create policy launch_cases_write  on launch_cases for insert to public with check (true);
create policy launch_cases_update on launch_cases for update to public using (true);
create policy launch_cases_delete on launch_cases for delete to public using (true);
