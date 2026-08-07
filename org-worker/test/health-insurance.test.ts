import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import test from "node:test";
import {
  HEALTH_INSURANCE_CODE_REFERENCE_VERSION,
  HealthInsuranceError,
  healthInsuranceDashboard,
  cancelHealthInsuranceAppointment,
  saveHealthInsuranceEnrollment,
  scheduleHealthInsuranceAppointment,
  submitHealthInsuranceClaim,
  validNpi,
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
    this.database.exec(readFileSync(new URL("../migrations/0012_health_insurance.sql", import.meta.url), "utf8"));
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
  state_code: "MD",
  program: "standard",
  coverage_effective_date: "2026-01-01",
  attested: true,
};

const claim = {
  service_id: "primary-care",
  service_date: "2026-08-01",
  provider_npi: "1234567893",
  place_of_service: "11",
  diagnosis_codes: ["E11.9"],
  lines: [
    { code_system: "HCPCS_LEVEL_II", code: "A4253", modifiers: ["NU"], units: 2, billed_amount_usd: 18.125 },
    { code_system: "CPT", code: "99213", modifiers: [], units: 1, billed_amount_usd: 95 },
  ],
  attested: true,
};

test("NPI and health-insurance code-family validation rejects malformed intake", () => {
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
});

test("an enrolled member can submit an immutable code snapshot for an available service", async () => {
  const sqlite = new SqliteD1();
  const db = asD1(sqlite);
  await saveHealthInsuranceEnrollment(db, "member-1", enrollment, "2026-08-07T12:00:00.000Z");
  const saved = await submitHealthInsuranceClaim(db, "member-1", claim, "2026-08-07T13:00:00.000Z");

  assert.equal(saved?.status, "received");
  assert.equal(saved?.coverage_determination, "available");
  assert.equal(saved?.total_billed_usd, 113.13);
  assert.equal(saved?.code_reference_version, HEALTH_INSURANCE_CODE_REFERENCE_VERSION);
  assert.deepEqual(saved?.diagnosis_codes, ["E11.9"]);
  assert.equal(saved?.lines.length, 2);
  assert.deepEqual(saved?.lines[0].modifiers, ["NU"]);

  const dashboard = await healthInsuranceDashboard(db, "member-1");
  assert.equal(dashboard.enrollment?.state_code, "MD");
  assert.equal(dashboard.claims.length, 1);
  assert.equal(dashboard.service_access, "Coverage follows published service availability for every authenticated member.");
});

test("claim intake requires active enrollment and covered service dates", async () => {
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

test("published calendar services are available to every member and appointments can be cancelled", async () => {
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
