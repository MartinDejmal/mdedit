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
  /** ISO timestamp when the document was explicitly reloaded from disk. */
  lastReloadedAt: string | null;
  /** Last observed mtime from disk checks (used for warning/debug context). */
  lastObservedDiskMtime: number | null;
  /** True when current saved baseline is aligned with last known disk version. */
  isDiskVersionInSyncWithBaseline: boolean;
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
    source: "open" | "reload";
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
  markExternalChangeWarning: (payload: {
    detectedAt: string;
    detectedMtime: number | null;
  }) => void;
  /** Clear external change warning (e.g. after open/save). */
  clearExternalChangeWarning: () => void;
}

export interface OpenDocumentResult {
  kind: "opened" | "cancelled" | "error";
  html?: string;
  path?: string;
  message?: string;
}

export interface SaveDocumentResult {
  kind: "saved" | "cancelled";
  path?: string | null;
}

export type DocumentStore = DocumentState & DocumentActions;

export interface ReloadDocumentResult {
  kind: "reloaded" | "cancelled" | "noop" | "error";
  html?: string;
  message?: string;
}
