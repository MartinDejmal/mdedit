import FindBar, { openFind } from "../components/FindBar";
import { useAppTheme } from "../features/editor/useAppTheme";
import { useEditorZoom } from "../features/editor/useEditorZoom";
import { isTauri } from "@tauri-apps/api/core";
import SettingsDialog from "../components/SettingsDialog";
import { editorFontStyle } from "../lib/editorFontStyle";
import HelpDialog from "../components/HelpDialog";
import FolderSidebar from "../components/FolderSidebar";
import Layout from "../components/Layout";
import Toolbar from "../components/Toolbar";
import EditorArea from "../features/editor/Editor";
import StatusBar from "../components/StatusBar";

import { useDocumentStore } from "../stores/documentStore";
import { useEditorController } from "../features/editor/useEditorController";
import { AppUxProvider } from "../features/ux/useAppUx";

function AppContent() {
  const { zoom, selectZoom, viewportRef } = useEditorZoom();
  const { isDirty, currentFilePath, activeDocument, currentCanonicalMarkdown } = useDocumentStore();
  const {
    activeDialog,
    showSettings,
    closeDialog,
    appearanceSettings,
    applySettings,
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
    browserLocation,
    browserOperations,
    selectedBrowserFolder,
    handleSelectBrowserFolder,
    folderRefresh,
    isBrowserVisible,
    handleToggleBrowser,
    isOutlineVisible,
    handleToggleOutline,
    outlineSidebarWidth,
    handleOutlineWidthChange,
  } = useEditorController();

  const resolvedTheme = useAppTheme(appearanceSettings.theme);

  return (
    <Layout isDragOver={isDragOver}>
      <Toolbar
        onFind={() => openFind()}
        editor={editor}
        zoom={zoom}
        onZoomChange={selectZoom}
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
        onToggleBrowser={handleToggleBrowser}
        isOutlineVisible={isOutlineVisible}
        onToggleOutline={handleToggleOutline}
        onShowSettings={isTauri() ? undefined : showSettings}
      />
      <FindBar editor={editor} enabled={hasActiveDocument} filePath={currentFilePath} />
      <div className="workspace-main" style={editorFontStyle(appearanceSettings)}>
        <FolderSidebar
          visible={isBrowserVisible}
          location={browserLocation}
          operations={browserOperations}
          selectedFolder={selectedBrowserFolder}
          onSelectFolder={handleSelectBrowserFolder}
          folderRefresh={folderRefresh}
          currentFilePath={currentFilePath}
          onOpenFile={handleOpenBrowserFile}
        />
        <EditorArea
          editor={editor}
          zoom={zoom}
          viewportRef={viewportRef}
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
      {activeDialog === "settings" && (
        <SettingsDialog settings={appearanceSettings} onApply={applySettings} onClose={closeDialog} />
      )}
      <HelpDialog theme={resolvedTheme} view={activeDialog === "settings" ? null : activeDialog} onClose={closeDialog} />
      <StatusBar
        editor={editor}
        markdown={currentCanonicalMarkdown}
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
