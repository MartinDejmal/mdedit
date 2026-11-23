import type { JSONContent } from "@tiptap/core";
import { EditorState, Selection, type Transaction } from "@tiptap/pm/state";
import { liftListItem } from "@tiptap/pm/schema-list";
import type { Editor } from "@tiptap/react";

import type { InputDialogOptions } from "../ux/useAppUx";
import { normalizeCodeBlockLanguage } from "./codeBlockSyntax";

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
  if (editor.isActive("taskList")) {
    editor.chain().focus().liftListItem("taskItem").run();
    return;
  }

  // Check if there's a text selection
  if (!editor.state.selection.empty) {
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, "\n");

    // Split the selected text into lines
    const lines = selectedText.split("\n").filter(line => line.trim());

    if (lines.length > 0) {
      // Create task list items from each line
      const taskListContent = {
        type: "taskList",
        content: lines.map(line => ({
          type: "taskItem",
          attrs: { checked: false },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: line.trim() }]
            }
          ]
        }))
      };

      // Replace the selection with the task list
      editor.chain()
        .focus()
        .deleteSelection()
        .insertContent(taskListContent)
        .run();
      return;
    }
  }

  editor.chain().focus().wrapInList("taskList").run();
}

export function toggleCodeBlock(editor: Editor): void {
  if (editor.isActive("codeBlock")) {
    editor.chain().focus().toggleCodeBlock().run();
    return;
  }

  editor.chain().focus().setCodeBlock({ language: "plaintext" }).run();
}

export function getActiveCodeBlockLanguage(editor: Editor): string | null {
  if (!editor.isActive("codeBlock")) return null;
  const language = editor.getAttributes("codeBlock").language as string | null | undefined;
  return normalizeCodeBlockLanguage(language);
}

export function setCodeBlockLanguage(editor: Editor, language: string): void {
  if (!editor.isActive("codeBlock")) return;
  const nextLanguage = normalizeCodeBlockLanguage(language);
  editor.chain().focus().updateAttributes("codeBlock", { language: nextLanguage }).run();
}

export function cycleHeading(editor: Editor): void {
  const level = editor.isActive("heading", { level: 1 }) ? 2
    : editor.isActive("heading", { level: 2 }) ? 3
    : editor.isActive("heading", { level: 3 }) ? null : 1;
  const chain = editor.chain().focus();
  // A list item must begin with a paragraph. Lift the selected item through
  // every surrounding list before setting its block type; preserve siblings.
  const { $from } = editor.state.selection;
  const lists: string[] = [];
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name;
    if (name === "listItem" || name === "taskItem") lists.push(name);
  }
  chain.command(({ tr, state }) => {
    let working = EditorState.create({ schema: state.schema, doc: tr.doc, selection: tr.selection });
    for (const name of lists) {
      // schema-list commands require a fresh transaction mapping for each lift.
      let lifted: Transaction | undefined;
      if (!liftListItem(state.schema.nodes[name])(working, next => { lifted = next; }) || !lifted) return false;
      for (const step of lifted.steps) tr.step(step);
      tr.setSelection(Selection.fromJSON(tr.doc, lifted.selection.toJSON()));
      working = working.apply(lifted);
    }
    return true;
  });
  if (level) chain.setHeading({ level });
  else chain.setParagraph();
  chain.run();
}

/** Preserve selected inline nodes while turning paragraphs/hard breaks into rows. */
function tableFromSelection(editor: Editor): JSONContent {
  const { from, to } = editor.state.selection;
  const lines: JSONContent[][] = [];
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return;
    const start = Math.max(0, from - pos - 1);
    const end = Math.min(node.content.size, to - pos - 1);
    if (start >= end && !(node.content.size === 0 && from <= pos && to >= pos + node.nodeSize)) return false;
    let line: JSONContent[] = [];
    for (const inline of node.content.cut(start, end).toJSON() ?? []) {
      if (inline.type === "hardBreak") { lines.push(line); line = []; }
      else if (inline.type === "text") {
        const parts = (inline.text as string).split("\n");
        parts.forEach((text, index) => {
          if (index) { lines.push(line); line = []; }
          if (text) line.push({ ...inline, text });
        });
      } else line.push(inline);
    }
    lines.push(line);
    return false;
  });
  const text = (nodes: JSONContent[]) => nodes.map(node => node.text ?? "").join("");
  const nonempty = lines.filter(line => text(line).trim());
  const delimiter = lines.some(line => text(line).includes("\t")) ? "\t"
    : nonempty.length && nonempty.every(line => /^\s*\|.*\|\s*$/.test(text(line))) ? "|" : null;
  const empty = (cell: JSONContent[]) => cell.every(node => node.type === "text" && !node.text?.trim());
  const rows = lines.map(line => {
    const cells: JSONContent[][] = [[]];
    for (const node of line) {
      if (!delimiter || node.type !== "text") { cells[cells.length - 1].push(node); continue; }
      (node.text ?? "").split(delimiter).forEach((part, index) => {
        if (index) cells.push([]);
        if (part) cells[cells.length - 1].push({ ...node, text: part });
      });
    }
    if (delimiter === "|") {
      if (cells.length > 1 && empty(cells[0])) cells.shift();
      if (cells.length > 1 && empty(cells[cells.length - 1])) cells.pop();
    }
    return cells;
  }).filter(cells => delimiter !== "|" || !cells.every(cell => /^:?-{3,}:?$/.test(text(cell).trim())));
  const width = Math.max(1, ...rows.map(row => row.length));
  if (!rows.length) rows.push([[]]);
  return {
    type: "table",
    content: rows.map((row, index) => ({
      type: "tableRow",
      content: Array.from({ length: width }, (_, column) => ({
        type: index === 0 ? "tableHeader" : "tableCell",
        content: [{ type: "paragraph", content: row[column] ?? [] }],
      })),
    })),
  };
}

export function insertDefaultTable(editor: Editor): void {
  if (!editor.state.selection.empty) {
    editor.chain().focus().insertContent(tableFromSelection(editor)).run();
    return;
  }
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
