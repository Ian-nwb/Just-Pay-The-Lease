const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseCalendarDate(value, timezone = 'Asia/Manila') {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return value;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  // Date-only values are stored at UTC midnight. Preserve their entered calendar
  // date; format real timestamps in the property's timezone.
  if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0) {
    return date.toISOString().slice(0, 10);
  }
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return null;
  }
}

export function propertyToday(now = new Date(), timezone = 'Asia/Manila') {
  return parseCalendarDate(now, timezone);
}

export function addCalendarDays(calendarDate, dayCount) {
  if (!calendarDate || !DATE_ONLY.test(calendarDate) || !Number.isInteger(Number(dayCount))) return null;
  const [year, month, day] = calendarDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + Number(dayCount)));
  return date.toISOString().slice(0, 10);
}

export function addCalendarMonths(calendarDate, monthCount) {
  if (!calendarDate || !DATE_ONLY.test(calendarDate) || !Number.isInteger(Number(monthCount))) return null;
  const [year, month, day] = calendarDate.split('-').map(Number);
  const monthIndex = year * 12 + (month - 1) + Number(monthCount);
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function calendarDateAsUTCDate(calendarDate) {
  if (!calendarDate || !DATE_ONLY.test(calendarDate)) return null;
  const [year, month, day] = calendarDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

export function calendarDaysBetween(fromDate, toDate) {
  if (!fromDate || !toDate || !DATE_ONLY.test(fromDate) || !DATE_ONLY.test(toDate)) return null;
  return Math.round((Date.parse(`${toDate}T00:00:00.000Z`) - Date.parse(`${fromDate}T00:00:00.000Z`)) / 86400000);
}

export function getRenewalWindow({ leaseEnd, renewalWindowDays = 60, timezone = 'Asia/Manila', now = new Date() }) {
  const leaseEndDate = parseCalendarDate(leaseEnd, timezone);
  const today = propertyToday(now, timezone);
  if (!leaseEndDate || !today) return { leaseEndDate: null, opensOn: null, daysRemaining: null, isOpen: false };
  const opensOn = addCalendarDays(leaseEndDate, -Number(renewalWindowDays));
  const isExpired = today > leaseEndDate;
  return {
    leaseEndDate,
    opensOn,
    daysRemaining: Math.max(0, calendarDaysBetween(today, leaseEndDate)),
    isExpired,
    isOpen: Boolean(opensOn && !isExpired && today >= opensOn),
  };
}

/**
 * Normalize any lease/invoice date input to the property's calendar date,
 * stored as UTC midnight. Date-only strings keep their entered day; real
 * timestamps resolve to the day they fall on in the property's timezone.
 * Returns null for empty or invalid input.
 */
export function toPropertyCalendarDate(value, timezone = 'Asia/Manila') {
  const calendarDate = parseCalendarDate(value, timezone);
  return calendarDate ? calendarDateAsUTCDate(calendarDate) : null;
}
