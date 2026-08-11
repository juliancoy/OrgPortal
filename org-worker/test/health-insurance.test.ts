import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import test from "node:test";
import {
  HEALTH_INSURANCE_CODE_REFERENCE_VERSION,
  HealthInsuranceError,
  cancelHealthInsuranceAppointment,
  healthInsuranceDiagnosisBoard,
  healthInsuranceDashboard,
  healthInsuranceProviderDashboard,
  publishHealthInsuranceService,
  requestHealthInsuranceAnalysis,
  saveHealthInsuranceEnrollment,
  scheduleHealthInsuranceAppointment,
  submitHealthInsuranceDiagnosis,
  submitHealthInsuranceClaim,
  validNpi,
  validateHealthInsuranceServicePublish,
  validateHealthInsuranceClaim,
} from "../src/healthInsurance";

class SqliteD1Statement {
  constructor(private readonly statement: StatementSync, private readonly parameters: unknown[] = []) {}
  bind(...parameters: unknown[]) { return new SqliteD1Statement(this.statement, parameters); }
  async first<T>() { return (this.statement.get(...this.parameters) as T | undefined) || null; }
  async all<T>() { return { results: this.statement.all(...this.parameters) as T[] }; }
  async run() {
    const result = this.statement.run(...this.parameters);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class SqliteD1 {
  readonly database = new DatabaseSync(":memory:");
  constructor() {
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec(readFileSync(new URL("../migrations/0002_org_event_directories.sql", import.meta.url), "utf8"));
    this.database.exec(readFileSync(new URL("../migrations/0012_health_insurance.sql", import.meta.url), "utf8"));
    this.database.exec(readFileSync(new URL("../migrations/0013_health_profile.sql", import.meta.url), "utf8"));
    this.database.exec(readFileSync(new URL("../migrations/0014_health_diagnosis_support.sql", import.meta.url), "utf8"));
    this.database.exec(readFileSync(new URL("../migrations/0016_health_service_hosts_and_user_event_calendars.sql", import.meta.url), "utf8"));
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS ledger_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        entity_type TEXT NOT NULL DEFAULT 'individual',
        balance REAL NOT NULL DEFAULT 0,
        dena_balance REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.database.exec(`
      INSERT INTO ledger_accounts (id, user_id, name, email, entity_type, balance, dena_balance, created_at, updated_at) VALUES
      ('acct-1', 'member-1', 'Member One', 'member-1@example.test', 'individual', 0, 0, '2026-08-07T00:00:00.000Z', '2026-08-07T00:00:00.000Z'),
      ('acct-2', 'member-2', 'Member Two', 'member-2@example.test', 'individual', 0, 0, '2026-08-07T00:00:00.000Z', '2026-08-07T00:00:00.000Z'),
      ('acct-3', 'member-without-enrollment', 'Member Without Enrollment', 'member-without-enrollment@example.test', 'individual', 0, 0, '2026-08-07T00:00:00.000Z', '2026-08-07T00:00:00.000Z');
    `);
  }
  prepare(sql: string) { return new SqliteD1Statement(this.database.prepare(sql)); }
  async batch(statements: SqliteD1Statement[]) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function asD1(database: SqliteD1) { return database as unknown as D1Database; }

const enrollment = {
  program: "standard",
  coverage_effective_date: "2026-01-01",
  suspected_diagnosis_codes: ["E11.9", "I10"],
  issue_summary: "Recurring dizziness, elevated blood sugar, and headaches after exertion.",
  attested: true,
} as const;

const claim = {
  service_id: "primary-care",
  service_date: "2026-08-01",
  provider_npi: "1234567893",
  place_of_service: "11",
  diagnosis_codes: ["E11.9"],
  suspected_diagnosis_codes: ["E11.9", "I10"],
  issue_summary: "Recurring dizziness, elevated blood sugar, and headaches after exertion.",
  lines: [
    { code_system: "HCPCS_LEVEL_II", code: "A4253", modifiers: ["NU"], units: 2, billed_amount_usd: 18.125 },
    { code_system: "CPT", code: "99213", modifiers: [], units: 1, billed_amount_usd: 95 },
  ],
  attested: true,
} as const;

test("NPI and code validation rejects malformed intake and unknown suspected diagnoses", () => {
  assert.equal(validNpi("1234567893"), true);
  assert.equal(validNpi("1234567890"), false);
  assert.throws(
    () => validateHealthInsuranceClaim({ ...claim, provider_npi: "1234567890" }, enrollment, "2026-08-07"),
    (error: unknown) => error instanceof HealthInsuranceError && error.message.includes("valid 10-digit NPI"),
  );
  assert.throws(
    () => validateHealthInsuranceClaim({ ...claim, lines: [{ ...claim.lines[0], code: "A12" }] }, enrollment, "2026-08-07"),
    (error: unknown) => error instanceof HealthInsuranceError && error.message.includes("HCPCS_LEVEL_II format"),
  );
  assert.throws(
    () => validateHealthInsuranceClaim({ ...claim, suspected_diagnosis_codes: ["A00.0"] }, enrollment, "2026-08-07"),
    (error: unknown) => error instanceof HealthInsuranceError && error.message.includes("diagnosis catalog"),
  );
});

test("member profile, claims, analyses, and full history are returned together", async () => {
  const sqlite = new SqliteD1();
  const db = asD1(sqlite);
  await saveHealthInsuranceEnrollment(db, "member-1", enrollment, "2026-08-07T12:00:00.000Z");
  const collaborative = await submitHealthInsuranceDiagnosis(db, "member-1", "Member One", { code: "E11.9", note: "Patient self-submitted this diagnosis." }, "2026-08-07T12:30:00.000Z");
  await submitHealthInsuranceDiagnosis(db, "member-2", "Member Two", { patient_user_id: "member-1", code: "E11.9" }, "2026-08-07T12:45:00.000Z");
  const saved = await submitHealthInsuranceClaim(db, "member-1", claim, "2026-08-07T13:00:00.000Z");
  const analysis = await requestHealthInsuranceAnalysis(db, "member-1", { analysis_kind: "record-summary" }, "2026-08-07T14:00:00.000Z");
  const board = await healthInsuranceDiagnosisBoard(db, "member-2", "member-1");

  assert.equal(collaborative?.self_reported, true);
  assert.equal(collaborative?.supporter_count, 1);
  assert.equal(saved?.status, "received");
  assert.equal(saved?.coverage_determination, "available");
  assert.equal(saved?.total_billed_usd, 113.13);
  assert.equal(saved?.code_reference_version, HEALTH_INSURANCE_CODE_REFERENCE_VERSION);
  assert.deepEqual(saved?.diagnosis_codes, ["E11.9"]);
  assert.deepEqual(saved?.suspected_diagnosis_codes, ["E11.9", "I10"]);
  assert.equal(saved?.issue_summary, enrollment.issue_summary);
  assert.equal(saved?.line_details[0].label, "Blood glucose test or reagent strips");
  assert.equal(analysis.status, "ready");
  assert.equal(board.patient.name.length > 0, true);
  assert.equal(board.diagnoses[0].viewer_supports, true);

  const dashboard = await healthInsuranceDashboard(db, "member-1");
  assert.equal(dashboard.enrollment?.state_code, undefined);
  assert.equal(dashboard.enrollment?.program, "standard");
  assert.deepEqual(dashboard.enrollment?.suspected_diagnosis_codes, ["E11.9", "I10"]);
  assert.equal(dashboard.enrollment?.issue_summary, enrollment.issue_summary);
  assert.equal(dashboard.claims.length, 1);
  assert.equal(dashboard.collaborative_diagnoses.length, 1);
  assert.equal(dashboard.collaborative_diagnoses[0].supporter_count, 2);
  assert.deepEqual(dashboard.collaborative_diagnoses[0].supporters.map((supporter) => supporter.supporter_name), ["Member One", "Member Two"]);
  assert.equal(dashboard.profile_updates.length, 1);
  assert.equal(dashboard.analyses.length, 1);
  assert.equal(dashboard.history.length, 4);
  assert.equal(dashboard.code_catalog.diagnoses.length > 5, true);
  assert.equal(dashboard.code_catalog.claim_codes.length > 5, true);
  assert.equal(dashboard.service_access, "Every member can use published services directly through this record.");
});

test("members can contribute diagnoses without later supporters overwriting the original note", async () => {
  const sqlite = new SqliteD1();
  const db = asD1(sqlite);
  const contributed = await submitHealthInsuranceDiagnosis(
    db,
    "member-2",
    "Member Two",
    { patient_user_id: "member-1", code: "I10", note: "Community-submitted context." },
    "2026-08-07T12:00:00.000Z",
  );
  assert.equal(contributed?.note, "Community-submitted context.");
  const supported = await submitHealthInsuranceDiagnosis(
    db,
    "member-without-enrollment",
    "Member Three",
    { patient_user_id: "member-1", code: "I10", note: "Replacement note." },
    "2026-08-07T12:05:00.000Z",
  );
  assert.equal(supported?.note, "Community-submitted context.");
  assert.equal(supported?.supporter_count, 2);
});

test("claim intake requires an active health profile and valid covered dates", async () => {
  const sqlite = new SqliteD1();
  const db = asD1(sqlite);
  await assert.rejects(
    submitHealthInsuranceClaim(db, "member-1", claim, "2026-08-07T13:00:00.000Z"),
    (error: unknown) => error instanceof HealthInsuranceError && error.status === 404,
  );
  await saveHealthInsuranceEnrollment(db, "member-1", enrollment, "2026-08-07T12:00:00.000Z");
  await assert.rejects(
    submitHealthInsuranceClaim(db, "member-1", { ...claim, service_date: "2025-12-31" }, "2026-08-07T13:00:00.000Z"),
    (error: unknown) => error instanceof HealthInsuranceError && error.message.includes("coverage effective date"),
  );
});

test("published calendar services remain available to every member and appointments can be cancelled", async () => {
  const sqlite = new SqliteD1();
  const db = asD1(sqlite);
  const appointment = await scheduleHealthInsuranceAppointment(db, "member-without-enrollment", {
    service_id: "primary-care",
    starts_at: "2026-08-10T13:00:00.000Z",
    attested: true,
  }, "2026-08-07T12:00:00.000Z");

  assert.equal(appointment?.status, "requested");
  assert.equal(appointment?.service_name, "Primary care appointment");
  const dashboard = await healthInsuranceDashboard(db, "member-without-enrollment");
  assert.equal(dashboard.services.length, 3);
  assert.equal(dashboard.services.every((service) => service.available_to_all), true);
  assert.equal(dashboard.appointments.length, 1);
  assert.equal(dashboard.history.length, 1);

  await cancelHealthInsuranceAppointment(db, "member-without-enrollment", String(appointment?.id), "2026-08-07T12:05:00.000Z");
  const saved = sqlite.database.prepare("SELECT status FROM health_insurance_appointments WHERE id = ?").get(appointment?.id) as { status: string };
  assert.equal(saved.status, "cancelled");
});

test("calendar rejects unpublished times", async () => {
  const sqlite = new SqliteD1();
  await assert.rejects(
    scheduleHealthInsuranceAppointment(asD1(sqlite), "member-1", {
      service_id: "primary-care", starts_at: "2026-08-09T13:00:00.000Z", attested: true,
    }, "2026-08-07T12:00:00.000Z"),
    (error: unknown) => error instanceof HealthInsuranceError && error.message.includes("published appointment slot"),
  );
});

test("individual recurring services can be published and booked in 30-minute weekday slots after 14:00 UTC", async () => {
  const sqlite = new SqliteD1();
  const db = asD1(sqlite);
  const published = await publishHealthInsuranceService(
    db,
    validateHealthInsuranceServicePublish(
      {
        name: "Half-hour consults",
        description: "Book a half-hour health consultation.",
        timezone: "UTC",
        slot_minutes: 30,
        capacity_per_slot: 1,
        weekdays: [1, 2, 3, 4, 5],
        starts_at: "14:00",
        ends_at: "18:00",
        google_calendar_sync: true,
        google_block_busy: true,
      },
      {
        host_type: "individual",
        host_user_id: "member-1",
        host_user_name: "Member One",
        host_org_id: null,
        host_org_name: null,
      },
    ),
    "2026-08-11T12:00:00.000Z",
  );

  assert.equal(published?.host_type, "individual");
  assert.equal(published?.host_user_id, "member-1");

  const dashboard = await healthInsuranceDashboard(db, "member-without-enrollment");
  const service = dashboard.services.find((entry) => entry.id === published?.id);
  assert.equal(service?.host_type, "individual");
  assert.equal(service?.host_user_name, "Member One");
  assert.equal(service?.google_calendar_sync, true);
  assert.equal(service?.google_block_busy, true);
  assert.deepEqual(service?.hours.map((entry) => entry.weekday), [1, 2, 3, 4, 5]);

  const appointment = await scheduleHealthInsuranceAppointment(
    db,
    "member-without-enrollment",
    {
      service_id: published?.id,
      starts_at: "2026-08-12T14:00:00.000Z",
      attested: true,
    },
    "2026-08-11T12:00:00.000Z",
  );
  assert.equal(appointment?.status, "requested");

  await assert.rejects(
    scheduleHealthInsuranceAppointment(
      db,
      "member-without-enrollment",
      {
        service_id: published?.id,
        starts_at: "2026-08-12T13:30:00.000Z",
        attested: true,
      },
      "2026-08-11T12:00:00.000Z",
    ),
    (error: unknown) => error instanceof HealthInsuranceError && error.message.includes("published appointment slot"),
  );
});

test("provider dashboard lists hosted calendars and booked appointments", async () => {
  const sqlite = new SqliteD1();
  const db = asD1(sqlite);
  const published = await publishHealthInsuranceService(
    db,
    validateHealthInsuranceServicePublish(
      {
        name: "Provider consults",
        description: "Hosted by Member One.",
        timezone: "UTC",
        slot_minutes: 30,
        capacity_per_slot: 1,
        weekdays: [1, 2, 3, 4, 5],
        starts_at: "14:00",
        ends_at: "18:00",
        google_calendar_sync: true,
        google_block_busy: false,
      },
      {
        host_type: "individual",
        host_user_id: "member-1",
        host_user_name: "Member One",
        host_org_id: null,
        host_org_name: null,
      },
    ),
    "2026-08-11T12:00:00.000Z",
  );

  await scheduleHealthInsuranceAppointment(
    db,
    "member-2",
    {
      service_id: published?.id,
      starts_at: "2026-08-12T14:00:00.000Z",
      attested: true,
    },
    "2026-08-11T12:00:00.000Z",
  );

  const provider = await healthInsuranceProviderDashboard(db, "member-1");
  assert.equal(provider.services.length, 1);
  assert.equal(provider.services[0]?.id, published?.id);
  assert.equal(provider.services[0]?.google_calendar_sync, true);
  assert.equal(provider.appointments.length, 1);
  assert.equal(provider.appointments[0]?.service_id, published?.id);
  assert.equal(provider.appointments[0]?.attendee_user_id, "member-2");
  assert.equal(provider.appointments[0]?.attendee_name, "Member Two");
  assert.equal(provider.appointments[0]?.attendee_email, "member-2@example.test");
});
