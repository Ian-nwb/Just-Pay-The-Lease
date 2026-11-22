import { isWithinQuietHours, quietHoursEndAt, localParts } from './quietHours.js';

// Asia/Manila is UTC+8 with no DST.
const at = (iso) => new Date(iso);
const overnight = { enabled: true, start: '22:00', end: '07:00' };
const daytime = { enabled: true, start: '13:00', end: '15:00' };

describe('quietHours', () => {
  it('reads the local calendar date and minutes', () => {
    expect(localParts(at('2026-11-21T15:30:00Z'), 'Asia/Manila')).toEqual({ date: '2026-11-21', minutes: 23 * 60 + 30 });
    expect(localParts(at('2026-11-21T16:30:00Z'), 'Asia/Manila')).toEqual({ date: '2026-11-22', minutes: 30 });
  });

  it('handles windows that wrap past midnight', () => {
    expect(isWithinQuietHours(overnight, 'Asia/Manila', at('2026-11-21T14:30:00Z'))).toBe(true); // 22:30
    expect(isWithinQuietHours(overnight, 'Asia/Manila', at('2026-11-21T20:00:00Z'))).toBe(true); // 04:00
    expect(isWithinQuietHours(overnight, 'Asia/Manila', at('2026-11-21T23:00:00Z'))).toBe(false); // 07:00 exactly
    expect(isWithinQuietHours(overnight, 'Asia/Manila', at('2026-11-21T04:00:00Z'))).toBe(false); // 12:00
  });

  it('handles same-day windows', () => {
    expect(isWithinQuietHours(daytime, 'Asia/Manila', at('2026-11-21T05:30:00Z'))).toBe(true); // 13:30
    expect(isWithinQuietHours(daytime, 'Asia/Manila', at('2026-11-21T07:00:00Z'))).toBe(false); // 15:00
  });

  it('is off when disabled, malformed, or zero-length', () => {
    expect(isWithinQuietHours({ ...overnight, enabled: false }, 'Asia/Manila', at('2026-11-21T14:30:00Z'))).toBe(false);
    expect(isWithinQuietHours({ enabled: true, start: '25:00', end: '07:00' }, 'Asia/Manila', at('2026-11-21T14:30:00Z'))).toBe(false);
    expect(isWithinQuietHours({ enabled: true, start: '07:00', end: '07:00' }, 'Asia/Manila', at('2026-11-21T14:30:00Z'))).toBe(false);
  });

  it('computes when the window ends', () => {
    expect(quietHoursEndAt(overnight, 'Asia/Manila', at('2026-11-21T14:30:00Z')).toISOString()).toBe('2026-11-21T23:00:00.000Z');
    expect(quietHoursEndAt(overnight, 'Asia/Manila', at('2026-11-21T04:00:00Z'))).toBeNull();
  });

  it('falls back to Asia/Manila for an invalid timezone', () => {
    expect(localParts(at('2026-11-21T15:30:00Z'), 'Not/AZone').date).toBe('2026-11-21');
  });
});
