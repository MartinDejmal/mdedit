import type { ReactNode } from "react";

interface IconButtonProps {
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  className?: string;
}

export default function IconButton({
  icon,
  active = false,
  disabled = false,
  onClick,
  title,
  className = "",
}: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={`icon-button ${active ? "active" : ""} ${className}`.trim()}
    >
      {icon}
    </button>
  );
}
