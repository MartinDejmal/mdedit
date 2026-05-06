import Layout from "../components/Layout";
import Toolbar from "../components/Toolbar";
import EditorArea from "../features/editor/Editor";
import StatusBar from "../components/StatusBar";
import AboutDialog from "../features/ux/AboutDialog";

import { useDocumentStore } from "../stores/documentStore";
import { useEditorController } from "../features/editor/useEditorController";
import { AppUxProvider } from "../features/ux/useAppUx";

function AppContent() {
  const { isDirty, currentFilePath, activeDocument } = useDocumentStore();
  const {
    editor,
    recentFiles,
    hasActiveDocument,
    isDragOver,
    handleNew,
    handleOpen,
    handleOpenRecent,
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
    isAboutVisible,
    handleCloseAbout,
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
        isOutlineVisible={isOutlineVisible}
        onToggleOutline={handleToggleOutline}
      />
      <EditorArea
        editor={editor}
        showEmptyState={!hasActiveDocument}
        recentFiles={recentFiles}
        onNew={() => void handleNew()}
        onOpen={() => void handleOpen()}
        onOpenRecent={(path) => void handleOpenRecent(path)}
        isOutlineVisible={isOutlineVisible}
      />
      <StatusBar
        isDirty={isDirty}
        filePath={currentFilePath}
        hasActiveDocument={hasActiveDocument}
        hasExternalChangeWarning={activeDocument.hasExternalChangeWarning}
      />
      {isAboutVisible && <AboutDialog onClose={handleCloseAbout} />}
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
