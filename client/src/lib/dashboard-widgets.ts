export type DashboardWidgetKey =
  | "week_preview"
  | "attendance"
  | "birthday"
  | "documents"
  | "sops_new"
  | "favorites"
  | "absences";

export type DashboardWidgetDefinition = {
  key: DashboardWidgetKey;
  label: string;
  defaultEnabled: boolean;
};

export const DASHBOARD_WIDGETS: DashboardWidgetDefinition[] = [
  { key: "week_preview", label: "Wochenvorschau", defaultEnabled: true },
  { key: "attendance", label: "Heute anwesend", defaultEnabled: true },
  { key: "birthday", label: "Geburtstag", defaultEnabled: true },
  { key: "documents", label: "Neue Dokumente", defaultEnabled: true },
  { key: "sops_new", label: "Neue SOPs", defaultEnabled: true },
  { key: "favorites", label: "Favoriten", defaultEnabled: true },
  { key: "absences", label: "Fehlende Einträge", defaultEnabled: false },
];

export const DEFAULT_ENABLED_WIDGETS = new Set(
  DASHBOARD_WIDGETS.filter((widget) => widget.defaultEnabled).map(
    (widget) => widget.key,
  ),
);
