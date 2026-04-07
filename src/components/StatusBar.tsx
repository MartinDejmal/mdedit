/**
 * StatusBar component.
 */
import { basename } from "../lib/utils";

interface StatusBarProps {
  isDirty: boolean;
  filePath: string | null;
  hasExternalChangeWarning: boolean;
}

export default function StatusBar({
  isDirty,
  filePath,
  hasExternalChangeWarning,
}: StatusBarProps) {
  const filename = filePath ? basename(filePath) : "Untitled";
  const dirtyLabel = isDirty ? "Modified" : "Saved";

  return (
    <div className="status-bar" role="status" aria-live="polite">
      <span className="status-path" title={filePath ?? undefined}>
        {filename}
      </span>
      <div className="status-right">
        {hasExternalChangeWarning ? (
          <span className="status-external-warning">External change detected</span>
        ) : null}
        <span className={`status-dirty ${isDirty ? "is-modified" : "is-saved"}`}>
          {dirtyLabel}
        </span>
      </div>
    </div>
  );
}
