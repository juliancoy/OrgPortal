export const HEALTH_INSURANCE_CODE_REFERENCE_VERSION = "Health claim codes 2026-Q3";

const STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI",
  "WY", "AS", "GU", "MP", "PR", "VI",
]);

const CODE_PATTERNS = {
  HCPCS_LEVEL_II: /^[A-Z][0-9]{4}$/,
  CPT: /^[0-9]{4}[0-9FT]$/,
  ICD10_PCS: /^[0-9A-HJ-NP-Z]{7}$/,
  NDC: /^[0-9]{10,11}$/,
} as const;

export type HealthInsuranceCodeSystem = keyof typeof CODE_PATTERNS;

export class HealthInsuranceError extends Error {
  constructor(public readonly status: 400 | 404 | 409, message: string) {
    super(message);
  }
}

export type HealthInsuranceEnrollmentInput = {
  state_code: string;
  program: "standard" | "pediatric";
  coverage_effective_date: string;
  attested: true;
};

export type HealthInsuranceClaimLineInput = {
  code_system: HealthInsuranceCodeSystem;
  code: string;
  modifiers: string[];
  units: number;
  billed_amount_usd: number;
};

export type HealthInsuranceClaimInput = {
  service_id: string;
  service_date: string;
  provider_npi: string;
  place_of_service: string;
  diagnosis_codes: string[];
  lines: HealthInsuranceClaimLineInput[];
  attested: true;
};

type ServiceRow = {
  id: string;
  name: string;
  description: string;
  timezone: string;
  slot_minutes: number;
  capacity_per_slot: number;
  available_to_all: number;
};

type ServiceHoursRow = { service_id: string; weekday: number; starts_at: string; ends_at: string };

function dateOnly(value: unknown, fieldName: string): string {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new HealthInsuranceError(400, `${fieldName} is required.`);
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new HealthInsuranceError(400, `${fieldName} must be a valid date.`);
  }
  return text;
}

function normalizeCode(value: unknown): string {
  return String(value || "").trim().toUpperCase().replace(/[\s-]/g, "");
}

function luhnValid(value: string): boolean {
  let total = 0;
  let doubleDigit = false;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    let digit = Number(value[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    total += digit;
    doubleDigit = !doubleDigit;
  }
  return total % 10 === 0;
}

export function validNpi(value: string): boolean {
  return /^\d{10}$/.test(value) && luhnValid(`80840${value}`);
}

export function validateHealthInsuranceEnrollment(payload: Record<string, unknown>, today: string): HealthInsuranceEnrollmentInput {
  const stateCode = String(payload.state_code || "").trim().toUpperCase();
  if (!STATE_CODES.has(stateCode)) throw new HealthInsuranceError(400, "Select a valid state or U.S. territory.");
  const program = String(payload.program || "").trim().toLowerCase();
  if (program !== "standard" && program !== "pediatric") throw new HealthInsuranceError(400, "Select a valid coverage program.");
  const coverageEffectiveDate = dateOnly(payload.coverage_effective_date, "Coverage effective date");
  if (coverageEffectiveDate > today) throw new HealthInsuranceError(400, "Coverage effective date cannot be in the future.");
  if (payload.attested !== true) throw new HealthInsuranceError(400, "You must attest that the coverage information is accurate.");
  return { state_code: stateCode, program, coverage_effective_date: coverageEffectiveDate, attested: true };
}

export function validateHealthInsuranceClaim(
  payload: Record<string, unknown>,
  enrollment: HealthInsuranceEnrollmentInput,
  today: string,
): HealthInsuranceClaimInput {
  const serviceDate = dateOnly(payload.service_date, "Service date");
  const serviceId = String(payload.service_id || "").trim();
  if (!serviceId) throw new HealthInsuranceError(400, "Service is required.");
  if (serviceDate > today) throw new HealthInsuranceError(400, "Service date cannot be in the future.");
  if (serviceDate < enrollment.coverage_effective_date) {
    throw new HealthInsuranceError(400, "Service date cannot precede the recorded coverage effective date.");
  }
  const providerNpi = normalizeCode(payload.provider_npi);
  if (!validNpi(providerNpi)) throw new HealthInsuranceError(400, "Provider NPI must be a valid 10-digit NPI.");
  const placeOfService = String(payload.place_of_service || "").trim();
  if (!/^\d{2}$/.test(placeOfService)) throw new HealthInsuranceError(400, "Place of service must be a 2-digit code.");

  if (!Array.isArray(payload.diagnosis_codes) || payload.diagnosis_codes.length < 1 || payload.diagnosis_codes.length > 12) {
    throw new HealthInsuranceError(400, "Provide between 1 and 12 ICD-10-CM diagnosis codes.");
  }
  const diagnosisCodes = payload.diagnosis_codes.map(normalizeCode);
  if (diagnosisCodes.some((code) => !/^[A-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?$/.test(code))) {
    throw new HealthInsuranceError(400, "Each diagnosis must use ICD-10-CM format.");
  }
  if (new Set(diagnosisCodes).size !== diagnosisCodes.length) {
    throw new HealthInsuranceError(400, "Diagnosis codes cannot be repeated.");
  }

  if (!Array.isArray(payload.lines) || payload.lines.length < 1 || payload.lines.length > 50) {
    throw new HealthInsuranceError(400, "Provide between 1 and 50 claim lines.");
  }
  const lines = payload.lines.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new HealthInsuranceError(400, `Claim line ${index + 1} is invalid.`);
    const line = raw as Record<string, unknown>;
    const codeSystem = String(line.code_system || "").trim().toUpperCase() as HealthInsuranceCodeSystem;
    if (!(codeSystem in CODE_PATTERNS)) throw new HealthInsuranceError(400, `Claim line ${index + 1} has an unsupported code system.`);
    const code = normalizeCode(line.code);
    if (!CODE_PATTERNS[codeSystem].test(code)) {
      throw new HealthInsuranceError(400, `Claim line ${index + 1} code does not match ${codeSystem} format.`);
    }
    const modifiers = Array.isArray(line.modifiers) ? line.modifiers.map(normalizeCode).filter(Boolean) : [];
    if (modifiers.length > 4 || modifiers.some((modifier) => !/^[A-Z0-9]{2}$/.test(modifier))) {
      throw new HealthInsuranceError(400, `Claim line ${index + 1} modifiers must be up to four 2-character codes.`);
    }
    const units = Number(line.units);
    if (!Number.isInteger(units) || units < 1 || units > 999) {
      throw new HealthInsuranceError(400, `Claim line ${index + 1} units must be a whole number from 1 to 999.`);
    }
    const billedAmount = Number(line.billed_amount_usd);
    if (!Number.isFinite(billedAmount) || billedAmount < 0 || billedAmount > 1_000_000) {
      throw new HealthInsuranceError(400, `Claim line ${index + 1} billed amount must be between 0 and 1,000,000 USD.`);
    }
    return {
      code_system: codeSystem,
      code,
      modifiers,
      units,
      billed_amount_usd: Math.round(billedAmount * 100) / 100,
    };
  });
  if (payload.attested !== true) throw new HealthInsuranceError(400, "You must attest that the claim information is accurate.");
  return {
    service_id: serviceId,
    service_date: serviceDate,
    provider_npi: providerNpi,
    place_of_service: placeOfService,
    diagnosis_codes: diagnosisCodes,
    lines,
    attested: true,
  };
}

export async function saveHealthInsuranceEnrollment(
  db: D1Database,
  userId: string,
  payload: Record<string, unknown>,
  now = new Date().toISOString(),
) {
  const input = validateHealthInsuranceEnrollment(payload, now.slice(0, 10));
  await db.prepare(
    `INSERT INTO health_insurance_enrollments
       (user_id, state_code, program, coverage_effective_date, status, attested_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       state_code = excluded.state_code, program = excluded.program,
       coverage_effective_date = excluded.coverage_effective_date, status = 'active',
       attested_at = excluded.attested_at, updated_at = excluded.updated_at`,
  ).bind(userId, input.state_code, input.program, input.coverage_effective_date, now, now, now).run();
  return db.prepare("SELECT * FROM health_insurance_enrollments WHERE user_id = ?").bind(userId).first();
}

export async function submitHealthInsuranceClaim(
  db: D1Database,
  userId: string,
  payload: Record<string, unknown>,
  now = new Date().toISOString(),
) {
  const enrollment = await db.prepare(
    "SELECT state_code, program, coverage_effective_date, 1 AS attested FROM health_insurance_enrollments WHERE user_id = ? AND status = 'active'",
  ).bind(userId).first<HealthInsuranceEnrollmentInput>();
  if (!enrollment) throw new HealthInsuranceError(404, "Enroll in the health-benefit intake before submitting a claim.");
  const input = validateHealthInsuranceClaim(payload, enrollment, now.slice(0, 10));
  const availableService = await db.prepare(
    "SELECT id FROM health_insurance_services WHERE id = ? AND active = 1 AND available_to_all = 1",
  ).bind(input.service_id).first();
  if (!availableService) throw new HealthInsuranceError(404, "That service is not currently available.");
  const claimId = crypto.randomUUID();
  const totalBilled = Math.round(input.lines.reduce((total, line) => total + line.billed_amount_usd, 0) * 100) / 100;
  const statements = [
    db.prepare(
      `INSERT INTO health_insurance_claims
         (id, user_id, state_code, program, service_id, service_date, provider_npi, place_of_service, status,
          coverage_determination, total_billed_usd, code_reference_version, submitted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'received', 'available', ?, ?, ?, ?)`,
    ).bind(claimId, userId, enrollment.state_code, enrollment.program, input.service_id, input.service_date, input.provider_npi,
      input.place_of_service, totalBilled, HEALTH_INSURANCE_CODE_REFERENCE_VERSION, now, now),
    ...input.diagnosis_codes.map((code, index) => db.prepare(
      "INSERT INTO health_insurance_diagnoses (id, claim_id, sequence_number, code) VALUES (?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), claimId, index + 1, code)),
    ...input.lines.map((line, index) => db.prepare(
      `INSERT INTO health_insurance_claim_lines
         (id, claim_id, line_number, code_system, code, modifiers_json, units, billed_amount_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), claimId, index + 1, line.code_system, line.code, JSON.stringify(line.modifiers), line.units,
      line.billed_amount_usd)),
  ];
  await db.batch(statements);
  return healthInsuranceClaim(db, userId, claimId);
}

async function healthInsuranceClaim(db: D1Database, userId: string, claimId: string) {
  const claim = await db.prepare("SELECT * FROM health_insurance_claims WHERE id = ? AND user_id = ?")
    .bind(claimId, userId).first<Record<string, unknown>>();
  if (!claim) return null;
  const [diagnoses, lines] = await Promise.all([
    db.prepare("SELECT code FROM health_insurance_diagnoses WHERE claim_id = ? ORDER BY sequence_number").bind(claimId).all<{ code: string }>(),
    db.prepare("SELECT line_number, code_system, code, modifiers_json, units, billed_amount_usd FROM health_insurance_claim_lines WHERE claim_id = ? ORDER BY line_number")
      .bind(claimId).all<Record<string, unknown>>(),
  ]);
  return {
    ...claim,
    diagnosis_codes: diagnoses.results.map((row) => row.code),
    lines: lines.results.map((line) => ({ ...line, modifiers: JSON.parse(String(line.modifiers_json || "[]")), modifiers_json: undefined })),
  };
}

export async function healthInsuranceDashboard(db: D1Database, userId: string) {
  const [enrollment, claims, services, hours, appointments] = await Promise.all([
    db.prepare("SELECT * FROM health_insurance_enrollments WHERE user_id = ?").bind(userId).first(),
    db.prepare("SELECT id FROM health_insurance_claims WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 50").bind(userId).all<{ id: string }>(),
    db.prepare("SELECT id, name, description, timezone, slot_minutes, capacity_per_slot, available_to_all FROM health_insurance_services WHERE active = 1 ORDER BY name").all<ServiceRow>(),
    db.prepare("SELECT service_id, weekday, starts_at, ends_at FROM health_insurance_service_hours ORDER BY service_id, weekday").all<ServiceHoursRow>(),
    db.prepare(
      `SELECT a.id, a.service_id, s.name AS service_name, a.starts_at, a.ends_at, a.status, a.requested_at
       FROM health_insurance_appointments a JOIN health_insurance_services s ON s.id = a.service_id
       WHERE a.user_id = ? ORDER BY a.starts_at DESC LIMIT 100`,
    ).bind(userId).all(),
  ]);
  return {
    enrollment,
    claims: await Promise.all(claims.results.map((row) => healthInsuranceClaim(db, userId, row.id))),
    services: services.results.map((service) => ({
      ...service,
      available_to_all: Boolean(service.available_to_all),
      hours: hours.results.filter((item) => item.service_id === service.id),
    })),
    appointments: appointments.results,
    code_reference_version: HEALTH_INSURANCE_CODE_REFERENCE_VERSION,
    service_access: "Coverage follows published service availability for every authenticated member.",
  };
}

function isoTimestamp(value: unknown): string {
  const text = String(value || "").trim();
  const parsed = new Date(text);
  if (!text || Number.isNaN(parsed.getTime())) throw new HealthInsuranceError(400, "Select a valid appointment time.");
  return parsed.toISOString();
}

export async function scheduleHealthInsuranceAppointment(
  db: D1Database,
  userId: string,
  payload: Record<string, unknown>,
  now = new Date().toISOString(),
) {
  const serviceId = String(payload.service_id || "").trim();
  const service = await db.prepare(
    "SELECT id, name, description, timezone, slot_minutes, capacity_per_slot, available_to_all FROM health_insurance_services WHERE id = ? AND active = 1 AND available_to_all = 1",
  ).bind(serviceId).first<ServiceRow>();
  if (!service) throw new HealthInsuranceError(404, "That service is not currently available.");
  const startsAt = isoTimestamp(payload.starts_at);
  if (startsAt <= now) throw new HealthInsuranceError(400, "Appointment time must be in the future.");
  const latest = new Date(new Date(now).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
  if (startsAt > latest) throw new HealthInsuranceError(400, "Appointments can be requested up to 90 days ahead.");
  const start = new Date(startsAt);
  const weekday = start.getUTCDay();
  const time = `${String(start.getUTCHours()).padStart(2, "0")}:${String(start.getUTCMinutes()).padStart(2, "0")}`;
  const hours = await db.prepare(
    "SELECT service_id, weekday, starts_at, ends_at FROM health_insurance_service_hours WHERE service_id = ? AND weekday = ?",
  ).bind(service.id, weekday).first<ServiceHoursRow>();
  if (!hours || time < hours.starts_at || time >= hours.ends_at || start.getUTCMinutes() % service.slot_minutes !== 0 || start.getUTCSeconds() !== 0) {
    throw new HealthInsuranceError(400, "Select a published appointment slot for this service.");
  }
  if (payload.attested !== true) throw new HealthInsuranceError(400, "Confirm that you want to request this appointment.");
  const endsAt = new Date(start.getTime() + service.slot_minutes * 60 * 1000).toISOString();
  const id = crypto.randomUUID();
  try {
    const result = await db.prepare(
      `INSERT INTO health_insurance_appointments
         (id, user_id, service_id, starts_at, ends_at, status, requested_at, updated_at)
       SELECT ?, ?, ?, ?, ?, 'requested', ?, ?
       WHERE (SELECT COUNT(*) FROM health_insurance_appointments
              WHERE service_id = ? AND starts_at = ? AND status IN ('requested', 'confirmed')) < ?`,
    ).bind(id, userId, service.id, startsAt, endsAt, now, now, service.id, startsAt, service.capacity_per_slot).run();
    if (!Number(result.meta.changes || 0)) throw new HealthInsuranceError(409, "That appointment slot is full.");
  } catch {
    throw new HealthInsuranceError(409, "That slot is full or you already have an appointment at that time.");
  }
  return db.prepare(
    `SELECT a.id, a.service_id, s.name AS service_name, a.starts_at, a.ends_at, a.status, a.requested_at
     FROM health_insurance_appointments a JOIN health_insurance_services s ON s.id = a.service_id
     WHERE a.id = ? AND a.user_id = ?`,
  ).bind(id, userId).first();
}

export async function cancelHealthInsuranceAppointment(db: D1Database, userId: string, appointmentId: string, now = new Date().toISOString()) {
  const result = await db.prepare(
    "UPDATE health_insurance_appointments SET status = 'cancelled', updated_at = ? WHERE id = ? AND user_id = ? AND status IN ('requested', 'confirmed')",
  ).bind(now, appointmentId, userId).run();
  if (!Number(result.meta.changes || 0)) throw new HealthInsuranceError(404, "Active appointment not found.");
  return { id: appointmentId, status: "cancelled" };
}
