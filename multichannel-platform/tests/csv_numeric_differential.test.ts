import { describe, it, expect } from 'vitest';
import { parseNumericPrice, parseNumericStock } from '../services/api/src/modules/csv/csv.controller';

describe('CSV Numeric & Currency Parsing Suite', () => {
  it('correctly handles euro currency symbols and formatting', () => {
    expect(parseNumericPrice('€3.98')).toEqual({ value: 3.98, isSpecified: true });
    expect(parseNumericPrice('€ 3.98')).toEqual({ value: 3.98, isSpecified: true });
    expect(parseNumericPrice('3.98 €')).toEqual({ value: 3.98, isSpecified: true });
    expect(parseNumericPrice('€129.99')).toEqual({ value: 129.99, isSpecified: true });
  });

  it('correctly handles dollar and pound currency symbols', () => {
    expect(parseNumericPrice('$3.98')).toEqual({ value: 3.98, isSpecified: true });
    expect(parseNumericPrice('$ 15.00')).toEqual({ value: 15.0, isSpecified: true });
    expect(parseNumericPrice('£9.50')).toEqual({ value: 9.5, isSpecified: true });
  });

  it('correctly handles European comma decimal separators', () => {
    expect(parseNumericPrice('3,98')).toEqual({ value: 3.98, isSpecified: true });
    expect(parseNumericPrice('€ 3,98')).toEqual({ value: 3.98, isSpecified: true });
    expect(parseNumericPrice('1.234,56')).toEqual({ value: 1234.56, isSpecified: true });
    expect(parseNumericPrice('1,234.56')).toEqual({ value: 1234.56, isSpecified: true });
  });

  it('correctly recognizes omitted or blank prices as unspecified', () => {
    expect(parseNumericPrice('')).toEqual({ value: 0, isSpecified: false });
    expect(parseNumericPrice('   ')).toEqual({ value: 0, isSpecified: false });
    expect(parseNumericPrice(null)).toEqual({ value: 0, isSpecified: false });
    expect(parseNumericPrice(undefined)).toEqual({ value: 0, isSpecified: false });
    expect(parseNumericPrice('N/A')).toEqual({ value: 0, isSpecified: false });
  });

  it('correctly parses explicit zero prices', () => {
    expect(parseNumericPrice('0')).toEqual({ value: 0, isSpecified: true });
    expect(parseNumericPrice('0.00')).toEqual({ value: 0, isSpecified: true });
    expect(parseNumericPrice('€0.00')).toEqual({ value: 0, isSpecified: true });
    expect(parseNumericPrice(0)).toEqual({ value: 0, isSpecified: true });
  });

  it('correctly parses stock numbers and handles blanks', () => {
    expect(parseNumericStock('35')).toEqual({ value: 35, isSpecified: true });
    expect(parseNumericStock(' 33 ')).toEqual({ value: 33, isSpecified: true });
    expect(parseNumericStock(100)).toEqual({ value: 100, isSpecified: true });
    expect(parseNumericStock('')).toEqual({ value: 0, isSpecified: false });
    expect(parseNumericStock(null)).toEqual({ value: 0, isSpecified: false });
    expect(parseNumericStock(undefined)).toEqual({ value: 0, isSpecified: false });
  });
});

