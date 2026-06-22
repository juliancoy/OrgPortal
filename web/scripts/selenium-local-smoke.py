#!/usr/bin/env python3
"""Local portal route smoke checks via remote Selenium."""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


def wait_for_any_text(driver: webdriver.Remote, needles: list[str], timeout: int = 20) -> str | None:
    lower_needles = [needle.lower() for needle in needles]

    def matched(_: webdriver.Remote) -> str | None:
        body = (driver.find_element(By.TAG_NAME, "body").text or "").lower()
        for index, needle in enumerate(lower_needles):
            if needle in body:
                return needles[index]
        return None

    try:
        return WebDriverWait(driver, timeout).until(matched)
    except Exception:
        return None


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
    inner_width = int(metrics.get("innerWidth") or 0)
    scroll_width = max(int(metrics.get("scrollWidth") or 0), int(metrics.get("bodyScrollWidth") or 0))
    if scroll_width <= inner_width + 2:
        return

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
    raise AssertionError(f"{label}: horizontal overflow ({scroll_width}px > {inner_width}px); offenders={offenders}")


def settle_route(driver: webdriver.Remote) -> None:
    WebDriverWait(driver, 25).until(lambda d: d.execute_script("return document.readyState") == "complete")
    driver.execute_script("window.scrollTo(0, 0)")
    WebDriverWait(driver, 10).until(lambda d: d.execute_script("return window.scrollY") == 0)


def body_excerpt(driver: webdriver.Remote) -> str:
    text = driver.find_element(By.TAG_NAME, "body").text or ""
    return " ".join(text.split())[:300]


def new_driver(selenium_url: str, width: int, height: int) -> webdriver.Remote:
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument(f"--window-size={width},{height}")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    driver = webdriver.Remote(command_executor=selenium_url, options=options)
    driver.set_page_load_timeout(35)
    return driver


def run(args: argparse.Namespace) -> int:
    screenshot_dir = pathlib.Path(args.screenshot_dir).resolve()
    screenshot_dir.mkdir(parents=True, exist_ok=True)

    routes: list[tuple[str, list[str]]] = [
        ("/", ["Log In", "Register"]),
        ("/users/login", ["New here?", "Register"]),
        ("/users/register", ["Create", "Register"]),
        ("/governance", ["Governance", "Motion"]),
        ("/governance/roberts", ["Robert", "Motion"]),
        ("/finance", ["Your current balance", "Network circulation", "Sign in required"]),
        ("/send?t=acct_1&a=12.50", ["Send Dena", "Recipient", "Amount"]),
        ("/receive", ["Receive Dena", "Request payment", "Latest incoming transfers"]),
        ("/users/chat-robot-a-2def1bd3", ["Download Contact", "Save this profile as a vCard"]),
    ]
    viewports: list[tuple[str, int, int]] = [
        ("desktop", 1440, 1000),
        ("mobile", 390, 844),
    ]

    checks: list[dict[str, object]] = []
    for viewport_label, width, height in viewports:
        for index, (path, expected) in enumerate(routes, start=1):
            driver = new_driver(args.selenium_url, width, height)
            try:
                url = f"{args.base_url.rstrip('/')}{path}"
                driver.get(url)
                WebDriverWait(driver, 25).until(lambda d: d.find_element(By.TAG_NAME, "body"))
                settle_route(driver)
                matched = wait_for_any_text(driver, expected, timeout=20)
                assert_no_horizontal_overflow(driver, f"{viewport_label} {path}")
                file_name = f"{viewport_label}-{index:02d}-{path.strip('/').replace('/', '_').replace('?', '_').replace('&', '_').replace('=', '-') or 'home'}.png"
                screenshot = screenshot_dir / file_name
                driver.save_screenshot(str(screenshot))
                ok = matched is not None
                print(
                    f"[check] {viewport_label} {path} expected='{' | '.join(expected)}' "
                    f"matched='{matched}' ok={ok} screenshot={screenshot}"
                )
                if not ok:
                    print(f"[check] {viewport_label} {path} body='{body_excerpt(driver)}'")
                checks.append(
                    {
                        "viewport": viewport_label,
                        "path": path,
                        "expected": expected,
                        "matched": matched,
                        "ok": ok,
                        "screenshot": str(screenshot),
                    }
                )
            finally:
                driver.quit()

    failed = [check for check in checks if not check["ok"]]
    print(json.dumps({"base_url": args.base_url, "checks": checks, "failed_count": len(failed)}, indent=2))
    return 1 if failed else 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run local portal Selenium smoke checks.")
    parser.add_argument("--selenium-url", default=os.environ.get("SELENIUM_URL", "http://127.0.0.1:4444/wd/hub"))
    parser.add_argument("--base-url", default=os.environ.get("PORTAL_BASE_URL", "http://host.docker.internal:4174"))
    parser.add_argument(
        "--screenshot-dir",
        default=os.environ.get("PORTAL_SELENIUM_SHOT_DIR", "/tmp/codecollective-local-selenium-shots"),
    )
    return parser.parse_args()


if __name__ == "__main__":
    sys.exit(run(parse_args()))
