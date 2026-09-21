let audioCtx: AudioContext | null = null;

/** A short, soft two-note chime. Silent (no throw) if the browser has not allowed audio yet. */
export function playMessageTone() {
  try {
    audioCtx = audioCtx && audioCtx.state !== "closed" ? audioCtx : new AudioContext();
    const ctx = audioCtx;
    if (ctx.state !== "running") return;

    const now = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);

      const start = now + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.08, start + 0.02);
      gain.gain.linearRampToValueAtTime(0, start + 0.18);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  } catch {
    /* audio is a nicety */
  }
}

export function desktopNotificationsSupported() {
  return typeof Notification !== "undefined";
}

export function desktopNotificationPermission(): NotificationPermission | "unsupported" {
  return desktopNotificationsSupported() ? Notification.permission : "unsupported";
}

/** Must be called from a user gesture (a click) or browsers ignore the request. */
export async function requestDesktopNotifications(): Promise<NotificationPermission | "unsupported"> {
  if (!desktopNotificationsSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showMessageNotification(title: string, body: string, tag: string, onClick: () => void) {
  if (!desktopNotificationsSupported() || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, tag });
    n.onclick = () => {
      window.focus();
      onClick();
      n.close();
    };
  } catch {
    /* notifications are best effort */
  }
}
