#!/usr/bin/env node

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("../node_modules/playwright"));
}

function env(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function trimBase(url) {
  return String(url || "").replace(/\/+$/, "");
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function calculateAge(birthDate, asOfDate = todayDate()) {
  const birth = new Date(`${birthDate}T00:00:00.000Z`);
  const asOf = new Date(`${asOfDate}T00:00:00.000Z`);
  let age = asOf.getUTCFullYear() - birth.getUTCFullYear();
  const birthdayNotReached =
    asOf.getUTCMonth() < birth.getUTCMonth() ||
    (asOf.getUTCMonth() === birth.getUTCMonth() && asOf.getUTCDate() < birth.getUTCDate());
  if (birthdayNotReached) age -= 1;
  return age;
}

async function readJson(response, action) {
  const text = await response.text().catch(() => "");
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const detail =
      (payload && typeof payload === "object" && payload.detail) ||
      (typeof payload === "string" ? payload : "") ||
      `${action} failed (${response.status})`;
    throw new Error(String(detail));
  }
  return payload;
}

async function registerUser(pidpBaseUrl, email, password, fullName) {
  const response = await fetch(`${pidpBaseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, full_name: fullName }),
  });
  if (response.status === 409) return;
  await readJson(response, "register user");
}

async function loginUser(pidpBaseUrl, email, password) {
  const body = new URLSearchParams();
  body.set("username", email);
  body.set("password", password);
  const response = await fetch(`${pidpBaseUrl}/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await readJson(response, "login user");
  const accessToken = String(payload?.access_token || "").trim();
  if (!accessToken) throw new Error("login succeeded but access_token was empty");
  return accessToken;
}

async function updateProfile(pidpBaseUrl, token, fullName, birthDate) {
  const response = await fetch(`${pidpBaseUrl}/auth/me`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      full_name: fullName,
      display_name: fullName,
      first_name: fullName.split(/\s+/)[0] || fullName,
      last_name: fullName.split(/\s+/).slice(1).join(" ") || null,
      birth_date: birthDate,
    }),
  });
  return readJson(response, "update profile");
}

async function fetchMe(pidpBaseUrl, token) {
  const response = await fetch(`${pidpBaseUrl}/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return readJson(response, "fetch profile");
}

async function orgFetchJson(orgApiBaseUrl, token, path, init = {}) {
  const response = await fetch(`${orgApiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      authorization: `Bearer ${token}`,
    },
  });
  return readJson(response, path);
}

async function bootstrapPortalSession(page, token) {
  const exchange = await page.evaluate(async (accessToken) => {
    const response = await fetch("/pidp/auth/session/exchange", {
      method: "POST",
      credentials: "include",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return { ok: response.ok, status: response.status, text: await response.text() };
  }, token);
  if (!exchange.ok) {
    throw new Error(`session exchange failed (${exchange.status}): ${exchange.text}`);
  }
}

async function verifyBrowserLifeAndProperty(portalBaseUrl, token, birthday, expectedAge, nextOfKinName, nextOfKinRelationship) {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${portalBaseUrl}/`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await bootstrapPortalSession(page, token);

    await page.goto(`${portalBaseUrl}/life-insurance`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByRole("heading", { name: "Protect the people you name" }).waitFor({ timeout: 30_000 });
    await page.getByTestId("insurance-profile-birthday").waitFor({ timeout: 10_000 });
    const birthdayCard = await page.getByTestId("insurance-profile-birthday").innerText();
    const ageCard = await page.getByTestId("insurance-derived-age").innerText();
    if (!birthdayCard.includes(birthday)) {
      throw new Error(`life-insurance page did not show profile birthday ${birthday}`);
    }
    if (!ageCard.includes(String(expectedAge))) {
      throw new Error(`life-insurance page did not show derived age ${expectedAge}`);
    }
    if (await page.locator("#insurance-age").count()) {
      throw new Error("life-insurance page still renders a separate age input");
    }

    await page.getByRole("combobox", { name: "Next of kin (required)" }).fill(nextOfKinName);
    await page.locator("#insurance-next-of-kin-results").getByRole("option", { name: nextOfKinName }).click();
    await page.locator("#insurance-next-of-kin-relationship").fill(nextOfKinRelationship);
    await page.locator("#insurance-enrollment-attestation").check();
    await page.getByRole("button", { name: "Save enrollment" }).click();
    await page.getByText("Enrollment saved. Your beneficiary selection is now active.").waitFor({ timeout: 30_000 });

    await page.goto(`${portalBaseUrl}/health-insurance`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByRole("heading", { name: "Health record and code intake" }).waitFor({ timeout: 30_000 });

    await page.goto(`${portalBaseUrl}/property-casualty-insurance`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByRole("heading", { name: "Property and casualty insurance" }).waitFor({ timeout: 30_000 });
    await page.getByLabel("Coverage class").selectOption("bundle");
    await page.getByLabel("Covered asset or operation").fill("Contract smoke warehouse");
    await page.getByLabel("Replacement value (DEM)").fill("12000");
    await page.getByLabel("Deductible (DEM)").fill("500");
    await page.getByLabel("Stewardship and risk controls").fill("Smoke-test controls and incident review.");
    await page.getByRole("checkbox", { name: /administered in Dena within the DENNA system/i }).check();
    await page.getByRole("button", { name: "Save coverage intake" }).click();
    await page.getByText(/Coverage intake saved\./).waitFor({ timeout: 30_000 });

    await page.getByLabel("Incident date").fill(todayDate());
    await page.getByLabel("Requested reserve (DEM)").fill("6800");
    await page.getByLabel("Incident narrative").fill("Smoke-test incident narrative.");
    await page.getByRole("checkbox", { name: /ready for DENNA reserve review/i }).check();
    await page.getByRole("button", { name: "Stage claim intake" }).click();
    await page.getByText(/Claim intake staged\./).waitFor({ timeout: 30_000 });
  } finally {
    await browser.close();
  }
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log("Verifies PIdP birthday persistence and the insurance portal contract against deployed Cloudflare origins.");
    process.exit(0);
  }

  const portalBaseUrl = trimBase(env("VERIFY_PORTAL_BASE_URL", "https://codecollective.us/p"));
  const pidpBaseUrl = trimBase(env("VERIFY_PIDP_BASE_URL", "https://id.codecollective.us"));
  const orgApiBaseUrl = trimBase(env("VERIFY_ORG_API_BASE_URL", "https://codecollective.us/api/org"));
  const timestamp = Date.now();
  const primaryBirthday = env("VERIFY_PRIMARY_BIRTHDAY", "1990-04-15");
  const secondaryBirthday = env("VERIFY_SECONDARY_BIRTHDAY", "1988-02-09");
  const primaryAge = calculateAge(primaryBirthday);
  const password = env("VERIFY_SMOKE_PASSWORD", `PortalSmoke!${timestamp}`);
  const primary = {
    email: `insurance-birthday-gate-a-${timestamp}@example.com`,
    fullName: "Insurance Birthday Gate A",
  };
  const secondary = {
    email: `insurance-birthday-gate-b-${timestamp}@example.com`,
    fullName: "Insurance Birthday Gate B",
  };

  await registerUser(pidpBaseUrl, primary.email, password, primary.fullName);
  await registerUser(pidpBaseUrl, secondary.email, password, secondary.fullName);
  const primaryToken = await loginUser(pidpBaseUrl, primary.email, password);
  const secondaryToken = await loginUser(pidpBaseUrl, secondary.email, password);

  await updateProfile(pidpBaseUrl, primaryToken, primary.fullName, primaryBirthday);
  await updateProfile(pidpBaseUrl, secondaryToken, secondary.fullName, secondaryBirthday);

  const primaryProfile = await fetchMe(pidpBaseUrl, primaryToken);
  const secondaryProfile = await fetchMe(pidpBaseUrl, secondaryToken);
  const persistedBirthday = primaryProfile?.identity_data?.birth_date || null;
  if (persistedBirthday !== primaryBirthday) {
    throw new Error(`profile birthday mismatch: expected ${primaryBirthday}, got ${persistedBirthday}`);
  }

  await orgFetchJson(orgApiBaseUrl, primaryToken, "/api/life-insurance");
  await orgFetchJson(orgApiBaseUrl, secondaryToken, "/api/life-insurance");
  const primaryDashboard = await orgFetchJson(orgApiBaseUrl, primaryToken, "/api/life-insurance");
  const nextOfKin = Array.isArray(primaryDashboard?.members)
    ? primaryDashboard.members.find((member) => member.user_id === secondaryProfile.id)
    : null;
  const fallbackKin = Array.isArray(primaryDashboard?.members)
    ? primaryDashboard.members.find((member) => member.user_id && member.user_id !== primaryProfile.id)
    : null;
  const selectedKin = nextOfKin || fallbackKin;
  if (!selectedKin?.user_id || !selectedKin?.name) {
    throw new Error("life-insurance dashboard did not expose another member account for next-of-kin selection");
  }

  await verifyBrowserLifeAndProperty(
    portalBaseUrl,
    primaryToken,
    primaryBirthday,
    primaryAge,
    selectedKin.name,
    "Sibling",
  );

  const enrolledLifeDashboard = await orgFetchJson(orgApiBaseUrl, primaryToken, "/api/life-insurance");
  if (enrolledLifeDashboard?.profile_birth_date !== primaryBirthday) {
    throw new Error(`life-insurance API profile_birth_date mismatch: expected ${primaryBirthday}, got ${enrolledLifeDashboard?.profile_birth_date}`);
  }
  if (enrolledLifeDashboard?.enrollment?.birth_date !== primaryBirthday) {
    throw new Error(`life-insurance enrollment birthday mismatch: expected ${primaryBirthday}, got ${enrolledLifeDashboard?.enrollment?.birth_date}`);
  }
  if (Number(enrolledLifeDashboard?.enrollment?.confirmed_age) !== primaryAge) {
    throw new Error(`life-insurance confirmed_age mismatch: expected ${primaryAge}, got ${enrolledLifeDashboard?.enrollment?.confirmed_age}`);
  }

  const healthDashboard = await orgFetchJson(orgApiBaseUrl, primaryToken, "/api/health-insurance");
  const diagnosisCode = healthDashboard?.code_catalog?.diagnoses?.[0]?.code;
  if (!diagnosisCode) {
    throw new Error("health-insurance API did not expose a diagnosis catalog");
  }
  const healthEnrollment = await orgFetchJson(orgApiBaseUrl, primaryToken, "/api/health-insurance/enrollment", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      program: "standard",
      coverage_effective_date: todayDate(),
      suspected_diagnosis_codes: [diagnosisCode],
      issue_summary: "Insurance birthday gate smoke enrollment.",
      attested: true,
    }),
  });
  if (!healthEnrollment?.user_id) {
    throw new Error("health-insurance enrollment did not persist");
  }

  console.log(JSON.stringify({
    portal_base_url: portalBaseUrl,
    pidp_base_url: pidpBaseUrl,
    org_api_base_url: orgApiBaseUrl,
    primary_user: primary.email,
    secondary_user: secondary.email,
    verified_birth_date: primaryBirthday,
    verified_age: primaryAge,
    next_of_kin_user_id: selectedKin.user_id,
    health_program: healthEnrollment.program,
    status: "ok",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
