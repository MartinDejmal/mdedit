import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";

const UNTITLED_HEADING_FALLBACK = "Untitled heading";

export interface OutlineHeading {
  id: string;
  text: string;
  level: number;
  pos: number;
}

export function extractOutlineFromDoc(doc: ProseMirrorNode): OutlineHeading[] {
  const headings: OutlineHeading[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") {
      return true;
    }

    const levelAttr = node.attrs.level;
    const level =
      typeof levelAttr === "number" && levelAttr >= 1 && levelAttr <= 6 ? levelAttr : 1;
    const text = node.textContent.trim() || UNTITLED_HEADING_FALLBACK;

    headings.push({
      id: `heading-${pos}`,
      text,
      level,
      pos,
    });

    return false;
  });

  return headings;
}

export function getActiveHeadingId(
  headings: OutlineHeading[],
  selectionPos: number
): string | null {
  let activeId: string | null = null;

  for (const heading of headings) {
    if (heading.pos > selectionPos) {
      break;
    }
    activeId = heading.id;
  }

  return activeId;
}

export function navigateToHeading(editor: Editor, pos: number): void {
  const headingTextStart = Math.max(1, pos + 1);
  editor.chain().focus().setTextSelection(headingTextStart).scrollIntoView().run();
}

export function areOutlineHeadingsEqual(
  left: OutlineHeading[],
  right: OutlineHeading[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const lhs = left[index];
    const rhs = right[index];

    if (
      lhs.id !== rhs.id ||
      lhs.text !== rhs.text ||
      lhs.level !== rhs.level ||
      lhs.pos !== rhs.pos
    ) {
      return false;
    }
  }

  return true;
}
