import {
  loadAppState,
  pushRecentFile,
  removeRecentFile,
  type PersistedAppState,
} from "../../services/appStateService";
import {
  openDocument,
  openDocumentFromPath,
  reloadDocumentFromDisk,
  saveDocument,
  saveDocumentAs,
  type ConfirmDiscardChanges,
} from "./documentService";

export interface FileActionContext {
  getEditorHtml: () => string | null;
  setEditorHtml: (html: string) => void;
  reconcileCanonicalFromEditorHtml: (html: string) => Promise<string>;
  confirmDiscardChanges: ConfirmDiscardChanges;
  onStateChanged: (state: PersistedAppState) => void;
}

export function getInitialPersistedState(): PersistedAppState {
  return loadAppState();
}

export async function runOpenAction(
  context: FileActionContext
): Promise<void> {
  const result = await openDocument({
    confirmDiscardChanges: context.confirmDiscardChanges,
  });

  if (result.kind !== "opened" || !result.html) {
    return;
  }

  context.setEditorHtml(result.html);

  if (result.path) {
    const state = pushRecentFile(result.path);
    context.onStateChanged(state);
  }
}

export async function runOpenRecentAction(
  path: string,
  context: FileActionContext
): Promise<void> {
  const result = await openDocumentFromPath(path, {
    confirmDiscardChanges: context.confirmDiscardChanges,
  });

  if (result.kind === "error") {
    window.alert(`Open failed: ${result.message ?? "Unknown error"}`);
    const state = removeRecentFile(path);
    context.onStateChanged(state);
    return;
  }

  if (result.kind !== "opened" || !result.html) {
    return;
  }

  context.setEditorHtml(result.html);
  const state = pushRecentFile(path);
  context.onStateChanged(state);
}

export async function runSaveAction(context: FileActionContext): Promise<void> {
  const editorHtml = context.getEditorHtml();
  if (!editorHtml) return;

  await context.reconcileCanonicalFromEditorHtml(editorHtml);
  const result = await saveDocument();

  if (result.kind === "saved" && result.path) {
    const state = pushRecentFile(result.path);
    context.onStateChanged(state);
  }
}

export async function runSaveAsAction(
  context: FileActionContext
): Promise<void> {
  const editorHtml = context.getEditorHtml();
  if (!editorHtml) return;

  await context.reconcileCanonicalFromEditorHtml(editorHtml);
  const result = await saveDocumentAs();

  if (result.kind === "saved" && result.path) {
    const state = pushRecentFile(result.path);
    context.onStateChanged(state);
  }
}

export async function runReloadAction(
  context: FileActionContext
): Promise<void> {
  const result = await reloadDocumentFromDisk({
    confirmDiscardChanges: context.confirmDiscardChanges,
  });

  if (result.kind === "error") {
    window.alert(`Reload failed: ${result.message ?? "Unknown error"}`);
    return;
  }

  if (result.kind !== "reloaded" || !result.html) {
    return;
  }

  context.setEditorHtml(result.html);
}

export async function runStartupReopenAction(
  context: FileActionContext,
  state: PersistedAppState
): Promise<void> {
  if (!state.settings.reopenLastFileOnStartup || !state.lastOpenedFilePath) {
    return;
  }

  const result = await openDocumentFromPath(state.lastOpenedFilePath);

  if (result.kind === "opened" && result.html) {
    context.setEditorHtml(result.html);
    const nextState = pushRecentFile(state.lastOpenedFilePath);
    context.onStateChanged(nextState);
    return;
  }

  if (result.kind === "error") {
    const nextState = removeRecentFile(state.lastOpenedFilePath);
    context.onStateChanged(nextState);
  }
}
