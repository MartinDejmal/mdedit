import { create } from "zustand";
import type { ActiveDocument, DocumentStore } from "../types";
import { basename } from "../lib/utils";

const EMPTY_DOCUMENT: ActiveDocument = {
  path: null,
  name: null,
  rawLoadedContent: "",
  lastSavedCanonicalContent: "",
  lastSavedAt: null,
  fileMtime: null,
  lastKnownPath: null,
  hasExternalChangeWarning: false,
  externalChangeDetectedAt: null,
};

/**
 * Global document state.
 * Tracks active file metadata, canonical markdown content, and derived dirty state.
 */
export const useDocumentStore = create<DocumentStore>((set) => ({
  activeDocument: EMPTY_DOCUMENT,
  currentCanonicalMarkdown: "",
  isDirty: false,
  currentFilePath: null,

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
  markLoaded: ({ rawMarkdown, canonicalMarkdown, path, fileMtime }) =>
    set(() => ({
      currentCanonicalMarkdown: canonicalMarkdown,
      currentFilePath: path,
      isDirty: false,
      activeDocument: {
        path,
        name: path ? basename(path) : null,
        rawLoadedContent: rawMarkdown,
        lastSavedCanonicalContent: canonicalMarkdown,
        lastSavedAt: new Date().toISOString(),
        fileMtime,
        lastKnownPath: path,
        hasExternalChangeWarning: false,
        externalChangeDetectedAt: null,
      },
    })),
  markSaved: ({ canonicalMarkdown, path, fileMtime }) =>
    set((state) => ({
      currentCanonicalMarkdown: canonicalMarkdown,
      currentFilePath: path,
      isDirty: false,
      activeDocument: {
        ...state.activeDocument,
        path,
        name: path ? basename(path) : null,
        lastSavedCanonicalContent: canonicalMarkdown,
        lastSavedAt: new Date().toISOString(),
        fileMtime,
        lastKnownPath: path,
        hasExternalChangeWarning: false,
        externalChangeDetectedAt: null,
      },
    })),
  reconcileCurrentCanonicalMarkdown: (markdown) =>
    set((state) => {
      const shouldBeDirty =
        markdown !== state.activeDocument.lastSavedCanonicalContent;

      if (
        markdown === state.currentCanonicalMarkdown &&
        shouldBeDirty === state.isDirty
      ) {
        return state;
      }

      return {
        currentCanonicalMarkdown: markdown,
        isDirty: shouldBeDirty,
      };
    }),
  markExternalChangeWarning: (detectedAt) =>
    set((state) => {
      if (state.activeDocument.hasExternalChangeWarning) {
        return state;
      }

      return {
        activeDocument: {
          ...state.activeDocument,
          hasExternalChangeWarning: true,
          externalChangeDetectedAt: detectedAt,
        },
      };
    }),
  clearExternalChangeWarning: () =>
    set((state) => ({
      activeDocument: {
        ...state.activeDocument,
        hasExternalChangeWarning: false,
        externalChangeDetectedAt: null,
      },
    })),
}));
