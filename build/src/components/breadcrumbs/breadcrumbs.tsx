import { Link, useLocation } from "react-router-dom";

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const items = pathname.split("/").filter(Boolean);
  return <div className="text-xs text-[var(--muted)]">Home {items.map((it, i) => <span key={i}>/ {it}</span>)}</div>;
}


