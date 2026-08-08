export const HEALTH_INSURANCE_CODE_REFERENCE_VERSION = "Health claim codes 2026-Q3";
export const HEALTH_DIAGNOSIS_REFERENCE_VERSION = "Health diagnosis catalog 2026-Q3";

const CODE_PATTERNS = {
  HCPCS_LEVEL_II: /^[A-Z][0-9]{4}$/,
  CPT: /^[0-9]{4}[0-9FT]$/,
  ICD10_PCS: /^[0-9A-HJ-NP-Z]{7}$/,
  NDC: /^[0-9]{10,11}$/,
} as const;

export type HealthInsuranceCodeSystem = keyof typeof CODE_PATTERNS;

type DiagnosisCatalogEntry = {
  code: string;
  label: string;
  description: string;
  keywords: string[];
};

type ClaimCodeCatalogEntry = {
  code_system: HealthInsuranceCodeSystem;
  code: string;
  label: string;
  description: string;
  keywords: string[];
};

const DIAGNOSIS_CATALOG: DiagnosisCatalogEntry[] = [
  { code: "E11.9", label: "Type 2 diabetes mellitus without complications", description: "Diabetes without recorded complications.", keywords: ["diabetes", "blood sugar", "glucose", "endocrine"] },
  { code: "I10", label: "Essential primary hypertension", description: "Chronic high blood pressure.", keywords: ["hypertension", "blood pressure", "cardiovascular"] },
  { code: "J45.909", label: "Unspecified asthma uncomplicated", description: "Asthma without current complication detail.", keywords: ["asthma", "wheezing", "respiratory"] },
  { code: "F41.1", label: "Generalized anxiety disorder", description: "Persistent generalized anxiety.", keywords: ["anxiety", "panic", "mental health"] },
  { code: "F32.A", label: "Depression unspecified", description: "Depressive symptoms without finer subtype.", keywords: ["depression", "mood", "mental health"] },
  { code: "M54.50", label: "Low back pain unspecified", description: "Back pain without laterality or sciatica detail.", keywords: ["back pain", "spine", "musculoskeletal"] },
  { code: "G43.909", label: "Migraine unspecified not intractable", description: "Migraine headaches without status migrainosus.", keywords: ["migraine", "headache", "neurology"] },
  { code: "K21.9", label: "Gastro-esophageal reflux disease without esophagitis", description: "Acid reflux symptoms.", keywords: ["reflux", "heartburn", "gastro"] },
  { code: "N39.0", label: "Urinary tract infection site not specified", description: "Urinary infection without site detail.", keywords: ["uti", "urinary", "infection"] },
  { code: "L20.9", label: "Atopic dermatitis unspecified", description: "Eczema or atopic dermatitis.", keywords: ["eczema", "rash", "dermatology"] },
  { code: "R10.9", label: "Abdominal pain unspecified", description: "Abdominal pain without location detail.", keywords: ["abdominal pain", "stomach", "gastro"] },
  { code: "R53.83", label: "Other fatigue", description: "Persistent fatigue or low energy.", keywords: ["fatigue", "tiredness", "energy"] },
];

const CLAIM_CODE_CATALOG: ClaimCodeCatalogEntry[] = [
  { code_system: "HCPCS_LEVEL_II", code: "A4253", label: "Blood glucose test or reagent strips", description: "Glucose monitoring supply.", keywords: ["glucose strips", "diabetes supply"] },
  { code_system: "HCPCS_LEVEL_II", code: "A9270", label: "Noncovered item or service", description: "General supply or service code.", keywords: ["supply", "item", "service"] },
  { code_system: "HCPCS_LEVEL_II", code: "E0114", label: "Crutches underarm other than wood pair", description: "Mobility assistance device.", keywords: ["crutches", "mobility"] },
  { code_system: "CPT", code: "99213", label: "Established patient office visit", description: "Moderate complexity outpatient evaluation.", keywords: ["office visit", "clinic", "evaluation"] },
  { code_system: "CPT", code: "99214", label: "Established patient extended office visit", description: "Higher-complexity outpatient evaluation.", keywords: ["office visit", "follow-up", "evaluation"] },
  { code_system: "CPT", code: "93000", label: "Electrocardiogram routine ECG", description: "ECG with interpretation and report.", keywords: ["ecg", "ekg", "cardiology"] },
  { code_system: "CPT", code: "71046", label: "Chest x-ray two views", description: "Diagnostic chest imaging.", keywords: ["x-ray", "chest imaging", "radiology"] },
  { code_system: "ICD10_PCS", code: "0BH17EZ", label: "Insertion of endotracheal airway via natural opening", description: "Respiratory airway procedure.", keywords: ["airway", "intubation", "procedure"] },
  { code_system: "ICD10_PCS", code: "3E0P3MZ", label: "Introduction of other antineoplastic into peripheral vein", description: "Infusion procedure.", keywords: ["infusion", "oncology", "vein"] },
  { code_system: "NDC", code: "00093015001", label: "Albuterol sulfate inhalation aerosol", description: "Respiratory rescue inhaler.", keywords: ["albuterol", "inhaler", "asthma"] },
  { code_system: "NDC", code: "59762336001", label: "Insulin glargine injection", description: "Long-acting insulin product.", keywords: ["insulin", "diabetes", "injection"] },
  { code_system: "NDC", code: "49884042301", label: "Omeprazole delayed release capsules", description: "Acid reflux medication.", keywords: ["omeprazole", "reflux", "gastro"] },
];

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

type AppointmentRow = {
  id: string;
  service_id: string;
  service_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  requested_at: string;
};

type ProfileUpdateRow = {
  id: string;
  program: "standard" | "pediatric";
  coverage_effective_date: string;
  suspected_diagnoses_json: string;
  issue_summary: string;
  attested_at: string;
  created_at: string;
};

type AnalysisRow = {
  id: string;
  analysis_kind: string;
  status: string;
  summary_json: string;
  requested_at: string;
  completed_at: string | null;
  updated_at: string;
};

type DiagnosisEntryRow = {
  id: string;
  patient_user_id: string;
  code: string;
  submitted_by_user_id: string;
  submitted_by_name: string;
  self_reported: number;
  note: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type DiagnosisSupportRow = {
  diagnosis_entry_id: string;
  supporter_user_id: string;
  supporter_name: string;
  created_at: string;
};

type MemberAccountRow = {
  user_id: string;
  name: string;
};

export class HealthInsuranceError extends Error {
  constructor(public readonly status: 400 | 404 | 409, message: string) {
    super(message);
  }
}

export type HealthInsuranceEnrollmentInput = {
  program: "standard" | "pediatric";
  coverage_effective_date: string;
  suspected_diagnosis_codes: string[];
  issue_summary: string;
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
  suspected_diagnosis_codes: string[];
  issue_summary: string;
  lines: HealthInsuranceClaimLineInput[];
  attested: true;
};

export type HealthInsuranceAnalysisInput = {
  analysis_kind: "record-summary" | "triage" | "service-match";
};

export type HealthInsuranceDiagnosisSubmissionInput = {
  patient_user_id: string;
  code: string;
  note: string;
};

function jsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return [];
}

function parseJsonArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

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

function normalizeIssueSummary(value: unknown): string {
  const summary = String(value || "").trim();
  if (summary.length > 4_000) throw new HealthInsuranceError(400, "Issue description must be 4,000 characters or fewer.");
  return summary;
}

function normalizeDiagnosisCodes(value: unknown, { requireKnownCodes, fieldLabel }: { requireKnownCodes: boolean; fieldLabel: string }) {
  const codes = jsonArray(value).map(normalizeCode);
  if (codes.length > 12) throw new HealthInsuranceError(400, `${fieldLabel} can contain up to 12 codes.`);
  if (codes.some((code) => !/^[A-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?$/.test(code))) {
    throw new HealthInsuranceError(400, `${fieldLabel} must use ICD-10-CM format.`);
  }
  if (new Set(codes).size !== codes.length) throw new HealthInsuranceError(400, `${fieldLabel} cannot contain duplicates.`);
  if (requireKnownCodes) {
    const knownCodes = new Set(DIAGNOSIS_CATALOG.map((entry) => entry.code));
    if (codes.some((code) => !knownCodes.has(code))) {
      throw new HealthInsuranceError(400, `${fieldLabel} must be selected from the diagnosis catalog.`);
    }
  }
  return codes;
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
  const program = String(payload.program || "").trim().toLowerCase();
  if (program !== "standard" && program !== "pediatric") throw new HealthInsuranceError(400, "Select a valid coverage program.");
  const coverageEffectiveDate = dateOnly(payload.coverage_effective_date, "Coverage effective date");
  if (coverageEffectiveDate > today) throw new HealthInsuranceError(400, "Coverage effective date cannot be in the future.");
  const suspectedDiagnosisCodes = normalizeDiagnosisCodes(payload.suspected_diagnosis_codes, {
    requireKnownCodes: true,
    fieldLabel: "Suspected diagnoses",
  });
  const issueSummary = normalizeIssueSummary(payload.issue_summary);
  if (payload.attested !== true) throw new HealthInsuranceError(400, "You must attest that the coverage information is accurate.");
  return { program, coverage_effective_date: coverageEffectiveDate, suspected_diagnosis_codes: suspectedDiagnosisCodes, issue_summary: issueSummary, attested: true };
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

  const diagnosisCodes = normalizeDiagnosisCodes(payload.diagnosis_codes, {
    requireKnownCodes: false,
    fieldLabel: "Confirmed diagnoses",
  });
  if (diagnosisCodes.length < 1) throw new HealthInsuranceError(400, "Provide at least one confirmed diagnosis code.");

  const suspectedDiagnosisCodes = normalizeDiagnosisCodes(
    Array.isArray(payload.suspected_diagnosis_codes) ? payload.suspected_diagnosis_codes : enrollment.suspected_diagnosis_codes,
    { requireKnownCodes: true, fieldLabel: "Suspected diagnoses" },
  );
  const issueSummary = normalizeIssueSummary(payload.issue_summary ?? enrollment.issue_summary);

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
    suspected_diagnosis_codes: suspectedDiagnosisCodes,
    issue_summary: issueSummary,
    lines,
    attested: true,
  };
}

export function validateHealthInsuranceAnalysis(payload: Record<string, unknown>): HealthInsuranceAnalysisInput {
  const analysisKind = String(payload.analysis_kind || "").trim().toLowerCase();
  if (analysisKind !== "record-summary" && analysisKind !== "triage" && analysisKind !== "service-match") {
    throw new HealthInsuranceError(400, "Select a valid analysis type.");
  }
  return { analysis_kind: analysisKind };
}

export function validateHealthInsuranceDiagnosisSubmission(
  payload: Record<string, unknown>,
  actorUserId: string,
): HealthInsuranceDiagnosisSubmissionInput {
  const patientUserId = String(payload.patient_user_id || actorUserId).trim();
  if (!patientUserId) throw new HealthInsuranceError(400, "Patient is required.");
  const code = normalizeCode(payload.code);
  const knownCodes = new Set(DIAGNOSIS_CATALOG.map((entry) => entry.code));
  if (!knownCodes.has(code)) throw new HealthInsuranceError(400, "Diagnosis must be selected from the diagnosis catalog.");
  const note = normalizeIssueSummary(payload.note ?? "");
  return { patient_user_id: patientUserId, code, note };
}

function diagnosisSummaries(codes: string[]) {
  const byCode = new Map(DIAGNOSIS_CATALOG.map((entry) => [entry.code, entry]));
  return codes.map((code) => {
    const match = byCode.get(code);
    return { code, label: match?.label || code, description: match?.description || "" };
  });
}

function claimCatalogSummaries(lines: { code_system: HealthInsuranceCodeSystem; code: string }[]) {
  const byKey = new Map(CLAIM_CODE_CATALOG.map((entry) => [`${entry.code_system}:${entry.code}`, entry]));
  return lines.map((line) => {
    const match = byKey.get(`${line.code_system}:${line.code}`);
    return {
      code_system: line.code_system,
      code: line.code,
      label: match?.label || line.code,
      description: match?.description || "",
    };
  });
}

export async function saveHealthInsuranceEnrollment(
  db: D1Database,
  userId: string,
  payload: Record<string, unknown>,
  now = new Date().toISOString(),
) {
  const input = validateHealthInsuranceEnrollment(payload, now.slice(0, 10));
  const updateId = crypto.randomUUID();
  await db.batch([
    db.prepare(
      `INSERT INTO health_insurance_enrollments
         (user_id, state_code, program, coverage_effective_date, status, attested_at, created_at, updated_at,
          suspected_diagnoses_json, issue_summary)
       VALUES (?, '--', ?, ?, 'active', ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         program = excluded.program,
         coverage_effective_date = excluded.coverage_effective_date,
         status = 'active',
         attested_at = excluded.attested_at,
         updated_at = excluded.updated_at,
         suspected_diagnoses_json = excluded.suspected_diagnoses_json,
         issue_summary = excluded.issue_summary`,
    ).bind(
      userId,
      input.program,
      input.coverage_effective_date,
      now,
      now,
      now,
      JSON.stringify(input.suspected_diagnosis_codes),
      input.issue_summary,
    ),
    db.prepare(
      `INSERT INTO health_insurance_profile_updates
         (id, user_id, program, coverage_effective_date, suspected_diagnoses_json, issue_summary, attested_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      updateId,
      userId,
      input.program,
      input.coverage_effective_date,
      JSON.stringify(input.suspected_diagnosis_codes),
      input.issue_summary,
      now,
      now,
    ),
  ]);
  return db.prepare(
    `SELECT user_id, program, coverage_effective_date, status, suspected_diagnoses_json, issue_summary
     FROM health_insurance_enrollments WHERE user_id = ?`,
  ).bind(userId).first();
}

export async function submitHealthInsuranceClaim(
  db: D1Database,
  userId: string,
  payload: Record<string, unknown>,
  now = new Date().toISOString(),
) {
  const enrollment = await db.prepare(
    `SELECT program, coverage_effective_date, suspected_diagnoses_json, issue_summary
     FROM health_insurance_enrollments WHERE user_id = ? AND status = 'active'`,
  ).bind(userId).first<{
    program: "standard" | "pediatric";
    coverage_effective_date: string;
    suspected_diagnoses_json: string;
    issue_summary: string;
  }>();
  if (!enrollment) throw new HealthInsuranceError(404, "Save a health profile before submitting claim codes.");
  const input = validateHealthInsuranceClaim({
    ...payload,
    suspected_diagnosis_codes: payload.suspected_diagnosis_codes ?? parseJsonArray(enrollment.suspected_diagnoses_json),
    issue_summary: payload.issue_summary ?? enrollment.issue_summary,
  }, {
    program: enrollment.program,
    coverage_effective_date: enrollment.coverage_effective_date,
    suspected_diagnosis_codes: parseJsonArray(enrollment.suspected_diagnoses_json),
    issue_summary: enrollment.issue_summary,
    attested: true,
  }, now.slice(0, 10));
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
          coverage_determination, total_billed_usd, code_reference_version, submitted_at, updated_at,
          suspected_diagnoses_json, issue_summary)
       VALUES (?, ?, '--', ?, ?, ?, ?, ?, 'received', 'available', ?, ?, ?, ?, ?, ?)`,
    ).bind(
      claimId,
      userId,
      enrollment.program,
      input.service_id,
      input.service_date,
      input.provider_npi,
      input.place_of_service,
      totalBilled,
      HEALTH_INSURANCE_CODE_REFERENCE_VERSION,
      now,
      now,
      JSON.stringify(input.suspected_diagnosis_codes),
      input.issue_summary,
    ),
    ...input.diagnosis_codes.map((code, index) => db.prepare(
      "INSERT INTO health_insurance_diagnoses (id, claim_id, sequence_number, code) VALUES (?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), claimId, index + 1, code)),
    ...input.lines.map((line, index) => db.prepare(
      `INSERT INTO health_insurance_claim_lines
         (id, claim_id, line_number, code_system, code, modifiers_json, units, billed_amount_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      claimId,
      index + 1,
      line.code_system,
      line.code,
      JSON.stringify(line.modifiers),
      line.units,
      line.billed_amount_usd,
    )),
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
  const diagnosisCodes = diagnoses.results.map((row) => row.code);
  const normalizedLines = lines.results.map((line) => ({
    line_number: Number(line.line_number),
    code_system: String(line.code_system) as HealthInsuranceCodeSystem,
    code: String(line.code),
    modifiers: JSON.parse(String(line.modifiers_json || "[]")) as string[],
    units: Number(line.units),
    billed_amount_usd: Number(line.billed_amount_usd),
  }));
  const suspectedDiagnosisCodes = parseJsonArray(claim.suspected_diagnoses_json);
  return {
    ...claim,
    diagnosis_codes: diagnosisCodes,
    diagnosis_details: diagnosisSummaries(diagnosisCodes),
    suspected_diagnosis_codes: suspectedDiagnosisCodes,
    suspected_diagnosis_details: diagnosisSummaries(suspectedDiagnosisCodes),
    issue_summary: String(claim.issue_summary || ""),
    lines: normalizedLines,
    line_details: claimCatalogSummaries(normalizedLines),
  };
}

function analysisStub(kind: HealthInsuranceAnalysisInput["analysis_kind"], dashboard: Awaited<ReturnType<typeof healthInsuranceDashboard>>) {
  const suspected = dashboard.enrollment?.suspected_diagnosis_details || [];
  if (kind === "triage") {
    return {
      headline: "Triage snapshot prepared",
      findings: [
        `${suspected.length} suspected diagnosis entries on file.`,
        `${dashboard.claims.length} coded claim submission(s) recorded.`,
        `${dashboard.appointments.filter((item) => item.status !== "cancelled").length} appointment(s) still active.`,
      ],
      next_steps: [
        "Review the most recent coded visit and compare it with the current issue description.",
        "Prioritize published services that match the suspected diagnosis list.",
      ],
    };
  }
  if (kind === "service-match") {
    return {
      headline: "Service match snapshot prepared",
      findings: dashboard.services.map((service) => `${service.name}: ${service.description}`),
      next_steps: [
        "Use the service calendar to book the first open slot that fits the current record.",
      ],
    };
  }
  return {
    headline: "Record summary prepared",
    findings: [
      dashboard.enrollment?.issue_summary || "No issue description recorded.",
      `${dashboard.history.length} total timeline event(s) on this member record.`,
    ],
    next_steps: [
      "Review the full timeline below before making a service or coding decision.",
    ],
  };
}

export async function requestHealthInsuranceAnalysis(
  db: D1Database,
  userId: string,
  payload: Record<string, unknown>,
  now = new Date().toISOString(),
) {
  const input = validateHealthInsuranceAnalysis(payload);
  const dashboard = await healthInsuranceDashboard(db, userId);
  const summary = analysisStub(input.analysis_kind, dashboard);
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO health_insurance_analysis_runs
       (id, user_id, analysis_kind, status, summary_json, requested_at, completed_at, updated_at)
     VALUES (?, ?, ?, 'ready', ?, ?, ?, ?)`,
  ).bind(id, userId, input.analysis_kind, JSON.stringify(summary), now, now, now).run();
  return {
    id,
    analysis_kind: input.analysis_kind,
    status: "ready",
    summary,
    requested_at: now,
    completed_at: now,
    updated_at: now,
  };
}

function diagnosisCatalogDetail(code: string) {
  const entry = DIAGNOSIS_CATALOG.find((item) => item.code === code);
  return {
    code,
    label: entry?.label || code,
    description: entry?.description || "",
  };
}

function normalizeCollaborativeDiagnoses(entries: DiagnosisEntryRow[], supports: DiagnosisSupportRow[], viewerUserId: string) {
  return entries.map((entry) => {
    const approvalRows = supports
      .filter((support) => support.diagnosis_entry_id === entry.id)
      .map((support) => ({
        supporter_user_id: support.supporter_user_id,
        supporter_name: support.supporter_name,
        created_at: support.created_at,
      }))
      .sort((left, right) => left.created_at.localeCompare(right.created_at));
    const detail = diagnosisCatalogDetail(entry.code);
    return {
      id: entry.id,
      patient_user_id: entry.patient_user_id,
      code: entry.code,
      label: detail.label,
      description: detail.description,
      note: entry.note,
      submitted_by_user_id: entry.submitted_by_user_id,
      submitted_by_name: entry.submitted_by_name,
      self_reported: Boolean(entry.self_reported),
      supporter_count: approvalRows.length,
      supporters: approvalRows,
      viewer_supports: approvalRows.some((support) => support.supporter_user_id === viewerUserId),
      created_at: entry.created_at,
      updated_at: entry.updated_at,
    };
  });
}

async function requireMemberAccount(db: D1Database, userId: string, label = "Member") {
  const row = await db.prepare(
    "SELECT user_id, name FROM ledger_accounts WHERE user_id = ? LIMIT 1",
  ).bind(userId).first<MemberAccountRow>();
  if (!row?.user_id) throw new HealthInsuranceError(404, `${label} was not found.`);
  return row;
}

export async function submitHealthInsuranceDiagnosis(
  db: D1Database,
  actorUserId: string,
  actorName: string,
  payload: Record<string, unknown>,
  now = new Date().toISOString(),
) {
  const input = validateHealthInsuranceDiagnosisSubmission(payload, actorUserId);
  await requireMemberAccount(db, input.patient_user_id, "Patient");
  const existing = await db.prepare(
    `SELECT id, patient_user_id, code, submitted_by_user_id, submitted_by_name, self_reported, note, status, created_at, updated_at
     FROM health_insurance_diagnosis_entries WHERE patient_user_id = ? AND code = ?`,
  ).bind(input.patient_user_id, input.code).first<DiagnosisEntryRow>();
  const diagnosisId = existing?.id || crypto.randomUUID();
  const selfReported = input.patient_user_id === actorUserId;
  const canUpdateNote = !existing || selfReported || existing.submitted_by_user_id === actorUserId;
  const submittedNote = canUpdateNote ? input.note : "";
  await db.batch([
    db.prepare(
      `INSERT INTO health_insurance_diagnosis_entries
         (id, patient_user_id, code, submitted_by_user_id, submitted_by_name, self_reported, note, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
       ON CONFLICT(patient_user_id, code) DO UPDATE SET
         note = CASE WHEN excluded.note <> '' THEN excluded.note ELSE health_insurance_diagnosis_entries.note END,
         self_reported = CASE WHEN excluded.self_reported = 1 THEN 1 ELSE health_insurance_diagnosis_entries.self_reported END,
         updated_at = excluded.updated_at`,
    ).bind(diagnosisId, input.patient_user_id, input.code, actorUserId, actorName, selfReported ? 1 : 0, submittedNote, now, now),
    db.prepare(
      `INSERT OR IGNORE INTO health_insurance_diagnosis_supports
         (id, diagnosis_entry_id, supporter_user_id, supporter_name, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), diagnosisId, actorUserId, actorName, now),
  ]);
  const [entry, supporters] = await Promise.all([
    db.prepare(
      `SELECT id, patient_user_id, code, submitted_by_user_id, submitted_by_name, self_reported, note, status, created_at, updated_at
       FROM health_insurance_diagnosis_entries WHERE id = ?`,
    ).bind(diagnosisId).first<DiagnosisEntryRow>(),
    db.prepare(
      `SELECT diagnosis_entry_id, supporter_user_id, supporter_name, created_at
       FROM health_insurance_diagnosis_supports WHERE diagnosis_entry_id = ? ORDER BY created_at`,
    ).bind(diagnosisId).all<DiagnosisSupportRow>(),
  ]);
  return normalizeCollaborativeDiagnoses(entry ? [entry] : [], supporters.results, actorUserId)[0] || null;
}

export async function healthInsuranceDiagnosisBoard(db: D1Database, viewerUserId: string, patientUserId: string) {
  const patient = await requireMemberAccount(db, patientUserId, "Patient");
  const [diagnosisEntries, diagnosisSupports] = await Promise.all([
    db.prepare(
      `SELECT id, patient_user_id, code, submitted_by_user_id, submitted_by_name, self_reported, note, status, created_at, updated_at
       FROM health_insurance_diagnosis_entries WHERE patient_user_id = ? AND status = 'active' ORDER BY updated_at DESC`,
    ).bind(patientUserId).all<DiagnosisEntryRow>(),
    db.prepare(
      `SELECT s.diagnosis_entry_id, s.supporter_user_id, s.supporter_name, s.created_at
       FROM health_insurance_diagnosis_supports s
       JOIN health_insurance_diagnosis_entries d ON d.id = s.diagnosis_entry_id
       WHERE d.patient_user_id = ? AND d.status = 'active'
       ORDER BY s.created_at`,
    ).bind(patientUserId).all<DiagnosisSupportRow>(),
  ]);
  return {
    patient: {
      user_id: patient.user_id,
      name: patient.name,
      is_self: patient.user_id === viewerUserId,
    },
    diagnoses: normalizeCollaborativeDiagnoses(diagnosisEntries.results, diagnosisSupports.results, viewerUserId),
    diagnosis_reference_version: HEALTH_DIAGNOSIS_REFERENCE_VERSION,
    code_catalog: {
      diagnoses: DIAGNOSIS_CATALOG,
    },
  };
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildHistory(
  claims: Array<Record<string, unknown>>,
  appointments: AppointmentRow[],
  profileUpdates: ProfileUpdateRow[],
  analyses: Array<ReturnType<typeof normalizeAnalysis>>,
  collaborativeDiagnoses: Array<ReturnType<typeof normalizeCollaborativeDiagnoses>[number]>,
) {
  return [
    ...profileUpdates.map((update) => ({
      id: update.id,
      event_type: "profile_update",
      occurred_at: update.created_at,
      title: "Health profile updated",
      summary: update.issue_summary || "Profile details updated.",
      metadata: {
        program: update.program,
        coverage_effective_date: update.coverage_effective_date,
        suspected_diagnosis_codes: parseJsonArray(update.suspected_diagnoses_json),
      },
    })),
    ...claims.map((claim) => ({
      id: String(claim.id),
      event_type: "claim",
      occurred_at: String(claim.submitted_at),
      title: "Claim codes recorded",
      summary: String(claim.issue_summary || ""),
      metadata: {
        status: String(claim.status),
        coverage_determination: String(claim.coverage_determination),
        diagnosis_codes: claim.diagnosis_codes,
        suspected_diagnosis_codes: claim.suspected_diagnosis_codes,
        line_codes: (claim.line_details as Array<{ code: string; label: string }>).map((line) => `${line.code} ${line.label}`),
      },
    })),
    ...appointments.map((appointment) => ({
      id: appointment.id,
      event_type: "appointment",
      occurred_at: appointment.requested_at,
      title: `${appointment.service_name} appointment ${label(appointment.status)}`,
      summary: `${appointment.starts_at} to ${appointment.ends_at}`,
      metadata: {
        service_id: appointment.service_id,
        status: appointment.status,
      },
    })),
    ...analyses.map((analysis) => ({
      id: analysis.id,
      event_type: "analysis",
      occurred_at: analysis.requested_at,
      title: `${label(analysis.analysis_kind)} analysis`,
      summary: analysis.summary.headline,
      metadata: {
        status: analysis.status,
        findings: analysis.summary.findings,
      },
    })),
    ...collaborativeDiagnoses.map((diagnosis) => ({
      id: diagnosis.id,
      event_type: "diagnosis",
      occurred_at: diagnosis.updated_at,
      title: `${diagnosis.code} ${diagnosis.label}`,
      summary: diagnosis.note || `Approved by ${diagnosis.supporter_count} member${diagnosis.supporter_count === 1 ? "" : "s"}.`,
      metadata: {
        supporter_count: diagnosis.supporter_count,
        supporters: diagnosis.supporters.map((supporter) => supporter.supporter_name),
        self_reported: diagnosis.self_reported,
      },
    })),
  ].sort((left, right) => String(right.occurred_at).localeCompare(String(left.occurred_at)));
}

function normalizeAnalysis(row: AnalysisRow) {
  const summary = JSON.parse(row.summary_json) as { headline: string; findings: string[]; next_steps: string[] };
  return {
    id: row.id,
    analysis_kind: row.analysis_kind,
    status: row.status,
    summary,
    requested_at: row.requested_at,
    completed_at: row.completed_at,
    updated_at: row.updated_at,
  };
}

export async function healthInsuranceDashboard(db: D1Database, userId: string) {
  const [enrollment, claims, services, hours, appointments, profileUpdates, analyses, diagnosisEntries, diagnosisSupports] = await Promise.all([
    db.prepare(
      `SELECT user_id, program, coverage_effective_date, status, suspected_diagnoses_json, issue_summary
       FROM health_insurance_enrollments WHERE user_id = ?`,
    ).bind(userId).first<Record<string, unknown>>(),
    db.prepare("SELECT id FROM health_insurance_claims WHERE user_id = ? ORDER BY submitted_at DESC").bind(userId).all<{ id: string }>(),
    db.prepare("SELECT id, name, description, timezone, slot_minutes, capacity_per_slot, available_to_all FROM health_insurance_services WHERE active = 1 ORDER BY name").all<ServiceRow>(),
    db.prepare("SELECT service_id, weekday, starts_at, ends_at FROM health_insurance_service_hours ORDER BY service_id, weekday").all<ServiceHoursRow>(),
    db.prepare(
      `SELECT a.id, a.service_id, s.name AS service_name, a.starts_at, a.ends_at, a.status, a.requested_at
       FROM health_insurance_appointments a JOIN health_insurance_services s ON s.id = a.service_id
       WHERE a.user_id = ? ORDER BY a.starts_at DESC`,
    ).bind(userId).all<AppointmentRow>(),
    db.prepare(
      `SELECT id, program, coverage_effective_date, suspected_diagnoses_json, issue_summary, attested_at, created_at
       FROM health_insurance_profile_updates WHERE user_id = ? ORDER BY created_at DESC`,
    ).bind(userId).all<ProfileUpdateRow>(),
    db.prepare(
      `SELECT id, analysis_kind, status, summary_json, requested_at, completed_at, updated_at
       FROM health_insurance_analysis_runs WHERE user_id = ? ORDER BY requested_at DESC`,
    ).bind(userId).all<AnalysisRow>(),
    db.prepare(
      `SELECT id, patient_user_id, code, submitted_by_user_id, submitted_by_name, self_reported, note, status, created_at, updated_at
       FROM health_insurance_diagnosis_entries WHERE patient_user_id = ? AND status = 'active' ORDER BY updated_at DESC`,
    ).bind(userId).all<DiagnosisEntryRow>(),
    db.prepare(
      `SELECT s.diagnosis_entry_id, s.supporter_user_id, s.supporter_name, s.created_at
       FROM health_insurance_diagnosis_supports s
       JOIN health_insurance_diagnosis_entries d ON d.id = s.diagnosis_entry_id
       WHERE d.patient_user_id = ? AND d.status = 'active'
       ORDER BY s.created_at`,
    ).bind(userId).all<DiagnosisSupportRow>(),
  ]);
  const fullClaims = (await Promise.all(claims.results.map((row) => healthInsuranceClaim(db, userId, row.id)))).filter(Boolean) as Array<Record<string, unknown>>;
  const normalizedAnalyses = analyses.results.map(normalizeAnalysis);
  const collaborativeDiagnoses = normalizeCollaborativeDiagnoses(diagnosisEntries.results, diagnosisSupports.results, userId);
  const normalizedEnrollment = enrollment ? {
    ...enrollment,
    suspected_diagnosis_codes: parseJsonArray(enrollment.suspected_diagnoses_json),
    suspected_diagnosis_details: diagnosisSummaries(parseJsonArray(enrollment.suspected_diagnoses_json)),
    issue_summary: String(enrollment.issue_summary || ""),
  } : null;
  return {
    enrollment: normalizedEnrollment,
    claims: fullClaims,
    services: services.results.map((service) => ({
      ...service,
      available_to_all: Boolean(service.available_to_all),
      hours: hours.results.filter((item) => item.service_id === service.id),
    })),
    appointments: appointments.results,
    collaborative_diagnoses: collaborativeDiagnoses,
    profile_updates: profileUpdates.results.map((update) => ({
      ...update,
      suspected_diagnosis_codes: parseJsonArray(update.suspected_diagnoses_json),
      suspected_diagnosis_details: diagnosisSummaries(parseJsonArray(update.suspected_diagnoses_json)),
    })),
    analyses: normalizedAnalyses,
    history: buildHistory(fullClaims, appointments.results, profileUpdates.results, normalizedAnalyses, collaborativeDiagnoses),
    code_reference_version: HEALTH_INSURANCE_CODE_REFERENCE_VERSION,
    diagnosis_reference_version: HEALTH_DIAGNOSIS_REFERENCE_VERSION,
    service_access: "Every member can use published services directly through this record.",
    code_catalog: {
      diagnoses: DIAGNOSIS_CATALOG,
      claim_codes: CLAIM_CODE_CATALOG,
    },
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
