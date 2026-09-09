# Portal accessibility review — September 9, 2026

The reviewed portal does **not meet WCAG Level AA**: the production sample contains confirmed text-contrast, control-labeling, and page-title failures. Local member workflows also expose inaccessible modal behavior and unannounced chat errors. These are barriers to using the service, not merely visual polish.

Scope assumption: “EcoCollective” refers to the Code Collective portal in this workspace, deployed at <https://codecollective.us/p/>. No EcoCollective profile was found in its configuration. “WTAG” is interpreted as **WCAG**, the Web Content Accessibility Guidelines. A differently hosted EcoCollective site would require its own review.

This is a technical accessibility assessment, not a determination of the operator's legal status or a completed conformance evaluation. No application changes, account creation, real messages, benefit submissions, or deployments were performed.

## ADA and standards baseline

For a covered private business/public accommodation, DOJ guidance says ADA obligations extend to online access. DOJ's cited guidance does not prescribe a detailed Title III web technical standard. A WCAG finding is technical evidence of an access barrier; whether a particular operator violates the ADA requires its organizational and legal context. [DOJ web accessibility guidance](https://www.ada.gov/resources/web-guidance/)

For state/local government services, including services provided through contractors, the Title II web/mobile rule specifies **WCAG 2.1 AA**. DOJ's current fact sheet reflects the April 20, 2026 extension: entities with populations of at least 50,000 have an April 26, 2027 compliance date; smaller entities and special district governments have April 26, 2028. These dates do not suspend existing accessibility obligations. Do not apply the government deadlines to this portal merely because it provides civic features. [DOJ Title II rule fact sheet](https://www.ada.gov/resources/2024-03-08-web-rule/)

Use **WCAG 2.2 AA as the engineering acceptance target**, while retaining the applicable 2.1 checks if Title II governs. WCAG 2.2 adds requirements including unobscured focus, alternatives to dragging, target size, redundant entry, and accessible authentication. WCAG 2.2 is not automatically the statutory standard for every operator. Section 504/508, funding conditions, procurement terms, and state requirements were not assessed because the operator/funding facts were not supplied. [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## What was examined

| Surface | Evidence and coverage |
| --- | --- |
| Production portal | 14 routes in light and dark themes: `/`, `/users/login`, `/users/register`, `/about`, `/people`, `/orgs`, `/events`, `/search`, `/finance`, `/departments`, `/create`, `/orgs/register`, `/governance`, `/governance/propose`. Guest-visible states only. |
| Member workflows | Current local source with synthetic API fixtures: profile, settings, ID, chat conversation, health benefit, provider scheduling, life benefit, property/casualty, calendar integrations, and timebanking. Both themes. |
| Interaction checks | Registration error, photo editor, failed chat send, search suggestions, route transitions, keyboard focus, and timebank Add offer dialog. All submission/error simulations stayed within intercepted local fixtures. |
| Display checks | Desktop Chromium at 1440 or 1280 CSS pixels; 320-pixel reflow checks; public-page text-spacing overrides; selected screenshots; forced-colors emulation. |
| Identity provider | Production `/pidp/app/login?app=code-collective`, initial form and narrow layout. No login submission. |
| Source inspection | Shared styles, route/layout composition, forms, modal components, finance chart, video-call UI, timebank components, and existing accessibility-related checks. |

Tools: Playwright 1.59.1, Chromium 147.0.7727.15, axe-core 4.10.3, DOM/computed-style inspection, keyboard automation, and visual inspection. Portal Git HEAD was `6fa1be940b3e71fee37aab242f9fa3aa8a142e55`; the checkout already contained substantial uncommitted work. Member findings therefore describe the reviewed local source, not a verified production member deployment.

The 28 public route/theme scans contained text-contrast failures in **26 states**. The 20 local member route/theme scans contained them in **15 states**. Repeated elements can produce hundreds of reports from one shared defect; these counts are not a compliance percentage or a count of distinct bugs. Axe best-practice warnings and incomplete checks are kept separate from confirmed WCAG failures.

One initial public scan stalled and was replaced by a successful isolated search-page scan. Full-page screenshots of the very long events page exceeded browser capture limits; viewport screenshots and a separate narrow-layout check were obtained. The separate events reflow/text-spacing check covered light mode. These limitations do not invalidate the completed contrast results.

Evidence: [condensed findings and measurements](accessibility-2026-09-09/evidence.json), [raw scan results and audit scripts](accessibility-2026-09-09/raw-evidence.tar.gz), and the screenshots linked below. The scripts use this workstation's dependency paths; they are audit evidence rather than an installed CI suite.

Follow-up: a [repeatable automation suite and installation guide](ACCESSIBILITY_TESTING.md) is now available. It was run on the local checkout with axe 4.13.0, keyboard automation, and the real Orca 46.1 screen reader. Its retained results confirm the sampled modal failures and missing chat-error announcement. This follow-up does not supply NVDA, VoiceOver, or TalkBack coverage.

## Confirmed findings, ordered for remediation

### A01 — High: text becomes faint or effectively invisible

WCAG **1.4.3 Contrast (Minimum), AA**. Normal text needs 4.5:1; qualifying large text needs 3:1. The failing examples are meaningful text or enabled controls, not exempt logos or disabled controls. [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

| Example | Measured foreground/background | Ratio | Evidence |
| --- | --- | ---: | --- |
| Dark-mode Log In / registration / identity-provider action buttons | `#ffffff` on `#7fb8ff` | 2.05:1 | Production |
| Light-mode explanatory text and registration links | `#697a90` on `#ffffff` | 4.38:1 | Production |
| Dark-mode About card headings | `#e3efff` on `#ffffff` | 1.16:1 | Production; even the 3:1 large-text threshold fails |
| Health diagnosis codes | `#ffffdb` on `#f4f8ff` | 1.04:1 | Local fixture, both themes |
| Life-benefit birthday and derived age | `#ffffdb` on `#ffffff` | 1.02:1 | Local light-mode fixture |
| Dark-mode photo-editor heading | `#e3efff` on `#ffffff` | 1.16:1 | Local open dialog |

Reproduce the public issue by opening login in dark mode; inspect the enabled Log In button. Open About to see light text on white cards. Member screenshots show the more severe inherited-color problem in benefit data.

Sources: [shared button colors](../web/src/index.css#L1474), [light muted token](../web/src/index.css#L374), [global bold-text color](../web/public/css/master.css#L272), [health result background](../web/src/index.css#L110), [About cards](../web/src/ui/views/AboutPage.tsx#L20), [photo-editor background](../web/src/ui/views/users/UserProfilePage.tsx#L699). The globally loaded stylesheet assigns pale yellow to all `strong` elements, which overrides inherited foreground colors in multiple member views. The site's root `css/master.css` contains the same broad bold-text rule; local and production stylesheet copies should be checked together.

Fix the shared foreground/background pairs first, use theme tokens consistently, and scope or remove the broad bold-text color rule. Cover hover, focus, selected, error, placeholder, and dialog states. Do not treat switching to another theme as remediation: both themes contain failures.

Acceptance: recompute contrast on all affected rendered surfaces in both themes, including populated benefit records. [Production dark login screenshot](accessibility-2026-09-09/login-dark.png) · [Local health-benefit screenshot](accessibility-2026-09-09/health-light.png)

### A02 — High: modal dialogs leave keyboard focus behind the overlay

WCAG **2.4.3 Focus Order, A**, and **4.1.2 Name, Role, Value, A** for the unnamed photo dialog. Local browser reproduction confirmed:

- Submitting registration with a simulated existing-account response opens an `alertdialog`, but focus lands on the page body. Subsequent Tab presses reach the underlying Login link, skip link, header, and search. Escape leaves the dialog open.
- Opening the profile-photo editor leaves focus on Replace photo. Tab reaches underlying profile fields and Save profile while the overlay remains visible. Escape again leaves the dialog open. The `role="dialog"` element has neither `aria-label` nor `aria-labelledby`.

Sources: [registration error](../web/src/ui/views/users/UserRegisterPage.tsx#L87), [photo editor](../web/src/ui/views/users/UserProfilePage.tsx#L679). Setting `aria-modal` does not implement focus movement or make background controls inert. Escape behavior is part of the recommended dialog interaction pattern; the confirmed WCAG problems here are the incoherent focus order and missing accessible name. [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) · [W3C focus-order guidance](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html)

Use the existing native-dialog approach in [TimebankDialog](../web/src/ui/views/timebank/TimebankDialog.tsx), with an appropriate title and content. Acceptance: focus enters the dialog, Tab/Shift+Tab remain inside, closing restores focus, and ordinary dismissible dialogs support Escape. An inline registration error with an accessible alert may be simpler than a modal.

[Registration error screenshot](accessibility-2026-09-09/registration-error.png) · [Photo-editor screenshot showing background field focus](accessibility-2026-09-09/photo-dialog-dark.png)

### A03 — High: chat send failures are not exposed as status messages

WCAG **4.1.3 Status Messages, AA**. In the local conversation fixture, a simulated 503 send failure displays “Message service unavailable” and “Failed. Retry by sending again.” Neither has an alert/status role or live-region ancestor. The tested conversation has no live region for these updates. A user typing with a screen reader can miss the failure. [W3C status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)

Sources: [conversation status and error](../web/src/ui/views/chat/NativeChatPage.tsx#L689), [message delivery state](../web/src/ui/views/chat/NativeChatPage.tsx#L763). The changing message history also lacks a log/live-region mechanism in the inspected source; incoming-message announcements need separate validation.

Provide an appropriately scoped error alert and polite delivery updates. Use a labeled message log with additions announced without rereading history. Acceptance includes failed send, retry, reconnect, incoming message, and preserved composer focus. Exact announcements still need real screen-reader testing.

### A04 — Medium: finance sorting has no accessible name

WCAG **4.1.2 Name, Role, Value, A**. Production finance exposes a `select` containing “Most Dena first” and “Least Dena first” without an associated label, `aria-label`, or `aria-labelledby`. Its selected option is a value, not the control's name. Axe reports `select-name`. [W3C name/role/value guidance](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html)

Source: [finance filters](../web/src/ui/views/EconomicOpsPage.tsx#L800). Add a persistent label such as “Sort community balances.” Give the adjacent search input a persistent label too; its placeholder currently supplies the only instruction and disappears during entry.

Acceptance: keyboard and screen-reader users can identify both fields and their current values. Also clean up the extra profile file-input tab stop: its associated label is hidden in the local rendered state, although Replace photo already provides a named upload action.

### A05 — Medium: the open search listbox contains incompatible controls

WCAG **1.3.1 Info and Relationships, A**. In production, type `code` in header search and open suggestions. The `role="listbox"` contains regular focusable footer links alongside options; axe reports `aria-required-children`, mapped to 1.3.1. Keyboard arrow handling is present, but the accessibility structure does not consistently express one composite widget. [W3C information and relationships guidance](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html)

Sources: [combobox/input](../web/src/ui/shell/Header.tsx#L525), [listbox](../web/src/ui/shell/Header.tsx#L602), [footer links inside it](../web/src/ui/shell/Header.tsx#L731). Move the “View all results” links outside the listbox and align the focused input, expanded state, controlled popup, and active option with the current combobox pattern. Do not infer total screen-reader failure solely from the scanner result. [W3C combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)

Acceptance: verify name, expanded/collapsed state, result selection, empty/loading states, Arrow keys, Enter, Escape, Tab, and announcement behavior. [Production search screenshot](accessibility-2026-09-09/search-320.png)

### A06 — Medium: some navigation leaves an incorrect page title

WCAG **2.4.2 Page Titled, A**. In production, navigate from login to Departments and then Finance using the header. After each route settles, the browser title remains “Org Portal • User login.” A direct visit to About produces only “Code Collective Portal.” The title no longer describes the page, making tabs and screen-reader orientation misleading. [W3C page-title guidance](https://www.w3.org/WAI/WCAG22/Understanding/page-titled.html)

Sources: [routes outside AppLayout](../web/src/ui/router/createAppRouter.tsx#L164), [Departments](../web/src/ui/views/DepartmentsPage.tsx#L62), [Finance](../web/src/ui/views/EconomicOpsPage.tsx#L505), [About](../web/src/ui/views/AboutPage.tsx#L3). These standalone layouts also lose the shared skip link and route focus handling; the reproduced transitions leave focus on the body. Absence of a skip link alone is not recorded as a 2.4.1 failure because a main landmark can provide another bypass mechanism.

Set a descriptive title on every route, including direct loads and errors, and consolidate repeated shell behavior. Acceptance: navigate both directions among login, finance, departments, create, and About, then verify titles and predictable focus.

### A07 — Medium: profile inputs omit machine-readable personal-data purposes

WCAG **1.3.5 Identify Input Purpose, AA**. The source and local DOM show no appropriate autocomplete tokens for the user's full name, birthday, and postal address. Visible labels do not replace standardized personal-data-purpose metadata. This affects autofill and adaptations for cognitive and motor disabilities. [W3C input-purpose guidance](https://www.w3.org/WAI/WCAG22/Understanding/identify-input-purpose.html)

Sources: [full name](../web/src/ui/views/users/UserProfilePage.tsx#L507), [birthday/address](../web/src/ui/views/users/UserProfilePage.tsx#L625). Use `name`, `bday`, `address-line1`, `address-line2`, `address-level2`, `address-level1`, and `postal-code` where applicable. Apply this to fields about the user, not indiscriminately to arbitrary searches or other people's records.

Acceptance: expand Address and inspect the rendered attributes; test filling a saved profile with browser/password-manager assistance. Login and registration already provide useful email/password autocomplete attributes.

### A08 — Medium: light-mode input boundaries have insufficient contrast

WCAG **1.4.11 Non-text Contrast, AA**. The production login email input uses a custom `#b7c5d6` border on white, approximately **1.75:1**. The input interior and surrounding card are both white, making the border necessary to locate the control's bounds. The identity-provider form similarly uses `#bcc4d0` on white, approximately **1.76:1**. The applicable threshold is 3:1. [W3C non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

Sources: [portal field style](../web/src/index.css#L1605), [light border token](../web/src/index.css#L407), [identity-provider form](../pidp/serverless/src/index.ts#L239). Strengthen the boundary or supply another sufficiently contrasting way to identify the field. Check custom checkboxes, selected states, and controls beyond these measured examples.

Acceptance: test unfocused as well as focused controls; a focus ring does not repair the resting-state boundary. Do not count ordinary decorative card separators as controls.

## Additional issues and evidence limits

| Observation | Assessment and action |
| --- | --- |
| Nested/duplicate main landmarks | Local settings, calendar, health, scheduling, and property/casualty render their own `main` inside AppLayout's `main`. Axe reports landmark best-practice failures. Use one main landmark and sections underneath it. These warnings are not counted as independent WCAG failures without a demonstrated information/relationship barrier. |
| Finance chart detail is mouse-driven | Source at `EconomicOpsPage.tsx:582–665` labels the chart but exposes dated values through `onMouseMove`; no equivalent keyboard point navigation or history table was found. Audit against 2.1.1 and 1.1.1. The production guest state had no chart data, so the populated interaction was not runtime-tested. Supply a history table and meaningful summary. |
| Organization image editor | `ImageEditorModal.tsx:67–130` lacks dialog semantics/focus handling, uses a `display:none` file input behind a nonfocusable label, and has unattached Zoom/Rotation labels. Source-confirmed risk to 2.1.1/4.1.2; the organization-editor flow was not opened in this review. There is already a better upload-button pattern in the profile editor. |
| Update and video-call dialogs | `AppUpdatePrompt.tsx:15` and `NativeVideoCall.tsx:285` add modal ARIA without implementing a complete modal interaction in those components. Validate opening, dismissal, focus restoration, and any mandatory-update state. No live call or native app session was performed. |
| Video captions and alternatives | No caption/transcription feature was found in the inspected call component. Evaluate the intended communication service and any published recordings against applicable media criteria; absence of an HTML `track` element alone does not prove every live conversation fails WCAG. Recorded media, uploaded documents, and third-party content were not audited. |
| Forced colors | Chromium removes the box-shadow focus rings while CSS suppresses outlines. The browser still changed focused control borders, so this is not reported as a confirmed absence of visible focus. Add an explicit system-color focus outline and test actual Windows high-contrast themes. |
| Identity-provider narrow layout | At 320 CSS pixels the page reports 9 pixels of document overflow and clips the card edge. Visible form controls remained in view. Fix the sizing/box-sizing; do not label this alone a proven 1.4.10 failure without showing required content/functionality needs horizontal scrolling. |
| Heading and image verbosity | About skips from h1 to h3; finance lacks an h1; the brand image and adjacent text repeat the name. Improve these structures. Scanner warnings alone do not establish individual WCAG failures. |
| Diagnosis selection clarity | Selected-code buttons remove an item but are named by the code/diagnosis, without “Remove.” Clarify actions and selection changes; retain native keyboard operation. |

## Existing strengths

The shared AppLayout supplies a skip link, a focusable main landmark, and route-change focus handling. Most examined forms use native controls and associated labels. Login errors have an alert; profile saves and several scheduling/calendar messages use status roles. Documents declare English and the viewport does not prohibit zoom. Shared CSS handles reduced-motion preferences.

The sampled portal/member initial layouts had no measured page-level horizontal overflow at 320 CSS pixels. Public text-spacing overrides likewise produced no page-level overflow in the completed checks. This is useful evidence, but does not establish absence of clipped text or complete workflows at 200% text resize / 400% browser zoom. [W3C reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

Timebanking's empty board and Add offer dialog had **no axe violations in the tested states** in either theme, including 320-pixel scans. Its dialog moved focus inside, closed with Escape, and restored focus to Add offer. This supplies an existing implementation to reuse; it is not certification of populated boards, exchanges, admin analytics, or the whole timebank module.

The identity-provider desktop initial form also had no axe violations. Manual contrast measurement nevertheless found the low-contrast boundaries above, illustrating the limits of automatic scans.

## Remediation and release acceptance

1. **Shared UI pass:** repair contrast tokens and global bold styles; replace faulty modal implementations; label finance filtering; repair the search popup structure; add chat error/status semantics. Reuse the proven native dialog behavior.
2. **Workflow pass:** correct titles and shell composition, personal-data autocomplete, image-editor controls, chart alternatives, and nested landmarks. Exercise empty, populated, loading, error, success, selected, and dialog states.
3. **Regression gate:** add axe checks with WCAG 2.2 A/AA tags plus applicable 2.1 requirements. Keep best-practice warnings separate. Replace the existing name heuristic in `web/tests/e2e/ui-ux-system.spec.ts:256–288`: it counts a select's option text as a name and can accept placeholder-only inputs, so it misses actual accessibility barriers. Add targeted keyboard tests for the reproduced failures.
4. **Assistive-technology acceptance:** complete login, registration/error recovery, profile update, search, message/send-failure recovery, timebank posting/exchange, benefit intake, appointment booking, and relevant governance/financial actions using NVDA with Firefox/Chrome, VoiceOver with Safari/iOS, and TalkBack with Android. Include the native wrapper if distributed. Check speech, focus, errors, labels, and return paths, not just element existence.
5. **Visual and input acceptance:** test both themes, true 200% text resize, 400% browser zoom, prescribed text spacing, forced colors, keyboard-only use, and touch. Check 2.5.8 target sizing with its spacing/inline exceptions: 24×24 CSS pixels is the AA reference, while 44×44 is the stronger AAA target, not a universal AA requirement. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
6. **Complete-process checks:** include OAuth/password managers and paste support, recovery/MFA if present, session expiry, financial/legal confirmation or reversibility, uploaded media/documents, and third-party pages required to finish tasks. Accessible authentication permits mechanisms such as password-manager assistance; do not introduce cognitive tests without an allowed alternative. [W3C accessible-authentication guidance](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html)

Publish an accessibility contact route and a statement accurately describing the target, known limitations, and available assistance; establish ownership and a regression process. A statement or an overlay widget does not repair the identified defects. Before claiming whole-platform conformance, expand this sample to complete processes, remaining roles, and required third-party surfaces using a documented evaluation scope. No NVDA, JAWS, VoiceOver, TalkBack, Braille, or disabled-participant usability session was conducted here. [W3C conformance evaluation methodology](https://www.w3.org/WAI/test-evaluate/conformance/wcag-em/)
