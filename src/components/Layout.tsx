/**
 * Layout component.
 *
 * Provides the three-zone shell: toolbar (top), main editor area (middle),
 * status bar (bottom).  Children are rendered in document order.
 *
 * When `isDragOver` is true a full-viewport overlay is rendered to give the
 * user visual feedback that dropping a file will open it.
 */
import type { ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
  isDragOver?: boolean;
}

export default function Layout({ children, isDragOver = false }: LayoutProps) {
  return (
    <div className="app-shell">
      {children}
      {isDragOver && (
        <div className="drag-drop-overlay" aria-hidden="true">
          <div className="drag-drop-overlay-badge">Drop to open file</div>
        </div>
      )}
    </div>
  );
}
