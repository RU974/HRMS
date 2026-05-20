import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";

export function StatsCard({ title, value, trend }: { title: string; value: string; trend: string }) {
  return <motion.div whileHover={{ y: -4 }}><Card className="glass"><p className="text-sm text-[var(--muted)]">{title}</p><h3 className="mt-2 text-2xl font-semibold">{value}</h3><p className="text-xs text-emerald-500">{trend}</p></Card></motion.div>;
}


