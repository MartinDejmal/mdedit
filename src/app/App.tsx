import { useState } from "react";
import FolderSidebar from "../components/FolderSidebar";
import Layout from "../components/Layout";
import Toolbar from "../components/Toolbar";
import EditorArea from "../features/editor/Editor";
import StatusBar from "../components/StatusBar";

import { useDocumentStore } from "../stores/documentStore";
import { useEditorController } from "../features/editor/useEditorController";
import { AppUxProvider } from "../features/ux/useAppUx";

function AppContent() {
  const [isBrowserVisible, setIsBrowserVisible] = useState(false);
  const { isDirty, currentFilePath, activeDocument } = useDocumentStore();
  const {
    editor,
    recentFiles,
    hasActiveDocument,
    isDragOver,
    handleNew,
    handleOpen,
    handleOpenRecent,
    handleOpenBrowserFile,
    handleReload,
    handleSave,
    handleSaveAs,
    handleExportHtml,
    handleExportPdf,
    handleInsertLink,
    handleRemoveLink,
    handleInsertImage,
    activeCodeBlockLanguage,
    handleToggleCodeBlock,
    handleSetCodeBlockLanguage,
    isOutlineVisible,
    handleToggleOutline,
    outlineSidebarWidth,
    handleOutlineWidthChange,
  } = useEditorController();

  return (
    <Layout isDragOver={isDragOver}>
      <Toolbar
        editor={editor}
        onNew={() => void handleNew()}
        onOpen={() => void handleOpen()}
        onOpenRecent={(path) => void handleOpenRecent(path)}
        recentFiles={recentFiles}
        onReload={() => void handleReload()}
        onSave={() => void handleSave()}
        onSaveAs={() => void handleSaveAs()}
        onExportHtml={() => void handleExportHtml()}
        onExportPdf={() => void handleExportPdf()}
        onInsertLink={() => void handleInsertLink()}
        onRemoveLink={handleRemoveLink}
        onInsertImage={() => void handleInsertImage()}
        canReload={Boolean(currentFilePath)}
        highlightReload={activeDocument.hasExternalChangeWarning}
        activeCodeBlockLanguage={activeCodeBlockLanguage}
        onToggleCodeBlock={handleToggleCodeBlock}
        onSetCodeBlockLanguage={handleSetCodeBlockLanguage}
        isBrowserVisible={isBrowserVisible}
        onToggleBrowser={() => setIsBrowserVisible((visible) => !visible)}
        isOutlineVisible={isOutlineVisible}
        onToggleOutline={handleToggleOutline}
      />
      <div className="workspace-main">
        <FolderSidebar
          visible={isBrowserVisible}
          currentFilePath={currentFilePath}
          onOpenFile={handleOpenBrowserFile}
        />
        <EditorArea
          editor={editor}
          showEmptyState={!hasActiveDocument}
          recentFiles={recentFiles}
          onNew={() => void handleNew()}
          onOpen={() => void handleOpen()}
          onOpenRecent={(path) => void handleOpenRecent(path)}
          isOutlineVisible={isOutlineVisible}
          outlineSidebarWidth={outlineSidebarWidth}
          onOutlineWidthChange={handleOutlineWidthChange}
        />
      </div>
      <StatusBar
        isDirty={isDirty}
        filePath={currentFilePath}
        hasActiveDocument={hasActiveDocument}
        hasExternalChangeWarning={activeDocument.hasExternalChangeWarning}
      />
    </Layout>
  );
}

export default function App() {
  return (
    <AppUxProvider>
      <AppContent />
    </AppUxProvider>
  );
}
