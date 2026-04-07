import type { Editor } from "@tiptap/react";

import type { InputDialogOptions } from "../ux/useAppUx";

type RequestInput = (options: InputDialogOptions) => Promise<string | null>;

function normalizeUrl(rawValue: string): string {
  const value = rawValue.trim();
  if (!value) return "";

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value);
  const isAnchor = value.startsWith("#");
  const isAbsolutePath = value.startsWith("/");

  if (hasScheme || isAnchor || isAbsolutePath) {
    return value;
  }

  return `https://${value}`;
}

function requireNonEmpty(value: string): string | null {
  return value.trim() ? null : "This field cannot be empty.";
}

export async function insertLink(editor: Editor, requestInput: RequestInput): Promise<void> {
  const existingHref = editor.getAttributes("link").href as string | undefined;
  const enteredUrl = await requestInput({
    title: "Insert link",
    message: "Enter the destination URL.",
    label: "Link URL",
    placeholder: "https://example.com",
    initialValue: existingHref ?? "https://",
    confirmLabel: "Apply link",
    cancelLabel: "Cancel",
    confirmOnEnter: true,
    validation: requireNonEmpty,
  });

  if (enteredUrl === null) return;

  const normalizedUrl = normalizeUrl(enteredUrl);
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

export async function insertImage(editor: Editor, requestInput: RequestInput): Promise<void> {
  const enteredUrl = await requestInput({
    title: "Insert image",
    message: "Enter an image URL.",
    label: "Image URL",
    placeholder: "https://example.com/image.png",
    initialValue: "https://",
    confirmLabel: "Continue",
    cancelLabel: "Cancel",
    confirmOnEnter: true,
    validation: requireNonEmpty,
  });

  if (enteredUrl === null) return;

  const normalizedSrc = normalizeUrl(enteredUrl);
  if (!normalizedSrc) return;

  const alt = await requestInput({
    title: "Image alt text",
    message: "Add optional alt text for accessibility.",
    label: "Alt text",
    placeholder: "Describe the image (optional)",
    initialValue: "",
    confirmLabel: "Insert image",
    cancelLabel: "Skip",
    confirmOnEnter: true,
  });

  editor
    .chain()
    .focus()
    .insertContent({
      type: "image",
      attrs: {
        src: normalizedSrc,
        alt: alt === null ? null : alt.trim() || null,
      },
    })
    .run();
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
