export type AbsenceCategory =
  | "Krankenstand"
  | "Pflegeurlaub"
  | "Urlaub"
  | "Fortbildung"
  | "Zeitausgleich"
  | "Ruhezeit"
  | "Sonstiges";

const normalize = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue");

export function mapAbsenceCategory(raw?: string | null): AbsenceCategory {
  const s = normalize(raw ?? "");

  if (!s) return "Sonstiges";

  // Reihenfolge ist wichtig (Pflegeurlaub vor Urlaub, etc.)
  if (s.includes("krank")) return "Krankenstand";
  if (s.includes("pflege")) return "Pflegeurlaub";
  if (s.includes("urlaub")) return "Urlaub";

  // Fortbildung: viele Varianten
  if (
    s.includes("fortbild") ||
    s.includes("schulung") ||
    s.includes("kurs") ||
    s.includes("training") ||
    s.includes("kongress")
  ) {
    return "Fortbildung";
  }

  // Zeitausgleich: ZA / Ausgleich / Zeit…
  const hasZaToken = /\b(za|z-a|z\/a)\b/.test(s);

  if (
  s.includes("zeitausgleich") ||
  hasZaToken ||
  s.includes("ausgleichstag") ||
  s.includes("ueberstunden") ||
  s.includes("überstunden") ||
  s.includes("ausgleich")
) {
  return "Zeitausgleich";
}

  // Ruhezeit
  if (s.includes("ruhe")) return "Ruhezeit";

  return "Sonstiges";
}

export const ABSENCE_CATEGORY_ORDER: AbsenceCategory[] = [
  "Krankenstand",
  "Pflegeurlaub",
  "Urlaub",
  "Fortbildung",
  "Zeitausgleich",
  "Ruhezeit",
  "Sonstiges",
];