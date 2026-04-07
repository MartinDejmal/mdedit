/**
 * StatusBar component.
 */
import { basename } from "../lib/utils";

interface StatusBarProps {
  isDirty: boolean;
  filePath: string | null;
}

export default function StatusBar({ isDirty, filePath }: StatusBarProps) {
  const filename = filePath ? basename(filePath) : "Untitled";
  const dirtyLabel = isDirty ? "Modified" : "Saved";

  return (
    <div className="status-bar" role="status" aria-live="polite">
      <span className="status-path" title={filePath ?? undefined}>
        {filename}
      </span>
      <span className={`status-dirty ${isDirty ? "is-modified" : "is-saved"}`}>
        {dirtyLabel}
      </span>
    </div>
  );
}
