import { describe, expect, it } from 'vitest';
import { formatCents, toAmount } from '../../src/shared/utils/money.js';

describe('formatCents', () => {
  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [150075, '1500.75'],
    [100, '1.00'],
    [-2490, '-24.90'],
    [Number.MAX_SAFE_INTEGER, '90071992547409.91'],
  ])('%i centavos -> %s', (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });

  it('não aceita valores fracionados (dinheiro nunca é float)', () => {
    expect(() => formatCents(10.5)).toThrow(RangeError);
  });

  it('monta o objeto de valor com moeda', () => {
    expect(toAmount(123456)).toEqual({ amount: '1234.56', currency: 'BRL' });
  });
});
