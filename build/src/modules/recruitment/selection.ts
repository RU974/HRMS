import type { CandidateFilterParams, CandidateStage } from "@/services/recruitment-service";

/**
 * What the user has ticked on the candidate table or board.
 *
 * Normally that is a set of ids. After "select all N matching this filter" it becomes the filter
 * itself (the server resolves the people, so it is not limited to the page on screen) together
 * with the few people who were unticked afterwards. On the board the filter is limited to one
 * column, so only cards of that stage can be unticked or ticked.
 */
export interface Selection {
  ids: ReadonlySet<number>;
  all: { filters: CandidateFilterParams; total: number; stage: CandidateStage | null } | null;
  excluded: ReadonlySet<number>;
}

export type BulkScope =
  | { kind: "ids"; ids: number[] }
  | { kind: "matching"; filters: CandidateFilterParams; excludeIds: number[]; total: number };

export const emptySelection: Selection = { ids: new Set(), all: null, excluded: new Set() };

/** True when a card of the given stage belongs to the "select all" scope. */
function inScope(selection: Selection, stage?: CandidateStage | null): boolean {
  if (!selection.all) return true;
  return selection.all.stage === null || selection.all.stage === stage;
}

export function isSelected(selection: Selection, id: number, stage?: CandidateStage | null): boolean {
  if (selection.all) return inScope(selection, stage) && !selection.excluded.has(id);
  return selection.ids.has(id);
}

/** Whether a card can be ticked at all (cards outside a column-wide selection cannot). */
export function canToggle(selection: Selection, stage?: CandidateStage | null): boolean {
  return inScope(selection, stage);
}

export function selectionCount(selection: Selection): number {
  return selection.all ? Math.max(0, selection.all.total - selection.excluded.size) : selection.ids.size;
}

export function toggleOne(selection: Selection, id: number, stage?: CandidateStage | null): Selection {
  if (selection.all) {
    if (!inScope(selection, stage)) return selection;
    const excluded = new Set(selection.excluded);
    if (excluded.has(id)) excluded.delete(id);
    else excluded.add(id);
    return { ...selection, excluded };
  }

  const ids = new Set(selection.ids);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  return { ...selection, ids };
}

/** Tick or untick every id in a list (a table page, or the loaded cards of a board column). */
export function togglePage(selection: Selection, pageIds: number[], stage?: CandidateStage | null): Selection {
  if (pageIds.length === 0) return selection;
  const everyoneSelected = pageIds.every((id) => isSelected(selection, id, stage));

  if (selection.all) {
    if (!inScope(selection, stage)) return selection;
    const excluded = new Set(selection.excluded);
    pageIds.forEach((id) => (everyoneSelected ? excluded.add(id) : excluded.delete(id)));
    return { ...selection, excluded };
  }

  const ids = new Set(selection.ids);
  pageIds.forEach((id) => (everyoneSelected ? ids.delete(id) : ids.add(id)));
  return { ...selection, ids };
}

export function selectAllMatching(filters: CandidateFilterParams, total: number, stage: CandidateStage | null = null): Selection {
  return { ids: new Set(), all: { filters, total, stage }, excluded: new Set() };
}

/** What to send to the server for the current selection. */
export function toBulkScope(selection: Selection): BulkScope {
  if (selection.all) {
    return {
      kind: "matching",
      filters: selection.all.stage ? { ...selection.all.filters, stage: selection.all.stage } : selection.all.filters,
      excludeIds: [...selection.excluded],
      total: selectionCount(selection),
    };
  }

  return { kind: "ids", ids: [...selection.ids] };
}

/** Keep only the people an action could not handle selected, so they can be retried or looked at. */
export function selectionAfterRun(failedIds: number[]): Selection {
  return failedIds.length ? { ids: new Set(failedIds), all: null, excluded: new Set() } : emptySelection;
}

/** Split ids into request-sized groups (the server accepts at most 200 per request, 100 for email). */
export function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
}
