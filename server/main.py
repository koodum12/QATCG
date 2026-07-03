"""AI QA Test Case Generator — 로컬 백엔드 서버 (FastAPI).

확장 프로그램은 DOM 수집만 하고, 생성 작업(OpenAI 호출 + 저장)은 이 서버에 잡으로 넘긴다.
그래서 팝업이 닫히거나 확장 서비스 워커가 종료돼도 서버에서 생성이 끝까지 진행된다.
확장은 잡 상태를 폴링해 진행 바를 그린다.

실행: cd server && pip install -r requirements.txt && cp .env.example .env (키 입력) &&
      uvicorn main:app --port 8787
"""
from __future__ import annotations

import os
import threading
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import Database
from openai_client import (
    DEFAULT_CLASSIFY_MODEL,
    OpenAIError,
    classify_test_cases,
    generate_test_cases,
)

load_dotenv()

app = FastAPI(title="AI QA Test Case Generator API")

# 확장(chrome-extension://...) 및 로컬 페이지에서의 호출 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

db = Database(os.getenv("DB_PATH", "qa.db"))

# 런타임에서 변경 가능한 설정 (키는 .env에서만 읽고 노출하지 않는다)
config = {
    "model": os.getenv("OPENAI_MODEL", "gpt-5.5"),
    "reasoningEffort": os.getenv("REASONING_EFFORT", "medium"),
    # 난이도/테스트 방식 분류용 경량 모델
    "classifyModel": os.getenv("CLASSIFY_MODEL", DEFAULT_CLASSIFY_MODEL),
}

# 잡 레지스트리 (프로세스 메모리). 진행 바를 위한 stage/progress를 담는다.
jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()


def _set_job(job_id: str, **fields) -> None:
    with jobs_lock:
        jobs[job_id].update(fields)


# ---------- 스키마 ----------
class ProjectIn(BaseModel):
    name: str
    folderId: int | None = None


class ProjectUpdateIn(BaseModel):
    """부분 갱신: 넘어온 필드만 반영한다. folderId=None은 미분류 이동."""
    context: str | None = None
    folderId: int | None = None
    setFolder: bool = False


class FolderIn(BaseModel):
    name: str


class ConfigIn(BaseModel):
    model: str
    reasoningEffort: str


class GenerateIn(BaseModel):
    projectId: int
    analysis: dict
    deep: bool = False


# ---------- 상태/설정 ----------
@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "model": config["model"],
        "reasoningEffort": config["reasoningEffort"],
        "hasApiKey": bool(os.getenv("OPENAI_API_KEY")),
    }


@app.post("/config")
def update_config(body: ConfigIn) -> dict:
    config["model"] = body.model or config["model"]
    config["reasoningEffort"] = body.reasoningEffort or config["reasoningEffort"]
    return {"ok": True}


# ---------- Folder ----------
@app.get("/folders")
def get_folders() -> list[dict]:
    return db.list_folders()


@app.post("/folders")
def create_folder(body: FolderIn) -> dict:
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "폴더 이름을 입력하세요.")
    return db.create_folder(name)


class FolderUpdateIn(BaseModel):
    context: str


@app.patch("/folders/{folder_id}")
def update_folder(folder_id: int, body: FolderUpdateIn) -> dict:
    updated = db.update_folder(folder_id, body.context)
    if not updated:
        raise HTTPException(404, f"폴더를 찾을 수 없습니다: {folder_id}")
    return updated


@app.delete("/folders/{folder_id}")
def delete_folder(folder_id: int) -> dict:
    db.delete_folder(folder_id)
    return {"ok": True}


# ---------- Project / Page / TestCase ----------
@app.get("/projects")
def get_projects() -> list[dict]:
    return db.list_projects()


@app.post("/projects")
def create_project(body: ProjectIn) -> dict:
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "프로젝트 이름을 입력하세요.")
    return db.create_project(name, body.folderId)


@app.patch("/projects/{project_id}")
def update_project(project_id: int, body: ProjectUpdateIn) -> dict:
    updated = db.update_project(
        project_id,
        context=body.context,
        folder_id=body.folderId,
        set_folder=body.setFolder,
    )
    if not updated:
        raise HTTPException(404, f"프로젝트를 찾을 수 없습니다: {project_id}")
    return updated


@app.delete("/projects/{project_id}")
def delete_project(project_id: int) -> dict:
    db.delete_project(project_id)
    return {"ok": True}


@app.get("/projects/{project_id}/pages")
def get_pages(project_id: int) -> list[dict]:
    return db.list_pages(project_id)


@app.delete("/pages/{page_id}")
def delete_page(page_id: int) -> dict:
    db.delete_page(page_id)
    return {"ok": True}


@app.get("/pages/{page_id}/testcases")
def get_test_cases(page_id: int) -> list[dict]:
    return db.list_test_cases(page_id)


def _classify_page(page_id: int) -> int:
    """페이지의 전체 TC를 gpt-4o-mini로 분류해 저장. 분류된 건수를 반환."""
    tcs = db.list_test_cases(page_id)
    mapping = classify_test_cases(
        tcs, api_key=os.getenv("OPENAI_API_KEY", ""), model=config["classifyModel"]
    )
    for tc_id, cls in mapping.items():
        db.set_test_case_classification(tc_id, cls["difficulty"], cls["testType"])
    return len(mapping)


@app.post("/pages/{page_id}/classify")
def classify_page(page_id: int) -> dict:
    """기존 페이지의 TC들을 수동으로 (재)분류한다."""
    try:
        return {"classified": _classify_page(page_id)}
    except OpenAIError as exc:
        raise HTTPException(502, str(exc)) from exc


@app.get("/search")
def search(q: str = "") -> list[dict]:
    q = q.strip()
    return db.search(q) if q else []


@app.get("/projects/{project_id}/export")
def export_bundle(project_id: int) -> dict:
    try:
        return db.export_bundle(project_id)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc


# ---------- 생성 잡 ----------
def _run_generate(job_id: str, project_id: int, analysis: dict) -> None:
    """백그라운드 스레드에서 OpenAI 호출 → 저장. 확장 생명주기와 무관하게 완료된다."""
    try:
        _set_job(job_id, status="running", stage="AI가 테스트 케이스 생성 중", progress=40)
        project = db.get_project(project_id) or {}
        folder = db.get_folder(project["folderId"]) if project.get("folderId") else None
        out = generate_test_cases(
            analysis,
            api_key=os.getenv("OPENAI_API_KEY", ""),
            model=config["model"],
            reasoning_effort=config["reasoningEffort"],
            project_context=project.get("context", ""),
            folder_context=(folder or {}).get("context", ""),
        )
        _set_job(job_id, stage="결과 저장 중", progress=80)
        db.save_prompt_history(out["prompt"], out["raw"])
        result = db.save_analysis_result(
            project_id=project_id,
            url=analysis.get("url", ""),
            title=analysis.get("title", ""),
            html=analysis.get("html"),
            dom_json=analysis_dom_json(analysis),
            test_cases=out["response"]["testCases"],
        )
        # 난이도/테스트 방식 분류 (gpt-4o-mini) — 실패해도 생성 결과는 유지한다
        _set_job(job_id, stage="난이도/방식 분류 중 (gpt-4o-mini)", progress=90)
        try:
            _classify_page(result["pageId"])
        except OpenAIError as exc:
            print(f"[classify] 분류 실패(생성 결과는 저장됨): {exc}")
        _set_job(job_id, status="done", stage="완료", progress=100, result=result)
    except OpenAIError as exc:
        _set_job(job_id, status="error", stage="오류", progress=100, error=str(exc))
    except Exception as exc:  # noqa: BLE001 — 잡 스레드에서 예외를 삼키지 않고 상태로 노출
        _set_job(job_id, status="error", stage="오류", progress=100, error=f"서버 오류: {exc}")


def analysis_dom_json(analysis: dict) -> str:
    import json
    return json.dumps(
        {
            "dom": analysis.get("dom", {}),
            "stats": analysis.get("stats", {}),
            "flags": analysis.get("flags", {}),
            "apiCalls": analysis.get("apiCalls", []),
        },
        ensure_ascii=False,
    )


@app.post("/jobs/generate")
def create_generate_job(body: GenerateIn) -> dict:
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(400, "OPENAI_API_KEY가 설정되지 않았습니다. server/.env를 확인하세요.")
    job_id = uuid.uuid4().hex
    with jobs_lock:
        jobs[job_id] = {
            "id": job_id, "status": "queued", "stage": "대기 중",
            "progress": 10, "error": None, "result": None,
        }
    threading.Thread(
        target=_run_generate, args=(job_id, body.projectId, body.analysis), daemon=True
    ).start()
    return {"jobId": job_id}


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "잡을 찾을 수 없습니다. (서버 재시작 시 잡 목록이 초기화됩니다)")
    return job
