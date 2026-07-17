import Echo from 'laravel-echo';
import Pusher, { type ChannelAuthorizationCallback } from 'pusher-js';
import { useAuthStore } from '@/store/auth-store';
(window as any).Pusher = Pusher;

export const echo = new Echo({
  broadcaster: 'reverb',
  key: import.meta.env.VITE_REVERB_APP_KEY,
  wsHost: import.meta.env.VITE_REVERB_HOST,
  wsPort: import.meta.env.VITE_REVERB_PORT ?? 8080,
  wssPort: import.meta.env.VITE_REVERB_PORT ?? 443,
  forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
  enabledTransports: ['ws', 'wss'],
  // Read the token at auth time (not at module import time) so it is always
  // current regardless of when the user logged in during this session.
  authorizer: (channel: { name: string }) => ({
    authorize: (socketId: string, callback: ChannelAuthorizationCallback) => {
      fetch('/api/broadcasting/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${useAuthStore.getState().token ?? ''}`,
        },
        body: JSON.stringify({ socket_id: socketId, channel_name: channel.name }),
      })
        .then((res) => res.json())
        .then((data) => callback(null, data))
        .catch((err: Error) => callback(err, null));
    },
  }),
});
