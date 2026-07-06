import { motion } from "framer-motion";

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}><motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--card)] p-4 sm:p-6" onClick={(e) => e.stopPropagation()}><h3 className="mb-3 text-lg font-semibold">{title}</h3>{children}</motion.div></div>;
}


