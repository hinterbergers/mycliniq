export type WeeklyPlanningReasonSeverity = "hard" | "soft";

export type WeeklyPlanningReasonMeta = {
  severity: WeeklyPlanningReasonSeverity;
  title: string;
  description: string;
  actionHint?: string;
};

export const WEEKLY_PLANNING_REASON_MAP: Record<string, WeeklyPlanningReasonMeta> = {
  NO_CANDIDATE: {
    severity: "hard",
    title: "Kein geeigneter Kandidat",
    description: "Kein geeigneter verfuegbarer Benutzer gefunden.",
    actionHint: "Manuelle Zuweisung pruefen oder Regeln lockern.",
  },
  BAN_DATE: {
    severity: "hard",
    title: "Sperrdatum",
    description: "Person ist fuer dieses Datum gesperrt oder abwesend.",
  },
  BAN_WEEKDAY: {
    severity: "hard",
    title: "Wochentag gesperrt",
    description: "Person ist an diesem Wochentag nicht einteilbar.",
  },
  CONSECUTIVE_DAY: {
    severity: "hard",
    title: "Folgetag-Regel",
    description: "Keine Einteilung an aufeinanderfolgenden Tagen.",
  },
  MAX_SLOTS: {
    severity: "hard",
    title: "Monatslimit erreicht",
    description: "Maximale Anzahl an Slots im Zeitraum erreicht.",
  },
  MAX_WEEK_SLOTS: {
    severity: "hard",
    title: "Wochenlimit erreicht",
    description: "Maximale Anzahl an Slots in der ISO-Woche erreicht.",
  },
  MAX_WEEKEND_SLOTS: {
    severity: "hard",
    title: "Wochenendlimit erreicht",
    description: "Maximale Anzahl an Wochenend-Slots erreicht.",
  },
  NO_DUTY_EMPLOYEE: {
    severity: "hard",
    title: "Kein Dienst",
    description: "Person ist als 'kein Dienst' markiert.",
  },
  FIXED_ONLY: {
    severity: "hard",
    title: "Nur Fixwunsch",
    description: "Person steht nur fuer Fixwunsch-Einsaetze zur Verfuegung.",
  },
  ROLE_NOT_ALLOWED: {
    severity: "hard",
    title: "Diensttyp nicht erlaubt",
    description: "Person darf fuer diesen Diensttyp nicht eingeplant werden.",
  },
  LOCKED_INVALID_EMPLOYEE: {
    severity: "hard",
    title: "Ungueltiger Lock",
    description: "Lock verweist auf nicht vorhandene Person.",
  },
  FIX_PREFERRED_CONFLICT: {
    severity: "hard",
    title: "Fixwunsch-Konflikt",
    description: "Fixwunsch kollidiert mit harten Regeln.",
  },
  NO_DUTY_PLAN_IN_PERIOD: {
    severity: "hard",
    title: "Kein Dienstplan im Zeitraum",
    description: "Kein Dienstplan im gewaehlten Zeitraum vorhanden.",
    actionHint: "Bitte zuerst den Dienstplan fuer den Zeitraum erstellen oder freigeben.",
  },
  ROOM_CLOSED: {
    severity: "hard",
    title: "Arbeitsplatz geschlossen",
    description: "Arbeitsplatz ist an diesem Tag geschlossen.",
    actionHint: "Schliessung pruefen oder alternativen Arbeitsplatz verwenden.",
  },
  LOCKED_EMPTY: {
    severity: "hard",
    title: "Leer gesperrt",
    description: "Slot ist bewusst als leer gesperrt.",
    actionHint: "Lock entfernen, falls der Slot doch besetzt werden soll.",
  },
  ABSENCE_BLOCKED: {
    severity: "hard",
    title: "Abwesenheit",
    description: "Person ist an diesem Tag abwesend.",
  },
  LONG_TERM_ABSENCE_BLOCKED: {
    severity: "hard",
    title: "Langzeitabwesenheit",
    description: "Langzeitabwesenheit blockiert die Einteilung.",
  },
  AFTER_DUTY_BLOCKED: {
    severity: "hard",
    title: "Nach-Dienst-Regel",
    description: "Nach Dienst ist keine Einteilung erlaubt (harte Regel).",
  },
  FORBIDDEN_AREA: {
    severity: "hard",
    title: "Bereich gesperrt",
    description: "Fuer diese Person ist dieser Bereich gesperrt.",
  },
  MISSING_REQUIRED_ROLE: {
    severity: "hard",
    title: "Pflicht-Besetzung fehlt",
    description: "Pflicht-Besetzung (Rolle) kann nicht erfuellt werden.",
  },
  MISSING_REQUIRED_SKILL: {
    severity: "hard",
    title: "Notwendige Qualifikation fehlt",
    description: "Notwendige Qualifikation fehlt.",
  },
  EMPLOYEE_INACTIVE: {
    severity: "hard",
    title: "Inaktiv",
    description: "Person ist im Zeitraum nicht aktiv.",
  },
  ALREADY_ASSIGNED_SAME_TIME: {
    severity: "hard",
    title: "Zeitkonflikt",
    description: "Person ist in dieser Zeit bereits eingeteilt.",
    actionHint: "Nur als bewusste Mehrfachbesetzung manuell eintragen.",
  },
  NO_ELIGIBLE_CANDIDATE: {
    severity: "hard",
    title: "Kein geeigneter Kandidat",
    description: "Kein geeigneter verfuegbarer Benutzer gefunden.",
    actionHint: "Manuelle Zuweisung pruefen oder Regeln lockern.",
  },
  ONLY_FALLBACK_CANDIDATES: {
    severity: "soft",
    title: "Nur Restkapazitaet",
    description: "Nur Restkapazitaet ausserhalb Top-3 verfuegbar.",
  },
  CONTINUITY_CONFLICT: {
    severity: "soft",
    title: "Kontinuitaetsziel verfehlt",
    description: "Kontinuitaetsziel konnte nicht eingehalten werden.",
  },
  LOW_PRIORITY_AREA_MATCH: {
    severity: "soft",
    title: "Niedrige Prioritaet",
    description: "Zuteilung in niedrig priorisierten Bereich.",
  },
  OPTIONAL_QUALIFICATION_MISSING: {
    severity: "soft",
    title: "Optionale Qualifikation fehlt",
    description: "Optionale Qualifikation nicht vorhanden.",
  },
};

export const WEEKLY_PLANNING_REASON_ORDER = [
  "NO_CANDIDATE",
  "BAN_DATE",
  "BAN_WEEKDAY",
  "CONSECUTIVE_DAY",
  "MAX_SLOTS",
  "MAX_WEEK_SLOTS",
  "MAX_WEEKEND_SLOTS",
  "NO_DUTY_EMPLOYEE",
  "FIXED_ONLY",
  "ROLE_NOT_ALLOWED",
  "LOCKED_INVALID_EMPLOYEE",
  "FIX_PREFERRED_CONFLICT",
  "NO_DUTY_PLAN_IN_PERIOD",
  "ROOM_CLOSED",
  "LOCKED_EMPTY",
  "ABSENCE_BLOCKED",
  "LONG_TERM_ABSENCE_BLOCKED",
  "AFTER_DUTY_BLOCKED",
  "FORBIDDEN_AREA",
  "MISSING_REQUIRED_ROLE",
  "MISSING_REQUIRED_SKILL",
  "EMPLOYEE_INACTIVE",
  "ALREADY_ASSIGNED_SAME_TIME",
  "NO_ELIGIBLE_CANDIDATE",
  "ONLY_FALLBACK_CANDIDATES",
  "CONTINUITY_CONFLICT",
  "LOW_PRIORITY_AREA_MATCH",
  "OPTIONAL_QUALIFICATION_MISSING",
] as const;

const toFallbackTitle = (code: string) =>
  code
    .split("_")
    .map((part) => part.toLowerCase())
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const getWeeklyPlanningReasonMeta = (
  code: string,
): WeeklyPlanningReasonMeta => {
  return (
    WEEKLY_PLANNING_REASON_MAP[code] ?? {
      severity: "hard",
      title: toFallbackTitle(code),
      description: code,
    }
  );
};

export const getWeeklyPlanningReasonLabel = (code: string): string =>
  getWeeklyPlanningReasonMeta(code).title;
