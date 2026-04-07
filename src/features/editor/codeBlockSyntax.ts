import CodeBlock from "@tiptap/extension-code-block";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const SUPPORTED_CODE_BLOCK_LANGUAGES = [
  "plaintext",
  "javascript",
  "typescript",
  "json",
  "html",
  "css",
  "bash",
  "sql",
  "yaml",
  "markdown",
] as const;

export type SupportedCodeBlockLanguage = (typeof SUPPORTED_CODE_BLOCK_LANGUAGES)[number];

const LANGUAGE_ALIASES: Record<string, SupportedCodeBlockLanguage> = {
  text: "plaintext",
  plain: "plaintext",
  plaintext: "plaintext",
  js: "javascript",
  javascript: "javascript",
  ts: "typescript",
  typescript: "typescript",
  json: "json",
  html: "html",
  xml: "html",
  css: "css",
  sh: "bash",
  shell: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  markdown: "markdown",
};

const KEYWORDS: Record<string, string[]> = {
  javascript: [
    "const",
    "let",
    "var",
    "function",
    "return",
    "if",
    "else",
    "for",
    "while",
    "switch",
    "case",
    "break",
    "class",
    "new",
    "import",
    "export",
    "from",
    "async",
    "await",
    "try",
    "catch",
    "throw",
    "null",
    "undefined",
    "true",
    "false",
  ],
  typescript: [
    "interface",
    "type",
    "implements",
    "extends",
    "enum",
    "readonly",
    "public",
    "private",
    "protected",
    "declare",
    "as",
    "unknown",
    "never",
    ...[
      "const",
      "let",
      "var",
      "function",
      "return",
      "if",
      "else",
      "for",
      "while",
      "class",
      "import",
      "export",
      "from",
      "async",
      "await",
      "true",
      "false",
      "null",
    ],
  ],
  sql: [
    "select",
    "from",
    "where",
    "insert",
    "into",
    "update",
    "delete",
    "join",
    "left",
    "right",
    "inner",
    "outer",
    "group",
    "by",
    "order",
    "limit",
    "having",
    "as",
    "and",
    "or",
    "not",
    "null",
    "create",
    "table",
  ],
  bash: [
    "if",
    "then",
    "fi",
    "for",
    "in",
    "do",
    "done",
    "case",
    "esac",
    "function",
    "export",
    "local",
    "echo",
    "cat",
    "grep",
    "awk",
    "sed",
  ],
};

function keywordRegex(language: "javascript" | "typescript" | "sql" | "bash"): RegExp {
  const body = KEYWORDS[language].join("|");
  const flags = language === "sql" ? "gi" : "g";
  return new RegExp(`\\b(${body})\\b`, flags);
}

function addMatches(
  decorations: Decoration[],
  text: string,
  regex: RegExp,
  className: string,
  offset: number
): void {
  for (const match of text.matchAll(regex)) {
    const index = match.index;
    const value = match[0];
    if (index === undefined || !value) continue;
    decorations.push(
      Decoration.inline(offset + index, offset + index + value.length, {
        class: className,
      })
    );
  }
}

function highlightCode(language: string | null | undefined, text: string, offset: number): Decoration[] {
  const normalized = normalizeCodeBlockLanguage(language);
  const decorations: Decoration[] = [];

  if (normalized === "plaintext") {
    return decorations;
  }

  if (normalized === "javascript" || normalized === "typescript") {
    addMatches(decorations, text, /\/\/.*$/gm, "cm-comment", offset);
    addMatches(decorations, text, /\/\*[\s\S]*?\*\//g, "cm-comment", offset);
    addMatches(decorations, text, /(["'`])(?:\\.|(?!\1)[\s\S])*\1/g, "cm-string", offset);
    addMatches(decorations, text, /\b\d+(?:\.\d+)?\b/g, "cm-number", offset);
    addMatches(
      decorations,
      text,
      keywordRegex(normalized === "typescript" ? "typescript" : "javascript"),
      "cm-keyword",
      offset
    );
    return decorations;
  }

  if (normalized === "json") {
    addMatches(decorations, text, /"(?:\\.|[^"\\])*"(?=\s*:)/g, "cm-property", offset);
    addMatches(decorations, text, /"(?:\\.|[^"\\])*"/g, "cm-string", offset);
    addMatches(decorations, text, /\b-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi, "cm-number", offset);
    addMatches(decorations, text, /\b(true|false|null)\b/g, "cm-keyword", offset);
    return decorations;
  }

  if (normalized === "html") {
    addMatches(decorations, text, /<\/?[a-zA-Z][\w:-]*/g, "cm-keyword", offset);
    addMatches(decorations, text, /\s[\w:-]+(?==)/g, "cm-property", offset);
    addMatches(decorations, text, /"(?:\\.|[^"\\])*"/g, "cm-string", offset);
    return decorations;
  }

  if (normalized === "css") {
    addMatches(decorations, text, /\/\*[\s\S]*?\*\//g, "cm-comment", offset);
    addMatches(decorations, text, /(^|[;{]\s*)([.#]?[a-zA-Z_-][\w-]*)/gm, "cm-keyword", offset);
    addMatches(decorations, text, /([a-zA-Z-]+)(?=\s*:)/g, "cm-property", offset);
    addMatches(decorations, text, /#[0-9a-fA-F]{3,8}\b/g, "cm-number", offset);
    return decorations;
  }

  if (normalized === "bash") {
    addMatches(decorations, text, /(^|\s)#[^\n]*/g, "cm-comment", offset);
    addMatches(decorations, text, /\$[{(]?[A-Za-z_][\w]*[)}]?/g, "cm-variable", offset);
    addMatches(decorations, text, /(["'])(?:\\.|(?!\1)[\s\S])*\1/g, "cm-string", offset);
    addMatches(decorations, text, keywordRegex("bash"), "cm-keyword", offset);
    return decorations;
  }

  if (normalized === "sql") {
    addMatches(decorations, text, /--.*$/gm, "cm-comment", offset);
    addMatches(decorations, text, /(["'])(?:\\.|(?!\1)[\s\S])*\1/g, "cm-string", offset);
    addMatches(decorations, text, /\b\d+(?:\.\d+)?\b/g, "cm-number", offset);
    addMatches(decorations, text, keywordRegex("sql"), "cm-keyword", offset);
    return decorations;
  }

  if (normalized === "yaml") {
    addMatches(decorations, text, /(^|\s)#[^\n]*/g, "cm-comment", offset);
    addMatches(decorations, text, /^[ \t-]*[A-Za-z0-9_.-]+(?=\s*:)/gm, "cm-property", offset);
    addMatches(decorations, text, /(["'])(?:\\.|(?!\1)[\s\S])*\1/g, "cm-string", offset);
    addMatches(decorations, text, /\b(true|false|null|yes|no|on|off)\b/gi, "cm-keyword", offset);
    return decorations;
  }

  if (normalized === "markdown") {
    addMatches(decorations, text, /^#{1,6}\s.*$/gm, "cm-keyword", offset);
    addMatches(decorations, text, /`[^`\n]+`/g, "cm-string", offset);
    addMatches(decorations, text, /\[([^\]]+)\]\(([^)]+)\)/g, "cm-property", offset);
    addMatches(decorations, text, /^\s*[-*+]\s+/gm, "cm-variable", offset);
  }

  return decorations;
}

export function normalizeCodeBlockLanguage(language: string | null | undefined): SupportedCodeBlockLanguage {
  if (!language) return "plaintext";
  const normalized = LANGUAGE_ALIASES[language.trim().toLowerCase()];
  return normalized ?? "plaintext";
}

export const CodeBlockWithSyntax = CodeBlock.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      defaultLanguage: "plaintext",
    };
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== this.name) return;
              const text = node.textContent;
              if (!text) return;
              decorations.push(...highlightCode(node.attrs.language, text, pos + 1));
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
