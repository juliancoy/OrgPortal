# ChatGPT contributor account

The user requested a named ChatGPT account to connect GPT-prepared suggestions,
Codex, and OrgPortal MCP. This is an organizational AI contributor identity, not
an OpenAI login or a representation of OpenAI endorsement.

## Provisioned identity

- Display name: ChatGPT
- Email: chatgpt@lifetech.fyi
- PIdP identity: a87d87ae-78bb-4ac9-ade7-8ca008ab1027
- LifeTech organization: ef646755-9443-4c7b-ba4b-a7a29754f666
- Membership: active member, not organizer or administrator.
- Cloudflare Email Routing: exact-address forwarding to the account owner's
  verified Gmail destination. No catch-all address is enabled.
- Email verified through the real Cloudflare-routed verification message.
- Public profile: https://lifetech.fyi/users/chatgpt
- Login and profile publication verified through the account’s own credentials.

Setup uses the canonical PIdP registration and LifeTech MCP membership
preview/apply APIs. Local setup credentials are under
`~/.local/state/orgportal/service-accounts/chatgpt.json` (mode 0600), outside Git.
Do not print, commit, or copy these secrets into a public profile or suggestions.
Delete or rotate them through the supported identity operations when the account
is retired. Disable the forwarding rule when no longer needed. No mailbox store
or independent email retention system was introduced.

## Published profile and integration links

The account's profile was published using its own authenticated
`PUT https://lifetech.fyi/api/org/api/network/contact/me` request:

- Slug: chatgpt
- Headline: AI contributor · GPT suggestions prepared with Codex
- Bio: Organizational service account for AI-prepared suggestions. Human
  organizers review and decide governance changes. Operated for LifeTech;
  not an official OpenAI organizational account.
- Codex link: https://chatgpt.com/codex
- MCP server link: https://lifetech.fyi/api/org/mcp
- Governance suggestions link:
  https://lifetech.fyi/governance/documents/lifetech-constitution#gpt-suggestions

Keep its recovery address private unless the owner explicitly chooses to publish
it. Account creation and profile links do not establish an active Codex runtime,
OAuth client grant, chat listener, or autonomous execution. Use the existing
PIdP OAuth/account-consent and OrgPortal preview/apply flows when connecting a
client, preserving the service identity and existing membership permissions.
The current ChatGPT connector remains authenticated as the human owner until
explicitly connected as this identity.

## GPT suggestions

The bylaws rewrite is stored as eight **GPT suggestions**, not as current working
text or official motions. `lifetechGptSuggestions.ts` preserves each original
section and its proposed replacement; Title IV voting procedure was unchanged.
The UI shows authorship, Codex provenance, and a diff. A member may review and
submit an applicable suggestion as a normal change ticket, with the submitting
account correctly recorded. No unverified bot identity, vote, or signature is
fabricated. Ratification rehearsals capture only the actual working draft.
