#!/usr/bin/env python3
"""Two-account native chat smoke test using remote Selenium.

The test provisions two PIdP robot users, enables their public contact pages,
logs each account in through the portal UI in a separate browser session, and
verifies that messages sent through the native chat UI arrive in both
directions.
"""

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
from selenium.webdriver import ChromeOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait


def http_json(method: str, url: str, body: bytes | None = None, headers: dict[str, str] | None = None) -> dict:
    request = urllib.request.Request(url=url, method=method, data=body, headers=headers or {})
    with urllib.request.urlopen(request, timeout=25) as response:
        raw = response.read().decode("utf-8")
    return json.loads(raw) if raw else {}


def portal_origin(base_url: str) -> str:
    parsed = urllib.parse.urlparse(base_url)
    return f"{parsed.scheme}://{parsed.netloc}"


def portal_url(base_url: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/{path.lstrip('/')}"


def slugify(value: str) -> str:
    safe = "".join(ch.lower() if ch.isalnum() else "-" for ch in value.strip())
    return "-".join(part for part in safe.split("-") if part)[:80] or "chat-robot"


def ensure_robot(pidp_base_url: str, email: str, password: str, full_name: str) -> str:
    form = urllib.parse.urlencode({"username": email, "password": password}).encode("utf-8")
    try:
      token_payload = _token_login(pidp_base_url, form)
      token = str(token_payload.get("access_token") or "").strip()
      if token:
          print(f"[robot] login ok {email}")
          return token
    except Exception:
      pass

    payload = json.dumps({"email": email, "password": password, "full_name": full_name}).encode("utf-8")
    try:
        http_json(
            "POST",
            f"{pidp_base_url.rstrip('/')}/auth/register",
            body=payload,
            headers={"content-type": "application/json"},
        )
        print(f"[robot] created {email}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        if exc.code == 409:
            print(f"[robot] already exists {email}")
        else:
            raise RuntimeError(f"register failed for {email} ({exc.code}): {detail}") from exc

    token_payload = _token_login(pidp_base_url, form)
    token = str(token_payload.get("access_token") or "").strip()
    if not token:
        raise RuntimeError(f"token login succeeded but access_token was empty for {email}")
    return token


def _token_login(pidp_base_url: str, form: bytes) -> dict:
    return http_json(
        "POST",
        f"{pidp_base_url.rstrip('/')}/auth/token",
        body=form,
        headers={"content-type": "application/x-www-form-urlencoded"},
    )


def ensure_contact_page(org_api_base_url: str, token: str, slug: str, headline: str) -> str:
    url = f"{org_api_base_url.rstrip('/')}/api/network/contact/me"
    body = json.dumps(
        {
            "enabled": True,
            "slug": slug,
            "headline": headline,
            "bio": "Automated Selenium chat smoke-test account.",
            "links": [],
        }
    ).encode("utf-8")
    payload = http_json(
        "PUT",
        url,
        body=body,
        headers={"authorization": f"Bearer {token}", "content-type": "application/json"},
    )
    resolved_slug = str(payload.get("slug") or slug)
    public_url = f"{org_api_base_url.rstrip('/')}/api/network/users/public/{urllib.parse.quote(resolved_slug)}"
    http_json("GET", public_url)
    print(f"[contact] {headline} slug={resolved_slug}")
    return resolved_slug


def new_driver(selenium_url: str, width: int, height: int) -> webdriver.Remote:
    options = ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument(f"--window-size={width},{height}")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    driver = webdriver.Remote(command_executor=selenium_url, options=options)
    driver.set_page_load_timeout(45)
    return driver


def login_via_ui(
    driver: webdriver.Remote,
    base_url: str,
    email: str,
    password: str,
    screenshot_dir: pathlib.Path,
    label: str,
    smoke_secret: str = "",
) -> None:
    driver.get(portal_url(base_url, "/users/login"))
    WebDriverWait(driver, 35).until(lambda d: d.find_element(By.ID, "email"))
    email_field = driver.find_element(By.ID, "email")
    password_field = driver.find_element(By.ID, "pw")
    email_field.clear()
    email_field.send_keys(email)
    password_field.clear()
    password_field.send_keys(password)
    driver.find_element(By.XPATH, "//button[normalize-space()='Login']").click()

    def authenticated(_: webdriver.Remote) -> bool:
        user_json = driver.execute_script("return window.localStorage.getItem('pidp.user')")
        return bool(user_json) and "/users/login" not in driver.current_url

    try:
        WebDriverWait(driver, 40).until(authenticated)
    except Exception:
        print(f"[ui] session hydration after form login timed out for {email}; trying browser token fallback")
        token = driver.execute_async_script(
            """
            const [email, password, smokeSecret, done] = arguments;
            let request;
            if (smokeSecret) {
              request = fetch('/pidp/auth/smoke-token', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, secret: smokeSecret })
              });
            } else {
              const body = new URLSearchParams();
              body.set('username', email);
              body.set('password', password);
              request = fetch('/pidp/auth/token', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body
              });
            }
            request.then(async (resp) => {
              if (!resp.ok) {
                done({ ok: false, status: resp.status, text: await resp.text().catch(() => '') });
                return;
              }
              const payload = await resp.json();
              const sessionResp = await fetch('/pidp/auth/session-token', { credentials: 'include' }).catch(() => null);
              done({ ok: true, token: payload.access_token || '', sessionStatus: sessionResp ? sessionResp.status : 0 });
            }).catch((err) => done({ ok: false, status: 0, text: String(err && err.message || err) }));
            """,
            email,
            password,
            smoke_secret,
        )
        if not isinstance(token, dict) or not token.get("ok") or not token.get("token"):
            save_screenshot(driver, screenshot_dir, f"login-failed-{label}.png")
            body = driver.find_element(By.TAG_NAME, "body").text
            print(f"[ui] login failed current_url={driver.current_url}")
            print(f"[ui] token fallback failed status={token.get('status') if isinstance(token, dict) else 'unknown'}")
            print(f"[ui] login failed body={body[:1000]}")
            raise
        if smoke_secret:
            print(f"[ui] smoke-token fallback session-status={token.get('sessionStatus')}")
            driver.get(portal_url(base_url, "/"))
        else:
            driver.get(portal_url(base_url, f"/auth/callback#token={urllib.parse.quote(str(token['token']))}"))
        try:
            WebDriverWait(driver, 40).until(authenticated)
        except Exception:
            save_screenshot(driver, screenshot_dir, f"login-fallback-failed-{label}.png")
            body = driver.find_element(By.TAG_NAME, "body").text
            print(f"[ui] fallback hydration failed current_url={driver.current_url}")
            print(f"[ui] fallback body={body[:1000]}")
            raise


def wait_for_body_text(driver: webdriver.Remote, text: str, timeout: int = 40) -> None:
    needle = text.lower()

    def found(_: webdriver.Remote) -> bool:
        body = driver.find_element(By.TAG_NAME, "body").text.lower()
        return needle in body

    WebDriverWait(driver, timeout).until(found)


def wait_for_chat_ready(driver: webdriver.Remote, timeout: int = 45) -> None:
    WebDriverWait(driver, timeout).until(lambda d: d.find_element(By.CSS_SELECTOR, ".portal-chat-composer textarea"))


def send_chat_message(driver: webdriver.Remote, message: str) -> None:
    textarea = driver.find_element(By.CSS_SELECTOR, ".portal-chat-composer textarea")
    textarea.click()
    textarea.clear()
    textarea.send_keys(message)
    textarea.send_keys(Keys.ENTER)
    wait_for_body_text(driver, message, timeout=25)


def save_screenshot(driver: webdriver.Remote, directory: pathlib.Path, name: str) -> None:
    path = directory / name
    driver.save_screenshot(str(path))
    print(f"[screenshot] {path}")


def run_smoke(args: argparse.Namespace) -> int:
    screenshot_dir = pathlib.Path(args.screenshot_dir).resolve()
    screenshot_dir.mkdir(parents=True, exist_ok=True)
    org_api_base_url = args.org_api_base_url or f"{portal_origin(args.base_url)}/api/org"

    if args.robots_preprovisioned:
        robot_a_slug = args.robot_a_slug
        robot_b_slug = args.robot_b_slug
        print("[robot] using pre-provisioned PIdP users and contact pages")
    else:
        robot_a_token = ensure_robot(args.pidp_base_url, args.robot_a_email, args.robot_a_password, args.robot_a_name)
        robot_b_token = ensure_robot(args.pidp_base_url, args.robot_b_email, args.robot_b_password, args.robot_b_name)
        robot_a_slug = ensure_contact_page(org_api_base_url, robot_a_token, args.robot_a_slug, args.robot_a_name)
        robot_b_slug = ensure_contact_page(org_api_base_url, robot_b_token, args.robot_b_slug, args.robot_b_name)

    message_ab = f"selenium chat smoke A to B {int(time.time())}"
    message_ba = f"selenium chat smoke B to A {int(time.time())}"

    driver_a = new_driver(args.selenium_url, args.width, args.height)
    driver_b = new_driver(args.selenium_url, args.width, args.height)

    try:
        print(f"[ui] logging in {args.robot_a_email}")
        login_via_ui(driver_a, args.base_url, args.robot_a_email, args.robot_a_password, screenshot_dir, "robot-a", args.smoke_secret)
        save_screenshot(driver_a, screenshot_dir, "01-robot-a-logged-in.png")

        print(f"[ui] logging in {args.robot_b_email}")
        login_via_ui(driver_b, args.base_url, args.robot_b_email, args.robot_b_password, screenshot_dir, "robot-b", args.smoke_secret)
        save_screenshot(driver_b, screenshot_dir, "02-robot-b-logged-in.png")

        driver_a.get(portal_url(args.base_url, f"/chat?start=dm&user={urllib.parse.quote(robot_b_slug)}"))
        wait_for_chat_ready(driver_a)
        save_screenshot(driver_a, screenshot_dir, "03-robot-a-chat-ready.png")
        send_chat_message(driver_a, message_ab)
        save_screenshot(driver_a, screenshot_dir, "04-robot-a-sent.png")

        driver_b.get(portal_url(args.base_url, f"/chat?start=dm&user={urllib.parse.quote(robot_a_slug)}"))
        wait_for_chat_ready(driver_b)
        wait_for_body_text(driver_b, message_ab, timeout=60)
        save_screenshot(driver_b, screenshot_dir, "05-robot-b-received.png")
        send_chat_message(driver_b, message_ba)
        save_screenshot(driver_b, screenshot_dir, "06-robot-b-replied.png")

        wait_for_body_text(driver_a, message_ba, timeout=75)
        save_screenshot(driver_a, screenshot_dir, "07-robot-a-received-reply.png")
    finally:
        driver_a.quit()
        driver_b.quit()

    print(
        json.dumps(
            {
                "ok": True,
                "base_url": args.base_url,
                "org_api_base_url": org_api_base_url,
                "robot_a_slug": robot_a_slug,
                "robot_b_slug": robot_b_slug,
                "message_ab": message_ab,
                "message_ba": message_ba,
            },
            indent=2,
        )
    )
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a two-account native chat UI smoke test in Selenium.")
    parser.add_argument("--selenium-url", default=os.environ.get("SELENIUM_URL", "http://127.0.0.1:4444/wd/hub"))
    parser.add_argument("--base-url", default=os.environ.get("PORTAL_BASE_URL", "https://codecollective.us/p"))
    parser.add_argument("--pidp-base-url", default=os.environ.get("PIDP_BASE_URL", "https://id.codecollective.us"))
    parser.add_argument("--org-api-base-url", default=os.environ.get("ORG_API_BASE_URL", ""))
    parser.add_argument("--robot-a-email", default=os.environ.get("CHAT_ROBOT_A_EMAIL", ""))
    parser.add_argument("--robot-a-password", default=os.environ.get("CHAT_ROBOT_A_PASSWORD", ""))
    parser.add_argument("--robot-a-name", default=os.environ.get("CHAT_ROBOT_A_NAME", "Code Collective Chat Robot A"))
    parser.add_argument("--robot-a-slug", default=os.environ.get("CHAT_ROBOT_A_SLUG", "chat-robot-a"))
    parser.add_argument("--robot-b-email", default=os.environ.get("CHAT_ROBOT_B_EMAIL", ""))
    parser.add_argument("--robot-b-password", default=os.environ.get("CHAT_ROBOT_B_PASSWORD", ""))
    parser.add_argument("--robot-b-name", default=os.environ.get("CHAT_ROBOT_B_NAME", "Code Collective Chat Robot B"))
    parser.add_argument("--robot-b-slug", default=os.environ.get("CHAT_ROBOT_B_SLUG", "chat-robot-b"))
    parser.add_argument("--width", type=int, default=int(os.environ.get("SELENIUM_CHAT_WIDTH", "1280")))
    parser.add_argument("--height", type=int, default=int(os.environ.get("SELENIUM_CHAT_HEIGHT", "900")))
    parser.add_argument(
        "--robots-preprovisioned",
        action="store_true",
        default=os.environ.get("CHAT_ROBOTS_PREPROVISIONED", "").strip().lower() in {"1", "true", "yes"},
    )
    parser.add_argument("--smoke-secret", default=os.environ.get("CHAT_SMOKE_TEST_SECRET", ""))
    parser.add_argument(
        "--screenshot-dir",
        default=os.environ.get("SELENIUM_CHAT_SHOT_DIR", "/tmp/codecollective-chat-selenium"),
    )
    args = parser.parse_args()
    missing = [
        name
        for name, value in [
            ("CHAT_ROBOT_A_EMAIL", args.robot_a_email),
            ("CHAT_ROBOT_A_PASSWORD", args.robot_a_password),
            ("CHAT_ROBOT_B_EMAIL", args.robot_b_email),
            ("CHAT_ROBOT_B_PASSWORD", args.robot_b_password),
        ]
        if not value
    ]
    if missing:
        parser.error(f"missing required robot credential env vars: {', '.join(missing)}")
    return args


if __name__ == "__main__":
    sys.exit(run_smoke(parse_args()))
