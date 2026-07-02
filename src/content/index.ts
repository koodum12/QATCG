import { collectPageAnalysis } from './collect';
import type { CollectRequest } from '@/types/messages';

/**
 * content script 엔트리. background가 chrome.scripting.executeScript로 주입한 뒤
 * COLLECT_PAGE 메시지를 보내면 페이지 분석 결과를 sendResponse로 돌려준다.
 * 중복 주입 시 리스너가 여러 번 등록되지 않도록 window 플래그로 가드한다.
 */

declare global {
  interface Window {
    __AI_QA_CONTENT_LOADED__?: boolean;
  }
}

if (!window.__AI_QA_CONTENT_LOADED__) {
  window.__AI_QA_CONTENT_LOADED__ = true;

  chrome.runtime.onMessage.addListener(
    (message: CollectRequest, _sender, sendResponse) => {
      if (message?.type !== 'COLLECT_PAGE') return undefined;
      try {
        const analysis = collectPageAnalysis(document, window, message.deep);
        sendResponse({ ok: true, data: analysis });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return undefined; // 동기 응답이므로 채널 유지 불필요
    },
  );
}

export {};
