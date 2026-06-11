#!/usr/bin/env python3
"""Live UX smoke checks for dev.portal.arkavo.org via remote Selenium."""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait


def _http_json(method: str, url: str, body: bytes | None = None, headers: dict[str, str] | None = None) -> dict:
    request = urllib.request.Request(url=url, method=method, data=body, headers=headers or {})
    with urllib.request.urlopen(request, timeout=20) as response:
        raw = response.read().decode("utf-8")
    return json.loads(raw) if raw else {}


def ensure_portal_bot(pidp_base_url: str, email: str, password: str, full_name: str) -> str:
    register_payload = json.dumps({"email": email, "password": password, "full_name": full_name}).encode("utf-8")
    try:
        _http_json(
            "POST",
            f"{pidp_base_url}/auth/register",
            body=register_payload,
            headers={"content-type": "application/json"},
        )
        print(f"[bot] created {email}")
    except urllib.error.HTTPError as exc:
        if exc.code == 409:
            print(f"[bot] already exists {email}")
        else:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"register failed ({exc.code}): {detail}") from exc

    form = urllib.parse.urlencode({"username": email, "password": password}).encode("utf-8")
    token_payload = _http_json(
        "POST",
        f"{pidp_base_url}/auth/token",
        body=form,
        headers={"content-type": "application/x-www-form-urlencoded"},
    )
    access_token = str(token_payload.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError("token login succeeded but access_token was empty")
    return access_token


def wait_for_text(driver: webdriver.Remote, needle: str, timeout: int = 25) -> bool:
    needle_lower = needle.lower()

    def _has_text(_: webdriver.Remote) -> bool:
        body_text = (driver.find_element("tag name", "body").text or "").lower()
        return needle_lower in body_text

    try:
        WebDriverWait(driver, timeout).until(_has_text)
        return True
    except Exception:
        return False


def wait_for_any_text(driver: webdriver.Remote, needles: list[str], timeout: int = 25) -> tuple[bool, str | None]:
    for needle in needles:
        if wait_for_text(driver, needle, timeout=timeout):
            return True, needle
    return False, None


def login_via_ui(driver: webdriver.Remote, base_url: str, email: str, password: str) -> None:
    login_url = f"{base_url.rstrip('/')}/users/login"
    driver.get(login_url)
    WebDriverWait(driver, 25).until(lambda d: d.find_element(By.ID, "email"))
    driver.find_element(By.ID, "email").clear()
    driver.find_element(By.ID, "email").send_keys(email)
    driver.find_element(By.ID, "pw").clear()
    driver.find_element(By.ID, "pw").send_keys(password)
    driver.find_element(By.XPATH, "//button[normalize-space()='Login']").click()

    def _authenticated(_: webdriver.Remote) -> bool:
        if "/users/login" in driver.current_url:
            return False
        return bool(driver.execute_async_script(
            """
            const done = arguments[0];
            fetch('/pidp/auth/session-token', { credentials: 'include' })
              .then((resp) => done(resp.ok))
              .catch(() => done(false));
            """
        ))

    WebDriverWait(driver, 30).until(_authenticated)


def bootstrap_token_session(driver: webdriver.Remote, base_url: str, access_token: str) -> bool:
    print("[auth] bootstrapping token session via cookie exchange")
    driver.get(base_url.rstrip("/") + "/")
    try:
        ok = driver.execute_async_script(
            """
            const [token, done] = arguments;
            fetch('/pidp/auth/session/exchange', {
              method: 'POST',
              credentials: 'include',
              headers: { Authorization: `Bearer ${token}` },
            }).then((resp) => done(resp.ok)).catch(() => done(false));
            """,
            access_token,
        )
        if not ok:
            return False
        driver.refresh()
        WebDriverWait(driver, 30).until(
            lambda _: driver.execute_async_script(
                """
                const done = arguments[0];
                fetch('/pidp/auth/session-token', { credentials: 'include' })
                  .then((resp) => done(resp.ok))
                  .catch(() => done(false));
                """
            )
        )
        return True
    except Exception:
        return False


def assert_mobile_user_menu_within_viewport(driver: webdriver.Remote, base_url: str, screenshot_dir: pathlib.Path) -> tuple[bool, str]:
    driver.set_window_size(390, 844)
    driver.get(base_url.rstrip("/") + "/chat")
    WebDriverWait(driver, 30).until(lambda d: d.find_element(By.CSS_SELECTOR, ".portal-user-trigger"))
    trigger = driver.find_element(By.CSS_SELECTOR, ".portal-user-trigger")
    trigger.click()
    menu = WebDriverWait(driver, 10).until(lambda d: d.find_element(By.CSS_SELECTOR, ".portal-user-menu"))
    metrics = driver.execute_script(
        """
        const box = arguments[0].getBoundingClientRect();
        return {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          width: box.width,
          height: box.height
        };
        """,
        menu,
    )
    shot_path = screenshot_dir / "mobile-user-menu.png"
    driver.save_screenshot(str(shot_path))
    print(f"[check] mobile user menu metrics={metrics} screenshot={shot_path}")
    left = float(metrics.get("left") or 0)
    right = float(metrics.get("right") or 0)
    top = float(metrics.get("top") or 0)
    bottom = float(metrics.get("bottom") or 0)
    width = float(metrics.get("width") or 0)
    inner_width = float(metrics.get("innerWidth") or 0)
    inner_height = float(metrics.get("innerHeight") or 0)
    scroll_width = float(metrics.get("scrollWidth") or 0)
    ok = (
        left >= 0
        and right <= inner_width + 1
        and top >= 0
        and bottom <= inner_height + 1
        and width <= inner_width
        and scroll_width <= inner_width + 2
    )
    detail = f"left={left:.1f} right={right:.1f} width={width:.1f} viewport={inner_width:.1f}x{inner_height:.1f}"
    return ok, detail


def run_smoke(args: argparse.Namespace) -> int:
    screenshot_dir = pathlib.Path(args.screenshot_dir).resolve()
    screenshot_dir.mkdir(parents=True, exist_ok=True)

    access_token = (args.api_key or "").strip()
    used_sysadmin_api_key = bool(access_token)
    if used_sysadmin_api_key:
        print(f"[auth] using API key token={access_token[:14]}...{access_token[-8:]}")
    else:
        access_token = ensure_portal_bot(
            pidp_base_url=args.pidp_base_url.rstrip("/"),
            email=args.bot_email.strip().lower(),
            password=args.bot_password,
            full_name=args.bot_name.strip(),
        )
        print(f"[bot] token={access_token[:14]}...{access_token[-8:]}")

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--window-size=1600,1200")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")

    driver = webdriver.Remote(command_executor=args.selenium_url, options=options)
    driver.set_page_load_timeout(40)

    checks: list[tuple[str, str, bool]] = []
    try:
        if not bootstrap_token_session(driver, args.base_url, access_token):
            if used_sysadmin_api_key:
                raise RuntimeError("Token bootstrap failed while using API key")
            print(f"[auth] token bootstrap failed; falling back to UI login for {args.bot_email}")
            login_via_ui(driver, args.base_url, args.bot_email, args.bot_password)
        time.sleep(1.0)

        ok, detail = assert_mobile_user_menu_within_viewport(driver, args.base_url, screenshot_dir)
        print(f"[check] mobile user menu within viewport detail='{detail}' ok={ok}")
        checks.append(("mobile-user-menu", detail, ok))

        routes: list[tuple[str, list[str]]] = [
            ("/chat", ["Org Chat", "Connect Chat"]),
            ("/orgs", ["Organizations"]),
            ("/events", ["Upcoming Events"]),
            ("/search?q=org", ["Search"]),
            ("/tools/business-cards", ["Completed Scans"]),
            ("/people", ["Registered users directory"]),
            ("/governance", ["Governance"]),
        ]
        if used_sysadmin_api_key:
            routes.append(("/admin", ["SysAdmin"]))

        for index, (path, expected_options) in enumerate(routes, start=1):
            url = f"{args.base_url.rstrip('/')}{path}"
            driver.get(url)
            ok, matched = wait_for_any_text(driver, expected_options, timeout=30)
            file_name = f"{index:02d}-{path.strip('/').replace('/', '_').replace('?', '_').replace('=', '-') or 'home'}.png"
            shot_path = screenshot_dir / file_name
            driver.save_screenshot(str(shot_path))
            expected_label = " | ".join(expected_options)
            print(f"[check] {path} expected='{expected_label}' matched='{matched}' ok={ok} screenshot={shot_path}")
            checks.append((path, expected_label, ok))
    finally:
        driver.quit()

    failed = [item for item in checks if not item[2]]
    print(json.dumps({"base_url": args.base_url, "checks": checks, "failed_count": len(failed)}, indent=2))
    if failed:
        return 1
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run OrgPortal live UX smoke checks in remote Selenium.")
    parser.add_argument("--selenium-url", default=os.environ.get("SELENIUM_URL", "http://127.0.0.1:4444/wd/hub"))
    parser.add_argument("--base-url", default=os.environ.get("PORTAL_BASE_URL", "https://dev.portal.arkavo.org"))
    parser.add_argument("--pidp-base-url", default=os.environ.get("PIDP_BASE_URL", "https://dev.pidp.arkavo.org"))
    parser.add_argument("--bot-email", default=os.environ.get("PORTAL_BOT_EMAIL", "portal-bot@arkavo.org"))
    parser.add_argument("--bot-password", default=os.environ.get("PORTAL_BOT_PASSWORD", ""))
    parser.add_argument("--bot-name", default=os.environ.get("PORTAL_BOT_NAME", "Portal Bot"))
    parser.add_argument("--api-key", default=os.environ.get("ORG_SYSADMIN_API_KEY", ""))
    parser.add_argument(
        "--screenshot-dir",
        default=os.environ.get("PORTAL_SELENIUM_SHOT_DIR", "/tmp/orgportal-selenium-shots"),
    )
    args = parser.parse_args()
    if not args.api_key and not args.bot_password:
        parser.error("bot password required unless --api-key/ORG_SYSADMIN_API_KEY is provided")
    return args


if __name__ == "__main__":
    sys.exit(run_smoke(parse_args()))
