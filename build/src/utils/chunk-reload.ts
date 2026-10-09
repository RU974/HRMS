const RELOAD_FLAG = "hrms_chunk_reload_at";
const RELOAD_WINDOW_MS = 30_000;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(message);
}

/**
 * After a deploy the hashed chunk filenames change, so a tab running the old
 * build requests files that no longer exist. Reload once to pick up the new
 * index.html; the timestamp guard prevents a reload loop if the file is truly missing.
 * Returns true when a reload was triggered.
 */
export function reloadOnceForNewDeploy(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) ?? 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
