import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header/page-header";
import { SearchBar } from "@/components/forms/search-bar";
import { searchGlobal } from "@/services/search-service";

export function SearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";
  const [draft, setDraft] = useState(query);

  useEffect(() => {
    setDraft(query);
  }, [query]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["global-search", query],
    queryFn: () => searchGlobal(query),
    enabled: query.length > 0,
    retry: false
  });

  function handleSubmit(nextQuery: string) {
    if (!nextQuery) {
      return;
    }

    navigate(`/search?q=${encodeURIComponent(nextQuery)}`);
  }

  const hasResults = (data?.categories.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search"
        subtitle="Search across employees, payroll, recruitment, performance, reports, and communication."
      />

      <Card className="space-y-4 border-[var(--border)]/70 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <div className="mb-2 text-sm font-medium text-[var(--text)]">Global search</div>
            <SearchBar
              value={draft}
              onChange={setDraft}
              onSubmit={handleSubmit}
              placeholder="Search anything in HRMS..."
              className="max-w-none"
            />
          </div>
          <div className="text-sm text-[var(--muted)] lg:pb-2">
            Press Enter to search the entire workspace.
          </div>
        </div>

        {query && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
            <span>
              {isLoading || isFetching ? "Searching..." : `${data?.total ?? 0} result${(data?.total ?? 0) === 1 ? "" : "s"}`}
            </span>
            <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs uppercase tracking-wide">
              {query}
            </span>
          </div>
        )}
      </Card>

      {!query && (
        <Card className="border-dashed border-[var(--border)]/80 p-6 text-sm text-[var(--muted)]">
          Type a name, department, payroll item, report, recruitment record, or performance item and press Enter.
        </Card>
      )}

      {error && query && (
        <Card className="border-red-500/30 bg-red-500/5 p-6 text-sm text-red-600">
          Unable to load search results. Try again in a moment.
        </Card>
      )}

      {query && !isLoading && !error && !hasResults && (
        <Card className="border-dashed border-[var(--border)]/80 p-6 text-sm text-[var(--muted)]">
          No matches found for <span className="font-medium text-[var(--text)]">{query}</span>.
        </Card>
      )}

      {data?.categories.map((category) => (
        <Card key={category.key} className="space-y-4 border-[var(--border)]/70 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{category.label}</h2>
              <p className="text-sm text-[var(--muted)]">{category.items.length} match{category.items.length === 1 ? "" : "es"}</p>
            </div>
            <span className="rounded-full bg-[var(--border)]/30 px-3 py-1 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {category.key.replaceAll("_", " ")}
            </span>
          </div>

          <div className="grid gap-3">
            {category.items.map((item) => (
              <Link
                key={`${category.key}-${item.id}`}
                to={item.path}
                className="rounded-2xl border border-[var(--border)]/70 bg-[var(--card)] p-4 transition hover:border-[var(--primary)]/40 hover:bg-[var(--border)]/20"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{item.title}</h3>
                    <span className="text-xs uppercase tracking-wide text-[var(--muted)]">{item.subtitle}</span>
                  </div>
                  <p className="text-sm text-[var(--muted)]">{item.detail}</p>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
