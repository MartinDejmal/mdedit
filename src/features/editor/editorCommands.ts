import type { Editor } from "@tiptap/react";

export function insertLink(editor: Editor): void {
  const existingHref = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("Enter link URL", existingHref ?? "https://");

  if (!url) return;

  const normalizedUrl = url.trim();
  if (!normalizedUrl) return;

  if (editor.state.selection.empty) {
    const from = editor.state.selection.from;
    editor
      .chain()
      .focus()
      .insertContent(normalizedUrl)
      .setTextSelection({ from, to: from + normalizedUrl.length })
      .setMark("link", { href: normalizedUrl })
      .run();
    return;
  }

  editor.chain().focus().extendMarkRange("link").setMark("link", { href: normalizedUrl }).run();
}

export function removeLink(editor: Editor): void {
  editor.chain().focus().extendMarkRange("link").unsetMark("link").run();
}

export function insertImage(editor: Editor): void {
  const src = window.prompt("Enter image URL", "https://");
  if (!src) return;

  const normalizedSrc = src.trim();
  if (!normalizedSrc) return;

  const alt = window.prompt("Alt text (optional)", "") ?? "";
  editor.chain().focus().insertContent({ type: "image", attrs: { src: normalizedSrc, alt: alt.trim() || null } }).run();
}

export function insertTaskList(editor: Editor): void {
  editor
    .chain()
    .focus()
    .insertContent({
      type: "taskList",
      content: [
        {
          type: "taskItem",
          attrs: { checked: false },
          content: [{ type: "paragraph" }],
        },
      ],
    })
    .run();
}

export function insertDefaultTable(editor: Editor): void {
  editor
    .chain()
    .focus()
    .insertContent({
      type: "table",
      content: [
        {
          type: "tableRow",
          content: ["A", "B", "C"].map((text) => ({
            type: "tableHeader",
            content: [{ type: "paragraph", content: [{ type: "text", text }] }],
          })),
        },
        ...[1, 2].map(() => ({
          type: "tableRow",
          content: ["", "", ""].map(() => ({
            type: "tableCell",
            content: [{ type: "paragraph" }],
          })),
        })),
      ],
    })
    .run();
}
