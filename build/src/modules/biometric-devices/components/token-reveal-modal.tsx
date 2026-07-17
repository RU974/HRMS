import { useState } from "react";
import { Modal } from "@/components/modals/modal";
import { Button } from "@/components/ui/button";

export interface TokenRevealModalProps {
  deviceName: string;
  token: string;
  onClose: () => void;
}

export function TokenRevealModal({ deviceName, token, onClose }: TokenRevealModalProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal title="Agent Token" onClose={onClose}>
      <p className="mb-3 text-sm text-[var(--muted)]">
        This is the one-time token for <span className="font-semibold text-[var(--text)]">{deviceName}</span>.
        Copy it into the agent's <code className="rounded bg-[var(--border)] px-1 py-0.5">.env</code> file as{" "}
        <code className="rounded bg-[var(--border)] px-1 py-0.5">DEVICE_TOKEN</code>. It will not be shown again —
        if you lose it, regenerate a new one from this device's row.
      </p>
      <div className="mb-4 break-all rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs">
        {token}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleCopy}>{copied ? "Copied!" : "Copy Token"}</Button>
        <Button variant="primary" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
