/**
 * 로컬 Python 백엔드(FastAPI) REST 클라이언트.
 * background service worker에서만 호출한다.
 */

export const SERVER_BASE = 'http://127.0.0.1:8787';

/** 서버 미기동 시 사용자에게 보여줄 안내 메시지 */
const SERVER_DOWN_MSG =
  `백엔드 서버(${SERVER_BASE})에 연결할 수 없습니다. ` +
  `server 폴더에서 "uvicorn main:app --port 8787"로 서버를 실행하세요.`;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_BASE}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch 자체 실패 = 서버 미기동/포트 불일치
    throw new Error(SERVER_DOWN_MSG);
  }
  if (!res.ok) {
    // FastAPI는 오류를 { detail: "..." }로 반환한다
    const payload = await res.json().catch(() => null);
    const detail = payload && typeof payload.detail === 'string' ? payload.detail : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
