type SchoolHoliday = {
  name: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
};

const SCHOOL_HOLIDAYS_BY_YEAR: Record<number, SchoolHoliday[]> = {
  // TODO: Fill with Austria school holiday ranges (state-specific). Example:
  // 2026: [
  //   { name: "Weihnachtsferien", start: "2025-12-24", end: "2026-01-06" },
  //   { name: "Sommerferien", start: "2026-07-04", end: "2026-09-06" }
  // ]
};

const toDate = (value: string) => new Date(`${value}T00:00:00`);

export const getAustrianSchoolHoliday = (date: Date): SchoolHoliday | null => {
  const year = date.getFullYear();
  const ranges = SCHOOL_HOLIDAYS_BY_YEAR[year] ?? [];
  for (const range of ranges) {
    const start = toDate(range.start);
    const end = toDate(range.end);
    if (date >= start && date <= end) {
      return range;
    }
  }
  return null;
};

export const getSchoolHolidayRanges = (year: number): SchoolHoliday[] => {
  return SCHOOL_HOLIDAYS_BY_YEAR[year] ?? [];
};
