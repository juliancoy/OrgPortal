import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getActivePortalProfileConfig, portalProfilePath } from '../../config/portalFeatures'
import { useDomainTenant } from '../../config/timebankCommunity'

export function TermsPage() {
  const profile = getActivePortalProfileConfig()
  const tenant = useDomainTenant()
  const brandName = profile.brandName || 'OrgPortal'
  const tenantName = tenant?.name || brandName

  useEffect(() => {
    document.title = `Terms & privacy · ${brandName}`
  }, [brandName])

  return (
    <section className="legal-page panel" aria-labelledby="legal-title">
      <p className="legal-eyebrow">Legal information</p>
      <h1 id="legal-title" className="serif">Terms, privacy, and community expectations</h1>
      <p className="legal-updated">Last updated September 11, 2026</p>
      <p className="legal-lede">
        These terms describe how {tenantName} uses the shared OrgPortal service for membership, events,
        organization pages, messaging, comments, registrations, and related community tools.
      </p>

      <div className="legal-callout">
        <strong>Shared OrgPortal membership.</strong> When you create or use an account here, your membership
        identity is shared across all tenants of OrgPortal. The same account may be used to sign in to other
        OrgPortal-powered communities. Each tenant may still have its own branding, content, groups, events,
        roles, permissions, and community expectations.
      </div>

      <div className="legal-grid">
        <nav className="legal-toc" aria-label="Terms sections">
          <a href="#use">Use of the service</a>
          <a href="#accounts">Accounts and shared membership</a>
          <a href="#content">Content and conduct</a>
          <a href="#events">Events and organizations</a>
          <a href="#communications">Communications</a>
          <a href="#privacy">Privacy and data</a>
          <a href="#availability">Availability and changes</a>
          <a href="#contact">Questions</a>
        </nav>

        <div className="legal-body">
          <section id="use">
            <h2>Use of the service</h2>
            <p>
              OrgPortal provides community infrastructure: public organization profiles, event listings,
              registrations, comments, reactions, messaging, member profiles, organization administration,
              and tenant-specific homepages. Use the service only for lawful, community-related activity and
              do not interfere with other members, the platform, or connected identity and communication systems.
            </p>
          </section>

          <section id="accounts">
            <h2>Accounts and shared membership</h2>
            <p>
              A single OrgPortal account can be used across OrgPortal tenants. Signing in through one tenant may
              establish or refresh your OrgPortal-wide membership identity, including your name, email address,
              profile details, avatar, and authentication session. Tenant-specific memberships, admin roles,
              event registrations, preferences, and permissions are applied according to the tenant and
              organization where the action takes place.
            </p>
            <p>
              You are responsible for the accuracy of the information you provide and for activity performed
              through your account. If you believe your account has been used without permission, sign out,
              clear local site data from the login page, and contact an administrator.
            </p>
          </section>

          <section id="content">
            <h2>Content and conduct</h2>
            <p>
              Members and organization administrators may publish profiles, event descriptions, images, comments,
              reactions, messages, and other materials. You should only post content that you have the right to
              share. Do not post content that is harassing, deceptive, discriminatory, illegal, spammy, invasive
              of privacy, or intended to disrupt the service.
            </p>
            <p>
              Administrators may moderate, hide, edit, or remove content when needed to operate the community,
              protect members, correct inaccurate listings, or respond to abuse reports.
            </p>
          </section>

          <section id="events">
            <h2>Events and organizations</h2>
            <p>
              Event pages and organization profiles are maintained by community members, organizers, automated
              imports, and administrators. Event details such as date, location, registration status, host,
              images, and descriptions may change. Check the event page and the organizer’s instructions before
              attending or relying on a listing.
            </p>
            <p>
              Organization admins are responsible for the pages, events, images, custom domains, and messages
              they publish through the portal. Claiming or administering an organization does not create an
              employment, agency, partnership, or endorsement relationship with OrgPortal or another tenant.
            </p>
          </section>

          <section id="communications">
            <h2>Communications</h2>
            <p>
              The service may send or display messages about sign-in, registrations, event updates, comments,
              community conversations, organization administration, and account activity. You may be able to
              control some preferences in your account or through unsubscribe links. Essential security,
              transactional, or administrative notices may still be sent when needed to operate the service.
            </p>
          </section>

          <section id="privacy">
            <h2>Privacy and data</h2>
            <p>
              OrgPortal stores information needed to run the service, including account identity, authentication
              state, profile details, organization roles, event registrations, comments, reactions, messages,
              uploaded images, feedback, and operational logs. Some information is public by design, including
              public organization pages, public event pages, public comments, and public profile fields.
            </p>
            <p>
              Tenant branding does not mean a separate account system. Because membership identity is shared
              between all OrgPortal tenants, account-level data may be used to authenticate you across tenants,
              prevent abuse, keep sessions working, and show your profile consistently where you participate.
              Tenant-specific content and permissions are used in the context of the relevant tenant, community,
              organization, or event.
            </p>
          </section>

          <section id="availability">
            <h2>Availability and changes</h2>
            <p>
              The service may change as features are added, retired, renamed, or reconfigured. Content may be
              imported from public or organizer-provided feeds and may be corrected or removed. The service may
              be unavailable during maintenance, provider outages, deployment, or abuse mitigation.
            </p>
          </section>

          <section id="contact">
            <h2>Questions</h2>
            <p>
              For questions about a specific event or organization, contact that organizer or tenant administrator.
              For account or platform questions, use the available site contact, profile, or administrator tools.
            </p>
            <p>
              <Link to={portalProfilePath('/')}>Return to {brandName}</Link>
            </p>
          </section>
        </div>
      </div>
    </section>
  )
}
