// Lightweight wrapper around the browser's native Notification API.
// Used to alert the user of an incoming call when the tab is backgrounded —
// this is NOT push (it can't reach a fully closed tab), it only fires while
// the page/process is alive but not focused.

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Ask for permission once. No-ops if already granted/denied or unsupported. */
export function requestNotificationPermission(): void {
  if (!isNotificationSupported()) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

export function showCallNotification(opts: {
  title: string;
  body: string;
  onClick?: () => void;
}): Notification | null {
  if (!isNotificationSupported() || Notification.permission !== "granted") return null;
  // Only relevant when the tab isn't already visible — avoid duplicate alerts
  // on top of the in-app incoming-call modal when the tab is focused.
  if (document.visibilityState === "visible") return null;

  const notification = new Notification(opts.title, {
    body: opts.body,
    tag: "incoming-call",
    requireInteraction: true,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
    opts.onClick?.();
  };

  return notification;
}
