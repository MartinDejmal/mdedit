/**
 * Toolbar component.
 */
import type { Editor } from "@tiptap/react";
import {
  Bold,
  CheckSquare,
  Code,
  FileCode,
  FileDown,
  FilePlus,
  FolderOpen,
  Heading,
  Image,
  Italic,
  Link,
  List,
  ListOrdered,
  RefreshCw,
  Save,
  SaveAll,
  Table,
  Unlink,
} from "lucide-react";

import { SUPPORTED_CODE_BLOCK_LANGUAGES } from "../features/editor/codeBlockSyntax";
import { insertDefaultTable, insertTaskList } from "../features/editor/editorCommands";
import { basename } from "../lib/utils";
import IconButton from "./IconButton";

const ICON_SIZE = 18;

interface ToolbarProps {
  editor: Editor | null;
  onNew: () => void;
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  recentFiles: string[];
  onReload: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExportHtml: () => void;
  onExportPdf: () => void;
  onInsertLink: () => void;
  onRemoveLink: () => void;
  onInsertImage: () => void;
  canReload: boolean;
  highlightReload: boolean;
  activeCodeBlockLanguage: string | null;
  onToggleCodeBlock: () => void;
  onSetCodeBlockLanguage: (language: string) => void;
}

export default function Toolbar({
  editor,
  onNew,
  onOpen,
  onOpenRecent,
  recentFiles,
  onReload,
  onSave,
  onSaveAs,
  onExportHtml,
  onExportPdf,
  onInsertLink,
  onRemoveLink,
  onInsertImage,
  canReload,
  highlightReload,
  activeCodeBlockLanguage,
  onToggleCodeBlock,
  onSetCodeBlockLanguage,
}: ToolbarProps) {
  const isCodeBlockActive = Boolean(activeCodeBlockLanguage);
  const languageLabel = activeCodeBlockLanguage ?? "plaintext";

  return (
    <div className="toolbar" role="toolbar" aria-label="Editor toolbar">
      <div className="toolbar-group" aria-label="File actions">
        <IconButton
          onClick={onNew}
          title="New document (Ctrl/Cmd+N)"
          icon={<FilePlus size={ICON_SIZE} strokeWidth={1.9} />}
        />
        <IconButton
          onClick={onOpen}
          title="Open Markdown file (Ctrl/Cmd+O)"
          icon={<FolderOpen size={ICON_SIZE} strokeWidth={1.9} />}
        />
        <select
          className="toolbar-recent-select"
          value=""
          onChange={(event) => {
            const path = event.target.value;
            if (!path) return;
            onOpenRecent(path);
            event.currentTarget.value = "";
          }}
          title="Recent files"
        >
          <option value="">Recent Files…</option>
          {recentFiles.map((path) => (
            <option key={path} value={path}>
              {basename(path)}
            </option>
          ))}
        </select>
        <IconButton
          onClick={onReload}
          disabled={!canReload}
          className={highlightReload ? "recommended" : ""}
          title={
            canReload
              ? "Reload current file from disk (Ctrl/Cmd+Alt+R)"
              : "Reload is available only for saved files"
          }
          icon={<RefreshCw size={ICON_SIZE} strokeWidth={1.9} />}
        />
        <IconButton
          onClick={onSave}
          title="Save file (Ctrl/Cmd+S)"
          icon={<Save size={ICON_SIZE} strokeWidth={1.9} />}
        />
        <IconButton
          onClick={onSaveAs}
          title="Save as... (Ctrl/Cmd+Shift+S)"
          icon={<SaveAll size={ICON_SIZE} strokeWidth={1.9} />}
        />
        <IconButton
          onClick={onExportHtml}
          title="Export as HTML"
          icon={<FileCode size={ICON_SIZE} strokeWidth={1.9} />}
        />
        <IconButton
          onClick={onExportPdf}
          title="Export as PDF"
          icon={<FileDown size={ICON_SIZE} strokeWidth={1.9} />}
        />
      </div>

      <div className="toolbar-divider" aria-hidden />

      <div className="toolbar-group" aria-label="Formatting">
        <IconButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={Boolean(editor?.isActive("bold"))}
          disabled={!editor}
          title="Bold (Ctrl+B)"
          icon={<Bold size={ICON_SIZE} strokeWidth={1.9} />}
        />

        <IconButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={Boolean(editor?.isActive("italic"))}
          disabled={!editor}
          title="Italic (Ctrl+I)"
          icon={<Italic size={ICON_SIZE} strokeWidth={1.9} />}
        />

        <IconButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          active={Boolean(editor?.isActive("heading"))}
          disabled={!editor}
          title="Heading"
          icon={<Heading size={ICON_SIZE} strokeWidth={1.9} />}
        />

        <IconButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={Boolean(editor?.isActive("bulletList"))}
          disabled={!editor}
          title="List"
          icon={<List size={ICON_SIZE} strokeWidth={1.9} />}
        />

        <IconButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          active={Boolean(editor?.isActive("orderedList"))}
          disabled={!editor}
          title="Ordered list"
          icon={<ListOrdered size={ICON_SIZE} strokeWidth={1.9} />}
        />

        <IconButton
          onClick={onToggleCodeBlock}
          active={Boolean(editor?.isActive("codeBlock"))}
          disabled={!editor}
          title="Code block"
          icon={<Code size={ICON_SIZE} strokeWidth={1.9} />}
        />

        <label className={`code-language-control ${isCodeBlockActive ? "active" : ""}`}>
          <span>Code:</span>
          <select
            value={languageLabel}
            onChange={(event) => onSetCodeBlockLanguage(event.target.value)}
            disabled={!editor || !isCodeBlockActive}
            title={
              isCodeBlockActive
                ? "Set active code block language"
                : "Place caret inside a code block to change language"
            }
          >
            {SUPPORTED_CODE_BLOCK_LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="toolbar-divider" aria-hidden />

      <div className="toolbar-group" aria-label="Insert">
        <IconButton
          onClick={onInsertLink}
          active={Boolean(editor?.isActive("link"))}
          disabled={!editor}
          title="Insert link"
          icon={<Link size={ICON_SIZE} strokeWidth={1.9} />}
        />

        <IconButton
          onClick={onRemoveLink}
          disabled={!editor || !editor.isActive("link")}
          title="Remove link"
          icon={<Unlink size={ICON_SIZE} strokeWidth={1.9} />}
        />

        <IconButton
          onClick={() => editor && insertTaskList(editor)}
          active={Boolean(editor?.isActive("taskList"))}
          disabled={!editor}
          title="Insert task list"
          icon={<CheckSquare size={ICON_SIZE} strokeWidth={1.9} />}
        />

        <IconButton
          onClick={() => editor && insertDefaultTable(editor)}
          active={Boolean(editor?.isActive("table"))}
          disabled={!editor}
          title="Insert table"
          icon={<Table size={ICON_SIZE} strokeWidth={1.9} />}
        />

        <IconButton
          onClick={onInsertImage}
          disabled={!editor}
          title="Insert image from URL"
          icon={<Image size={ICON_SIZE} strokeWidth={1.9} />}
        />
      </div>
    </div>
  );
}
