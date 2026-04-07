/**
 * StatusBar component.
 */
import { basename } from "../lib/utils";

interface StatusBarProps {
  isDirty: boolean;
  filePath: string | null;
  hasActiveDocument: boolean;
  hasExternalChangeWarning: boolean;
}

export default function StatusBar({
  isDirty,
  filePath,
  hasActiveDocument,
  hasExternalChangeWarning,
}: StatusBarProps) {
  const filename = filePath
    ? basename(filePath)
    : hasActiveDocument
      ? "Untitled"
      : "No document";
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
