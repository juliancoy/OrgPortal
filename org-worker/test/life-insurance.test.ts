import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import test from "node:test";
import {
  LifeInsuranceError,
  calculateAgeOnDate,
  payoutForAge,
  reportMemberDeath,
  saveInsuranceEnrollment,
  validateEnrollmentInput,
} from "../src/lifeInsurance";

class SqliteD1Statement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly statement: StatementSync,
    private readonly parameters: unknown[] = [],
  ) {}

  bind(...parameters: unknown[]) {
    return new SqliteD1Statement(this.database, this.statement, parameters);
  }

  async first<T>() {
    return (this.statement.get(...this.parameters) as T | undefined) || null;
  }

  async all<T>() {
    return { results: this.statement.all(...this.parameters) as T[] };
  }

  async run() {
    const result = this.statement.run(...this.parameters);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class SqliteD1 {
  readonly database = new DatabaseSync(":memory:");

  constructor() {
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec(`
      CREATE TABLE ledger_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL DEFAULT 'individual',
        balance REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE ledger_transactions (
        id TEXT PRIMARY KEY,
        from_account_id TEXT REFERENCES ledger_accounts(id),
        to_account_id TEXT REFERENCES ledger_accounts(id),
        amount REAL NOT NULL,
        currency TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        description TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );
      CREATE TABLE user_contact_pages (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        photo_url TEXT,
        updated_at TEXT NOT NULL
      );
    `);
    this.seedAccount("acct-civic-fund", null, "Civic Fund", 50_000, "nonprofit");
    this.seedAccount("acct-deceased", "member-deceased", "Deceased Member", 10);
    this.seedAccount("acct-kin", "member-kin", "Next of Kin", 25);
    this.seedAccount("acct-beneficiary", "member-beneficiary", "Named Beneficiary", 30);
    this.seedAccount("acct-reporter-1", "reporter-1", "Reporter One", 5);
    this.seedAccount("acct-reporter-2", "reporter-2", "Reporter Two", 5);
    this.seedAccount("acct-reporter-3", "reporter-3", "Reporter Three", 5);
    this.database.prepare("INSERT INTO user_contact_pages (id, user_id, photo_url, updated_at) VALUES (?, ?, ?, ?)")
      .run("profile-kin", "member-kin", "https://images.example.test/kin.jpg", "2026-08-07T00:00:00.000Z");
    this.database.exec(readFileSync(new URL("../migrations/0011_life_insurance.sql", import.meta.url), "utf8"));
  }

  seedAccount(id: string, userId: string | null, name: string, balance: number, entityType = "individual") {
    this.database.prepare(
      "INSERT INTO ledger_accounts (id, user_id, name, email, entity_type, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, userId, name, `${id}@example.test`, entityType, balance, "2026-08-07T00:00:00.000Z", "2026-08-07T00:00:00.000Z");
  }

  prepare(sql: string) {
    return new SqliteD1Statement(this.database, this.database.prepare(sql));
  }

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

function asD1(database: SqliteD1) {
  return database as unknown as D1Database;
}

const enrollment = {
  birth_date: "1990-04-15",
  age: 36,
  next_of_kin_user_id: "member-kin",
  next_of_kin_relationship: "Sibling",
  beneficiary_user_id: "member-beneficiary",
  beneficiary_relationship: "Partner",
  accepted_terms: true,
};

test("birthday is authoritative and required age must match it", () => {
  assert.equal(calculateAgeOnDate("1990-08-08", "2026-08-07"), 35);
  assert.equal(calculateAgeOnDate("1990-08-07", "2026-08-07"), 36);
  assert.throws(
    () => validateEnrollmentInput({ ...enrollment, age: 35 }, "2026-08-07"),
    (error: unknown) => error instanceof LifeInsuranceError && error.message === "Age must match the birthday (36).",
  );
});

test("three unique member attestations pay the frozen Dena benefit to the named beneficiary once", async () => {
  const sqlite = new SqliteD1();
  const db = asD1(sqlite);
  const dashboard = await saveInsuranceEnrollment(db, "member-deceased", enrollment, "2026-08-07T12:00:00.000Z");
  assert.equal(dashboard.enrollment?.next_of_kin_photo_url, "https://images.example.test/kin.jpg");
  assert.equal(dashboard.members.find((member) => member.user_id === "member-kin")?.photo_url, "https://images.example.test/kin.jpg");
  const report = {
    deceased_user_id: "member-deceased",
    date_of_death: "2026-08-06",
    relationship_to_deceased: "Community member",
    attested: true,
  };

  const first = await reportMemberDeath(db, "reporter-1", "Reporter One", report, "2026-08-07T13:00:00.000Z");
  const second = await reportMemberDeath(db, "reporter-2", "Reporter Two", report, "2026-08-07T13:01:00.000Z");
  const third = await reportMemberDeath(db, "reporter-3", "Reporter Three", report, "2026-08-07T13:02:00.000Z");

  assert.equal(first?.status, "pending");
  assert.equal(first?.report_count, 1);
  assert.equal(second?.report_count, 2);
  assert.equal(third?.status, "paid");
  assert.equal(third?.report_count, 3);
  assert.equal(third?.beneficiary_source, "beneficiary");
  assert.equal(third?.recipient_user_id, "member-beneficiary");

  const expectedPayout = payoutForAge(36, 1000);
  const beneficiary = sqlite.database.prepare("SELECT balance FROM ledger_accounts WHERE id = 'acct-beneficiary'").get() as { balance: number };
  const fund = sqlite.database.prepare("SELECT balance FROM ledger_accounts WHERE id = 'acct-civic-fund'").get() as { balance: number };
  const transactions = sqlite.database.prepare("SELECT * FROM ledger_transactions WHERE transaction_type = 'LIFE_INSURANCE_PAYOUT'").all();
  const savedEnrollment = sqlite.database.prepare("SELECT status FROM life_insurance_enrollments WHERE user_id = 'member-deceased'").get() as { status: string };
  assert.equal(beneficiary.balance, 30 + expectedPayout);
  assert.equal(fund.balance, 50_000 - expectedPayout);
  assert.equal(transactions.length, 1);
  assert.equal(savedEnrollment.status, "deceased");

  await assert.rejects(
    reportMemberDeath(db, "reporter-3", "Reporter Three", report, "2026-08-07T13:03:00.000Z"),
    (error: unknown) => error instanceof LifeInsuranceError && error.status === 409,
  );
  assert.equal(sqlite.database.prepare("SELECT COUNT(*) AS count FROM ledger_transactions").get()!.count, 1);
});

test("next of kin is frozen as recipient when no beneficiary is listed", async () => {
  const sqlite = new SqliteD1();
  const db = asD1(sqlite);
  await saveInsuranceEnrollment(
    db,
    "member-deceased",
    { ...enrollment, beneficiary_user_id: null, beneficiary_relationship: null },
    "2026-08-07T12:00:00.000Z",
  );
  const claim = await reportMemberDeath(db, "reporter-1", "Reporter One", {
    deceased_user_id: "member-deceased",
    date_of_death: "2026-08-06",
    relationship_to_deceased: "Friend",
    attested: true,
  }, "2026-08-07T13:00:00.000Z");

  assert.equal(claim?.beneficiary_source, "next_of_kin");
  assert.equal(claim?.recipient_user_id, "member-kin");
});

test("the threshold cannot credit a recipient when the Civic Fund lacks Dena", async () => {
  const sqlite = new SqliteD1();
  const db = asD1(sqlite);
  sqlite.database.prepare("UPDATE ledger_accounts SET balance = 0 WHERE id = 'acct-civic-fund'").run();
  await saveInsuranceEnrollment(db, "member-deceased", enrollment, "2026-08-07T12:00:00.000Z");
  const report = {
    deceased_user_id: "member-deceased",
    date_of_death: "2026-08-06",
    relationship_to_deceased: "Community member",
    attested: true,
  };

  await reportMemberDeath(db, "reporter-1", "Reporter One", report, "2026-08-07T13:00:00.000Z");
  await reportMemberDeath(db, "reporter-2", "Reporter Two", report, "2026-08-07T13:01:00.000Z");
  const claim = await reportMemberDeath(db, "reporter-3", "Reporter Three", report, "2026-08-07T13:02:00.000Z");

  assert.equal(claim?.status, "approved_pending_funds");
  assert.equal(sqlite.database.prepare("SELECT balance FROM ledger_accounts WHERE id = 'acct-beneficiary'").get()!.balance, 30);
  assert.equal(sqlite.database.prepare("SELECT COUNT(*) AS count FROM ledger_transactions").get()!.count, 0);
});
