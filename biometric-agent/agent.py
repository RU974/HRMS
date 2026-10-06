"""
HRMS Biometric Local Agent
--------------------------
Runs on any Windows/Linux PC on the same LAN as the ZKTeco device.
Fetches attendance logs and pushes them to the cloud HRMS API.

Requirements:
    pip install pyzk requests python-dotenv

Usage:
    python agent.py                # push attendance logs
    python agent.py --sync-users   # sync enrolled users from device to HRMS
    python agent.py --discover     # scan LAN for ZKTeco devices and register in HRMS

Schedule via Windows Task Scheduler or cron to run every 15 minutes.
"""

import concurrent.futures
import json
import os
import sys
import logging
import warnings
from datetime import datetime, timedelta
from pathlib import Path

_ENV_FILE = Path(__file__).parent / ".env"

try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=_ENV_FILE, override=True)
except ImportError:
    # Manual fallback: parse .env ourselves if python-dotenv is missing
    if _ENV_FILE.exists():
        for _line in _ENV_FILE.read_text().splitlines():
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _, _v = _line.partition("=")
                os.environ.setdefault(_k.strip(), _v.strip())

try:
    import requests
    from requests.exceptions import SSLError as RequestsSSLError
except ImportError:
    sys.exit("Missing dependency: pip install requests")

try:
    from zk import ZK
except ImportError:
    sys.exit("Missing dependency: pip install pyzk")

# ── Configuration ─────────────────────────────────────────────────────────────

DEVICE_IP        = os.environ.get("DEVICE_IP",        "192.168.100.251")
DEVICE_PORT      = int(os.environ.get("DEVICE_PORT",  "4370"))
COMM_KEY         = int(os.environ.get("COMM_KEY",     "0"))
TIMEOUT          = int(os.environ.get("DEVICE_TIMEOUT", "10"))

API_URL          = os.environ.get("API_URL",    "https://your-server.com/api/v1/auth/biometric-agent/push")
API_SECRET       = os.environ.get("API_SECRET", "your-agent-secret-here")
DEVICE_TOKEN     = os.environ.get("DEVICE_TOKEN", "")
SYNC_USERS_URL   = os.environ.get("SYNC_USERS_URL", "")

SCAN_SUBNET      = os.environ.get("SCAN_SUBNET", "")
SCAN_PORT        = int(os.environ.get("SCAN_PORT",    "4370"))
SCAN_TIMEOUT     = int(os.environ.get("SCAN_TIMEOUT", "2"))
SCAN_WORKERS     = int(os.environ.get("SCAN_WORKERS", "50"))

STATE_FILE       = Path(os.environ.get("STATE_FILE", "last_sync.json"))
CLEAR_AFTER_SYNC = os.environ.get("CLEAR_AFTER_SYNC", "false").lower() == "true"
SSL_VERIFY       = os.environ.get("SSL_VERIFY", "true").lower() != "false"

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("biometric-agent")

if not SSL_VERIFY:
    # Suppress the InsecureRequestWarning when SSL verification is disabled
    warnings.filterwarnings("ignore", message="Unverified HTTPS request")

# ── Guards ────────────────────────────────────────────────────────────────────

_PLACEHOLDER_URL    = "your-server.com"
_PLACEHOLDER_SECRET = "your-agent-secret-here"


def _check_config() -> None:
    """Abort early if .env placeholders were not replaced."""
    if _PLACEHOLDER_URL in API_URL:
        log.error(
            "API_URL is still the placeholder value.\n"
            "  Copy .env.example → .env and set API_URL to your HRMS server URL."
        )
        sys.exit(1)
    if API_SECRET == _PLACEHOLDER_SECRET:
        log.error(
            "API_SECRET is still the placeholder value.\n"
            "  Set API_SECRET in your .env file to the token from HRMS → Settings → Biometric Agent."
        )
        sys.exit(1)


def _agent_headers() -> dict:
    """Auth headers for every HRMS API call: shared agent secret plus this
    device's own token (if one has been issued from HRMS → Biometric Devices).
    Older devices without a token still work off the shared secret alone."""
    headers = {"Authorization": f"Bearer {API_SECRET}", "Accept": "application/json"}
    if DEVICE_TOKEN:
        headers["X-Device-Token"] = DEVICE_TOKEN
    return headers


def _post(url: str, **kwargs) -> requests.Response:
    """Thin wrapper around requests.post with unified SSL error handling."""
    try:
        return requests.post(url, verify=SSL_VERIFY, **kwargs)
    except RequestsSSLError as exc:
        msg = str(exc)
        if "key too weak" in msg or "CERTIFICATE_VERIFY_FAILED" in msg:
            log.error(
                "SSL certificate error connecting to %s.\n"
                "  The server certificate may be self-signed or use a weak key.\n"
                "  To bypass (insecure, use only on trusted networks): set SSL_VERIFY=false in your .env",
                url,
            )
        else:
            log.error("SSL error: %s", exc)
        sys.exit(1)

# ── State ─────────────────────────────────────────────────────────────────────

def load_last_sync() -> datetime:
    """Return last sync time as naive UTC datetime."""
    if STATE_FILE.exists():
        try:
            data = json.loads(STATE_FILE.read_text())
            return datetime.fromisoformat(data["last_sync"]).replace(tzinfo=None)
        except Exception:
            pass
    return datetime.utcnow() - timedelta(hours=24)


def save_last_sync(ts: datetime | None = None) -> None:
    """Write last sync time as naive UTC ISO string."""
    ts = (ts or datetime.utcnow()).replace(tzinfo=None)
    STATE_FILE.write_text(json.dumps({"last_sync": ts.isoformat()}))


# ── Discovery ─────────────────────────────────────────────────────────────────

def _probe_ip(ip: str) -> dict | None:
    """Try ZK connect on ip:SCAN_PORT. Return device info dict or None."""
    try:
        zk = ZK(ip, port=SCAN_PORT, timeout=SCAN_TIMEOUT, password=0,
                force_udp=False, ommit_ping=True)
        conn = zk.connect()
        if not conn:
            return None
        try:
            serial      = conn.get_serialnumber()       or ""
            platform    = conn.get_platform()           or ""
            firmware    = conn.get_firmware_version()   or ""
            device_name = conn.get_device_name()        or ""
        except Exception:
            serial = platform = firmware = device_name = ""
        finally:
            try:
                conn.disconnect()
            except Exception:
                pass
        return {
            "ip_address":    ip,
            "port":          SCAN_PORT,
            "serial_number": serial.strip(),
            "platform":      platform.strip(),
            "firmware":      firmware.strip(),
            "device_name":   device_name.strip(),
        }
    except Exception:
        return None


def discover_devices() -> None:
    """Scan LAN subnet for ZKTeco devices and push results to HRMS."""
    # Derive subnet: use SCAN_SUBNET env var or auto-detect from DEVICE_IP
    subnet = SCAN_SUBNET.rstrip(".") if SCAN_SUBNET else ".".join(DEVICE_IP.split(".")[:3])
    ips    = [f"{subnet}.{i}" for i in range(1, 255)]

    log.info("Scanning %s.1–254 on port %d (%d threads, %ds timeout) …",
             subnet, SCAN_PORT, SCAN_WORKERS, SCAN_TIMEOUT)

    found = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=SCAN_WORKERS) as pool:
        futures = {pool.submit(_probe_ip, ip): ip for ip in ips}
        done = 0
        for future in concurrent.futures.as_completed(futures):
            done += 1
            result = future.result()
            if result:
                found.append(result)
                log.info("  ✓ %s:%d  serial=%s  platform=%s",
                         result["ip_address"], result["port"],
                         result["serial_number"] or "?",
                         result["platform"] or "?")
            if done % 50 == 0:
                log.info("  … %d/254 scanned", done)

    if not found:
        log.warning("No ZKTeco devices found on %s.0/24. "
                    "Verify device is powered on and on the same network.", subnet)
        return

    log.info("Found %d device(s). Pushing to HRMS …", len(found))

    discover_url = API_URL.rsplit("/push", 1)[0] + "/discovered-devices"
    resp = _post(
        discover_url,
        json={"devices": found},
        headers=_agent_headers(),
        timeout=30,
    )

    if resp.status_code == 200:
        data = resp.json()
        log.info("Done — new: %d, already registered: %d.", data.get("created", "?"), data.get("existing", "?"))
        log.info("Open HRMS → Attendance → Biometric Devices → click 'Scan for Devices' to claim them.")
    else:
        log.error("HRMS API returned HTTP %d: %s", resp.status_code, resp.text[:300])


# ── Sync users ────────────────────────────────────────────────────────────────

def sync_users_to_hrms() -> None:
    """Fetch all enrolled users from the device and push to HRMS."""
    log.info("Connecting to %s:%d to fetch enrolled users …", DEVICE_IP, DEVICE_PORT)

    zk   = ZK(DEVICE_IP, port=DEVICE_PORT, timeout=TIMEOUT, password=COMM_KEY,
              force_udp=False, ommit_ping=False)
    conn = None

    try:
        conn = zk.connect()
        conn.disable_device()
        log.info("Connected. Fetching enrolled users …")

        users = conn.get_users()
        payload = [
            {
                "device_user_id": str(u.user_id),
                "name": u.name.strip() if u.name else f"User {u.user_id}",
            }
            for u in users if u.user_id
        ]

        log.info("Found %d enrolled user(s).", len(payload))
        if not payload:
            log.info("No users to sync.")
            return

        target_url = SYNC_USERS_URL or (API_URL.rsplit("/push", 1)[0] + "/sync-users")
        log.info("Pushing %d user(s) to %s …", len(payload), target_url)

        resp = _post(
            target_url,
            json={"device_ip": DEVICE_IP, "device_port": DEVICE_PORT, "users": payload},
            headers=_agent_headers(),
            timeout=30,
        )

        if resp.status_code == 200:
            log.info("sync-users success — upserted: %d.", resp.json().get("upserted", "?"))
        else:
            log.error("sync-users API returned HTTP %d: %s", resp.status_code, resp.text[:300])

    except Exception as e:
        log.error("sync_users_to_hrms failed: %s", e)
        sys.exit(1)
    finally:
        if conn:
            try:
                conn.enable_device()
            except Exception:
                pass
            conn.disconnect()
            log.info("Disconnected.")


# ── Main — attendance push ────────────────────────────────────────────────────

def main():
    log.info("Connecting to %s:%d …", DEVICE_IP, DEVICE_PORT)

    zk   = ZK(DEVICE_IP, port=DEVICE_PORT, timeout=TIMEOUT, password=COMM_KEY,
              force_udp=False, ommit_ping=False)
    conn = None

    try:
        conn = zk.connect()
        conn.disable_device()
        log.info("Connected. Fetching attendance logs …")

        last_sync = load_last_sync()
        records   = conn.get_attendance()

        punches = []
        for r in records:
            if r.timestamp <= last_sync:
                continue
            punch_type = "out" if r.punch in (1, 5) else "in"
            punches.append({
                "device_user_id": str(r.user_id),
                "timestamp":      r.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                "type":           punch_type,
            })

        log.info("Found %d new punches since %s.",
                 len(punches), last_sync.strftime("%Y-%m-%d %H:%M:%S"))

        if not punches:
            log.info("Nothing to push.")
            save_last_sync()
            return

        log.info("Pushing to %s …", API_URL)
        resp = _post(
            API_URL,
            json={"device_ip": DEVICE_IP, "device_port": DEVICE_PORT, "punches": punches},
            headers=_agent_headers(),
            timeout=30,
        )

        if resp.status_code == 200:
            data = resp.json()
            log.info("Success — matched: %d, unmatched: %d.",
                     data.get("matched", "?"), data.get("unmatched", "?"))
            save_last_sync()
            if CLEAR_AFTER_SYNC:
                conn.clear_attendance()
                log.info("Cleared attendance logs from device.")
        else:
            log.error("API returned HTTP %d: %s", resp.status_code, resp.text[:300])

    except Exception as e:
        log.error("Agent failed: %s", e)
        sys.exit(1)
    finally:
        if conn:
            try:
                conn.enable_device()
            except Exception:
                pass
            conn.disconnect()
            log.info("Disconnected.")


if __name__ == "__main__":
    _check_config()
    if "--discover" in sys.argv:
        discover_devices()
    elif "--sync-users" in sys.argv:
        sync_users_to_hrms()
    else:
        main()
