import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { CodeBlockWithSyntax } from "../../src/features/editor/codeBlockSyntax";
import { loadMermaid } from "../../src/services/mermaidRenderer";

export async function createMermaidEditor() {
  const mermaid = await loadMermaid();
  const originalRender = mermaid.render.bind(mermaid);
  const stats = { renders: 0 };
  mermaid.render = (...args) => {
    stats.renders++;
    return originalRender(...args);
  };
  const editor = new Editor({
    element: document.body.appendChild(document.createElement("div")),
    extensions: [StarterKit.configure({ codeBlock: false }), CodeBlockWithSyntax],
    content: { type: "doc", content: [{ type: "codeBlock", attrs: { language: "mermaid" }, content: [{ type: "text", text: "flowchart LR\n A[Start] --> B[Finish]" }] }] },
  });
  return { editor, stats, wrapper: editor.view.dom.querySelector(".mermaid-code-block") };
}
