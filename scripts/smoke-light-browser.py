"""Smoke test for the light browser inside the server image (Dockerfile, LIGHT_BROWSER=1).

Run in the built image, as its own user, with this file mounted in:

    docker run --rm -v "$PWD/scripts:/smoke:ro" suparagent:qa python /smoke/smoke-light-browser.py

Checks that the image's settings turn the browser on per agent, that the broker and the image's Chromium start
for one agent, that it opens and reads a page and clicks on it, and that release ends every process. Prints how
long the start took and how much memory the browser used, so the light browser's cost stays visible in CI.
"""
import functools
import http.server
import os
import re
import sys
import tempfile
import threading
import time
from pathlib import Path

sys.path.insert(0, "/app/backend")

from app.computers import local_browser  # noqa: E402
from app.computers.local_browser import LocalBrowser  # noqa: E402
from app.computers.service import browser_per_agent, local_browser_enabled  # noqa: E402

HTML = """<!doctype html><title>Light browser smoke</title><h1>Light browser smoke</h1>
<button onclick="this.textContent='Clicked'">Click me</button>"""


def call(browser, name, args=None):
    result = browser.request({"name": name, "args": args or {}, "owner": "smoke", "epoch": 1})
    text = "\n".join(part.get("text", "") for part in result.get("content", []))
    if result.get("isError"):
        raise SystemExit(f"{name} failed: {text[:500]}")
    return text


def group_rss_mb(pgid: int) -> float:
    total = 0
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            if os.getpgid(int(entry.name)) != pgid:
                continue
            for line in (entry / "status").read_text().splitlines():
                if line.startswith("VmRSS:"):
                    total += int(line.split()[1])
        except (OSError, ValueError):
            continue
    return total / 1024


def group_alive(pgid: int) -> bool:
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def main() -> None:
    assert local_browser_enabled(), "LOCAL_BROWSER_ENABLED should be on in this image"
    assert browser_per_agent(), "LOCAL_BROWSER_PER_AGENT should be on in this image"
    assert local_browser.broker_path().is_file(), f"broker missing at {local_browser.broker_path()}"
    chrome = local_browser.find_chrome()
    assert chrome, "no Chromium in the image"
    print("chromium:", chrome, "| sandbox usable:", local_browser.sandbox_usable(), "| user:", os.getuid())

    root = Path(tempfile.mkdtemp(prefix="smoke"))
    (root / "www").mkdir()
    (root / "www" / "index.html").write_text(HTML)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root / "www"))
    handler.log_message = lambda *a, **k: None
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    page = f"http://127.0.0.1:{server.server_address[1]}/"

    browser = LocalBrowser(root / "profiles", "agent-smoke", chrome=chrome, idle_seconds=120, state_dir=root / "state")
    try:
        started = time.monotonic()
        text = call(browser, "browser_open", {"url": page})
        opened = time.monotonic() - started
        assert "Light browser smoke" in text, text[:500]
        ref = re.search(r"\[(e[0-9a-f]+)\][^\n]*Click me", text)
        assert ref, text[:500]
        call(browser, "browser_click", {"ref": ref[1]})
        assert "Clicked" in call(browser, "browser_read")
        pgid = browser.process.pid
        rss = group_rss_mb(pgid)
        print(f"first page open (broker + Chromium start): {opened:.1f} s | browser memory: {rss:.0f} MB")
        assert opened < 30, "the browser took too long to start"
        assert (root / "state" / local_browser.CDP_FILE).is_file(), "live view port not published"
    finally:
        browser.release()
        server.shutdown()
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and group_alive(pgid):
        time.sleep(0.1)
    assert not group_alive(pgid), "broker and Chromium should be gone after release"
    print("light browser smoke: ok")


if __name__ == "__main__":
    main()
