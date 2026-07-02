import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { DEFAULT_MODEL, DEFAULT_REASONING_EFFORT } from '@/services/openaiService';
import type { ReasoningEffort } from '@/types/messages';

const EFFORT_OPTIONS: Array<{ value: ReasoningEffort; label: string }> = [
  { value: 'low', label: 'Low (빠름/저비용)' },
  { value: 'medium', label: 'Medium (권장)' },
  { value: 'high', label: 'High (복잡한 분석)' },
  { value: 'xhigh', label: 'xHigh (최대 추론)' },
];

/**
 * 모델/추론 강도 설정 모달.
 * OpenAI API 키는 서버 .env(OPENAI_API_KEY)에서만 관리하므로 여기서는 편집하지 않고
 * 설정 여부만 표시한다.
 */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, saveSettings } = useAppStore();
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(DEFAULT_REASONING_EFFORT);

  useEffect(() => {
    setModel(settings.model || DEFAULT_MODEL);
    setReasoningEffort(settings.reasoningEffort || DEFAULT_REASONING_EFFORT);
  }, [settings]);

  const handleSave = async () => {
    await saveSettings({ model: model.trim() || DEFAULT_MODEL, reasoningEffort });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-[420px] rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="설정"
      >
        <h2 className="mb-4 text-lg font-semibold">설정</h2>

        <div
          className={`mb-4 rounded p-2 text-xs ${
            settings.hasApiKey ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          OpenAI API 키:{' '}
          {settings.hasApiKey
            ? '서버에 설정됨 (server/.env)'
            : '미설정 — server/.env의 OPENAI_API_KEY를 채우세요.'}
        </div>

        <label className="mb-1 block text-sm font-medium">모델</label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={DEFAULT_MODEL}
          className="mb-3 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium">추론 강도 (reasoning effort)</label>
        <select
          value={reasoningEffort}
          onChange={(e) => setReasoningEffort(e.target.value as ReasoningEffort)}
          className="mb-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          {EFFORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="mb-4 text-xs text-slate-500">
          gpt-5.5 등 reasoning 모델에만 적용됩니다. temperature는 지원되지 않습니다.
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
