import { useCallback, useEffect, useRef, useState } from "react";

export const EDITOR_ZOOM_LEVELS = [50, 75, 90, 100, 110, 125, 150, 175, 200] as const;

/** Session-only view state. Never serialized into documents or preferences. */
export function useEditorZoom() {
  const [zoom, setZoom] = useState(100);
  const viewportRef = useRef<HTMLDivElement>(null);
  const selectZoom = useCallback((value: number) => {
    if (EDITOR_ZOOM_LEVELS.some(level => level === value)) setZoom(value);
  }, []);

  useEffect(() => {
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      // Suppress browser-level zoom so toolbars and sidebars never scale.
      event.preventDefault();
      if (!event.deltaY || !viewportRef.current?.contains(event.target as Node)) return;
      setZoom(current => {
        const index = EDITOR_ZOOM_LEVELS.findIndex(level => level === current);
        const next = Math.max(0, Math.min(EDITOR_ZOOM_LEVELS.length - 1, index + (event.deltaY < 0 ? 1 : -1)));
        return EDITOR_ZOOM_LEVELS[next];
      });
    };
    document.addEventListener("wheel", wheel, { passive: false });
    return () => document.removeEventListener("wheel", wheel);
  }, []);

  return { zoom, selectZoom, viewportRef };
}
