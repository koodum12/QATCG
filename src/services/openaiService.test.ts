import { describe, expect, it, vi } from 'vitest';
import { extractOutputText, generateTestCases } from './openaiService';
import type { PageAnalysis } from '@/types/dom';

const ANALYSIS: PageAnalysis = {
  url: 'https://example.com/login',
  title: 'Login',
  html: null,
  dom: { tag: 'body', attrs: {}, children: [{ tag: 'form', attrs: { action: '/login' } }] },
  stats: {
    inputs: 2, buttons: 1, links: 2, forms: 1, tables: 0, selects: 0,
    checkboxes: 1, radios: 0, textareas: 0, dialogs: 0, modals: 0,
    navigations: 0, breadcrumbs: 0, tabs: 0, accordions: 0, paginations: 0,
    scripts: 3, iframes: 0,
  },
  flags: { hasInfiniteScrollHint: false, hasShadowDom: false, hasIframe: false },
  apiCalls: ['https://example.com/api/session'],
};

const AI_JSON = JSON.stringify({
  pageSummary: '로그인 페이지',
  testCases: [
    {
      tcId: 'TC-001',
      feature: '로그인',
      purpose: '정상 로그인',
      priority: 'High',
      steps: ['입력', '클릭'],
      inputs: [{ field: 'email', value: 'a@a.com', category: 'normal' }],
      expectedResult: '성공',
    },
  ],
});

/** Responses API 형태의 성공 응답 */
function responsesBody(text: string) {
  return {
    output: [
      { type: 'reasoning', content: [] },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
    ],
  };
}

/** 응답을 고정하고 마지막 요청을 기록하는 fetch 목 */
function mockFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('extractOutputText', () => {
  it('output 배열의 message.output_text만 추출한다', () => {
    expect(extractOutputText(responsesBody('hello'))).toBe('hello');
  });
  it('output_text 편의 필드를 우선 사용한다', () => {
    expect(extractOutputText({ output_text: 'quick' })).toBe('quick');
  });
});

describe('generateTestCases (Responses API / gpt-5.5)', () => {
  it('Responses 엔드포인트로 올바른 body를 보낸다', async () => {
    const { fn, calls } = mockFetch(200, responsesBody(AI_JSON));
    const out = await generateTestCases(ANALYSIS, {
      apiKey: 'sk-test',
      model: 'gpt-5.5',
      reasoningEffort: 'high',
      fetchFn: fn,
    });

    expect(out.response.testCases).toHaveLength(1);
    expect(out.prompt).toContain('DOM 구조 (JSON)');

    const { url, init } = calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gpt-5.5');
    // reasoning 모델: temperature 미전송, reasoning.effort 사용
    expect(body.temperature).toBeUndefined();
    expect(body.reasoning.effort).toBe('high');
    // Chat Completions의 messages가 아니라 input 사용
    expect(body.messages).toBeUndefined();
    expect(Array.isArray(body.input)).toBe(true);
    // Structured Outputs (json_schema, strict)
    expect(body.text.format.type).toBe('json_schema');
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema).toBeTruthy();
  });

  it('model 미지정 시 gpt-5.5, effort 미지정 시 medium', async () => {
    const { fn, calls } = mockFetch(200, responsesBody(AI_JSON));
    await generateTestCases(ANALYSIS, { apiKey: 'sk-test', fetchFn: fn });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.model).toBe('gpt-5.5');
    expect(body.reasoning.effort).toBe('medium');
  });

  it('API 키가 없으면 에러', async () => {
    await expect(generateTestCases(ANALYSIS, { apiKey: '' })).rejects.toThrow(
      'API 키가 설정되지 않았습니다',
    );
  });

  it('401이면 키 오류 메시지', async () => {
    const { fn } = mockFetch(401, { error: { message: 'unauthorized' } });
    await expect(
      generateTestCases(ANALYSIS, { apiKey: 'sk-bad', fetchFn: fn }),
    ).rejects.toThrow('유효하지 않습니다');
  });

  it('404면 모델 접근 오류 메시지', async () => {
    const { fn } = mockFetch(404, { error: { message: 'model not found' } });
    await expect(
      generateTestCases(ANALYSIS, { apiKey: 'sk-test', model: 'gpt-5.5', fetchFn: fn }),
    ).rejects.toThrow('접근할 수 없습니다');
  });

  it('429면 한도 초과 메시지', async () => {
    const { fn } = mockFetch(429, {});
    await expect(
      generateTestCases(ANALYSIS, { apiKey: 'sk-test', fetchFn: fn }),
    ).rejects.toThrow('한도를 초과');
  });

  it('심층 분석 시 HTML이 프롬프트에 포함된다', async () => {
    const { fn } = mockFetch(200, responsesBody(AI_JSON));
    const out = await generateTestCases(
      { ...ANALYSIS, html: '<html><body>deep</body></html>' },
      { apiKey: 'sk-test', fetchFn: fn },
    );
    expect(out.prompt).toContain('원본 HTML (심층 분석)');
    expect(out.prompt).toContain('deep');
  });
});
