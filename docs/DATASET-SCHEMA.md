# Layer 1 스키마 명세 — `observation`

DELPHI 파이프라인의 원천 첩보 계층(Layer 1) 데이터 모델 명세.

---

## 1. Layer 1의 정의와 경계

**Layer 1 한 행 = 인간 판독관 1인이 감시 자산 1개에서 얻은, 하나의 액션 단위 관측 + 그 출처·신뢰도.**

이 정의에서 세 가지 경계가 나온다.

- **단일 자산, 단일 관측.** 한 위성영상 · 한 UAV 세션 · 한 판독병의 한 신호 식별 · 한 매체 보도. 여러 자산을 엮은 것은 Layer 1이 아니다.
- **판독관의 해석까지만.** "무엇을 봤고 무엇으로 판단했나"(단일 관측 서술)는 포함. 융합·추론·사례매칭·의도판단은 제외한다.
- **원천 그대로, 정규화 이전.** 액션 클래스 분류, 단계(phase) 태깅, likelihood, 시나리오 소속 등은 이후 계층이 붙인다. Layer 1은 그 입력일 뿐이다.

모든 감시 자산을 단일 `observation` 테이블로 통합하고, 자산 종류는 `asset_type` 컬럼으로, 자산별 원천 필드는 `asset_detail` jsonb로 담는다. (소비 주체가 LLM이므로 jsonb 규약 기반이 적합.)

---

## 2. 테이블 DDL

```sql
create table observation (
  obs_id          uuid primary key default gen_random_uuid(),

  -- ── 관측 정체 ──
  asset_type      text not null
    check (asset_type in ('SATELLITE_IMINT','AERIAL_IMINT','SIGINT','UAV_FLIR','OSINT')),
  polarity        text not null default 'PRESENT'
    check (polarity in ('PRESENT','ABSENT')),      -- negative evidence
  collected_at    timestamptz not null,            -- 촬영/포착/보도 일시 (정본 시간축)

  -- ── 공간 ──
  mgrs            text,                             -- 대상 위치 (군사좌표)
  location_name   text,                             -- 판독관이 쓴 시설/지역명 (자유텍스트)

  -- ── 판독관이 본 것 (액션 단위 핵심) ──
  observed_objects jsonb not null default '[]',     -- [{type(자유텍스트), count}]
  activity_desc   text not null,                    -- 판독관 서술 (단일 관측 한정)
  unusual_flag    boolean not null default false,   -- routine vs unusual

  -- ── 출처 · 신뢰도 (Provenance) ──
  platform        text not null,                    -- 자산명 (425위성, 헤론, RF-16, 노동신문)
  analyst_id      text,                             -- 판독관 ID (SIGINT raw는 null)
  analyst_unit    text,                             -- 소속 부대
  reliability     smallint not null                 -- 판독 신뢰 등급
    check (reliability between 1 and 5),

  -- ── 자산별 상세 (원천 필드) ──
  asset_detail    jsonb not null default '{}',

  -- ── 원본 참조 ──
  source_ref      text,                             -- 원 아티클 URL / 파일 포인터
  image_urls      jsonb not null default '[]',      -- [{url, caption, license}]
  created_at      timestamptz not null default now()
);

create index on observation (collected_at);
create index on observation (asset_type);
```

---

## 3. 필드 명세

| 필드 | 타입 | Null | 설명 |
|---|---|---|---|
| `obs_id` | uuid | no | PK, 자동생성 |
| `asset_type` | text (enum) | no | 감시 자산 종류. 5종 중 하나 |
| `polarity` | text (enum) | no | `PRESENT`=관측됨 / `ABSENT`=예상됐으나 부재(negative evidence). 기본 `PRESENT` |
| `collected_at` | timestamptz | no | 촬영·포착·보도 일시. **정본 시간축** (추론 엔진이 이 값으로 시계열 정렬) |
| `mgrs` | text | yes | 관측 대상 위치 (군사좌표참조체계) |
| `location_name` | text | yes | 판독관이 쓴 시설/지역명. 자유텍스트, 시설 마스터 FK 아님 |
| `observed_objects` | jsonb | no | `[{type, count}]`. `type`은 자유텍스트. `ABSENT`이면 빈 배열 |
| `activity_desc` | text | no | 판독관의 단일 관측 서술. `ABSENT`이면 "무엇이 없는지" 기술 |
| `unusual_flag` | boolean | no | 일상적(false) vs 특이(true). `polarity`와 직교하는 별개 축 |
| `platform` | text | no | 수집 자산/플랫폼 명칭 |
| `analyst_id` | text | yes | 판독관 ID. SIGINT 기계 원신호(`is_raw`)는 null |
| `analyst_unit` | text | yes | 판독관 소속 부대 |
| `reliability` | smallint | no | 판독 신뢰 등급 1~5 (기상·화질·각도 등 종합) |
| `asset_detail` | jsonb | no | 자산별 원천 필드. §4 규약 |
| `source_ref` | text | yes | 원 아티클 URL / 원본 파일 포인터 |
| `image_urls` | jsonb | no | `[{url, caption, license}]`. S3 업로드 또는 외부 참조 링크 |
| `created_at` | timestamptz | no | 레코드 생성 시각 (감사용) |

### 두 직교 축: `polarity` × `unusual_flag`

| | `PRESENT` | `ABSENT` |
|---|---|---|
| `unusual_flag=false` | 일상적 활동 관측 | 일상적 부재 (평소에도 없음) |
| `unusual_flag=true` | 특이 활동 관측 | **예상됐는데 부재** (진단적 negative evidence) |

---

## 4. `asset_detail` jsonb 규약

DB 제약은 걸리지 않으나 LLM이 읽는 규약이므로 명세로 고정한다.

### SATELLITE_IMINT / AERIAL_IMINT
```jsonc
{ "sensor_type": "EO",        // EO | SAR | IR
  "look_angle_deg": 23,
  "cloud_cover_pct": 10 }
```

### SIGINT  (`is_raw`로 원신호/판독 구분)
```jsonc
{ "is_raw": true,             // true=기계 원신호(analyst 없음), false=판독병 식별
  "frequency_band": "VHF",    // UHF | HF | VHF | X-Band | S-Band | L-Band
  "signal_params": { "PRI": 1050, "PW": 2.5, "Scan": "Circular" },
  "emitter_guess": "미상 추적레이더",   // 이 관측 하나의 1차 추정 (융합 확정 아님)
  "signal_strength": "Moderate",       // Weak | Moderate | High
  "ew_status": "Normal" }              // Normal | Jammed
```

### UAV_FLIR
```jsonc
{ "sensor_mode": "FLIR_WhiteHot",          // FLIR_WhiteHot | FLIR_BlackHot | EO_DayTV | IR_MidWave
  "platform_mgrs": "52S CG 1200 1200",     // 아군 UAV 체공 위치
  "slant_range_km": 42.5,
  "tracking_status": "Lock-on" }           // Searching | Lock-on | Lost
```

### OSINT  (엔티티 추출까지만)
```jsonc
{ "source_media": "노동신문",
  "media_type": "Text",       // Text | Photo | Video
  "original_title": "...",
  "key_entities": ["김정은", "원산"] }
```

---

## 5. Layer 1 경계 — 명시적 제외 목록

아래 항목은 Layer 1에 **두지 않는다**. 이후 계층이 생성·부여한다.

| 항목 | 실제 소속 계층 | 이유 |
|---|---|---|
| `emitter_identified`(확정), `integrated_sources` | Layer 2 (융합) | 다중 소스 융합 판단. Layer 1은 `emitter_guess`(단일 관측 추정)까지만 |
| `action_class`, `phase_no`, `field_uncertainty` | Layer 2 (정형화) | 추출층이 관측을 정형 클래스로 변환한 산물 |
| `strategic_intent`, `dia_analytical_summary` | Layer 2+ (추론) | 의도·의미 추론 |
| `related_launch_seq`, 사례 매칭 | Layer 2+ (연관) | 과거 사례와의 매칭 결과 |
| `threat_level`, `launch_probability` | 추론 산출 | 베이지안 추론 결과 |
| `likelihood_map`, `prior_probability` | 사전지식 계층 | 방출표·사전 |
| `scenario_id` / 사건 소속 | 파이프라인 (데이터 연관) | 어느 사건에 속하는지는 트랙 게이팅이 추론. Layer 1에 태그하면 추론 우회(치팅) |
| 시설 마스터 FK | Layer 2 (지오코딩) | `location_name` 자유텍스트만 두고, 시설 매칭은 이후 |

---

## 6. 설계 결정 기록

확정된 결정과 근거.

1. **단일 테이블 + jsonb** (자산별 테이블 분리 안 함) — 소비 주체가 LLM이고, 자산별 테이블 분리는 "중구난방"으로 회귀할 위험.
2. **SIGINT 기계 원신호를 SIGINT 관측에 흡수** — 별도 테이블 대신 `asset_detail.is_raw` 플래그로 구분.
3. **`collected_at` 정본, `analyzed_at` 드랍** — 추론 시간축은 사건 발생 시각. 판독 완료 시각은 불필요.
4. **신뢰도 1축(`reliability`)** — Layer 1에서 판독관이 줄 수 있는 것은 판독 품질뿐. 소스신뢰도×내용확신도 2축 분리는 Layer 2에서.
5. **`observed_objects.type` 자유텍스트** — 원천 보존. 정형 클래스 변환은 추출층 몫.
6. **negative evidence를 `polarity` enum으로** — "예상됐는데 부재"도 판독관이 실제로 보고하는 관측이므로 Layer 1에 포함.
7. **`scenario_id` 드랍** — 사건 소속은 파이프라인이 추론. Layer 1은 순수 관측만.

---

## 7. 샘플 레코드

### 예 1 — PRESENT, 특이 (은하-3 발사 준비, 연료 배달)
```json
{
  "asset_type": "SATELLITE_IMINT",
  "polarity": "PRESENT",
  "collected_at": "2012-03-28T02:00:00Z",
  "mgrs": "51S UU 00000 00000",
  "location_name": "동창리 서해위성발사장 - 추진제 저장동",
  "observed_objects": [
    {"type": "tanker_truck", "count": 1},
    {"type": "fuel_tank", "count": 9},
    {"type": "oxidizer_tank", "count": 6}
  ],
  "activity_desc": "추진제 저장동에 연료·산화제 배달 트럭 식별. 연료동 탱크 9기, 산화제동 6기 정렬. 1단 주입 준비 정황.",
  "unusual_flag": true,
  "platform": "DigitalGlobe",
  "analyst_id": "Analyst_A",
  "analyst_unit": "국방정보본부",
  "reliability": 4,
  "asset_detail": { "sensor_type": "EO", "look_angle_deg": 20, "cloud_cover_pct": 5 },
  "source_ref": "https://www.38north.org/2012/03/tongchang0329/",
  "image_urls": []
}
```

### 예 2 — ABSENT, 특이 (예상 징후 부재 = negative evidence)
```json
{
  "asset_type": "SATELLITE_IMINT",
  "polarity": "ABSENT",
  "collected_at": "2019-12-17T02:00:00Z",
  "mgrs": "51S UU 00000 00000",
  "location_name": "동창리 서해위성발사장 - 발사대 및 VIP 관측시설",
  "observed_objects": [],
  "activity_desc": "발사 임박이 거론됐으나 발사대·VIP시설·본부 무활동. 겨울철 예상되는 표적화 제설 작업 미관측 — 예상 징후 부재.",
  "unusual_flag": true,
  "platform": "Pleiades (CNES/Airbus DS)",
  "analyst_id": "Analyst_A",
  "analyst_unit": "국방정보본부",
  "reliability": 4,
  "asset_detail": { "sensor_type": "EO", "look_angle_deg": 15, "cloud_cover_pct": 0 },
  "source_ref": "https://www.38north.org/2019/12/sohae121719/",
  "image_urls": []
}
```

### 예 3 — SIGINT 기계 원신호 (`is_raw=true`, 판독관 없음)
```json
{
  "asset_type": "SIGINT",
  "polarity": "PRESENT",
  "collected_at": "2012-12-08T05:30:00Z",
  "mgrs": "51S UU 00000 00000",
  "location_name": "동창리 발사장 계측지 인근",
  "observed_objects": [],
  "activity_desc": "능선 계측지에서 추적레이더 계열 방출 포착 (체계 자동수집, 미식별).",
  "unusual_flag": true,
  "platform": "지상 ES체계",
  "analyst_id": null,
  "analyst_unit": null,
  "reliability": 3,
  "asset_detail": {
    "is_raw": true,
    "frequency_band": "X-Band",
    "signal_params": { "PRI": 1050, "PW": 2.5, "Scan": "Circular" },
    "emitter_guess": "미상 추적레이더",
    "signal_strength": "Moderate",
    "ew_status": "Normal"
  },
  "source_ref": "https://www.38north.org/2012/12/sohae121112/",
  "image_urls": []
}
```