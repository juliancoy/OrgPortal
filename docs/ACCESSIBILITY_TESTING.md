# Automated accessibility testing

Run from `portal/web`:

```bash
npm run test:a11y
npm run test:a11y:orca
```

`test:a11y` runs Chromium, axe WCAG A/AA checks, keyboard assertions, modal focus tests, and narrow-layout measurements. `test:a11y:orca` additionally runs the real Linux Orca screen reader and captures its generated speech. It uses an isolated Xvfb display and D-Bus session, so the keyboard automation does not operate the user's desktop.

The runner starts and stops its own local Vite server on an available port. API traffic is intercepted with synthetic data; external HTTP requests, WebSockets, and service workers are blocked. Registration and chat failure tests do not submit real accounts or messages. No test account, production password, or deployment is needed.

Outputs are under `web/.tmp/accessibility/browser/` and `web/.tmp/accessibility/orca/`:

- `results.json`: assertions, WCAG findings, incomplete checks, and harness errors.
- PNG screenshots for each scanned state.
- `speech.txt` and `orca-debug.log` in the Orca run: actual Orca-generated output and diagnostic events. The speech transcript is not an audio recording or a human listening assessment.

Set `A11Y_OUTPUT=/absolute/output/path` to retain a run elsewhere. Use different directories for concurrent runs. To debug one scenario, use its exact name, for example `A11Y_SCENARIO='chat failure announcement' npm run test:a11y:orca`. An unmatched name is an error. Exit status **0** means these tests found no failures; **1** means accessibility failures; **2** means a harness/setup error that needs investigation. A clean result is limited to the tested states, not whole-platform certification.

The current portal has known accessibility defects, so a working test run is expected to exit **1** until those defects are fixed. No expected-failure allowances or baselines suppress the findings.

## Results from September 9, 2026

Both complete runs finished with **zero harness errors**, using Chromium 147.0.7727.15 and axe 4.13.0. The screen-reader run used Orca 46.1. Each scanned the same **22 states**, with WCAG violations in **17**. The reported rules were text contrast, input labeling, and select naming. Counts describe sampled states and assertions, not distinct defects or a compliance percentage.

| Run | Passed assertions | Failed assertions | Exit status |
| --- | ---: | ---: | ---: |
| Browser/keyboard | 4 | 8 | 1 |
| Browser/keyboard plus real Orca | 9 | 9 | 1 |

The registration-error and photo dialogs failed initial focus, Tab containment, and Escape dismissal. Departments retained the login page title. The chat failure lacked live-region markup; after a successful live-region control on the same page, Orca generated no announcement of the failure. Orca announced the login Email and Password fields, while the finance sort control was announced as a combo box and its value without a field name. The timebank Add offer dialog passed initial focus, the eight-Tab sample, Escape dismissal, and focus return.

No document-level horizontal overflow was measured in these 22 states. This alone does not establish complete reflow, zoom, or text-spacing conformance. Axe's incomplete checks remain unresolved and are recorded separately.

Retained evidence: [browser results](accessibility-2026-09-09/automated-browser-results.json), [Orca results](accessibility-2026-09-09/automated-orca-results.json), [actual generated speech](accessibility-2026-09-09/orca-speech.txt), and [source fingerprints](accessibility-2026-09-09/automated-source-manifest.json). These results concern the local checkout and synthetic states. The earlier review separately documents production observations.

## What is installed on this workstation

Verified September 9, 2026: Ubuntu 24.04; Orca 46.1; Xvfb, xauth, D-Bus, AT-SPI, xdotool, speech-dispatcher, Playwright, and Chromium are available. The project now includes pinned `@axe-core/playwright` 4.13.0. No additional system installation is needed to run these two commands here.

On another Ubuntu machine, install the project dependencies and Linux desktop tools:

```bash
sudo apt update
sudo apt install orca xvfb xauth dbus-x11 xdotool
cd portal/web
npm ci
npx playwright install --with-deps chromium
```

Use the repository's supported Node version. Orca's package brings its desktop accessibility and speech dependencies. The installed runner does not need Python dogtail/pyatspi, a browser extension, or a paid scanning service.

## Test coverage and boundaries

The suite checks login controls, registration error handling, the profile-photo dialog, a failed chat send, timebank Add offer, finance labeling, route titles, and both themes at 320 CSS pixels for login, registration, About, profile, settings, ID, calendar, and timebanking. Timebank data is an empty board; benefit intake, populated exchange flows, media, native apps, and third-party OAuth completion remain outside this repeatable suite. See the broader [review](ACCESSIBILITY_REVIEW_2026-09-09.md) for the previously audited surfaces and remaining acceptance work.

Before treating absence of an announcement as a product failure, the Orca run verifies that a named input and a known-good live region produce speech. A second live-region control runs in the chat page itself. Orca 46 buffers debug logs by default; a test-only preferences customization enables line-buffered diagnostics without changing speech generation. After navigation, the runner sends Control to stop automatic page reading before establishing focus, avoiding an interruption that restores an earlier reading cursor. Calibration/setup failures produce exit 2.

The suite reads actual screen-reader output from [Orca's diagnostic facility](https://orca.gnome.org/debugging), not an inferred transcript assembled from DOM text. Its keyboard events use xdotool on the private display. Browser-driven field setup is used to establish test state. The [Playwright accessibility guidance](https://playwright.dev/docs/accessibility-testing) describes the complementary role and limitations of axe checks.

## What is needed for other screen readers

| Coverage | Required environment and installation |
| --- | --- |
| NVDA | A Windows machine or Windows VM with an interactive desktop, NVDA, Chrome/Firefox, and Node.js. [NVDA information/download](https://www.nvaccess.org/about-nvda/) |
| VoiceOver | A Mac with Safari; VoiceOver is built into macOS. Node.js plus screen-reader automation permissions are needed for an automated runner. iOS VoiceOver requires separate device testing. |
| TalkBack | An Android device or suitable emulator with Chrome and TalkBack. If absent, install/update Android Accessibility Suite. This workstation already has ADB, but no Android device was connected when checked. [Google TalkBack setup](https://support.google.com/accessibility/android/answer/6283677?hl=en) |

For Windows NVDA and macOS VoiceOver, Guidepup provides real-screen-reader automation. On the target machine, the documented setup is:

```bash
npm install --save-dev @guidepup/guidepup
npx @guidepup/setup setup
npx @guidepup/setup install
```

Complete the platform permissions requested by the setup tool. These are preparatory commands; this repository's runner currently implements Orca, not a Guidepup test suite. [Guidepup setup](https://www.guidepup.dev/docs/guides/machine-setup) · [Supported platforms](https://www.guidepup.dev/docs/reference/support-matrix)

Installing NVDA or VoiceOver packages into Ubuntu does not provide those operating-system accessibility stacks. A virtual DOM screen reader also does not replace them. Automated screen-reader checks provide repeatable evidence, but human testing remains necessary for usability, understandable announcements, and complete task success.
