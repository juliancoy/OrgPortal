import { z } from "zod";

const identifier = z.string().trim().min(1).max(200);
const httpsUrl = z.string().url().max(2000).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "HTTPS URL required");
export const eventUpdateSchema = z.object({
  name: z.string().trim().min(1).max(500).optional(),
  startAt: z.string().datetime({ offset: true }).optional(),
  endAt: z.string().datetime({ offset: true }).optional(),
  timezone: z.string().max(100).refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }, "Invalid IANA timezone").optional(),
  descriptionMarkdown: z.string().max(20000).optional(),
  coverUrl: httpsUrl.optional(),
  tintColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  visibility: z.enum(["public", "members-only", "private"]).optional(),
  registrationOpen: z.boolean().optional(),
  suppressNotifications: z.boolean().optional(),
}).strict();
export const collaboratorSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().trim().min(1).max(200).optional(),
  accessLevel: z.enum(["none", "check-in", "manager"]),
  isVisible: z.boolean(),
}).strict();
export const eventTargetSchema = z.object({ organizationId: identifier, eventId: identifier }).strict();
export const eventPlanSchema = eventTargetSchema.extend({
  update: eventUpdateSchema.optional(),
  applyBranding: z.boolean().default(false),
  collaborator: collaboratorSchema.optional(),
  confirm: z.boolean().default(false),
  previewId: z.string().uuid().optional(),
}).strict().refine((plan) => plan.applyBranding || plan.collaborator || Object.keys(plan.update || {}).length,
  "At least one change is required");
export type EventUpdate = z.infer<typeof eventUpdateSchema>;
export type Collaborator = z.infer<typeof collaboratorSchema>;
export type EventPlan = z.infer<typeof eventPlanSchema>;
export type ManagedEvent = {
  id: string; name: string; startAt: string; endAt: string; timezone: string;
  coverUrl?: string; descriptionMarkdown?: string; url?: string;
  visibility?: string; registrationOpen?: boolean;
};
export interface EventProvider {
  list(cursor?: string): Promise<{ events: ManagedEvent[]; nextCursor?: string }>;
  get(eventId: string): Promise<ManagedEvent>;
  validateUpdate(update: EventUpdate): void;
  update(eventId: string, update: EventUpdate): Promise<void>;
  addCollaborator(eventId: string, collaborator: Collaborator): Promise<void>;
}
export class EventIntegrationError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export const integrationSchema = z.object({
  provider: identifier,
  calendarId: identifier,
  apiKeyBinding: z.string().regex(/^EVENT_KEY_[A-Z0-9_]+$/),
  branding: z.object({
    coverUrl: httpsUrl.optional(),
    tintColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    sourceUrl: httpsUrl,
    revision: z.string().min(1).max(200),
  }).strict().optional(),
}).strict();
export type EventIntegration = z.infer<typeof integrationSchema>;
type ProviderFactory = (config: EventIntegration, apiKey: string) => EventProvider;
// New platforms implement the same contract; callers cannot supply endpoints or credentials.
export const eventProviders = new Map<string, ProviderFactory>();
export function configuredProvider(env: Env, organizationId: string) {
  let config: EventIntegration;
  try {
    const all = JSON.parse(env.EVENT_INTEGRATIONS_JSON || "{}");
    if (!Object.hasOwn(all, organizationId)) throw new Error();
    config = integrationSchema.parse(all[organizationId]);
  } catch { throw new EventIntegrationError(503, "Event integration is not configured for this organization"); }
  const factory = eventProviders.get(config.provider);
  const apiKey = (env as unknown as Record<string, unknown>)[config.apiKeyBinding];
  if (!factory || typeof apiKey !== "string" || !apiKey) {
    throw new EventIntegrationError(503, "Event provider is not configured");
  }
  return { config, provider: factory(config, apiKey) };
}
export async function executeEventPlan(provider: EventProvider, config: EventIntegration, input: unknown, beforeWrite?: (preview: unknown) => Promise<void>) {
  const plan = eventPlanSchema.parse(input);
  const update = { ...plan.update };
  if (plan.applyBranding) {
    if (!config.branding || (!config.branding.coverUrl && !config.branding.tintColor)) {
      throw new EventIntegrationError(409, "No approved branding is configured");
    }
    if (config.branding.coverUrl) update.coverUrl = config.branding.coverUrl;
    if (config.branding.tintColor) update.tintColor = config.branding.tintColor;
  }
  provider.validateUpdate(update);
  const before = await provider.get(plan.eventId); // Must enforce provider calendar ownership.
  const start = Date.parse(update.startAt ?? before.startAt);
  const end = Date.parse(update.endAt ?? before.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new EventIntegrationError(400, "Event end must be after start");
  }
  const preview = { before, update, collaborator: plan.collaborator,
    branding: plan.applyBranding ? config.branding : undefined };
  if (!plan.confirm) return { dryRun: true, ...preview };
  if (beforeWrite) await beforeWrite({ dryRun: true, ...preview });
  const completed: string[] = [];
  try {
    if (Object.keys(update).length) { await provider.update(plan.eventId, update); completed.push("update"); }
    if (plan.collaborator) { await provider.addCollaborator(plan.eventId, plan.collaborator); completed.push("collaborator"); }
  } catch {
    // Upstream writes are not transactional and a network timeout has an unknown outcome.
    return { dryRun: false, success: false, completed, outcomeUncertain: true,
      message: "Provider operation failed. Inspect the event before retrying; earlier operations may have completed." };
  }
  return { dryRun: false, success: true, completed, ...preview };
}

export class LumaEventProvider implements EventProvider {
  constructor(private config: EventIntegration, private apiKey: string, private fetcher: typeof fetch = fetch) {}
  private async request(path: string, body?: unknown): Promise<any> {
    let response: Response;
    try {
      response = await this.fetcher(`https://public-api.luma.com/v1/${path}`, {
        method: body === undefined ? "GET" : "POST", redirect: "error",
        headers: { "x-luma-api-key": this.apiKey, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
      });
    } catch { throw new EventIntegrationError(502, "Event provider request failed"); }
    if (!response.ok) throw new EventIntegrationError(502, `Event provider returned HTTP ${response.status}`);
    try { return await response.json(); } catch { throw new EventIntegrationError(502, "Invalid event provider response"); }
  }
  private normalize(event: any): ManagedEvent {
    return { id: event.id, name: event.name, startAt: event.start_at, endAt: event.end_at,
      timezone: event.timezone, coverUrl: event.cover_url, descriptionMarkdown: event.description_md, url: event.url,
      visibility: event.visibility, registrationOpen: event.registration_open };
  }
  async list(cursor?: string) {
    const query = new URLSearchParams({ access: "manage", pagination_limit: "50" });
    if (cursor) query.set("pagination_cursor", cursor);
    const result = await this.request(`calendars/events/list?${query}`);
    if (!Array.isArray(result.entries)) throw new EventIntegrationError(502, "Invalid event provider response");
    return { events: result.entries.filter((e: any) => e.calendar_id === this.config.calendarId && e.access === "manage").map((e: any) => this.normalize(e)),
      nextCursor: result.has_more ? result.next_cursor : undefined };
  }
  async get(eventId: string) {
    const event = await this.request(`events/get?${new URLSearchParams({ event_id: eventId })}`);
    if (event.calendar_id !== this.config.calendarId || event.access !== "manage") {
      throw new EventIntegrationError(403, "Event is not managed by this organization's calendar");
    }
    return this.normalize(event);
  }
  validateUpdate(update: EventUpdate) {
    eventUpdateSchema.parse(update);
    if (update.coverUrl && new URL(update.coverUrl).hostname !== "images.lumacdn.com") {
      throw new EventIntegrationError(400, "Luma cover images must already be uploaded to images.lumacdn.com");
    }
  }
  async update(eventId: string, update: EventUpdate) {
    this.validateUpdate(update);
    await this.get(eventId);
    const fields: Record<keyof EventUpdate, string> = { name: "name", startAt: "start_at", endAt: "end_at", timezone: "timezone",
      descriptionMarkdown: "description_md", coverUrl: "cover_url", tintColor: "tint_color", visibility: "visibility",
      registrationOpen: "registration_open", suppressNotifications: "suppress_notifications" };
    await this.request("events/update", { event_id: eventId,
      ...Object.fromEntries(Object.entries(update).map(([key, value]) => [fields[key as keyof EventUpdate], value])) });
  }
  async addCollaborator(eventId: string, collaborator: Collaborator) {
    collaboratorSchema.parse(collaborator);
    await this.get(eventId);
    await this.request("events/hosts/add", { event_id: eventId, email: collaborator.email, name: collaborator.name,
      access_level: collaborator.accessLevel, is_visible: collaborator.isVisible });
  }
}
eventProviders.set("luma", (config, key) => new LumaEventProvider(config, key));
