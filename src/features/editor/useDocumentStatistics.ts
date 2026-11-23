import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

interface TextBlock {
  node: ProseMirrorNode;
  pos: number;
  line: number;
}

const leafText = (node: ProseMirrorNode) => node.type.name === "hardBreak" ? "\n" : "";
const countCharacters = (text: string) => Array.from(text).length;

/** Logical editor text: one newline between text blocks, independent of layout. */
function readDocument(doc: ProseMirrorNode) {
  const blocks: TextBlock[] = [];
  const parts: string[] = [];
  let line = 1;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    if (blocks.length) line++;
    blocks.push({ node, pos, line });
    const text = node.textBetween(0, node.content.size, "\n", leafText);
    parts.push(text);
    line += text.split("\n").length - 1;
    return false;
  });
  const text = parts.join("\n");
  return {
    blocks,
    lines: line,
    words: (text.match(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu) ?? []).length,
    characters: countCharacters(text),
  };
}

function readCursor(blocks: TextBlock[], head: number) {
  let block = blocks[0];
  for (const candidate of blocks) {
    if (candidate.pos >= head) break;
    block = candidate;
  }
  if (!block) return { line: 1, column: 1 };
  const offset = Math.max(0, Math.min(block.node.content.size, head - block.pos - 1));
  const lines = block.node.textBetween(0, offset, "\n", leafText).split("\n");
  return { line: block.line + lines.length - 1, column: countCharacters(lines[lines.length - 1]) + 1 };
}

const EMPTY_STATISTICS = { lines: 1, words: 0, characters: 0, line: 1, column: 1 };

export function useDocumentStatistics(editor: Editor | null) {
  const [statistics, setStatistics] = useState(EMPTY_STATISTICS);
  useEffect(() => {
    if (!editor) {
      setStatistics(EMPTY_STATISTICS);
      return;
    }
    let cachedDoc = editor.state.doc;
    let document = readDocument(cachedDoc);
    const update = () => {
      // Cursor movement should not recount words or characters in the document.
      if (cachedDoc !== editor.state.doc) {
        cachedDoc = editor.state.doc;
        document = readDocument(cachedDoc);
      }
      const { lines, words, characters } = document;
      const cursor = readCursor(document.blocks, editor.state.selection.head);
      setStatistics(previous => {
        if (previous.lines === lines && previous.words === words && previous.characters === characters &&
            previous.line === cursor.line && previous.column === cursor.column) return previous;
        return { lines, words, characters, ...cursor };
      });
    };
    update();
    editor.on("transaction", update);
    return () => { editor.off("transaction", update); };
  }, [editor]);
  return statistics;
}
