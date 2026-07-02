# AI QA Test Case Generator (Chrome Extension)

AI가 웹 페이지를 분석하여 QA 엔지니어가 바로 사용할 수 있는 **테스트 케이스와 입력 데이터**를 자동 생성하는 Chrome Extension입니다. Selenium/Playwright 같은 테스트 실행 도구가 아니라 **AI 기반 QA Copilot**입니다.

## 동작 방식

1. 분석할 웹 페이지를 열고 확장 팝업에서 프로젝트를 선택한 뒤 **Generate Test Case** 클릭
2. content script가 DOM을 수집·정제해 구조화 JSON 생성 (script/style/svg 등 제거, QA 속성 보존)
3. background가 OpenAI API에 DOM 구조를 전달해 테스트 케이스(TC-001 형식) + 입력 데이터셋 생성
4. 결과를 SQLite(sql.js WASM, IndexedDB 영속화)에 저장
5. 대시보드에서 프로젝트 → 페이지 → 테스트 케이스 3단 구조로 열람, 검색, Export

## 설치 및 빌드

```bash
npm install
npm run build   # 타입체크 + 페이지/SW 빌드 + content script(IIFE) 빌드 + WASM 복사
npm test        # vitest 단위 테스트 (31개)
```

Chrome에서 `chrome://extensions` → 개발자 모드 → **압축해제된 확장 프로그램 로드** → `dist/` 폴더 선택.

첫 사용 전 대시보드(팝업 → 대시보드 열기) → **설정**에서 OpenAI API 키를 입력하세요. 키는 `chrome.storage.local`에만 저장됩니다.

## 주요 기능

- **프로젝트 관리** — 여러 프로젝트별로 분석 결과 분리 저장
- **페이지 분석** — URL/Title/HTML, 폼·입력·버튼·링크·테이블·모달·탭·페이지네이션 등 요소 통계, Shadow DOM/iframe/무한스크롤 감지, fetch/XHR 호출 흔적 수집
- **심층 분석** — 옵션 선택 시 원본 HTML도 프롬프트에 포함(최대 30K자)
- **테스트 케이스** — 기능/목적/절차/입력값/예상 결과/우선순위, Zod로 응답 검증·정규화
- **입력 데이터** — 정상/경계/예외(공백·null·이모지·SQLi·XSS 등) 값에 개별 복사 버튼
- **검색** — URL, 기능, 테스트명, 입력값, 프로젝트명 통합 검색
- **Export** — JSON / Markdown / CSV(BOM 포함) / Excel(xlsx)
- **PromptHistory** — 모든 프롬프트/응답 원문 저장

## 기술 스택 및 주의점

TypeScript · React 18 · Manifest V3 · Vite · TailwindCSS · **sql.js(SQLite WASM)** · OpenAI API · Zod · Zustand

- `better-sqlite3` 등 Node 네이티브 SQLite는 브라우저 확장에서 구동 불가 → SQLite 공식 WASM 빌드인 sql.js를 사용하고 DB 바이트를 IndexedDB에 영속화합니다.
- MV3 service worker에는 `XMLHttpRequest`가 없어 sql.js 기본 로더가 실패하므로, WASM을 `fetch`로 직접 읽어 `wasmBinary`로 주입합니다 (`src/background/index.ts`).
- WASM 실행을 위해 manifest CSP에 `wasm-unsafe-eval`이 필요합니다.

## 코드 구조

```
src/
  background/   # SW: 메시지 라우터, DB 소유, Generate 파이프라인
  content/      # DOM 수집·정제·구조화 (collect.ts는 순수 함수 — jsdom 테스트)
  popup/        # 팝업 UI (프로젝트 선택, Generate 버튼)
  dashboard/    # 대시보드 UI (3단 레이아웃)
  components/   # ProjectList, PageList, TestCasePanel, SearchBar, ExportMenu 등
  store/        # Zustand 전역 상태
  lib/          # 타입 안전 메시징 헬퍼
  db/           # sql.js 래퍼, 스키마, 리포지토리
  services/     # OpenAI 호출, Zod 스키마, Export 변환
  prompts/      # QA 프롬프트 빌더
  types/        # 도메인 모델, DOM 분석, 메시지 프로토콜
  utils/        # logger, download
```

## DB 스키마

`Project` → `Page` → `TestCase` → `InputData` (모두 ON DELETE CASCADE), 별도 `PromptHistory`. 자세한 DDL은 `src/db/schema.ts` 참고.

## 검증

- 단위 테스트 31개: DB 리포지토리(트랜잭션/CASCADE/검색), DOM 수집(jsdom), AI 응답 파싱(정규화/에러), Export(JSON/MD/CSV/XLSX 재독 검증)
- 실브라우저 E2E: Chrome for Testing에 확장을 로드해 SW 기동 → 프로젝트 생성 → 리로드 영속성 → OpenAI 모킹 후 실제 페이지 Generate → 대시보드 표시/검색/Export까지 11개 체크 통과
