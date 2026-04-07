import Layout from "../components/Layout";
import Toolbar from "../components/Toolbar";
import EditorArea from "../features/editor/Editor";
import StatusBar from "../components/StatusBar";

import { useDocumentStore } from "../stores/documentStore";
import { useEditorController } from "../features/editor/useEditorController";

export default function App() {
  const { isDirty, currentFilePath } = useDocumentStore();
  const { editor, handleOpen, handleSave, handleSaveAs } = useEditorController();

  return (
    <Layout>
      <Toolbar
        editor={editor}
        onOpen={() => void handleOpen()}
        onSave={() => void handleSave()}
        onSaveAs={() => void handleSaveAs()}
      />
      <EditorArea editor={editor} />
      <StatusBar isDirty={isDirty} filePath={currentFilePath} />
    </Layout>
  );
}
