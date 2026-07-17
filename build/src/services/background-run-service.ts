import { apiClient } from "./api-client";

export type BackgroundRunStatus = "queued" | "processing" | "done" | "failed";

export interface BackgroundRun<TSummary = Record<string, unknown>> {
  id: number;
  type: string;
  status: BackgroundRunStatus;
  summary: TSummary | null;
  error: string | null;
}

export function getBackgroundRun<TSummary = Record<string, unknown>>(id: number) {
  return apiClient<BackgroundRun<TSummary>>(`/background-runs/${id}`);
}

export async function pollBackgroundRun<TSummary = Record<string, unknown>>(
  id: number,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<BackgroundRun<TSummary>> {
  const intervalMs = options.intervalMs ?? 1500;
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const startedAt = Date.now();

  for (;;) {
    const run = await getBackgroundRun<TSummary>(id);
    if (run.status === "done" || run.status === "failed") return run;
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for background job to complete.");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
