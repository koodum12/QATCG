import { create } from 'zustand';
import { sendRequest } from '@/lib/messaging';
import { errorMessage } from '@/utils/logger';
import type { Folder, Page, Project, SearchResult } from '@/types/models';
import type { Settings, TestCaseWithInputs } from '@/types/messages';

/**
 * dashboard 전역 상태 (Zustand).
 * background DB를 단일 진실 공급원으로 두고, 액션마다 다시 조회한다.
 */

interface AppState {
  projects: Project[];
  folders: Folder[];
  pages: Page[];
  testCases: TestCaseWithInputs[];
  selectedProjectId: number | null;
  selectedPageId: number | null;
  selectedTestCaseId: number | null;
  searchQuery: string;
  searchResults: SearchResult[] | null;
  settings: Settings;
  error: string | null;
  loading: boolean;

  loadProjects: () => Promise<void>;
  loadFolders: () => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  /** 폴더의 AI 공통 정보(context) 저장 */
  updateFolderInfo: (folderId: number, context: string) => Promise<void>;
  deleteFolder: (folderId: number) => Promise<void>;
  createProject: (name: string, folderId?: number | null) => Promise<void>;
  /** 프로젝트의 AI 추가 정보(context)와 폴더 이동을 저장 */
  updateProjectInfo: (projectId: number, context: string, folderId: number | null) => Promise<void>;
  deleteProject: (projectId: number) => Promise<void>;
  selectProject: (projectId: number | null) => Promise<void>;
  deletePage: (pageId: number) => Promise<void>;
  selectPage: (pageId: number | null) => Promise<void>;
  selectTestCase: (testCaseId: number | null) => void;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: Pick<Settings, 'model' | 'reasoningEffort'>) => Promise<void>;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],
  folders: [],
  pages: [],
  testCases: [],
  selectedProjectId: null,
  selectedPageId: null,
  selectedTestCaseId: null,
  searchQuery: '',
  searchResults: null,
  settings: { model: '', reasoningEffort: 'medium', hasApiKey: false },
  error: null,
  loading: false,

  async loadProjects() {
    try {
      const projects = await sendRequest({ type: 'GET_PROJECTS' });
      set({ projects });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async loadFolders() {
    try {
      const folders = await sendRequest({ type: 'GET_FOLDERS' });
      set({ folders });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async createFolder(name) {
    try {
      await sendRequest({ type: 'CREATE_FOLDER', name });
      await get().loadFolders();
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async updateFolderInfo(folderId, context) {
    try {
      await sendRequest({ type: 'UPDATE_FOLDER', folderId, context });
      await get().loadFolders();
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async deleteFolder(folderId) {
    try {
      await sendRequest({ type: 'DELETE_FOLDER', folderId });
      // 소속 프로젝트가 미분류로 이동하므로 둘 다 갱신
      await Promise.all([get().loadFolders(), get().loadProjects()]);
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async createProject(name, folderId = null) {
    try {
      await sendRequest({ type: 'CREATE_PROJECT', name, folderId });
      await get().loadProjects();
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async updateProjectInfo(projectId, context, folderId) {
    try {
      await sendRequest({
        type: 'UPDATE_PROJECT',
        projectId,
        context,
        folderId,
        setFolder: true,
      });
      await get().loadProjects();
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async deleteProject(projectId) {
    try {
      await sendRequest({ type: 'DELETE_PROJECT', projectId });
      const { selectedProjectId } = get();
      if (selectedProjectId === projectId) {
        set({ selectedProjectId: null, pages: [], testCases: [], selectedPageId: null, selectedTestCaseId: null });
      }
      await get().loadProjects();
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async selectProject(projectId) {
    set({ selectedProjectId: projectId, selectedPageId: null, selectedTestCaseId: null, testCases: [] });
    if (projectId === null) {
      set({ pages: [] });
      return;
    }
    try {
      const pages = await sendRequest({ type: 'GET_PAGES', projectId });
      set({ pages });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async deletePage(pageId) {
    try {
      await sendRequest({ type: 'DELETE_PAGE', pageId });
      const { selectedProjectId, selectedPageId } = get();
      if (selectedPageId === pageId) {
        set({ selectedPageId: null, testCases: [], selectedTestCaseId: null });
      }
      if (selectedProjectId !== null) await get().selectProject(selectedProjectId);
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async selectPage(pageId) {
    set({ selectedPageId: pageId, selectedTestCaseId: null });
    if (pageId === null) {
      set({ testCases: [] });
      return;
    }
    try {
      const testCases = await sendRequest({ type: 'GET_TEST_CASES', pageId });
      set({ testCases });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  selectTestCase(testCaseId) {
    set({ selectedTestCaseId: testCaseId });
  },

  async search(query) {
    set({ searchQuery: query });
    if (!query.trim()) {
      set({ searchResults: null });
      return;
    }
    try {
      const searchResults = await sendRequest({ type: 'SEARCH', query: query.trim() });
      set({ searchResults });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  clearSearch() {
    set({ searchQuery: '', searchResults: null });
  },

  async loadSettings() {
    try {
      const settings = await sendRequest({ type: 'GET_SETTINGS' });
      set({ settings });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async saveSettings(settings) {
    try {
      await sendRequest({ type: 'SAVE_SETTINGS', settings });
      // hasApiKey는 서버 소유이므로 기존 값 위에 model/effort만 병합한다
      set((state) => ({ settings: { ...state.settings, ...settings } }));
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  setError(error) {
    set({ error });
  },
}));
