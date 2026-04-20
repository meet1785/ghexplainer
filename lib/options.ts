/**
 * Shared option parsing helpers for API/query/CLI inputs.
 */

export function parseBooleanFlag(value: unknown): boolean {
  /**
   * Accepted truthy values:
   * - boolean: true
   * - number: 1
   * - string: "1", "true", "yes", "on" (case-insensitive, trimmed)
   */
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return false;

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}
