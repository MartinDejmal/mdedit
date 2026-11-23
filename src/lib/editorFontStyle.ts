import type { CSSProperties } from "react";
import type { EditorFontSettings } from "../services/appStateService";

function fontStack(family: string | null, fallback: string): string | undefined {
  if (!family) return undefined;
  // Treat even commas, quotes and CSS keywords as part of one family name.
  return `"${CSS.escape(family)}", var(${fallback})`;
}

export function editorFontStyle({ editorFontFamily, codeFontFamily }: EditorFontSettings): CSSProperties {
  return {
    "--selected-editor-font": fontStack(editorFontFamily, "--font-editor"),
    "--selected-code-font": fontStack(codeFontFamily, "--font-mono"),
  } as CSSProperties;
}
