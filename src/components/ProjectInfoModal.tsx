import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { Project } from '@/types/models';

/**
 * 프로젝트 정보 모달 (대형).
 * - AI에게 매 생성마다 함께 전달되는 추가 정보(context)를 큰 textarea로 편집
 * - 프로젝트의 폴더 이동
 * 저장 시 서버 DB에 영속되어 이후 모든 Generate에 자동 반영된다.
 */
export function ProjectInfoModal({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const { folders, updateProjectInfo } = useAppStore();
  const [context, setContext] = useState('');
  const [folderId, setFolderId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setContext(project.context ?? '');
    setFolderId(project.folderId);
  }, [project]);

  const handleSave = async () => {
    setSaving(true);
    await updateProjectInfo(project.id, context, folderId);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex h-[80vh] w-[720px] max-w-[90vw] flex-col rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="프로젝트 정보"
      >
        <h2 className="mb-1 text-lg font-semibold">프로젝트 정보 — {project.name}</h2>
        <p className="mb-4 text-xs text-slate-500">
          여기 입력한 내용은 저장되어 이 프로젝트의 <b>모든 테스트 케이스 생성 시 AI에게 함께 전달</b>됩니다.
          (예: 서비스 설명, 테스트 계정, 도메인 용어, 주의해야 할 정책 등)
        </p>

        <label className="mb-1 block text-sm font-medium">폴더</label>
        <select
          value={folderId ?? ''}
          onChange={(e) => setFolderId(e.target.value === '' ? null : Number(e.target.value))}
          className="mb-4 w-64 rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">(미분류)</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium">AI에게 제공할 추가 정보</label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder={
            '예)\n- 이 사이트는 B2B 사무용품 쇼핑몰이다.\n- 테스트 계정: qa@company.com / Test1234!\n- 결제는 테스트 모드라 실제 청구되지 않는다.\n- 회원 등급(일반/프리미엄)에 따라 노출 메뉴가 다르다.'
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
