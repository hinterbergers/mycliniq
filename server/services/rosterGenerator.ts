import OpenAI from "openai";
import type { Employee, RosterShift, Absence } from "@shared/schema";
import { format, eachDayOfInterval, isWeekend, startOfMonth, endOfMonth } from "date-fns";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type ServiceType = 'gyn' | 'kreiszimmer' | 'turnus';

interface ShiftPreferences {
  preferredDaysOff?: string[];
  maxShiftsPerWeek?: number;
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

const SERVICE_TYPES: ServiceType[] = ['gyn', 'kreiszimmer', 'turnus'];

const SERVICE_CAPABILITIES: Record<ServiceType, string[]> = {
  gyn: ["Primararzt", "1. Oberarzt", "Funktionsoberarzt", "Ausbildungsoberarzt", "Oberarzt", "Oberärztin"],
  kreiszimmer: ["Assistenzarzt", "Assistenzärztin"],
  turnus: ["Assistenzarzt", "Assistenzärztin", "Turnusarzt"]
};

function toDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isDateWithinRange(date: string, start?: string | Date | null, end?: string | Date | null): boolean {
  const target = toDate(date);
  if (!target) return false;
  const startDate = toDate(start ?? null);
  const endDate = toDate(end ?? null);
  if (startDate && target < startDate) return false;
  if (endDate && target > endDate) return false;
  return Boolean(startDate || endDate);
}

function getServiceTypesForRole(role: string): ServiceType[] {
  return SERVICE_TYPES.filter((service) => SERVICE_CAPABILITIES[service].includes(role));
}

function getServiceTypesForEmployee(employee: Employee): ServiceType[] {
  const prefs = employee.shiftPreferences as ShiftPreferences | null;
  const overrides = Array.isArray(prefs?.serviceTypeOverrides)
    ? prefs.serviceTypeOverrides.filter((value): value is ServiceType => SERVICE_TYPES.includes(value as ServiceType))
    : [];
  if (overrides.length) return overrides;
  return getServiceTypesForRole(employee.role);
}

export async function generateRosterPlan(
  employees: Employee[],
  existingAbsences: Absence[],
  year: number,
  month: number
): Promise<GenerationResult> {
  const startDate = startOfMonth(new Date(year, month - 1));
  const endDate = endOfMonth(new Date(year, month - 1));
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const activeEmployees = employees.filter(e => e.isActive && e.takesShifts !== false);

  const employeeData = activeEmployees.map(e => {
    const prefs = e.shiftPreferences as ShiftPreferences | null;
    const absenceDates = existingAbsences
      .filter(a => a.employeeId === e.id)
      .map(a => `${a.startDate} bis ${a.endDate} (${a.reason})`);
    const inactiveFrom = toDate(e.inactiveFrom);
    const inactiveUntil = toDate(e.inactiveUntil);
    if (inactiveFrom || inactiveUntil) {
      const formattedFrom = inactiveFrom ? format(inactiveFrom, 'yyyy-MM-dd') : "offen";
      const formattedUntil = inactiveUntil ? format(inactiveUntil, 'yyyy-MM-dd') : "offen";
      absenceDates.push(`Langzeitabwesenheit: ${formattedFrom} bis ${formattedUntil}`);
    }
    
    return {
      id: e.id,
      name: e.name,
      role: e.role,
      primaryArea: e.primaryDeploymentArea,
      competencies: e.competencies,
      serviceTypes: getServiceTypesForEmployee(e),
      preferredDaysOff: prefs?.preferredDaysOff || [],
      maxShiftsPerWeek: prefs?.maxShiftsPerWeek || 5,
      notes: prefs?.notes || "",
      absences: absenceDates
    };
  });

  const daysData = days.map(d => ({
    date: format(d, 'yyyy-MM-dd'),
    dayName: format(d, 'EEEE'),
    isWeekend: isWeekend(d)
  }));

  const prompt = `Du bist ein Dienstplan-Experte für eine gynäkologische Abteilung eines Krankenhauses.

Erstelle einen optimalen Dienstplan für ${format(startDate, 'MMMM yyyy')}.

## Verfügbare Mitarbeiter:
${JSON.stringify(employeeData, null, 2)}

## Zu besetzende Tage:
${JSON.stringify(daysData, null, 2)}

## Diensttypen und berechtigte Rollen:
- gyn (Gynäkologie-Dienst): Primararzt, 1. Oberarzt, Funktionsoberarzt, Ausbildungsoberarzt, Oberarzt, Oberärztin
- kreiszimmer (Kreißzimmer): Assistenzarzt, Assistenzärztin
- turnus (Turnus): Assistenzarzt, Assistenzärztin, Turnusarzt
Wenn im Mitarbeiterobjekt "serviceTypes" gesetzt sind, dürfen nur diese Diensttypen zugewiesen werden (Abweichung vom Rollenstandard).

## Regeln:
1. Jeder Tag muss einen gyn-Dienst und einen kreiszimmer-Dienst haben
2. Turnus-Dienste sind optional, aber erwünscht wenn Personal verfügbar
3. Respektiere Abwesenheiten - kein Mitarbeiter darf an Tagen eingeteilt werden, an denen er/sie abwesend ist
4. Respektiere bevorzugte freie Tage der Mitarbeiter
5. Maximale Dienste pro Woche pro Mitarbeiter beachten
6. Gleichmäßige Verteilung der Dienste anstreben
7. Wochenenden fair verteilen
8. Kompetenzen berücksichtigen für komplexe Fälle

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
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { 
          role: "system", 
          content: "Du bist ein Experte für Krankenhausdienstplanung. Antworte immer auf Deutsch und im angeforderten JSON-Format." 
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 8192
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Keine Antwort vom KI-Modell erhalten");
    }

    const result = JSON.parse(content) as GenerationResult;
    
    const validatedShifts = result.shifts.filter(shift => {
      const employee = activeEmployees.find(e => e.id === shift.employeeId);
      if (!employee) {
        console.warn(`Mitarbeiter ${shift.employeeId} nicht gefunden`);
        return false;
      }
      
      const allowed = getServiceTypesForEmployee(employee);
      if (!allowed.includes(shift.serviceType)) {
        console.warn(`${employee.name} ist nicht berechtigt für ${shift.serviceType}`);
        return false;
      }
      
      const isAbsent = existingAbsences.some(a => 
        a.employeeId === shift.employeeId &&
        a.startDate <= shift.date &&
        a.endDate >= shift.date
      );
      if (isAbsent) {
        console.warn(`${employee.name} ist am ${shift.date} abwesend`);
        return false;
      }

      const isInactive = isDateWithinRange(shift.date, employee.inactiveFrom, employee.inactiveUntil);
      if (isInactive) {
        console.warn(`${employee.name} ist am ${shift.date} langfristig deaktiviert`);
        return false;
      }
      
      return true;
    });

    return {
      shifts: validatedShifts,
      reasoning: result.reasoning || "Dienstplan erfolgreich generiert",
      warnings: result.warnings || []
    };

  } catch (error) {
    console.error("Fehler bei der Dienstplan-Generierung:", error);
    throw new Error(`Dienstplan-Generierung fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
  }
}

export async function validateShiftAssignment(
  employee: Employee,
  date: string,
  serviceType: string,
  existingAbsences: Absence[]
): Promise<{ valid: boolean; reason?: string }> {
  const allowed = getServiceTypesForEmployee(employee);
  if (!allowed.includes(serviceType as ServiceType)) {
    return { valid: false, reason: `${employee.name} ist nicht berechtigt für ${serviceType}-Dienste` };
  }

  const isAbsent = existingAbsences.some(a => 
    a.employeeId === employee.id &&
    a.startDate <= date &&
    a.endDate >= date
  );
  if (isAbsent) {
    return { valid: false, reason: `${employee.name} ist am ${date} abwesend` };
  }

  const isInactive = isDateWithinRange(date, employee.inactiveFrom, employee.inactiveUntil);
  if (isInactive) {
    return { valid: false, reason: `${employee.name} ist am ${date} langfristig deaktiviert` };
  }

  return { valid: true };
}
