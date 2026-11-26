import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node } from "@tiptap/pm/model";

export interface SearchMatch { from: number; to: number; value: string; captures: (string | undefined)[]; groups?: Record<string, string> }
export const searchKey = new PluginKey<DecorationSet>("documentSearch");
export const SearchHighlights = Extension.create({
  name: "searchHighlights",
  addProseMirrorPlugins() {
    return [new Plugin({
      key: searchKey,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, previous) {
          const data = tr.getMeta(searchKey) as { matches: SearchMatch[]; active: number } | undefined;
          return data ? DecorationSet.create(tr.doc, data.matches.map((match, index) =>
            Decoration.inline(match.from, match.to, { class: index === data.active ? "search-match search-current" : "search-match" })))
            : previous.map(tr.mapping, tr.doc);
        },
      },
      props: { decorations: state => searchKey.getState(state) },
    })];
  },
});

export function searchText(text: string, query: string, regex: boolean, matchCase: boolean): { matches: SearchMatch[]; error: string } {
  if (!query) return { matches: [], error: "" };
  let expression: RegExp;
  try { expression = new RegExp(regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), matchCase ? "gu" : "giu"); }
  catch (error) { return { matches: [], error: error instanceof Error ? error.message : "Invalid regular expression" }; }
  const matches: SearchMatch[] = [];
  for (const match of text.matchAll(expression)) {
    if (!match[0].length) continue;
    matches.push({ from: match.index!, to: match.index! + match[0].length, value: match[0], captures: match.slice(1), groups: match.groups });
  }
  return { matches, error: "" };
}

export function searchDocument(doc: Node, query: string, regex: boolean, matchCase: boolean): { matches: SearchMatch[]; error: string } {
  const matches: SearchMatch[] = [];
  let error = "";
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const text = node.textBetween(0, node.content.size, "", leaf => leaf.type.name === "hardBreak" ? "\n" : "\ufffc");
    const result = searchText(text, query, regex, matchCase);
    error = result.error;
    matches.push(...result.matches.map(match => ({ ...match, from: match.from + pos + 1, to: match.to + pos + 1 })));
    return false;
  });
  return { matches, error };
}

export function replacementText(match: SearchMatch, value: string, regex: boolean) {
  if (!regex) return value;
  return value.replace(/\$(\$|&|[1-9]\d?|<[^>]+>)/g, (token, part: string) => {
    if (part === "$") return "$";
    if (part === "&") return match.value;
    if (part.startsWith("<")) return match.groups ? match.groups[part.slice(1, -1)] ?? "" : token;
    const index = Number(part);
    if (index <= match.captures.length) return match.captures[index - 1] ?? "";
    if (part.length === 2 && Number(part[0]) <= match.captures.length) return (match.captures[Number(part[0]) - 1] ?? "") + part[1];
    return token;
  });
}
