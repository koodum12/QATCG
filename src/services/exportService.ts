import * as XLSX from 'xlsx';
import type { ExportBundle } from '@/types/messages';

/**
 * Export 서비스: 프로젝트 데이터를 JSON / Markdown / CSV / XLSX로 변환한다.
 * 순수 함수로 구성되어 dashboard와 테스트 양쪽에서 사용된다.
 */

/** 표 형식(CSV/XLSX)용 평탄화된 행 */
export interface FlatRow {
  project: string;
  pageUrl: string;
  pageTitle: string;
  tcId: string;
  feature: string;
  purpose: string;
  priority: string;
  steps: string;
  inputs: string;
  expectedResult: string;
}

/** 번들을 표 형식 행 배열로 평탄화 */
export function flattenBundle(bundle: ExportBundle): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const { page, testCases } of bundle.pages) {
    for (const tc of testCases) {
      rows.push({
        project: bundle.project.name,
        pageUrl: page.url,
        pageTitle: page.title,
        tcId: tc.tcId,
        feature: tc.feature,
        purpose: tc.purpose,
        priority: tc.priority,
        steps: tc.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
        inputs: tc.inputs.map((i) => `${i.field}=${i.value} (${i.category})`).join('\n'),
        expectedResult: tc.expectedResult,
      });
    }
  }
  return rows;
}

/** JSON 문자열로 변환 (원본 구조 유지, html은 용량 문제로 제외) */
export function toJson(bundle: ExportBundle): string {
  const slim = {
    project: bundle.project,
    pages: bundle.pages.map(({ page, testCases }) => ({
      page: { ...page, html: undefined, domJson: undefined },
      testCases,
    })),
  };
  return JSON.stringify(slim, null, 2);
}

/** Markdown 문서로 변환 */
export function toMarkdown(bundle: ExportBundle): string {
  const lines: string[] = [`# ${bundle.project.name} — QA 테스트 케이스`, ''];
  for (const { page, testCases } of bundle.pages) {
    lines.push(`## ${page.title}`, ``, `URL: ${page.url}`, '');
    for (const tc of testCases) {
      lines.push(`### ${tc.tcId} — ${tc.feature}`, '');
      lines.push(`- **목적**: ${tc.purpose}`);
      lines.push(`- **우선순위**: ${tc.priority}`);
      lines.push(`- **절차**:`);
      tc.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
      if (tc.inputs.length > 0) {
        lines.push(`- **입력값**:`);
        lines.push('', '  | 필드 | 값 | 분류 |', '  | --- | --- | --- |');
        for (const inp of tc.inputs) {
          lines.push(`  | ${inp.field} | ${inp.value.replace(/\|/g, '\\|')} | ${inp.category} |`);
        }
        lines.push('');
      }
      lines.push(`- **예상 결과**: ${tc.expectedResult}`, '');
    }
  }
  return lines.join('\n');
}

/** CSV 필드 이스케이프 */
function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const CSV_HEADERS: Array<keyof FlatRow> = [
  'project',
  'pageUrl',
  'pageTitle',
  'tcId',
  'feature',
  'purpose',
  'priority',
  'steps',
  'inputs',
  'expectedResult',
];

/** CSV 문자열로 변환 (엑셀 한글 호환을 위해 BOM 포함) */
export function toCsv(bundle: ExportBundle): string {
  const rows = flattenBundle(bundle);
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(CSV_HEADERS.map((h) => csvEscape(row[h])).join(','));
  }
  return '﻿' + lines.join('\n');
}

/** XLSX 바이너리(ArrayBuffer)로 변환 */
export function toXlsx(bundle: ExportBundle): ArrayBuffer {
  const rows = flattenBundle(bundle);
  const sheet = XLSX.utils.json_to_sheet(rows, { header: CSV_HEADERS as string[] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'TestCases');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
