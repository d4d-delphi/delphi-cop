# DELPHI 프로젝트 세팅 가이드

Fresh clone 후 첫 세팅을 위한 가이드입니다.

## 🚀 Quick Start (5분)

```bash
# 1. Clone 후 디렉토리 이동
cd delphi-cop/web-ui

# 2. Supabase 연결 (원격 DB)
npx supabase link --project-ref jahosulejxmqjyjkvhno

# 3. 환경 변수 설정
cp .env.example .env.local
# .env.local 에 필요한 키들을 입력 (아래 환경 변수 섹션 참조)

# 4. 의존성 설치
npm install

# 5. 실행
npm run dev
```

## 🔑 환경 변수

`.env.local` 파일에 다음 키들을 입력하세요:

| 키 | 용도 | 필수 | 비고 |
|-----|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | ✅ | 이미 `.env.example`에 있음 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 공개 키 | ✅ | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 서비스 키 | ✅ | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_API_BASE_URL` | 백엔드 URL | ❌ | 기본값 `http://localhost:8000` |

## 📁 데이터 상태

### ✅ Git 추적 중 (Fresh clone에 포함)
```
src/data/*.json (21개)
├── doctrine-ontology.json          # 교리 온톨로지
├── emitter-ontology.json           # 방사체 온톨로지
├── facility-ontology.json          # 시설 온톨로지
├── friendly-formations.json        # 아군 편제
├── friendly-units.json             # 아군 부대
├── launch-cases.json               # 발사사례 RAG
├── missile-ontology.json           # 미사일 온톨로지
├── orbat-units.json                # 적 ORBAT
├── air-threat-cases.json           # 공군 시나리오 RAG
├── observations-air-threat.json     # 공군 평시 관측 (60건)
├── observations-sead-bda.json       # 공군 전시 관측 (60건)
└── ... 시나리오/가설 데이터
```

### ❌ Git ignore (Fresh clone에 없음)
```
supabase/seed/*_seed.sql            # DB 시드 SQL (재생성 가능)
supabase/seed/data/                 # 원천 CSV/JSON 데이터
```

**중요:** JSON 데이터는 이미 git에 커밋되어 있으므로 export 스크립트를 실행할 필요가 없습니다!

## 🔄 Export 스크립트 (데이터 변경 시)

데이터(온톨로지/교리/ORBAT)가 변경되었을 때만 실행하세요:

```bash
cd web-ui
bash supabase/seed/export_all_mirrors.sh
```

이 스크립트는 다음 JSON 파일들을 갱신합니다:
- `missile-ontology.json`
- `facility-ontology.json`
- `orbat-units.json`
- `doctrine-ontology.json`
- `friendly-units.json`
- `friendly-formations.json`
- `emitter-ontology.json`
- `launch-cases.json`

갱신 후 커밋:
```bash
git add src/data/*.json
git commit -m "chore: 온톨로지/교리 데이터 갱신"
```

## 🧪 개발 서버

```bash
cd web-ui
npm run dev        # 개발 서버 (http://localhost:3000)
npm run build      # 프로덕션 빌드
npm start          # 프로덕션 실행
npm run lint       # ESLint 검사
```

## 🗄️ Supabase 프로젝트

- **프로젝트명:** Delphi
- **리전:** ap-northeast-1
- **리프:** jahosulejxmqjyjkvhno
- **상태:** ACTIVE

### DB 쿼리 (로컬 개발)
```bash
cd web-ui
npx supabase db query --linked "SELECT * FROM facilities LIMIT 10;"
```

## 📊 데이터 구조

### Layer 1: Observation (단일 테이블)
- `observation` — 판독관 관측 데이터 (SATELLITE_IMINT/SIGINT/UAV_FLIR/OSINT)

### Layer 2+: 온톨로지 (정규 엔티티)
- `missiles` + `missile_aliases` — 미사일 체계 37종
- `facilities` + `facility_aliases` — 시설 64종
- `military_units` + `unit_aliases` — 적 ORBAT 50개 부대
- `friendly_units` + `friendly_unit_aliases` — 아군 18개 부대

### Layer 3: 지식/교리
- `launch_cases` — 발사사례 303건 (1984~2024)
- `doctrine` 관련 테이블 — 교리 36행
- `emitters` + `emitter_aliases` — 방사체 13개

자세한 스키마는 [DATASET-SCHEMA.md](./DATASET-SCHEMA.md)를 참조하세요.

## 🚨 해커톤 때 데이터 뒤죽박죽 문제 해결

### 문제: 데이터가 어디서 오는지 몰랐음
- 원격 Supabase인지 로컬 JSON인지 헷갈림
- Export 스크립트를 언제 실행해야 할지 불분명

### 해결: **JSON First 아키텍처**
1. **Git에 JSON 커밋** → Fresh clone에 데이터 포함
2. **Supabase는 원천** → Export 스크립트로 JSON 갱신
3. **lib/는 fs로 읽기** → DB 키 불필요

### 결과
- ✅ Fresh clone 후 `npm install`만 하면 작동
- ✅ 데이터 변경 → export → commit 순서로 간단
- ✅ 팀원들이 `git pull`로 최신 데이터 받음

## 📚 추가 문서

- [DATASET-SCHEMA.md](./DATASET-SCHEMA.md) — 데이터 스키마 상세
- [PIPELINE.md](./PIPELINE.md) — 4단계 파이프라인 설명
- [PROJECT-OVERVIEW.md](./PROJECT-OVERVIEW.md) — 프로젝트 개요

---

**Last Updated:** 2026-07-14
