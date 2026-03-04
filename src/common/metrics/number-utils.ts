import { Prisma } from '@prisma/client';

type NumericInput = Prisma.Decimal | number | string | null | undefined;

export function toNumber(value: NumericInput, defaultValue = 0): number {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }
  const parsed = Number.parseFloat(value.toString());
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

export function toOptionalNumber(value: NumericInput): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const parsed = Number.parseFloat(value.toString());
  return Number.isNaN(parsed) ? null : parsed;
}

export function roundNumber(value: number, precision = 2): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}
