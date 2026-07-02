import { SYSTEM_PROMPT, buildUserPrompt } from '@/prompts/qaPrompt';
import { AI_JSON_SCHEMA, parseAiResponse, type AiResponse } from './aiSchema';
import { logger } from '@/utils/logger';
import type { PageAnalysis } from '@/types/dom';
import type { ReasoningEffort } from '@/types/messages';

/**
 * OpenAI Responses API 호출 서비스 (gpt-5.5 기준).
 *
 * gpt-5.5는 reasoning 모델이라 Chat Completions가 아닌 Responses API(/v1/responses)를 권장하며,
 * - temperature 등 샘플링 파라미터 미지원 → reasoning.effort로 추론 강도 제어
 * - 구조화 출력은 text.format(json_schema, strict)로 강제
 * background service worker에서 실행되며, fetch를 주입받아 테스트 가능하다.
 */

const OPENAI_URL = 'https://api.openai.com/v1/responses';
export const DEFAULT_MODEL = 'gpt-5.5';
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'medium';

export interface GenerateOptions {
  apiKey: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  /** 테스트용 fetch 주입 지점 */
  fetchFn?: typeof fetch;
}

export interface GenerateOutput {
  response: AiResponse;
  /** PromptHistory 저장용 원본 */
  prompt: string;
  rawResponse: string;
}

/** Responses API 응답 형태 (필요한 필드만) */
interface ResponsesApiResult {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  /** 일부 SDK/응답에 존재하는 편의 필드 */
  output_text?: string;
  error?: { message?: string };
}

/**
 * Responses API 응답에서 모델이 생성한 텍스트를 추출한다.
 * output 배열에는 reasoning 아이템이 먼저 올 수 있으므로 type='message'의
 * output_text 조각만 이어붙인다.
 */
export function extractOutputText(data: ResponsesApiResult): string {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text;
  }
  const parts: string[] = [];
  for (const item of data.output ?? []) {
    if (item.type !== 'message') continue;
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && typeof part.text === 'string') {
        parts.push(part.text);
      }
    }
  }
  return parts.join('');
}

/** 페이지 분석 결과로 테스트케이스를 생성한다 */
export async function generateTestCases(
  analysis: PageAnalysis,
  options: GenerateOptions,
): Promise<GenerateOutput> {
  if (!options.apiKey) {
    throw new Error('OpenAI API 키가 설정되지 않았습니다. 설정에서 API 키를 입력하세요.');
  }
  const fetchFn = options.fetchFn ?? fetch;
  const userPrompt = buildUserPrompt(analysis);
  const model = options.model || DEFAULT_MODEL;
  const effort = options.reasoningEffort || DEFAULT_REASONING_EFFORT;

  const body = {
    model,
    // Responses API는 messages 대신 input을 사용한다
    input: [
      {
        type: 'message',
        role: 'developer',
        content: [{ type: 'input_text', text: SYSTEM_PROMPT }],
      },
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: userPrompt }],
      },
    ],
    // reasoning 모델의 추론 강도 (temperature 대체)
    reasoning: { effort },
    // Structured Outputs로 응답 스키마를 강제
    text: {
      format: {
        type: 'json_schema',
        name: 'qa_testcases',
        strict: true,
        schema: AI_JSON_SCHEMA,
      },
    },
  };

  logger.info('openai', `요청 시작 (model=${model}, effort=${effort}, prompt=${userPrompt.length}자)`);
  let res: Response;
  try {
    res = await fetchFn(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.error('openai', '네트워크 오류', err);
    throw new Error('OpenAI API 네트워크 오류: 인터넷 연결을 확인하세요.');
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    logger.error('openai', `API 오류 ${res.status}`, errText);
    if (res.status === 401) throw new Error('OpenAI API 키가 유효하지 않습니다.');
    if (res.status === 404) {
      throw new Error(
        `모델 "${model}"에 접근할 수 없습니다. 모델 이름 또는 계정 권한을 확인하세요.`,
      );
    }
    if (res.status === 429) throw new Error('OpenAI API 사용량 한도를 초과했습니다.');
    throw new Error(`OpenAI API 오류 (HTTP ${res.status})`);
  }

  const data = (await res.json()) as ResponsesApiResult;
  const content = extractOutputText(data);
  if (!content) {
    throw new Error(data.error?.message ?? 'OpenAI 응답에 내용이 없습니다.');
  }

  const parsed = parseAiResponse(content);
  logger.info('openai', `테스트케이스 ${parsed.testCases.length}건 생성`);
  return { response: parsed, prompt: userPrompt, rawResponse: content };
}
