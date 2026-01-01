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

const AT_COMMON_2025: SchoolHoliday[] = [
  { name: "Weihnachtsferien", start: "2024-12-23", end: "2025-01-06" },
  { name: "Osterferien", start: "2025-04-12", end: "2025-04-21" },
  { name: "Pfingstferien", start: "2025-06-07", end: "2025-06-09" },
  { name: "Herbstferien", start: "2025-10-27", end: "2025-10-31" },
  { name: "Weihnachtsferien", start: "2025-12-24", end: "2026-01-06" }
];

const AT_COMMON_2026: SchoolHoliday[] = [
  { name: "Weihnachtsferien", start: "2025-12-24", end: "2026-01-06" },
  { name: "Osterferien", start: "2026-03-28", end: "2026-04-06" },
  { name: "Pfingstferien", start: "2026-05-23", end: "2026-05-25" }
];

const AT_SEMESTER_2025_WIEN_NOE: SchoolHoliday = {
  name: "Semesterferien",
  start: "2025-02-03",
  end: "2025-02-08"
};
const AT_SEMESTER_2025_BURGENLAND_GROUP: SchoolHoliday = {
  name: "Semesterferien",
  start: "2025-02-10",
  end: "2025-02-15"
};
const AT_SEMESTER_2025_OOE_STEIERMARK: SchoolHoliday = {
  name: "Semesterferien",
  start: "2025-02-17",
  end: "2025-02-22"
};

const AT_SEMESTER_2026_WIEN_NOE: SchoolHoliday = {
  name: "Semesterferien",
  start: "2026-02-02",
  end: "2026-02-07"
};
const AT_SEMESTER_2026_BURGENLAND_GROUP: SchoolHoliday = {
  name: "Semesterferien",
  start: "2026-02-09",
  end: "2026-02-14"
};
const AT_SEMESTER_2026_OOE_STEIERMARK: SchoolHoliday = {
  name: "Semesterferien",
  start: "2026-02-16",
  end: "2026-02-21"
};

const AT_SUMMER_2025_EAST: SchoolHoliday = {
  name: "Sommerferien",
  start: "2025-06-28",
  end: "2025-08-31"
};
const AT_SUMMER_2025_WEST: SchoolHoliday = {
  name: "Sommerferien",
  start: "2025-07-05",
  end: "2025-09-07"
};

const AT_SUMMER_2026_EAST: SchoolHoliday = {
  name: "Sommerferien",
  start: "2026-07-04",
  end: "2026-09-06"
};
const AT_SUMMER_2026_WEST: SchoolHoliday = {
  name: "Sommerferien",
  start: "2026-07-11",
  end: "2026-09-13"
};

const SCHOOL_HOLIDAYS: Record<string, CountryHolidayMap> = {
  AT: {
    // Source: BMB (Schulferien 2025/26) https://www.bmb.gv.at/Themen/schule/schulpraxis/termine/ferientermine_25_26.html
    ALL: {
      2025: [...AT_COMMON_2025, AT_SEMESTER_2025_BURGENLAND_GROUP, AT_SUMMER_2025_WEST],
      2026: [...AT_COMMON_2026, AT_SEMESTER_2026_BURGENLAND_GROUP, AT_SUMMER_2026_WEST]
    },
    "AT-1": {
      2025: [...AT_COMMON_2025, AT_SEMESTER_2025_BURGENLAND_GROUP, AT_SUMMER_2025_EAST],
      2026: [...AT_COMMON_2026, AT_SEMESTER_2026_BURGENLAND_GROUP, AT_SUMMER_2026_EAST]
    },
    "AT-2": {
      2025: [...AT_COMMON_2025, AT_SEMESTER_2025_BURGENLAND_GROUP, AT_SUMMER_2025_WEST],
      2026: [...AT_COMMON_2026, AT_SEMESTER_2026_BURGENLAND_GROUP, AT_SUMMER_2026_WEST]
    },
    "AT-3": {
      2025: [...AT_COMMON_2025, AT_SEMESTER_2025_WIEN_NOE, AT_SUMMER_2025_EAST],
      2026: [...AT_COMMON_2026, AT_SEMESTER_2026_WIEN_NOE, AT_SUMMER_2026_EAST]
    },
    "AT-4": {
      2025: [...AT_COMMON_2025, AT_SEMESTER_2025_OOE_STEIERMARK, AT_SUMMER_2025_WEST],
      2026: [...AT_COMMON_2026, AT_SEMESTER_2026_OOE_STEIERMARK, AT_SUMMER_2026_WEST]
    },
    "AT-5": {
      2025: [...AT_COMMON_2025, AT_SEMESTER_2025_BURGENLAND_GROUP, AT_SUMMER_2025_WEST],
      2026: [...AT_COMMON_2026, AT_SEMESTER_2026_BURGENLAND_GROUP, AT_SUMMER_2026_WEST]
    },
    "AT-6": {
      2025: [...AT_COMMON_2025, AT_SEMESTER_2025_OOE_STEIERMARK, AT_SUMMER_2025_WEST],
      2026: [...AT_COMMON_2026, AT_SEMESTER_2026_OOE_STEIERMARK, AT_SUMMER_2026_WEST]
    },
    "AT-7": {
      2025: [...AT_COMMON_2025, AT_SEMESTER_2025_BURGENLAND_GROUP, AT_SUMMER_2025_WEST],
      2026: [...AT_COMMON_2026, AT_SEMESTER_2026_BURGENLAND_GROUP, AT_SUMMER_2026_WEST]
    },
    "AT-8": {
      2025: [...AT_COMMON_2025, AT_SEMESTER_2025_BURGENLAND_GROUP, AT_SUMMER_2025_WEST],
      2026: [...AT_COMMON_2026, AT_SEMESTER_2026_BURGENLAND_GROUP, AT_SUMMER_2026_WEST]
    },
    "AT-9": {
      2025: [...AT_COMMON_2025, AT_SEMESTER_2025_WIEN_NOE, AT_SUMMER_2025_EAST],
      2026: [...AT_COMMON_2026, AT_SEMESTER_2026_WIEN_NOE, AT_SUMMER_2026_EAST]
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
