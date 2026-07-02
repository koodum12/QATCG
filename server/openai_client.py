"""OpenAI Responses API 호출 (gpt-5.5 기준).

gpt-5.5는 reasoning 모델이라 Chat Completions가 아닌 Responses API(/v1/responses)를 사용한다.
- temperature 미지원 → reasoning.effort로 추론 강도 제어
- 구조화 출력은 text.format(json_schema, strict)로 강제
"""
from __future__ import annotations

import json
from typing import Any

import requests

OPENAI_URL = "https://api.openai.com/v1/responses"

SYSTEM_PROMPT = """당신은 10년 이상의 경력을 가진 시니어 QA 엔지니어이다.
주어진 웹 페이지의 DOM 구조를 분석하여 QA 테스트 케이스를 작성한다.

각 테스트 케이스에 다음을 포함하라:
1. 테스트해야 할 기능  2. 정상 시나리오  3. 예외 시나리오  4. 경계값 테스트
5. 입력 데이터(정상/경계/예외: 공백, null, 특수문자, 이모지, 초장문, SQL Injection, XSS 등)
6. 예상 결과  7. 우선순위(High/Medium/Low)  8. 테스트 목적

규칙:
- tcId는 TC-001부터 순차 부여한다.
- priority는 High, Medium, Low 중 하나만 사용한다.
- category는 normal, boundary, exception 중 하나만 사용한다.
- 페이지에서 발견된 모든 주요 기능(폼, 버튼, 링크, 네비게이션, 테이블, 모달 등)을 커버하라.
- 각 입력 필드에 정상/경계/예외 입력 데이터를 충분히 생성하라."""

# Structured Outputs(strict) JSON Schema — 모든 object는 additionalProperties:false, 전 필드 required
JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["pageSummary", "testCases"],
    "properties": {
        "pageSummary": {"type": "string"},
        "testCases": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["tcId", "feature", "purpose", "priority", "steps", "inputs", "expectedResult"],
                "properties": {
                    "tcId": {"type": "string"},
                    "feature": {"type": "string"},
                    "purpose": {"type": "string"},
                    "priority": {"type": "string", "enum": ["High", "Medium", "Low"]},
                    "steps": {"type": "array", "items": {"type": "string"}},
                    "inputs": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["field", "value", "category"],
                            "properties": {
                                "field": {"type": "string"},
                                "value": {"type": "string"},
                                "category": {"type": "string", "enum": ["normal", "boundary", "exception"]},
                            },
                        },
                    },
                    "expectedResult": {"type": "string"},
                },
            },
        },
    },
}

MAX_HTML = 30000


def build_user_prompt(
    analysis: dict, project_context: str = "", folder_context: str = ""
) -> str:
    """content script가 수집한 분석 결과(+폴더/프로젝트 추가 정보)로 user 프롬프트를 만든다."""
    parts = []
    if folder_context.strip():
        parts += [
            "## 폴더 공통 정보 (사용자 제공 — 이 폴더의 모든 프로젝트에 적용, 반드시 반영)",
            folder_context.strip(),
            "",
        ]
    if project_context.strip():
        parts += [
            "## 프로젝트 추가 정보 (사용자 제공 — 테스트 케이스 작성 시 반드시 반영)",
            project_context.strip(),
            "",
        ]
    parts += [
        "## 페이지 정보",
        f"- URL: {analysis.get('url', '')}",
        f"- Title: {analysis.get('title', '')}",
        "",
        "## 요소 통계",
        json.dumps(analysis.get("stats", {}), ensure_ascii=False),
        "",
        "## 페이지 특성",
        json.dumps(analysis.get("flags", {}), ensure_ascii=False),
    ]
    api_calls = analysis.get("apiCalls") or []
    if api_calls:
        parts += ["", "## 감지된 API 호출", "\n".join(api_calls)]
    parts += ["", "## DOM 구조 (JSON)", json.dumps(analysis.get("dom", {}), ensure_ascii=False)]
    html = analysis.get("html")
    if html:
        parts += ["", "## 원본 HTML (심층 분석)", html[:MAX_HTML]]
    parts += ["", "위 페이지를 분석하여 QA 테스트 케이스를 JSON으로 생성하라."]
    return "\n".join(parts)


def _extract_output_text(data: dict) -> str:
    """Responses API 응답의 output[] 배열에서 output_text 조각만 이어붙인다."""
    if isinstance(data.get("output_text"), str) and data["output_text"].strip():
        return data["output_text"]
    chunks: list[str] = []
    for item in data.get("output", []):
        if item.get("type") != "message":
            continue
        for part in item.get("content", []):
            if part.get("type") == "output_text" and isinstance(part.get("text"), str):
                chunks.append(part["text"])
    return "".join(chunks)


class OpenAIError(RuntimeError):
    pass


def generate_test_cases(
    analysis: dict, api_key: str, model: str, reasoning_effort: str,
    project_context: str = "", folder_context: str = "", timeout: int = 300,
) -> dict:
    """페이지 분석 결과로 테스트케이스를 생성하고 {response, prompt, raw}를 반환한다."""
    if not api_key:
        raise OpenAIError("OPENAI_API_KEY가 설정되지 않았습니다. server/.env를 확인하세요.")

    user_prompt = build_user_prompt(analysis, project_context, folder_context)
    body = {
        "model": model,
        "input": [
            {"type": "message", "role": "developer",
             "content": [{"type": "input_text", "text": SYSTEM_PROMPT}]},
            {"type": "message", "role": "user",
             "content": [{"type": "input_text", "text": user_prompt}]},
        ],
        "reasoning": {"effort": reasoning_effort},
        "text": {"format": {"type": "json_schema", "name": "qa_testcases",
                            "strict": True, "schema": JSON_SCHEMA}},
    }

    try:
        res = requests.post(
            OPENAI_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=body,
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise OpenAIError(f"OpenAI API 네트워크 오류: {exc}") from exc

    if res.status_code == 401:
        raise OpenAIError("OpenAI API 키가 유효하지 않습니다.")
    if res.status_code == 404:
        raise OpenAIError(f'모델 "{model}"에 접근할 수 없습니다. 모델 이름 또는 계정 권한을 확인하세요.')
    if res.status_code == 429:
        raise OpenAIError("OpenAI API 사용량 한도를 초과했습니다.")
    if not res.ok:
        raise OpenAIError(f"OpenAI API 오류 (HTTP {res.status_code}): {res.text[:300]}")

    content = _extract_output_text(res.json())
    if not content:
        raise OpenAIError("OpenAI 응답에 내용이 없습니다.")
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise OpenAIError("AI 응답이 유효한 JSON이 아닙니다.") from exc
    if not parsed.get("testCases"):
        raise OpenAIError("생성된 테스트 케이스가 없습니다.")
    return {"response": parsed, "prompt": user_prompt, "raw": content}
