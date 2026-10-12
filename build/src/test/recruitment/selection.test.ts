import { describe, expect, it } from "vitest";
import {
  canToggle,
  chunk,
  emptySelection,
  isSelected,
  selectAllMatching,
  selectionAfterRun,
  selectionCount,
  toBulkScope,
  toggleOne,
  togglePage,
} from "@/modules/recruitment/selection";

describe("candidate selection", () => {
  it("ticks and unticks single candidates and pages", () => {
    let selection = toggleOne(emptySelection, 1);
    selection = toggleOne(selection, 2);
    expect(selectionCount(selection)).toBe(2);

    selection = toggleOne(selection, 1);
    expect(isSelected(selection, 1)).toBe(false);
    expect(isSelected(selection, 2)).toBe(true);

    selection = togglePage(selection, [2, 3, 4]);
    expect([...selection.ids].sort()).toEqual([2, 3, 4]);

    selection = togglePage(selection, [2, 3, 4]);
    expect(selectionCount(selection)).toBe(0);
  });

  it("selecting everything matching a filter is not limited to the page and counts unticked people", () => {
    const filters = { stage: "applied" as const, job_opening_id: 7 };
    let selection = selectAllMatching(filters, 480);

    expect(selectionCount(selection)).toBe(480);
    expect(isSelected(selection, 123456)).toBe(true);

    selection = toggleOne(selection, 5);
    selection = toggleOne(selection, 6);
    expect(selectionCount(selection)).toBe(478);
    expect(isSelected(selection, 5)).toBe(false);

    selection = toggleOne(selection, 5);
    expect(isSelected(selection, 5)).toBe(true);

    expect(toBulkScope(selection)).toEqual({ kind: "matching", filters, excludeIds: [6], total: 479 });
  });

  it("unticking a whole page in matching mode excludes it, and ticking it again brings it back", () => {
    let selection = selectAllMatching({}, 100);
    selection = togglePage(selection, [1, 2, 3]);
    expect(selectionCount(selection)).toBe(97);
    selection = togglePage(selection, [1, 2, 3]);
    expect(selectionCount(selection)).toBe(100);
  });

  it("a board column selection only covers that column", () => {
    const selection = selectAllMatching({ job_opening_id: 3 }, 60, "screening");

    expect(canToggle(selection, "screening")).toBe(true);
    expect(canToggle(selection, "applied")).toBe(false);
    expect(isSelected(selection, 9, "screening")).toBe(true);
    expect(isSelected(selection, 9, "applied")).toBe(false);
    expect(toggleOne(selection, 9, "applied")).toBe(selection);

    expect(toBulkScope(selection)).toEqual({ kind: "matching", filters: { job_opening_id: 3, stage: "screening" }, excludeIds: [], total: 60 });
  });

  it("explicit selections become an id list", () => {
    const selection = toggleOne(toggleOne(emptySelection, 4), 8);
    expect(toBulkScope(selection)).toEqual({ kind: "ids", ids: [4, 8] });
  });

  it("keeps only the people an action failed for", () => {
    expect(selectionCount(selectionAfterRun([]))).toBe(0);
    expect([...selectionAfterRun([3, 9]).ids]).toEqual([3, 9]);
  });

  it("splits long id lists into request-sized groups", () => {
    const ids = Array.from({ length: 450 }, (_, index) => index + 1);
    const groups = chunk(ids, 200);

    expect(groups.map((group) => group.length)).toEqual([200, 200, 50]);
    expect(groups.flat()).toEqual(ids);
    expect(chunk([], 200)).toEqual([]);
  });
});
