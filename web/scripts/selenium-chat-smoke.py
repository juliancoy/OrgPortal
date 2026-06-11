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
from selenium.webdriver.remote.webelement import WebElement
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
    try:
        driver.execute_cdp_cmd("Network.enable", {})
        driver.execute_cdp_cmd("Network.setCacheDisabled", {"cacheDisabled": True})
        driver.execute_cdp_cmd(
            "Network.setExtraHTTPHeaders",
            {"headers": {"Cache-Control": "no-cache", "Pragma": "no-cache"}},
        )
    except Exception:
        pass
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
              request = fetch('/pidp/auth/session/login', {
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
        print(f"[ui] token fallback session-status={token.get('sessionStatus')}")
        driver.get(portal_url(base_url, "/"))
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


def element_rect(driver: webdriver.Remote, element: WebElement) -> dict:
    rect = driver.execute_script(
        """
        const box = arguments[0].getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
        """,
        element,
    )
    if not isinstance(rect, dict):
        raise AssertionError("expected DOMRect payload from browser")
    return rect


def assert_no_horizontal_overflow(driver: webdriver.Remote, label: str) -> None:
    metrics = driver.execute_script(
        """
        return {
          innerWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth
        };
        """
    )
    scroll_width = max(int(metrics.get("scrollWidth") or 0), int(metrics.get("bodyScrollWidth") or 0))
    inner_width = int(metrics.get("innerWidth") or 0)
    if scroll_width > inner_width + 2:
        offenders = driver.execute_script(
            """
            const width = window.innerWidth;
            return Array.from(document.querySelectorAll('body *'))
              .map((el) => {
                const box = el.getBoundingClientRect();
                return {
                  tag: el.tagName.toLowerCase(),
                  className: String(el.className || '').slice(0, 120),
                  text: String(el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 90),
                  left: Math.round(box.left),
                  right: Math.round(box.right),
                  width: Math.round(box.width)
                };
              })
              .filter((item) => item.width > width || item.right > width + 2 || item.left < -2)
              .sort((a, b) => Math.max(b.width, b.right) - Math.max(a.width, a.right))
              .slice(0, 8);
            """
        )
        raise AssertionError(
            f"{label}: horizontal overflow detected ({scroll_width}px > {inner_width}px); offenders={offenders}"
        )


def assert_no_chat_panel_overflow(driver: webdriver.Remote, label: str) -> None:
    offenders = driver.execute_script(
        """
        return Array.from(document.querySelectorAll(
          '.portal-chat-room-header, .portal-chat-timeline, .portal-chat-composer, .portal-chat-message, .portal-chat-message p'
        ))
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            className: String(el.className || '').slice(0, 120),
            text: String(el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 90),
            clientWidth: el.clientWidth,
            scrollWidth: el.scrollWidth
          }))
          .filter((item) => item.scrollWidth > item.clientWidth + 2)
          .slice(0, 8);
        """
    )
    if offenders:
        raise AssertionError(f"{label}: internal chat panel overflow detected; offenders={offenders}")


def assert_native_chat_message_presentation(driver: webdriver.Remote, label: str, expect_grouped: bool = False) -> None:
    WebDriverWait(driver, 10).until(
        lambda d: abs(
            float(
                d.execute_script(
                    "return (document.querySelector('.portal-chat-timeline')?.scrollLeft || 0) + window.scrollX;"
                )
                or 0
            )
        )
        <= 1
    )
    sequence_label_count = int(
        driver.execute_script(
            """
            return document.querySelectorAll('.native-chat-sync-label').length;
            """
        )
    )
    if sequence_label_count:
        raise AssertionError(f"{label}: sequence sync label should not be visible")

    sequence_footer_text = driver.execute_script(
        """
        return Array.from(document.querySelectorAll('.native-chat-message-footer'))
          .map((el) => String(el.textContent || '').trim())
          .filter((text) => /^#\\d+/.test(text));
        """
    )
    if sequence_footer_text:
        raise AssertionError(f"{label}: message sequence footer should not be visible; saw={sequence_footer_text}")

    bubble_offenders = driver.execute_script(
        """
        const width = window.innerWidth;
        return Array.from(document.querySelectorAll('.portal-chat-message'))
          .map((el) => {
            const box = el.getBoundingClientRect();
            return {
              text: String(el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 90),
              left: Math.round(box.left),
              right: Math.round(box.right),
              width: Math.round(box.width)
            };
          })
          .filter((item) => item.left < -1 || item.right > width + 1 || item.width > width)
          .slice(0, 8);
        """
    )
    if bubble_offenders:
        raise AssertionError(f"{label}: message bubble leaves viewport; offenders={bubble_offenders}")

    if expect_grouped:
        grouped_count = int(
            driver.execute_script(
                """
                return document.querySelectorAll('.portal-chat-message.grouped').length;
                """
            )
        )
        if grouped_count < 1:
            raise AssertionError(f"{label}: expected sequential same-author messages to be grouped")


def assert_mobile_user_menu_within_viewport(driver: webdriver.Remote, label: str, screenshot_dir: pathlib.Path) -> None:
    driver.set_window_size(390, 844)
    WebDriverWait(driver, 30).until(lambda d: d.find_element(By.CSS_SELECTOR, ".portal-user-trigger"))
    driver.find_element(By.CSS_SELECTOR, ".portal-user-trigger").click()
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
    save_screenshot(driver, screenshot_dir, f"{label}-mobile-user-menu.png")
    left = float(metrics.get("left") or 0)
    right = float(metrics.get("right") or 0)
    top = float(metrics.get("top") or 0)
    bottom = float(metrics.get("bottom") or 0)
    width = float(metrics.get("width") or 0)
    inner_width = float(metrics.get("innerWidth") or 0)
    inner_height = float(metrics.get("innerHeight") or 0)
    scroll_width = float(metrics.get("scrollWidth") or 0)
    if not (
        left >= 0
        and right <= inner_width + 1
        and top >= 0
        and bottom <= inner_height + 1
        and width <= inner_width
        and scroll_width <= inner_width + 2
    ):
        raise AssertionError(f"{label}: mobile user menu leaves viewport; metrics={metrics}")
    driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
    try:
        WebDriverWait(driver, 3).until(lambda d: not d.find_elements(By.CSS_SELECTOR, ".portal-user-menu"))
    except Exception:
        driver.execute_script("document.querySelector('.portal-user-trigger')?.click();")


def assert_native_chat_sidebar(driver: webdriver.Remote, expected_name: str, label: str) -> None:
    shell = driver.find_element(By.CSS_SELECTOR, ".native-chat-shell")
    sidebar = driver.find_element(By.CSS_SELECTOR, ".native-chat-sidebar")
    main = driver.find_element(By.CSS_SELECTOR, ".portal-chat-main")
    toggle = driver.find_element(By.CSS_SELECTOR, ".native-chat-sidebar-toggle")
    active_button = driver.find_element(By.CSS_SELECTOR, ".portal-chat-room-btn.active")
    active_avatar = active_button.find_element(By.CSS_SELECTOR, ".portal-chat-room-avatar")
    active_name = active_button.find_element(By.CSS_SELECTOR, ".native-chat-room-name")

    def sidebar_is_collapsed(_: webdriver.Remote) -> bool:
        return "sidebar-expanded" not in shell.get_attribute("class").split()

    def sidebar_is_expanded(_: webdriver.Remote) -> bool:
        return "sidebar-expanded" in shell.get_attribute("class").split()

    WebDriverWait(driver, 10).until(sidebar_is_collapsed)
    if toggle.get_attribute("aria-expanded") != "false":
        raise AssertionError(f"{label}: collapsed sidebar should expose aria-expanded=false")
    if not active_avatar.is_displayed():
        raise AssertionError(f"{label}: active conversation avatar is not visible while collapsed")
    if active_name.value_of_css_property("display") != "none":
        raise AssertionError(f"{label}: active conversation name should be hidden while collapsed")
    if expected_name.lower() not in active_button.get_attribute("title").lower():
        raise AssertionError(f"{label}: active conversation title does not identify {expected_name!r}")

    collapsed_sidebar_rect = element_rect(driver, sidebar)
    collapsed_main_rect = element_rect(driver, main)
    collapsed_side_by_side = collapsed_sidebar_rect["right"] <= collapsed_main_rect["left"]
    collapsed_stacked = collapsed_sidebar_rect["bottom"] <= collapsed_main_rect["top"]
    if not (collapsed_side_by_side or collapsed_stacked):
        raise AssertionError(f"{label}: collapsed sidebar overlaps chat main")
    assert_no_horizontal_overflow(driver, f"{label} collapsed")
    assert_no_chat_panel_overflow(driver, f"{label} collapsed")

    try:
        toggle.click()
    except Exception:
        driver.execute_script("arguments[0].click();", toggle)
    WebDriverWait(driver, 10).until(sidebar_is_expanded)
    WebDriverWait(driver, 10).until(lambda _: active_name.is_displayed())
    if toggle.get_attribute("aria-expanded") != "true":
        raise AssertionError(f"{label}: expanded sidebar should expose aria-expanded=true")
    if expected_name.lower() not in active_name.text.lower():
        raise AssertionError(f"{label}: expanded sidebar did not show {expected_name!r}; saw {active_name.text!r}")

    if collapsed_side_by_side:
        WebDriverWait(driver, 10).until(
            lambda _: element_rect(driver, sidebar)["width"] > collapsed_sidebar_rect["width"] + 20
        )
    expanded_sidebar_rect = element_rect(driver, sidebar)
    expanded_main_rect = element_rect(driver, main)
    expanded_side_by_side = expanded_sidebar_rect["right"] <= expanded_main_rect["left"]
    expanded_stacked = expanded_sidebar_rect["bottom"] <= expanded_main_rect["top"]
    if not (expanded_side_by_side or expanded_stacked):
        raise AssertionError(f"{label}: expanded sidebar overlaps chat main")
    if expanded_side_by_side and expanded_sidebar_rect["width"] <= collapsed_sidebar_rect["width"]:
        raise AssertionError(f"{label}: sidebar did not widen after expansion")
    assert_no_horizontal_overflow(driver, f"{label} expanded")
    assert_no_chat_panel_overflow(driver, f"{label} expanded")

    try:
        toggle.click()
    except Exception:
        driver.execute_script("arguments[0].click();", toggle)
    WebDriverWait(driver, 10).until(sidebar_is_collapsed)
    WebDriverWait(driver, 10).until(lambda _: active_name.value_of_css_property("display") == "none")


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
    message_ab_followup = f"selenium chat smoke A followup {int(time.time())}"
    message_ba = f"selenium chat smoke B to A {int(time.time())}"

    driver_a = new_driver(args.selenium_url, args.width, args.height)
    driver_b = new_driver(args.selenium_url, args.width, args.height)

    try:
        print(f"[ui] logging in {args.robot_a_email}")
        login_via_ui(driver_a, args.base_url, args.robot_a_email, args.robot_a_password, screenshot_dir, "robot-a", args.smoke_secret)
        save_screenshot(driver_a, screenshot_dir, "01-robot-a-logged-in.png")
        assert_mobile_user_menu_within_viewport(driver_a, "01b-robot-a", screenshot_dir)
        driver_a.set_window_size(args.width, args.height)

        print(f"[ui] logging in {args.robot_b_email}")
        login_via_ui(driver_b, args.base_url, args.robot_b_email, args.robot_b_password, screenshot_dir, "robot-b", args.smoke_secret)
        save_screenshot(driver_b, screenshot_dir, "02-robot-b-logged-in.png")

        driver_a.get(portal_url(args.base_url, f"/chat?start=dm&user={urllib.parse.quote(robot_b_slug)}"))
        wait_for_chat_ready(driver_a)
        assert_native_chat_sidebar(driver_a, args.robot_b_name, "desktop robot-a")
        save_screenshot(driver_a, screenshot_dir, "03-robot-a-chat-ready.png")
        driver_a.set_window_size(args.mobile_width, args.mobile_height)
        wait_for_chat_ready(driver_a)
        save_screenshot(driver_a, screenshot_dir, "03b-robot-a-mobile-before-assert.png")
        assert_native_chat_sidebar(driver_a, args.robot_b_name, "mobile robot-a")
        save_screenshot(driver_a, screenshot_dir, "03b-robot-a-mobile-sidebar.png")
        send_chat_message(driver_a, message_ab)
        send_chat_message(driver_a, message_ab_followup)
        assert_native_chat_message_presentation(driver_a, "mobile robot-a after sequential send", expect_grouped=True)
        save_screenshot(driver_a, screenshot_dir, "04-robot-a-sent.png")

        driver_b.get(portal_url(args.base_url, f"/chat?start=dm&user={urllib.parse.quote(robot_a_slug)}"))
        wait_for_chat_ready(driver_b)
        assert_native_chat_sidebar(driver_b, args.robot_a_name, "desktop robot-b")
        driver_b.set_window_size(args.mobile_width, args.mobile_height)
        wait_for_chat_ready(driver_b)
        save_screenshot(driver_b, screenshot_dir, "05a-robot-b-mobile-before-assert.png")
        assert_native_chat_sidebar(driver_b, args.robot_a_name, "mobile robot-b")
        save_screenshot(driver_b, screenshot_dir, "05a-robot-b-mobile-sidebar.png")
        wait_for_body_text(driver_b, message_ab, timeout=60)
        wait_for_body_text(driver_b, message_ab_followup, timeout=60)
        assert_native_chat_message_presentation(driver_b, "mobile robot-b after receive", expect_grouped=True)
        save_screenshot(driver_b, screenshot_dir, "05-robot-b-received.png")
        send_chat_message(driver_b, message_ba)
        assert_native_chat_message_presentation(driver_b, "mobile robot-b after reply")
        save_screenshot(driver_b, screenshot_dir, "06-robot-b-replied.png")

        wait_for_body_text(driver_a, message_ba, timeout=75)
        assert_native_chat_message_presentation(driver_a, "mobile robot-a after reply", expect_grouped=True)
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
                "message_ab_followup": message_ab_followup,
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
    parser.add_argument("--mobile-width", type=int, default=int(os.environ.get("SELENIUM_CHAT_MOBILE_WIDTH", "390")))
    parser.add_argument("--mobile-height", type=int, default=int(os.environ.get("SELENIUM_CHAT_MOBILE_HEIGHT", "844")))
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
