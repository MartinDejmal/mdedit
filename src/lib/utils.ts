/** Shared utility helpers. */

/** Returns the filename portion of a file path, cross-platform. */
export function basename(filePath: string): string {
  return filePath.replace(/.*[\\/]/, "");
}

/** Parent of a POSIX, drive-letter or UNC path; filesystem roots stay put. */
export function parentDirectory(path: string): string {
  const separator = path.includes("\\") ? "\\" : "/";
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) return "/";
  if (/^[A-Za-z]:$/.test(normalized)) return normalized + separator;
  if (normalized.startsWith("//") && normalized.slice(2).split("/").length <= 2) return normalized.replace(/\//g, separator);
  const index = normalized.lastIndexOf("/");
  const parent = index < 0 ? normalized : index === 0 ? "/" : normalized.slice(0, index);
  return (/^[A-Za-z]:$/.test(parent) ? parent + "/" : parent).replace(/\//g, separator);
}

export function validEntryName(name: string): boolean {
  return Boolean(name.trim()) && !/[<>:"/\\|?*\x00-\x1f]/.test(name) && !/[. ]$/.test(name)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
}
