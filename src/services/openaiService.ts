import { SYSTEM_PROMPT, buildUserPrompt } from '@/prompts/qaPrompt';
import { parseAiResponse, type AiResponse } from './aiSchema';
import { logger } from '@/utils/logger';
import type { PageAnalysis } from '@/types/dom';

/**
 * OpenAI Chat Completions API 호출 서비스.
 * background service worker에서 실행되며, fetch를 주입받아 테스트 가능하다.
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
export const DEFAULT_MODEL = 'gpt-4o-mini';

export interface GenerateOptions {
  apiKey: string;
  model?: string;
  /** 테스트용 fetch 주입 지점 */
  fetchFn?: typeof fetch;
}

export interface GenerateOutput {
  response: AiResponse;
  /** PromptHistory 저장용 원본 */
  prompt: string;
  rawResponse: string;
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

  const body = {
    model: options.model || DEFAULT_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  };

  logger.info('openai', `요청 시작 (model=${body.model}, prompt=${userPrompt.length}자)`);
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
    if (res.status === 429) throw new Error('OpenAI API 사용량 한도를 초과했습니다.');
    throw new Error(`OpenAI API 오류 (HTTP ${res.status})`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI 응답에 내용이 없습니다.');

  const parsed = parseAiResponse(content);
  logger.info('openai', `테스트케이스 ${parsed.testCases.length}건 생성`);
  return { response: parsed, prompt: userPrompt, rawResponse: content };
}
