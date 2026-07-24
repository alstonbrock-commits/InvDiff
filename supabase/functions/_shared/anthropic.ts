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
  maxTokens = 8000,
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

  // With output_config.format, the first text block contains valid JSON.
  const textBlock = (data.content ?? []).find(
    (b: { type: string }) => b.type === 'text',
  );
  if (!textBlock?.text) throw new Error('No text block in Claude response');
  return JSON.parse(textBlock.text) as T;
}
