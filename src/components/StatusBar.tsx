/**
 * StatusBar component.
 *
 * Shows the currently open file path and a dirty indicator when the
 * document has unsaved changes.
 */
import { basename } from "../lib/utils";

interface StatusBarProps {
  isDirty: boolean;
  filePath: string | null;
}

export default function StatusBar({ isDirty, filePath }: StatusBarProps) {
  const label = filePath ? basename(filePath) : "No file open";

  return (
    <div className="status-bar" role="status" aria-live="polite">
      <span className="status-path" title={filePath ?? undefined}>
        {label}
      </span>
      {isDirty && (
        <span className="status-dirty" title="Unsaved changes">
          ● Unsaved
        </span>
      )}
    </div>
  );
}
