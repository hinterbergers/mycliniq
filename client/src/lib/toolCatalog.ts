import {
  Baby,
  TestTube2,
  Ruler,
  Calculator,
  Scale,
  type LucideIcon,
} from "lucide-react";

export type ToolKey =
  | "pregnancy_weeks"
  | "pul_calculator"
  | "body_surface_area"
  | "bishop_score"
  | "bmi_calculator";

export type ToolCatalogEntry = {
  key: ToolKey;
  title: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  bg: string;
};

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    key: "pregnancy_weeks",
    title: "Schwangerschaftswochen-Rechner",
    shortLabel: "SSW",
    description: "SSW und ET aus letzter Periode oder ET berechnen.",
    icon: Baby,
    accent: "text-rose-600",
    bg: "bg-rose-50",
  },
  {
    key: "pul_calculator",
    title: "PUL-Rechner",
    shortLabel: "PUL",
    description: "hCG-Ratio und Verlaufstendenz berechnen.",
    icon: TestTube2,
    accent: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    key: "body_surface_area",
    title: "Körperoberflächen-Rechner",
    shortLabel: "KOF",
    description: "Körperoberfläche (Mosteller) aus Größe und Gewicht.",
    icon: Ruler,
    accent: "text-sky-600",
    bg: "bg-sky-50",
  },
  {
    key: "bishop_score",
    title: "Bishop-Score-Rechner",
    shortLabel: "Bishop",
    description: "Zervixbefund strukturiert erfassen und Bishop-Score berechnen.",
    icon: Calculator,
    accent: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    key: "bmi_calculator",
    title: "BMI-Rechner",
    shortLabel: "BMI",
    description: "Body-Mass-Index berechnen und nach WHO beurteilen.",
    icon: Scale,
    accent: "text-violet-600",
    bg: "bg-violet-50",
  },
];

export const DEFAULT_TOOL_VISIBILITY: Record<ToolKey, boolean> = {
  pregnancy_weeks: true,
  pul_calculator: true,
  body_surface_area: true,
  bishop_score: true,
  bmi_calculator: true,
};

export const DEFAULT_TOOL_SORT_ORDER: Record<ToolKey, number> = {
  pregnancy_weeks: 0,
  pul_calculator: 1,
  body_surface_area: 2,
  bishop_score: 3,
  bmi_calculator: 4,
};

export function getToolTargetUrl(key: ToolKey): string {
  return `/tools?tool=${encodeURIComponent(key)}`;
}
