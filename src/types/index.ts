/** Application-level TypeScript types. */

/** Native file metadata fetched from Tauri backend. */
export interface FileMetadata {
  /** Last-modified timestamp in Unix epoch milliseconds. */
  modifiedMs: number | null;
}

/** Metadata carried with the currently active document. */
export interface ActiveDocument {
  /** Absolute path on disk; null for untitled documents. */
  path: string | null;
  /** Basename derived from path, or null for untitled documents. */
  name: string | null;
  /** Raw Markdown text last loaded from disk (before canonicalisation). */
  rawLoadedContent: string;
  /** Canonical Markdown last successfully written to disk. */
  lastSavedCanonicalContent: string;
  /** Timestamp when save/open last synchronized persisted content. */
  lastSavedAt: string | null;
  /** Last known filesystem mtime for the active path. */
  fileMtime: number | null;
  /** Path snapshot for future file move/rename resolution. */
  lastKnownPath: string | null;
  /** True once focus-based metadata check notices external file changes. */
  hasExternalChangeWarning: boolean;
  /** ISO timestamp when external change warning was first raised. */
  externalChangeDetectedAt: string | null;
}

/** State shape managed by the document Zustand store. */
export interface DocumentState {
  /** Active document metadata. */
  activeDocument: ActiveDocument;
  /** Canonical Markdown computed from the current editor state. */
  currentCanonicalMarkdown: string;
  /** True when canonical editor content diverges from last saved canonical content. */
  isDirty: boolean;
  /** Absolute path of the file currently open; null if not yet saved. */
  currentFilePath: string | null;
}

/** Mutating actions exposed by the document store. */
export interface DocumentActions {
  /** Update active file path details. */
  setFilePath: (path: string | null) => void;
  /** Update metadata after load/open sync. */
  markLoaded: (payload: {
    rawMarkdown: string;
    canonicalMarkdown: string;
    path: string | null;
    fileMtime: number | null;
  }) => void;
  /** Update metadata after successful save. */
  markSaved: (payload: {
    canonicalMarkdown: string;
    path: string | null;
    fileMtime: number | null;
  }) => void;
  /** Reconcile current canonical markdown and derived dirty state. */
  reconcileCurrentCanonicalMarkdown: (markdown: string) => void;
  /** Mark that metadata check observed an external file modification. */
  markExternalChangeWarning: (detectedAt: string) => void;
  /** Clear external change warning (e.g. after open/save). */
  clearExternalChangeWarning: () => void;
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
