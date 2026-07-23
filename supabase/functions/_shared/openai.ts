import { HttpError } from './errors.ts';
import type { Json, SupabaseEnv } from './types.ts';
import { normalizeJsonOutput } from './prompts.ts';

function extractText(payload: any) {
  if (!payload) return '';
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (typeof part?.text === 'string' && part.text.trim()) return part.text.trim();
      }
    }
  }
  if (Array.isArray(payload.choices)) {
    const choice = payload.choices[0];
    const message = choice?.message?.content;
    if (typeof message === 'string' && message.trim()) return message.trim();
    if (Array.isArray(message)) {
      for (const part of message) {
        if (typeof part?.text === 'string' && part.text.trim()) return part.text.trim();
      }
    }
  }
  return '';
}

export function enforceStrictObjectSchemas(schema: Json): Json {
  if (Array.isArray(schema)) return schema.map(enforceStrictObjectSchemas);
  if (!schema || typeof schema !== 'object') return schema;

  const normalized: { [key: string]: Json } = {};
  for (const [key, value] of Object.entries(schema)) {
    normalized[key] = enforceStrictObjectSchemas(value);
  }
  if (normalized.type === 'object') normalized.additionalProperties = false;
  return normalized;
}

export async function runJsonCompletion<T extends Record<string, unknown>>(
  env: SupabaseEnv,
  input: {
    systemPrompt: string;
    userPrompt: string;
    outputSchema: Json;
    model?: string;
    temperature?: number;
  },
) {
  if (!env.OPENAI_API_KEY) {
    throw new HttpError(500, 'OPENAI_API_KEY is required');
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model || env.OPENAI_MODEL || 'gpt-5.4-mini',
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: input.systemPrompt }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: input.userPrompt }],
        },
      ],
      temperature: input.temperature ?? 0.2,
      text: {
        format: {
          type: 'json_schema',
          name: 'output',
          schema: enforceStrictObjectSchemas(input.outputSchema),
          strict: true,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || response.statusText;
    throw new HttpError(response.status, message);
  }

  const text = extractText(payload);
  if (!text) {
    throw new HttpError(502, 'OpenAI response did not contain output text');
  }

  const parsed = JSON.parse(text);
  return normalizeJsonOutput<T>(parsed);
}
