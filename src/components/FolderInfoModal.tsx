import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { Folder } from '@/types/models';

/**
 * 폴더 정보 모달 (대형).
 * 여기 입력한 공통 정보는 이 폴더 안 모든 프로젝트의 테스트 케이스 생성 시
 * AI에게 함께 전달된다(프로젝트 개별 정보보다 앞에 주입).
 */
export function FolderInfoModal({
  folder,
  onClose,
}: {
  folder: Folder;
  onClose: () => void;
}) {
  const { updateFolderInfo } = useAppStore();
  const [context, setContext] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setContext(folder.context ?? '');
  }, [folder]);

  const handleSave = async () => {
    setSaving(true);
    await updateFolderInfo(folder.id, context);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex h-[80vh] w-[720px] max-w-[90vw] flex-col rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="폴더 정보"
      >
        <h2 className="mb-1 text-lg font-semibold">📁 폴더 정보 — {folder.name}</h2>
        <p className="mb-4 text-xs text-slate-500">
          여기 입력한 내용은 저장되어 <b>이 폴더 안 모든 프로젝트</b>의 테스트 케이스 생성 시 AI에게 함께
          전달됩니다. (예: 회사/서비스 공통 설명, 공용 테스트 계정, 공통 정책)
          프로젝트 개별 정보와 함께 쓰이며, 폴더 정보가 먼저 전달됩니다.
        </p>

        <label className="mb-1 block text-sm font-medium">AI에게 제공할 폴더 공통 정보</label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder={
            '예)\n- 이 폴더는 우리 회사 커머스 서비스군이다.\n- 공용 테스트 계정: qa@company.com / Test1234!\n- 모든 서비스는 로그인 후 2FA(OTP)를 요구한다.'
          }
          className="min-h-0 flex-1 resize-none rounded border border-slate-300 p-3 font-mono text-sm leading-relaxed"
        />
        <div className="mt-1 text-right text-xs text-slate-400">{context.length.toLocaleString()}자</div>

        <div className="mt-3 flex justify-end gap-2">
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
            disabled={saving}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
