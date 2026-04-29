/**
 * Human-readable formatting utilities.
 *
 * Pure functions used across the UI and CLI to display durations,
 * byte counts, and large numbers in a friendly form.
 */

/**
 * Format a duration given in milliseconds into a compact human-readable string.
 *
 * @example
 *   formatDuration(500)    // "0.5s"
 *   formatDuration(3200)   // "3.2s"
 *   formatDuration(63100)  // "1m 3s"
 *   formatDuration(3661000) // "1h 1m"
 */
export function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    // Sub-minute: show one decimal place up to 9.9s, then whole seconds
    if (ms < 10_000) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

const BYTES_PER_KB = 1024;

/**
 * Format a byte count into a compact human-readable string.
 *
 * @example
 *   formatBytes(500)        // "500 B"
 *   formatBytes(1500)       // "1.5 KB"
 *   formatBytes(1_048_576)  // "1.0 MB"
 */
export function formatBytes(bytes: number): string {
  if (!isFinite(bytes) || bytes < 0) return "—";
  if (bytes < BYTES_PER_KB) return `${bytes} B`;
  if (bytes < BYTES_PER_KB * BYTES_PER_KB) return `${(bytes / BYTES_PER_KB).toFixed(1)} KB`;
  if (bytes < BYTES_PER_KB * BYTES_PER_KB * BYTES_PER_KB) return `${(bytes / (BYTES_PER_KB * BYTES_PER_KB)).toFixed(1)} MB`;
  return `${(bytes / (BYTES_PER_KB * BYTES_PER_KB * BYTES_PER_KB)).toFixed(1)} GB`;
}

/**
 * Format a large integer with locale-aware thousands separators.
 * Falls back to raw string on non-finite input.
 *
 * @example
 *   formatCount(1234567)  // "1,234,567"
 *   formatCount(42)       // "42"
 */
export function formatCount(n: number): string {
  if (!isFinite(n)) return "—";
  return n.toLocaleString();
}
