// Joint interviews: one interviewees row per interview SESSION, with every
// participant's name stored in the single `name` column joined by " & ".
// No schema/sync/server change — downstream (transcripts, prompts, reports)
// reads the combined string as the session's name, which is also how a
// single-mic recording with no speaker separation actually behaves.

export const JOINT_SEPARATOR = ' & ';

export function splitNames(name: string): string[] {
  return name
    .split(JOINT_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinNames(names: string[]): string {
  return names
    .map((s) => s.trim())
    .filter(Boolean)
    .join(JOINT_SEPARATOR);
}

// "Alice Nguyen & Bob Carr" → "AB"; "Alice Nguyen" → "AN".
export function initialsOf(name: string): string {
  const people = splitNames(name);
  const source =
    people.length > 1 ? people.map((p) => p.split(/\s+/)[0] ?? '') : name.trim().split(/\s+/);
  return source
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// "Alice Nguyen & Bob Carr" → "Alice & Bob"; "Alice Nguyen" → "Alice".
export function firstNames(name: string): string {
  const people = splitNames(name);
  if (people.length === 0) return name;
  return people.map((p) => p.split(/\s+/)[0] ?? p).join(JOINT_SEPARATOR);
}
