/**
 * Client-side file download utilities.
 */

/**
 * Triggers a browser download of a string as a file.
 *
 * @param content The string content to download
 * @param filename The name of the file to save as (e.g. "report.md")
 * @param mimeType The MIME type of the file (e.g. "text/markdown")
 */
export function triggerDownload(content: string, filename: string, mimeType: string): void {
  if (typeof window === 'undefined') return;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  
  document.body.appendChild(a);
  a.click();
  
  // Cleanup
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
