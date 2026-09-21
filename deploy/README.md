# Deploying HRMS chat and audio/video calls

Runbook for whoever puts this on the production server. Everything here is
specific to chat, presence and calls; the rest of the application deploys as
before.

## 1. What runs where

| Component | Purpose | Port | Config |
|---|---|---|---|
| nginx | HTTPS, SPA, API proxy, websocket proxy | 443 | `deploy/nginx/hrms.conf` |
| PHP-FPM / Laravel | REST API, channel authorisation | (socket) | `backend/.env` |
| **Reverb** | Websocket server: chat events, call signalling | 8080 (loopback only) | `deploy/supervisor/hrms-realtime.conf` |
| Queue worker | Notifications, mail, exports | – | same supervisor file |
| Scheduler (cron) | `calls:expire-stale` every minute, `calls:prune-signals` daily | – | one crontab line, see below |
| **coturn** | TURN relay so calls work behind strict NAT / firewalls | 3478, 5349, 49152-65535 | `deploy/coturn/turnserver.conf` |

Calls are **peer-to-peer**: audio and video flow directly between browsers, or
through coturn when a direct path is impossible. HRMS servers only carry
signalling. That is why group calls are capped at 4 people (`CALL_MAX_PARTICIPANTS`).

## 2. Hard requirements

- **HTTPS.** Browsers refuse camera, microphone and screen capture on plain HTTP
  (except `localhost`). Users on an HTTP deployment get a "Calls need a secure
  connection" message and cannot make calls.
- **A TURN server.** Without one, roughly 10-20% of users (corporate firewalls,
  symmetric NAT, some mobile carriers) cannot connect to each other. Google's
  public STUN servers alone cannot fix that.
- **The scheduler cron.** Without it, calls whose participants disconnect stay
  "active" and those users show as busy.
- **Redis is not required** for a single app server. If you run more than one
  Reverb instance, set `REVERB_SCALING_ENABLED=true` and point Laravel at Redis.

## 3. Environment

### `backend/.env`

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://hrms.example.com
FRONTEND_URL=https://hrms.example.com
CORS_ALLOWED_ORIGINS=https://hrms.example.com

BROADCAST_CONNECTION=reverb
REVERB_APP_ID=<random number>
REVERB_APP_KEY=<random string>          # openssl rand -hex 16
REVERB_APP_SECRET=<random string>       # openssl rand -hex 32
# How THIS server reaches Reverb to publish events: loopback, plain http.
REVERB_HOST=127.0.0.1
REVERB_PORT=8080
REVERB_SCHEME=http
# Only your own site may open websockets. Never leave "*" in production.
REVERB_ALLOWED_ORIGINS=https://hrms.example.com
# Do not lower these: Reverb's 10 KB default drops long / non-English chat messages and big call offers.
REVERB_MAX_REQUEST_SIZE=1000000
REVERB_APP_MAX_MESSAGE_SIZE=1000000

# TURN (see section 5). Secret must equal coturn's static-auth-secret.
CALL_TURN_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349?transport=tcp
CALL_TURN_SECRET=<openssl rand -hex 32>
```

All other `CALL_*` values have safe defaults; see `backend/.env.example`.

### Frontend build (`build/.env.production`)

```dotenv
VITE_API_BASE_URL=/api/v1
# The browser reaches Reverb through nginx on 443:
VITE_REVERB_APP_KEY=<same as REVERB_APP_KEY>
VITE_REVERB_HOST=hrms.example.com
VITE_REVERB_PORT=443
VITE_REVERB_SCHEME=https
```

`VITE_*` values are baked into the bundle at build time, so rebuild after
changing them. There are no TURN settings in the frontend: the API issues
short-lived TURN credentials per user, so no credential ships in the bundle.

## 4. Deploy steps (in this order)

```bash
# 0. Back up the database first.

# 1. Backend
cd /var/www/hrms/backend
git pull
composer install --no-dev --optimize-autoloader
php artisan migrate --force
#    Adds host_id / heartbeat / soft-delete columns, seeds the `call:use`
#    permission for every role that has `chat:create`, and flushes cached
#    permissions so it takes effect immediately.

# 2. Move existing chat attachments off the public disk. New attachments are
#    already private; older files stay world-readable until this runs.
php artisan chat:secure-attachments --dry-run     # review
php artisan chat:secure-attachments

# 3. Cache config / routes, then restart long-running processes so they load new code
php artisan config:cache && php artisan route:cache
php artisan reverb:restart
php artisan queue:restart

# 4. Frontend
cd ../build && npm ci && npm run build            # output: build/dist

# 5. Web server / TURN (first deploy only, afterwards just reload)
sudo cp deploy/nginx/hrms.conf /etc/nginx/sites-available/hrms && sudo nginx -t && sudo systemctl reload nginx
sudo cp deploy/supervisor/hrms-realtime.conf /etc/supervisor/conf.d/ && sudo supervisorctl reread && sudo supervisorctl update
sudo cp deploy/coturn/turnserver.conf /etc/turnserver.conf && sudo systemctl restart coturn

# 6. Scheduler (first deploy only). Add to the crontab of the PHP user:
* * * * * cd /var/www/hrms/backend && php artisan schedule:run >> /dev/null 2>&1
```

Open on the firewall: `443/tcp`; on the TURN host `3478/udp+tcp`, `5349/tcp`,
`49152-65535/udp`. **Do not** expose 8080 publicly; only nginx talks to it.

## 5. Verify (do every item; each has an observable result)

1. **Scheduler is registered.** `php artisan schedule:list` shows
   `calls:expire-stale` (every minute) and `calls:prune-signals` (daily).
2. **Reverb is up.** `supervisorctl status hrms-reverb` is `RUNNING`. In the
   browser dev tools (Network > WS) an `/app/<key>` connection shows status
   `101` and stays open.
3. **Presence.** Log in as two users. In the chat sidebar each shows a green
   dot for the other within a couple of minutes (presence is refreshed about
   once a minute and the user list is re-read every minute).
4. **Realtime chat.** Send a message from user A. It appears for user B without
   a refresh, and B's navbar badge updates. Edit and delete it: B sees "edited"
   and "This message was deleted" without a refresh. B sees "A is typing…" while
   A types.
5. **A call.** A calls B. B gets a ringing dialog with sound (or a desktop
   notification if the tab is in the background). B accepts; both hear each
   other and the timer runs. B's second tab, if open, stops ringing.
6. **TURN really works.** Open
   <https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/>,
   add your TURN URL with a username and credential taken from
   `GET /api/v1/calls/config` (while logged in), and click Gather. A candidate
   of type **relay** must appear. No relay candidate means TURN is misconfigured
   and some users will not be able to connect.
7. **Across a restrictive network.** Repeat step 5 with one user on a phone
   hotspot or a corporate network. In `chrome://webrtc-internals` the selected
   candidate pair may be type `relay`, which is fine and expected there.
8. **Zombie cleanup.** Start a call, then kill one browser tab (or pull the
   network). Within about two minutes the other side sees the call end, and
   neither user is stuck as "busy".
9. **Attachments are private.** Copy an old attachment's former
   `/storage/chat-attachments/...` URL: it should now return 404.

## 6. Operating it

| Watch | Why |
|---|---|
| `supervisorctl status` (reverb, queue) | Reverb down = no realtime chat or calls |
| Reverb log `/var/log/hrms/reverb.log` | Connection and auth errors |
| Reverb open file descriptors | Each connected tab holds a socket; see the note in `supervisor/hrms-realtime.conf` |
| coturn log `/var/log/turnserver/turnserver.log` | Allocation failures, auth failures |
| Laravel log for `429` on `calls/*` | Rate limits: `call-signal` 600/min, `call-action` 30/min, `chat-send` 60/min per user |

Tuning lives in `backend/config/calls.php` (all env-driven). To turn a feature
off without a deploy: `CALL_VIDEO_ENABLED=false`, `CALL_SCREEN_SHARE_ENABLED=false`,
or remove the `call:use` permission from a role.

## 7. Rollback

Roll back the code, `php artisan reverb:restart`, `php artisan queue:restart`,
then rebuild the previous frontend.

Database: `php artisan migrate:rollback --step=2` reverts both new migrations.
Two things to know first:

- Dropping `chat_messages.deleted_at` makes **soft-deleted messages visible
  again** (their text is retained in the database). If that matters, do not roll
  the schema back; leaving the extra columns in place is harmless to old code.
- The permission migration only removes `call:use`.

## 8. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Nobody ever receives a call ring | Reverb not running, or nginx does not proxy `/app` with `Upgrade` headers, or `VITE_REVERB_*` wrong in the build |
| Websocket connects then is refused | `REVERB_ALLOWED_ORIGINS` does not include the site's exact origin (scheme + host) |
| "Calls need a secure connection" | Site served over HTTP |
| Call connects on the office network but not from home / mobile | No TURN, or TURN secret differs between `CALL_TURN_SECRET` and coturn, or UDP range blocked |
| Call stuck at "Connecting…" for one specific user | Their network blocks UDP: make sure `turns:` on 5349/tcp is in `CALL_TURN_URLS` |
| Users show as busy after a call | Scheduler cron not running (starting a new call also clears dead ones, but keep the cron) |
| Some long messages / calls stall, log says "Realtime event rejected by Reverb" | `REVERB_MAX_REQUEST_SIZE` too small; restart Reverb after raising it |
| Everyone appears offline | Users made no API request for 2 minutes and the tab is hidden; or clock skew between app servers |
| Camera works but no one can hear me | Browser microphone permission blocked; the call window shows a red mic button |

## 9. Known limits (by design of this release)

- Group calls are limited to 4 people (peer-to-peer mesh). More needs a media
  server (SFU), which is not included.
- No call recording, in-call chat or transcription.
- A user removed from a group keeps receiving live events on the websocket
  they already opened until they reconnect. They cannot load history or send,
  and their client drops the thread when told; but the server cannot force-close
  a subscription.
- No malware scanning of chat uploads. Uploads are restricted by type and size
  and are only served through an authorised endpoint with `nosniff`; add
  ClamAV in front if your policy requires it.
- Read receipts refresh on a 30 second poll (there is no push event for them).
- Selecting a speaker (audio output) is not supported by Safari or Firefox.
