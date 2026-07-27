import { ValueTransformer } from 'typeorm';

export const decimalStringTransformer: ValueTransformer = {
  to: (value: string): string => value,
  from: (value: string): string => value,
};
