import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { flattenBundle, toCsv, toJson, toMarkdown, toXlsx } from './exportService';
import type { ExportBundle } from '@/types/messages';

const BUNDLE: ExportBundle = {
  project: { id: 1, name: '쇼핑몰', createdAt: '2026-07-02 00:00:00' },
  pages: [
    {
      page: {
        id: 10,
        projectId: 1,
        url: 'https://shop.example.com/login',
        title: 'Login',
        html: null,
        domJson: '{}',
        analyzedAt: '2026-07-02 00:00:00',
      },
      testCases: [
        {
          id: 100,
          pageId: 10,
          tcId: 'TC-001',
          feature: '로그인',
          purpose: '정상 로그인',
          priority: 'High',
          steps: ['이메일 입력', '비밀번호 입력, 확인', '로그인'],
          expectedResult: '메인 이동',
          inputs: [
            { id: 1000, testcaseId: 100, field: 'email', value: 'test@test.com', category: 'normal' },
            { id: 1001, testcaseId: 100, field: 'password', value: 'a"b,c', category: 'exception' },
          ],
        },
      ],
    },
  ],
};

describe('exportService', () => {
  it('flattenBundle: TC를 표 행으로 평탄화', () => {
    const rows = flattenBundle(BUNDLE);
    expect(rows).toHaveLength(1);
    expect(rows[0].tcId).toBe('TC-001');
    expect(rows[0].steps).toContain('1. 이메일 입력');
    expect(rows[0].inputs).toContain('email=test@test.com (normal)');
  });

  it('toJson: 유효한 JSON이며 핵심 필드 포함', () => {
    const parsed = JSON.parse(toJson(BUNDLE));
    expect(parsed.project.name).toBe('쇼핑몰');
    expect(parsed.pages[0].testCases[0].tcId).toBe('TC-001');
  });

  it('toMarkdown: 제목/표/절차 포함', () => {
    const md = toMarkdown(BUNDLE);
    expect(md).toContain('# 쇼핑몰 — QA 테스트 케이스');
    expect(md).toContain('### TC-001 — 로그인');
    expect(md).toContain('| email | test@test.com | normal |');
    expect(md).toContain('1. 이메일 입력');
  });

  it('toCsv: BOM 포함, 쉼표/따옴표 이스케이프', () => {
    const csv = toCsv(BUNDLE);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\n');
    expect(lines[0]).toBe(
      'project,pageUrl,pageTitle,tcId,feature,purpose,priority,steps,inputs,expectedResult',
    );
    // 쉼표가 든 절차와 따옴표가 든 입력값이 안전하게 이스케이프됐는지
    expect(csv).toContain('""b');
  });

  it('toXlsx: 생성된 파일을 다시 읽어 데이터 검증', () => {
    const buf = toXlsx(BUNDLE);
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets['TestCases'];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
    expect(rows).toHaveLength(1);
    expect(rows[0].tcId).toBe('TC-001');
    expect(rows[0].project).toBe('쇼핑몰');
  });
});
