export interface AppSettings {
  reopenLastFileOnStartup: boolean;
}

export interface AppUiState {
  isOutlineVisible: boolean;
}

export interface PersistedAppState {
  recentFiles: string[];
  lastOpenedFilePath: string | null;
  settings: AppSettings;
  ui: AppUiState;
}

const STORAGE_KEY = "mdedit.appState.v1";
const MAX_RECENT_FILES = 10;

const DEFAULT_STATE: PersistedAppState = {
  recentFiles: [],
  lastOpenedFilePath: null,
  settings: {
    reopenLastFileOnStartup: true,
  },
  ui: {
    isOutlineVisible: true,
  },
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function normalizeState(candidate: unknown): PersistedAppState {
  if (!candidate || typeof candidate !== "object") {
    return DEFAULT_STATE;
  }

  const draft = candidate as Partial<PersistedAppState> & {
    settings?: Partial<AppSettings>;
    ui?: Partial<AppUiState>;
  };

  return {
    recentFiles: isStringArray(draft.recentFiles)
      ? draft.recentFiles.slice(0, MAX_RECENT_FILES)
      : [],
    lastOpenedFilePath:
      typeof draft.lastOpenedFilePath === "string" ? draft.lastOpenedFilePath : null,
    settings: {
      reopenLastFileOnStartup:
        draft.settings?.reopenLastFileOnStartup ??
        DEFAULT_STATE.settings.reopenLastFileOnStartup,
    },
    ui: {
      isOutlineVisible:
        draft.ui?.isOutlineVisible ?? DEFAULT_STATE.ui.isOutlineVisible,
    },
  };
}

export function loadAppState(): PersistedAppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;

    return normalizeState(JSON.parse(raw));
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveAppState(state: PersistedAppState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function pushRecentFile(path: string): PersistedAppState {
  const state = loadAppState();
  const deduped = state.recentFiles.filter((entry) => entry !== path);
  const nextState: PersistedAppState = {
    ...state,
    recentFiles: [path, ...deduped].slice(0, MAX_RECENT_FILES),
    lastOpenedFilePath: path,
  };

  saveAppState(nextState);
  return nextState;
}

export function removeRecentFile(path: string): PersistedAppState {
  const state = loadAppState();
  const nextState: PersistedAppState = {
    ...state,
    recentFiles: state.recentFiles.filter((entry) => entry !== path),
    lastOpenedFilePath:
      state.lastOpenedFilePath === path ? null : state.lastOpenedFilePath,
  };

  saveAppState(nextState);
  return nextState;
}
