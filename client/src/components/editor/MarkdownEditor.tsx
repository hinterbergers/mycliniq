import MDEditor, { commands } from "@uiw/react-md-editor";
import MarkdownPreview from "@uiw/react-markdown-preview";

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  height?: number;
  placeholder?: string;
  className?: string;
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
  commands.quote,
  commands.code,
  commands.codeBlock,
  commands.divider,
  commands.link,
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
