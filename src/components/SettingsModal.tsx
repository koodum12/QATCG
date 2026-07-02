import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { DEFAULT_MODEL } from '@/services/openaiService';

/** OpenAI API 키/모델 설정 모달 */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, saveSettings } = useAppStore();
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);

  useEffect(() => {
    setApiKey(settings.apiKey);
    setModel(settings.model || DEFAULT_MODEL);
  }, [settings]);

  const handleSave = async () => {
    await saveSettings({ apiKey: apiKey.trim(), model: model.trim() || DEFAULT_MODEL });
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
        <label className="mb-1 block text-sm font-medium">OpenAI API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="mb-3 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <label className="mb-1 block text-sm font-medium">모델</label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={DEFAULT_MODEL}
          className="mb-4 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
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
