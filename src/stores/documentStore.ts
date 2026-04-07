import { create } from "zustand";
import type { ActiveDocument, DocumentStore } from "../types";
import { basename } from "../lib/utils";

const EMPTY_DOCUMENT: ActiveDocument = {
  path: null,
  name: null,
  lastLoadedContent: "",
  lastSavedContent: "",
  lastSavedAt: null,
  fileMtime: null,
  lastKnownPath: null,
};

/**
 * Global document state.
 * Tracks active file metadata, markdown content, and unsaved state.
 */
export const useDocumentStore = create<DocumentStore>((set) => ({
  activeDocument: EMPTY_DOCUMENT,
  documentContent: "",
  isDirty: false,
  currentFilePath: null,

  setContent: (content) => set({ documentContent: content }),
  setFilePath: (path) =>
    set((state) => ({
      currentFilePath: path,
      activeDocument: {
        ...state.activeDocument,
        path,
        name: path ? basename(path) : null,
        lastKnownPath: path,
      },
    })),
  markLoaded: ({ markdown, path }) =>
    set(() => ({
      documentContent: markdown,
      currentFilePath: path,
      isDirty: false,
      activeDocument: {
        path,
        name: path ? basename(path) : null,
        lastLoadedContent: markdown,
        lastSavedContent: markdown,
        lastSavedAt: new Date().toISOString(),
        fileMtime: null,
        lastKnownPath: path,
      },
    })),
  markSaved: ({ markdown, path }) =>
    set((state) => ({
      documentContent: markdown,
      currentFilePath: path,
      isDirty: false,
      activeDocument: {
        ...state.activeDocument,
        path,
        name: path ? basename(path) : null,
        lastSavedContent: markdown,
        lastSavedAt: new Date().toISOString(),
        lastKnownPath: path,
      },
    })),
  setDirty: (dirty) => set({ isDirty: dirty }),
  resetDirty: () => set({ isDirty: false }),
}));
