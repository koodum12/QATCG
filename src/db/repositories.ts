import type { AppDb } from './database';
import type {
  InputData,
  Page,
  Project,
  PromptHistory,
  SearchResult,
  TestCase,
} from '@/types/models';
import type { ExportBundle, TestCaseWithInputs } from '@/types/messages';

/**
 * 도메인별 리포지토리. SQL을 이 파일에 모아 유지보수를 단순화한다.
 * steps 컬럼은 JSON 문자열로 저장하고 조회 시 파싱한다.
 */

interface TestCaseRow extends Omit<TestCase, 'steps'> {
  steps: string;
}

function parseTestCaseRow(row: TestCaseRow): TestCase {
  let steps: string[] = [];
  try {
    const parsed = JSON.parse(row.steps);
    if (Array.isArray(parsed)) steps = parsed.map(String);
  } catch {
    steps = [row.steps];
  }
  return { ...row, steps };
}

export class Repositories {
  constructor(private db: AppDb) {}

  // ---------- Project ----------

  listProjects(): Project[] {
    return this.db.query<Project>(
      'SELECT * FROM Project ORDER BY createdAt DESC, id DESC',
    );
  }

  async createProject(name: string): Promise<Project> {
    const id = await this.db.run('INSERT INTO Project (name) VALUES (?)', [name]);
    const rows = this.db.query<Project>('SELECT * FROM Project WHERE id = ?', [id]);
    return rows[0];
  }

  async deleteProject(projectId: number): Promise<void> {
    await this.db.run('DELETE FROM Project WHERE id = ?', [projectId]);
  }

  // ---------- Page ----------

  listPages(projectId: number): Page[] {
    return this.db.query<Page>(
      'SELECT * FROM Page WHERE projectId = ? ORDER BY analyzedAt DESC, id DESC',
      [projectId],
    );
  }

  async createPage(input: {
    projectId: number;
    url: string;
    title: string;
    html: string | null;
    domJson: string;
  }): Promise<Page> {
    const id = await this.db.run(
      'INSERT INTO Page (projectId, url, title, html, domJson) VALUES (?, ?, ?, ?, ?)',
      [input.projectId, input.url, input.title, input.html, input.domJson],
    );
    return this.db.query<Page>('SELECT * FROM Page WHERE id = ?', [id])[0];
  }

  async deletePage(pageId: number): Promise<void> {
    await this.db.run('DELETE FROM Page WHERE id = ?', [pageId]);
  }

  // ---------- TestCase + InputData ----------

  listTestCases(pageId: number): TestCaseWithInputs[] {
    const rows = this.db.query<TestCaseRow>(
      'SELECT * FROM TestCase WHERE pageId = ? ORDER BY tcId',
      [pageId],
    );
    return rows.map((row) => ({
      ...parseTestCaseRow(row),
      inputs: this.listInputData(row.id),
    }));
  }

  listInputData(testcaseId: number): InputData[] {
    return this.db.query<InputData>(
      'SELECT * FROM InputData WHERE testcaseId = ? ORDER BY id',
      [testcaseId],
    );
  }

  /** 페이지 1건 + 테스트케이스 N건 + 입력값을 하나의 트랜잭션으로 저장 */
  async saveAnalysisResult(input: {
    projectId: number;
    url: string;
    title: string;
    html: string | null;
    domJson: string;
    testCases: Array<{
      tcId: string;
      feature: string;
      purpose: string;
      priority: TestCase['priority'];
      steps: string[];
      expectedResult: string;
      inputs: Array<{ field: string; value: string; category: string }>;
    }>;
  }): Promise<{ pageId: number; testCaseCount: number }> {
    let pageId = 0;
    await this.db.transaction((exec) => {
      pageId = exec(
        'INSERT INTO Page (projectId, url, title, html, domJson) VALUES (?, ?, ?, ?, ?)',
        [input.projectId, input.url, input.title, input.html, input.domJson],
      );
      for (const tc of input.testCases) {
        const tcRowId = exec(
          `INSERT INTO TestCase (pageId, tcId, feature, purpose, priority, steps, expectedResult)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            pageId,
            tc.tcId,
            tc.feature,
            tc.purpose,
            tc.priority,
            JSON.stringify(tc.steps),
            tc.expectedResult,
          ],
        );
        for (const inp of tc.inputs) {
          exec(
            'INSERT INTO InputData (testcaseId, field, value, category) VALUES (?, ?, ?, ?)',
            [tcRowId, inp.field, inp.value, inp.category],
          );
        }
      }
    });
    return { pageId, testCaseCount: input.testCases.length };
  }

  // ---------- PromptHistory ----------

  async savePromptHistory(prompt: string, response: string): Promise<void> {
    await this.db.run(
      'INSERT INTO PromptHistory (prompt, response) VALUES (?, ?)',
      [prompt, response],
    );
  }

  listPromptHistory(limit = 50): PromptHistory[] {
    return this.db.query<PromptHistory>(
      'SELECT * FROM PromptHistory ORDER BY id DESC LIMIT ?',
      [limit],
    );
  }

  // ---------- 검색 ----------

  /** URL / 기능 / 테스트명(tcId·purpose) / 입력값 / 프로젝트명 통합 검색 */
  search(query: string): SearchResult[] {
    const like = `%${query}%`;
    const results: SearchResult[] = [];

    // 프로젝트명 매칭
    for (const row of this.db.query<{ id: number; name: string }>(
      'SELECT id, name FROM Project WHERE name LIKE ?',
      [like],
    )) {
      results.push({
        projectId: row.id,
        projectName: row.name,
        pageId: 0,
        pageUrl: '',
        pageTitle: '',
        testCaseId: null,
        tcId: null,
        feature: null,
        matchedIn: 'project',
        snippet: row.name,
      });
    }

    // 페이지 URL/제목 매칭
    for (const row of this.db.query<{
      id: number;
      url: string;
      title: string;
      projectId: number;
      projectName: string;
    }>(
      `SELECT p.id, p.url, p.title, p.projectId, pr.name AS projectName
       FROM Page p JOIN Project pr ON pr.id = p.projectId
       WHERE p.url LIKE ? OR p.title LIKE ?`,
      [like, like],
    )) {
      results.push({
        projectId: row.projectId,
        projectName: row.projectName,
        pageId: row.id,
        pageUrl: row.url,
        pageTitle: row.title,
        testCaseId: null,
        tcId: null,
        feature: null,
        matchedIn: 'page',
        snippet: row.url,
      });
    }

    // 테스트케이스(기능/tcId/목적) 매칭
    for (const row of this.db.query<{
      id: number;
      tcId: string;
      feature: string;
      purpose: string;
      pageId: number;
      url: string;
      title: string;
      projectId: number;
      projectName: string;
    }>(
      `SELECT tc.id, tc.tcId, tc.feature, tc.purpose,
              p.id AS pageId, p.url, p.title, p.projectId, pr.name AS projectName
       FROM TestCase tc
       JOIN Page p ON p.id = tc.pageId
       JOIN Project pr ON pr.id = p.projectId
       WHERE tc.feature LIKE ? OR tc.tcId LIKE ? OR tc.purpose LIKE ?`,
      [like, like, like],
    )) {
      results.push({
        projectId: row.projectId,
        projectName: row.projectName,
        pageId: row.pageId,
        pageUrl: row.url,
        pageTitle: row.title,
        testCaseId: row.id,
        tcId: row.tcId,
        feature: row.feature,
        matchedIn: 'testcase',
        snippet: `${row.feature} — ${row.purpose}`,
      });
    }

    // 입력값 매칭
    for (const row of this.db.query<{
      value: string;
      field: string;
      testcaseId: number;
      tcId: string;
      feature: string;
      pageId: number;
      url: string;
      title: string;
      projectId: number;
      projectName: string;
    }>(
      `SELECT i.value, i.field, i.testcaseId, tc.tcId, tc.feature,
              p.id AS pageId, p.url, p.title, p.projectId, pr.name AS projectName
       FROM InputData i
       JOIN TestCase tc ON tc.id = i.testcaseId
       JOIN Page p ON p.id = tc.pageId
       JOIN Project pr ON pr.id = p.projectId
       WHERE i.value LIKE ? OR i.field LIKE ?`,
      [like, like],
    )) {
      results.push({
        projectId: row.projectId,
        projectName: row.projectName,
        pageId: row.pageId,
        pageUrl: row.url,
        pageTitle: row.title,
        testCaseId: row.testcaseId,
        tcId: row.tcId,
        feature: row.feature,
        matchedIn: 'input',
        snippet: `${row.field}: ${row.value}`,
      });
    }

    return results;
  }

  // ---------- Export ----------

  /** 프로젝트 전체 데이터를 Export용으로 조인해 반환 */
  getExportBundle(projectId: number): ExportBundle {
    const project = this.db.query<Project>(
      'SELECT * FROM Project WHERE id = ?',
      [projectId],
    )[0];
    if (!project) throw new Error(`프로젝트를 찾을 수 없습니다: ${projectId}`);
    const pages = this.listPages(projectId).map((page) => ({
      page,
      testCases: this.listTestCases(page.id),
    }));
    return { project, pages };
  }
}
