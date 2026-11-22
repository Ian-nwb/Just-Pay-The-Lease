// Quiet-hours helpers. Times are "HH:MM" in the recipient's timezone.
// A window may wrap past midnight (e.g. 22:00 → 07:00).

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(value) {
  const match = TIME.exec(value || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Wall-clock parts for `now` in `timezone`. */
export function localParts(now = new Date(), timezone = 'Asia/Manila') {
  let tz = timezone;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { tz = 'Asia/Manila'; }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** True when `now` falls inside an enabled quiet-hours window. */
export function isWithinQuietHours(quietHours, timezone, now = new Date()) {
  if (!quietHours?.enabled) return false;
  const start = toMinutes(quietHours.start);
  const end = toMinutes(quietHours.end);
  if (start == null || end == null || start === end) return false;
  const { minutes } = localParts(now, timezone);
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/**
 * The instant quiet hours end, or null when not currently in quiet hours.
 * Computed from minutes remaining, so it is DST-safe to the minute.
 */
export function quietHoursEndAt(quietHours, timezone, now = new Date()) {
  if (!isWithinQuietHours(quietHours, timezone, now)) return null;
  const end = toMinutes(quietHours.end);
  const { minutes } = localParts(now, timezone);
  const remaining = end > minutes ? end - minutes : 24 * 60 - minutes + end;
  const at = new Date(now.getTime() + remaining * 60 * 1000);
  at.setUTCSeconds(0, 0);
  return at;
}
