import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotificationStore } from "@/store/notification-store";

export function NotificationDropdown() {
  const unread = useNotificationStore((s) => s.notices.filter((n) => !n.read).length);
  return <Button variant="ghost" className="relative"><Bell className="h-4 w-4" />{unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-[var(--primary)] px-1 text-[10px] text-white">{unread}</span>}</Button>;
}


