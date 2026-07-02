import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';

/** 좌측 패널: 프로젝트 목록 + 생성/삭제 */
export function ProjectList() {
  const { projects, selectedProjectId, selectProject, createProject, deleteProject } =
    useAppStore();
  const [newName, setNewName] = useState('');

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createProject(newName.trim());
    setNewName('');
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-3">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">프로젝트</h2>
        <div className="flex gap-1">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="새 프로젝트 이름"
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={handleCreate}
            className="rounded bg-blue-600 px-2 py-1 text-sm text-white hover:bg-blue-700"
          >
            추가
          </button>
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {projects.length === 0 && (
          <li className="p-3 text-sm text-slate-400">프로젝트가 없습니다.</li>
        )}
        {projects.map((project) => (
          <li key={project.id}>
            <button
              type="button"
              onClick={() => selectProject(project.id)}
              className={`group flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                selectedProjectId === project.id ? 'bg-blue-50 font-medium text-blue-700' : ''
              }`}
            >
              <span className="truncate">{project.name}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`프로젝트 "${project.name}"와 모든 데이터를 삭제할까요?`)) {
                    deleteProject(project.id);
                  }
                }}
                className="hidden text-xs text-slate-400 hover:text-red-500 group-hover:inline"
              >
                삭제
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
