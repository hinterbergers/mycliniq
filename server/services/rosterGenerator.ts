import OpenAI from "openai";
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
  employeeName: string;
}

interface GenerationResult {
  shifts: GeneratedShift[];
  reasoning: string;
  warnings: string[];
}

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

export async function generateRosterPlan(
  employees: Employee[],
  existingAbsences: Absence[],
  year: number,
  month: number,
  shiftWishes: ShiftWish[] = [],
  longTermWishes: LongTermShiftWish[] = [],
  longTermAbsences: LongTermAbsence[] = [],
  serviceLines: ServiceLineMeta[] = [],
): Promise<GenerationResult> {
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
      .filter((day): day is number => Number.isInteger(day))
      .map((day) => format(new Date(year, month - 1, day), "yyyy-MM-dd"));
  };

  const toWeekdayList = (values: unknown): string[] => {
    if (!Array.isArray(values)) return [];
    const weekdayMap = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return values
      .filter((value): value is number => Number.isInteger(value))
      .map((value) => weekdayMap[value - 1])
      .filter((value): value is string => Boolean(value));
  };

  const employeeData = activeEmployees.map((e) => {
    const prefs = e.shiftPreferences as ShiftPreferences | null;
    const wish = wishesByEmployeeId.get(e.id);
    const longTerm = longTermByEmployeeId.get(e.id);
    const absenceDates = existingAbsences
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

    return {
      id: e.id,
      name: e.name,
      role: e.role,
      primaryArea: e.primaryDeploymentArea,
      competencies: e.competencies,
      serviceTypes: getServiceTypesForEmployee(e, serviceLines),
      preferredDays: toIsoDateList(wish?.preferredShiftDays),
      preferredWeekendDays: toIsoDateList(wish?.preferredShiftDays),
      avoidDays: toIsoDateList(wish?.avoidShiftDays),
      avoidWeekdays: toWeekdayList(wish?.avoidWeekdays),
      preferredServiceTypes: toServiceTypeList(wish?.preferredServiceTypes),
      avoidServiceTypes: toServiceTypeList(wish?.avoidServiceTypes),
      maxShiftsPerWeek:
        wish?.maxShiftsPerWeek ||
        e.maxShiftsPerWeek ||
        prefs?.maxShiftsPerWeek ||
        5,
      maxShiftsPerMonth:
        wish?.maxShiftsPerMonth || prefs?.maxShiftsPerMonth || null,
      maxWeekendShifts:
        wish?.maxWeekendShifts || prefs?.maxWeekendShifts || null,
      notes: wish?.notes || prefs?.notes || "",
      longTermRules: Array.isArray(longTerm?.rules) ? longTerm?.rules : [],
      absences: absenceDates,
    };
  });

  const daysData = days.map((d) => ({
    date: format(d, "yyyy-MM-dd"),
    dayName: format(d, "EEEE"),
    isWeekend: isWeekend(d),
  }));

  const serviceLineSummary = serviceLines.length
    ? serviceLines.map((line) => `- ${line.key}: ${line.label}`).join("\n")
    : `- gyn (Gynäkologie-Dienst)\n- kreiszimmer (Kreißzimmer)\n- turnus (Turnus)`;

  const prompt = `Du bist ein Dienstplan-Experte für eine gynäkologische Abteilung eines Krankenhauses.

Erstelle einen optimalen Dienstplan für ${format(startDate, "MMMM yyyy")}.

## Verfügbare Mitarbeiter:
${JSON.stringify(employeeData, null, 2)}

## Zu besetzende Tage:
${JSON.stringify(daysData, null, 2)}

## Dienstschienen:
${serviceLineSummary}
Wenn im Mitarbeiterobjekt "serviceTypes" gesetzt sind, dürfen nur diese Dienstschienen zugewiesen werden.
Beachte in den Mitarbeiterdaten:
- preferredWeekendDays (Datumsliste für Wochenendwünsche in ${format(startDate, "MMMM yyyy")})
- avoidDays (nicht mögliche Tage in ${format(startDate, "MMMM yyyy")})
- avoidWeekdays (Wochentage vermeiden, z. B. Mon, Tue)
- preferredServiceTypes / avoidServiceTypes
- maxShiftsPerWeek / maxShiftsPerMonth / maxWeekendShifts
- longTermRules: wiederkehrende Regeln mit kind/weekday/strength/serviceType (serviceType optional oder "any")

## Regeln:
1. Jeder Tag muss alle Pflicht-Dienstschienen besetzen (falls ServiceLines dafür vorhanden sind)
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
  "shifts": [
    {"date": "2026-01-01", "serviceType": "gyn", "employeeId": 1, "employeeName": "Dr. Name"},
    ...
  ],
  "reasoning": "Kurze Erklärung der Planungsentscheidungen",
  "warnings": ["Liste von Warnungen oder Konflikten"]
}`;

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content:
            "Du bist ein Experte für Krankenhausdienstplanung. Antworte immer auf Deutsch und im angeforderten JSON-Format.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 8192,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Keine Antwort vom KI-Modell erhalten");
    }

    const result = JSON.parse(content) as GenerationResult;

    const validatedShifts = result.shifts.filter((shift) => {
      const employee = activeEmployees.find((e) => e.id === shift.employeeId);
      if (!employee) {
        console.warn(`Mitarbeiter ${shift.employeeId} nicht gefunden`);
        return false;
      }

      const allowed = getServiceTypesForEmployee(employee, serviceLines);
      if (!allowed.includes(shift.serviceType)) {
        console.warn(
          `${employee.name} ist nicht berechtigt für ${shift.serviceType}`,
        );
        return false;
      }

      const isAbsent = existingAbsences.some(
        (a) =>
          a.employeeId === shift.employeeId &&
          a.startDate <= shift.date &&
          a.endDate >= shift.date,
      );
      if (isAbsent) {
        console.warn(`${employee.name} ist am ${shift.date} abwesend`);
        return false;
      }
      const longTermBlocks =
        longTermAbsencesByEmployeeId.get(employee.id) || [];
      const isLongTermAbsent = longTermBlocks.some((absence) =>
        isDateWithinRange(shift.date, absence.startDate, absence.endDate),
      );
      if (isLongTermAbsent) {
        console.warn(
          `${employee.name} ist am ${shift.date} langfristig abwesend`,
        );
        return false;
      }
      const isLegacyInactive = isDateWithinRange(
        shift.date,
        employee.inactiveFrom,
        employee.inactiveUntil,
      );
      if (isLegacyInactive) {
        console.warn(
          `${employee.name} ist am ${shift.date} langfristig deaktiviert (Legacy)`,
        );
        return false;
      }

      const longTermRules = longTermByEmployeeId.get(employee.id)?.rules as
        | LongTermWishRule[]
        | undefined;
      if (hasHardLongTermBlock(longTermRules, shift.date, shift.serviceType)) {
        console.warn(
          `${employee.name} ist laut Langfristregel am ${shift.date} gesperrt`,
        );
        return false;
      }

      return true;
    });

    return {
      shifts: validatedShifts,
      reasoning: result.reasoning || "Dienstplan erfolgreich generiert",
      warnings: result.warnings || [],
    };
  } catch (error) {
    console.error("Fehler bei der Dienstplan-Generierung:", error);
    throw new Error(
      `Dienstplan-Generierung fehlgeschlagen: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`,
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
