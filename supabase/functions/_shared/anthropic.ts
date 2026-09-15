// Thin wrapper over the Anthropic Messages API for Claude Opus 4.8.
// Model rules (Opus 4.8):
//   - adaptive thinking only; NO temperature/top_p/top_k/budget_tokens (they 400)
//   - structured outputs via output_config.format (json_schema)
// Keys stay server-side; this only ever runs inside an Edge Function.

export const CLAUDE_MODEL = 'claude-opus-4-8';

interface StructuredCallOpts {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}

// Calls Claude and returns the parsed JSON matching `schema`.
export async function claudeStructured<T>({
  system,
  user,
  schema,
  // Adaptive thinking and the JSON output share this cap — 8000 proved tight
  // enough to truncate multi-insight responses mid-JSON. ~16K is the ceiling
  // for non-streaming requests.
  maxTokens = 16000,
}: StructuredCallOpts): Promise<T> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema },
      },
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Claude API ${res.status}: ${detail}`);
  }

  const data = await res.json();
  if (data.stop_reason === 'refusal') {
    throw new Error('Claude declined the request (refusal).');
  }
  if (data.stop_reason === 'max_tokens') {
    // Truncated output — the JSON below would be unparseable. Fail loudly so
    // the caller's job is marked errored instead of dying in JSON.parse.
    throw new Error(
      `Claude output truncated at max_tokens=${maxTokens} — raise the cap`,
    );
  }

  // With output_config.format, the first text block contains valid JSON.
  const textBlock = (data.content ?? []).find(
    (b: { type: string }) => b.type === 'text',
  );
  if (!textBlock?.text) throw new Error('No text block in Claude response');
  return cleanStrings(JSON.parse(textBlock.text)) as T;
}

// Report prose goes straight into a client-facing PDF, so scrub the escape
// artefacts structured output occasionally emits: a literal — that was
// double-escaped, and tabs/newlines left mid-sentence. Observed in a real
// report as "each other <TAB>hat's" and "the pick system — and".
function cleanText(s: string): string {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/[\t\f\r\v]+/g, ' ')
    .replace(/[  ]{2,}/g, ' ')
    .trim();
}

// deno-lint-ignore no-explicit-any
function cleanStrings(value: any): any {
  if (typeof value === 'string') return cleanText(value);
  if (Array.isArray(value)) return value.map(cleanStrings);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = cleanStrings(v);
    return out;
  }
  return value;
}
