# AI QA Test Case Generator (Chrome Extension)

AI가 웹 페이지를 분석하여 QA 엔지니어가 바로 사용할 수 있는 **테스트 케이스와 입력 데이터**를 자동 생성하는 Chrome Extension입니다. Selenium/Playwright 같은 테스트 실행 도구가 아니라 **AI 기반 QA Copilot**입니다.

## 아키텍처

**확장(Chrome)** + **로컬 Python 서버(FastAPI + SQLite)** 2개 파트로 구성됩니다.

- 확장은 브라우저에서만 가능한 **DOM 수집**과 UI를 담당합니다.
- 서버는 **OpenAI 호출 + SQLite 저장**을 담당합니다. 생성 요청은 **잡(job)** 으로 처리되므로,
  팝업을 닫거나 확장 서비스 워커가 종료돼도 **서버에서 생성이 끝까지 진행**됩니다. 확장은 잡을
  폴링해 **진행 바**를 그리고, 팝업을 다시 열면 진행 중이던 잡을 자동으로 이어서 표시합니다.
- OpenAI API 키는 확장이 아니라 **서버 `.env`(OPENAI_API_KEY)** 에서만 관리합니다.

```
[웹페이지] ─(DOM 수집)→ [확장 SW] ─REST(127.0.0.1:8787)→ [Python 서버] ─→ [OpenAI gpt-5.5]
                                                              └─→ [SQLite qa.db]
```

## 동작 방식

1. 팝업에서 프로젝트를 선택하고 **Generate Test Case** 클릭
2. content script가 DOM을 수집·정제해 구조화 JSON 생성 (script/style/svg 등 제거, QA 속성 보존)
3. 확장이 분석 결과를 서버 `POST /jobs/generate`로 넘기고 잡 id를 받음
4. 서버가 백그라운드 스레드에서 OpenAI(gpt-5.5, Responses API)로 테스트 케이스 + 입력 데이터 생성 → SQLite 저장
5. 팝업은 잡을 폴링하며 진행 바 표시. 대시보드에서 프로젝트 → 페이지 → 테스트 케이스 3단으로 열람/검색/Export

## 설치 및 실행

### 1) 서버 (먼저 실행해야 함)

```bash
cd server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # .env를 열어 OPENAI_API_KEY 입력 (모델/effort도 여기서 지정)
uvicorn main:app --port 8787
```

서버가 `127.0.0.1:8787`에서 뜨고 `server/qa.db`(SQLite 파일)에 데이터를 저장합니다. **서버가 꺼져 있으면 확장은 동작하지 않습니다** — 이 경우 확장에 "백엔드 서버에 연결할 수 없습니다"라는 안내가 표시됩니다.

### 2) 확장

```bash
npm install
npm run build   # 타입체크 + 페이지/SW 빌드 + content script(IIFE) 빌드
npm test        # vitest 단위 테스트 (35개)
```

Chrome에서 `chrome://extensions` → 개발자 모드 → **압축해제된 확장 프로그램 로드** → `dist/` 폴더 선택.

모델·추론 강도는 대시보드 → **설정**에서 변경할 수 있습니다(서버 `POST /config`로 반영). API 키는 UI에서 편집하지 않고 서버 `.env`에서만 관리합니다.

## 주요 기능

- **프로젝트 관리** — 여러 프로젝트별로 분석 결과 분리 저장
- **페이지 분석** — URL/Title/HTML, 폼·입력·버튼·링크·테이블·모달·탭·페이지네이션 등 요소 통계, Shadow DOM/iframe/무한스크롤 감지, fetch/XHR 호출 흔적 수집
- **심층 분석** — 옵션 선택 시 원본 HTML도 프롬프트에 포함(최대 30K자)
- **테스트 케이스** — 기능/목적/절차/입력값/예상 결과/우선순위, Zod로 응답 검증·정규화
- **입력 데이터** — 정상/경계/예외(공백·null·이모지·SQLi·XSS 등) 값에 개별 복사 버튼
- **검색** — URL, 기능, 테스트명, 입력값, 프로젝트명 통합 검색
- **Export** — JSON / Markdown / CSV(BOM 포함) / Excel(xlsx)
- **PromptHistory** — 모든 프롬프트/응답 원문 저장

## 기술 스택

**확장**: TypeScript · React 18 · Manifest V3 · Vite · TailwindCSS · Zod · Zustand
**서버**: Python · FastAPI · uvicorn · 표준 `sqlite3` · requests · OpenAI Responses API(gpt-5.5)

> 초기 버전은 확장 단독(sql.js WASM + IndexedDB)으로 동작했으나, 긴 reasoning 생성이
> MV3 서비스 워커 종료에 영향을 받지 않도록 생성·저장을 로컬 Python 서버로 옮겼습니다.
> `src/db`, `src/services/openaiService.ts`는 단위 테스트 대상 TS 참조 구현으로 남아 있습니다.

## 코드 구조

```
server/           # Python 백엔드
  main.py         # FastAPI: REST 라우트 + 생성 잡(스레드) 레지스트리
  db.py           # 표준 sqlite3 데이터 계층 (스키마/리포지토리/검색/Export)
  openai_client.py# Responses API 호출(gpt-5.5), 프롬프트, json_schema
src/              # 확장
  background/     # SW: 메시지 라우터 → 서버 REST 프록시, DOM 수집, 잡 시작/폴링
  content/        # DOM 수집·정제·구조화 (collect.ts 순수 함수 — jsdom 테스트)
  popup/          # 팝업 UI (Generate + 진행 바 + 잡 복원)
  dashboard/      # 대시보드 UI (3단 레이아웃)
  components/     # ProjectList, PageList, TestCasePanel, SearchBar, ExportMenu, ProgressBar 등
  store/          # Zustand 전역 상태
  lib/            # api.ts(REST 클라이언트), messaging.ts(타입 안전 메시징)
  services/       # exportService(JSON/MD/CSV/XLSX), aiSchema/openaiService(참조 구현)
  types/          # 도메인 모델, DOM 분석, 메시지·잡 프로토콜
```

## DB 스키마

`Project` → `Page` → `TestCase` → `InputData` (모두 ON DELETE CASCADE), 별도 `PromptHistory`. DDL은 `server/db.py`의 `SCHEMA` 참고. 실제 파일은 `server/qa.db`.

## 검증

- 확장 단위 테스트 35개: DOM 수집(jsdom), AI 응답 파싱(정규화/에러), Export(JSON/MD/CSV/XLSX 재독), Responses API 계약(엔드포인트·reasoning.effort·json_schema strict)
- 서버 검증: DB 계층(CRUD/트랜잭션/검색/Export/CASCADE), REST(health/projects/config), 잡 파이프라인 성공(queued→done+저장) 및 실패(잘못된 키→error) 경로
- 실브라우저 E2E(Chrome for Testing + 실행 중 서버): SW→서버 CORS/localhost fetch, 프로젝트 생성(SW→서버→SQLite), Generate 잡 생성, 진행 바 폴링 종료, 팝업 렌더 — 7/7 통과
