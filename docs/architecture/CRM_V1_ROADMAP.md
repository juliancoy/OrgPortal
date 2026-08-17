# CRM v1 Roadmap

This document defines the minimum changes required to turn the current portal into a usable CRM.

It is intentionally narrow. The goal is not to build a generic Salesforce clone. The goal is to add the smallest set of canonical CRM objects and workflows that let a staff user capture a person or company, track ownership, record follow-up, and move work through a pipeline.

## Current state

Today the portal already has useful pieces:

- Identity and authentication.
- Public user contact pages.
- Organization directory records.
- Events.
- Chat and notifications.
- Business card scan intake.

Those features are not yet a CRM because the system still lacks:

- Canonical private contact and account records.
- Internal notes and activity history.
- Lead qualification and conversion.
- Opportunity or relationship pipeline tracking.
- Task ownership and follow-up deadlines.
- Staff reporting over pipeline state.

## Product boundary

CRM v1 should treat the portal as a relationship operations system for people and organizations.

CRM v1 should not include:

- Marketing automation.
- Email campaign builders.
- Quoting, invoicing, or contract generation.
- Full customer support ticketing.
- Deep ETL or third-party sync.

Those can come later. They are not required for a proper first CRM.

## CRM v1 jobs to be done

The minimum viable CRM must let a staff user:

1. Create or import a person record.
2. Create or match an organization account.
3. Associate the person with one or more organizations.
4. Mark whether the person is a lead, active contact, partner, donor, member, volunteer, sponsor, or some other relationship type.
5. Assign an owner.
6. Record notes, calls, meetings, messages, and status changes in one timeline.
7. Create follow-up tasks with due dates.
8. Move a lead or opportunity through explicit stages.
9. See stale records that need attention.
10. Report on pipeline counts, upcoming work, and recent activity.

## Canonical data model

The current public-profile tables should remain useful as public-facing surfaces, but CRM v1 needs a separate private operational model.

### New tables

#### `crm_accounts`

Represents an organization, company, institution, or household that staff manage as one account.

Suggested fields:

- `id`
- `name`
- `slug`
- `account_type` (`organization`, `business`, `nonprofit`, `government`, `household`, `other`)
- `status` (`lead`, `active`, `inactive`, `archived`)
- `website_url`
- `primary_email`
- `primary_phone`
- `city`
- `notes_summary`
- `source`
- `owner_user_id`
- `created_by_user_id`
- `created_at`
- `updated_at`
- `archived_at`

Notes:

- This is the private operational record.
- It may optionally link to the existing public `organizations` table with `public_organization_id`, but CRM logic should not depend on the public directory record.

#### `crm_contacts`

Represents a private contact record for a person.

Suggested fields:

- `id`
- `display_name`
- `first_name`
- `last_name`
- `email`
- `phone`
- `title`
- `headline`
- `relationship_type`
- `lifecycle_stage` (`lead`, `qualified`, `active`, `inactive`, `archived`)
- `source`
- `owner_user_id`
- `pidp_user_id` nullable
- `public_contact_page_id` nullable
- `created_by_user_id`
- `created_at`
- `updated_at`
- `archived_at`

Notes:

- `pidp_user_id` links a CRM contact to an authenticated platform user when one exists.
- A CRM contact must exist even if the person never signs into the portal.

#### `crm_contact_accounts`

Many-to-many link between contacts and accounts.

Suggested fields:

- `id`
- `contact_id`
- `account_id`
- `role_label`
- `is_primary`
- `created_at`
- `updated_at`

#### `crm_leads`

Tracks early-stage inbound people or org opportunities before they are qualified or converted.

Suggested fields:

- `id`
- `lead_type` (`person`, `organization`, `partnership`, `donor`, `sponsor`, `volunteer`, `member`, `other`)
- `status` (`new`, `working`, `qualified`, `unqualified`, `converted`, `archived`)
- `source`
- `owner_user_id`
- `contact_id` nullable
- `account_id` nullable
- `captured_from_scan_id` nullable
- `qualification_notes`
- `next_action_at`
- `converted_at`
- `created_at`
- `updated_at`

#### `crm_opportunities`

Tracks active relationship work after qualification.

Suggested fields:

- `id`
- `account_id` nullable
- `primary_contact_id` nullable
- `name`
- `opportunity_type` (`partnership`, `donation`, `membership`, `sponsorship`, `recruiting`, `service`, `other`)
- `stage` (`new`, `discovery`, `proposal`, `committed`, `won`, `lost`)
- `status` (`open`, `won`, `lost`, `archived`)
- `amount_estimate` nullable
- `close_target_at` nullable
- `loss_reason` nullable
- `owner_user_id`
- `created_by_user_id`
- `created_at`
- `updated_at`
- `closed_at` nullable

#### `crm_activities`

Unified timeline events attached to contacts, accounts, leads, and opportunities.

Suggested fields:

- `id`
- `activity_type` (`note`, `call`, `meeting`, `email`, `message`, `status_change`, `stage_change`, `scan_import`, `system`)
- `subject`
- `body`
- `occurred_at`
- `actor_user_id`
- `contact_id` nullable
- `account_id` nullable
- `lead_id` nullable
- `opportunity_id` nullable
- `task_id` nullable
- `metadata_json`
- `created_at`

#### `crm_tasks`

Follow-up work items.

Suggested fields:

- `id`
- `title`
- `description`
- `status` (`open`, `completed`, `canceled`)
- `priority` (`low`, `normal`, `high`)
- `due_at` nullable
- `completed_at` nullable
- `owner_user_id`
- `created_by_user_id`
- `contact_id` nullable
- `account_id` nullable
- `lead_id` nullable
- `opportunity_id` nullable
- `created_at`
- `updated_at`

#### `crm_tags`

User-defined segmentation labels.

Suggested fields:

- `id`
- `name`
- `slug`
- `color`
- `created_at`

#### `crm_taggings`

Polymorphic tag assignment.

Suggested fields:

- `id`
- `tag_id`
- `entity_type` (`contact`, `account`, `lead`, `opportunity`)
- `entity_id`
- `created_at`

### Core constraints

- Unique normalized email is helpful but should be nullable and not globally required.
- A contact and account should support soft deletion through `archived_at`.
- A task or activity may attach to multiple CRM surfaces indirectly, but each row should still have one primary owner and one primary subject context.
- Every stage change, conversion, and owner reassignment should append a `crm_activities` row.

## Relationship to current tables

The current portal data should map into the CRM, not define it.

### `user_contact_pages`

Keep this as the public contact profile surface.

Do not use it as the canonical CRM contact record because it is:

- Public-profile shaped.
- Missing ownership and lifecycle state.
- Missing internal notes and tasks.
- Coupled to platform user identity.

### `organizations`

Keep this as the public organization directory surface.

Do not use it as the canonical CRM account record because it is:

- Directory shaped.
- Missing account owner, private fields, lifecycle state, and internal history.

### `business_card_scans`

Keep this as raw intake evidence and OCR history.

CRM v1 should extend it by creating private CRM records:

- Scan creates `crm_leads` by default.
- Scan may optionally create `crm_contacts` and `crm_accounts`.
- Scan should never silently stop at a raw OCR record when enough information exists to create a follow-up entity.

## API surface

The simplest implementation is to extend `portal/org-worker/src/index.ts` first, then split later if needed.

All CRM endpoints should live under:

- `/api/crm/accounts`
- `/api/crm/contacts`
- `/api/crm/leads`
- `/api/crm/opportunities`
- `/api/crm/tasks`
- `/api/crm/activities`
- `/api/crm/reports`

### Minimum endpoints

#### Contacts

- `GET /api/crm/contacts`
- `POST /api/crm/contacts`
- `GET /api/crm/contacts/:contactId`
- `PATCH /api/crm/contacts/:contactId`
- `POST /api/crm/contacts/:contactId/archive`
- `GET /api/crm/contacts/:contactId/activities`
- `POST /api/crm/contacts/:contactId/activities`
- `GET /api/crm/contacts/:contactId/tasks`
- `POST /api/crm/contacts/:contactId/tasks`

#### Accounts

- `GET /api/crm/accounts`
- `POST /api/crm/accounts`
- `GET /api/crm/accounts/:accountId`
- `PATCH /api/crm/accounts/:accountId`
- `POST /api/crm/accounts/:accountId/archive`
- `GET /api/crm/accounts/:accountId/contacts`
- `POST /api/crm/accounts/:accountId/contacts`
- `GET /api/crm/accounts/:accountId/activities`

#### Leads

- `GET /api/crm/leads`
- `POST /api/crm/leads`
- `GET /api/crm/leads/:leadId`
- `PATCH /api/crm/leads/:leadId`
- `POST /api/crm/leads/:leadId/qualify`
- `POST /api/crm/leads/:leadId/convert`
- `POST /api/crm/leads/:leadId/archive`

#### Opportunities

- `GET /api/crm/opportunities`
- `POST /api/crm/opportunities`
- `GET /api/crm/opportunities/:opportunityId`
- `PATCH /api/crm/opportunities/:opportunityId`
- `POST /api/crm/opportunities/:opportunityId/stage`
- `POST /api/crm/opportunities/:opportunityId/close-won`
- `POST /api/crm/opportunities/:opportunityId/close-lost`

#### Tasks

- `GET /api/crm/tasks`
- `POST /api/crm/tasks`
- `PATCH /api/crm/tasks/:taskId`
- `POST /api/crm/tasks/:taskId/complete`
- `POST /api/crm/tasks/:taskId/cancel`

#### Reports

- `GET /api/crm/reports/summary`
- `GET /api/crm/reports/pipeline`
- `GET /api/crm/reports/stale-records`
- `GET /api/crm/reports/upcoming-tasks`

## Access control

CRM data is private operational data by default.

Recommended rules:

- Public users: no CRM access.
- Authenticated users: no CRM access unless explicitly granted.
- CRM staff role: read and write CRM records they own or have team access to.
- CRM managers/admins: team-wide read/write, reassignment, reporting.

The current permissive public IAM model is appropriate for org directories and public profiles. It is not appropriate for CRM internals.

Add explicit CRM permissions such as:

- `crm:contacts.read`
- `crm:contacts.write`
- `crm:accounts.read`
- `crm:accounts.write`
- `crm:leads.read`
- `crm:leads.write`
- `crm:opportunities.read`
- `crm:opportunities.write`
- `crm:tasks.read`
- `crm:tasks.write`
- `crm:reports.read`

## UI surface

CRM v1 should add a small private workspace, not scatter CRM controls across every page.

### New routes

- `/crm`
- `/crm/contacts`
- `/crm/contacts/:contactId`
- `/crm/accounts`
- `/crm/accounts/:accountId`
- `/crm/leads`
- `/crm/leads/:leadId`
- `/crm/opportunities`
- `/crm/opportunities/:opportunityId`
- `/crm/tasks`

### Minimum screens

#### CRM home

Show:

- My open tasks.
- Leads needing qualification.
- Opportunities by stage.
- Stale contacts with no activity in N days.
- Recently created contacts and accounts.

#### Contact detail

Show:

- Private profile fields.
- Linked accounts.
- Tags.
- Activity timeline.
- Open and completed tasks.
- Lead and opportunity links.

Actions:

- Edit contact.
- Add note.
- Log call or meeting.
- Create task.
- Reassign owner.
- Convert lead or create opportunity.

#### Account detail

Show:

- Private account fields.
- Associated contacts.
- Open opportunities.
- Recent activities.
- Open tasks.

Actions:

- Edit account.
- Link contacts.
- Add note.
- Create opportunity.

#### Lead board

Provide:

- Queue of new leads.
- Simple owner and status filters.
- Bulk assignment.
- Qualification and conversion actions.

#### Opportunity board

Provide:

- Kanban by stage.
- Amount estimate.
- Target close date.
- Age in stage.
- Next task or next activity date.

#### Task list

Provide:

- My open tasks.
- Overdue tasks.
- Team tasks.
- Quick complete and reassignment.

## Business card intake changes

The current scan flow is one of the strongest starting points. It should become a CRM intake path instead of a dead-end artifact log.

### Required behavior changes

1. On scan upload, attempt to match existing contact by normalized email or phone.
2. Attempt to match existing account by normalized company name and website.
3. If no match exists, create a `crm_lead`.
4. If enough confidence exists, also create:
   - `crm_contact`
   - `crm_account`
   - `crm_contact_accounts` link
5. Always append a `crm_activity` of type `scan_import`.
6. If confidence is low, create the lead anyway and mark it for review instead of leaving the intake only inside `business_card_scans`.
7. Show a post-scan review screen that lets staff confirm:
   - person name
   - organization name
   - email
   - phone
   - owner
   - lead type
   - next task due date

### Non-goals for v1

- Full OCR perfection.
- Automated merge across every field.
- AI-generated enrichment.

## Reporting requirements

CRM v1 needs operational reporting from day one.

Minimum metrics:

- Leads by status.
- Opportunities by stage.
- Open tasks by owner.
- Overdue tasks by owner.
- Contacts with no activity in 30, 60, and 90 days.
- Conversion counts from lead to contact or opportunity.
- Intake source counts, including business-card scans.

## Suggested implementation order

### Phase 1: private CRM foundation

Add:

- CRM schema migrations.
- CRUD endpoints for contacts, accounts, tasks, and activities.
- Basic access control.
- CRM routes and navigation entry.

This phase delivers a usable private contact database.

### Phase 2: lead workflow

Add:

- Lead schema and endpoints.
- Scan-to-lead creation.
- Lead review queue.
- Lead qualification and conversion.

This phase turns business-card intake into operational workflow.

### Phase 3: opportunity pipeline

Add:

- Opportunity schema and endpoints.
- Stage transitions.
- Kanban board.
- Pipeline reporting.

This phase makes the system behave like a proper relationship CRM.

### Phase 4: cleanup and convergence

Add:

- Better duplicate detection.
- Cross-links from public profiles and org pages into matching CRM records for authorized staff.
- Saved filters and tags.
- Basic export.

## Recommended file layout

Keep the first implementation simple.

Suggested additions:

- `portal/org-worker/migrations/0017_crm_core.sql`
- `portal/org-worker/migrations/0018_crm_leads.sql`
- `portal/org-worker/migrations/0019_crm_opportunities.sql`
- `portal/web/src/ui/views/crm/`
- `portal/web/src/ui/components/crm/`
- `portal/web/src/domain/crm/`
- `portal/web/src/application/ports/CRMRepository.ts`
- `portal/web/src/infrastructure/api/APICRMRepository.ts`

## Definition of done for CRM v1

The portal can be called a basic CRM when all of the following are true:

- Staff can create and manage private contact and account records.
- Every contact or account can have an owner, notes, activities, and tasks.
- New inbound information becomes a lead or a contact, not just a raw scan row.
- Leads can be qualified and converted.
- Opportunities can move through explicit stages.
- Staff can see overdue work and stale records.
- CRM data is private and permissioned.

Until those conditions are met, the portal remains a social/member portal with intake tools, not a proper CRM.
