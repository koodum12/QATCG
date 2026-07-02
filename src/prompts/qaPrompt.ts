import type { PageAnalysis } from '@/types/dom';

/**
 * OpenAI에 전달할 QA 테스트케이스 생성 프롬프트 빌더.
 * DOM 구조(JSON)를 중심으로 하고, 심층 분석 시에만 HTML을 덧붙인다.
 */

export const SYSTEM_PROMPT = `당신은 10년 이상의 경력을 가진 시니어 QA 엔지니어이다.
주어진 웹 페이지의 DOM 구조를 분석하여 QA 테스트 케이스를 작성한다.

각 테스트 케이스에 다음을 포함하라:
1. 테스트해야 할 기능
2. 정상 시나리오
3. 예외 시나리오
4. 경계값 테스트
5. 입력 데이터 (정상값/경계값/예외값: 공백, null, 특수문자, 이모지, 초장문, SQL Injection, XSS 등)
6. 예상 결과
7. 우선순위 (High/Medium/Low)
8. 테스트 목적

반드시 아래 JSON 형식으로만 응답하라. 다른 텍스트를 포함하지 마라.

{
  "pageSummary": "페이지에 대한 한 줄 요약",
  "testCases": [
    {
      "tcId": "TC-001",
      "feature": "로그인",
      "purpose": "정상 로그인 확인",
      "priority": "High",
      "steps": ["이메일 입력", "비밀번호 입력", "로그인 버튼 클릭"],
      "inputs": [
        { "field": "email", "value": "test@test.com", "category": "normal" },
        { "field": "password", "value": "Abcd1234!", "category": "normal" }
      ],
      "expectedResult": "메인 화면으로 이동한다."
    }
  ]
}

규칙:
- tcId는 TC-001부터 순차 부여한다.
- priority는 High, Medium, Low 중 하나만 사용한다.
- category는 normal, boundary, exception 중 하나만 사용한다.
- 페이지에서 발견된 모든 주요 기능(폼, 버튼, 링크, 네비게이션, 테이블, 모달 등)을 커버하라.
- 각 입력 필드에 대해 정상/경계/예외 입력 데이터를 충분히 생성하라.`;

/** HTML 첨부 시 토큰 폭주를 막기 위한 최대 길이 */
const MAX_HTML_LENGTH = 30000;

/** 페이지 분석 결과로 user 프롬프트를 생성 */
export function buildUserPrompt(analysis: PageAnalysis): string {
  const sections: string[] = [
    `## 페이지 정보`,
    `- URL: ${analysis.url}`,
    `- Title: ${analysis.title}`,
    ``,
    `## 요소 통계`,
    JSON.stringify(analysis.stats),
    ``,
    `## 페이지 특성`,
    JSON.stringify(analysis.flags),
  ];

  if (analysis.apiCalls.length > 0) {
    sections.push('', '## 감지된 API 호출', analysis.apiCalls.join('\n'));
  }

  sections.push('', '## DOM 구조 (JSON)', JSON.stringify(analysis.dom));

  if (analysis.html) {
    sections.push(
      '',
      '## 원본 HTML (심층 분석)',
      analysis.html.slice(0, MAX_HTML_LENGTH),
    );
  }

  sections.push(
    '',
    '위 페이지를 분석하여 QA 테스트 케이스를 JSON으로 생성하라.',
  );
  return sections.join('\n');
}
