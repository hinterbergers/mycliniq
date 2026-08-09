import "dotenv/config";

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { eq } from "../server/lib/db";
import { db } from "../server/db";
import { sopVersions, sops } from "../shared/schema";

type OcrRow = {
  text: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type SourceConfig = {
  fileName: string;
  title: string;
  version: string;
  bodyStartContains?: string;
};

type PreparedImport = {
  filePath: string;
  fileName: string;
  title: string;
  version: string;
  createdAt: Date;
  markdown: string;
};

const SOURCE_DIR =
  process.argv.find((arg) => arg.startsWith("--source-dir="))?.split("=")[1] ??
  "/Volumes/Projekte/TEMP/SOPs_2026-08-09/Dienstanweisungen";

const PREVIEW_DIR =
  process.argv.find((arg) => arg.startsWith("--preview-dir="))?.split("=")[1] ?? "";

const DRY_RUN = process.argv.includes("--dry-run");

const CREATED_BY_ID = 1;
const APPROVED_BY_ID = 1;

const PDFTOPPM =
  "/Users/stefan/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm";

const OCR_SWIFT_SCRIPT = "/tmp/mycliniq_dienst_ocr.swift";

const SOURCES: SourceConfig[] = [
  {
    fileName: "2021 10 01 Urlaubsregeln.pdf",
    title: "Urlaubsregeln",
    version: "1",
    bodyStartContains: "Sehr geehrte Kolleginnen und Kollegen!",
  },
  {
    fileName: "2022 12 06 Amerikanische Stiefel.pdf",
    title: "Lagerungen amerikanische Stiefel bei bestimmten laparoskopischen Operationen",
    version: "1",
    bodyStartContains: "Ab sofort",
  },
  {
    fileName: "2022 12 06 Urlaubsplanung 2023.pdf",
    title: "Urlaubsplanung 2023",
    version: "1",
    bodyStartContains:
      "Bis 09.12.2022 konnen noch Urlaubswunsche bis Ende Marz 2023 angegeben werden.",
  },
  {
    fileName: "2023 03 27 OA Diensttelefon.pdf",
    title: "Diensthandy des Oberarztes - Dect 26404",
    version: "1",
    bodyStartContains: "Aus gegebenen Anlass weise ich Sie auf folgenden Sachverhalt hin:",
  },
  {
    fileName: "2023 06 26 HIV-Testung.pdf",
    title: "HIV - Testung gynäkologischer Patientinnen",
    version: "1",
    bodyStartContains: "Sehr geehrtes Gyn-Team!",
  },
  {
    fileName: "2023 12 05 Anfordung Pathologie und Radiologie.pdf",
    title: "Eingabe pathologische und radiologische Befunde",
    version: "1",
    bodyStartContains: "Sehr geehrtes Gyn-Team!",
  },
  {
    fileName: "2023 12 27 Dokumentation Kreißsaal.pdf",
    title: "Dokumentation Kreißsaal",
    version: "1",
    bodyStartContains:
      "Aus gegebenen Anlass weise ich darauf hin, dass Maßnahmen, die im Kreißsaal getroffen und",
  },
  {
    fileName: "2024 08 05 Indikationen zu Operationen.pdf",
    title: "Indikationen zu Operationen",
    version: "1",
    bodyStartContains: "Aus gegebenen Anlass mache ich Sie auf folgendes aufmerksam:",
  },
  {
    fileName: "2024 11 26 SEE FIM Protokoll.pdf",
    title: "SEE FIM Protokoll",
    version: "1",
    bodyStartContains:
      "Ich darf Sie nochmals darauf hinweisen, dass bei Patientinnen, die die Adnexe bzw. die Tuben",
  },
];

const TITLE_ALIASES = new Map<string, string[]>([
  [
    "lagerungen amerikanische stiefel bei bestimmten laparoskopischen operationen",
    [
      "lagerungen amerikanische stiefel bei bestimmten laparoskopischen operationen",
      "amerikanische stiefel",
    ],
  ],
  [
    "hiv - testung gynakologischer patientinnen",
    [
      "hiv - testung gynakologischer patientinnen",
      "hiv - testung gynakologischer patientinnen",
      "hiv-testung gynakologischer patientinnen",
      "hiv testung gynakologischer patientinnen",
    ],
  ],
  [
    "dokumentation kreissaal",
    ["dokumentation kreissaal", "dokumentation kreißsaal"],
  ],
]);

const FOOTER_PATTERNS = [
  /^kabeg$/i,
  /^klinikum klagenfurt$/i,
  /^am worthersee$/i,
  /^am wörthersee$/i,
  /^version\b/i,
  /^seite \d+/i,
  /^firmenbuchnummer:/i,
  /^landeskrankenanstalten/i,
  /^www\.kabeg\.at$/i,
  /^9020 klagenfurt/i,
  /^feschnigstra(?:ss|ss|ß)e/i,
  /^vorstand:/i,
  /^telefon:/i,
  /^e-mail:/i,
  /^auskunfte:/i,
  /^auskünfte:/i,
];

function ensureOcrSwiftScript() {
  const source = `import Foundation
import Vision
import ImageIO
import CoreGraphics

struct Row: Codable {
  let text: String
  let minX: Double
  let minY: Double
  let maxX: Double
  let maxY: Double
}

let path = CommandLine.arguments[1]
let url = URL(fileURLWithPath: path) as CFURL
guard let src = CGImageSourceCreateWithURL(url, nil),
      let cgImage = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
  fputs("Could not load image\\n", stderr)
  exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["de-DE", "en-US"]
let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

do {
  try handler.perform([request])
  let observations = (request.results ?? []).sorted { a, b in
    let ay = a.boundingBox.minY
    let by = b.boundingBox.minY
    if abs(ay - by) > 0.015 { return ay > by }
    return a.boundingBox.minX < b.boundingBox.minX
  }

  let rows = observations.compactMap { obs -> Row? in
    guard let candidate = obs.topCandidates(1).first else { return nil }
    return Row(
      text: candidate.string,
      minX: Double(obs.boundingBox.minX),
      minY: Double(obs.boundingBox.minY),
      maxX: Double(obs.boundingBox.maxX),
      maxY: Double(obs.boundingBox.maxY)
    )
  }

  let data = try JSONEncoder().encode(rows)
  print(String(data: data, encoding: .utf8)!)
} catch {
  fputs("OCR failed: \\(error)\\n", stderr)
  exit(1)
}
`;

  fs.writeFileSync(OCR_SWIFT_SCRIPT, source, "utf8");
}

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[“”„"]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanLine(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[|]/g, "I")
    .trim();
}

function isFooterLine(value: string) {
  const normalized = normalizeText(value);
  if (
    normalized.includes("klagenfurt") &&
    (normalized.includes("klinikum") || normalized.includes("klinkum"))
  ) {
    return true;
  }
  return FOOTER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function getTitleCandidates(title: string) {
  const normalized = normalizeText(title);
  return TITLE_ALIASES.get(normalized) ?? [normalized];
}

function getHistoricalDate(filePath: string) {
  const raw = execFileSync(
    "mdls",
    ["-raw", "-name", "kMDItemContentCreationDate", filePath],
    {
      encoding: "utf8",
    },
  ).trim();

  if (raw && raw !== "(null)") {
    return new Date(raw);
  }

  return fs.statSync(filePath).mtime;
}

function renderPdfToPng(pdfPath: string) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "dienst-import-"));
  const prefix = path.join(outputDir, "page");

  execFileSync(PDFTOPPM, ["-png", pdfPath, prefix], {
    stdio: "ignore",
  });

  const pngPath = path.join(outputDir, "page-1.png");
  return { outputDir, pngPath };
}

function ocrPdf(pdfPath: string) {
  const { outputDir, pngPath } = renderPdfToPng(pdfPath);

  try {
    const json = execFileSync("swift", [OCR_SWIFT_SCRIPT, pngPath], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });

    const rows = JSON.parse(json) as OcrRow[];
    return rows
      .map((row) => ({
        ...row,
        text: cleanLine(row.text),
      }))
      .filter((row) => row.text.length > 0);
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

function findBodyStartIndex(rows: OcrRow[], config: SourceConfig) {
  if (config.bodyStartContains) {
    const bodyMarker = normalizeText(config.bodyStartContains);
    for (let index = 0; index < rows.length; index += 1) {
      const normalized = normalizeText(rows[index].text);
      if (normalized.includes(bodyMarker)) {
        return index;
      }
    }
  }

  const candidates = getTitleCandidates(config.title);

  for (let index = 0; index < rows.length; index += 1) {
    const normalized = normalizeText(rows[index].text);
    if (candidates.some((candidate) => normalized.includes(candidate))) {
      return index;
    }
  }

  return -1;
}

function extractBodyRows(rows: OcrRow[], config: SourceConfig) {
  const startIndex = findBodyStartIndex(rows, config);
  if (startIndex === -1) {
    throw new Error(`Startmarker in OCR nicht gefunden: ${config.title}`);
  }

  const result: OcrRow[] = [];
  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index];
    const normalized = normalizeText(row.text);
    if (normalized.startsWith("hochacht")) {
      break;
    }
    if (normalized.startsWith("mit herzlichen gr")) {
      result.push({ ...row, text: "Mit herzlichen Gruessen" });
      break;
    }
    if (normalized.startsWith("ich bitte um beachtung")) {
      result.push({ ...row, text: "Ich bitte um Beachtung." });
      break;
    }
    if (normalized.includes("klinikum klagenfurt")) {
      break;
    }
    if (normalized.includes("kabeg") && normalized.length < 28) {
      break;
    }
    if (isFooterLine(row.text)) {
      break;
    }
    result.push(row);
  }

  return result.filter((row) => {
    const normalized = normalizeText(row.text);
    return normalized !== "an alle mitarbeiterinnen und mitarbeiter des arztlichen bereichs" &&
      normalized !==
        "an alle mitarbeiterinnen und mitarbeiter des arztlichen und pflegerischen bereichs" &&
      normalized !== "der abteilung gynakologie und geburtshilfe" &&
      normalized !== "der abteilung fur gynakologie und geburtshilfe" &&
      normalized !== "der abteilung fur frauenheilkunde und geburtshilfe" &&
      normalized !== "team der frauenheilkunde und geburtshilfe" &&
      normalized !== "im hause" &&
      normalized !== "an das";
  });
}

function formatLinesAsMarkdown(rows: OcrRow[], title: string) {
  const blocks: string[] = [`# ${title}`];
  let currentParagraph = "";
  let currentListItem = "";
  let previousMinY: number | null = null;

  const flushParagraph = () => {
    const trimmed = currentParagraph.trim();
    if (trimmed) {
      blocks.push(trimmed);
    }
    currentParagraph = "";
  };

  const flushListItem = () => {
    const trimmed = currentListItem.trim();
    if (trimmed) {
      blocks.push(trimmed);
    }
    currentListItem = "";
  };

  for (const row of rows) {
    let line = row.text.trim();
    if (!line) continue;

    line = line.replace(/^•\s*/, "- ");
    const isBullet = /^[-*]\s+/.test(line);
    const isNumbered = /^\d+[.)]\s+/.test(line);

    const gap = previousMinY === null ? 0 : previousMinY - row.maxY;
    const paragraphBreak = gap > 0.022 || isBullet || isNumbered;

    if (
      isBullet &&
      currentParagraph.trim().endsWith("HIV") &&
      normalizeText(line).startsWith("- testung")
    ) {
      currentParagraph += " - " + line.replace(/^-\s*/, "");
      previousMinY = row.minY;
      continue;
    }

    if (paragraphBreak) {
      flushParagraph();
      if (!isBullet && !isNumbered) {
        flushListItem();
      }
    }

    if (isBullet || isNumbered) {
      if (currentListItem) {
        flushListItem();
      }
      currentListItem = line;
      previousMinY = row.minY;
      continue;
    }

    if (currentListItem) {
      currentListItem += currentListItem.endsWith("-") ? "" : " ";
      currentListItem += line;
      previousMinY = row.minY;
      continue;
    }

    if (currentParagraph) {
      currentParagraph += currentParagraph.endsWith("-") ? "" : " ";
    }

    currentParagraph += line;
    previousMinY = row.minY;
  }

  flushParagraph();
  flushListItem();

  return `${blocks.join("\n\n")}\n`;
}

async function loadExistingDienstanweisungen() {
  const existing = await db
    .select({ id: sops.id, title: sops.title })
    .from(sops)
    .where(eq(sops.category, "Dienstanweisung"));

  return new Map(existing.map((row) => [normalizeText(row.title), row.id]));
}

function prepareImport(config: SourceConfig) {
  const filePath = path.join(SOURCE_DIR, config.fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Datei nicht gefunden: ${filePath}`);
  }

  const createdAt = getHistoricalDate(filePath);
  const rows = ocrPdf(filePath);
  const bodyRows = extractBodyRows(rows, config);
  const markdown = formatLinesAsMarkdown(bodyRows, config.title);

  return {
    filePath,
    fileName: config.fileName,
    title: config.title,
    version: config.version,
    createdAt,
    markdown,
  } satisfies PreparedImport;
}

function writePreview(prepared: PreparedImport) {
  if (!PREVIEW_DIR) return;
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const fileName = prepared.fileName.replace(/\.pdf$/i, ".md");
  fs.writeFileSync(path.join(PREVIEW_DIR, fileName), prepared.markdown, "utf8");
}

async function insertDienstanweisung(entry: PreparedImport) {
  await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(sops)
      .values({
        title: entry.title,
        category: "Dienstanweisung",
        version: entry.version,
        status: "published",
        contentMarkdown: entry.markdown,
        createdById: CREATED_BY_ID,
        approvedById: APPROVED_BY_ID,
        createdAt: entry.createdAt,
        updatedAt: entry.createdAt,
        publishedAt: entry.createdAt,
      })
      .returning();

    const [version] = await tx
      .insert(sopVersions)
      .values({
        sopId: inserted.id,
        versionNumber: 1,
        title: entry.title,
        contentMarkdown: entry.markdown,
        changeNote: "Historischer PDF-Import",
        releasedById: APPROVED_BY_ID,
        releasedAt: entry.createdAt,
      })
      .returning();

    await tx
      .update(sops)
      .set({
        currentVersionId: version.id,
      })
      .where(eq(sops.id, inserted.id));
  });
}

async function main() {
  ensureOcrSwiftScript();

  const existing = await loadExistingDienstanweisungen();
  const missing = SOURCES.filter((entry) => !existing.has(normalizeText(entry.title)));

  if (missing.length === 0) {
    console.log("Keine fehlenden Dienstanweisungen gefunden.");
    return;
  }

  const prepared = missing.map(prepareImport);
  for (const entry of prepared) {
    writePreview(entry);
  }

  if (DRY_RUN) {
    console.log(`Dry-Run: ${prepared.length} Dienstanweisungen wurden vorbereitet.`);
    for (const entry of prepared) {
      console.log(
        `${entry.createdAt.toISOString()} | ${entry.title} | ${entry.fileName}`,
      );
      console.log(entry.markdown.split("\n").slice(0, 16).join("\n"));
      console.log("----");
    }
    return;
  }

  for (const entry of prepared) {
    await insertDienstanweisung(entry);
    console.log(
      `Importiert: ${entry.title} (${entry.createdAt.toISOString().slice(0, 19)})`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
