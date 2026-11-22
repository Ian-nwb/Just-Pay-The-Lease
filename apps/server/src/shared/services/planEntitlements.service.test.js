import { assertPlanCapacity, getPlanEntitlements } from './planEntitlements.service.js';

describe('plan entitlements', () => {
  it('defines Starter and Professional property/unit caps', () => {
    expect(getPlanEntitlements('starter')).toEqual({ properties: 3, units: 10 });
    expect(getPlanEntitlements('pro')).toEqual({ properties: 10, units: 20 });
  });

  it('allows a creation up to each plan cap', () => {
    expect(assertPlanCapacity({ plan: 'starter', properties: 2, units: 9, addProperties: 1, addUnits: 1 }).properties).toBe(3);
    expect(assertPlanCapacity({ plan: 'pro', properties: 9, units: 19, addProperties: 1, addUnits: 1 }).units).toBe(20);
  });

  it('rejects a property or unit above the active-plan cap', () => {
    expect(() => assertPlanCapacity({ plan: 'starter', properties: 3, addProperties: 1 })).toThrow(/up to 3 active properties/i);
    expect(() => assertPlanCapacity({ plan: 'pro', units: 20, addUnits: 1 })).toThrow(/up to 20 active units/i);
  });

  it('keeps Enterprise unavailable until its entitlements are launched', () => {
    expect(() => assertPlanCapacity({ plan: 'enterprise' })).toThrow(/Enterprise is not available yet/i);
  });
});
