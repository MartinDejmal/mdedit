/** Share one bundled renderer between editor previews and PDF export (also offline). */
type MermaidApi = (typeof import("mermaid"))["default"];
let rendererPromise: Promise<MermaidApi> | undefined;

export function loadMermaid(): Promise<MermaidApi> {
  return rendererPromise ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "default",
      htmlLabels: false,
      // Real SVG text survives vector PDF export; HTML foreignObject does not.
      flowchart: { htmlLabels: false },
    });
    return mermaid;
  }).catch((error) => {
    rendererPromise = undefined;
    throw error;
  });
}
