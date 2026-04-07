/** Shared utility helpers. */

/** Returns the filename portion of a file path, cross-platform. */
export function basename(filePath: string): string {
  return filePath.replace(/.*[\\/]/, "");
}
