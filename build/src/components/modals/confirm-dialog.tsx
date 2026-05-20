import { Button } from "@/components/ui/button";

export function ConfirmDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return <div className="space-y-3"><p className="text-sm text-[var(--muted)]">Are you sure you want to continue?</p><div className="flex gap-2"><Button onClick={onConfirm}>Confirm</Button><Button variant="outline" onClick={onCancel}>Cancel</Button></div></div>;
}


