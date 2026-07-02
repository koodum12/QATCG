import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { ProjectInfoModal } from './ProjectInfoModal';
import { FolderInfoModal } from './FolderInfoModal';
import type { Folder, Project } from '@/types/models';

/** 인라인 프로젝트 생성 위치: 특정 폴더 id 또는 미분류 */
type CreateTarget = number | 'unfiled' | null;

/**
 * 좌측 패널: 폴더 우선 구조.
 * 상단에서는 폴더만 만들고, 프로젝트는 각 폴더(또는 미분류) 헤더의
 * "+프로젝트" 버튼으로 해당 위치 안에 인라인 생성한다.
 */
export function ProjectList() {
  const {
    projects,
    folders,
    selectedProjectId,
    selectProject,
    createProject,
    deleteProject,
    createFolder,
    deleteFolder,
  } = useAppStore();
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingIn, setCreatingIn] = useState<CreateTarget>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [infoProject, setInfoProject] = useState<Project | null>(null);
  const [infoFolder, setInfoFolder] = useState<Folder | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await createFolder(newFolderName.trim());
    setNewFolderName('');
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || creatingIn === null) return;
    await createProject(newProjectName.trim(), creatingIn === 'unfiled' ? null : creatingIn);
    setNewProjectName('');
    setCreatingIn(null);
  };

  const openCreateInput = (target: CreateTarget) => {
    setCreatingIn(target);
    setNewProjectName('');
    // 접힌 폴더에 추가하려는 경우 펼친다
    if (typeof target === 'number') {
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(target);
        return next;
      });
    }
  };

  const toggleFolder = (folderId: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const unfiled = projects.filter((p) => p.folderId === null);

  /** 폴더(또는 미분류) 안에 표시되는 인라인 프로젝트 생성 입력 */
  const renderCreateInput = () => (
    <li className="flex gap-1 py-1 pl-7 pr-3">
      <input
        type="text"
        autoFocus
        value={newProjectName}
        onChange={(e) => setNewProjectName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleCreateProject();
          if (e.key === 'Escape') setCreatingIn(null);
        }}
        placeholder="프로젝트 이름 (Enter로 생성)"
        className="min-w-0 flex-1 rounded border border-blue-400 px-2 py-1 text-sm"
      />
      <button
        type="button"
        onClick={handleCreateProject}
        className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
      >
        생성
      </button>
      <button
        type="button"
        onClick={() => setCreatingIn(null)}
        className="rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-50"
      >
        ✕
      </button>
    </li>
  );

  const renderProject = (project: Project) => (
    <li key={project.id}>
      <button
        type="button"
        onClick={() => selectProject(project.id)}
        className={`group flex w-full items-center justify-between py-2 pl-7 pr-3 text-left text-sm hover:bg-slate-50 ${
          selectedProjectId === project.id ? 'bg-blue-50 font-medium text-blue-700' : ''
        }`}
      >
        <span className="truncate">
          {project.name}
          {project.context.trim() && (
            <span className="ml-1 text-xs text-slate-400" title="AI 추가 정보 있음">
              📝
            </span>
          )}
        </span>
        <span className="hidden shrink-0 gap-2 group-hover:flex">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setInfoProject(project);
            }}
            className="text-xs text-slate-400 hover:text-blue-600"
          >
            정보
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`프로젝트 "${project.name}"와 모든 데이터를 삭제할까요?`)) {
                deleteProject(project.id);
              }
            }}
            className="text-xs text-slate-400 hover:text-red-500"
          >
            삭제
          </span>
        </span>
      </button>
    </li>
  );

  /** 폴더/미분류 공통 그룹 헤더 */
  const renderGroupHeader = (opts: {
    label: string;
    count: number;
    target: CreateTarget;
    collapsible?: { id: number; isCollapsed: boolean };
    onInfo?: () => void;
    hasContext?: boolean;
    onDelete?: () => void;
  }) => (
    <div className="group flex items-center justify-between px-3 pb-1 pt-3">
      {opts.collapsible ? (
        <button
          type="button"
          onClick={() => toggleFolder(opts.collapsible!.id)}
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
        >
          <span>{opts.collapsible.isCollapsed ? '▸' : '▾'}</span>
          <span>📁 {opts.label}</span>
          {opts.hasContext && (
            <span className="font-normal" title="폴더 공통 정보 있음">
              📝
            </span>
          )}
          <span className="font-normal text-slate-400">({opts.count})</span>
        </button>
      ) : (
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {opts.label} <span className="font-normal">({opts.count})</span>
        </span>
      )}
      <span className="hidden gap-2 group-hover:flex">
        <span
          role="button"
          tabIndex={0}
          onClick={() => openCreateInput(opts.target)}
          className="text-xs text-blue-500 hover:text-blue-700"
        >
          +프로젝트
        </span>
        {opts.onInfo && (
          <span
            role="button"
            tabIndex={0}
            onClick={opts.onInfo}
            className="text-xs text-slate-400 hover:text-blue-600"
          >
            정보
          </span>
        )}
        {opts.onDelete && (
          <span
            role="button"
            tabIndex={0}
            onClick={opts.onDelete}
            className="text-xs text-slate-400 hover:text-red-500"
          >
            삭제
          </span>
        )}
      </span>
    </div>
  );

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-3">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">프로젝트</h2>
        <div className="flex gap-1">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && !e.nativeEvent.isComposing && handleCreateFolder()
            }
            placeholder="새 폴더 이름"
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={handleCreateFolder}
            className="rounded bg-blue-600 px-2 py-1 text-sm text-white hover:bg-blue-700"
          >
            폴더 추가
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          폴더를 만든 뒤, 폴더에 마우스를 올려 <b>+프로젝트</b>로 그 안에 프로젝트를 만드세요.
        </p>
      </div>

      <ul className="flex-1 overflow-y-auto pb-2">
        {folders.length === 0 && projects.length === 0 && creatingIn === null && (
          <li className="p-3 text-sm text-slate-400">
            먼저 폴더를 만들어 보세요. 폴더 없이 쓰려면 아래 미분류에 바로 만들 수도 있습니다.
          </li>
        )}

        {folders.map((folder) => {
          const inFolder = projects.filter((p) => p.folderId === folder.id);
          const isCollapsed = collapsed.has(folder.id);
          return (
            <li key={`folder-${folder.id}`}>
              {renderGroupHeader({
                label: folder.name,
                count: inFolder.length,
                target: folder.id,
                collapsible: { id: folder.id, isCollapsed },
                onInfo: () => setInfoFolder(folder),
                hasContext: Boolean(folder.context?.trim()),
                onDelete: () => {
                  if (confirm(`폴더 "${folder.name}"를 삭제할까요? (프로젝트는 미분류로 이동)`)) {
                    deleteFolder(folder.id);
                  }
                },
              })}
              {!isCollapsed && (
                <ul>
                  {creatingIn === folder.id && renderCreateInput()}
                  {inFolder.length === 0 && creatingIn !== folder.id && (
                    <li className="pl-7 text-xs text-slate-400">비어 있음 — +프로젝트로 추가</li>
                  )}
                  {inFolder.map(renderProject)}
                </ul>
              )}
            </li>
          );
        })}

        <li>
          {renderGroupHeader({ label: '미분류', count: unfiled.length, target: 'unfiled' })}
          <ul>
            {creatingIn === 'unfiled' && renderCreateInput()}
            {unfiled.map(renderProject)}
          </ul>
        </li>
      </ul>

      {infoProject && (
        <ProjectInfoModal project={infoProject} onClose={() => setInfoProject(null)} />
      )}
      {infoFolder && (
        <FolderInfoModal folder={infoFolder} onClose={() => setInfoFolder(null)} />
      )}
    </aside>
  );
}
