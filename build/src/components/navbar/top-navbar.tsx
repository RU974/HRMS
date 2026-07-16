import { Menu, Search, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLayoutStore } from "@/store/layout-store";
import { ThemeSwitcher } from "./theme-switcher";
import { NotificationDropdown } from "@/components/notifications/notification-dropdown";
import { ChatDropdown } from "@/components/chat/chat-dropdown";
import { useAuthStore } from "@/store/auth-store";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getInitials(name?: string | null) {
  if (!name) return "HR";
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function getAvatarHue(name?: string | null) {
  if (!name) return 220;
  return name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
}

export function TopNavbar() {
  const toggle    = useLayoutStore((s) => s.toggleSidebar);
  const navigate  = useNavigate();
  const { user }  = useAuthStore();
  const [search, setSearch]         = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  function handleSearch(q: string) {
    if (!q.trim()) return;
    navigate(`/search?q=${encodeURIComponent(q.trim())}`);
    setSearch("");
    setSearchOpen(false);
  }

  const initials   = getInitials(user?.name);
  const hue        = getAvatarHue(user?.name);
  const role       = user?.rolesRelation?.[0]?.name ?? user?.roles?.[0]?.name ?? "Employee";
  const avatarUrl  = user?.profile_image ?? user?.employee?.profile_image ?? null;

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--card)]/80 backdrop-blur-md">
      {/* accent line */}
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[var(--primary)] via-blue-400 to-violet-500" />

      <div className="flex h-14 items-center gap-3 px-4 md:px-5">

        {/* Sidebar toggle */}
        <button
          onClick={toggle}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--border)]/60 hover:text-[var(--text)]"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Brand — hidden on mobile when search open */}
        <div className={`hidden flex-col md:flex ${searchOpen ? "md:hidden" : ""}`}>
          <span className="text-[13px] font-bold leading-tight text-[var(--text)]">Enterprise HRMS</span>
          <span className="text-[10px] leading-tight text-[var(--muted)]">
            {getGreeting()}, {user?.name?.split(" ")[0] ?? "there"}
          </span>
        </div>

        {/* ── Search ── */}
        {/* Desktop inline */}
        <form
          onSubmit={e => { e.preventDefault(); handleSearch(search); }}
          className="relative mx-3 hidden flex-1 max-w-sm md:block"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employees, payroll, reports…"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] py-1.5 pl-8 pr-3 text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--primary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/10 transition"
          />
        </form>

        {/* Mobile search toggle */}
        {searchOpen && (
          <form
            onSubmit={e => { e.preventDefault(); handleSearch(search); }}
            className="absolute inset-x-0 top-0 z-10 flex h-14 items-center gap-2 border-b border-[var(--border)] bg-[var(--card)] px-4 md:hidden"
          >
            <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none"
            />
            <button type="button" onClick={() => { setSearchOpen(false); setSearch(""); }}
              className="grid h-7 w-7 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--border)]/60">
              <X className="h-4 w-4" />
            </button>
          </form>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right cluster */}
        <div className="flex items-center gap-1">
          {/* Mobile search icon */}
          <button
            onClick={() => setSearchOpen(true)}
            className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--border)]/60 hover:text-[var(--text)] md:hidden"
          >
            <Search className="h-4 w-4" />
          </button>

          <ChatDropdown />
          <NotificationDropdown />
          <ThemeSwitcher />

          {/* Divider */}
          <div className="mx-1 h-6 w-px bg-[var(--border)]" />

          {/* User pill */}
          <button
            onClick={() => navigate("/profile")}
            className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] py-1.5 pl-1.5 pr-3 transition hover:border-[var(--primary)]/30 hover:bg-[var(--primary)]/5"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={user?.name ?? "User"}
                className="h-6 w-6 shrink-0 rounded-lg object-cover shadow-sm"
              />
            ) : (
              <div
                className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[10px] font-black text-white shadow-sm"
                style={{ background: `hsl(${hue},60%,45%)` }}
              >
                {initials}
              </div>
            )}
            <div className="hidden flex-col items-start sm:flex">
              <span className="text-[11px] font-bold leading-tight text-[var(--text)]">
                {user?.name?.split(" ")[0] ?? "User"}
              </span>
              <span className="text-[9px] leading-tight text-[var(--muted)]">{role}</span>
            </div>
          </button>
        </div>

      </div>
    </header>
  );
}