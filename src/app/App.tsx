import Layout from "../components/Layout";
import Toolbar from "../components/Toolbar";
import EditorArea from "../features/editor/Editor";
import StatusBar from "../components/StatusBar";

import { useDocumentStore } from "../stores/documentStore";
import { useEditorController } from "../features/editor/useEditorController";

export default function App() {
  const { isDirty, currentFilePath, activeDocument } = useDocumentStore();
  const { editor, handleOpen, handleReload, handleSave, handleSaveAs } =
    useEditorController();

  return (
    <Layout>
      <Toolbar
        editor={editor}
        onOpen={() => void handleOpen()}
        onReload={() => void handleReload()}
        onSave={() => void handleSave()}
        onSaveAs={() => void handleSaveAs()}
        canReload={Boolean(currentFilePath)}
        highlightReload={activeDocument.hasExternalChangeWarning}
      />
      <EditorArea editor={editor} />
      <StatusBar
        isDirty={isDirty}
        filePath={currentFilePath}
        hasExternalChangeWarning={activeDocument.hasExternalChangeWarning}
      />
    </Layout>
  );
}
