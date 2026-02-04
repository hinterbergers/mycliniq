const DIACRITIC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
  [/Ä/g, "ae"],
  [/Ö/g, "oe"],
  [/Ü/g, "ue"],
];

export const normalizeServiceLineKey = (value?: string | null): string => {
  if (!value) return "";
  let normalized = value.trim().toLowerCase();
  for (const [pattern, replacement] of DIACRITIC_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  normalized = normalized.replace(/[^a-z0-9]+/g, "");
  return normalized;
};

export const buildNormalizedServiceLineKeySet = (
  values: Iterable<string | null | undefined>,
): Set<string> => {
  const normalized = new Set<string>();
  for (const value of values) {
    const key = normalizeServiceLineKey(value);
    if (key) {
      normalized.add(key);
    }
  }
  return normalized;
};
