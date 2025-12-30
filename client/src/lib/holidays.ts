type Holiday = {
  name: string;
};

const FIXED_HOLIDAYS: Record<string, string> = {
  "01-01": "Neujahr",
  "01-06": "Heilige Drei Koenige",
  "05-01": "Staatsfeiertag",
  "08-15": "Mariae Himmelfahrt",
  "10-26": "Nationalfeiertag",
  "11-01": "Allerheiligen",
  "12-08": "Mariae Empfaengnis",
  "12-25": "Weihnachtstag",
  "12-26": "Stefanitag"
};

const MOVABLE_HOLIDAYS: Array<{ offset: number; name: string }> = [
  { offset: 1, name: "Ostermontag" },
  { offset: 39, name: "Christi Himmelfahrt" },
  { offset: 50, name: "Pfingstmontag" },
  { offset: 60, name: "Fronleichnam" }
];

const formatMonthDay = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getEasterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
};

export const getAustrianHoliday = (date: Date): Holiday | null => {
  const fixed = FIXED_HOLIDAYS[formatMonthDay(date)];
  if (fixed) {
    return { name: fixed };
  }

  const easterSunday = getEasterSunday(date.getFullYear());
  for (const holiday of MOVABLE_HOLIDAYS) {
    const holidayDate = addDays(easterSunday, holiday.offset);
    if (isSameDay(date, holidayDate)) {
      return { name: holiday.name };
    }
  }

  return null;
};
