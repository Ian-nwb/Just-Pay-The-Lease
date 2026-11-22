import { splitAmount } from './utilityBill.service.js';

const sum = (values) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

describe('splitAmount (utility bill allocation)', () => {
  it('splits equally and always reconciles to the centavo', () => {
    expect(splitAmount(100, [1, 1, 1])).toEqual([33.34, 33.33, 33.33]);
    expect(sum(splitAmount(1000.01, [1, 1, 1]))).toBe(1000.01);
  });

  it('splits by share weights and gives zero-weight units nothing', () => {
    expect(splitAmount(2500, [300, 200, 0])).toEqual([1500, 1000, 0]);
  });

  it('handles totals smaller than the number of units', () => {
    const result = splitAmount(0.05, [1, 1, 1, 1, 1, 1, 1]);
    expect(sum(result)).toBe(0.05);
    expect(result.every((v) => v === 0 || v === 0.01)).toBe(true);
  });

  it('returns zeros when weights sum to zero', () => {
    expect(splitAmount(100, [0, 0])).toEqual([0, 0]);
  });
});
