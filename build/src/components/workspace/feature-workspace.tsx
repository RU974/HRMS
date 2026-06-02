import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";

export type WorkspaceLink = {
  key: string;
  title: string;
  description: string;
  path: string;
};

export type WorkspaceStat = {
  label: string;
  value: string | number;
  note: string;
};

interface FeatureWorkspaceProps {
  workspaceLabel: string;
  heading: string;
  body: string;
  links: WorkspaceLink[];
  stats: WorkspaceStat[];
  nav?: React.ReactNode;
  layoutClassName?: string;
  introCardClassName?: string;
  linksGridClassName?: string;
  statsCardClassName?: string;
}

export function FeatureWorkspace({
  workspaceLabel,
  heading,
  body,
  links,
  stats,
  nav,
  layoutClassName = "lg:grid-cols-[1.25fr_0.75fr]",
  introCardClassName = "border-[var(--border)]/70 bg-gradient-to-br from-[var(--card)] to-[var(--border)]/15",
  linksGridClassName = "sm:grid-cols-2",
  statsCardClassName = "border-[var(--border)]/70",
}: FeatureWorkspaceProps) {
  return (
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      {nav ? <div className="mb-4">{nav}</div> : null}

      <div className={`mt-4 grid gap-4 ${layoutClassName}`}>
        <Card className={introCardClassName}>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{workspaceLabel}</p>
          <h2 className="mt-3 text-2xl font-semibold">{heading}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">{body}</p>

          <div className={`mt-6 grid gap-3 ${linksGridClassName}`}>
            {links.map((section) => (
              <Link
                key={section.key}
                to={section.path}
                className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--primary)]/40 hover:shadow-sm"
              >
                <p className="text-sm font-semibold">{section.title}</p>
                <p className="mt-2 text-sm text-[var(--muted)]">{section.description}</p>
              </Link>
            ))}
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {stats.map((item) => (
            <Card key={item.label} className={statsCardClassName}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{item.label}</p>
              <p className="mt-2 text-3xl font-semibold">{item.value}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">{item.note}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
