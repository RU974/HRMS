import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/notifications/toast";
import {
  type BoardStage,
  type CandidateStage,
  candidateStageLabels,
  candidateStageOptions,
  changeCandidateStage,
  getCandidateBoard,
  toFilterParams,
} from "@/services/recruitment-service";
import { cn } from "@/utils/cn";
import { HireModal, RejectModal } from "./candidate-components";
import { FitBadge } from "./fit-components";
import { Selection, canToggle, isSelected, selectAllMatching, togglePage, toggleOne } from "./selection";
import { formatRecruitmentDate } from "./shared";

interface BoardProps {
  jobOpeningId: number | "";
  search: string;
  status: "active" | "inactive" | "";
  minFit?: number | "";
  sort?: "fit" | "";
  canMove: boolean;
  /** Ticking cards (for bulk actions) is offered to people who can edit. */
  selection: Selection;
  onSelectionChange: (next: Selection | ((previous: Selection) => Selection)) => void;
}

type BoardCard = BoardStage["candidates"][number];

const columnTone: Record<CandidateStage, string> = {
  applied: "border-t-slate-400",
  screening: "border-t-blue-500",
  interview: "border-t-violet-500",
  offer: "border-t-amber-500",
  hired: "border-t-emerald-500",
  rejected: "border-t-red-500",
};

export function CandidateBoard({ jobOpeningId, search, status, minFit = "", sort = "", canMove, selection, onSelectionChange }: BoardProps) {
  const queryClient = useQueryClient();
  const [dragging, setDragging] = useState<{ card: BoardCard; fromIndex: number } | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<BoardCard | null>(null);
  const [hireTargetId, setHireTargetId] = useState<number | null>(null);

  const boardQuery = useQuery({
    queryKey: ["recruitment", "board", { jobOpeningId, search, status, minFit, sort }],
    queryFn: () => getCandidateBoard({ job_opening_id: jobOpeningId, q: search, status, min_fit: minFit, sort }),
    placeholderData: (previous) => previous,
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, stage, pipelineStageId }: { id: number; stage: CandidateStage; pipelineStageId?: number | null }) =>
      changeCandidateStage(id, stage, undefined, undefined, pipelineStageId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment"] });
    },
    onError: (error: Error) => toast.error("Could not move candidate", error.message),
  });

  const stages = boardQuery.data?.stages ?? [];
  // A job with its own pipeline has several columns per group, so position decides what is a forward move.
  const customPipeline = stages.some((column) => column.pipeline_stage_id != null);
  const columnKey = (column: BoardStage, index: number) => `${column.stage}-${column.pipeline_stage_id ?? "base"}-${index}`;
  const columnLabel = (column: BoardStage) => column.name ?? candidateStageLabels[column.stage];

  function canDrop(drag: { card: BoardCard; fromIndex: number } | null, target: BoardStage, index: number) {
    if (!drag || !canMove || index === drag.fromIndex) return false;
    const { card } = drag;
    if (target.stage === "hired") return card.stage === "offer";
    if (card.stage === "hired") return false;
    if (target.stage === "rejected") return card.stage !== "rejected";
    if (!customPipeline) return candidateStageOptions[card.stage].includes(target.stage);
    if (card.stage === "rejected") return true;
    // Forward to any later column (the server refuses to skip a required stage), or sideways within a group.
    return index > drag.fromIndex || target.stage === card.stage;
  }

  function drop(target: BoardStage, index: number) {
    const drag = dragging;
    setDragging(null);
    setHoverKey(null);

    if (!drag || !canDrop(drag, target, index)) return;
    const card = drag.card;

    if (target.stage === "rejected") {
      setRejectTarget(card);
    } else if (target.stage === "hired") {
      setHireTargetId(card.id);
    } else {
      moveMutation.mutate({ id: card.id, stage: target.stage, pipelineStageId: target.pipeline_stage_id });
    }
  }

  const boardFilters = toFilterParams({ job_opening_id: jobOpeningId, q: search, status, min_fit: minFit });

  return (
    <div className="space-y-3">
      {boardQuery.isError && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          Could not load the board. {(boardQuery.error as Error).message}
        </div>
      )}
      {canMove && <p className="text-xs text-[var(--muted)]">Drag a card to the next stage{customPipeline ? " (stages marked skippable can be passed over)" : ""}. Drop on Rejected to record a reason; drop an Offer-stage card on Hired to hire.</p>}

      <div className="flex gap-3 overflow-x-auto pb-3">
        {boardQuery.isLoading && <p className="p-4 text-sm text-[var(--muted)]">Loading board...</p>}
        {stages.map((column, columnIndex) => {
          const key = columnKey(column, columnIndex);
          const droppable = canDrop(dragging, column, columnIndex);
          return (
            <section
              key={key}
              aria-label={`${columnLabel(column)} column`}
              onDragOver={(event) => {
                if (droppable) {
                  event.preventDefault();
                  setHoverKey(key);
                }
              }}
              onDragLeave={() => setHoverKey((current) => (current === key ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                drop(column, columnIndex);
              }}
              className={cn(
                "flex w-64 shrink-0 flex-col rounded-2xl border border-t-4 border-[var(--border)] bg-[var(--card)] p-3 transition",
                columnTone[column.stage],
                dragging && !droppable && columnIndex !== dragging.fromIndex && "opacity-40",
                hoverKey === key && "ring-2 ring-[var(--primary)]"
              )}
            >
              <header className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold">
                <span className="flex items-center gap-2">
                  {canMove && column.candidates.length > 0 && (
                    <input
                      type="checkbox"
                      aria-label={`Select everyone loaded in ${columnLabel(column)}`}
                      disabled={!canToggle(selection, column.stage)}
                      checked={column.candidates.every((card) => isSelected(selection, card.id, column.stage))}
                      onChange={() => onSelectionChange((previous) => togglePage(previous, column.candidates.map((card) => card.id), column.stage))}
                    />
                  )}
                  {columnLabel(column)}
                </span>
                <span className="rounded-full bg-[var(--border)]/60 px-2 py-0.5 text-xs">{column.count}</span>
              </header>
              {canMove && column.pipeline_stage_id == null && column.count > column.candidates.length && column.candidates.every((card) => isSelected(selection, card.id, column.stage)) && !selection.all && (
                <button
                  type="button"
                  className="mb-2 text-left text-xs font-medium text-[var(--primary)] underline"
                  onClick={() => onSelectionChange(selectAllMatching({ ...boardFilters, stage: column.stage }, column.count, column.stage))}
                >
                  Select all {column.count} in {columnLabel(column)}
                </button>
              )}

              <div className="flex min-h-24 flex-1 flex-col gap-2">
                {column.candidates.map((card) => (
                  <article
                    key={card.id}
                    draggable={canMove && card.stage !== "hired"}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(card.id));
                      setDragging({ card, fromIndex: columnIndex });
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setHoverKey(null);
                    }}
                    className={cn(
                      "rounded-xl border border-[var(--border)] bg-[var(--bg,transparent)] p-3 text-sm shadow-sm",
                      canMove && card.stage !== "hired" && "cursor-grab active:cursor-grabbing",
                      card.status === "inactive" && "opacity-60"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {canMove && (
                        <input
                          type="checkbox"
                          className="mt-1"
                          aria-label={`Select ${card.full_name}`}
                          disabled={!canToggle(selection, card.stage)}
                          checked={isSelected(selection, card.id, card.stage)}
                          onChange={() => onSelectionChange((previous) => toggleOne(previous, card.id, card.stage))}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <Link to={`/recruitment/candidates/${card.id}`} className="font-medium hover:underline">{card.full_name}</Link>
                        <p className="truncate text-xs text-[var(--muted)]">{card.job_title ?? "-"}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-[var(--muted)]">
                      {card.rating ? <span title="Rating">{"★".repeat(card.rating)}</span> : null}
                      {card.source && <span className="rounded bg-[var(--border)]/50 px-1.5 py-0.5">{card.source}</span>}
                      {card.has_resume && <span className="rounded bg-[var(--border)]/50 px-1.5 py-0.5">CV</span>}
                      {card.knockout_failed && <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700" title="An answer did not meet a knockout requirement">knockout</span>}
                      <FitBadge score={card.fit_score} />
                      {card.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{tag}</span>)}
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">Applied {formatRecruitmentDate(card.applied_at)}</p>
                  </article>
                ))}
                {column.candidates.length === 0 && <p className="py-6 text-center text-xs text-[var(--muted)]">No candidates</p>}
                {column.count > column.candidates.length && (
                  <p className="text-center text-xs text-[var(--muted)]">
                    Showing {column.candidates.length} of {column.count}. Use the table view or filters to see the rest.
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {rejectTarget && <RejectModal candidate={rejectTarget} onClose={() => setRejectTarget(null)} />}
      {hireTargetId !== null && <HireModal candidateId={hireTargetId} onClose={() => setHireTargetId(null)} />}
    </div>
  );
}
