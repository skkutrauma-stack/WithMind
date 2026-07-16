import type { Json } from './types.ts';

export function stringifyPromptValue(value: Json | undefined) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

export function renderPromptTemplate(template: string, variables: Record<string, Json | undefined>) {
  return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = variables[key];
    return stringifyPromptValue(value);
  });
}

export function normalizeJsonOutput<T extends Record<string, unknown>>(value: unknown): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('OpenAI output is not a JSON object');
  }
  return value as T;
}
