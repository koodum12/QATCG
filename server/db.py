"""SQLite 데이터 계층.

표준 sqlite3를 사용하며, FastAPI 워커 스레드와 잡 처리 스레드에서 동시 접근하므로
단일 커넥션 + 전역 Lock으로 직렬화한다. 실제 .db 파일이 생성되어 외부 도구로 열람 가능하다.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS Folder (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS Project (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  folderId INTEGER REFERENCES Folder(id),
  context TEXT NOT NULL DEFAULT '',
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
  priority TEXT NOT NULL,
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
"""


class Database:
    def __init__(self, path: str) -> None:
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON;")
        with self._lock:
            self._conn.executescript(SCHEMA)
            # 기존 DB 마이그레이션: Project에 folderId/context 컬럼이 없으면 추가
            for ddl in (
                "ALTER TABLE Project ADD COLUMN folderId INTEGER REFERENCES Folder(id)",
                "ALTER TABLE Project ADD COLUMN context TEXT NOT NULL DEFAULT ''",
                "ALTER TABLE Folder ADD COLUMN context TEXT NOT NULL DEFAULT ''",
            ):
                try:
                    self._conn.execute(ddl)
                except sqlite3.OperationalError:
                    pass  # 이미 존재
            self._conn.commit()

    def _rows(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        with self._lock:
            cur = self._conn.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]

    def _exec(self, sql: str, params: tuple = ()) -> int:
        with self._lock:
            cur = self._conn.execute(sql, params)
            self._conn.commit()
            return int(cur.lastrowid)

    # ---------- Folder ----------
    def list_folders(self) -> list[dict]:
        return self._rows("SELECT * FROM Folder ORDER BY name")

    def create_folder(self, name: str) -> dict:
        fid = self._exec("INSERT INTO Folder (name) VALUES (?)", (name,))
        return self._rows("SELECT * FROM Folder WHERE id = ?", (fid,))[0]

    def get_folder(self, folder_id: int) -> dict | None:
        rows = self._rows("SELECT * FROM Folder WHERE id = ?", (folder_id,))
        return rows[0] if rows else None

    def update_folder(self, folder_id: int, context: str) -> dict | None:
        self._exec("UPDATE Folder SET context = ? WHERE id = ?", (context, folder_id))
        return self.get_folder(folder_id)

    def delete_folder(self, folder_id: int) -> None:
        """폴더 삭제. 소속 프로젝트는 지우지 않고 미분류로 옮긴다."""
        self._exec("UPDATE Project SET folderId = NULL WHERE folderId = ?", (folder_id,))
        self._exec("DELETE FROM Folder WHERE id = ?", (folder_id,))

    # ---------- Project ----------
    def list_projects(self) -> list[dict]:
        return self._rows("SELECT * FROM Project ORDER BY createdAt DESC, id DESC")

    def create_project(self, name: str, folder_id: int | None = None) -> dict:
        pid = self._exec(
            "INSERT INTO Project (name, folderId) VALUES (?, ?)", (name, folder_id)
        )
        return self._rows("SELECT * FROM Project WHERE id = ?", (pid,))[0]

    def get_project(self, project_id: int) -> dict | None:
        rows = self._rows("SELECT * FROM Project WHERE id = ?", (project_id,))
        return rows[0] if rows else None

    def update_project(
        self, project_id: int, *, context: str | None = None,
        folder_id: int | None = None, set_folder: bool = False,
    ) -> dict | None:
        """context 또는 folderId를 갱신. set_folder=True면 folder_id가 None이어도 반영(미분류 이동)."""
        if context is not None:
            self._exec("UPDATE Project SET context = ? WHERE id = ?", (context, project_id))
        if set_folder:
            self._exec("UPDATE Project SET folderId = ? WHERE id = ?", (folder_id, project_id))
        return self.get_project(project_id)

    def delete_project(self, project_id: int) -> None:
        self._exec("DELETE FROM Project WHERE id = ?", (project_id,))

    # ---------- Page ----------
    def list_pages(self, project_id: int) -> list[dict]:
        return self._rows(
            "SELECT * FROM Page WHERE projectId = ? ORDER BY analyzedAt DESC, id DESC",
            (project_id,),
        )

    def delete_page(self, page_id: int) -> None:
        self._exec("DELETE FROM Page WHERE id = ?", (page_id,))

    # ---------- TestCase + InputData ----------
    def _test_case_with_inputs(self, row: dict) -> dict:
        try:
            steps = json.loads(row["steps"])
            if not isinstance(steps, list):
                steps = [str(steps)]
        except (json.JSONDecodeError, TypeError):
            steps = [row["steps"]]
        inputs = self._rows(
            "SELECT * FROM InputData WHERE testcaseId = ? ORDER BY id", (row["id"],)
        )
        return {**row, "steps": steps, "inputs": inputs}

    def list_test_cases(self, page_id: int) -> list[dict]:
        rows = self._rows("SELECT * FROM TestCase WHERE pageId = ? ORDER BY tcId", (page_id,))
        return [self._test_case_with_inputs(r) for r in rows]

    def save_analysis_result(
        self,
        project_id: int,
        url: str,
        title: str,
        html: str | None,
        dom_json: str,
        test_cases: list[dict],
    ) -> dict:
        """페이지 + 테스트케이스 + 입력값을 하나의 트랜잭션으로 저장."""
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO Page (projectId, url, title, html, domJson) VALUES (?, ?, ?, ?, ?)",
                (project_id, url, title, html, dom_json),
            )
            page_id = int(cur.lastrowid)
            for tc in test_cases:
                tc_cur = self._conn.execute(
                    """INSERT INTO TestCase (pageId, tcId, feature, purpose, priority, steps, expectedResult)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        page_id,
                        tc["tcId"],
                        tc["feature"],
                        tc["purpose"],
                        tc["priority"],
                        json.dumps(tc["steps"], ensure_ascii=False),
                        tc["expectedResult"],
                    ),
                )
                tc_id = int(tc_cur.lastrowid)
                for inp in tc.get("inputs", []):
                    self._conn.execute(
                        "INSERT INTO InputData (testcaseId, field, value, category) VALUES (?, ?, ?, ?)",
                        (tc_id, inp["field"], inp["value"], inp["category"]),
                    )
            self._conn.commit()
        return {"pageId": page_id, "testCaseCount": len(test_cases)}

    def save_prompt_history(self, prompt: str, response: str) -> None:
        self._exec(
            "INSERT INTO PromptHistory (prompt, response) VALUES (?, ?)", (prompt, response)
        )

    # ---------- 검색 ----------
    def search(self, query: str) -> list[dict]:
        like = f"%{query}%"
        results: list[dict] = []

        for r in self._rows("SELECT id, name FROM Project WHERE name LIKE ?", (like,)):
            results.append({
                "projectId": r["id"], "projectName": r["name"], "pageId": 0,
                "pageUrl": "", "pageTitle": "", "testCaseId": None, "tcId": None,
                "feature": None, "matchedIn": "project", "snippet": r["name"],
            })

        for r in self._rows(
            """SELECT p.id, p.url, p.title, p.projectId, pr.name AS projectName
               FROM Page p JOIN Project pr ON pr.id = p.projectId
               WHERE p.url LIKE ? OR p.title LIKE ?""",
            (like, like),
        ):
            results.append({
                "projectId": r["projectId"], "projectName": r["projectName"],
                "pageId": r["id"], "pageUrl": r["url"], "pageTitle": r["title"],
                "testCaseId": None, "tcId": None, "feature": None,
                "matchedIn": "page", "snippet": r["url"],
            })

        for r in self._rows(
            """SELECT tc.id, tc.tcId, tc.feature, tc.purpose,
                      p.id AS pageId, p.url, p.title, p.projectId, pr.name AS projectName
               FROM TestCase tc JOIN Page p ON p.id = tc.pageId
               JOIN Project pr ON pr.id = p.projectId
               WHERE tc.feature LIKE ? OR tc.tcId LIKE ? OR tc.purpose LIKE ?""",
            (like, like, like),
        ):
            results.append({
                "projectId": r["projectId"], "projectName": r["projectName"],
                "pageId": r["pageId"], "pageUrl": r["url"], "pageTitle": r["title"],
                "testCaseId": r["id"], "tcId": r["tcId"], "feature": r["feature"],
                "matchedIn": "testcase", "snippet": f'{r["feature"]} — {r["purpose"]}',
            })

        for r in self._rows(
            """SELECT i.value, i.field, i.testcaseId, tc.tcId, tc.feature,
                      p.id AS pageId, p.url, p.title, p.projectId, pr.name AS projectName
               FROM InputData i JOIN TestCase tc ON tc.id = i.testcaseId
               JOIN Page p ON p.id = tc.pageId JOIN Project pr ON pr.id = p.projectId
               WHERE i.value LIKE ? OR i.field LIKE ?""",
            (like, like),
        ):
            results.append({
                "projectId": r["projectId"], "projectName": r["projectName"],
                "pageId": r["pageId"], "pageUrl": r["url"], "pageTitle": r["title"],
                "testCaseId": r["testcaseId"], "tcId": r["tcId"], "feature": r["feature"],
                "matchedIn": "input", "snippet": f'{r["field"]}: {r["value"]}',
            })
        return results

    # ---------- Export ----------
    def export_bundle(self, project_id: int) -> dict:
        proj = self._rows("SELECT * FROM Project WHERE id = ?", (project_id,))
        if not proj:
            raise KeyError(f"프로젝트를 찾을 수 없습니다: {project_id}")
        pages = []
        for page in self.list_pages(project_id):
            pages.append({"page": page, "testCases": self.list_test_cases(page["id"])})
        return {"project": proj[0], "pages": pages}
