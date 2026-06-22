import "dotenv/config";
import { execFileSync } from "node:child_process";
import { db } from "../server/db";
import { eq, inArray } from "../server/lib/db";
import {
  departments,
  educationModules,
  educationPrograms,
  educationRequirements,
} from "../shared/schema";

type EvaluationType =
  | "count"
  | "count_level"
  | "procedure"
  | "case_log"
  | "time_period"
  | "binary_signoff"
  | "certificate"
  | "course"
  | "exam"
  | "upload"
  | "audit"
  | "center_requirement";

type RasterRow = {
  program: string;
  module: string;
  title: string;
  targetValueRaw: string;
  unit: string;
  evidenceTypeRaw: string;
  timeRule: string;
  competencyGoalRaw: string;
  roleRule: string;
  userDisplay: string;
  sourceReference: string;
};

type ImportRequirement = {
  title: string;
  code: string | null;
  description: string | null;
  category: string | null;
  evaluationType: EvaluationType;
  requiredCount: number;
  unitLabel: string;
  targetLevel: number | null;
  timeScope: string | null;
  requiresUpload: boolean;
  requiresTrainerSignoff: boolean;
  roleTrackingEnabled: boolean;
  roleOptions: string[];
  countingRule: string | null;
  fieldConfig: Record<string, unknown>;
  matchingHints: string[];
  sourceReference: string | null;
  sortOrder: number;
  isActive: boolean;
};

type ImportModule = {
  title: string;
  slug: string;
  sortOrder: number;
  requirements: ImportRequirement[];
};

type ImportProgram = {
  title: string;
  slug: string;
  targetRole: string | null;
  modules: ImportModule[];
};

const PROGRAM_ALIASES: Record<string, string> = {
  "facharzt-ausbildung-frauenheilkunde-und-geburtshilfe":
    "facharztausbildung-frauenheilkunde-und-geburtshilfe",
  "facharztausbildung-frauenheilkunde-und-geburtshilfe":
    "facharztausbildung-frauenheilkunde-und-geburtshilfe",
  "ogum-ii": "ogum",
  ogum: "ogum",
  fmf: "fmf",
  onkocert: "onkocert",
};

const DEFAULT_ROLE_OPTIONS = [
  "Beobachtet",
  "1. Assistenz",
  "2. Assistenz",
  "Unter Supervision durchgeführt",
  "Selbst durchgeführt",
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function canonicalProgramKey(value: string) {
  const slug = slugify(value);
  return PROGRAM_ALIASES[slug] ?? slug;
}

function normalizeText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "ja" : "nein";
  return String(value).trim();
}

function normalizeInteger(value: string) {
  if (!value) return 0;
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function normalizeOptionalInteger(value: string) {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function inferProgramTargetRole(programTitle: string) {
  if (programTitle.includes("Facharztausbildung")) return "Assistenzarzt";
  if (programTitle === "ÖGUM") return "Assistenzarzt / Facharzt";
  if (programTitle === "FMF") return "Assistenzarzt / Facharzt";
  if (programTitle === "OnkoCert") return "Facharzt / Oberarzt";
  return null;
}

function mapEvidenceType(raw: string): {
  evaluationType: EvaluationType;
  requiresUpload: boolean;
  uploadOptional: boolean;
  requiresTrainerSignoff: boolean;
  roleTrackingEnabled: boolean;
} {
  const normalized = raw.toLowerCase();

  if (normalized.includes("procedure_log")) {
    return {
      evaluationType: "procedure",
      requiresUpload: false,
      uploadOptional: false,
      requiresTrainerSignoff: true,
      roleTrackingEnabled: true,
    };
  }
  if (normalized.includes("time_period")) {
    return {
      evaluationType: "time_period",
      requiresUpload: false,
      uploadOptional: false,
      requiresTrainerSignoff: true,
      roleTrackingEnabled: false,
    };
  }
  if (normalized.includes("binary_signoff")) {
    return {
      evaluationType: normalized.includes("exam") ? "exam" : "binary_signoff",
      requiresUpload: normalized.includes("upload_required"),
      uploadOptional: false,
      requiresTrainerSignoff: true,
      roleTrackingEnabled: false,
    };
  }
  if (normalized.includes("certificate")) {
    return {
      evaluationType: "certificate",
      requiresUpload: true,
      uploadOptional: false,
      requiresTrainerSignoff: true,
      roleTrackingEnabled: false,
    };
  }
  if (normalized.includes("course")) {
    return {
      evaluationType: normalized.includes("certificate") ? "certificate" : "course",
      requiresUpload: normalized.includes("certificate"),
      uploadOptional: false,
      requiresTrainerSignoff: true,
      roleTrackingEnabled: false,
    };
  }
  if (normalized.includes("exam")) {
    return {
      evaluationType: "exam",
      requiresUpload: false,
      uploadOptional: false,
      requiresTrainerSignoff: true,
      roleTrackingEnabled: false,
    };
  }
  if (normalized.includes("center_requirement")) {
    return {
      evaluationType: "center_requirement",
      requiresUpload: false,
      uploadOptional: false,
      requiresTrainerSignoff: true,
      roleTrackingEnabled: false,
    };
  }
  if (normalized.includes("quality_check") || normalized.includes("audit")) {
    return {
      evaluationType: "audit",
      requiresUpload: normalized.includes("image"),
      uploadOptional: false,
      requiresTrainerSignoff: true,
      roleTrackingEnabled: false,
    };
  }
  if (normalized.includes("upload_required")) {
    return {
      evaluationType: normalized.includes("case_log") ? "case_log" : "upload",
      requiresUpload: true,
      uploadOptional: false,
      requiresTrainerSignoff: true,
      roleTrackingEnabled: false,
    };
  }
  if (normalized.includes("case_log")) {
    return {
      evaluationType: "case_log",
      requiresUpload: false,
      uploadOptional: false,
      requiresTrainerSignoff: true,
      roleTrackingEnabled: false,
    };
  }
  if (normalized.includes("competence_level")) {
    return {
      evaluationType: "count_level",
      requiresUpload: false,
      uploadOptional: false,
      requiresTrainerSignoff: true,
      roleTrackingEnabled: false,
    };
  }
  return {
    evaluationType: "count",
    requiresUpload: false,
    uploadOptional: normalized.includes("upload_optional"),
    requiresTrainerSignoff: true,
    roleTrackingEnabled: normalized.includes("counting_rule"),
  };
}

function buildRequirement(row: RasterRow, sortOrder: number): ImportRequirement {
  const mapped = mapEvidenceType(row.evidenceTypeRaw);
  const targetLevel = normalizeOptionalInteger(row.competencyGoalRaw);
  let requiredCount = normalizeInteger(row.targetValueRaw);

  if (
    requiredCount === 0 &&
    ["binary_signoff", "certificate", "course", "exam", "audit", "center_requirement"].includes(
      mapped.evaluationType,
    )
  ) {
    requiredCount = 1;
  }

  let unitLabel = row.unit || "Anzahl";
  if (!row.unit && mapped.evaluationType === "binary_signoff") {
    unitLabel = "Bestätigung";
  } else if (!row.unit && mapped.evaluationType === "certificate") {
    unitLabel = "Zertifikat";
  } else if (!row.unit && mapped.evaluationType === "exam") {
    unitLabel = "Prüfung";
  }

  const roleTrackingEnabled =
    mapped.roleTrackingEnabled ||
    /assistenz|operateur|rolle/i.test(row.roleRule);

  const categoryMap: Record<EvaluationType, string> = {
    count: "Mindestmenge",
    count_level: "Leistung mit Kompetenzstufe",
    procedure: "Eingriff / OP",
    case_log: "Fall / Dokumentation",
    time_period: "Zeit / Rotation",
    binary_signoff: "Bestätigung",
    certificate: "Zertifikat",
    course: "Kurs",
    exam: "Prüfung",
    upload: "Nachweis / Upload",
    audit: "Audit / Qualität",
    center_requirement: "Zentrumsanforderung",
  };

  return {
    title: row.title,
    code: null,
    description: row.userDisplay || null,
    category: categoryMap[mapped.evaluationType],
    evaluationType: mapped.evaluationType,
    requiredCount,
    unitLabel,
    targetLevel,
    timeScope: row.timeRule || null,
    requiresUpload: mapped.requiresUpload,
    requiresTrainerSignoff: mapped.requiresTrainerSignoff,
    roleTrackingEnabled,
    roleOptions: roleTrackingEnabled ? DEFAULT_ROLE_OPTIONS : [],
    countingRule: row.roleRule || null,
    fieldConfig: {
      rawEvidenceType: row.evidenceTypeRaw || null,
      uploadOptional: mapped.uploadOptional,
      userDisplay: row.userDisplay || null,
      rawTargetValue: row.targetValueRaw || null,
      competencyGoal: targetLevel,
      timeRule: row.timeRule || null,
    },
    matchingHints: [],
    sourceReference: row.sourceReference || null,
    sortOrder,
    isActive: true,
  };
}

async function readRaster(path: string) {
  const pythonScript = `
import json, posixpath, sys, zipfile
import xml.etree.ElementTree as ET

MAIN_NS = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = {"rel": "http://schemas.openxmlformats.org/package/2006/relationships"}
RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"

def col_index(cell_ref):
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    value = 0
    for ch in letters:
        value = value * 26 + ord(ch.upper()) - 64
    return value

with zipfile.ZipFile(sys.argv[1]) as archive:
    shared_strings = []
    if "xl/sharedStrings.xml" in archive.namelist():
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        for si in root.findall(".//main:si", MAIN_NS):
            shared_strings.append("".join((t.text or "") for t in si.findall(".//main:t", MAIN_NS)))

    workbook_root = ET.fromstring(archive.read("xl/workbook.xml"))
    rels_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rel_map = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels_root.findall(".//rel:Relationship", REL_NS)
    }

    sheet_target = None
    for sheet in workbook_root.findall(".//main:sheets/main:sheet", MAIN_NS):
        if sheet.attrib.get("name") == "Grundraster":
            rel_id = sheet.attrib.get(RID)
            sheet_target = rel_map.get(rel_id)
            break

    if not sheet_target:
        raise SystemExit('Arbeitsblatt "Grundraster" nicht gefunden')

    sheet_target = sheet_target.lstrip("/")
    if not sheet_target.startswith("xl/"):
        sheet_target = posixpath.normpath(posixpath.join("xl", sheet_target))

    sheet_root = ET.fromstring(archive.read(sheet_target))
    raw_rows = []
    for row in sheet_root.findall(".//main:sheetData/main:row", MAIN_NS):
        raw = {}
        for cell in row.findall("main:c", MAIN_NS):
            ref = cell.attrib.get("r", "")
            idx = col_index(ref)
            cell_type = cell.attrib.get("t")
            if cell_type == "s":
                value_node = cell.find("main:v", MAIN_NS)
                value = shared_strings[int(value_node.text)] if value_node is not None and value_node.text else ""
            elif cell_type == "inlineStr":
                inline_node = cell.find("main:is", MAIN_NS)
                value = "".join((t.text or "") for t in inline_node.findall(".//main:t", MAIN_NS)) if inline_node is not None else ""
            else:
                value_node = cell.find("main:v", MAIN_NS)
                value = value_node.text if value_node is not None and value_node.text is not None else ""
            raw[idx] = value
        raw_rows.append(raw)

    if not raw_rows:
        print("[]")
        raise SystemExit(0)

    headers = {idx: str(value).strip() for idx, value in raw_rows[0].items()}
    result = []
    for raw in raw_rows[1:]:
        record = {}
        for idx, header in headers.items():
            record[header] = str(raw.get(idx, "")).strip()
        result.append(record)

    print(json.dumps(result, ensure_ascii=False))
`;

  const stdout = execFileSync("python3", ["-c", pythonScript, path], {
    encoding: "utf8",
  });
  const parsed = JSON.parse(stdout) as Array<Record<string, string>>;

  return parsed
    .filter(
      (values) =>
        values["Programm"] && values["Modul"] && values["Soll-Leistung"],
    )
    .map((values) => ({
      program: values["Programm"],
      module: values["Modul"],
      title: values["Soll-Leistung"],
      targetValueRaw: values["Zielwert"] ?? "",
      unit: values["Einheit"] ?? "",
      evidenceTypeRaw: values["Nachweisart"] ?? "",
      timeRule: values["Zeitraum/Regel"] ?? "",
      competencyGoalRaw: values["Kompetenzziel"] ?? "",
      roleRule: values["Rolle/Zählregel"] ?? "",
      userDisplay: values["User-Darstellung"] ?? "",
      sourceReference: values["Quelle"] ?? "",
    }));
}

async function main() {
  const rasterPath = process.argv[2];
  const departmentId = Number(process.argv[3] ?? "1");

  if (!rasterPath) {
    throw new Error(
      "Aufruf: node --import=tsx script/importEducationRaster.ts <xlsx-path> [departmentId]",
    );
  }

  const [department] = await db
    .select({
      id: departments.id,
      name: departments.name,
    })
    .from(departments)
    .where(eq(departments.id, departmentId))
    .limit(1);

  if (!department) {
    throw new Error(`Abteilung ${departmentId} nicht gefunden`);
  }

  const rasterRows = await readRaster(rasterPath);
  if (!rasterRows.length) {
    throw new Error("Keine importierbaren Zeilen gefunden");
  }

  const programBuckets = new Map<string, { title: string; modules: Map<string, string[]> }>();
  for (const row of rasterRows) {
    const program = programBuckets.get(row.program) ?? {
      title: row.program,
      modules: new Map<string, string[]>(),
    };
    const moduleRows = program.modules.get(row.module) ?? [];
    moduleRows.push(row.title);
    program.modules.set(row.module, moduleRows);
    programBuckets.set(row.program, program);
  }

  const importPrograms: ImportProgram[] = [];
  const programOrder = new Map<string, number>();
  rasterRows.forEach((row, index) => {
    if (!programOrder.has(row.program)) {
      programOrder.set(row.program, index);
    }
  });

  for (const programTitle of [...programBuckets.keys()].sort(
    (a, b) => (programOrder.get(a) ?? 0) - (programOrder.get(b) ?? 0),
  )) {
    const moduleOrder = new Map<string, number>();
    const requirementOrder = new Map<string, number>();
    const modulesForProgram = rasterRows.filter((row) => row.program === programTitle);
    modulesForProgram.forEach((row, index) => {
      if (!moduleOrder.has(row.module)) {
        moduleOrder.set(row.module, index);
      }
      const key = `${row.module}::${row.title}`;
      if (!requirementOrder.has(key)) {
        requirementOrder.set(key, index);
      }
    });

    const groupedModules = [...new Set(modulesForProgram.map((row) => row.module))]
      .sort((a, b) => (moduleOrder.get(a) ?? 0) - (moduleOrder.get(b) ?? 0))
      .map((moduleTitle, moduleIndex) => {
        const requirements = modulesForProgram
          .filter((row) => row.module === moduleTitle)
          .sort(
            (a, b) =>
              (requirementOrder.get(`${a.module}::${a.title}`) ?? 0) -
              (requirementOrder.get(`${b.module}::${b.title}`) ?? 0),
          )
          .map((row, requirementIndex) => buildRequirement(row, requirementIndex));

        return {
          title: moduleTitle,
          slug: slugify(moduleTitle),
          sortOrder: moduleIndex,
          requirements,
        };
      });

    importPrograms.push({
      title: programTitle,
      slug: slugify(programTitle),
      targetRole: inferProgramTargetRole(programTitle),
      modules: groupedModules,
    });
  }

  const existingPrograms = await db
    .select()
    .from(educationPrograms)
    .where(eq(educationPrograms.departmentId, departmentId));

  const existingProgramsByCanonical = new Map(
    existingPrograms.map((program) => [canonicalProgramKey(program.title), program]),
  );

  let createdPrograms = 0;
  let updatedPrograms = 0;
  let createdModules = 0;
  let updatedModules = 0;
  let deletedModules = 0;
  let createdRequirements = 0;
  let updatedRequirements = 0;
  let deletedRequirements = 0;

  for (const importProgram of importPrograms) {
    const canonicalKey = canonicalProgramKey(importProgram.title);
    const existingProgram = existingProgramsByCanonical.get(canonicalKey);

    const [programRecord] = existingProgram
      ? await db
          .update(educationPrograms)
          .set({
            title: importProgram.title,
            slug: importProgram.slug,
            targetRole: existingProgram.targetRole ?? importProgram.targetRole,
            updatedAt: new Date(),
          })
          .where(eq(educationPrograms.id, existingProgram.id))
          .returning()
      : await db
          .insert(educationPrograms)
          .values({
            departmentId,
            title: importProgram.title,
            slug: importProgram.slug,
            targetRole: importProgram.targetRole,
            description: null,
            isActive: true,
          })
          .returning();

    if (existingProgram) updatedPrograms += 1;
    else createdPrograms += 1;

    const existingModuleRows = await db
      .select()
      .from(educationModules)
      .where(eq(educationModules.programId, programRecord.id));
    const existingModulesBySlug = new Map(
      existingModuleRows.map((module) => [slugify(module.title), module]),
    );
    const keptModuleIds: number[] = [];

    for (const importModule of importProgram.modules) {
      const existingModule = existingModulesBySlug.get(importModule.slug);
      const [moduleRecord] = existingModule
        ? await db
            .update(educationModules)
            .set({
              title: importModule.title,
              slug: importModule.slug,
              sortOrder: importModule.sortOrder,
              updatedAt: new Date(),
            })
            .where(eq(educationModules.id, existingModule.id))
            .returning()
        : await db
            .insert(educationModules)
            .values({
              programId: programRecord.id,
              title: importModule.title,
              slug: importModule.slug,
              description: null,
              sortOrder: importModule.sortOrder,
              isActive: true,
            })
            .returning();

      keptModuleIds.push(moduleRecord.id);
      if (existingModule) updatedModules += 1;
      else createdModules += 1;

      const existingRequirementRows = await db
        .select()
        .from(educationRequirements)
        .where(eq(educationRequirements.moduleId, moduleRecord.id));
      const existingRequirementsBySlug = new Map(
        existingRequirementRows.map((requirement) => [slugify(requirement.title), requirement]),
      );
      const keptRequirementIds: number[] = [];

      for (const requirement of importModule.requirements) {
        const existingRequirement = existingRequirementsBySlug.get(
          slugify(requirement.title),
        );
        const [requirementRecord] = existingRequirement
          ? await db
              .update(educationRequirements)
              .set({
                title: requirement.title,
                code: requirement.code,
                description: requirement.description,
                category: requirement.category,
                evaluationType: requirement.evaluationType,
                requiredCount: requirement.requiredCount,
                unitLabel: requirement.unitLabel,
                targetLevel: requirement.targetLevel,
                timeScope: requirement.timeScope,
                requiresUpload: requirement.requiresUpload,
                requiresTrainerSignoff: requirement.requiresTrainerSignoff,
                roleTrackingEnabled: requirement.roleTrackingEnabled,
                roleOptions: requirement.roleOptions,
                countingRule: requirement.countingRule,
                fieldConfig: requirement.fieldConfig,
                matchingHints: requirement.matchingHints,
                sourceReference: requirement.sourceReference,
                sortOrder: requirement.sortOrder,
                isActive: true,
                updatedAt: new Date(),
              })
              .where(eq(educationRequirements.id, existingRequirement.id))
              .returning()
          : await db
              .insert(educationRequirements)
              .values({
                moduleId: moduleRecord.id,
                title: requirement.title,
                code: requirement.code,
                description: requirement.description,
                category: requirement.category,
                evaluationType: requirement.evaluationType,
                requiredCount: requirement.requiredCount,
                unitLabel: requirement.unitLabel,
                targetLevel: requirement.targetLevel,
                timeScope: requirement.timeScope,
                requiresUpload: requirement.requiresUpload,
                requiresTrainerSignoff: requirement.requiresTrainerSignoff,
                roleTrackingEnabled: requirement.roleTrackingEnabled,
                roleOptions: requirement.roleOptions,
                countingRule: requirement.countingRule,
                fieldConfig: requirement.fieldConfig,
                matchingHints: requirement.matchingHints,
                sourceReference: requirement.sourceReference,
                sortOrder: requirement.sortOrder,
                isActive: requirement.isActive,
              })
              .returning();

        keptRequirementIds.push(requirementRecord.id);
        if (existingRequirement) updatedRequirements += 1;
        else createdRequirements += 1;
      }

      const obsoleteRequirementIds = existingRequirementRows
        .map((item) => item.id)
        .filter((id) => !keptRequirementIds.includes(id));
      if (obsoleteRequirementIds.length > 0) {
        await db
          .delete(educationRequirements)
          .where(inArray(educationRequirements.id, obsoleteRequirementIds));
        deletedRequirements += obsoleteRequirementIds.length;
      }
    }

    const obsoleteModuleIds = existingModuleRows
      .map((item) => item.id)
      .filter((id) => !keptModuleIds.includes(id));
    if (obsoleteModuleIds.length > 0) {
      await db
        .delete(educationModules)
        .where(inArray(educationModules.id, obsoleteModuleIds));
      deletedModules += obsoleteModuleIds.length;
    }
  }

  console.log(
    JSON.stringify(
      {
        department,
        importedPrograms: importPrograms.length,
        rows: rasterRows.length,
        createdPrograms,
        updatedPrograms,
        createdModules,
        updatedModules,
        deletedModules,
        createdRequirements,
        updatedRequirements,
        deletedRequirements,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
