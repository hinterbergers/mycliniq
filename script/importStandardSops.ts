import "dotenv/config";

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { and, eq } from "../server/lib/db";
import { db } from "../server/db";
import { employees, sopVersions, sops } from "../shared/schema";

type EmployeeRow = {
  id: number;
  firstName: string | null;
  lastName: string | null;
};

type ParsedSop = {
  filePath: string;
  fileName: string;
  title: string;
  version: string;
  versionNumber: number;
  createdAt: Date;
  createdById: number;
  approvedById: number;
  contentMarkdown: string;
  releasedAt: Date;
  releasedById: number;
  changeNote: string;
};

type SkipResult = {
  fileName: string;
  reason: string;
};

const SOURCE_DIR =
  process.argv.find((arg) => arg.startsWith("--source-dir="))?.split("=")[1] ??
  "/Volumes/Projekte/TEMP/SOP II";

const PREVIEW_DIR =
  process.argv.find((arg) => arg.startsWith("--preview-dir="))?.split("=")[1] ?? "";

const FIXTURE_OUT =
  process.argv.find((arg) => arg.startsWith("--fixture-out="))?.split("=")[1] ?? "";

const ONLY_FILTER =
  process.argv.find((arg) => arg.startsWith("--only="))?.split("=")[1] ?? "";

const INCLUDE_EXISTING = process.argv.includes("--include-existing");
const DRY_RUN = process.argv.includes("--dry-run");

const PDFTOTEXT =
  "/Users/stefan/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/bin/pdftotext";

const APPROVED_BY_ID = 4;

const SECTION_PATTERNS = [
  /ziel und zweck der regelung/i,
  /geltungsbereich/i,
  /historie/i,
];

const CONTENT_SECTION_PATTERN =
  /(inhaltliche\s*\/?\s*sachliche\s+festlegungen|inhaltliche\s+festlegung)/i;

const EXTRA_HEADER_PATTERNS = [
  /^kabeg$/i,
  /^klinikum klagenfurt$/i,
  /^am w[öo]rthersee$/i,
  /^abteilung f[üu]r frauenheilkunde und geburtshilfe$/i,
  /^abteilungsleitung medizin$/i,
];

const TOP_LEVEL_SECTION_LABEL_PATTERN =
  /^(ziel und zweck der regelung|geltungsbereich|begriffsbestimmung(?:en)?|inhaltliche\s*\/?\s*sachliche\s+festlegungen|inhaltliche\s+festlegung|quellenangabe|fachliche?\s+ansprechperson|weisungsgeber|publikation und inkrafttreten|regelungspr[üu]fung und entwicklung|[üu]berpr[üu]fungsintervall und zust[äa]ndigkeit|historie)$/i;

const SUBSECTION_HEADING_PATTERN = /^(\d+\.\d+)\.?\s+(.+)$/;

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[‐‑–—]/g, "-")
    .replace(/[„“"]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanLine(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[‐‑–—]/g, "-")
    .replace(/\s+$/g, "")
    .replace(/^\s+/g, "")
    .trimEnd();
}

function parseEuropeanDate(value: string) {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) {
    throw new Error(`Ungueltiges Datum: ${value}`);
  }
  const [, dd, mm, yyyy] = match;
  return new Date(`${yyyy}-${mm}-${dd}T12:00:00`);
}

function renderPdfText(filePath: string) {
  return execFileSync(PDFTOTEXT, ["-layout", filePath, "-"], {
    encoding: "utf8",
    maxBuffer: 25 * 1024 * 1024,
  });
}

function splitPages(text: string) {
  return text
    .split("\f")
    .map((page) => page.replace(/\r/g, ""))
    .filter((page) => page.trim().length > 0);
}

function sanitizePageLines(page: string) {
  return page
    .split("\n")
    .map(cleanLine)
    .filter((line) => line.length > 0)
    .filter((line) => !EXTRA_HEADER_PATTERNS.some((pattern) => pattern.test(normalizeText(line))))
    .filter((line) => !/^version\s+\d+/i.test(line))
    .filter((line) => !/^seite\s+\d+\s+von\s+\d+/i.test(line))
    .filter((line) => !/\.docx$/i.test(line));
}

function extractTitle(firstPage: string) {
  const beforeToc = firstPage.split(/Inhaltsverzeichnis/i)[0] ?? firstPage;
  const lines = sanitizePageLines(beforeToc).filter((line) => {
    const normalized = normalizeText(line);
    return normalized.length > 0 && !normalized.startsWith("um den lesefluss");
  });

  if (!lines.length) {
    throw new Error("Titel konnte nicht gelesen werden");
  }

  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function extractVersionMeta(text: string) {
  const match = text.match(/Version\s+([0-9]+(?:[.,][0-9]+)?)\s*,\s*gespeichert am\s+(\d{2}\.\d{2}\.\d{4})/i);
  if (!match) {
    throw new Error("Version oder gespeichertes Datum nicht gefunden");
  }

  const version = match[1].replace(",", ".");
  const versionNumber = Number.parseInt(version, 10);
  const createdAt = parseEuropeanDate(match[2]);

  if (!Number.isFinite(versionNumber)) {
    throw new Error(`Version konnte nicht numerisch gelesen werden: ${version}`);
  }

  return { version, versionNumber, createdAt };
}

function includesVersionToken(rangeText: string, versionNumber: number) {
  const normalized = rangeText.replace(/\s+/g, " ").trim();
  const exact = normalized.match(/^(\d+)(?:[.,]\d+)?$/);
  if (exact) {
    return Number.parseInt(exact[1], 10) === versionNumber;
  }

  const range = normalized.match(/^(\d+)(?:[.,]\d+)?\s*[-]\s*(\d+)(?:[.,]\d+)?$/);
  if (range) {
    const start = Number.parseInt(range[1], 10);
    const end = Number.parseInt(range[2], 10);
    return versionNumber >= start && versionNumber <= end;
  }

  return false;
}

function extractHistoryLinesFromContent(contentLines: string[]) {
  const startIndex = contentLines.findIndex((line) => /^\d+\.\s*Historie\b/i.test(line));
  if (startIndex === -1) {
    return [];
  }

  return contentLines
    .slice(startIndex + 1)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/versionsbesitzer/i.test(line))
    .filter((line) => !/versionskommentar/i.test(line))
    .filter((line) => !/^versions-?$/i.test(line))
    .filter((line) => !/^nr\.?$/i.test(line));
}

function findMatchingHistoryLine(historyLines: string[], versionNumber: number) {
  for (const line of historyLines) {
    const rangeMatch = line.match(/^(\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?)/);
    if (!rangeMatch) continue;
    if (includesVersionToken(rangeMatch[1], versionNumber)) {
      return line;
    }
  }

  return historyLines.at(-1) ?? "";
}

function mapEmployees(employeesRows: EmployeeRow[]) {
  const bySurname = new Map<string, EmployeeRow>();

  for (const employee of employeesRows) {
    const lastName = normalizeText(employee.lastName ?? "");
    if (!lastName) continue;
    bySurname.set(lastName, employee);
  }

  return bySurname;
}

function extractCreatorId(historyLine: string, employeesBySurname: Map<string, EmployeeRow>) {
  const names: EmployeeRow[] = [];

  for (const [surname, employee] of employeesBySurname.entries()) {
    if (normalizeText(historyLine).includes(surname)) {
      names.push(employee);
    }
  }

  if (!names.length) {
    return null;
  }

  return names.at(-1)?.id ?? null;
}

function looksLikeSchema(text: string) {
  const normalized = normalizeText(text);
  return (
    SECTION_PATTERNS.every((pattern) => pattern.test(normalized)) &&
    CONTENT_SECTION_PATTERN.test(normalized)
  );
}

function removeTableOfContentsPage(pages: string[]) {
  if (pages.length < 2) return pages;
  if (/Inhaltsverzeichnis/i.test(pages[0])) {
    return pages.slice(1);
  }
  return pages;
}

function extractContentLines(text: string) {
  const pages = removeTableOfContentsPage(splitPages(text));
  const lines = pages.flatMap((page) => sanitizePageLines(page));
  const startIndex = lines.findIndex((line) =>
    /^1\.\s*Ziel und Zweck der Regelung/i.test(line),
  );

  if (startIndex === -1) {
    throw new Error("Start der SOP-Struktur nicht gefunden");
  }

  return lines.slice(startIndex);
}

function isBulletLine(line: string) {
  return /^[•▪●○◦*-]\s+/.test(line) || /^o\s+/.test(line);
}

function isNumberedLine(line: string) {
  return /^\d+[.)]\s+/.test(line);
}

function isTopLevelSectionHeading(line: string) {
  const match = line.match(/^(\d+)\.\s+(.+)$/);
  if (!match) return false;
  return TOP_LEVEL_SECTION_LABEL_PATTERN.test(match[2].trim());
}

function isShortNumberedSubheading(line: string) {
  const match = line.match(/^(\d+)\.\s+(.+)$/);
  if (!match) return false;
  if (isTopLevelSectionHeading(line)) return false;

  const label = match[2].trim();
  const wordCount = label.split(/\s+/).length;
  return wordCount <= 6 && label.length <= 60;
}

function isLikelySubheading(line: string) {
  if (!line) return false;
  if (
    isTopLevelSectionHeading(line) ||
    isShortNumberedSubheading(line) ||
    SUBSECTION_HEADING_PATTERN.test(line)
  ) {
    return false;
  }
  if (isBulletLine(line) || isNumberedLine(line)) return false;
  if (line.length > 50) return false;
  if (/[.!?]$/.test(line)) return false;
  if (/^[a-zäöü]/.test(line)) return false;
  if (line.split(/\s+/).length > 6) return false;
  return true;
}

function buildHistoryTable(lines: string[]) {
  const rows: string[] = [
    "| Version | Versionsbesitzer | Versionskommentar |",
    "| --- | --- | --- |",
  ];

  for (const line of lines) {
    if (/^dokument erstellt durch$/i.test(line) || /^dokument [a-z]+$/i.test(line)) {
      continue;
    }

    const parts = line.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 3) {
      rows.push(`| ${parts[0]} | ${parts[1]} | ${parts.slice(2).join(" ")} |`);
      continue;
    }

    rows.push(`| ${line} |  |  |`);
  }

  return rows;
}

function toMarkdown(title: string, rawLines: string[]) {
  const output: string[] = [`# ${title}`];
  let paragraph = "";
  let pendingHistoryLines: string[] = [];
  let insideHistory = false;

  const flushParagraph = () => {
    const trimmed = paragraph.trim();
    if (trimmed) {
      output.push(trimmed);
    }
    paragraph = "";
  };

  const flushHistory = () => {
    if (!pendingHistoryLines.length) return;
    output.push(...buildHistoryTable(pendingHistoryLines));
    pendingHistoryLines = [];
  };

  for (let index = 0; index < rawLines.length; index += 1) {
    const line = rawLines[index].replace(/\s+/g, " ").trim();
    if (!line) continue;

    const normalized = normalizeText(line);
    if (normalized.startsWith("um den lesefluss")) continue;

    if (isTopLevelSectionHeading(line)) {
      const sectionMatch = line.match(/^(\d+)\.\s+(.+)$/);
      if (!sectionMatch) continue;
      flushParagraph();
      flushHistory();
      insideHistory = normalizeText(sectionMatch[2]).includes("historie");
      output.push(`## ${sectionMatch[1]}. ${sectionMatch[2].trim()}`);
      continue;
    }

    if (insideHistory) {
      pendingHistoryLines.push(line);
      continue;
    }

    const subsectionMatch = line.match(SUBSECTION_HEADING_PATTERN);
    if (subsectionMatch) {
      flushParagraph();
      output.push(`### ${subsectionMatch[1]} ${subsectionMatch[2].trim()}`);
      continue;
    }

    if (isShortNumberedSubheading(line)) {
      flushParagraph();
      output.push(`### ${line}`);
      continue;
    }

    if (line.includes("|")) {
      flushParagraph();
      output.push(line);
      continue;
    }

    if (isBulletLine(line)) {
      flushParagraph();
      output.push(`- ${line.replace(/^(?:[•▪●○◦*-]\s+|o\s+)/, "")}`);
      continue;
    }

    if (isNumberedLine(line)) {
      flushParagraph();
      output.push(line.replace(/^(\d+)\)/, "$1."));
      continue;
    }

    if (isLikelySubheading(line)) {
      flushParagraph();
      output.push(`### ${line}`);
      continue;
    }

    paragraph += paragraph ? ` ${line}` : line;
  }

  flushParagraph();
  flushHistory();

  return `${output.join("\n\n")}\n`;
}

async function loadEmployees() {
  const rows = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(employees);

  return mapEmployees(rows);
}

async function loadExistingSops() {
  const rows = await db
    .select({
      id: sops.id,
      title: sops.title,
    })
    .from(sops)
    .where(eq(sops.category, "SOP"));

  return new Map(rows.map((row) => [normalizeText(row.title), row.id]));
}

function shouldImportFile(fileName: string) {
  if (!ONLY_FILTER) return true;
  return normalizeText(fileName).includes(normalizeText(ONLY_FILTER));
}

function parsePdf(
  filePath: string,
  employeesBySurname: Map<string, EmployeeRow>,
): ParsedSop {
  const text = renderPdfText(filePath);
  if (!looksLikeSchema(text)) {
    throw new Error("Kapitelmuster nicht erkannt");
  }

  const title = extractTitle(splitPages(text)[0] ?? text);
  const { version, versionNumber, createdAt } = extractVersionMeta(text);
  const contentLines = extractContentLines(text);
  const historyLines = extractHistoryLinesFromContent(contentLines);
  const matchedHistoryLine = findMatchingHistoryLine(historyLines, versionNumber);
  const createdById = extractCreatorId(matchedHistoryLine, employeesBySurname);

  if (!createdById) {
    throw new Error(`Ersteller in Historie nicht zuordenbar: ${matchedHistoryLine || "leer"}`);
  }

  const contentMarkdown = toMarkdown(title, contentLines);

  return {
    filePath,
    fileName: path.basename(filePath),
    title,
    version,
    versionNumber,
    createdAt,
    createdById,
    approvedById: APPROVED_BY_ID,
    contentMarkdown,
    releasedAt: createdAt,
    releasedById: APPROVED_BY_ID,
    changeNote: `Historischer PDF-Import Version ${version}`,
  };
}

function writePreview(entry: ParsedSop) {
  if (!PREVIEW_DIR) return;
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const previewPath = path.join(
    PREVIEW_DIR,
    entry.fileName.replace(/\.pdf$/i, ".md"),
  );
  fs.writeFileSync(previewPath, entry.contentMarkdown, "utf8");
}

function writeFixture(entries: ParsedSop[]) {
  if (!FIXTURE_OUT) return;

  const payload = entries.map((entry) => ({
    title: entry.title,
    category: "SOP",
    version: entry.version,
    status: "published",
    contentMarkdown: entry.contentMarkdown,
    createdAt: entry.createdAt.toISOString(),
    publishedAt: entry.createdAt.toISOString(),
    createdById: entry.createdById,
    approvedById: entry.approvedById,
    versionNumber: entry.versionNumber,
    changeNote: entry.changeNote,
    releasedAt: entry.releasedAt.toISOString(),
    releasedById: entry.releasedById,
  }));

  fs.mkdirSync(path.dirname(FIXTURE_OUT), { recursive: true });
  fs.writeFileSync(FIXTURE_OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function upsertSop(entry: ParsedSop) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: sops.id })
      .from(sops)
      .where(and(eq(sops.category, "SOP"), eq(sops.title, entry.title)))
      .limit(1);

    const baseValues = {
      title: entry.title,
      category: "SOP" as const,
      version: entry.version,
      status: "published" as const,
      contentMarkdown: entry.contentMarkdown,
      createdById: entry.createdById,
      approvedById: entry.approvedById,
      createdAt: entry.createdAt,
      updatedAt: entry.createdAt,
      publishedAt: entry.createdAt,
    };

    let sopId = existing?.id;

    if (!existing) {
      const [inserted] = await tx.insert(sops).values(baseValues).returning({ id: sops.id });
      sopId = inserted.id;
    } else {
      await tx.update(sops).set(baseValues).where(eq(sops.id, existing.id));
    }

    if (!sopId) {
      throw new Error(`Konnte SOP-ID fuer ${entry.title} nicht bestimmen`);
    }

    const [existingVersion] = await tx
      .select({ id: sopVersions.id })
      .from(sopVersions)
      .where(and(eq(sopVersions.sopId, sopId), eq(sopVersions.versionNumber, entry.versionNumber)))
      .limit(1);

    const versionValues = {
      sopId,
      versionNumber: entry.versionNumber,
      title: entry.title,
      contentMarkdown: entry.contentMarkdown,
      changeNote: entry.changeNote,
      releasedById: entry.releasedById,
      releasedAt: entry.releasedAt,
    };

    let versionId = existingVersion?.id;

    if (!existingVersion) {
      const [insertedVersion] = await tx
        .insert(sopVersions)
        .values(versionValues)
        .returning({ id: sopVersions.id });
      versionId = insertedVersion.id;
    } else {
      await tx.update(sopVersions).set(versionValues).where(eq(sopVersions.id, existingVersion.id));
    }

    await tx
      .update(sops)
      .set({ currentVersionId: versionId ?? null })
      .where(eq(sops.id, sopId));

    return { sopId, versionId };
  });
}

async function main() {
  const employeesBySurname = await loadEmployees();
  const existingSops = await loadExistingSops();

  const files = fs
    .readdirSync(SOURCE_DIR)
    .filter((file) => file.toLowerCase().endsWith(".pdf"))
    .filter(shouldImportFile)
    .sort((a, b) => a.localeCompare(b, "de"));

  const imported: ParsedSop[] = [];
  const skipped: SkipResult[] = [];

  for (const fileName of files) {
    try {
      const fullPath = path.join(SOURCE_DIR, fileName);
      const parsed = parsePdf(fullPath, employeesBySurname);
      const titleKey = normalizeText(parsed.title);

      if (!INCLUDE_EXISTING && existingSops.has(titleKey)) {
        skipped.push({ fileName, reason: "bereits vorhanden" });
        continue;
      }

      imported.push(parsed);
    } catch (error) {
      skipped.push({
        fileName,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const entry of imported) {
    writePreview(entry);
  }
  writeFixture(imported);

  if (DRY_RUN) {
    console.log(`Gefundene Importe: ${imported.length}`);
    for (const entry of imported) {
      console.log(
        `${entry.createdAt.toISOString().slice(0, 10)} | ${entry.title} | v${entry.version} | createdBy=${entry.createdById}`,
      );
    }
    console.log("");
    console.log(`Uebersprungen: ${skipped.length}`);
    for (const item of skipped) {
      console.log(`- ${item.fileName}: ${item.reason}`);
    }
    return;
  }

  for (const entry of imported) {
    const result = await upsertSop(entry);
    console.log(`Importiert: ${entry.title} -> SOP ${result.sopId}`);
  }

  if (skipped.length) {
    console.log("");
    console.log("Nicht importiert:");
    for (const item of skipped) {
      console.log(`- ${item.fileName}: ${item.reason}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
