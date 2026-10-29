// South African public holidays for any year (Public Holidays Act 36 of 1994). When a public holiday falls
// on a Sunday, the next day that isn't already a holiday is a public holiday too (e.g. 27 Dec 2022).
// One-off days the President declares (such as election days) aren't predictable: schools add those as
// calendar events in the "Public holiday" category.

export type Holiday = { date: string; name: string; observed?: boolean };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

/** Easter Sunday (Gregorian calendar). */
function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(y, month, day);
}

export function saHolidays(year: number): Holiday[] {
  const e = easter(year);
  const shift = (days: number) => new Date(e.getTime() + days * 86_400_000);
  const fixed: Holiday[] = [
    { date: iso(utc(year, 1, 1)), name: "New Year's Day" },
    { date: iso(utc(year, 3, 21)), name: "Human Rights Day" },
    { date: iso(shift(-2)), name: "Good Friday" },
    { date: iso(shift(1)), name: "Family Day" },
    { date: iso(utc(year, 4, 27)), name: "Freedom Day" },
    { date: iso(utc(year, 5, 1)), name: "Workers' Day" },
    { date: iso(utc(year, 6, 16)), name: "Youth Day" },
    { date: iso(utc(year, 8, 9)), name: "National Women's Day" },
    { date: iso(utc(year, 9, 24)), name: "Heritage Day" },
    { date: iso(utc(year, 12, 16)), name: "Day of Reconciliation" },
    { date: iso(utc(year, 12, 25)), name: "Christmas Day" },
    { date: iso(utc(year, 12, 26)), name: "Day of Goodwill" },
  ];
  const taken = new Set(fixed.map((h) => h.date));
  const observed: Holiday[] = [];
  for (const h of fixed) {
    if (new Date(h.date + "T00:00:00Z").getUTCDay() !== 0) continue;
    let d = new Date(h.date + "T00:00:00Z");
    do d = new Date(d.getTime() + 86_400_000); while (taken.has(iso(d)));
    taken.add(iso(d));
    observed.push({ date: iso(d), name: `${h.name} (observed)`, observed: true });
  }
  return [...fixed, ...observed].sort((a, b) => a.date.localeCompare(b.date));
}
