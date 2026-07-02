import { useState } from 'react';

/** 클립보드 복사 버튼. 복사 후 잠시 "복사됨" 피드백을 보여준다. */
export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // 클립보드 권한이 없으면 조용히 무시
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
      title="클립보드에 복사"
    >
      {copied ? '복사됨 ✓' : '복사'}
    </button>
  );
}
