export const LIFE_INSURANCE_CURRENCY = "DEM";
export const LIFE_INSURANCE_FUNDING_ACCOUNT_ID = "acct-civic-fund";
export const LIFE_INSURANCE_ATTESTATION_THRESHOLD = 3;
export const LIFE_INSURANCE_STANDARD_BENEFIT = 1000;
export const MIN_INSURANCE_AGE = 18;
export const MAX_INSURANCE_AGE = 100;

const MINIMUM_BENEFIT_FACTOR = 0.5;
const GLOBAL_POPULATION_PERCENT_BY_AGE = [
  1.561, 1.55, 1.543, 1.539, 1.544, 1.554, 1.581, 1.611, 1.636, 1.66,
  1.661, 1.659, 1.662, 1.666, 1.657, 1.635, 1.624, 1.612, 1.59, 1.567,
  1.546, 1.529, 1.514, 1.5, 1.49, 1.487, 1.472, 1.452, 1.444, 1.44,
  1.438, 1.435, 1.431, 1.431, 1.439, 1.47, 1.484, 1.459, 1.445, 1.428,
  1.393, 1.358, 1.324, 1.31, 1.288, 1.25, 1.217, 1.177, 1.145, 1.13,
  1.121, 1.118, 1.119, 1.113, 1.104, 1.097, 1.078, 1.053, 1.011, 0.974,
  0.965, 0.952, 0.945, 0.905, 0.805, 0.741, 0.721, 0.71, 0.709, 0.684,
  0.651, 0.625, 0.586, 0.554, 0.517, 0.478, 0.442, 0.4, 0.364, 0.329,
  0.283, 0.247, 0.224, 0.203, 0.184, 0.165, 0.145, 0.125, 0.108, 0.091,
  0.075, 0.061, 0.048, 0.037, 0.029, 0.021, 0.016, 0.011, 0.007, 0.005,
  0.008,
] as const;

export class LifeInsuranceError extends Error {
  constructor(public readonly status: 400 | 404 | 409, message: string) {
    super(message);
  }
}

type InsuranceSettingsRow = {
  standard_benefit_dena: number;
  attestation_threshold: number;
  funding_account_id: string;
};

type MemberAccountRow = {
  user_id: string;
  account_id: string;
  name: string;
};

type EnrollmentRow = {
  user_id: string;
  birth_date: string;
  confirmed_age: number;
  next_of_kin_user_id: string;
  next_of_kin_relationship: string;
  beneficiary_user_id: string | null;
  beneficiary_relationship: string | null;
  status: string;
  accepted_at: string;
  created_at: string;
  updated_at: string;
};

type ClaimRow = {
  id: string;
  deceased_user_id: string;
  date_of_death: string;
  status: string;
  payout_amount: number;
  recipient_user_id: string;
  recipient_account_id: string;
  recipient_name: string;
  beneficiary_source: string;
  funding_account_id: string;
  report_count?: number;
  payout_transaction_id: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
};

export type EnrollmentInput = {
  birth_date: string;
  age: number;
  next_of_kin_user_id: string;
  next_of_kin_relationship: string;
  beneficiary_user_id: string | null;
  beneficiary_relationship: string | null;
  accepted_terms: boolean;
};

export type DeathReportInput = {
  deceased_user_id: string;
  date_of_death: string;
  relationship_to_deceased: string;
  attested: boolean;
};

function dateOnly(value: unknown, fieldName: string): string {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new LifeInsuranceError(400, `${fieldName} is required.`);
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new LifeInsuranceError(400, `${fieldName} must be a valid date.`);
  }
  return text;
}

function requiredText(value: unknown, fieldName: string, maxLength = 100): string {
  const text = String(value || "").trim();
  if (!text) throw new LifeInsuranceError(400, `${fieldName} is required.`);
  return text.slice(0, maxLength);
}

function optionalText(value: unknown, maxLength = 100): string | null {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : null;
}

export function calculateAgeOnDate(birthDate: string, asOfDate: string): number {
  const birth = new Date(`${birthDate}T00:00:00.000Z`);
  const asOf = new Date(`${asOfDate}T00:00:00.000Z`);
  let age = asOf.getUTCFullYear() - birth.getUTCFullYear();
  const birthdayNotReached =
    asOf.getUTCMonth() < birth.getUTCMonth() ||
    (asOf.getUTCMonth() === birth.getUTCMonth() && asOf.getUTCDate() < birth.getUTCDate());
  if (birthdayNotReached) age -= 1;
  return age;
}

function sumPopulation(startAge: number, endAge = MAX_INSURANCE_AGE) {
  return GLOBAL_POPULATION_PERCENT_BY_AGE.slice(startAge, endAge + 1).reduce((total, value) => total + value, 0);
}

export function benefitFactorForAge(age: number): number {
  if (!Number.isInteger(age) || age < MIN_INSURANCE_AGE || age > MAX_INSURANCE_AGE) {
    throw new LifeInsuranceError(400, `Age must be a whole number from ${MIN_INSURANCE_AGE} to ${MAX_INSURANCE_AGE}.`);
  }
  const adultShare = sumPopulation(age) / sumPopulation(MIN_INSURANCE_AGE);
  return MINIMUM_BENEFIT_FACTOR + (1 - MINIMUM_BENEFIT_FACTOR) * Math.sqrt(adultShare);
}

export function payoutForAge(age: number, standardBenefit: number): number {
  return Math.round(standardBenefit * benefitFactorForAge(age) * 100) / 100;
}

export function validateEnrollmentInput(payload: Record<string, unknown>, today: string): EnrollmentInput {
  const birthDate = dateOnly(payload.birth_date, "Birthday");
  if (birthDate > today) throw new LifeInsuranceError(400, "Birthday cannot be in the future.");
  const calculatedAge = calculateAgeOnDate(birthDate, today);
  const confirmedAge = Number(payload.age);
  if (!Number.isInteger(confirmedAge)) throw new LifeInsuranceError(400, "Age is required as a whole number.");
  if (confirmedAge !== calculatedAge) throw new LifeInsuranceError(400, `Age must match the birthday (${calculatedAge}).`);
  benefitFactorForAge(confirmedAge);
  const nextOfKinUserId = requiredText(payload.next_of_kin_user_id, "Next of kin", 120);
  const beneficiaryUserId = optionalText(payload.beneficiary_user_id, 120);
  const nextOfKinRelationship = requiredText(payload.next_of_kin_relationship, "Next-of-kin relationship", 80);
  const beneficiaryRelationship = beneficiaryUserId
    ? requiredText(payload.beneficiary_relationship, "Beneficiary relationship", 80)
    : null;
  if (payload.accepted_terms !== true) throw new LifeInsuranceError(400, "You must attest that the enrollment information is accurate.");
  return {
    birth_date: birthDate,
    age: confirmedAge,
    next_of_kin_user_id: nextOfKinUserId,
    next_of_kin_relationship: nextOfKinRelationship,
    beneficiary_user_id: beneficiaryUserId,
    beneficiary_relationship: beneficiaryRelationship,
    accepted_terms: true,
  };
}

export function validateDeathReportInput(payload: Record<string, unknown>, today: string): DeathReportInput {
  const deceasedUserId = requiredText(payload.deceased_user_id, "Deceased member", 120);
  const deathDate = dateOnly(payload.date_of_death, "Date of death");
  if (deathDate > today) throw new LifeInsuranceError(400, "Date of death cannot be in the future.");
  if (payload.attested !== true) throw new LifeInsuranceError(400, "You must attest that the death report is truthful.");
  return {
    deceased_user_id: deceasedUserId,
    date_of_death: deathDate,
    relationship_to_deceased: requiredText(payload.relationship_to_deceased, "Relationship to deceased", 80),
    attested: true,
  };
}

async function settings(db: D1Database): Promise<InsuranceSettingsRow> {
  const row = await db.prepare("SELECT standard_benefit_dena, attestation_threshold, funding_account_id FROM life_insurance_settings WHERE id = 1")
    .first<InsuranceSettingsRow>();
  return row || {
    standard_benefit_dena: LIFE_INSURANCE_STANDARD_BENEFIT,
    attestation_threshold: LIFE_INSURANCE_ATTESTATION_THRESHOLD,
    funding_account_id: LIFE_INSURANCE_FUNDING_ACCOUNT_ID,
  };
}

async function memberAccount(db: D1Database, userId: string): Promise<MemberAccountRow | null> {
  return db.prepare(
    `SELECT user_id, id AS account_id, name
     FROM ledger_accounts
     WHERE user_id = ? AND lower(entity_type) = 'individual'`,
  ).bind(userId).first<MemberAccountRow>();
}

async function requireMemberAccount(db: D1Database, userId: string, label: string): Promise<MemberAccountRow> {
  const account = await memberAccount(db, userId);
  if (!account) throw new LifeInsuranceError(404, `${label} must be a member with a Dena account.`);
  return account;
}

async function claimForDeceased(db: D1Database, userId: string): Promise<ClaimRow | null> {
  return db.prepare(
    `SELECT c.*,
      (SELECT COUNT(*) FROM life_insurance_death_reports r WHERE r.claim_id = c.id) AS report_count
     FROM life_insurance_claims c WHERE c.deceased_user_id = ?`,
  ).bind(userId).first<ClaimRow>();
}

export async function insuranceDashboard(db: D1Database, userId: string) {
  const [programSettings, enrollment, claim, memberRows] = await Promise.all([
    settings(db),
    db.prepare("SELECT * FROM life_insurance_enrollments WHERE user_id = ?").bind(userId).first<EnrollmentRow>(),
    claimForDeceased(db, userId),
    db.prepare(
      `SELECT a.user_id, a.id AS account_id, a.name,
        CASE WHEN e.user_id IS NULL THEN 0 ELSE 1 END AS enrolled
       FROM ledger_accounts a
       LEFT JOIN life_insurance_enrollments e ON e.user_id = a.user_id AND e.status = 'active'
       WHERE a.user_id IS NOT NULL AND lower(a.entity_type) = 'individual' AND a.user_id <> ?
       ORDER BY lower(a.name)`,
    ).bind(userId).all<MemberAccountRow & { enrolled: number }>(),
  ]);

  const members = memberRows.results || [];
  const memberName = (targetId: string | null | undefined) => members.find((member) => member.user_id === targetId)?.name || null;
  return {
    currency: LIFE_INSURANCE_CURRENCY,
    standard_benefit_dena: Number(programSettings.standard_benefit_dena),
    attestation_threshold: Number(programSettings.attestation_threshold),
    enrollment: enrollment ? {
      ...enrollment,
      confirmed_age: Number(enrollment.confirmed_age),
      next_of_kin_name: memberName(enrollment.next_of_kin_user_id),
      beneficiary_name: memberName(enrollment.beneficiary_user_id),
    } : null,
    claim: claim ? { ...claim, payout_amount: Number(claim.payout_amount), report_count: Number(claim.report_count || 0) } : null,
    members: members.map((member) => ({ ...member, enrolled: Boolean(member.enrolled) })),
  };
}

export async function saveInsuranceEnrollment(
  db: D1Database,
  userId: string,
  payload: Record<string, unknown>,
  timestamp = new Date().toISOString(),
) {
  const today = timestamp.slice(0, 10);
  const input = validateEnrollmentInput(payload, today);
  const existingClaim = await claimForDeceased(db, userId);
  if (existingClaim) throw new LifeInsuranceError(409, "Enrollment cannot change after a death claim has been opened.");
  if (input.next_of_kin_user_id === userId || input.beneficiary_user_id === userId) {
    throw new LifeInsuranceError(400, "A member cannot name themselves as next of kin or beneficiary.");
  }
  await requireMemberAccount(db, userId, "Member");
  await requireMemberAccount(db, input.next_of_kin_user_id, "Next of kin");
  if (input.beneficiary_user_id) await requireMemberAccount(db, input.beneficiary_user_id, "Beneficiary");

  await db.prepare(
    `INSERT INTO life_insurance_enrollments
      (user_id, birth_date, confirmed_age, next_of_kin_user_id, next_of_kin_relationship,
       beneficiary_user_id, beneficiary_relationship, status, accepted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
      birth_date = excluded.birth_date,
      confirmed_age = excluded.confirmed_age,
      next_of_kin_user_id = excluded.next_of_kin_user_id,
      next_of_kin_relationship = excluded.next_of_kin_relationship,
      beneficiary_user_id = excluded.beneficiary_user_id,
      beneficiary_relationship = excluded.beneficiary_relationship,
      status = 'active',
      accepted_at = excluded.accepted_at,
      updated_at = excluded.updated_at`,
  ).bind(
    userId,
    input.birth_date,
    input.age,
    input.next_of_kin_user_id,
    input.next_of_kin_relationship,
    input.beneficiary_user_id,
    input.beneficiary_relationship,
    timestamp,
    timestamp,
    timestamp,
  ).run();

  return insuranceDashboard(db, userId);
}

async function attemptClaimPayout(db: D1Database, claim: ClaimRow, threshold: number, timestamp: string) {
  const token = crypto.randomUUID();
  const transactionId = `txn-life-${crypto.randomUUID()}`;
  await db.batch([
    db.prepare(
      `UPDATE life_insurance_claims
       SET status = 'funds_reserved', processing_token = ?, updated_at = ?
       WHERE id = ? AND status IN ('pending', 'approved_pending_funds')
         AND (SELECT COUNT(*) FROM life_insurance_death_reports WHERE claim_id = ?) >= ?
         AND COALESCE((SELECT balance FROM ledger_accounts WHERE id = funding_account_id), 0) >= payout_amount`,
    ).bind(token, timestamp, claim.id, claim.id, threshold),
    db.prepare(
      `UPDATE ledger_accounts SET balance = balance - ?, updated_at = ?
       WHERE id = ? AND EXISTS (
        SELECT 1 FROM life_insurance_claims WHERE id = ? AND status = 'funds_reserved' AND processing_token = ?
       )`,
    ).bind(claim.payout_amount, timestamp, claim.funding_account_id, claim.id, token),
    db.prepare(
      `UPDATE ledger_accounts SET balance = balance + ?, updated_at = ?
       WHERE id = ? AND EXISTS (
        SELECT 1 FROM life_insurance_claims WHERE id = ? AND status = 'funds_reserved' AND processing_token = ?
       )`,
    ).bind(claim.payout_amount, timestamp, claim.recipient_account_id, claim.id, token),
    db.prepare(
      `INSERT INTO ledger_transactions
        (id, from_account_id, to_account_id, amount, currency, transaction_type, description, timestamp)
       SELECT ?, ?, ?, ?, 'DEM', 'LIFE_INSURANCE_PAYOUT', ?, ?
       WHERE EXISTS (
        SELECT 1 FROM life_insurance_claims WHERE id = ? AND status = 'funds_reserved' AND processing_token = ?
       )`,
    ).bind(
      transactionId,
      claim.funding_account_id,
      claim.recipient_account_id,
      claim.payout_amount,
      `Life benefit for member ${claim.deceased_user_id}`,
      timestamp,
      claim.id,
      token,
    ),
    db.prepare(
      `UPDATE life_insurance_enrollments SET status = 'deceased', updated_at = ?
       WHERE user_id = ? AND EXISTS (
        SELECT 1 FROM life_insurance_claims WHERE id = ? AND status = 'funds_reserved' AND processing_token = ?
       )`,
    ).bind(timestamp, claim.deceased_user_id, claim.id, token),
    db.prepare(
      `UPDATE life_insurance_claims
       SET status = 'paid', payout_transaction_id = ?, paid_at = ?, updated_at = ?, processing_token = NULL
       WHERE id = ? AND status = 'funds_reserved' AND processing_token = ?`,
    ).bind(transactionId, timestamp, timestamp, claim.id, token),
    db.prepare(
      `UPDATE life_insurance_claims
       SET status = 'approved_pending_funds', updated_at = ?
       WHERE id = ? AND status = 'pending'
         AND (SELECT COUNT(*) FROM life_insurance_death_reports WHERE claim_id = ?) >= ?`,
    ).bind(timestamp, claim.id, claim.id, threshold),
  ]);
}

export async function reportMemberDeath(
  db: D1Database,
  reporterUserId: string,
  reporterName: string,
  payload: Record<string, unknown>,
  timestamp = new Date().toISOString(),
) {
  const today = timestamp.slice(0, 10);
  const input = validateDeathReportInput(payload, today);
  if (input.deceased_user_id === reporterUserId) throw new LifeInsuranceError(400, "Members cannot report their own death.");
  await requireMemberAccount(db, reporterUserId, "Reporter");
  let claim = await claimForDeceased(db, input.deceased_user_id);
  if (claim?.status === "paid") throw new LifeInsuranceError(409, "This life-benefit claim has already been paid.");
  const enrollment = await db.prepare("SELECT * FROM life_insurance_enrollments WHERE user_id = ? AND status = 'active'")
    .bind(input.deceased_user_id)
    .first<EnrollmentRow>();
  if (!enrollment) throw new LifeInsuranceError(404, "The selected member is not enrolled in the life-benefit program.");
  if (input.date_of_death < enrollment.birth_date) throw new LifeInsuranceError(400, "Date of death cannot precede the member's birthday.");

  if (!claim) {
    const programSettings = await settings(db);
    const recipientUserId = enrollment.beneficiary_user_id || enrollment.next_of_kin_user_id;
    const source = enrollment.beneficiary_user_id ? "beneficiary" : "next_of_kin";
    const recipient = await requireMemberAccount(db, recipientUserId, source === "beneficiary" ? "Beneficiary" : "Next of kin");
    const ageAtDeath = calculateAgeOnDate(enrollment.birth_date, input.date_of_death);
    const payoutAmount = payoutForAge(Math.min(ageAtDeath, MAX_INSURANCE_AGE), Number(programSettings.standard_benefit_dena));
    const claimId = `life-claim-${crypto.randomUUID()}`;
    try {
      await db.prepare(
        `INSERT INTO life_insurance_claims
          (id, deceased_user_id, date_of_death, status, payout_amount, recipient_user_id,
           recipient_account_id, recipient_name, beneficiary_source, funding_account_id, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        claimId,
        input.deceased_user_id,
        input.date_of_death,
        payoutAmount,
        recipient.user_id,
        recipient.account_id,
        recipient.name,
        source,
        programSettings.funding_account_id,
        timestamp,
        timestamp,
      ).run();
    } catch {
      // A concurrent first report may have created the one permitted claim.
    }
    claim = await claimForDeceased(db, input.deceased_user_id);
  }
  if (!claim) throw new LifeInsuranceError(409, "Unable to open the death claim.");
  if (claim.date_of_death !== input.date_of_death) {
    throw new LifeInsuranceError(409, `An existing claim uses ${claim.date_of_death}; conflicting dates require administrator review.`);
  }
  try {
    await db.prepare(
      `INSERT INTO life_insurance_death_reports
        (id, claim_id, deceased_user_id, reporter_user_id, reporter_name, relationship_to_deceased, attested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      `life-report-${crypto.randomUUID()}`,
      claim.id,
      input.deceased_user_id,
      reporterUserId,
      reporterName,
      input.relationship_to_deceased,
      timestamp,
    ).run();
  } catch {
    throw new LifeInsuranceError(409, "You have already reported this member's death.");
  }

  claim = await claimForDeceased(db, input.deceased_user_id);
  const programSettings = await settings(db);
  if (claim && Number(claim.report_count || 0) >= Number(programSettings.attestation_threshold)) {
    await attemptClaimPayout(db, claim, Number(programSettings.attestation_threshold), timestamp);
    claim = await claimForDeceased(db, input.deceased_user_id);
  }
  return claim ? {
    ...claim,
    payout_amount: Number(claim.payout_amount),
    report_count: Number(claim.report_count || 0),
    attestation_threshold: Number(programSettings.attestation_threshold),
    currency: LIFE_INSURANCE_CURRENCY,
  } : null;
}
