import { useEffect, useRef, useState } from "react";
import * as bridge from "../../services/tauriBridge";
import { runDropAction, type FileActionContext } from "../documents/fileActionService";

/**
 * Registers Tauri drag-drop event listeners on the current window.
 *
 * - Shows an overlay whenever files are dragged over the application window.
 * - On drop, validates the file extension and opens the first valid file via
 *   the existing `openDocumentFromPath` flow (including dirty-state confirmation).
 * - Falls back gracefully when the Tauri window API is unavailable (browser
 *   preview mode).
 */
export function useDragDropHandler(context: FileActionContext): { isDragOver: boolean } {
  const [isDragOver, setIsDragOver] = useState(false);

  // Keep a stable ref so the effect callback always sees the latest context
  // without needing to re-subscribe on every render.
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void bridge
      .onDragDropEvent((event) => {
        if (disposed) return;

        const { payload } = event;

        if (payload.type === "enter") {
          setIsDragOver(true);
        } else if (payload.type === "leave") {
          setIsDragOver(false);
        } else if (payload.type === "drop") {
          setIsDragOver(false);
          const firstPath = payload.paths[0];
          if (firstPath) {
            void runDropAction(firstPath, contextRef.current);
          }
        }
      })
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => {
        // onDragDropEvent is unavailable in browser preview mode — ignore.
      });

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  return { isDragOver };
}
