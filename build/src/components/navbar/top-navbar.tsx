import { Menu } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLayoutStore } from "@/store/layout-store";
import { ThemeSwitcher } from "./theme-switcher";
import { NotificationDropdown } from "@/components/notifications/notification-dropdown";
import { ChatDropdown } from "@/components/chat/chat-dropdown";
import { Button } from "@/components/ui/button";
import { logoutRequest } from "@/services/auth-service";
import { useAuthStore } from "@/store/auth-store";
import { SearchBar } from "@/components/forms/search-bar";

export function TopNavbar() {
  const toggle = useLayoutStore((s) => s.toggleSidebar);
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [search, setSearch] = useState("");

  async function handleLogout() {
    await logoutRequest().catch(() => null);
    logout();
    window.location.href = "/auth/login";
  }

  function handleSearch(query: string) {
    if (!query) {
      return;
    }

    navigate(`/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <header className="sticky top-0 z-30 glass border-b border-[var(--border)] px-4 py-3 md:px-6">
      <div className="flex items-center gap-3">
        <button onClick={toggle} className="rounded-lg p-2 hover:bg-[var(--border)]/40" aria-label="Toggle sidebar">
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden min-w-0 md:block">
          <div className="text-sm font-semibold">Enterprise HRMS</div>
        </div>
        <SearchBar
          value={search}
          onChange={setSearch}
          onSubmit={handleSearch}
          placeholder="Search employees, payroll, reports..."
          className="ml-auto hidden w-full max-w-md md:block"
        />
        <div className="flex items-center gap-2">
          <ChatDropdown />
          <NotificationDropdown />
          <ThemeSwitcher />
          <Button variant="ghost" onClick={handleLogout}>Logout</Button>
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--primary)] text-xs font-bold text-white">{user?.name?.slice(0, 2).toUpperCase() ?? "HR"}</div>
        </div>
      </div>
    </header>
  );
}


