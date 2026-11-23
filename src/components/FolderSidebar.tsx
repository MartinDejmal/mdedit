import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, RefreshCw } from "lucide-react";
import * as bridge from "../services/tauriBridge";
import { basename } from "../lib/utils";
import type { DirectoryEntry } from "../types";

interface FolderSidebarProps {
  visible: boolean;
  selectedFolder: string | null;
  onSelectFolder: (path: string) => void;
  folderRefresh: { path: string; version: number } | null;
  currentFilePath: string | null;
  onOpenFile: (path: string) => Promise<void>;
}

interface FolderState {
  entries?: DirectoryEntry[];
  loading?: boolean;
  error?: string;
}

export default function FolderSidebar({ visible, selectedFolder, onSelectFolder, folderRefresh, currentFilePath, onOpenFile }: FolderSidebarProps) {
  const [root, setRoot] = useState<string | null>(null);
  const [folders, setFolders] = useState<Record<string, FolderState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [switching, setSwitching] = useState(false);
  const busy = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);

  const loadFolder = async (path: string, version = generation.current) => {
    setFolders((state) => ({ ...state, [path]: { ...state[path], loading: true, error: undefined } }));
    try {
      const entries = await bridge.listMarkdownDirectory(path);
      if (version !== generation.current) return;
      setFolders((state) => ({ ...state, [path]: { entries } }));
    } catch (cause) {
      if (version !== generation.current) return;
      setFolders((state) => ({ ...state, [path]: { error: String(cause) } }));
    }
  };

  useEffect(() => {
    if (!folderRefresh || !root) return;
    const normalize = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");
    const folder = folderRefresh.path;
    if (normalize(folder) !== normalize(root) && !normalize(folder).startsWith(normalize(root) + "/")) return;
    setExpanded((state) => new Set([...state, folder]));
    void loadFolder(folder);
  }, [folderRefresh]);

  const chooseFolder = async () => {
    if (busy.current) return;
    busy.current = true;
    setChoosing(true);
    setError(null);
    try {
      const path = await bridge.openFolderDialog();
      if (!path) return;
      const version = ++generation.current;
      setRoot(path);
      onSelectFolder(path);
      setFolders({});
      setExpanded(new Set());
      await loadFolder(path, version);
    } catch (cause) {
      setError(String(cause));
    } finally {
      busy.current = false;
      setChoosing(false);
    }
  };

  const openFile = async (path: string) => {
    if (busy.current || path === currentFilePath) return;
    busy.current = true;
    setSwitching(true);
    try {
      await onOpenFile(path);
    } finally {
      busy.current = false;
      setSwitching(false);
    }
  };

  const toggleFolder = (path: string) => {
    onSelectFolder(path);
    const opening = !expanded.has(path);
    setExpanded((state) => {
      const next = new Set(state);
      if (opening) next.add(path); else next.delete(path);
      return next;
    });
    if (opening && !folders[path]?.entries && !folders[path]?.loading) void loadFolder(path);
  };

  const renderFolder = (path: string, depth: number) => {
    const state = folders[path];
    return (
      <ul className="folder-tree-list">
        {state?.loading ? <li className="folder-message" role="status">Loading…</li> : null}
        {state?.error ? <li className="folder-message" role="alert">
          {state.error} <button onClick={() => void loadFolder(path)}>Retry</button>
        </li> : null}
        {state?.entries?.length === 0 ? <li className="folder-message">No Markdown files or folders</li> : null}
        {state?.entries?.map((entry) => (
          <li key={entry.path}>
            <button
              type="button"
              className={`folder-tree-item ${entry.path === currentFilePath || (entry.isDirectory && entry.path === selectedFolder) ? "active" : ""}`}
              style={{ paddingLeft: 8 + depth * 16 }}
              title={entry.path}
              aria-expanded={entry.isDirectory ? expanded.has(entry.path) : undefined}
              aria-pressed={entry.isDirectory ? selectedFolder === entry.path : undefined}
              aria-current={!entry.isDirectory && entry.path === currentFilePath ? "page" : undefined}
              disabled={!entry.isDirectory && switching}
              onClick={() => {
                if (entry.isDirectory) toggleFolder(entry.path);
                else { onSelectFolder(path); void openFile(entry.path); }
              }}
            >
              {entry.isDirectory ? <>
                {expanded.has(entry.path) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Folder size={16} />
              </> : <FileText size={16} className="folder-file-icon" />}
              <span>{entry.name}</span>
            </button>
            {entry.isDirectory && expanded.has(entry.path) ? renderFolder(entry.path, depth + 1) : null}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <aside className="folder-sidebar" aria-label="File browser" hidden={!visible}>
      <div className="folder-sidebar-header">
        <h2>Files</h2>
        <button type="button" onClick={() => void chooseFolder()} disabled={choosing || switching} title="Open folder" aria-label="Open folder">
          <FolderOpen size={17} />
        </button>
        <button type="button" disabled={!root || choosing || switching} title="Refresh folder" aria-label="Refresh folder" onClick={() => {
          if (!root) return;
          const version = ++generation.current;
          setExpanded(new Set());
          setFolders({});
          void loadFolder(root, version);
        }}><RefreshCw size={16} /></button>
      </div>
      {error ? <p className="folder-message" role="alert">{error}</p> : null}
      {root ? <>
        <button type="button" className={`folder-root ${selectedFolder === root ? "selected" : ""}`} title={root} aria-pressed={selectedFolder === root} onClick={() => onSelectFolder(root)}><FolderOpen size={16} /><strong>{basename(root) || root}</strong></button>
        <nav aria-label="Markdown files" aria-busy={switching}>{renderFolder(root, 0)}</nav>
      </> : <div className="folder-message">
        <p>Choose a folder to browse its Markdown files.</p>
        <button type="button" onClick={() => void chooseFolder()} disabled={choosing}>Choose folder</button>
      </div>}
    </aside>
  );
}
