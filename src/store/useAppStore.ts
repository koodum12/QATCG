import { create } from 'zustand';
import { sendRequest } from '@/lib/messaging';
import { errorMessage } from '@/utils/logger';
import type { Page, Project, SearchResult } from '@/types/models';
import type { Settings, TestCaseWithInputs } from '@/types/messages';

/**
 * dashboard 전역 상태 (Zustand).
 * background DB를 단일 진실 공급원으로 두고, 액션마다 다시 조회한다.
 */

interface AppState {
  projects: Project[];
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
  createProject: (name: string) => Promise<void>;
  deleteProject: (projectId: number) => Promise<void>;
  selectProject: (projectId: number | null) => Promise<void>;
  deletePage: (pageId: number) => Promise<void>;
  selectPage: (pageId: number | null) => Promise<void>;
  selectTestCase: (testCaseId: number | null) => void;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],
  pages: [],
  testCases: [],
  selectedProjectId: null,
  selectedPageId: null,
  selectedTestCaseId: null,
  searchQuery: '',
  searchResults: null,
  settings: { apiKey: '', model: '' },
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

  async createProject(name) {
    try {
      await sendRequest({ type: 'CREATE_PROJECT', name });
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
      set({ settings });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  setError(error) {
    set({ error });
  },
}));
