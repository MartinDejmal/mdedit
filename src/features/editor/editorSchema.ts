import { SearchHighlights } from "./search";
import { generateHTML, generateJSON } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  CodeBlockWithSyntax, ImageNode, LinkMark, ListIndentation, TableCellNode, TableHeaderNode,
  TableNode, TableRowNode, TaskItemNode, TaskListNode,
} from "./editorExtensions";

/** Loading and editing must use the same schema and serialization defaults. */
export function createEditorExtensions() {
  return [
    StarterKit.configure({ codeBlock: false }), CodeBlockWithSyntax,
    LinkMark, ImageNode, TaskListNode, TaskItemNode, ListIndentation,
    TableNode, TableRowNode, TableHeaderNode, TableCellNode, SearchHighlights,
  ];
}

export function normalizeEditorHtml(html: string): string {
  const extensions = createEditorExtensions();
  return generateHTML(generateJSON(html, extensions), extensions);
}
