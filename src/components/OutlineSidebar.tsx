import { useRef, useState, useEffect } from "react";
import type { OutlineHeading } from "../features/editor/outline";

interface OutlineSidebarProps {
  headings: OutlineHeading[];
  activeHeadingId: string | null;
  onSelectHeading: (heading: OutlineHeading) => void;
  width: number;
  onWidthChange: (width: number) => void;
}

export default function OutlineSidebar({
  headings,
  activeHeadingId,
  onSelectHeading,
  width,
  onWidthChange,
}: OutlineSidebarProps) {
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (sidebarRef.current) {
        const newWidth = e.clientX;
        // Constrain width between 150px and 600px
        const constrainedWidth = Math.max(150, Math.min(600, newWidth));
        onWidthChange(constrainedWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, onWidthChange]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  return (
    <aside
      ref={sidebarRef}
      className="outline-sidebar"
      style={{ width: `${width}px` }}
      aria-label="Document outline"
    >
      <h2>Outline</h2>

      {headings.length === 0 ? (
        <p className="outline-empty">No headings yet</p>
      ) : (
        <ul className="outline-list">
          {headings.map((heading) => (
            <li key={heading.id}>
              <button
                type="button"
                className={`outline-item ${
                  heading.id === activeHeadingId ? "active" : ""
                }`}
                style={{ paddingLeft: `${12 + (heading.level - 1) * 14}px` }}
                onClick={() => onSelectHeading(heading)}
                title={heading.text}
              >
                {heading.text}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div
        className="outline-resize-handle"
        onMouseDown={handleResizeStart}
        aria-label="Resize sidebar"
      />
    </aside>
  );
}
