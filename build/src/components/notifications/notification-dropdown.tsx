import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { listNotifications } from "@/services/notification-service";

export function NotificationDropdown() {
  const { data } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => listNotifications({ read: "unread" })
  });
  const unread = data?.length ?? 0;
  return <Button variant="ghost" className="relative"><Bell className="h-4 w-4" />{unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-[var(--primary)] px-1 text-[10px] text-white">{unread}</span>}</Button>;
}


