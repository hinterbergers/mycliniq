import MDEditor, { commands } from "@uiw/react-md-editor";
import MarkdownPreview from "@uiw/react-markdown-preview";
import { IndentIncrease, IndentDecrease } from "lucide-react";

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  height?: number;
  placeholder?: string;
  className?: string;
};

function transformSelectedLines(
  state: any,
  api: any,
  transformer: (line: string) => string,
) {
  const selected = state.selectedText || "";
  const hasSelection = selected.length > 0;
  const source = hasSelection ? selected : state.text;
  const nextValue = source
    .split("\n")
    .map((line: string) => transformer(line))
    .join("\n");

  if (hasSelection) {
    api.replaceSelection(nextValue);
    return;
  }

  api.setValue(nextValue);
}

const indentListCommand = {
  name: "indent-list",
  keyCommand: "indent-list",
  buttonProps: { "aria-label": "Liste einruecken" },
  icon: <IndentIncrease size={16} />,
  execute: (state: any, api: any) => {
    transformSelectedLines(state, api, (line) => {
      if (!line.trim()) return line;
      return `  ${line}`;
    });
  },
};

const outdentListCommand = {
  name: "outdent-list",
  keyCommand: "outdent-list",
  buttonProps: { "aria-label": "Liste ausruecken" },
  icon: <IndentDecrease size={16} />,
  execute: (state: any, api: any) => {
    transformSelectedLines(state, api, (line) => {
      if (line.startsWith("  ")) return line.slice(2);
      if (line.startsWith("\t")) return line.slice(1);
      return line;
    });
  },
};

const EDITOR_COMMANDS = [
  {
    name: "underline",
    keyCommand: "underline",
    buttonProps: { "aria-label": "Unterstreichen" },
    icon: <span style={{ fontWeight: 700, textDecoration: "underline" }}>U</span>,
    execute: (state: any, api: any) => {
      const selected = state.selectedText || "Text";
      api.replaceSelection(`<u>${selected}</u>`);
    },
  },
  commands.divider,
  commands.bold,
  commands.italic,
  commands.strikethrough,
  commands.divider,
  commands.title1,
  commands.title2,
  commands.title3,
  commands.divider,
  commands.unorderedListCommand,
  commands.orderedListCommand,
  indentListCommand,
  outdentListCommand,
  commands.quote,
  commands.code,
  commands.codeBlock,
  commands.divider,
  commands.link,
  commands.image,
  commands.table,
  commands.hr,
];

export function MarkdownEditor({
  value,
  onChange,
  height = 420,
  placeholder,
  className,
}: MarkdownEditorProps) {
  return (
    <div data-color-mode="light" className={className}>
      <MDEditor
        value={value}
        onChange={(next) => onChange(next ?? "")}
        preview="edit"
        height={height}
        commands={EDITOR_COMMANDS}
        textareaProps={{ placeholder }}
      />
    </div>
  );
}

type MarkdownViewerProps = {
  value?: string | null;
  className?: string;
};

export function MarkdownViewer({ value, className }: MarkdownViewerProps) {
  return (
    <div data-color-mode="light" className={className}>
      <MarkdownPreview source={value ?? ""} />
    </div>
  );
}
