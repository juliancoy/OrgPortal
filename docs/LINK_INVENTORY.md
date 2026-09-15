# Link Inventory

This inventory maps the user-facing links and routes in the OrgPortal web app. It is organized by the way a person experiences the product: global navigation first, then major task areas, then legacy redirects and external destinations.

## Global Navigation

| Link text | Destination | Audience | Purpose |
| --- | --- | --- | --- |
| Civic | `/` | Public | Default Code Collective landing/home experience. |
| Events | `/events` | Public | Browse public event listings. |
| Orgs | `/orgs` | Public | Browse public organization profiles. |
| People | `/people` | Public | Browse public individual and organization profiles. |
| Calendar feeds | `/calendar/integrations` | Signed-in users on the main portal | Manage personal calendar subscriptions and integrations. |
| ID card | `/id` | Signed-in users | View the shareable ID card and QR entry point. |
| Timebanking | `/timebanking` | Signed-in users on the main portal | Open the timebank marketplace. |
| Chat | `/chat` | Signed-in users on the main portal | Open messages. |
| Benefits | grouped menu | Signed-in users on the main portal | Groups life, health, and property/casualty benefit flows. |
| Operations | grouped menu | Signed-in users on the main portal | Groups finance, departments, and provider scheduling. |
| Tools | grouped menu | Signed-in users on the main portal | Groups business card scanning and the Android app install link when available. |
| SysAdmin | `/admin` | Admins | Open system administration. |
| Login | `/users/login?next=...` | Guests | Sign in through PIdP and return to the current page. |

### Main Portal Grouped Menus

| Group | Link text | Destination | Purpose |
| --- | --- | --- | --- |
| Benefits | Life benefit | `/life-insurance` | Manage life benefit enrollment. |
| Benefits | Health benefit | `/health-insurance` | Manage health benefit profile and claims. |
| Benefits | Property and casualty | `/property-casualty-insurance` | Manage property/casualty insurance flow. |
| Operations | Finance | `/finance` | Open economic operations. |
| Operations | Departments | `/departments` | Browse or manage departmental operations. |
| Operations | Provider portal | `/provider-scheduling` | Schedule provider availability and appointments. |
| Tools | Business card scanner | `/tools/business-cards` | Intake contacts from business cards. |
| Tools | Android app | `/android/install` | Download the Android install package when available. |

## Tenant Navigation

Tenant domains intentionally show a smaller navigation set.

| Link text | Destination | Audience | Purpose |
| --- | --- | --- | --- |
| Events | `/org-events` | Public, when tenant events are enabled | Tenant-scoped events. |
| Calendar | `/calendar` | Public, when tenant calendar is enabled | Public tenant calendar. |
| People | `/people` | Public, when tenant directory is enabled | Tenant-scoped people and organization directory. |
| Messages | `/chat` | Signed-in users, when tenant chat is enabled | Tenant messaging. |
| Resources | `/resources` | Public, when configured | Tenant resource list. |
| Timebank | `/timebanking` | Timebank community domains | Timebank marketplace home. |
| Code Collective portal | `https://codecollective.us/p/` | Timebank community domains | Exit to the main portal. |

## User Menu

| Link text | Destination | Audience | Purpose |
| --- | --- | --- | --- |
| My Profile | `/profile` | Signed-in regular users | Open the unified personal profile owner view. |
| Organization Profile | `/orgs/profile` | Signed-in campaign managers | Manage the organization profile. |
| Settings | `/settings` | Signed-in users | Account-level settings. |
| Calendar integrations | `/calendar/integrations` | Signed-in users | Connect Google/Microsoft calendars and event feeds. |
| Dev Tools | `/dev-tools` | Signed-in users | Developer and token tooling. |
| Identity (PIdP) | `PIDP_BASE_URL/` | Signed-in users | Open the identity provider account surface. |
| SysAdmin | `/admin` | Admins | System administration. |
| UBI Settings | `/admin/ubi-settings` | Admins when UBI is enabled | UBI administration. |
| Email campaigns | `/email` | Admins | Email campaign tooling. |
| Email preferences | `/email/preferences` | Signed-in users | Manage message preferences. |
| Sign out | action | Signed-in users | End the current session. |

## Primary Public Routes

| Route | Public link sources | Purpose |
| --- | --- | --- |
| `/` | Global nav, not-found page, attribution links | Home or profile-aware tenant landing redirect. |
| `/events` | Global nav, organization pages, calendar pages | Public event directory. |
| `/events/:slug` | Event cards, profile event cards, search results | Public event detail and registration. |
| `/orgs` | Global nav, people directory links, sign-in prompts | Public organization directory. |
| `/orgs/:handle` | Organization directory, search, initiative authors | Public organization page. |
| `/people` | Global nav, tenant nav | People and organization directory. |
| `/users/:slug` | People directory, public profile owner controls, search, QR/public URLs | Public individual profile page. |
| `/calendar` | Tenant nav, floating social dock | Public calendar. |
| `/search?q=...` | Header search results and scope links | Global search results. |
| `/terms` and `/legal` | Footer and legal aliases | Terms and privacy. |
| `/about` | Routed page, currently not prominent in primary nav | About page. |
| `/resources` | Tenant nav and resources panel | Tenant resources. |

## Profile And Identity Links

| Link text | Destination | Audience | Notes |
| --- | --- | --- | --- |
| Profile | `/profile` | Signed-in user | Unified profile page: shows the public page preview plus owner-only editing controls. |
| Edit Profile | `#profile-editor` on `/profile` or owner view | Profile owner | Scrolls to the embedded editor on the same page. |
| View Public Page | `/users/:slug` | Profile owner | Opens the canonical public page for the same profile. |
| Public page | `/users/:slug` absolute or relative URL | Profile owner and public viewers | Copy/share target for public profile. |
| Edit ID | `/profile` | Signed-in user | ID-card action; lands on the unified profile editor. |
| Enable Public Page | `/profile` | Signed-in user | Legacy ID page action; lands on the unified profile editor. |
| Identity (PIdP) | `PIDP_BASE_URL/` | Signed-in user | Leaves the portal for identity-provider account management. |

## Authentication Links

| Link text | Destination | Audience | Purpose |
| --- | --- | --- | --- |
| Login | `/users/login?next=...` | Guests | Portal sign-in page. |
| Continue with Google | PIdP Google OAuth URL | Guests | Social sign-in. |
| Continue with GitHub | PIdP GitHub OAuth URL | Guests | Social sign-in. |
| Continue to Identity Provider | PIdP app login URL | Guests | PIdP-hosted login/register flow. |
| Register | `/orgs/register` or PIdP app login URL | Organization users or event guests | Organization registration or event registration sign-in. |
| Log in again | PIdP app login URL | Users with stale sessions | Re-authenticate and return to the current workflow. |

## Events And Calendar Links

| Link text | Destination | Audience | Purpose |
| --- | --- | --- | --- |
| Register | PIdP app login URL or event registration action | Event guests | Sign in before event registration. |
| Manage email preferences | `/email/preferences` | Registered/signed-in users | Control event-related email preferences. |
| Subscribe to registered events | `/calendar/integrations` | Registered users | Open calendar feed subscriptions. |
| Add to Outlook | Outlook calendar event URL | Public | Add a public event to Outlook. |
| Apple/iCal | `webcal://...` feed URL | Signed-in users | Subscribe to registered-event feed. |
| Google Calendar | Google Calendar URL | Signed-in users | Open calendar subscription in Google Calendar. |
| Outlook | Outlook calendar URL | Signed-in users | Open calendar subscription in Outlook. |
| Download .ics | ICS download URL | Signed-in users | Download registered-event calendar file. |
| Connect Google Calendar | PIdP Google Calendar connection URL | Signed-in users | Authorize calendar integration. |
| Connect Microsoft Calendar | PIdP Microsoft Calendar connection URL | Signed-in users | Authorize calendar integration. |
| Manage event | `/orgs/events#event-:slug` | Event owner/admin | Jump to the event management row. |
| Event flyer links | generated flyer URLs | Organization event managers | Open printable/social flyer assets. |
| Open legacy regional source | `https://codecollective.us/calendar.html?...` | Public calendar users | Open the older regional calendar source. |

## Organizations And Governance Links

| Link text | Destination | Audience | Purpose |
| --- | --- | --- | --- |
| Organization Profile | `/orgs/profile` | Organization managers | Manage organization profile and network presence. |
| My Initiatives | `/orgs/initiatives` | Organization managers | Manage initiatives. |
| Create new initiative | `/orgs/initiatives/new` | Organization managers | Start an initiative. |
| Edit | `/orgs/initiatives/:id/edit` | Organization managers | Edit initiative content. |
| View | `/orgs/initiatives/:id/ballot` | Organization managers/public voters | View initiative ballot. |
| Events | `/orgs/events` | Organization managers | Manage organization events. |
| Account | `/orgs/account` | Organization managers | Organization account page. |
| Back to Governance | `/governance` or `/governance/roberts` | Governance users | Return to governance list. |
| Propose | `/governance/propose` or `/governance/roberts/propose` | Governance users | Create a motion. |
| Amend | `/governance/:id/amend` or `/governance/roberts/:id/amend` | Governance users | Propose an amendment. |

## Messaging And Network Links

| Link text | Destination | Audience | Purpose |
| --- | --- | --- | --- |
| Message | `/chat?start=dm&user=...` or `/chat?start=dm&userId=...` | Signed-in users | Start a direct message. |
| Sign in to message | PIdP app login URL with chat return path | Guests | Authenticate before messaging. |
| Message group | `/chat?start=group&org=...` | Signed-in users | Open organization group chat. |
| Open conversation | `/chat/:roomId` | Signed-in users | Open an existing conversation. |
| Open all messages | `/chat` | Signed-in users | Open message inbox. |
| Regarding: listing title | Timebank listing path | Signed-in users | Context link from chat back to a timebank listing. |

## Timebank Links

| Link text | Destination | Audience | Purpose |
| --- | --- | --- | --- |
| Sign in | `/users/login?next=/timebanking...` | Guests | Authenticate before posting, arranging, or claiming. |
| Message member | `/chat?start=dm&userId=...&listing=...` | Signed-in users | Discuss a listing. |
| View details | action | Public or signed-in users | Open an imported listing detail dialog. |
| Claim your LetsBMore account | action or sign-in URL | Former members | Start import claim flow. |
| View original listing | imported source URL | Public or signed-in users | Open imported legacy listing source. |
| Open the community | `https://configured-domain/` | Timebank admins | Open the newly configured community hostname. |
| View former profile | imported source profile URL | Claim reviewers | Review claim evidence. |

## Admin And Tooling Links

| Link text | Destination | Audience | Purpose |
| --- | --- | --- | --- |
| Email campaigns | `/email` | Admins | Manage email campaigns. |
| Business cards | `/tools/business-cards` | Signed-in users/admins | Open contact intake. |
| Admin | `/admin` | Admins | System administration. |
| UBI Settings | `/admin/ubi-settings` | Admins | UBI configuration. |
| Re-authenticate | PIdP owner login URL | Signed-in users | Refresh owner-scoped credentials for token management. |
| Generated contact/organization URLs | Imported or created target URLs | Business-card users | Review created or matched targets. |

## Compatibility Redirects And Aliases

These routes are compatibility paths, not destinations to use in new navigation.

| Old route | Current target |
| --- | --- |
| `/ecops` | `/finance` |
| `/index.html` | `/` |
| `/calendar.html` | `/calendar` |
| `/users/profile` | `/profile` |
| `/users/account` | `/profile` |
| `/constituent` | `/users/dashboard` |
| `/constituent/dashboard` | `/users/dashboard` |
| `/constituent/profile` | `/profile` |
| `/constituent/account` | `/profile` |
| `/constituent/login` | `/users/login` |
| `/constituent/register` | `/users/login` |
| `/contact/:slug` | `/users/:slug` |
| `/contact-settings` | `/profile` |
| `/community` | tenant organization profile or directory |
| `/medtech-events` | `/org-events` on tenant domains, otherwise `/events` |

## External Destinations

| Destination | Where it appears | Human expectation |
| --- | --- | --- |
| Code Collective main site | Footer, tenant/community nav | Clearly exits the current portal. |
| PIdP identity provider | Login, user menu, calendar connections | Authentication/account management outside the SPA. |
| Google Calendar and Outlook | Calendar integrations | External calendar products. |
| WhatsApp, GitHub, Luma | Baltimore MedTech floating dock | External community channels. |
| User-provided profile/contact links | Public profiles and business card intake | Open as normal external links. |
| Source URLs for imported organizations, events, listings, and profiles | Public orgs, events, timebank, claims | Preserve provenance and allow verification. |

## Human-Fit Notes

- The profile model now makes sense: `/profile` is the owner view of the same individual profile shown at `/users/:slug`, with owner-only editing controls and a clear `View Public Page` action.
- The global navigation is intentionally short for guests and grouped for signed-in users. Operational links sit under `Benefits`, `Operations`, and `Tools` instead of competing with the core public discovery links.
- Tenant navigation is clearer than the main portal for community-specific domains because it uses the tenant's actual enabled features.
- The app still has both `ID card` and `My Profile`. This is acceptable because the labels now separate the share/card workflow from profile editing.
- `Calendar` remains the public tenant calendar label; the main portal now uses `Calendar feeds` for subscriptions and integrations.
- Several public-profile and event links use direct `<a href>` for internal routes. They work, but React Router `Link` would preserve SPA navigation behavior.
- Search result scope links are sensible for power users, but the labels should stay concrete: `All results`, `Organizations`, `Events`, and `People`.
- Compatibility routes are well covered by redirects. Avoid adding new links to compatibility paths.
