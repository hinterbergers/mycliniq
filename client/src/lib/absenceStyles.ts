import type { CSSProperties } from "react";

export type AbsenceVisualKey =
  | "Krankenstand"
  | "Pflegeurlaub"
  | "Urlaub"
  | "Sonderurlaub"
  | "Gebuehrenurlaub"
  | "Zusatzurlaub"
  | "Fortbildung"
  | "Zeitausgleich"
  | "Ruhezeit"
  | "Karenz"
  | "Quarantaene"
  | "Sonstiges";

type AbsenceVisualMeta = {
  key: AbsenceVisualKey;
  label: string;
  shortLabel: string;
  sortOrder: number;
  bgHex: string;
  borderHex: string;
  textHex: string;
};

const ABSENCE_VISUAL_META: Record<AbsenceVisualKey, AbsenceVisualMeta> = {
  Krankenstand: {
    key: "Krankenstand",
    label: "Krankenstand",
    shortLabel: "KS",
    sortOrder: 10,
    bgHex: "#fecaca",
    borderHex: "#fca5a5",
    textHex: "#991b1b",
  },
  Pflegeurlaub: {
    key: "Pflegeurlaub",
    label: "Pflegeurlaub",
    shortLabel: "KPU",
    sortOrder: 20,
    bgHex: "#fed7aa",
    borderHex: "#fdba74",
    textHex: "#9a3412",
  },
  Urlaub: {
    key: "Urlaub",
    label: "Urlaub",
    shortLabel: "U",
    sortOrder: 30,
    bgHex: "#dcfce7",
    borderHex: "#86efac",
    textHex: "#166534",
  },
  Sonderurlaub: {
    key: "Sonderurlaub",
    label: "Sonderurlaub",
    shortLabel: "SU",
    sortOrder: 40,
    bgHex: "#ede9fe",
    borderHex: "#c4b5fd",
    textHex: "#5b21b6",
  },
  Gebuehrenurlaub: {
    key: "Gebuehrenurlaub",
    label: "Gebührenurlaub",
    shortLabel: "GU",
    sortOrder: 50,
    bgHex: "#ecfccb",
    borderHex: "#bef264",
    textHex: "#3f6212",
  },
  Zusatzurlaub: {
    key: "Zusatzurlaub",
    label: "Zusatzurlaub",
    shortLabel: "ZU",
    sortOrder: 60,
    bgHex: "#cffafe",
    borderHex: "#67e8f9",
    textHex: "#155e75",
  },
  Fortbildung: {
    key: "Fortbildung",
    label: "Fortbildung",
    shortLabel: "FB",
    sortOrder: 70,
    bgHex: "#bae6fd",
    borderHex: "#7dd3fc",
    textHex: "#075985",
  },
  Zeitausgleich: {
    key: "Zeitausgleich",
    label: "Zeitausgleich",
    shortLabel: "ZA",
    sortOrder: 80,
    bgHex: "#fefc7a",
    borderHex: "#fde047",
    textHex: "#854d0e",
  },
  Ruhezeit: {
    key: "Ruhezeit",
    label: "Ruhezeit",
    shortLabel: "RZ",
    sortOrder: 90,
    bgHex: "#4ade80",
    borderHex: "#22c55e",
    textHex: "#14532d",
  },
  Karenz: {
    key: "Karenz",
    label: "Karenz",
    shortLabel: "K",
    sortOrder: 100,
    bgHex: "#c4b5fd",
    borderHex: "#a78bfa",
    textHex: "#4c1d95",
  },
  Quarantaene: {
    key: "Quarantaene",
    label: "Quarantäne",
    shortLabel: "Q",
    sortOrder: 110,
    bgHex: "#fbcfe8",
    borderHex: "#f9a8d4",
    textHex: "#9d174d",
  },
  Sonstiges: {
    key: "Sonstiges",
    label: "Sonstiges",
    shortLabel: "A",
    sortOrder: 120,
    bgHex: "#e2e8f0",
    borderHex: "#cbd5e1",
    textHex: "#334155",
  },
};

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue");

export const normalizeAbsenceReason = (reason?: string | null): AbsenceVisualKey => {
  const normalized = normalize(reason ?? "");
  if (!normalized) return "Sonstiges";

  if (normalized.includes("krank")) return "Krankenstand";
  if (normalized.includes("pflege") || normalized.includes("kpu")) {
    return "Pflegeurlaub";
  }
  if (normalized.includes("sonder")) return "Sonderurlaub";
  if (normalized.includes("gebuehr")) return "Gebuehrenurlaub";
  if (normalized.includes("zusatz")) return "Zusatzurlaub";
  if (normalized.includes("karenz") || normalized.includes("eltern")) {
    return "Karenz";
  }
  if (
    normalized.includes("fortbild") ||
    normalized.includes("schulung") ||
    normalized.includes("kurs") ||
    normalized.includes("training") ||
    normalized.includes("kongress")
  ) {
    return "Fortbildung";
  }
  if (normalized.includes("quarantaene") || normalized.includes("quarantane")) {
    return "Quarantaene";
  }
  if (
    normalized.includes("zeitausgleich") ||
    normalized.includes("ausgleich") ||
    normalized.includes("ueberstunden") ||
    normalized.includes("uberstunden") ||
    /\b(za|z-a|z\/a)\b/.test(normalized)
  ) {
    return "Zeitausgleich";
  }
  if (normalized.includes("ruhe") || /\brz\b/.test(normalized)) {
    return "Ruhezeit";
  }
  if (normalized.includes("urlaub")) return "Urlaub";
  return "Sonstiges";
};

export const getAbsenceVisualMeta = (reason?: string | null): AbsenceVisualMeta =>
  ABSENCE_VISUAL_META[normalizeAbsenceReason(reason)];

export const compareAbsenceReasons = (
  left?: string | null,
  right?: string | null,
) => {
  const leftMeta = getAbsenceVisualMeta(left);
  const rightMeta = getAbsenceVisualMeta(right);
  if (leftMeta.sortOrder !== rightMeta.sortOrder) {
    return leftMeta.sortOrder - rightMeta.sortOrder;
  }
  return leftMeta.label.localeCompare(rightMeta.label, "de");
};

export const compareAbsenceEntriesByReasonThenName = (
  leftReason: string | null | undefined,
  leftName: string | null | undefined,
  rightReason: string | null | undefined,
  rightName: string | null | undefined,
) => {
  const reasonCompare = compareAbsenceReasons(leftReason, rightReason);
  if (reasonCompare !== 0) return reasonCompare;
  return (leftName ?? "").localeCompare(rightName ?? "", "de");
};

export const getAbsenceInlineStyle = (
  reason?: string | null,
): CSSProperties => {
  const meta = getAbsenceVisualMeta(reason);
  return {
    backgroundColor: meta.bgHex,
    borderColor: meta.borderHex,
    color: meta.textHex,
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
  };
};

