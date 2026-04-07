/**
 * Layout component.
 *
 * Provides the three-zone shell: toolbar (top), main editor area (middle),
 * status bar (bottom).  Children are rendered in document order.
 */
import type { ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return <div className="app-shell">{children}</div>;
}
