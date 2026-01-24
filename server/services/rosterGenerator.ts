import OpenAI from "openai";
import crypto from "crypto";
import type * as ResponsesAPI from "openai/resources/responses/responses";
import type {
  Employee,
  Absence,
  ShiftWish,
  LongTermShiftWish,
  LongTermAbsence,
} from "@shared/schema";
import {
  SERVICE_TYPES,
  type ServiceType,
  type LongTermWishRule,
  type ServiceLineMeta,
  getServiceTypesForEmployee,
  employeeDoesShifts,
} from "@shared/shiftTypes";
import {
  format,
  eachDayOfInterval,
  isWeekend,
  startOfMonth,
  endOfMonth,
} from "date-fns";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (openaiClient) return openaiClient;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY fehlt. Setze die Umgebungsvariable, oder deaktiviere die KI-Dienstplan-Generierung.",
    );
  }

  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

interface ShiftPreferences {
  preferredDaysOff?: string[];
  maxShiftsPerWeek?: number;
  maxShiftsPerMonth?: number;
  maxWeekendShifts?: number;
  avoidWeekdays?: number[];
  preferredAreas?: string[];
  notes?: string;
  serviceTypeOverrides?: ServiceType[];
}

interface GeneratedShift {
  date: string;
  serviceType: ServiceType;
  employeeId: number;
  employeeName?: string;
}

interface AiResponsePayload {
  shifts: GeneratedShift[];
  reasoning?: string;
  warnings?: string[];
  unfilled?: Array<{
    date: string;
    serviceType: ServiceType;
    reason: string;
  }>;
  violations?: string[];
  notes?: string;
}

interface GenerationResult {
  shifts: GeneratedShift[];
  unfilled: UnfilledShift[];
  violations: string[];
  notes: string;
  aiShiftCount: number;
  normalizedShiftCount: number;
  validatedShiftCount: number;
  outputText: string;
  firstBadShiftReason: string | null;
}

interface AiRuleWeights {
  weekendFairness?: number;
  preferenceSatisfaction?: number;
  minimizeConflicts?: number;
}

interface AiRules {
  version?: number;
  hard?: string;
  soft?: string;
  weights?: AiRuleWeights;
}

const REQUIRED_SERVICE_TYPES: ServiceType[] = ["gyn", "kreiszimmer"]; // optional/best-effort: "turnus"
const DISALLOWED_SERVICE_TYPES = new Set<ServiceType>(["overduty", "long_day"]);
export const REQUIRED_SERVICE_GAP_REASON =
  "Erforderliche Dienstschiene nicht besetzt";

function toDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isDateWithinRange(
  date: string,
  start?: string | Date | null,
  end?: string | Date | null,
): boolean {
  const target = toDate(date);
  if (!target) return false;
  const startDate = toDate(start ?? null);
  const endDate = toDate(end ?? null);
  if (startDate && target < startDate) return false;
  if (endDate && target > endDate) return false;
  return Boolean(startDate || endDate);
}

const WEEKDAY_SHORT: LongTermWishRule["weekday"][] = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

function hasHardLongTermBlock(
  rules: LongTermWishRule[] | undefined,
  date: string,
  serviceType: ServiceType,
): boolean {
  if (!Array.isArray(rules) || !rules.length) return false;
  const dayIndex = new Date(date).getDay();
  const weekday = WEEKDAY_SHORT[dayIndex];
  return rules.some((rule) => {
    if (rule.strength !== "HARD") return false;
    if (rule.kind !== "ALWAYS_OFF" && rule.kind !== "AVOID_ON") return false;
    if (rule.weekday !== weekday) return false;
    const ruleService = rule.serviceType ?? "any";
    if (ruleService === "any") return true;
    return ruleService === serviceType;
  });
}

interface BuildRosterPromptParams {
  employees: Employee[];
  absences: Absence[];
  shiftWishes: ShiftWish[];
  longTermWishes: LongTermShiftWish[];
  longTermAbsences: LongTermAbsence[];
  year: number;
  month: number;
  serviceLines: ServiceLineMeta[];
  rules?: AiRules;
  promptOverride?: string;
}

interface BuildRosterPromptContext {
  activeEmployees: Employee[];
  employeeSummary: Array<{
    id: number;
    name: string;
    roleGroup: string;
    allowedServiceTypes: ServiceType[];
    limits: {
      week: number;
      month: number | null;
      weekend: number | null;
    };
    wishes: {
      preferredDates: string[];
      avoidDates: string[];
      avoidWeekdays: string[];
    };
    blockedRanges: Array<{ from: string; until: string; kind: string }>;
    hardLongTermRules: string[];
  }>;
  eligibleByServiceType: Record<ServiceType, number[]>;
  daysData: Array<{ date: string; dayName: string; isWeekend: boolean }>;
  daySummary: {
    month: string;
    daysInMonth: number;
    weekendDates: string[];
  };
  normalizedRules: {
    hard: string;
    soft: string;
    weights: {
      weekendFairness: number;
      preferenceSatisfaction: number;
      minimizeConflicts: number;
    };
  };
  longTermByEmployeeId: Map<number, LongTermShiftWish>;
  longTermAbsencesByEmployeeId: Map<number, LongTermAbsence[]>;
  serviceLineSummary: string;
  rulesSection: string;
  monthName: string;
}

interface PromptBundle {
  model: "gpt-5-mini";
  maxOutputTokens: number;
  instructions: string;
  prompt: string;
}

interface RequestPayload {
  model: string;
  instructions: string;
  input: string;
  reasoning: { effort: "low" };
  text: { format: { type: "json_object" } };
  max_output_tokens: number;
}

interface UnfilledShift {
  date: string;
  serviceType: ServiceType;
  reason: string;
  candidates: number[];
}

export interface PromptPayload {
  model: "gpt-5-mini";
  maxOutputTokens: number;
  system: string;
  prompt: string;
  promptCharCount: number;
  approxTokenHint: number;
  requestPayload: RequestPayload;
}

interface PromptContext {
  model: "gpt-5-mini";
  maxOutputTokens: number;
  instructions: string;
  input: string;
}
function buildRosterPromptContext(
  params: BuildRosterPromptParams,
): BuildRosterPromptContext {
  const {
    employees,
    absences,
    shiftWishes,
    longTermWishes,
    longTermAbsences,
    year,
    month,
    serviceLines,
    rules,
  } = params;

  const startDate = startOfMonth(new Date(year, month - 1));
  const endDate = endOfMonth(new Date(year, month - 1));
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const serviceTypeKeys = serviceLines.length
    ? serviceLines.map((line) => line.key).filter((key) => Boolean(key))
    : SERVICE_TYPES;

  const activeEmployees = employees.filter(
    (e) => e.isActive && employeeDoesShifts(e, serviceLines),
  );

  const submittedWishes = shiftWishes.filter(
    (wish) => wish.status === "Eingereicht",
  );
  const wishesByEmployeeId = new Map(
    submittedWishes.map((wish) => [wish.employeeId, wish]),
  );

  const approvedLongTerm = longTermWishes.filter(
    (wish) => wish.status === "Genehmigt",
  );
  const longTermByEmployeeId = new Map(
    approvedLongTerm.map((wish) => [wish.employeeId, wish]),
  );

  const approvedLongTermAbsences = longTermAbsences.filter(
    (absence) => absence.status === "Genehmigt",
  );
  const longTermAbsencesByEmployeeId = new Map<number, LongTermAbsence[]>();
  approvedLongTermAbsences.forEach((absence) => {
    const list = longTermAbsencesByEmployeeId.get(absence.employeeId) || [];
    list.push(absence);
    longTermAbsencesByEmployeeId.set(absence.employeeId, list);
  });

  const toServiceTypeList = (values: unknown): ServiceType[] => {
    if (!Array.isArray(values)) return [];
    return values.filter((value): value is ServiceType =>
      serviceTypeKeys.includes(value as ServiceType),
    );
  };

  const toIsoDateList = (daysList: unknown): string[] => {
    if (!Array.isArray(daysList)) return [];
    return daysList
      .map((day) => {
        if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
          return day;
        }
        if (typeof day === "number" && Number.isInteger(day)) {
          return format(new Date(year, month - 1, day), "yyyy-MM-dd");
        }
        return null;
      })
      .filter((value): value is string => Boolean(value));
  };

  const toWeekdayList = (values: unknown): string[] => {
    if (!Array.isArray(values)) return [];
    const weekdayMap = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return values
      .filter((value): value is number => Number.isInteger(value))
      .map((value) => weekdayMap[value - 1]);
  };

  const employeeSummary = activeEmployees.map((e) => {
    const prefs = e.shiftPreferences as ShiftPreferences | null;
    const wish = wishesByEmployeeId.get(e.id);
    const longTerm = longTermByEmployeeId.get(e.id);
    const absenceDates = absences
      .filter((a) => a.employeeId === e.id)
      .map((a) => `${a.startDate} bis ${a.endDate} (${a.reason})`);
    const approvedAbsences = longTermAbsencesByEmployeeId.get(e.id) || [];
    approvedAbsences.forEach((absence) => {
      absenceDates.push(
        `Langzeitabwesenheit: ${absence.startDate} bis ${absence.endDate} (${absence.reason})`,
      );
    });
    const inactiveFrom = toDate(e.inactiveFrom);
    const inactiveUntil = toDate(e.inactiveUntil);
    if (inactiveFrom || inactiveUntil) {
      const formattedFrom = inactiveFrom
        ? format(inactiveFrom, "yyyy-MM-dd")
        : "offen";
      const formattedUntil = inactiveUntil
        ? format(inactiveUntil, "yyyy-MM-dd")
        : "offen";
      absenceDates.push(
        `Langzeitabwesenheit (Legacy): ${formattedFrom} bis ${formattedUntil}`,
      );
    }

    const allowedServiceTypes = getServiceTypesForEmployee(e, serviceLines);
    const roleGroup =
      allowedServiceTypes
        .map((key) => serviceLines.find((line) => line.key === key))
        .find((line) => line?.roleGroup)?.roleGroup ?? e.role ?? "allgemein";
    const limits = {
      week:
        wish?.maxShiftsPerWeek ||
        e.maxShiftsPerWeek ||
        prefs?.maxShiftsPerWeek ||
        5,
      month: wish?.maxShiftsPerMonth || prefs?.maxShiftsPerMonth || null,
      weekend: wish?.maxWeekendShifts || prefs?.maxWeekendShifts || null,
    };
    const wishesCompact = {
      preferredDates: toIsoDateList(wish?.preferredShiftDays),
      avoidDates: toIsoDateList(wish?.avoidShiftDays),
      avoidWeekdays: toWeekdayList(wish?.avoidWeekdays),
    };
    const absenceRanges = absences
      .filter((a) => a.employeeId === e.id)
      .map((a) => ({
        from: a.startDate,
        until: a.endDate,
        kind: "absence",
      }));
    const longTermAbsenceRanges =
      (longTermAbsencesByEmployeeId.get(e.id) || []).map((absence) => ({
        from: absence.startDate,
        until: absence.endDate,
        kind: "long_term_absence",
      }));
    const legacyRange = (() => {
      const from = toDate(e.inactiveFrom);
      const until = toDate(e.inactiveUntil);
      if (!from && !until) return null;
      return {
        from: from ? format(from, "yyyy-MM-dd") : "offen",
        until: until ? format(until, "yyyy-MM-dd") : "offen",
        kind: "inactive",
      };
    })();
    const hardLongTermRules = Array.isArray(longTerm?.rules)
      ? longTerm?.rules
          .filter((rule) => rule.strength === "HARD")
          .map(
            (rule) =>
              `${rule.kind} ${rule.weekday} ${rule.serviceType ?? "any"}`,
          )
      : [];

    return {
      id: e.id,
      name: e.name,
      roleGroup,
      allowedServiceTypes,
      limits,
      wishes: wishesCompact,
      blockedRanges: [
        ...absenceRanges,
        ...longTermAbsenceRanges,
        ...(legacyRange ? [legacyRange] : []),
      ],
      hardLongTermRules,
    };
  });

  const daysData = days.map((d) => ({
    date: format(d, "yyyy-MM-dd"),
    dayName: format(d, "EEEE"),
    isWeekend: isWeekend(d),
  }));
  const eligibleByServiceType = (SERVICE_TYPES as ServiceType[]).reduce(
    (acc, type) => {
      acc[type] = [];
      return acc;
    },
    {} as Record<ServiceType, number[]>,
  );
  employeeSummary.forEach((employee) => {
    employee.allowedServiceTypes.forEach((type) => {
      if (!eligibleByServiceType[type]) {
        eligibleByServiceType[type] = [];
      }
      eligibleByServiceType[type].push(employee.id);
    });
  });
  const daySummary = {
    month: `${year}-${String(month).padStart(2, "0")}`,
    daysInMonth: days.length,
    weekendDates: days
      .filter((d) => isWeekend(d))
      .map((d) => format(d, "yyyy-MM-dd")),
  };

  const serviceLineSummary = serviceLines.length
    ? serviceLines
        .map((line) => `- ${line.key}: ${line.label}`)
        .join("\n")
    : `- gyn (Gynäkologie-Dienst)\n- kreiszimmer (Kreißzimmer)\n- turnus (Turnus)`;

  const clampWeight = (value?: number) =>
    typeof value === "number" && !Number.isNaN(value)
      ? Math.max(0, Math.min(10, value))
      : 0;

  const normalizedRules = {
    hard: rules?.hard?.trim() ?? "",
    soft: rules?.soft?.trim() ?? "",
    weights: {
      weekendFairness: clampWeight(rules?.weights?.weekendFairness),
      preferenceSatisfaction: clampWeight(rules?.weights?.preferenceSatisfaction),
      minimizeConflicts: clampWeight(rules?.weights?.minimizeConflicts),
    },
  };

  const rulesSection = `## KI-Regelwerk
### HARD RULES
${normalizedRules.hard || "- Keine harten Regeln definiert -"}
### SOFT RULES
${normalizedRules.soft || "- Keine weichen Regeln definiert -"}
### WEIGHTS
${JSON.stringify(normalizedRules.weights, null, 2)}
`;

  const monthName = format(startDate, "MMMM yyyy");

  return {
    activeEmployees,
    employeeSummary,
    daysData,
    daySummary,
    eligibleByServiceType,
    normalizedRules,
    longTermByEmployeeId,
    longTermAbsencesByEmployeeId,
    serviceLineSummary,
    rulesSection,
    monthName,
  };
}

function buildPromptBundle(
  context: BuildRosterPromptContext,
  promptOverride?: string,
): PromptBundle {
  const {
    employeeSummary,
    daySummary,
    serviceLineSummary,
    rulesSection,
    monthName,
    eligibleByServiceType,
  } = context;

  const prompt = promptOverride?.trim()
    ? promptOverride
    : `Du bist ein Dienstplan-Experte für eine gynäkologische Abteilung eines Krankenhauses.

Erstelle einen optimalen Dienstplan für ${monthName}.

## Monat
- Monat: ${daySummary.month}
- Tage im Monat: ${daySummary.daysInMonth}
- Wochenenden: ${JSON.stringify(daySummary.weekendDates, null, 2)}

## Mitarbeiter (kompakt):
${JSON.stringify(employeeSummary, null, 2)}

## Dienstschienen:
Pflichtdienste pro Tag: gyn + kreiszimmer (je 1). Turnus ist optional; wenn unbesetzt, markiere ihn in „unfilled“.
${serviceLineSummary}
Wenn im Mitarbeiterobjekt "serviceTypes" gesetzt sind, dürfen nur diese Dienstschienen zugewiesen werden.
## Kandidaten je Diensttyp:
${JSON.stringify(context.eligibleByServiceType, null, 2)}
Beachte in den Mitarbeiterdaten:
- preferredWeekendDays (Datumsliste für Wochenendwünsche in ${monthName})
- avoidDays (nicht mögliche Tage in ${monthName})
- avoidWeekdays berücksichtigen (Wochentage vermeiden, z. B. Mon, Tue)
- preferredServiceTypes / avoidServiceTypes
- maxShiftsPerWeek / maxShiftsPerMonth / maxWeekendShifts
- longTermRules: wiederkehrende Regeln mit kind/weekday/strength/serviceType (serviceType optional oder "any")

## Regeln:
1. Jeder Tag muss gyn & kreiszimmer besetzen; turnus ist best-effort, markiere fehlende Slots unter „unfilled“.
2. Für jeden Dienst darf nur aus eligibleByServiceType[serviceType] gewählt werden.
2. Optionale Dienstschienen nur besetzen, wenn Personal verfügbar
3. Respektiere Abwesenheiten - kein Mitarbeiter darf an Tagen eingeteilt werden, an denen er/sie abwesend ist
4. Respektiere longTermRules mit strength=HARD (ALWAYS_OFF oder AVOID_ON) als harte Sperre
5. preferredWeekendDays möglichst berücksichtigen, avoidDays möglichst vermeiden
6. avoidWeekdays berücksichtigen (keine Einteilung an diesen Wochentagen)
7. preferredServiceTypes bevorzugen, avoidServiceTypes möglichst vermeiden
8. Maximale Dienste pro Woche und Monat pro Mitarbeiter beachten
9. Maximale Wochenenddienste beachten
10. Gleichmäßige Verteilung der Dienste anstreben
11. Wochenenden fair verteilen
12. Kompetenzen berücksichtigen für komplexe Fälle

Antworte mit folgendem JSON-Format:
{
  "shifts": [ ... ],
  "unfilled": [
    {"date":"2026-03-15","serviceType":"gyn","reason":"Keine freie Person","candidates":[1,4]}
  ],
  "violations": ["Beschreibung von Regelverletzungen"],
  "notes": "Zusätzliche Hinweise"
}
Bevorzugt employeeId; alternative Schlüssel staffId / employee_id / staff_id sind weiterhin gültig.
${rulesSection}`;

  const system =
    "Du bist ein Experte für Krankenhausdienstplanung. Antworte immer auf Deutsch und im angeforderten JSON-Format. Keine langen Texte, notes max 10 Zeilen.";

  return {
    model: "gpt-5-mini",
    maxOutputTokens: 4000,
    instructions: system,
    prompt,
  };
}

function buildPromptContext(
  params: BuildRosterPromptParams,
): PromptContext {
  const context = buildRosterPromptContext(params);
  const bundle = buildPromptBundle(context, params.promptOverride);
  return {
    model: bundle.model,
    maxOutputTokens: bundle.maxOutputTokens,
    instructions: bundle.instructions,
    input: bundle.prompt,
  };
}

export function buildRosterPromptPayload(
  params: BuildRosterPromptParams,
): PromptPayload {
  const promptContext = buildPromptContext(params);

  const promptCharCount = promptContext.input.length;
  const approxTokenHint = Math.ceil(promptCharCount / 4);

  return {
    model: promptContext.model,
    maxOutputTokens: promptContext.maxOutputTokens,
    system: promptContext.instructions,
    prompt: promptContext.input,
    promptCharCount,
    approxTokenHint,
    requestPayload: {
      model: promptContext.model,
      instructions: promptContext.instructions,
      input: promptContext.input,
      reasoning: { effort: "low" },
      text: { format: { type: "json_object" } },
      max_output_tokens: promptContext.maxOutputTokens,
    },
  };
}

function normalizeShift(
  shift: any,
): GeneratedShift | null {
  if (!shift || typeof shift !== "object") return null;
  const date = typeof shift.date === "string" ? shift.date : null;
  const serviceType =
    typeof shift.serviceType === "string"
      ? shift.serviceType
      : typeof shift.service_type === "string"
      ? shift.service_type
      : null;
  const employeeId =
    typeof shift.employeeId === "number"
      ? shift.employeeId
      : typeof shift.employee_id === "number"
      ? shift.employee_id
      : typeof shift.staffId === "number"
      ? shift.staffId
      : typeof shift.staff_id === "number"
      ? shift.staff_id
      : null;
  if (!date || !serviceType || !employeeId) return null;
  return {
    date,
    serviceType,
    employeeId,
    employeeName:
      typeof shift.employeeName === "string"
        ? shift.employeeName
        : typeof shift.employee_name === "string"
        ? shift.employee_name
        : undefined,
  };
}

function extractResponseText(
  response: ResponsesAPI.Response,
): string {
  const textOutput = (response.output_text ?? "").trim();
  if (textOutput) return textOutput;

  const messages = response.output ?? [];
  for (const item of messages) {
    if (!item || typeof item !== "object" || !("content" in item)) continue;
    const contents = (item as { content?: unknown[] }).content;
    if (!Array.isArray(contents)) continue;
    for (const contentItem of contents) {
      const item = contentItem as any;
      if (typeof item?.text === "string") {
        return item.text.trim();
      }
    }
  }
  return "";
}

export async function generateRosterPlan(
  employees: Employee[],
  existingAbsences: Absence[],
  year: number,
  month: number,
  shiftWishes: ShiftWish[] = [],
  longTermWishes: LongTermShiftWish[] = [],
  longTermAbsences: LongTermAbsence[] = [],
  serviceLines: ServiceLineMeta[] = [],
  rules?: AiRules,
  options?: { promptOverride?: string },
): Promise<GenerationResult> {
  const context = buildRosterPromptContext({
    employees,
    absences: existingAbsences,
    shiftWishes,
    longTermWishes,
    longTermAbsences,
    year,
    month,
    serviceLines,
    rules,
  });
  const promptContext = buildPromptContext({
    employees,
    absences: existingAbsences,
    shiftWishes,
    longTermWishes,
    longTermAbsences,
    year,
    month,
    serviceLines,
    rules,
    promptOverride: options?.promptOverride,
  });

  const {
    activeEmployees,
    longTermByEmployeeId,
    longTermAbsencesByEmployeeId,
  } = context;
  const { maxOutputTokens, model, instructions, input: prompt } = promptContext;
  const requestPayload: RequestPayload = {
    model,
    instructions,
    input: prompt,
    reasoning: { effort: "low" },
    text: { format: { type: "json_object" } },
    max_output_tokens: maxOutputTokens,
  };

  try {
    const createResponse = (maxTokens: number) =>
      getOpenAIClient().responses.create({
        ...requestPayload,
        max_output_tokens: maxTokens,
      });

    let response = await createResponse(1500);
    let outputText = extractResponseText(response);
    if (response.status === "incomplete" || !outputText) {
      response = await createResponse(8000);
      outputText = extractResponseText(response);
    }

    if (!outputText) {
      const reason = response?.incomplete_details?.reason
        ? `: ${response.incomplete_details.reason}`
        : "";
      throw new Error(
        `KI-Output zu kurz/leer (status=${response.status}${reason})`,
      );
    }

    const resultRaw = JSON.parse(outputText) as AiResponsePayload;
    const rawShifts = Array.isArray(resultRaw.shifts) ? resultRaw.shifts : [];
    const normalizedShifts = rawShifts
      .map(normalizeShift)
      .filter((shift): shift is GeneratedShift => Boolean(shift))
      .filter((shift) => !DISALLOWED_SERVICE_TYPES.has(shift.serviceType));
    const rawShiftCount = rawShifts.length;
    const normalizedShiftCount = normalizedShifts.length;

    const removalCounters = {
      missingEmployee: 0,
      notAllowedServiceType: 0,
      absent: 0,
      longTermAbsent: 0,
      legacyInactive: 0,
      hardLongTermRule: 0,
    };

    const unfilled: UnfilledShift[] = [];
    const addUnfilled = (
      shift: GeneratedShift,
      reason: string,
      candidates: number[] = [],
    ) => {
      unfilled.push({
        date: shift.date,
        serviceType: shift.serviceType,
        reason,
        candidates,
      });
    };

    const validatedShifts = normalizedShifts.filter((shift) => {
      const employee = activeEmployees.find((e) => e.id === shift.employeeId);
      if (!employee) {
        removalCounters.missingEmployee += 1;
        console.warn(`Mitarbeiter ${shift.employeeId} nicht gefunden`);
        addUnfilled(shift, "Mitarbeiter nicht gefunden");
        return false;
      }

      const allowed = getServiceTypesForEmployee(employee, serviceLines);
      if (!allowed.includes(shift.serviceType)) {
        removalCounters.notAllowedServiceType += 1;
        console.warn(
          `${employee.name} ist nicht berechtigt für ${shift.serviceType}`,
        );
        addUnfilled(shift, "Nicht berechtigte Dienstschiene");
        return false;
      }

      const isAbsent = existingAbsences.some(
        (a) =>
          a.employeeId === shift.employeeId &&
          a.startDate <= shift.date &&
          a.endDate >= shift.date,
      );
      if (isAbsent) {
        removalCounters.absent += 1;
        console.warn(`${employee.name} ist am ${shift.date} abwesend`);
        addUnfilled(shift, "Abwesenheit");
        return false;
      }
      const longTermBlocks =
        longTermAbsencesByEmployeeId.get(employee.id) || [];
      const isLongTermAbsent = longTermBlocks.some((absence) =>
        isDateWithinRange(shift.date, absence.startDate, absence.endDate),
      );
      if (isLongTermAbsent) {
        removalCounters.longTermAbsent += 1;
        console.warn(
          `${employee.name} ist am ${shift.date} langfristig abwesend`,
        );
        addUnfilled(shift, "Langzeitabwesenheit");
        return false;
      }
      const isLegacyInactive = isDateWithinRange(
        shift.date,
        employee.inactiveFrom,
        employee.inactiveUntil,
      );
      if (isLegacyInactive) {
        removalCounters.legacyInactive += 1;
        console.warn(
          `${employee.name} ist am ${shift.date} langfristig deaktiviert (Legacy)`,
        );
        addUnfilled(shift, "Legacy-Deaktivierung");
        return false;
      }

      const longTermRules = longTermByEmployeeId.get(employee.id)?.rules as
        | LongTermWishRule[]
        | undefined;
      if (hasHardLongTermBlock(longTermRules, shift.date, shift.serviceType)) {
        removalCounters.hardLongTermRule += 1;
        console.warn(
          `${employee.name} ist laut Langfristregel am ${shift.date} gesperrt`,
        );
        addUnfilled(shift, "Langfristregel (HARD)");
        return false;
      }

      return true;
    });

    const coverageByDate = new Map<string, Set<ServiceType>>();
    validatedShifts.forEach((shift) => {
      const set = coverageByDate.get(shift.date) || new Set<ServiceType>();
      set.add(shift.serviceType);
      coverageByDate.set(shift.date, set);
    });
    const monthInterval = eachDayOfInterval({
      start: startOfMonth(new Date(year, month - 1)),
      end: endOfMonth(new Date(year, month - 1)),
    });
    for (const day of monthInterval) {
      const date = format(day, "yyyy-MM-dd");
      const covered = coverageByDate.get(date) ?? new Set<ServiceType>();
      for (const requiredType of REQUIRED_SERVICE_TYPES) {
        if (!covered.has(requiredType)) {
          unfilled.push({
            date,
            serviceType: requiredType,
            reason: REQUIRED_SERVICE_GAP_REASON,
            candidates: [],
          });
        }
      }
    }

    const violations = Array.isArray(resultRaw.violations)
      ? [...resultRaw.violations]
      : [];
    const warningExtra = Array.isArray(resultRaw.warnings)
      ? resultRaw.warnings.filter((item): item is string => typeof item === "string")
      : [];
    violations.push(...warningExtra);
    const unfilledFromResult = Array.isArray(resultRaw.unfilled)
      ? resultRaw.unfilled
          .filter(
            (item): item is UnfilledShift =>
              Boolean(item && item.date && item.serviceType && item.reason),
          )
        .map((item) => ({
          date: item.date,
          serviceType: item.serviceType,
          reason: item.reason,
          candidates: Array.isArray(item.candidates)
            ? item.candidates.filter((id): id is number => typeof id === "number")
            : [],
        }))
      : [];
    const allUnfilled = [...unfilled, ...unfilledFromResult];
    const firstBadShiftReason = allUnfilled[0]?.reason ?? null;
    if (rawShiftCount > 0 && validatedShifts.length === 0) {
      const removalSummary = Object.entries(removalCounters)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => `${key}=${count}`)
        .join(",");
      violations.push(
        `WARN: Alle KI-Zuweisungen wurden durch Validierung entfernt. raw=${rawShiftCount}, removed=${removalSummary}`,
      );
      if (process.env.ROSTER_PROMPT_PREVIEW === "1") {
        violations.push(
          `PREVIEW_COUNTERS:${JSON.stringify(removalCounters)}`,
        );
      }
    }

    return {
      shifts: validatedShifts,
      unfilled: allUnfilled,
      violations,
      notes:
        typeof resultRaw.notes === "string"
          ? resultRaw.notes
          : resultRaw.reasoning || "Dienstplan erfolgreich generiert",
      aiShiftCount: rawShiftCount,
      normalizedShiftCount,
      validatedShiftCount: validatedShifts.length,
      outputText,
      firstBadShiftReason,
    };
  } catch (error) {
    console.error("Fehler bei der Dienstplan-Generierung:", error);
    throw new Error(
      `Dienstplan-Generierung fehlgeschlagen: ${
        error instanceof Error ? error.message : "Unbekannter Fehler"
      }`,
    );
  }
}
export async function validateShiftAssignment(
  employee: Employee,
  date: string,
  serviceType: string,
  existingAbsences: Absence[],
  longTermRules: LongTermWishRule[] = [],
  longTermAbsences: LongTermAbsence[] = [],
  serviceLines: ServiceLineMeta[] = [],
): Promise<{ valid: boolean; reason?: string }> {
  const allowed = getServiceTypesForEmployee(employee, serviceLines);
  if (!allowed.includes(serviceType as ServiceType)) {
    return {
      valid: false,
      reason: `${employee.name} ist nicht berechtigt für ${serviceType}-Dienste`,
    };
  }

  const isAbsent = existingAbsences.some(
    (a) =>
      a.employeeId === employee.id && a.startDate <= date && a.endDate >= date,
  );
  if (isAbsent) {
    return { valid: false, reason: `${employee.name} ist am ${date} abwesend` };
  }

  const isLongTermAbsent = longTermAbsences.some(
    (absence) =>
      absence.employeeId === employee.id &&
      isDateWithinRange(date, absence.startDate, absence.endDate),
  );
  if (isLongTermAbsent) {
    return {
      valid: false,
      reason: `${employee.name} ist am ${date} langfristig abwesend`,
    };
  }

  const isLegacyInactive = isDateWithinRange(
    date,
    employee.inactiveFrom,
    employee.inactiveUntil,
  );
  if (isLegacyInactive) {
    return {
      valid: false,
      reason: `${employee.name} ist am ${date} langfristig deaktiviert`,
    };
  }

  if (hasHardLongTermBlock(longTermRules, date, serviceType as ServiceType)) {
    return {
      valid: false,
      reason: `${employee.name} ist laut Langfristregel am ${date} gesperrt`,
    };
  }

  return { valid: true };
}
