import { create } from "zustand";
import type { DocumentStore } from "../types";

/**
 * Global document state.
 * Tracks which file is open, its raw markdown content, and whether it is dirty.
 */
export const useDocumentStore = create<DocumentStore>((set) => ({
  activeDocument: null,
  documentContent: "",
  isDirty: false,
  currentFilePath: null,

  setContent: (content) => set({ documentContent: content }),
  markDirty: () => set({ isDirty: true }),
  setFilePath: (path) => set({ currentFilePath: path, activeDocument: path }),
  resetDirty: () => set({ isDirty: false }),
}));
