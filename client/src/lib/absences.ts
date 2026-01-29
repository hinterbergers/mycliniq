// client/src/lib/absences.ts
export type AbsenceLike = {
    type?: string | null;
    kind?: string | null;
    isLongTerm?: boolean | null;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
  };
  
  const LONG_TERM_TYPES = new Set([
    "LANGZEIT",
    "LONG_TERM",
    "KARENZ",
    "BILDUNGSKARENZ",
    "MUTTERSCHUTZ",
    "LANGZEIT_KRANK",
  ]);
  
  function daysInclusive(start: Date, end: Date) {
    const ms = end.getTime() - start.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
  }
  
  export function isLongTermAbsence(a: AbsenceLike) {
    if (a.isLongTerm) return true;
  
    const t = (a.type ?? a.kind ?? "").toUpperCase().trim();
    if (t && LONG_TERM_TYPES.has(t)) return true;
  
    // Fallback über Dauer (z.B. >= 28 Tage)
    const s = new Date(a.startDate + "T00:00:00");
    const e = new Date(a.endDate + "T00:00:00");
    return daysInclusive(s, e) >= 28;
  }