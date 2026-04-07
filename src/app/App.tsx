import Layout from "../components/Layout";
import Toolbar from "../components/Toolbar";
import EditorArea from "../features/editor/Editor";
import StatusBar from "../components/StatusBar";

import { useDocumentStore } from "../stores/documentStore";
import { useEditorController } from "../features/editor/useEditorController";
import { AppUxProvider } from "../features/ux/useAppUx";

function AppContent() {
  const { isDirty, currentFilePath, activeDocument } = useDocumentStore();
  const {
    editor,
    recentFiles,
    hasActiveDocument,
    handleNew,
    handleOpen,
    handleOpenRecent,
    handleReload,
    handleSave,
    handleSaveAs,
    handleInsertLink,
    handleRemoveLink,
    handleInsertImage,
    activeCodeBlockLanguage,
    handleToggleCodeBlock,
    handleSetCodeBlockLanguage,
  } = useEditorController();

  return (
    <Layout>
      <Toolbar
        editor={editor}
        onNew={() => void handleNew()}
        onOpen={() => void handleOpen()}
        onOpenRecent={(path) => void handleOpenRecent(path)}
        recentFiles={recentFiles}
        onReload={() => void handleReload()}
        onSave={() => void handleSave()}
        onSaveAs={() => void handleSaveAs()}
        onInsertLink={() => void handleInsertLink()}
        onRemoveLink={handleRemoveLink}
        onInsertImage={() => void handleInsertImage()}
        canReload={Boolean(currentFilePath)}
        highlightReload={activeDocument.hasExternalChangeWarning}
        activeCodeBlockLanguage={activeCodeBlockLanguage}
        onToggleCodeBlock={handleToggleCodeBlock}
        onSetCodeBlockLanguage={handleSetCodeBlockLanguage}
      />
      <EditorArea
        editor={editor}
        showEmptyState={!hasActiveDocument}
        recentFiles={recentFiles}
        onNew={() => void handleNew()}
        onOpen={() => void handleOpen()}
        onOpenRecent={(path) => void handleOpenRecent(path)}
      />
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
