import { z } from 'zod';

/**
 * OpenAI 응답 검증 스키마 (Zod).
 * 모델 출력이 흔들리는 경우(대소문자, 코드펜스 등)를 관대하게 정규화한다.
 */

/** priority 문자열을 표준 값으로 정규화 */
const PrioritySchema = z
  .string()
  .transform((v) => {
    const normalized = v.trim().toLowerCase();
    if (normalized === 'high' || normalized === '높음') return 'High';
    if (normalized === 'low' || normalized === '낮음') return 'Low';
    return 'Medium';
  })
  .pipe(z.enum(['High', 'Medium', 'Low']));

/** category 문자열을 표준 값으로 정규화 */
const CategorySchema = z
  .string()
  .transform((v) => {
    const normalized = v.trim().toLowerCase();
    if (['boundary', '경계', '경계값'].includes(normalized)) return 'boundary';
    if (['exception', '예외', 'error', 'invalid'].includes(normalized)) return 'exception';
    return 'normal';
  });

export const AiInputSchema = z.object({
  field: z.string().min(1),
  // 모델이 숫자/불리언/null을 줄 수 있으므로 문자열로 강제 변환
  value: z
    .union([z.string(), z.number(), z.boolean(), z.null()])
    .transform((v) => (v === null ? 'null' : String(v))),
  category: CategorySchema.default('normal'),
});

export const AiTestCaseSchema = z.object({
  tcId: z.string().min(1),
  feature: z.string().min(1),
  purpose: z.string().min(1),
  priority: PrioritySchema.default('Medium'),
  steps: z.array(z.string()).min(1),
  inputs: z.array(AiInputSchema).default([]),
  expectedResult: z.string().min(1),
});

export const AiResponseSchema = z.object({
  pageSummary: z.string().optional(),
  testCases: z.array(AiTestCaseSchema).min(1),
});

export type AiTestCase = z.infer<typeof AiTestCaseSchema>;
export type AiResponse = z.infer<typeof AiResponseSchema>;

/**
 * OpenAI Responses API Structured Outputs(text.format = json_schema, strict: true)용 JSON Schema.
 * strict 모드 규칙: 모든 object에 additionalProperties:false, 모든 property는 required.
 * Zod 스키마(AiResponseSchema)와 형태를 일치시켜, 모델이 이 스키마를 그대로 지키도록 강제한다.
 */
export const AI_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['pageSummary', 'testCases'],
  properties: {
    pageSummary: { type: 'string' },
    testCases: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tcId', 'feature', 'purpose', 'priority', 'steps', 'inputs', 'expectedResult'],
        properties: {
          tcId: { type: 'string' },
          feature: { type: 'string' },
          purpose: { type: 'string' },
          priority: { type: 'string', enum: ['High', 'Medium', 'Low'] },
          steps: { type: 'array', items: { type: 'string' } },
          inputs: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['field', 'value', 'category'],
              properties: {
                field: { type: 'string' },
                value: { type: 'string' },
                category: { type: 'string', enum: ['normal', 'boundary', 'exception'] },
              },
            },
          },
          expectedResult: { type: 'string' },
        },
      },
    },
  },
} as const;

/**
 * 모델 응답 텍스트에서 JSON을 추출·검증한다.
 * 코드펜스(```json ... ```)로 감싸진 응답도 처리한다.
 */
export function parseAiResponse(raw: string): AiResponse {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('AI 응답이 유효한 JSON이 아닙니다.');
  }

  const result = AiResponseSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`AI 응답 스키마 검증 실패: ${result.error.issues[0]?.message ?? '알 수 없는 오류'}`);
  }
  return result.data;
}
