import type { BrowserFileOperations } from "../features/documents/useBrowserFileOperations";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, RefreshCw, ArrowUp, FolderPlus } from "lucide-react";
import * as bridge from "../services/tauriBridge";
import { basename, parentDirectory } from "../lib/utils";
import type { DirectoryEntry } from "../types";

interface FolderSidebarProps {
  visible: boolean;
  location: { path: string; version: number } | null;
  operations: BrowserFileOperations;
  selectedFolder: string | null;
  onSelectFolder: (path: string) => void;
  folderRefresh: { path: string; version: number } | null;
  currentFilePath: string | null;
  onOpenFile: (path: string) => Promise<string | null>;
}

interface FolderState {
  entries?: DirectoryEntry[];
  loading?: boolean;
  error?: string;
}

export default function FolderSidebar({ visible, location, operations, selectedFolder, onSelectFolder, folderRefresh, currentFilePath, onOpenFile }: FolderSidebarProps) {
  const [root, setRoot] = useState<string | null>(null);
  const [folders, setFolders] = useState<Record<string, FolderState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ path: string; directory: boolean; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ name: string; x: number; y: number; target: string | null } | null>(null);
  const dragRef = useRef<{ path: string; name: string; x: number; y: number; moving: boolean; target: string | null } | null>(null);
  const suppressClick = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
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

  const navigate = async (path: string) => {
    const version = ++generation.current;
    setRoot(path);
    onSelectFolder(path);
    setSelectedRow(currentFilePath);
    setFolders({});
    setExpanded(new Set());
    setMenu(null);
    setError(null);
    await loadFolder(path, version);
  };

  useEffect(() => { if (location) void navigate(location.path); }, [location]);

  const reload = async () => {
    if (!root) return;
    const version = ++generation.current;
    setFolders({});
    await Promise.all([...new Set([root, ...expanded])].map(path => loadFolder(path, version)));
  };

  const operate = async (action: () => Promise<string | undefined>, kind: "file" | "folder" | "delete") => {
    if (busy.current) return;
    busy.current = true;
    setSwitching(true);
    setMenu(null);
    try {
      const path = await action();
      if (!path) return;
      setSelectedRow(kind === "delete" ? null : path);
      if (kind !== "delete") onSelectFolder(kind === "folder" ? path : parentDirectory(path));
      await reload();
      if (kind === "file") {
        const folder = parentDirectory(path);
        setExpanded(state => new Set([...state, folder]));
        if (folder !== root && !expanded.has(folder)) await loadFolder(folder);
      }
      if (kind === "folder") {
        setExpanded(state => new Set([...state, path]));
        await loadFolder(path);
      }
    } finally { busy.current = false; setSwitching(false); }
  };
  const rename = (path: string) => operate(() => operations.renameFile(path), "file");
  const move = (path: string, folder?: string) => operate(() => operations.moveFile(path, folder), "file");
  const remove = (path: string) => operate(() => operations.deleteFile(path), "delete");
  const newFolder = (parent: string) => operate(() => operations.createFolder(parent), "folder");

  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null); };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); setMenu(null);
        Array.from(document.querySelectorAll<HTMLButtonElement>(".folder-tree-item, .folder-root")).find(node => node.title === menu.path)?.focus();
      }
      if (event.key === "Tab") setMenu(null);
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(current + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [menu]);

  useEffect(() => {
    const pointerMove = (event: PointerEvent) => {
      const item = dragRef.current;
      if (!item) return;
      if (!item.moving && Math.hypot(event.clientX - item.x, event.clientY - item.y) < 6) return;
      item.moving = true;
      event.preventDefault();
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-folder-path]")?.dataset.folderPath ?? null;
      item.target = target && target !== parentDirectory(item.path) ? target : null;
      setDrag({ name: item.name, x: event.clientX, y: event.clientY, target: item.target });
    };
    const finish = (event: PointerEvent) => {
      const item = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!item?.moving) return;
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 0);
      if (event.type !== "pointercancel" && item.target) void move(item.path, item.target);
    };
    const cancel = () => { dragRef.current = null; setDrag(null); };
    window.addEventListener("blur", cancel);
    document.addEventListener("pointermove", pointerMove, { passive: false });
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
    return () => { window.removeEventListener("blur", cancel); document.removeEventListener("pointermove", pointerMove); document.removeEventListener("pointerup", finish); document.removeEventListener("pointercancel", finish); };
  }, [operations, root, expanded]);

  useEffect(() => {
    if (!folderRefresh || !root) return;
    const normalize = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");
    const folder = folderRefresh.path;
    setSelectedRow(currentFilePath);
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
      await navigate(path);
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
      const opened = await onOpenFile(path);
      setSelectedRow(opened);
    } finally {
      busy.current = false;
      setSwitching(false);
    }
  };

  const toggleFolder = (path: string) => {
    onSelectFolder(path);
    setSelectedRow(path);
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
              className={`folder-tree-item ${drag?.target === entry.path ? "drop-target" : ""} ${entry.path === selectedRow || (entry.isDirectory && entry.path === selectedFolder) ? "active" : ""}`}
              style={{ paddingLeft: 8 + depth * 16 }}
              title={entry.path}
              data-folder-path={entry.isDirectory ? entry.path : undefined}
              onPointerDown={event => {
                if (entry.isDirectory || event.button !== 0 || busy.current) return;
                dragRef.current = { path: entry.path, name: entry.name, x: event.clientX, y: event.clientY, moving: false, target: null };
              }}
              onContextMenu={event => {
                event.preventDefault(); event.stopPropagation();
                setSelectedRow(entry.path);
                onSelectFolder(entry.isDirectory ? entry.path : path);
                setMenu({ path: entry.path, directory: entry.isDirectory, x: Math.min(event.clientX, innerWidth - 210), y: Math.min(event.clientY, innerHeight - 210) });
              }}
              onKeyDown={event => {
                if (entry.isDirectory) return;
                if (event.key === "F2") { event.preventDefault(); void rename(entry.path); }
                if (event.key === "Delete") { event.preventDefault(); void remove(entry.path); }
              }}
              aria-expanded={entry.isDirectory ? expanded.has(entry.path) : undefined}
              aria-pressed={entry.isDirectory ? selectedFolder === entry.path : undefined}
              aria-current={!entry.isDirectory && entry.path === currentFilePath ? "page" : undefined}
              disabled={!entry.isDirectory && switching}
              onClick={() => {
                if (suppressClick.current || busy.current) return;
                if (entry.isDirectory) toggleFolder(entry.path);
                else {
                  onSelectFolder(path);
                  if (selectedRow === entry.path) void rename(entry.path);
                  else { setSelectedRow(entry.path); void openFile(entry.path); }
                }
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
        <button type="button" disabled={!root || parentDirectory(root) === root || choosing || switching} title="Parent folder" aria-label="Parent folder" onClick={() => { if (root) void navigate(parentDirectory(root)); }}><ArrowUp size={16} /></button>
        <button type="button" disabled={!root || choosing || switching} title="New folder" aria-label="New folder" onClick={() => { if (selectedFolder ?? root) void newFolder((selectedFolder ?? root)!); }}><FolderPlus size={16} /></button>
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
        <button type="button" className={`folder-root ${selectedFolder === root ? "selected" : ""} ${drag?.target === root ? "drop-target" : ""}`} data-folder-path={root} onContextMenu={event => { event.preventDefault(); setMenu({ path: root, directory: true, x: Math.min(event.clientX, innerWidth - 210), y: Math.min(event.clientY, innerHeight - 210) }); }} title={root} aria-pressed={selectedFolder === root} onClick={() => { onSelectFolder(root); setSelectedRow(root); }}><FolderOpen size={16} /><strong>{basename(root) || root}</strong></button>
        <nav aria-label="Markdown files" aria-busy={switching}>{renderFolder(root, 0)}</nav>
      </> : <div className="folder-message">
        <p>Choose a folder to browse its Markdown files.</p>
        <button type="button" onClick={() => void chooseFolder()} disabled={choosing}>Choose folder</button>
      </div>}
      {menu ? <div ref={menuRef} className="browser-context-menu" role="menu" aria-label="File actions" style={{ left: Math.max(0, menu.x), top: Math.max(0, menu.y) }}>
        {menu.directory ? <>
          <button role="menuitem" onClick={() => { const path = menu.path; setMenu(null); void navigate(path); }}>Open folder</button>
          <button role="menuitem" onClick={() => void newFolder(menu.path)}>New folder…</button>
        </> : <>
          <button role="menuitem" onClick={() => { const path = menu.path; setMenu(null); void openFile(path); }}>Open</button>
          <button role="menuitem" onClick={() => void rename(menu.path)}>Rename…</button>
          <button role="menuitem" onClick={() => void move(menu.path)}>Move to folder…</button>
          <button role="menuitem" onClick={() => void remove(menu.path)}>Delete…</button>
        </>}
      </div> : null}
      {drag ? <div className="browser-drag-label" style={{ left: drag.x + 12, top: drag.y + 12 }}>{drag.name}</div> : null}
    </aside>
  );
}
