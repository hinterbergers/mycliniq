import type { EducationProgress, EducationRequirement } from "@shared/schema";

export const educationEvaluationTypeOptions = [
  { value: "count", label: "Anzahl" },
  { value: "count_level", label: "Anzahl + Kompetenzstufe" },
  { value: "procedure", label: "Eingriff / OP-Log" },
  { value: "case_log", label: "Fall-Log" },
  { value: "time_period", label: "Zeit / Rotation" },
  { value: "binary_signoff", label: "Binäre Bestätigung" },
  { value: "certificate", label: "Zertifikat" },
  { value: "course", label: "Kurs / Fortbildung" },
  { value: "exam", label: "Prüfung" },
  { value: "upload", label: "Upload / Bildnachweis" },
  { value: "audit", label: "Qualitäts-/Auditkriterium" },
  { value: "center_requirement", label: "Zentrumsanforderung" },
] as const;

export const educationProgressStatusOptions = [
  { value: "offen", label: "Offen" },
  { value: "begonnen", label: "Begonnen" },
  { value: "ziel_erreicht", label: "Ziel erreicht" },
  { value: "bestaetigt", label: "Bestätigt" },
  { value: "abgelaufen", label: "Abgelaufen" },
] as const;

export function formatRequirementTarget(requirement: EducationRequirement) {
  const typeLabel =
    educationEvaluationTypeOptions.find(
      (item) => item.value === (requirement.evaluationType ?? "count"),
    )?.label ?? "Leistung";
  const pieces: string[] = [];

  if ((requirement.requiredCount ?? 0) > 0) {
    pieces.push(`${requirement.requiredCount} ${requirement.unitLabel}`);
  }
  if (typeof requirement.targetLevel === "number") {
    pieces.push(`Level ${requirement.targetLevel}`);
  }
  if (requirement.timeScope) {
    pieces.push(requirement.timeScope);
  }

  return {
    typeLabel,
    targetLabel: pieces.length > 0 ? pieces.join(" · ") : "Strukturziel",
  };
}

export function getRequirementProgressSummary(
  requirement: EducationRequirement,
  progress?: EducationProgress | null,
) {
  const requiredCount = Math.max(0, Number(requirement.requiredCount ?? 0));
  const completedCount = Math.max(0, Number(progress?.completedCount ?? 0));
  const verifiedCount = Math.max(0, Number(progress?.verifiedCount ?? 0));
  const targetLevel =
    typeof requirement.targetLevel === "number" ? requirement.targetLevel : null;
  const currentLevel =
    typeof progress?.currentLevel === "number" ? progress.currentLevel : null;

  let fraction = 0;
  let completedItems = 0;
  let targetItems = 0;

  if (requiredCount > 0) {
    targetItems += 1;
    completedItems += Math.min(1, verifiedCount / requiredCount);
  }
  if (targetLevel !== null && targetLevel > 0) {
    targetItems += 1;
    completedItems += Math.min(1, (currentLevel ?? 0) / targetLevel);
  }
  if (targetItems === 0) {
    targetItems = 1;
    completedItems =
      progress?.status === "bestaetigt" || progress?.status === "ziel_erreicht"
        ? 1
        : 0;
  }

  fraction = Math.min(1, completedItems / targetItems);

  const detailBits: string[] = [];
  if (requiredCount > 0) {
    detailBits.push(`${verifiedCount}/${requiredCount} ${requirement.unitLabel}`);
  }
  if (targetLevel !== null) {
    detailBits.push(`Level ${currentLevel ?? 0}/${targetLevel}`);
  }
  if (progress?.lastEntryRole) {
    detailBits.push(progress.lastEntryRole);
  }

  return {
    percent: Math.round(fraction * 100),
    detailLabel:
      detailBits.join(" · ") ||
      educationProgressStatusOptions.find((item) => item.value === progress?.status)
        ?.label ||
      "Offen",
  };
}
