export const SOP_SECTION_DEFINITIONS = [
  { key: "purpose", title: "Ziel und Zweck der Regelung" },
  { key: "scope", title: "Geltungsbereich" },
  { key: "content", title: "Inhaltliche / Sachliche Festlegungen" },
  { key: "publication", title: "Publikation und Inkrafttreten" },
  { key: "review", title: "Regelungsprüfung und Entwicklung" },
  { key: "history", title: "Historie" }
] as const;

export type SopSectionKey = typeof SOP_SECTION_DEFINITIONS[number]["key"];
export type SopSections = Record<SopSectionKey, string>;

export const EMPTY_SOP_SECTIONS: SopSections = {
  purpose: "",
  scope: "",
  content: "",
  publication: "",
  review: "",
  history: ""
};

export const DEFAULT_SOP_SECTIONS: SopSections = {
  purpose: "_Bitte Zweck und Ziel der SOP kurz beschreiben._",
  scope: "_Für welche Bereiche/Personen gilt die SOP?_",
  content: "_Haupttext der SOP._",
  publication: "_Wie/wo wird die SOP publiziert und ab wann gilt sie?_",
  review: "_Wie oft wird überprüft, wer verantwortet die Pflege?_",
  history: "_Optional: kurze Hinweise zur Historie._"
};

const normalizeHeading = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

const SOP_SECTION_LOOKUP = new Map(
  SOP_SECTION_DEFINITIONS.map((section) => [normalizeHeading(section.title), section.key])
);

const findSectionKey = (heading: string) => {
  const normalized = normalizeHeading(heading);
  return SOP_SECTION_LOOKUP.get(normalized) ?? null;
};

export const parseSopSections = (markdown?: string | null): SopSections => {
  const sections = { ...EMPTY_SOP_SECTIONS };
  if (!markdown) return sections;

  const lines = markdown.split(/\r?\n/);
  let currentKey: SopSectionKey | null = null;
  let buffer: string[] = [];
  let sawHeading = false;

  const flush = () => {
    if (currentKey) {
      sections[currentKey] = buffer.join("\n").trim();
    }
    buffer = [];
  };

  for (const line of lines) {
    const match = line.match(/^##\s*\d+\.\s*(.+)$/);
    if (match) {
      sawHeading = true;
      flush();
      currentKey = findSectionKey(match[1]);
      continue;
    }
    if (currentKey) {
      buffer.push(line);
    }
  }

  flush();

  if (!sawHeading) {
    sections.content = markdown.trim();
  }

  return sections;
};

export const buildSopMarkdown = (sections: Partial<SopSections>) => {
  const blocks = SOP_SECTION_DEFINITIONS.map((section, index) => {
    const body = (sections[section.key] ?? "").trim();
    return `## ${index + 1}. ${section.title}\n\n${body}\n`;
  });
  return `${blocks.join("\n").trim()}\n`;
};

export const SOP_TEMPLATE_MARKDOWN = buildSopMarkdown(DEFAULT_SOP_SECTIONS);
