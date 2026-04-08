import type { OutlineHeading } from "../features/editor/outline";

interface OutlineSidebarProps {
  headings: OutlineHeading[];
  activeHeadingId: string | null;
  onSelectHeading: (heading: OutlineHeading) => void;
}

export default function OutlineSidebar({
  headings,
  activeHeadingId,
  onSelectHeading,
}: OutlineSidebarProps) {
  return (
    <aside className="outline-sidebar" aria-label="Document outline">
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
    </aside>
  );
}
