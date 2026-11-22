import {
  addCalendarDays,
  addCalendarMonths,
  calendarDateAsUTCDate,
  calendarDaysBetween,
  getRenewalWindow,
  parseCalendarDate,
  propertyToday,
} from './propertyDatePolicy.js';

describe('property-local calendar date policy', () => {
  it('uses the property timezone when determining the current date', () => {
    const instant = new Date('2026-11-14T16:30:00.000Z');
    expect(propertyToday(instant, 'Asia/Manila')).toBe('2026-11-15');
    expect(propertyToday(instant, 'America/Los_Angeles')).toBe('2026-11-14');
  });

  it('preserves stored date-only lease values as calendar dates', () => {
    expect(parseCalendarDate(new Date('2028-09-20T00:00:00.000Z'), 'America/Los_Angeles')).toBe('2028-09-20');
    expect(parseCalendarDate('2028-02-30', 'Asia/Manila')).toBeNull();
  });

  it('opens the renewal window on its exact property-local date', () => {
    const beforeOpening = getRenewalWindow({
      leaseEnd: '2026-12-15',
      renewalWindowDays: 30,
      timezone: 'Asia/Manila',
      now: new Date('2026-11-14T15:59:00.000Z'),
    });
    const onOpeningDate = getRenewalWindow({
      leaseEnd: '2026-12-15',
      renewalWindowDays: 30,
      timezone: 'Asia/Manila',
      now: new Date('2026-11-14T16:00:00.000Z'),
    });
    expect(beforeOpening.opensOn).toBe('2026-11-15');
    expect(beforeOpening.isOpen).toBe(false);
    expect(onOpeningDate.isOpen).toBe(true);
  });

  it('does not create an expiry window for an indefinite lease', () => {
    expect(getRenewalWindow({ leaseEnd: null, timezone: 'Asia/Manila' })).toEqual({
      leaseEndDate: null,
      opensOn: null,
      daysRemaining: null,
      isExpired: false,
      isOpen: false,
    });
  });

  it('closes the renewal window after the lease end date', () => {
    const state = getRenewalWindow({ leaseEnd: '2026-12-15', renewalWindowDays: 30, timezone: 'Asia/Manila', now: new Date('2026-12-15T16:00:00.000Z') });
    expect(state.isExpired).toBe(true);
    expect(state.isOpen).toBe(false);
  });

  it('does calendar arithmetic without 24-hour timezone assumptions', () => {
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(calendarDaysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });

  it('adds renewal months by calendar date and clamps at month end', () => {
    expect(addCalendarMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addCalendarMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addCalendarMonths('2026-08-31', 6)).toBe('2027-02-28');
    expect(calendarDateAsUTCDate('2026-02-30')).toBeNull();
    expect(calendarDateAsUTCDate('2026-02-28')?.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });
});
