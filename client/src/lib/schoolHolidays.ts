export type SchoolHoliday = {
  name: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
};

export type SchoolHolidayLocation = {
  country?: string | null;
  state?: string | null;
};

type HolidayMap = Record<number, SchoolHoliday[]>;
type CountryHolidayMap = Record<string, HolidayMap>;

const SCHOOL_HOLIDAYS: Record<string, CountryHolidayMap> = {
  AT: {
    ALL: {
      2025: [
        { name: "Weihnachtsferien", start: "2024-12-24", end: "2025-01-06" },
        { name: "Semesterferien", start: "2025-02-10", end: "2025-02-15" },
        { name: "Osterferien", start: "2025-04-12", end: "2025-04-21" },
        { name: "Sommerferien", start: "2025-07-05", end: "2025-09-07" },
        { name: "Herbstferien", start: "2025-10-27", end: "2025-10-31" },
        { name: "Weihnachtsferien", start: "2025-12-24", end: "2026-01-06" }
      ],
      2026: [
        { name: "Weihnachtsferien", start: "2025-12-24", end: "2026-01-06" },
        { name: "Semesterferien", start: "2026-02-09", end: "2026-02-14" },
        { name: "Osterferien", start: "2026-03-28", end: "2026-04-06" },
        { name: "Sommerferien", start: "2026-07-04", end: "2026-09-06" },
        { name: "Herbstferien", start: "2026-10-26", end: "2026-10-31" },
        { name: "Weihnachtsferien", start: "2026-12-24", end: "2027-01-06" }
      ]
    },
    "AT-2": {
      2025: [
        { name: "Weihnachtsferien", start: "2024-12-24", end: "2025-01-06" },
        { name: "Semesterferien", start: "2025-02-10", end: "2025-02-15" },
        { name: "Osterferien", start: "2025-04-12", end: "2025-04-21" },
        { name: "Sommerferien", start: "2025-07-05", end: "2025-09-07" },
        { name: "Herbstferien", start: "2025-10-27", end: "2025-10-31" },
        { name: "Weihnachtsferien", start: "2025-12-24", end: "2026-01-06" }
      ],
      2026: [
        { name: "Weihnachtsferien", start: "2025-12-24", end: "2026-01-06" },
        { name: "Semesterferien", start: "2026-02-09", end: "2026-02-14" },
        { name: "Osterferien", start: "2026-03-28", end: "2026-04-06" },
        { name: "Sommerferien", start: "2026-07-04", end: "2026-09-06" },
        { name: "Herbstferien", start: "2026-10-26", end: "2026-10-31" },
        { name: "Weihnachtsferien", start: "2026-12-24", end: "2027-01-06" }
      ]
    }
  }
};

const normalizeCode = (value?: string | null) => (value ?? "").trim().toUpperCase();

const toDate = (value: string) => new Date(`${value}T00:00:00`);

const resolveHolidayRanges = (year: number, location?: SchoolHolidayLocation) => {
  const countryCode = normalizeCode(location?.country) || "AT";
  const stateCode = normalizeCode(location?.state);
  const country = SCHOOL_HOLIDAYS[countryCode];
  if (!country) return [];
  if (stateCode && country[stateCode]?.[year]) {
    return country[stateCode][year];
  }
  return country.ALL?.[year] ?? [];
};

export const getSchoolHoliday = (
  date: Date,
  location?: SchoolHolidayLocation
): SchoolHoliday | null => {
  const ranges = resolveHolidayRanges(date.getFullYear(), location);
  for (const range of ranges) {
    const start = toDate(range.start);
    const end = toDate(range.end);
    if (date >= start && date <= end) {
      return range;
    }
  }
  return null;
};

export const getSchoolHolidayRanges = (
  year: number,
  location?: SchoolHolidayLocation
): SchoolHoliday[] => {
  return resolveHolidayRanges(year, location);
};
