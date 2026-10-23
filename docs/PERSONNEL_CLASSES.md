# Personnel classes

Organizations choose **Meetup Classes**, **Nonprofit Classes**, or **Corporation Classes** in Board / Personnel → Community members. Managers review and confirm the organization-wide setting.

Meetup Classes describes participation: Public, Attendee, Volunteer, Member, Organizer, Stakeholder, Persona Non Grata.

Nonprofit Classes describes responsibilities: Board member, Executive leadership, Staff, Volunteer, Advisor, Member, Donor / supporter, Program participant. In Edit roles, use Add a class, then review and save. A person may hold several classes alongside specific titles. Assignments remain when changing schemes; nonprofit avatar colors use the first matching class in the legend. No board, employment, or donor status is inferred from portal permissions. Classes and titles are public; never enter confidential details.

Portal membership permissions and invitation purposes remain separate. A volunteer invitation still grants recognition rather than membership. Class changes do not grant portal access.

The alternative draws on [BoardSource’s roles and responsibilities](https://boardsource.org/fundamental-topics-of-nonprofit-board-service/roles-responsibilities/) and the [National Council of Nonprofits’ board/staff distinction](https://www.councilofnonprofits.org/running-nonprofit/governance-leadership/board-roles-and-responsibilities). It is a practical taxonomy, not a claim that adopting these labels guarantees nonprofit success.

Migration 0110 stores only the organization’s scheme and journals changes. Person assignments reuse the existing membership titles and their retention/deletion and journal handling.

Corporation Classes offers Board member, Executive leadership, Manager, Employee, Contractor, Advisor, Shareholder, and Business partner. These are explicitly assigned descriptions; portal ownership does not establish equity or employment. Migration 0111 extends the saved scheme choices.

## Invitations and consent

Use Personnel invitations and status to select a recipient email, one or more classes in the saved organization scheme, and either no membership access or member access. Review the exact effects before confirming. The verified recipient reviews and confirms acceptance. This consents to public personnel relationships; no-access invitations create neither a membership nor volunteer recognition. Existing memberships and privileged roles remain unchanged. Invitations expire after seven days. Accepted relationships expire after 24 months and may be removed sooner.

Board, executive, staff, employee and shareholder classes remain pending confirmation after acceptance. An organizer must review a supporting HTTPS evidence URL and confirm the class before publication. This records organizer confirmation, not independent verification of legal office, employment or ownership. Evidence URLs remain private to managers. Other accepted classes appear on Board/Personnel without requiring membership. Removing a relationship does not revoke separately held membership or erase independently assigned titles.

Manager status shows pending/accepted/cancelled/expired invitations, provider state, attempt count and delivery blockers. “Sent” means provider acceptance, not confirmed inbox delivery. Uncertain sends are not automatically retried. Cancellation invalidates the acceptance link, but cannot recall email already submitted to the provider.

## MCP

Use `get_personnel_class_schemes` to discover keys, then `get_organization_personnel_scheme` or `preview_organization_personnel_scheme` / `apply_organization_personnel_scheme` to select a scheme. All writes require portal read/write scopes, live authorization and a matching one-use preview with `confirm: true` on apply. Tenant-scoped connections may act only within their configured organization.

Example prompt:

> Invite alex@example.com to our organization as an Advisor under Corporation Classes, with no portal membership access. Show me the invitation preview and public visibility before queuing it. Then report its delivery status.

`preview_organization_invitation` / `apply_organization_invitation` accept `organizationId`, `email` and `intent: {scheme: "corporation", classes: ["advisor"], access: "none"}`. Purpose is derived from intent access, so omit it for class invitations. For ordinary member or volunteer-recognition invitations without intent, use purpose `member` or `volunteer`.

Managers use `list_organization_invitations` for delivery status and accepted relationships, and preview/apply `organization_invitation_cancellation` to cancel a pending invitation. Recipients use `get_organization_invitation`, then preview/apply `organization_invitation_acceptance` with their own verified email account. Invitation IDs and recipient data are private; do not put invitation links in public documents. `list_my_personnel_relationships` lists the caller’s classes without requiring membership. Preview/apply `personnel_relationship` confirms a class with `action: "confirm"` and `evidenceUrl`, or removes it with `action: "revoke"`. Only managers confirm; recipients may revoke their own relationships.
