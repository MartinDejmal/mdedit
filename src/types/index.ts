/** Application-level TypeScript types. */

/** Metadata carried with the currently active document. */
export interface ActiveDocument {
  /** Absolute path on disk; null for untitled documents. */
  path: string | null;
  /** Basename derived from path, or null for untitled documents. */
  name: string | null;
  /** Last markdown loaded from disk/open flow. */
  lastLoadedContent: string;
  /** Last markdown that was successfully written to disk. */
  lastSavedContent: string;
  /** Timestamp when save/open last synchronized persisted content. */
  lastSavedAt: string | null;
  /** Reserved for future external file change detection. */
  fileMtime: number | null;
  /** Path snapshot for future file move/rename resolution. */
  lastKnownPath: string | null;
}

/** State shape managed by the document Zustand store. */
export interface DocumentState {
  /** Active document model; null before initialization. */
  activeDocument: ActiveDocument;
  /** Raw markdown text currently represented by editor content. */
  documentContent: string;
  /** True when the editor has unsaved changes. */
  isDirty: boolean;
  /** Absolute path of the file currently open; null if not yet saved. */
  currentFilePath: string | null;
}

/** Mutating actions exposed by the document store. */
export interface DocumentActions {
  /** Replace stored markdown content (does not mark dirty). */
  setContent: (content: string) => void;
  /** Update active file path details. */
  setFilePath: (path: string | null) => void;
  /** Update metadata after load/open sync. */
  markLoaded: (payload: { markdown: string; path: string | null }) => void;
  /** Update metadata after successful save. */
  markSaved: (payload: { markdown: string; path: string | null }) => void;
  /** Mark the document as having unsaved changes. */
  setDirty: (dirty: boolean) => void;
  /** Clear the dirty flag (call after a successful save). */
  resetDirty: () => void;
}

export interface OpenDocumentResult {
  kind: "opened" | "cancelled";
  html?: string;
}

export interface SaveDocumentResult {
  kind: "saved" | "cancelled";
  path?: string | null;
}

export type DocumentStore = DocumentState & DocumentActions;
