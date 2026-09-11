import assert from "node:assert/strict";
import test from "node:test";
import worker, { app, runUbiTick } from "../src/index";

type Row = Record<string, unknown>;

class FakeStmt {
  constructor(
    private readonly db: FakeD1,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new FakeStmt(this.db, this.sql, params);
  }

  async first<T>() {
    return this.db.first<T>(this.sql, this.params);
  }

  async all<T>() {
    return { results: this.db.all<T>(this.sql, this.params) };
  }

  async run() {
    return this.db.run(this.sql, this.params);
  }
}

class FakeD1 {
  organizations: Row[] = [];
  events: Row[] = [];
  eventSlugAliases: Row[] = [];
  contacts: Row[] = [];
  motions: Row[] = [];
  governanceVotes: Row[] = [];
  engagementVotes: Row[] = [];
  ledgerAccounts: Row[] = [];
  ledgerTransactions: Row[] = [];
  ubiEligibility: Row[] = [];
  organizationFeedback: Row[] = [];
  organizationMemberships: Row[] = [];
  portalTenants: Row[] = [];
  ubiSettings: Row = {
    interval_seconds: 14 * 24 * 60 * 60,
    dena_annual: 5256,
    dena_precision: 6,
    entity_types: JSON.stringify(["individual"]),
    updated_at: "2026-06-07T00:00:00.000Z",
    updated_by: "test",
  };
  tickState: Row | null = null;
  tickRuns: Row[] = [];
  businessCardSettings: Row = {
    enabled: 1,
    per_user_limit_per_hour: 60,
    per_ip_limit_per_hour: 120,
    global_limit_per_hour: 1000,
    duplicate_hash_limit: 8,
    duplicate_hash_window_seconds: 86400,
    max_bytes: 6291456,
    allowed_content_types: JSON.stringify(["image/jpeg", "image/png", "image/webp"]),
    auto_clarification_enabled: 1,
    auto_min_confidence: 0.75,
    auto_min_margin: 0.2,
    updated_at: "2026-06-07T00:00:00.000Z",
    updated_by: "test",
  };
  scans: Row[] = [];

  prepare(sql: string) {
    return new FakeStmt(this, sql);
  }

  async batch(statements: FakeStmt[]) {
    const results = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
  }

  first<T>(sql: string, params: unknown[]): T | null {
    if (sql.includes("FROM organizations WHERE source_url = ?")) {
      return (this.organizations.find((row) => row.source_url === params[0]) as T) || null;
    }
    if (sql.includes("FROM organizations WHERE source_url IS NULL")) {
      const [name, city] = params.map((value) => String(value).toLowerCase());
      return (
        this.organizations.find(
          (row) => !row.source_url && String(row.name).toLowerCase() === name && String(row.city).toLowerCase() === city,
        ) as T
      ) || null;
    }
    if (sql.includes("FROM organizations WHERE id = ?")) {
      return (this.organizations.find((row) => row.id === params[0] || row.slug === params[1]) as T) || null;
    }
    if (sql.includes("FROM organizations WHERE slug = ?") || sql.includes("FROM organizations o WHERE o.slug = ?")) {
      return (this.organizations.find((row) => row.slug === params[0]) as T) || null;
    }
    if (sql.includes("FROM events WHERE ingest_key = ?")) {
      return (this.events.find((row) => row.ingest_key === params[0]) as T) || null;
    }
    if (sql.includes("FROM events WHERE slug = ?")) {
      return (this.events.find((row) => row.slug === params[0]) as T) || null;
    }
    if (sql.includes("count(*) AS n FROM events WHERE host_org_id = ?")) {
      return { n: this.events.filter((row) => row.host_org_id === params[0]).length } as T;
    }
    if (sql.includes("event_slug_aliases")) {
      const slug = params[0];
      const alias = this.eventSlugAliases.find((row) => row.slug === slug);
      const event = this.events.find((row) => row.slug === slug || row.id === alias?.event_id);
      if (!event) return null;
      const org = this.organizations.find((row) => row.id === event.host_org_id);
      return { ...event, organization_name: org?.name || null } as T;
    }
    if (sql.includes("FROM events e") && sql.includes("WHERE e.slug = ?")) {
      const event = this.events.find((row) => row.slug === params[0]);
      if (!event) return null;
      const org = this.organizations.find((row) => row.id === event.host_org_id);
      return { ...event, organization_name: org?.name || null } as T;
    }
    if (sql.includes("FROM governance_motions WHERE id = ?")) {
      return (this.motions.find((row) => row.id === params[0]) as T) || null;
    }
    if (sql.includes("FROM governance_engagement_votes") && sql.includes("AS up")) {
      const motionId = params[0];
      const votes = this.engagementVotes.filter((row) => row.motion_id === motionId);
      const up = votes.filter((row) => row.direction === "up").length;
      const down = votes.filter((row) => row.direction === "down").length;
      return { up, down, score: up - down } as T;
    }
    if (sql.includes("FROM governance_engagement_votes") && sql.includes("AS score")) {
      const motionId = params[0];
      return {
        score: this.engagementVotes
          .filter((row) => row.motion_id === motionId)
          .reduce((score, row) => score + (row.direction === "up" ? 1 : row.direction === "down" ? -1 : 0), 0),
      } as T;
    }
    if (sql.includes("SELECT * FROM user_contact_pages WHERE slug = ?")) {
      return (this.contacts.find((row) => row.slug === params[0]) as T) || null;
    }
    if (sql.includes("FROM portal_tenants WHERE hostname = ?")) {
      const row = this.portalTenants.find((row) => row.hostname === params[0] && (!sql.includes("id <> ?") || row.id !== params[1]));
      return (row as T) || null;
    }
    if (sql.includes("FROM portal_tenants WHERE slug = ?")) {
      return (this.portalTenants.find((row) => row.slug === params[0]) as T) || null;
    }
    if (sql.includes("FROM portal_tenants") && sql.includes("organization_id = ?")) {
      const [organizationId, slug] = params;
      const row =
        this.portalTenants.find((row) => row.organization_id === organizationId) ||
        this.portalTenants.find((row) => row.home_org_slug === slug);
      return (row as T) || null;
    }
    if (sql.includes("FROM ubi_runtime_settings WHERE id = 1")) {
      return this.ubiSettings as T;
    }
    if (sql.includes("FROM organization_feedback") && sql.includes("feedback_count")) {
      const organizationId = params[0];
      const rows = this.organizationFeedback.filter((row) => row.organization_id === organizationId);
      return {
        feedback_count: rows.length,
        feedback_positive_count: rows.filter((row) => row.rating === "positive").length,
        feedback_concern_count: rows.filter((row) => row.rating === "concern").length,
      } as T;
    }
    if (sql.includes("FROM organization_feedback") && sql.includes("user_id = ?")) {
      return (this.organizationFeedback.find((row) => row.organization_id === params[0] && row.user_id === params[1]) as T) || null;
    }
    if (sql.includes("SELECT role FROM organization_memberships")) {
      return (
        this.organizationMemberships.find(
          (row) => row.organization_id === params[0] && row.user_id === params[1] && row.status === "active",
        ) as T
      ) || null;
    }
    if (sql.includes("count(*) AS n FROM organization_memberships")) {
      return {
        n: this.organizationMemberships.filter((row) => row.organization_id === params[0] && row.status === "active").length,
      } as T;
    }
    if (sql.includes("SELECT * FROM ledger_accounts WHERE lower(email) = ?")) {
      return (this.ledgerAccounts.find((row) => String(row.email).toLowerCase() === params[0]) as T) || null;
    }
    if (sql.includes("SELECT * FROM ledger_accounts WHERE user_id = ?")) {
      return (this.ledgerAccounts.find((row) => row.user_id === params[0]) as T) || null;
    }
    if (sql.includes("FROM business_card_settings WHERE id = 1")) {
      return this.businessCardSettings as T;
    }
    if (sql.includes("count(*) AS n FROM business_card_scans")) {
      if (sql.includes("submitted_by_user_id = ?")) {
        return { n: this.scans.filter((row) => row.submitted_by_user_id === params[0]).length } as T;
      }
      if (sql.includes("submitted_ip = ?")) {
        return { n: this.scans.filter((row) => row.submitted_ip === params[0]).length } as T;
      }
      if (sql.includes("image_hash = ?")) {
        return { n: this.scans.filter((row) => row.image_hash === params[0]).length } as T;
      }
      return { n: this.scans.length } as T;
    }
    if (sql.includes("FROM business_card_scans WHERE id = ?")) {
      return (this.scans.find((row) => row.id === params[0]) as T) || null;
    }
    if (sql.includes("SELECT last_tick_at FROM ubi_tick_state")) {
      return (this.tickState as T) || null;
    }
    if (sql.includes("SELECT * FROM ubi_tick_state")) {
      return (this.tickState as T) || null;
    }
    return null;
  }

  all<T>(sql: string, params: unknown[]): T[] {
    if (sql.includes("SELECT id, slug FROM organizations")) {
      const [lower, upper] = params.map(String);
      return this.organizations.filter((row) => String(row.slug) >= lower && String(row.slug) < upper) as T[];
    }
    if (sql.includes("SELECT id, slug FROM events")) {
      const [lower, upper] = params.map(String);
      return this.events.filter((row) => String(row.slug) >= lower && String(row.slug) < upper) as T[];
    }
    if (sql.includes("FROM organizations o")) {
      return this.organizations.map((row) => ({
        ...row,
        upcoming_events_count: this.events.filter((event) => event.host_org_id === row.id).length,
        membership_count: this.organizationMemberships.filter((membership) => membership.organization_id === row.id && membership.status === "active").length,
        feedback_count: this.organizationFeedback.filter((feedback) => feedback.organization_id === row.id).length,
        feedback_positive_count: this.organizationFeedback.filter((feedback) => feedback.organization_id === row.id && feedback.rating === "positive").length,
        feedback_concern_count: this.organizationFeedback.filter((feedback) => feedback.organization_id === row.id && feedback.rating === "concern").length,
      })) as T[];
    }
    if (sql.includes("FROM organization_feedback")) {
      return this.organizationFeedback
        .filter((row) => row.organization_id === params[0])
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
        .slice(0, Number(params[1] || 100)) as T[];
    }
    if (sql.includes("FROM events e")) {
      const hostOrgId = sql.includes("WHERE e.host_org_id = ?") ? params[0] : null;
      const hostUserId = sql.includes("WHERE e.host_user_id = ?") ? params[0] : null;
      return this.events
        .filter((event) => !hostOrgId || event.host_org_id === hostOrgId)
        .filter((event) => !hostUserId || event.host_user_id === hostUserId)
        .map((event) => ({
          ...event,
          organization_name: this.organizations.find((org) => org.id === event.host_org_id)?.name || null,
        })) as T[];
    }
    if (sql.includes("FROM user_contact_pages")) {
      const enabledOnly = sql.includes("WHERE enabled = 1");
      return [...this.contacts]
        .filter((row) => !enabledOnly || Number(row.enabled) === 1)
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))) as T[];
    }
    if (sql.includes("FROM governance_motions m")) {
      return this.motions.map((motion) => ({
        ...motion,
        score: this.engagementVotes
          .filter((row) => row.motion_id === motion.id)
          .reduce((score, row) => score + (row.direction === "up" ? 1 : row.direction === "down" ? -1 : 0), 0),
      })) as T[];
    }
    if (sql.includes("FROM governance_votes WHERE motion_id = ?")) {
      return this.governanceVotes.filter((row) => row.motion_id === params[0]) as T[];
    }
    if (sql.includes("FROM ledger_accounts") && sql.includes("dena_balance")) {
      const entityTypes = params.map((value) => String(value).toLowerCase());
      const requiresPayout = sql.includes("COALESCE(dena_balance, 0) >= 0.01") || sql.includes("COALESCE(a.dena_balance, 0) >= 0.01");
      const dueDate = sql.includes("u.next_payment_date") ? String(params[params.length - 1]) : null;
      return this.ledgerAccounts
        .filter((row) => entityTypes.includes(String(row.entity_type).toLowerCase()))
        .filter((row) => !requiresPayout || Number(row.dena_balance || 0) >= 0.01)
        .filter((row) => {
          if (!dueDate) return true;
          const eligibility = this.ubiEligibility.find((item) => item.account_id === row.id);
          if (eligibility && Number(eligibility.is_eligible) !== 1) return false;
          return !eligibility?.next_payment_date || String(eligibility.next_payment_date) <= dueDate;
        }) as T[];
    }
    if (sql.includes("SELECT * FROM ubi_tick_runs")) {
      return [...this.tickRuns].sort((a, b) => String(b.started_at).localeCompare(String(a.started_at))).slice(0, 10) as T[];
    }
    if (sql.includes("SELECT * FROM ledger_accounts")) {
      return [...this.ledgerAccounts].sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0)) as T[];
    }
    if (sql.includes("FROM business_card_scans")) {
      if (sql.includes("WHERE submitted_by_user_id = ?")) {
        return this.scans.filter((row) => row.submitted_by_user_id === params[0]).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) as T[];
      }
      return [...this.scans].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) as T[];
    }
    return [];
  }

  async run(sql: string, params: unknown[]) {
    const now = "2026-06-07T00:00:00.000Z";
    if (sql.includes("INSERT INTO organizations")) {
      const row: Row = {
        id: params[0],
        name: params[1],
        slug: params[2],
        description: params[3],
        source_url: params[4],
        image_url: params[5],
        tags: params[6],
        city: params[7],
        created_at: params[8] || now,
        updated_at: params[9] || now,
      };
      const existingIndex = this.organizations.findIndex((item) => item.id === row.id);
      if (existingIndex >= 0) this.organizations[existingIndex] = { ...this.organizations[existingIndex], ...row };
      else this.organizations.push(row);
    }
    if (sql.includes("INSERT INTO events")) {
      const row: Row = {
        id: params[0],
        ingest_key: params[1],
        title: params[2],
        slug: params[3],
        description: params[4],
        starts_at: params[5],
        ends_at: params[6],
        location: params[7],
        source_url: params[8],
        image_url: params[9],
        social_title: params[10],
        social_description: params[11],
        social_image_url: params[12],
        host_user_id: params[13],
        host_user_name: params[14],
        host_org_id: params[15],
        host_org_name: params[16],
        host_org_source_url: params[17],
        event_chat_room_id: params[18],
        event_chat_room_alias: params[19],
        event_chat_room_name: params[20],
        tags: params[21],
        city: params[22],
        created_at: params[23] || now,
        updated_at: params[24] || now,
      };
      const existingIndex = this.events.findIndex((item) => item.ingest_key === row.ingest_key);
      if (existingIndex >= 0) this.events[existingIndex] = { ...this.events[existingIndex], ...row };
      else this.events.push(row);
    }
    if (sql.includes("INSERT OR IGNORE INTO ubi_tick_state")) {
      if (!this.tickState) {
        this.tickState = { id: "singleton", last_tick_at: params[0], updated_at: params[1] };
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }
    if (sql.includes("INSERT OR IGNORE INTO ubi_tick_runs")) {
      if (this.tickRuns.some((row) => row.run_key === params[0])) return { success: true, meta: { changes: 0 } };
      this.tickRuns.push({
        run_key: params[0],
        started_at: params[1],
        completed_at: null,
        status: "running",
        eligible_accounts: 0,
        payout_count: 0,
        accrued_amount: 0,
        paid_amount: 0,
        error: null,
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE ledger_accounts SET dena_balance = COALESCE(dena_balance, 0) + ?")) {
      const [amount, updatedAt, ...entityTypes] = params;
      for (const row of this.ledgerAccounts) {
        if (entityTypes.map((value) => String(value).toLowerCase()).includes(String(row.entity_type).toLowerCase())) {
          row.dena_balance = Number(row.dena_balance || 0) + Number(amount);
          row.updated_at = updatedAt;
        }
      }
    }
    if (sql.includes("UPDATE ledger_accounts SET balance = balance + ?")) {
      const [payout, denaDebit, updatedAt, accountId] = params;
      const row = this.ledgerAccounts.find((item) => item.id === accountId);
      if (row) {
        row.balance = Number(row.balance || 0) + Number(payout);
        row.dena_balance = Number(row.dena_balance || 0) - Number(denaDebit);
        row.updated_at = updatedAt;
      }
    }
    if (sql.includes("INSERT INTO ledger_transactions")) {
      this.ledgerTransactions.push({
        id: params[0],
        from_account_id: null,
        to_account_id: params[1],
        amount: params[2],
        currency: "DEM",
        transaction_type: "UBI_PAYMENT",
        description: params[3],
        timestamp: params[4],
      });
    }
    if (sql.includes("INSERT OR IGNORE INTO ledger_accounts") || sql.includes("INSERT INTO ledger_accounts")) {
      if (sql.includes("SELECT")) {
        for (const contact of this.contacts) {
          const email = String(contact.user_email || `${contact.user_id}@local.codecollective`).toLowerCase();
          if (this.ledgerAccounts.some((row) => String(row.email).toLowerCase() === email)) continue;
          this.ledgerAccounts.push({
            id: `acct-user-${contact.user_id}`,
            user_id: contact.user_id,
            name: contact.user_name || "User",
            email,
            entity_type: "individual",
            balance: 0,
            dena_balance: 0,
            created_at: contact.created_at || params[0],
            updated_at: params[1] || params[0],
          });
        }
      } else if (!this.ledgerAccounts.some((row) => row.id === params[0] || String(row.email).toLowerCase() === String(params[3]).toLowerCase())) {
        this.ledgerAccounts.push({
          id: params[0],
          user_id: params[1],
          name: params[2],
          email: params[3],
          entity_type: "individual",
          balance: 0,
          dena_balance: 0,
          created_at: params[4],
          updated_at: params[5],
        });
      }
    }
    if (sql.includes("INSERT INTO ubi_eligibility")) {
      const [accountId, nextPaymentDate, lastPaymentAmount, totalPayment] = params;
      const existing = this.ubiEligibility.find((row) => row.account_id === accountId);
      if (existing) {
        existing.next_payment_date = nextPaymentDate;
        existing.last_payment_amount = lastPaymentAmount;
        existing.total_payments_received = Number(existing.total_payments_received || 0) + Number(lastPaymentAmount);
      } else {
        this.ubiEligibility.push({
          account_id: accountId,
          is_eligible: 1,
          next_payment_date: nextPaymentDate,
          last_payment_amount: lastPaymentAmount,
          total_payments_received: totalPayment,
        });
      }
    }
    if (sql.includes("INSERT OR IGNORE INTO ubi_eligibility") && sql.includes("SELECT id")) {
      for (const account of this.ledgerAccounts) {
        if (String(account.entity_type).toLowerCase() !== "individual" || !account.user_id) continue;
        if (this.ubiEligibility.some((row) => row.account_id === account.id)) continue;
        this.ubiEligibility.push({
          account_id: account.id,
          is_eligible: 1,
          next_payment_date: params[0],
          last_payment_amount: 0,
          total_payments_received: 0,
        });
      }
    }
    if (sql.includes("UPDATE ubi_tick_state SET last_tick_at = ?")) {
      this.tickState = { id: "singleton", last_tick_at: params[0], updated_at: params[1] };
    }
    if (sql.includes("UPDATE ubi_tick_runs") && sql.includes("status = 'completed'")) {
      const row = this.tickRuns.find((item) => item.run_key === params[5]);
      if (row) {
        row.completed_at = params[0];
        row.status = "completed";
        row.eligible_accounts = params[1];
        row.payout_count = params[2];
        row.accrued_amount = params[3];
        row.paid_amount = params[4];
      }
    }
    if (sql.includes("UPDATE ubi_tick_runs SET completed_at = ?, status = 'failed'")) {
      const row = this.tickRuns.find((item) => item.run_key === params[2]);
      if (row) {
        row.completed_at = params[0];
        row.status = "failed";
        row.error = params[1];
      }
    }
    if (sql.includes("INSERT INTO ubi_runtime_settings")) {
      this.ubiSettings = {
        interval_seconds: params[0],
        dena_annual: params[1],
        dena_precision: params[2],
        entity_types: params[3],
        updated_at: params[4],
        updated_by: params[5],
      };
    }
    if (sql.includes("INSERT INTO business_card_settings")) {
      this.businessCardSettings = {
        enabled: params[0],
        per_user_limit_per_hour: params[1],
        per_ip_limit_per_hour: params[2],
        global_limit_per_hour: params[3],
        duplicate_hash_limit: params[4],
        duplicate_hash_window_seconds: params[5],
        max_bytes: params[6],
        allowed_content_types: params[7],
        auto_clarification_enabled: params[8],
        auto_min_confidence: params[9],
        auto_min_margin: params[10],
        updated_at: params[11],
        updated_by: params[12],
      };
    }
    if (sql.includes("INSERT INTO business_card_scans")) {
      this.scans.push({
        id: params[0],
        submitted_by_user_id: params[1],
        submitted_by_email: params[2],
        submitted_by_name: params[3],
        submitted_ip: params[4],
        scan_kind_requested: params[5],
        scan_kind: params[6],
        notes: params[7],
        original_filename: params[8],
        content_type: params[9],
        image_size: params[10],
        image_hash: params[11],
        image_key: params[12],
        extracted_name: params[13],
        extracted_email: params[14],
        extracted_phone: params[15],
        extracted_company: params[16],
        extracted_title: params[17],
        extracted_url: params[18],
        created_target_type: params[19],
        created_target_id: params[20],
        created_target_slug: params[21],
        created_target_name: params[22],
        created_targets: params[23],
        clarification_required: params[24],
        clarification_message: params[25],
        confidence: params[26],
        pidp_user_created: 0,
        created_at: params[27],
      });
    }
    if (sql.includes("INSERT INTO organization_feedback")) {
      const existing = this.organizationFeedback.find((row) => row.organization_id === params[0] && row.user_id === params[1]);
      if (existing) {
        existing.user_name = params[2];
        existing.rating = params[3];
        existing.comment = params[4];
        existing.updated_at = params[6];
      } else {
        this.organizationFeedback.push({
          organization_id: params[0],
          user_id: params[1],
          user_name: params[2],
          rating: params[3],
          comment: params[4],
          created_at: params[5],
          updated_at: params[6],
        });
      }
    }
    if (sql.includes("DELETE FROM organization_feedback")) {
      this.organizationFeedback = this.organizationFeedback.filter((row) => !(row.organization_id === params[0] && row.user_id === params[1]));
    }
    if (sql.includes("INSERT INTO organization_memberships")) {
      const existing = this.organizationMemberships.find((row) => row.organization_id === params[0] && row.user_id === params[1]);
      if (existing) {
        existing.user_name = params[2];
        existing.user_email = params[3];
        existing.status = "active";
        existing.updated_at = params[5];
      } else {
        this.organizationMemberships.push({
          organization_id: params[0],
          user_id: params[1],
          user_name: params[2],
          user_email: params[3],
          role: "member",
          status: "active",
          created_at: params[4],
          updated_at: params[5],
        });
      }
    }
    if (sql.includes("UPDATE organization_memberships SET status = 'inactive'")) {
      const row = this.organizationMemberships.find(
        (membership) => membership.organization_id === params[1] && membership.user_id === params[2] && membership.role === "member",
      );
      if (row) {
        row.status = "inactive";
        row.updated_at = params[0];
      }
    }
    if (sql.includes("INSERT INTO portal_tenants")) {
      const existing = this.portalTenants.find((row) => row.id === params[0]);
      const row = {
        id: params[0],
        organization_id: params[1],
        slug: params[2],
        hostname: params[3],
        name: params[4],
        tagline: params[5],
        accent_color: params[6],
        profile: "community",
        features: params[7],
        brand_image_path: params[8],
        home_url: params[9],
        member_home_path: "/chat",
        manifest_path: "/manifest.webmanifest",
        theme_color: params[10],
        home_kind: params[11],
        home_path: params[12],
        home_org_slug: params[13],
        home_heading: params[14],
        home_description: params[15],
        home_primary_label: params[16],
        home_primary_href: params[17],
        home_secondary_label: params[18],
        home_secondary_href: params[19],
        home_image_url: params[20],
        public_base_url: params[21],
        canonical_path_prefix: "/p",
        feature_config: params[22],
        custom_domain_hostname: null,
        custom_domain_status: "none",
        custom_domain_requested_at: null,
        custom_domain_attached_at: null,
        custom_domain_notes: null,
        created_at: params[23],
        updated_at: params[24],
      };
      if (existing) Object.assign(existing, row);
      else this.portalTenants.push(row);
    }
    if (sql.includes("custom_domain_status = 'requested'")) {
      const row = this.portalTenants.find((tenant) => tenant.id === params[4]);
      if (row) {
        row.custom_domain_hostname = params[0];
        row.custom_domain_status = "requested";
        row.custom_domain_requested_at = params[1];
        row.custom_domain_attached_at = null;
        row.custom_domain_notes = params[2];
        row.updated_at = params[3];
      }
    }
    if (sql.includes("custom_domain_status = 'attached'")) {
      const row = this.portalTenants.find((tenant) => tenant.id === params[6]);
      if (row) {
        row.hostname = params[0];
        row.public_base_url = params[1];
        row.canonical_path_prefix = "";
        row.custom_domain_hostname = params[2];
        row.custom_domain_status = "attached";
        row.custom_domain_attached_at = params[3];
        row.custom_domain_notes = params[4];
        row.updated_at = params[5];
      }
    }
    return { success: true, meta: { changes: 1 } };
  }
}

function env(db = new FakeD1()): Env {
  return {
    DB: db as unknown as D1Database,
    PIDP_BASE_URL: "https://id.example.test",
    PUBLIC_PORTAL_BASE_URL: "https://codecollective.test/p",
    ORG_INGEST_TOKEN: "test-ingest-token",
  };
}

async function withPidpUser<T>(user: Row, callback: () => Promise<T>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(user), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("path-qualified MCP protected resource metadata is public", async () => {
  const response = await app.request("https://org.example.test/.well-known/oauth-protected-resource/api/org/mcp", {}, {
    ...env(),
    MCP_PUBLIC_URL: "https://medtech.social/api/org/mcp",
    MCP_OAUTH_ISSUER: "https://id.codecollective.us",
    MCP_OAUTH_JWKS_URL: "https://id.codecollective.us/.well-known/jwks.json",
    MCP_SUBJECT_MAP_JSON: "{}",
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json() as Record<string, unknown>;
  assert.equal(body.resource, "https://medtech.social/api/org/mcp");
  assert.deepEqual(body.authorization_servers, ["https://id.codecollective.us"]);
});


test("worker fetch serves path-qualified MCP protected resource metadata before fallback", async () => {
  const response = await worker.fetch(new Request("https://org.example.test/.well-known/oauth-protected-resource/api/org/mcp"), {
    ...env(),
    MCP_PUBLIC_URL: "https://medtech.social/api/org/mcp",
    MCP_OAUTH_ISSUER: "https://id.codecollective.us",
    MCP_OAUTH_JWKS_URL: "https://id.codecollective.us/.well-known/jwks.json",
    MCP_SUBJECT_MAP_JSON: "{}",
  }, { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json() as Record<string, unknown>;
  assert.equal(body.resource, "https://medtech.social/api/org/mcp");
});

test("health route identifies the org worker", async () => {
  const res = await app.request("https://org.example.test/health", {}, env());
  assert.equal(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assert.equal(body.ok, true);
  assert.equal(body.service, "org-worker");
  assert.ok(body.commit === null || /^[a-f0-9]{40,64}$/.test(String(body.commit)));
  assert.ok(Number.isFinite(Date.parse(String(body.builtAt))));
  assert.ok(Number.isFinite(Date.parse(String(body.time))));
  assert.equal(body.workerVersionId, null);
  assert.equal(body.hostname, "org.example.test");
  assert.equal(body.environment, "production");
  assert.equal(res.headers.get("cache-control"), "no-store");
  const versionEnv = { ...env(), ENV: "test", CF_VERSION_METADATA: { id: "worker-version", tag: "release", timestamp: "2026-09-09T00:00:00Z" } };
  const version = await app.request("https://org.example.test/version", {}, versionEnv);
  assert.equal(version.status, 200);
  assert.equal(version.headers.get("cache-control"), "no-store");
  const versionBody = await version.json() as Record<string, unknown>;
  assert.equal(versionBody.ok, undefined);
  assert.equal(versionBody.workerVersionId, "worker-version");
  assert.equal(versionBody.hostname, "org.example.test");
  assert.equal(versionBody.environment, "test");
  assert.ok(Number.isFinite(Date.parse(String(versionBody.time))));
});

test("protected contact route requires a bearer token", async () => {
  const res = await app.request("https://org.example.test/api/network/contact/me", {}, env());
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { detail: "Authentication required" });
});

test("PIdP sysadmins have Dena UBI admin access", async () => {
  const db = new FakeD1();
  db.tickState = { id: "singleton", last_tick_at: "2026-06-07T00:00:00.000Z", updated_at: "2026-06-07T00:00:00.000Z" };
  db.ledgerAccounts.push({
    id: "acct-admin-visible",
    user_id: "user-1",
    name: "Visible Account",
    email: "visible@example.test",
    entity_type: "individual",
    balance: 42,
    dena_balance: 0,
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z",
  });

  await withPidpUser({ id: "admin-1", email: "admin@example.test", full_name: "Admin", is_sysadmin: true }, async () => {
    const adminMe = await app.request("https://org.example.test/admin/me", { headers: { authorization: "Bearer admin-token" } }, env(db));
    assert.equal(adminMe.status, 200);
    assert.deepEqual(await adminMe.json(), { is_admin: true, is_sysadmin: true });

    const settings = await app.request(
      "https://org.example.test/api/ubi/settings",
      {
        method: "PATCH",
        headers: { authorization: "Bearer admin-token", "content-type": "application/json" },
        body: JSON.stringify({ interval_seconds: 1209600, dena_annual: 2, dena_precision: 6, entity_types: ["individual"] }),
      },
      env(db),
    );
    assert.equal(settings.status, 200);
    const updated = (await settings.json()) as { dena_annual: number; interval_seconds: number };
    assert.equal(updated.interval_seconds, 1209600);
    assert.equal(updated.dena_annual, 2);

    const tickStatus = await app.request("https://org.example.test/api/ubi/tick-status", { headers: { authorization: "Bearer admin-token" } }, env(db));
    assert.equal(tickStatus.status, 200);

    const accounts = await app.request("https://org.example.test/api/admin/accounts", { headers: { authorization: "Bearer admin-token" } }, env(db));
    assert.equal(accounts.status, 200);
    const rows = (await accounts.json()) as Array<{ id: string; balance: number }>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "acct-admin-visible");
  });
});

test("PIdP CIS admin roles are accepted for UBI admin access", async () => {
  await withPidpUser({ id: "cis-1", email: "cis@example.test", identity_data: { roles: ["cis_admin"] } }, async () => {
    const res = await app.request("https://org.example.test/admin/me", { headers: { authorization: "Bearer cis-token" } }, env());
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { is_admin: true, is_sysadmin: true });
  });
});

test("non-admin PIdP users cannot mutate UBI settings", async () => {
  await withPidpUser({ id: "user-1", email: "user@example.test", is_sysadmin: false }, async () => {
    const res = await app.request(
      "https://org.example.test/api/ubi/settings",
      {
        method: "PATCH",
        headers: { authorization: "Bearer user-token", "content-type": "application/json" },
        body: JSON.stringify({ dena_annual: 3 }),
      },
      env(),
    );
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { detail: "Admin access required" });
  });
});

test("public contact routes return sanitized canonical user URLs for exact slugs", async () => {
  const db = new FakeD1();
  db.contacts.push({
    id: "contact-1",
    user_id: "user-1",
    user_email: "julian@example.test",
    user_name: "Julian Coy",
    slug: "julian-coy",
    enabled: 1,
    headline: "Organizer",
    bio: null,
    photo_url: null,
    email_public: "julian@example.test",
    phone_public: null,
    linkedin_url: "https://www.linkedin.com/in/julian-coy-a2906415/",
    github_url: "https://github.com/juliancoy",
    x_url: null,
    website_url: "https://juliancoy.us/",
    links: JSON.stringify([{ label: "Site", url: "https://juliancoy.us/" }]),
    source_profile_url: null,
    source_profile_imported_at: null,
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
  });

  const res = await app.request("https://org.example.test/api/network/users/public/julian-coy", {}, env(db));
  assert.equal(res.status, 200);
  const contact = (await res.json()) as { slug: string; public_url: string };
  assert.equal(contact.slug, "julian-coy");
  assert.equal(contact.public_url, "https://codecollective.test/p/users/julian-coy");
});

test("tenant host public URLs are root-mounted even when shared portal base is configured", async () => {
  const db = new FakeD1();
  db.portalTenants.push({
    id: "baltimore-medtech",
    hostname: "medtech.social",
    name: "Baltimore MedTech",
    tagline: "Health x Medicine x Biotech",
    accent_color: "#0f6f8f",
    profile: "baltimore-medtech",
    features: JSON.stringify(["directory", "events", "chat"]),
    public_base_url: "https://medtech.social",
    canonical_path_prefix: "",
  });
  db.contacts.push({
    id: "contact-1",
    user_id: "user-1",
    user_email: "member@example.test",
    user_name: "Jordan",
    slug: "jordan",
    enabled: 1,
    headline: "Founder",
    bio: null,
    photo_url: null,
    email_public: null,
    phone_public: null,
    linkedin_url: null,
    github_url: null,
    x_url: null,
    website_url: null,
    links: "[]",
    source_profile_url: null,
    source_profile_imported_at: null,
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
  });
  db.organizations.push({
    id: "org-1",
    name: "Baltimore MedTech",
    slug: "baltimore-medtech",
    description: "Health community",
    source_url: null,
    image_url: null,
    tags: "[]",
    city: "baltimore",
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
  });
  db.events.push({
    id: "event-1",
    ingest_key: "event-key",
    title: "Founder Night",
    slug: "founder-night",
    description: "Meet founders",
    starts_at: "2026-06-08T12:00:00Z",
    ends_at: null,
    location: "Baltimore",
    source_url: null,
    image_url: null,
    host_org_id: "org-1",
    host_org_name: "Baltimore MedTech",
    host_org_source_url: null,
    tags: "[]",
    city: "baltimore",
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
  });

  const contactRes = await app.request("https://medtech.social/api/network/users/public/jordan", {}, env(db));
  assert.equal(contactRes.status, 200);
  assert.equal(((await contactRes.json()) as { public_url: string }).public_url, "https://medtech.social/users/jordan");

  const orgRes = await app.request("https://medtech.social/api/network/orgs/public/baltimore-medtech", {}, env(db));
  assert.equal(orgRes.status, 200);
  assert.equal(((await orgRes.json()) as { public_url: string }).public_url, "https://medtech.social/orgs/baltimore-medtech");

  const eventRes = await app.request("https://medtech.social/api/network/events/public/founder-night", {}, env(db));
  assert.equal(eventRes.status, 200);
  assert.equal(((await eventRes.json()) as { public_url: string }).public_url, "https://medtech.social/events/founder-night");
});

test("public contact route does not numerically fallback from missing slugs", async () => {
  const db = new FakeD1();
  db.contacts.push({
    id: "contact-1",
    user_id: "user-1",
    user_email: "julian@example.test",
    user_name: "Julian Coy",
    slug: "julian-coy",
    enabled: 1,
    headline: "Organizer",
    bio: null,
    photo_url: null,
    email_public: "julian@example.test",
    phone_public: null,
    linkedin_url: null,
    github_url: null,
    x_url: null,
    website_url: null,
    links: "[]",
    source_profile_url: null,
    source_profile_imported_at: null,
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
  });

  const res = await app.request("https://org.example.test/api/network/users/public/julian-coy-2", {}, env(db));
  assert.equal(res.status, 404);
});

test("public contact route requires exact slug matches", async () => {
  const db = new FakeD1();
  db.contacts.push({
    id: "contact-1",
    user_id: "user-1",
    user_email: "julian@example.test",
    user_name: "Julian Coy",
    slug: "julian-coy-2",
    enabled: 1,
    headline: "Organizer",
    bio: null,
    photo_url: null,
    email_public: "julian@example.test",
    phone_public: null,
    linkedin_url: null,
    github_url: null,
    x_url: null,
    website_url: null,
    links: "[]",
    source_profile_url: null,
    source_profile_imported_at: null,
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
  });

  const res = await app.request("https://org.example.test/api/network/users/public/Julian-Coy-2", {}, env(db));
  assert.equal(res.status, 404);
});

test("disabled public contact route is visible only to the exact owner", async () => {
  const db = new FakeD1();
  db.contacts.push({
    id: "contact-1",
    user_id: "user-1",
    user_email: "julian@example.test",
    user_name: "Julian Coy",
    slug: "julian-coy-2",
    enabled: 0,
    headline: "Organizer",
    bio: null,
    photo_url: null,
    email_public: "julian@example.test",
    phone_public: null,
    linkedin_url: null,
    github_url: null,
    x_url: null,
    website_url: null,
    links: "[]",
    source_profile_url: null,
    source_profile_imported_at: null,
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
  });

  const unauthenticated = await app.request("https://org.example.test/api/network/users/public/julian-coy-2", {}, env(db));
  assert.equal(unauthenticated.status, 404);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ id: "user-1", email: "julian@example.test", name: "Julian Coy" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  try {
    const owner = await app.request(
      "https://org.example.test/api/network/users/public/julian-coy-2",
      { headers: { authorization: "Bearer owner-token" } },
      env(db),
    );
    assert.equal(owner.status, 200);
    const contact = (await owner.json()) as { slug: string; enabled: boolean };
    assert.equal(contact.slug, "julian-coy-2");
    assert.equal(contact.enabled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public org and event routes return D1 rows", async () => {
  const db = new FakeD1();
  db.organizations.push({
    id: "org-1",
    name: "Code Collective",
    slug: "code-collective",
    description: "Civic tech",
    source_url: "https://codecollective.test",
    image_url: null,
    tags: JSON.stringify(["Civic"]),
    city: "baltimore",
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
  });
  db.events.push({
    id: "event-1",
    ingest_key: "event-key",
    title: "Open Meeting",
    slug: "open-meeting",
    description: "Public meeting",
    starts_at: "2026-06-08T12:00:00Z",
    ends_at: null,
    location: "Baltimore",
    source_url: "https://codecollective.test/events/open-meeting",
    image_url: null,
    host_org_id: "org-1",
    host_org_name: "Code Collective",
    host_org_source_url: "https://codecollective.test",
    tags: JSON.stringify(["Civic"]),
    city: "baltimore",
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
  });

  const orgList = await app.request("https://org.example.test/api/network/orgs/public", {}, env(db));
  assert.equal(orgList.status, 200);
  const orgs = (await orgList.json()) as Array<{ slug: string; upcoming_events_count: number }>;
  assert.equal(orgs[0].slug, "code-collective");
  assert.equal(orgs[0].upcoming_events_count, 1);

  const eventDetail = await app.request("https://org.example.test/api/network/events/public/open-meeting", {}, env(db));
  assert.equal(eventDetail.status, 200);
  const event = (await eventDetail.json()) as { title: string; organization_name: string };
  assert.equal(event.title, "Open Meeting");
  assert.equal(event.organization_name, "Code Collective");
});

test("public event chat returns configured room metadata for comment views", async () => {
  const db = new FakeD1();
  db.events.push({
    id: "event-1",
    ingest_key: "event-1",
    title: "Commentable Event",
    slug: "commentable-event",
    description: null,
    starts_at: null,
    ends_at: null,
    location: null,
    source_url: null,
    image_url: null,
    host_user_id: null,
    host_user_name: null,
    host_org_id: null,
    host_org_name: null,
    host_org_source_url: null,
    event_chat_room_id: "event-room-commentable-event",
    event_chat_room_alias: null,
    event_chat_room_name: "Commentable Event",
    tags: "[]",
    city: null,
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z",
  });

  const response = await app.request("https://org.example.test/api/network/events/public/commentable-event/chat", {}, env(db));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    event_slug: "commentable-event",
    room_exists: true,
    conversation_id: "event-room-commentable-event",
    room_name: "Commentable Event",
    messages: [],
  });
});

test("public event detail resolves old slug aliases to canonical event urls", async () => {
  const db = new FakeD1();
  db.portalTenants.push({
    id: "baltimore-medtech",
    hostname: "medtech.social",
    name: "Baltimore MedTech",
    tagline: "Health x Medicine x Biotech",
    accent_color: "#0f6f8f",
    profile: "baltimore-medtech",
    features: JSON.stringify(["directory", "events", "chat"]),
    public_base_url: "https://medtech.social",
    canonical_path_prefix: "",
  });
  db.events.push({
    id: "event-1",
    ingest_key: "event-1",
    title: "MedTech in the Hut",
    slug: "medtech-in-the-hut",
    description: null,
    starts_at: null,
    ends_at: null,
    location: null,
    source_url: null,
    image_url: null,
    host_user_id: null,
    host_user_name: null,
    host_org_id: null,
    host_org_name: null,
    host_org_source_url: null,
    event_chat_room_id: "event-room-medtech-in-the-hut",
    event_chat_room_alias: null,
    event_chat_room_name: "MedTech in the Hut Comments",
    tags: "[]",
    city: null,
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z",
  });
  db.eventSlugAliases.push({ slug: "medtech-formational-event", event_id: "event-1" });

  const response = await app.request("https://medtech.social/api/network/events/public/medtech-formational-event", {}, env(db));
  assert.equal(response.status, 200);
  const event = await response.json() as { slug: string; public_url: string };
  assert.equal(event.slug, "medtech-in-the-hut");
  assert.equal(event.public_url, "https://medtech.social/events/medtech-in-the-hut");

  const chatResponse = await app.request("https://medtech.social/api/network/events/public/medtech-formational-event/chat", {}, env(db));
  assert.equal(chatResponse.status, 200);
  assert.deepEqual(await chatResponse.json(), {
    event_slug: "medtech-in-the-hut",
    room_exists: true,
    conversation_id: "event-room-medtech-in-the-hut",
    room_name: "MedTech in the Hut Comments",
    messages: [],
  });
});

test("public user event route returns individual-hosted calendar entries", async () => {
  const db = new FakeD1();
  db.contacts.push({
    id: "contact-1",
    user_id: "user-1",
    user_email: "julian@example.test",
    user_name: "Julian Coy",
    slug: "julian-coy",
    enabled: 1,
    headline: "Organizer",
    bio: null,
    photo_url: null,
    email_public: "julian@example.test",
    phone_public: null,
    linkedin_url: null,
    github_url: null,
    x_url: null,
    website_url: null,
    links: "[]",
    source_profile_url: null,
    source_profile_imported_at: null,
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
  });
  db.events.push(
    {
      id: "event-1",
      ingest_key: "user-event-key",
      title: "Half-hour consults",
      slug: "half-hour-consults",
      description: "Book a half-hour session.",
      starts_at: "2026-08-12T14:00:00Z",
      ends_at: "2026-08-12T14:30:00Z",
      location: "Remote",
      source_url: null,
      image_url: null,
      host_user_id: "user-1",
      host_user_name: "Julian Coy",
      host_org_id: null,
      host_org_name: null,
      host_org_source_url: null,
      tags: JSON.stringify(["Health"]),
      city: "baltimore",
      created_at: "2026-08-11T00:00:00Z",
      updated_at: "2026-08-11T00:00:00Z",
    },
    {
      id: "event-2",
      ingest_key: "other-event-key",
      title: "Someone Else",
      slug: "someone-else",
      description: "Different host",
      starts_at: "2026-08-12T16:00:00Z",
      ends_at: "2026-08-12T16:30:00Z",
      location: "Remote",
      source_url: null,
      image_url: null,
      host_user_id: "user-2",
      host_user_name: "Other Person",
      host_org_id: null,
      host_org_name: null,
      host_org_source_url: null,
      tags: JSON.stringify(["Health"]),
      city: "baltimore",
      created_at: "2026-08-11T00:00:00Z",
      updated_at: "2026-08-11T00:00:00Z",
    },
  );

  const res = await app.request("https://org.example.test/api/network/users/public/julian-coy/events?upcoming_only=true&limit=8", {}, env(db));
  assert.equal(res.status, 200);
  const events = (await res.json()) as Array<{ slug: string; host_type: string; host_user_id: string }>;
  assert.deepEqual(events.map((event) => event.slug), ["half-hour-consults"]);
  assert.equal(events[0].host_type, "individual");
  assert.equal(events[0].host_user_id, "user-1");
});

test("public network search tolerates slight misspellings", async () => {
  const db = new FakeD1();
  db.organizations.push(
    {
      id: "org-1",
      name: "Code Collective",
      slug: "code-collective",
      description: "Civic tech",
      source_url: "https://codecollective.test",
      image_url: null,
      tags: JSON.stringify(["Civic"]),
      city: "baltimore",
      created_at: "2026-06-07T00:00:00Z",
      updated_at: "2026-06-07T00:00:00Z",
    },
    {
      id: "org-2",
      name: "Garden Club",
      slug: "garden-club",
      description: "Plant swaps",
      source_url: "https://garden.test",
      image_url: null,
      tags: JSON.stringify(["Garden"]),
      city: "baltimore",
      created_at: "2026-06-07T00:00:00Z",
      updated_at: "2026-06-07T00:00:00Z",
    },
  );
  db.events.push({
    id: "event-1",
    ingest_key: "event-key",
    title: "Open Meeting",
    slug: "open-meeting",
    description: "Public meeting",
    starts_at: "2026-06-08T12:00:00Z",
    ends_at: null,
    location: "Baltimore",
    source_url: "https://codecollective.test/events/open-meeting",
    image_url: null,
    host_org_id: "org-1",
    host_org_name: "Code Collective",
    host_org_source_url: "https://codecollective.test",
    tags: JSON.stringify(["Civic"]),
    city: "baltimore",
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
  });
  db.contacts.push({
    id: "contact-1",
    user_id: "user-1",
    user_email: "julian@example.test",
    user_name: "Julian Coy",
    slug: "julian-coy",
    enabled: 1,
    headline: "Organizer",
    bio: null,
    photo_url: null,
    email_public: "julian@example.test",
    phone_public: null,
    linkedin_url: null,
    github_url: null,
    x_url: null,
    website_url: null,
    links: "[]",
    source_profile_url: null,
    source_profile_imported_at: null,
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
  });

  const orgSearch = await app.request("https://org.example.test/api/network/orgs/public?q=cod%20colectiv", {}, env(db));
  assert.equal(orgSearch.status, 200);
  const orgs = (await orgSearch.json()) as Array<{ slug: string }>;
  assert.deepEqual(orgs.map((org) => org.slug), ["code-collective"]);

  const eventSearch = await app.request("https://org.example.test/api/network/events/public?q=opn%20meetng", {}, env(db));
  assert.equal(eventSearch.status, 200);
  const events = (await eventSearch.json()) as Array<{ slug: string }>;
  assert.deepEqual(events.map((event) => event.slug), ["open-meeting"]);

  const userSearch = await app.request("https://org.example.test/api/network/users/public?q=julain", {}, env(db));
  assert.equal(userSearch.status, 200);
  const users = (await userSearch.json()) as Array<{ slug: string }>;
  assert.deepEqual(users.map((user) => user.slug), ["julian-coy"]);
});

test("public network search does not broaden unrelated short queries", async () => {
  const db = new FakeD1();
  db.organizations.push({
    id: "org-1",
    name: "Code Collective",
    slug: "code-collective",
    description: "Civic tech",
    source_url: "https://codecollective.test",
    image_url: null,
    tags: JSON.stringify(["Civic"]),
    city: "baltimore",
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
  });

  const orgSearch = await app.request("https://org.example.test/api/network/orgs/public?q=zz", {}, env(db));
  assert.equal(orgSearch.status, 200);
  assert.deepEqual(await orgSearch.json(), []);
});

test("calendar ingest requires the configured token", async () => {
  const res = await app.request(
    "https://org.example.test/api/network/ingest/calendar",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizations: [], events: [] }),
    },
    env(),
  );
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { detail: "Authentication required" });
});

test("calendar ingest upserts orgs and events", async () => {
  const db = new FakeD1();
  const payload = {
    organizations: [
      {
        name: "Backwater Books Events",
        source_url: "https://backwaterbooks.com/events",
        image_url: "/event_images/backwater.webp",
        tags: ["Books", "city:dc"],
        description: "Calendar source",
        city: "dc",
      },
    ],
    events: [
      {
        ingest_key: "event-key-1",
        title: "Backwater Sessions",
        description: "Reading",
        starts_at: "2026-06-08T00:00:00+00:00",
        location: "DC",
        source_url: "https://backwaterbooks.com/event",
        image_url: "/event_images/session.webp",
        host_org_source_url: "https://backwaterbooks.com/events",
        host_org_name: "Backwater Books Events",
        tags: ["Books"],
        city: "dc",
      },
    ],
  };
  const res = await app.request(
    "https://org.example.test/api/network/ingest/calendar",
    {
      method: "POST",
      headers: {
        authorization: "Bearer test-ingest-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    env(db),
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, organizations: 1, events: 1 });
  assert.equal(db.organizations.length, 1);
  assert.equal(db.events.length, 1);
  assert.equal(db.organizations[0].image_url, "https://codecollective.us/event_images/backwater.webp");
  assert.equal(db.events[0].host_org_id, db.organizations[0].id);
  assert.equal(db.events[0].image_url, "https://codecollective.us/event_images/session.webp");
});

test("business card scan submission stores history and creates organization targets", async () => {
  const db = new FakeD1();
  await withPidpUser({ id: "user-scan", email: "scanner@example.test", full_name: "Scanner" }, async () => {
    const form = new FormData();
    form.append("scan_kind", "organization");
    form.append("notes", "Organization: Baltimore Robotics Club\nWebsite: baltimorerobotics.example\nEmail: hello@baltimorerobotics.example");
    form.append("image", new File([new Uint8Array([1, 2, 3, 4])], "card.png", { type: "image/png" }));

    const res = await app.request(
      "https://org.example.test/api/network/scans",
      {
        method: "POST",
        headers: { authorization: "Bearer scan-token" },
        body: form,
      },
      env(db),
    );

    assert.equal(res.status, 201);
    const payload = (await res.json()) as {
      id: string;
      created_target_type: string;
      created_targets: Array<{ type: string; slug: string; name: string }>;
      clarification_required: boolean;
    };
    assert.equal(payload.created_target_type, "organization");
    assert.equal(payload.created_targets[0].type, "organization");
    assert.equal(payload.created_targets[0].slug, "baltimore-robotics-club");
    assert.equal(payload.clarification_required, false);
    assert.equal(db.scans.length, 1);
    assert.equal(db.organizations.length, 1);

    const history = await app.request(
      "https://org.example.test/api/network/scans?scope=mine",
      { headers: { authorization: "Bearer scan-token" } },
      env(db),
    );
    assert.equal(history.status, 200);
    const rows = (await history.json()) as Array<{ id: string; created_target_slug: string }>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].created_target_slug, "baltimore-robotics-club");
  });
});

test("business card settings can be read and updated by admins", async () => {
  const db = new FakeD1();
  await withPidpUser({ id: "admin-scan", email: "admin@example.test", is_sysadmin: true }, async () => {
    const update = await app.request(
      "https://org.example.test/api/admin/business-card/settings",
      {
        method: "PATCH",
        headers: { authorization: "Bearer admin-token", "content-type": "application/json" },
        body: JSON.stringify({ max_bytes: 2048, allowed_content_types: ["image/png"], per_user_limit_per_hour: 3 }),
      },
      env(db),
    );
    assert.equal(update.status, 200);
    const settings = (await update.json()) as { max_bytes: number; allowed_content_types: string[]; per_user_limit_per_hour: number };
    assert.equal(settings.max_bytes, 2048);
    assert.deepEqual(settings.allowed_content_types, ["image/png"]);
    assert.equal(settings.per_user_limit_per_hour, 3);
  });
});

test("governance routes return D1 motions and engagement counts", async () => {
  const db = new FakeD1();
  db.motions.push({
    id: "mot-test",
    type: "main",
    parent_motion_id: null,
    title: "Test Motion",
    body: "Move to test the Worker governance API.",
    proposed_body_diff: null,
    status: "discussion",
    proposer_type: "user",
    proposer_id: "user-1",
    proposer_name: "Test User",
    proposer_user_name: null,
    proposer_org_id: null,
    proposer_org_name: null,
    seconder_id: null,
    seconder_name: null,
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
    discussion_deadline: null,
    voting_deadline: null,
    quorum_required: 5,
    result: null,
  });
  db.engagementVotes.push(
    { motion_id: "mot-test", user_id: "user-1", direction: "up" },
    { motion_id: "mot-test", user_id: "user-2", direction: "down" },
    { motion_id: "mot-test", user_id: "user-3", direction: "up" },
  );

  const list = await app.request("https://org.example.test/api/governance/motions", {}, env(db));
  assert.equal(list.status, 200);
  const motions = (await list.json()) as Array<{ id: string; title: string; score: number }>;
  assert.equal(motions.length, 1);
  assert.equal(motions[0].id, "mot-test");
  assert.equal(motions[0].score, 1);

  const counts = await app.request("https://org.example.test/api/governance/motions/mot-test/vote-counts", {}, env(db));
  assert.equal(counts.status, 200);
  assert.deepEqual(await counts.json(), { up: 2, down: 1, score: 1 });
});

test("UBI tick accrues dena and pays whole cents only when cadence is due", async () => {
  const db = new FakeD1();
  db.tickState = { id: "singleton", last_tick_at: "2026-06-07T00:00:00.000Z", updated_at: "2026-06-07T00:00:00.000Z" };
  db.ubiSettings.interval_seconds = 14 * 24 * 60 * 60;
  db.ledgerAccounts.push(
    {
      id: "acct-1",
      user_id: "user-1",
      name: "Eligible User",
      email: "eligible@example.test",
      entity_type: "individual",
      balance: 10,
      dena_balance: 0.009,
      created_at: "2026-06-07T00:00:00.000Z",
      updated_at: "2026-06-07T00:00:00.000Z",
    },
    {
      id: "acct-2",
      user_id: "user-2",
      name: "Org",
      email: "org@example.test",
      entity_type: "nonprofit",
      balance: 20,
      dena_balance: 0,
      created_at: "2026-06-07T00:00:00.000Z",
      updated_at: "2026-06-07T00:00:00.000Z",
    },
  );
  db.ubiEligibility.push({ account_id: "acct-1", is_eligible: 1, next_payment_date: "2026-06-07", last_payment_amount: 0, total_payments_received: 0 });

  const summary = await runUbiTick(db as unknown as D1Database, Date.parse("2026-06-07T00:01:00.000Z"));

  assert.equal(summary.status, "completed");
  assert.equal(summary.eligible_accounts, 1);
  assert.equal(summary.payout_count, 1);
  assert.equal(summary.paid_amount, 0.01);
  assert.equal(db.ledgerAccounts[0].balance, 10.01);
  assert.equal(Math.round(Number(db.ledgerAccounts[0].dena_balance) * 1000000) / 1000000, 0.009);
  assert.equal(db.ledgerAccounts[1].balance, 20);
  assert.equal(db.ledgerTransactions.length, 1);
  assert.equal(db.ledgerTransactions[0].transaction_type, "UBI_PAYMENT");
  assert.equal(db.ubiEligibility[0].next_payment_date, "2026-06-21");

  const duplicate = await runUbiTick(db as unknown as D1Database, Date.parse("2026-06-07T00:01:00.000Z"));
  assert.equal(duplicate.status, "skipped");
  assert.equal(db.ledgerTransactions.length, 1);
});

test("UBI tick accrues but does not pay before the two-week cadence is due", async () => {
  const db = new FakeD1();
  db.tickState = { id: "singleton", last_tick_at: "2026-06-07T00:00:00.000Z", updated_at: "2026-06-07T00:00:00.000Z" };
  db.ledgerAccounts.push({
    id: "acct-1",
    user_id: "user-1",
    name: "Eligible User",
    email: "eligible@example.test",
    entity_type: "individual",
    balance: 10,
    dena_balance: 1,
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z",
  });
  db.ubiEligibility.push({ account_id: "acct-1", is_eligible: 1, next_payment_date: "2026-06-21", last_payment_amount: 0, total_payments_received: 0 });

  const summary = await runUbiTick(db as unknown as D1Database, Date.parse("2026-06-07T00:01:00.000Z"));

  assert.equal(summary.status, "completed");
  assert.equal(summary.eligible_accounts, 1);
  assert.equal(summary.payout_count, 0);
  assert.equal(db.ledgerAccounts[0].balance, 10);
  assert.equal(db.ledgerTransactions.length, 0);
  assert.ok(Number(db.ledgerAccounts[0].dena_balance) > 1);
});

test("UBI tick enrolls known people before accrual", async () => {
  const db = new FakeD1();
  db.tickState = { id: "singleton", last_tick_at: "2026-06-07T00:00:00.000Z", updated_at: "2026-06-07T00:00:00.000Z" };
  db.contacts.push({
    id: "contact-1",
    user_id: "user-known",
    user_email: "known@example.test",
    user_name: "Known Person",
    slug: "known-person",
    enabled: 1,
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z",
  });

  const summary = await runUbiTick(db as unknown as D1Database, Date.parse("2026-06-07T00:01:00.000Z"));

  assert.equal(summary.eligible_accounts, 1);
  assert.equal(db.ledgerAccounts.length, 1);
  assert.equal(db.ledgerAccounts[0].entity_type, "individual");
  assert.equal(db.ubiEligibility.length, 1);
  assert.equal(db.ubiEligibility[0].account_id, db.ledgerAccounts[0].id);
});

test("users can save, change, and clear organization feedback", async () => {
  const db = new FakeD1();
  db.organizations.push({
    id: "org-1",
    name: "Test Org",
    slug: "test-org",
    description: null,
    source_url: null,
    image_url: null,
    tags: "[]",
    city: null,
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z",
  });

  await withPidpUser({ id: "user-1", email: "user@example.test", full_name: "Test User" }, async () => {
    const positive = await app.request(
      "https://org.example.test/api/network/orgs/org-1/feedback",
      {
        method: "PUT",
        headers: { authorization: "Bearer user-token", "content-type": "application/json" },
        body: JSON.stringify({ rating: "positive", comment: "Useful events and helpful organizers." }),
      },
      env(db),
    );
    assert.equal(positive.status, 200);
    const positiveBody = await positive.json() as Record<string, unknown>;
    assert.deepEqual({
      ...positiveBody,
      my_feedback: { ...(positiveBody.my_feedback as Record<string, unknown>), updated_at: "present" },
    }, {
      organization_id: "org-1",
      my_feedback: {
        rating: "positive",
        comment: "Useful events and helpful organizers.",
        updated_at: "present",
      },
      feedback_count: 1,
      feedback_positive_count: 1,
      feedback_concern_count: 0,
      feedback_score: 1,
    });

    const concern = await app.request(
      "https://org.example.test/api/network/orgs/test-org/feedback",
      {
        method: "PUT",
        headers: { authorization: "Bearer user-token", "content-type": "application/json" },
        body: JSON.stringify({ rating: "concern", comment: "Needs clearer meeting details." }),
      },
      env(db),
    );
    assert.equal(concern.status, 200);
    const concernBody = await concern.json() as Record<string, unknown>;
    assert.deepEqual({
      ...concernBody,
      my_feedback: { ...(concernBody.my_feedback as Record<string, unknown>), updated_at: "present" },
    }, {
      organization_id: "org-1",
      my_feedback: {
        rating: "concern",
        comment: "Needs clearer meeting details.",
        updated_at: "present",
      },
      feedback_count: 1,
      feedback_positive_count: 0,
      feedback_concern_count: 1,
      feedback_score: -1,
    });

    const cleared = await app.request(
      "https://org.example.test/api/network/orgs/org-1/feedback",
      { method: "DELETE", headers: { authorization: "Bearer user-token" } },
      env(db),
    );
    assert.equal(cleared.status, 200);
    assert.deepEqual(await cleared.json(), {
      organization_id: "org-1",
      my_feedback: null,
      feedback_count: 0,
      feedback_positive_count: 0,
      feedback_concern_count: 0,
      feedback_score: 0,
    });
  });
});

test("organization admins can review feedback history", async () => {
  const db = new FakeD1();
  db.organizations.push({
    id: "org-1",
    name: "Test Org",
    slug: "test-org",
    description: null,
    source_url: null,
    image_url: null,
    tags: "[]",
    city: null,
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z",
  });
  db.organizationMemberships.push({
    organization_id: "org-1",
    user_id: "admin-1",
    user_name: "Admin User",
    user_email: "admin@example.test",
    role: "administrator",
    status: "active",
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z",
  });
  db.organizationFeedback.push({
    organization_id: "org-1",
    user_id: "user-1",
    user_name: "Test User",
    rating: "concern",
    comment: "Needs clearer meeting details.",
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-08T00:00:00.000Z",
  });

  await withPidpUser({ id: "admin-1", email: "admin@example.test", full_name: "Admin User" }, async () => {
    const response = await app.request(
      "https://org.example.test/api/network/orgs/test-org/feedback/review",
      { headers: { authorization: "Bearer admin-token" } },
      env(db),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [
      {
        organization_id: "org-1",
        user_id: "user-1",
        user_name: "Test User",
        rating: "concern",
        comment: "Needs clearer meeting details.",
        created_at: "2026-06-07T00:00:00.000Z",
        updated_at: "2026-06-08T00:00:00.000Z",
      },
    ]);
  });

  await withPidpUser({ id: "user-2", email: "user2@example.test", full_name: "Regular User" }, async () => {
    const response = await app.request(
      "https://org.example.test/api/network/orgs/test-org/feedback/review",
      { headers: { authorization: "Bearer user-token" } },
      env(db),
    );
    assert.equal(response.status, 403);
  });
});

test("users can join and leave organization groups", async () => {
  const db = new FakeD1();
  db.organizations.push({
    id: "org-1",
    name: "Test Org",
    slug: "test-org",
    description: null,
    source_url: null,
    image_url: null,
    tags: "[]",
    city: null,
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z",
  });

  await withPidpUser({ id: "user-1", email: "user@example.test", full_name: "Test User" }, async () => {
    const joined = await app.request(
      "https://org.example.test/api/network/orgs/test-org/membership",
      { method: "POST", headers: { authorization: "Bearer user-token" } },
      env(db),
    );
    assert.equal(joined.status, 200);
    assert.deepEqual(await joined.json(), {
      organization_id: "org-1",
      role: "member",
      status: "active",
      membership_count: 1,
    });

    const left = await app.request(
      "https://org.example.test/api/network/orgs/org-1/membership",
      { method: "DELETE", headers: { authorization: "Bearer user-token" } },
      env(db),
    );
    assert.equal(left.status, 200);
    assert.deepEqual(await left.json(), {
      organization_id: "org-1",
      role: null,
      status: "none",
      membership_count: 0,
    });
  });
});

test("organization admins can publish a slug portal for their organization", async () => {
  const db = new FakeD1();
  db.organizations.push({
    id: "org-1",
    name: "Test Org",
    slug: "test-org",
    description: "A test organization.",
    source_url: null,
    image_url: "https://cdn.example.test/org.jpg",
    tags: "[]",
    city: null,
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z",
  });
  db.organizationMemberships.push({
    organization_id: "org-1",
    user_id: "admin-1",
    role: "administrator",
    status: "active",
  });

  await withPidpUser({ id: "admin-1", email: "admin@example.test", full_name: "Admin User" }, async () => {
    const saved = await app.request(
      "https://org.example.test/api/network/orgs/test-org/portal",
      {
        method: "PUT",
        headers: { authorization: "Bearer admin-token", "content-type": "application/json" },
        body: JSON.stringify({
          slug: "test-org",
          name: "Test Org Portal",
          tagline: "Everything for Test Org members.",
          home_kind: "org-events",
          home_heading: "Test Org",
          home_description: "Join Test Org events and conversations.",
        }),
      },
      env(db),
    );
    assert.equal(saved.status, 200);
    const savedPayload = await saved.json() as { portal: Row };
    assert.equal(savedPayload.portal.organization_id, "org-1");
    assert.equal(savedPayload.portal.slug, "test-org");
    assert.equal(savedPayload.portal.home_org_slug, "test-org");
    assert.equal(savedPayload.portal.home_kind, "org-events");
    assert.equal(savedPayload.portal.slug_url, "https://codecollective.test/p/portals/test-org");

    const loaded = await app.request(
      "https://org.example.test/api/network/orgs/org-1/portal",
      { headers: { authorization: "Bearer admin-token" } },
      env(db),
    );
    assert.equal(loaded.status, 200);
    assert.equal(((await loaded.json()) as { portal: Row }).portal.slug, "test-org");

    const publicTenant = await app.request("https://org.example.test/api/portal/tenants/test-org", {}, env(db));
    assert.equal(publicTenant.status, 200);
    const publicPayload = await publicTenant.json() as Row;
    assert.equal(publicPayload.name, "Test Org Portal");
    assert.deepEqual(publicPayload.features, ["directory", "events", "chat"]);
  });
});

test("non-admins cannot publish organization slug portals", async () => {
  const db = new FakeD1();
  db.organizations.push({
    id: "org-1",
    name: "Test Org",
    slug: "test-org",
    description: null,
    source_url: null,
    image_url: null,
    tags: "[]",
    city: null,
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z",
  });

  await withPidpUser({ id: "user-1", email: "user@example.test", full_name: "Regular User" }, async () => {
    const response = await app.request(
      "https://org.example.test/api/network/orgs/test-org/portal",
      {
        method: "PUT",
        headers: { authorization: "Bearer user-token", "content-type": "application/json" },
        body: JSON.stringify({ slug: "test-org" }),
      },
      env(db),
    );
    assert.equal(response.status, 403);
    assert.equal(db.portalTenants.length, 0);
  });
});

test("organization admins can request and attach a custom portal domain", async () => {
  const db = new FakeD1();
  db.organizations.push({
    id: "org-1",
    name: "Test Org",
    slug: "test-org",
    description: null,
    source_url: null,
    image_url: null,
    tags: "[]",
    city: null,
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z",
  });
  db.organizationMemberships.push({
    organization_id: "org-1",
    user_id: "admin-1",
    role: "owner",
    status: "active",
  });

  await withPidpUser({ id: "admin-1", email: "admin@example.test", full_name: "Admin User" }, async () => {
    await app.request(
      "https://org.example.test/api/network/orgs/test-org/portal",
      {
        method: "PUT",
        headers: { authorization: "Bearer admin-token", "content-type": "application/json" },
        body: JSON.stringify({ slug: "test-org" }),
      },
      env(db),
    );

    const requested = await app.request(
      "https://org.example.test/api/network/orgs/test-org/portal/custom-domain/request",
      {
        method: "POST",
        headers: { authorization: "Bearer admin-token", "content-type": "application/json" },
        body: JSON.stringify({ hostname: "portal.test-org.example", notes: "DNS owner confirmed" }),
      },
      env(db),
    );
    assert.equal(requested.status, 200);
    const requestedPayload = await requested.json() as { portal: Row; checklist: string[] };
    assert.equal(requestedPayload.portal.custom_domain_hostname, "portal.test-org.example");
    assert.equal(requestedPayload.portal.custom_domain_status, "requested");
    assert.equal(requestedPayload.portal.hostname, "test-org.slug.portal.local");
    assert.ok(requestedPayload.checklist.some((item) => item.includes("Cloudflare custom domain")));

    const attached = await app.request(
      "https://org.example.test/api/network/orgs/test-org/portal/custom-domain/attach",
      {
        method: "POST",
        headers: { authorization: "Bearer admin-token", "content-type": "application/json" },
        body: JSON.stringify({ hostname: "portal.test-org.example" }),
      },
      env(db),
    );
    assert.equal(attached.status, 200);
    const attachedPayload = await attached.json() as { portal: Row };
    assert.equal(attachedPayload.portal.custom_domain_status, "attached");
    assert.equal(attachedPayload.portal.hostname, "portal.test-org.example");
    assert.equal(attachedPayload.portal.public_base_url, "https://portal.test-org.example");
    assert.equal(attachedPayload.portal.canonical_path_prefix, "");
  });
});
