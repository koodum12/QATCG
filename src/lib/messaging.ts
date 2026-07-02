import type {
  ResponseDataMap,
  RuntimeRequest,
  RuntimeResponse,
} from '@/types/messages';

/**
 * popup/dashboard에서 background로 타입 안전하게 요청을 보내는 헬퍼.
 * 실패 응답은 Error로 변환해 호출부에서 try/catch로 처리한다.
 */
export async function sendRequest<T extends RuntimeRequest['type']>(
  request: Extract<RuntimeRequest, { type: T }>,
): Promise<ResponseDataMap[T]> {
  const response = (await chrome.runtime.sendMessage(request)) as
    | RuntimeResponse<ResponseDataMap[T]>
    | undefined;
  if (!response) throw new Error('background 응답이 없습니다. 확장을 다시 로드해 보세요.');
  if (!response.ok) throw new Error(response.error);
  return response.data;
}
