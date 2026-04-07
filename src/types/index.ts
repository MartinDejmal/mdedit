/** Application-level TypeScript types. */

/** State shape managed by the document Zustand store. */
export interface DocumentState {
  /** Display name / path of the active document (null if none open). */
  activeDocument: string | null;
  /** Raw markdown text of the current document as persisted on disk. */
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
  /** Mark the document as having unsaved changes. */
  markDirty: () => void;
  /** Set the file path and update the active document name. */
  setFilePath: (path: string) => void;
  /** Clear the dirty flag (call after a successful save). */
  resetDirty: () => void;
}

export type DocumentStore = DocumentState & DocumentActions;
