/** SQLite 테이블 스키마 정의. sql.js로 실행된다. */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS Project (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Page (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projectId INTEGER NOT NULL REFERENCES Project(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  html TEXT,
  domJson TEXT NOT NULL,
  analyzedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS TestCase (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pageId INTEGER NOT NULL REFERENCES Page(id) ON DELETE CASCADE,
  tcId TEXT NOT NULL,
  feature TEXT NOT NULL,
  purpose TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('High','Medium','Low')),
  steps TEXT NOT NULL,
  expectedResult TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS InputData (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  testcaseId INTEGER NOT NULL REFERENCES TestCase(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  category TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS PromptHistory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_page_project ON Page(projectId);
CREATE INDEX IF NOT EXISTS idx_testcase_page ON TestCase(pageId);
CREATE INDEX IF NOT EXISTS idx_inputdata_testcase ON InputData(testcaseId);
`;
