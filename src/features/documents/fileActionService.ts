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
import type { ConfirmOptions, ToastOptions } from "../ux/useAppUx";

interface NotificationApi {
  info: (options: ToastOptions) => void;
  success: (options: ToastOptions) => void;
  warning: (options: ToastOptions) => void;
  error: (options: ToastOptions) => void;
}

export interface FileActionContext {
  getEditorHtml: () => string | null;
  setEditorHtml: (html: string) => void;
  reconcileCanonicalFromEditorHtml: (html: string) => Promise<string>;
  confirmDiscardChanges: ConfirmDiscardChanges;
  notify: NotificationApi;
  onStateChanged: (state: PersistedAppState) => void;
}

export function getInitialPersistedState(): PersistedAppState {
  return loadAppState();
}

export async function runOpenAction(
  context: FileActionContext
): Promise<void> {
  try {
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
  } catch (error) {
    context.notify.error({
      title: "Open failed",
      message: error instanceof Error ? error.message : "Unknown error.",
    });
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
    context.notify.error({
      title: "Open recent failed",
      message: result.message ?? "Unknown error.",
    });
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

  try {
    await context.reconcileCanonicalFromEditorHtml(editorHtml);
    const result = await saveDocument();

    if (result.kind === "saved" && result.path) {
      const state = pushRecentFile(result.path);
      context.onStateChanged(state);
      context.notify.success({ title: "Saved" });
    }
  } catch (error) {
    context.notify.error({
      title: "Save failed",
      message: error instanceof Error ? error.message : "Unknown error.",
    });
  }
}

export async function runSaveAsAction(
  context: FileActionContext
): Promise<void> {
  const editorHtml = context.getEditorHtml();
  if (!editorHtml) return;

  try {
    await context.reconcileCanonicalFromEditorHtml(editorHtml);
    const result = await saveDocumentAs();

    if (result.kind === "saved" && result.path) {
      const state = pushRecentFile(result.path);
      context.onStateChanged(state);
      context.notify.success({ title: "Saved as", message: result.path });
    }
  } catch (error) {
    context.notify.error({
      title: "Save As failed",
      message: error instanceof Error ? error.message : "Unknown error.",
    });
  }
}

export async function runReloadAction(
  context: FileActionContext
): Promise<void> {
  const result = await reloadDocumentFromDisk({
    confirmDiscardChanges: context.confirmDiscardChanges,
  });

  if (result.kind === "error") {
    context.notify.error({
      title: "Reload failed",
      message: result.message ?? "Unknown error.",
    });
    return;
  }

  if (result.kind !== "reloaded" || !result.html) {
    return;
  }

  context.setEditorHtml(result.html);
  context.notify.info({ title: "Reloaded from disk" });
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
    context.notify.warning({
      title: "Could not reopen last file",
      message: result.message ?? "File is no longer available.",
      timeoutMs: 3200,
    });
  }
}

export function createDiscardChangesConfirmOptions(): ConfirmOptions {
  return {
    title: "Discard unsaved changes?",
    message: "Your unsaved edits will be lost.",
    confirmLabel: "Discard",
    cancelLabel: "Keep Editing",
    variant: "danger",
    confirmOnEnter: false,
  };
}
