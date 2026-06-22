"""
HRMS Biometric Local Agent
--------------------------
Runs on any Windows/Linux PC on the same LAN as the ZKTeco device.
Fetches attendance logs and pushes them to the cloud HRMS API.

Requirements:
    pip install pyzk requests

Usage:
    python agent.py

Schedule via Windows Task Scheduler or cron to run every 15 minutes.
"""

import json
import os
import sys
import logging
from datetime import datetime, timedelta
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("Missing dependency: pip install requests")

try:
    from zk import ZK
except ImportError:
    sys.exit("Missing dependency: pip install pyzk")

# ── Configuration ─────────────────────────────────────────────────────────────

DEVICE_IP           = os.environ.get("DEVICE_IP",           "192.168.100.251")
DEVICE_PORT         = int(os.environ.get("DEVICE_PORT",     "4370"))
DEVICE_ID           = int(os.environ.get("DEVICE_ID",       "1"))        # biometric_devices.id on server
COMM_KEY            = int(os.environ.get("COMM_KEY",        "0"))        # 0 = no password
TIMEOUT             = int(os.environ.get("DEVICE_TIMEOUT",  "10"))

API_URL             = os.environ.get("API_URL",    "https://your-server.com/api/biometric-agent/push")
API_SECRET          = os.environ.get("API_SECRET", "your-agent-secret-here")

STATE_FILE          = Path(os.environ.get("STATE_FILE", "last_sync.json"))
CLEAR_AFTER_SYNC    = os.environ.get("CLEAR_AFTER_SYNC", "true").lower() == "true"

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("biometric-agent")

# ── State (tracks last sync time so we only push new records) ─────────────────

def load_last_sync() -> datetime:
    if STATE_FILE.exists():
        try:
            data = json.loads(STATE_FILE.read_text())
            return datetime.fromisoformat(data["last_sync"])
        except Exception:
            pass
    return datetime.utcnow() - timedelta(hours=24)


def save_last_sync(ts: datetime) -> None:
    STATE_FILE.write_text(json.dumps({"last_sync": ts.isoformat()}))

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    log.info("Connecting to device %s:%d …", DEVICE_IP, DEVICE_PORT)

    zk = ZK(DEVICE_IP, port=DEVICE_PORT, timeout=TIMEOUT, password=COMM_KEY, force_udp=False, ommit_ping=False)
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

        log.info("Found %d new punches since %s.", len(punches), last_sync.strftime("%Y-%m-%d %H:%M:%S"))

        if not punches:
            log.info("Nothing to push.")
            save_last_sync(datetime.utcnow())
            return

        # ── Push to cloud API ─────────────────────────────────────────────────
        log.info("Pushing to %s …", API_URL)

        resp = requests.post(
            API_URL,
            json={"device_id": DEVICE_ID, "punches": punches},
            headers={"Authorization": f"Bearer {API_SECRET}", "Accept": "application/json"},
            timeout=30,
        )

        if resp.status_code == 200:
            data = resp.json()
            log.info("Success — matched: %d, unmatched: %d.", data.get("matched", "?"), data.get("unmatched", "?"))
            save_last_sync(datetime.utcnow())

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
    main()
