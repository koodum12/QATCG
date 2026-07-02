import { beforeEach, describe, expect, it } from 'vitest';
import { AppDb } from './database';
import { Repositories } from './repositories';

describe('Repositories (sql.js in-memory)', () => {
  let db: AppDb;
  let repo: Repositories;

  beforeEach(async () => {
    db = await AppDb.create();
    repo = new Repositories(db);
  });

  it('프로젝트 생성/조회/삭제', async () => {
    const p = await repo.createProject('쇼핑몰');
    expect(p.id).toBeGreaterThan(0);
    expect(p.name).toBe('쇼핑몰');
    expect(repo.listProjects()).toHaveLength(1);

    await repo.deleteProject(p.id);
    expect(repo.listProjects()).toHaveLength(0);
  });

  it('분석 결과(페이지+TC+입력값) 트랜잭션 저장 및 조회', async () => {
    const p = await repo.createProject('관리자 페이지');
    const result = await repo.saveAnalysisResult({
      projectId: p.id,
      url: 'https://example.com/login',
      title: 'Login',
      html: null,
      domJson: '{"tag":"body"}',
      testCases: [
        {
          tcId: 'TC-001',
          feature: '로그인',
          purpose: '정상 로그인 확인',
          priority: 'High',
          steps: ['이메일 입력', '비밀번호 입력', '로그인 버튼 클릭'],
          expectedResult: '메인 화면으로 이동한다.',
          inputs: [
            { field: 'email', value: 'test@test.com', category: 'normal' },
            { field: 'password', value: 'Abcd1234!', category: 'normal' },
          ],
        },
        {
          tcId: 'TC-002',
          feature: '로그인',
          purpose: '이메일 미입력',
          priority: 'Medium',
          steps: ['이메일 비우기', '비밀번호 입력', '로그인'],
          expectedResult: '이메일을 입력하세요.',
          inputs: [{ field: 'email', value: '(공백)', category: 'exception' }],
        },
      ],
    });

    expect(result.testCaseCount).toBe(2);
    const pages = repo.listPages(p.id);
    expect(pages).toHaveLength(1);

    const tcs = repo.listTestCases(result.pageId);
    expect(tcs).toHaveLength(2);
    expect(tcs[0].tcId).toBe('TC-001');
    expect(tcs[0].steps).toEqual(['이메일 입력', '비밀번호 입력', '로그인 버튼 클릭']);
    expect(tcs[0].inputs).toHaveLength(2);
    expect(tcs[0].inputs[0].value).toBe('test@test.com');
  });

  it('프로젝트 삭제 시 하위 데이터 CASCADE 삭제', async () => {
    const p = await repo.createProject('회사 홈페이지');
    const { pageId } = await repo.saveAnalysisResult({
      projectId: p.id,
      url: 'https://example.com',
      title: 'Home',
      html: null,
      domJson: '{}',
      testCases: [
        {
          tcId: 'TC-001',
          feature: '네비게이션',
          purpose: '메뉴 이동',
          priority: 'Low',
          steps: ['메뉴 클릭'],
          expectedResult: '이동',
          inputs: [{ field: 'menu', value: 'About', category: 'normal' }],
        },
      ],
    });
    await repo.deleteProject(p.id);
    expect(repo.listPages(p.id)).toHaveLength(0);
    expect(repo.listTestCases(pageId)).toHaveLength(0);
  });

  it('통합 검색: 프로젝트명/URL/기능/입력값', async () => {
    const p = await repo.createProject('쇼핑몰');
    await repo.saveAnalysisResult({
      projectId: p.id,
      url: 'https://shop.example.com/login',
      title: 'Login',
      html: null,
      domJson: '{}',
      testCases: [
        {
          tcId: 'TC-001',
          feature: '로그인',
          purpose: '정상 로그인',
          priority: 'High',
          steps: ['로그인'],
          expectedResult: '성공',
          inputs: [{ field: 'email', value: 'test@test.com', category: 'normal' }],
        },
      ],
    });

    expect(repo.search('쇼핑몰').some((r) => r.matchedIn === 'project')).toBe(true);
    expect(repo.search('shop.example').some((r) => r.matchedIn === 'page')).toBe(true);
    expect(repo.search('로그인').some((r) => r.matchedIn === 'testcase')).toBe(true);
    expect(repo.search('test@test.com').some((r) => r.matchedIn === 'input')).toBe(true);
    expect(repo.search('존재하지않는검색어')).toHaveLength(0);
  });

  it('Export 번들 조인', async () => {
    const p = await repo.createProject('모바일 웹');
    await repo.saveAnalysisResult({
      projectId: p.id,
      url: 'https://m.example.com',
      title: 'Mobile',
      html: '<html></html>',
      domJson: '{}',
      testCases: [
        {
          tcId: 'TC-001',
          feature: '검색',
          purpose: '키워드 검색',
          priority: 'High',
          steps: ['검색어 입력', '검색 버튼'],
          expectedResult: '결과 표시',
          inputs: [{ field: 'keyword', value: '노트북', category: 'normal' }],
        },
      ],
    });
    const bundle = repo.getExportBundle(p.id);
    expect(bundle.project.name).toBe('모바일 웹');
    expect(bundle.pages).toHaveLength(1);
    expect(bundle.pages[0].testCases[0].inputs[0].value).toBe('노트북');
  });

  it('PromptHistory 저장/조회', async () => {
    await repo.savePromptHistory('prompt-text', 'response-text');
    const history = repo.listPromptHistory();
    expect(history).toHaveLength(1);
    expect(history[0].prompt).toBe('prompt-text');
  });
});
