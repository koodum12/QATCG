import { describe, expect, it } from 'vitest';
import { parseAiResponse } from './aiSchema';

const VALID = {
  pageSummary: '로그인 페이지',
  testCases: [
    {
      tcId: 'TC-001',
      feature: '로그인',
      purpose: '정상 로그인 확인',
      priority: 'High',
      steps: ['이메일 입력', '비밀번호 입력', '로그인 버튼 클릭'],
      inputs: [
        { field: 'email', value: 'test@test.com', category: 'normal' },
        { field: 'password', value: 'Abcd1234!', category: 'normal' },
      ],
      expectedResult: '메인 화면으로 이동한다.',
    },
  ],
};

describe('parseAiResponse', () => {
  it('정상 JSON을 파싱한다', () => {
    const result = parseAiResponse(JSON.stringify(VALID));
    expect(result.testCases).toHaveLength(1);
    expect(result.testCases[0].tcId).toBe('TC-001');
    expect(result.testCases[0].priority).toBe('High');
  });

  it('코드펜스로 감싼 응답도 파싱한다', () => {
    const fenced = '```json\n' + JSON.stringify(VALID) + '\n```';
    const result = parseAiResponse(fenced);
    expect(result.testCases[0].feature).toBe('로그인');
  });

  it('priority 대소문자/한글을 정규화한다', () => {
    const variant = {
      testCases: [
        { ...VALID.testCases[0], priority: 'high' },
        { ...VALID.testCases[0], tcId: 'TC-002', priority: '높음' },
        { ...VALID.testCases[0], tcId: 'TC-003', priority: 'unknown-value' },
      ],
    };
    const result = parseAiResponse(JSON.stringify(variant));
    expect(result.testCases[0].priority).toBe('High');
    expect(result.testCases[1].priority).toBe('High');
    expect(result.testCases[2].priority).toBe('Medium');
  });

  it('category 한글/영문을 정규화한다', () => {
    const variant = {
      testCases: [
        {
          ...VALID.testCases[0],
          inputs: [
            { field: 'a', value: 'x', category: '경계값' },
            { field: 'b', value: 'y', category: 'Exception' },
            { field: 'c', value: 'z', category: 'whatever' },
          ],
        },
      ],
    };
    const result = parseAiResponse(JSON.stringify(variant));
    expect(result.testCases[0].inputs.map((i) => i.category)).toEqual([
      'boundary',
      'exception',
      'normal',
    ]);
  });

  it('입력값의 숫자/null을 문자열로 변환한다', () => {
    const variant = {
      testCases: [
        {
          ...VALID.testCases[0],
          inputs: [
            { field: 'age', value: 30 },
            { field: 'nickname', value: null },
          ],
        },
      ],
    };
    const result = parseAiResponse(JSON.stringify(variant));
    expect(result.testCases[0].inputs[0].value).toBe('30');
    expect(result.testCases[0].inputs[1].value).toBe('null');
  });

  it('JSON이 아니면 명확한 에러를 던진다', () => {
    expect(() => parseAiResponse('죄송합니다, 분석할 수 없습니다.')).toThrow(
      'AI 응답이 유효한 JSON이 아닙니다.',
    );
  });

  it('testCases가 비어 있으면 스키마 오류를 던진다', () => {
    expect(() => parseAiResponse('{"testCases":[]}')).toThrow('AI 응답 스키마 검증 실패');
  });
});
