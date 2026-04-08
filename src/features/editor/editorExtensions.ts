import { Mark, Node, mergeAttributes } from "@tiptap/core";
import { tableEditing } from "@tiptap/pm/tables";
import { CodeBlockWithSyntax } from "./codeBlockSyntax";

export { CodeBlockWithSyntax };

export const LinkMark = Mark.create({
  name: "link",
  inclusive: false,

  addAttributes() {
    return {
      href: { default: null },
      target: { default: "_blank" },
      rel: { default: "noopener noreferrer nofollow" },
    };
  },

  parseHTML() {
    return [{ tag: "a[href]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["a", mergeAttributes(HTMLAttributes), 0];
  },
});

export const ImageNode = Node.create({
  name: "image",
  inline: true,
  group: "inline",
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },
});

export const TaskListNode = Node.create({
  name: "taskList",
  group: "block",
  content: "taskItem+",

  parseHTML() {
    return [{ tag: 'ul[data-type="taskList"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["ul", mergeAttributes(HTMLAttributes, { "data-type": "taskList" }), 0];
  },
});

export const TaskItemNode = Node.create({
  name: "taskItem",
  defining: true,
  content: "paragraph block*",

  addAttributes() {
    return {
      checked: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-checked") === "true",
        renderHTML: (attributes) => ({ "data-checked": String(Boolean(attributes.checked)) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'li[data-type="taskItem"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["li", mergeAttributes(HTMLAttributes, { "data-type": "taskItem" }), 0];
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem(this.name),
      Tab: () => this.editor.commands.sinkListItem(this.name),
      "Shift-Tab": () => this.editor.commands.liftListItem(this.name),
    };
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const li = document.createElement("li");
      li.setAttribute("data-type", "taskItem");

      const label = document.createElement("label");
      label.contentEditable = "false";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(node.attrs.checked);

      checkbox.addEventListener("change", () => {
        if (!editor.isEditable) return;
        const pos = getPos();
        if (typeof pos !== "number") return;

        editor
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              checked: checkbox.checked,
            });
            return true;
          })
          .run();
      });

      const contentDOM = document.createElement("div");
      li.append(label, contentDOM);
      label.append(checkbox);

      return {
        dom: li,
        contentDOM,
        update: (updatedNode) => {
          if (updatedNode.type !== node.type) return false;
          checkbox.checked = Boolean(updatedNode.attrs.checked);
          return true;
        },
      };
    };
  },
});

export const TableNode = Node.create({
  name: "table",
  content: "tableRow+",
  tableRole: "table",
  isolating: true,
  group: "block",

  parseHTML() {
    return [{ tag: "table" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["table", mergeAttributes(HTMLAttributes), ["tbody", 0]];
  },

  addProseMirrorPlugins() {
    return [tableEditing()];
  },
});

export const TableRowNode = Node.create({
  name: "tableRow",
  content: "tableHeader* tableCell*",
  tableRole: "row",

  parseHTML() {
    return [{ tag: "tr" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["tr", mergeAttributes(HTMLAttributes), 0];
  },
});

export const TableHeaderNode = Node.create({
  name: "tableHeader",
  content: "block+",
  tableRole: "header_cell",
  isolating: true,

  parseHTML() {
    return [{ tag: "th" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["th", mergeAttributes(HTMLAttributes), 0];
  },
});

export const TableCellNode = Node.create({
  name: "tableCell",
  content: "block+",
  tableRole: "cell",
  isolating: true,

  parseHTML() {
    return [{ tag: "td" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["td", mergeAttributes(HTMLAttributes), 0];
  },
});
