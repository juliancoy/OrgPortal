interface Env {
  DB: D1Database;
  CONTACTS_DB?: D1Database;
  CHAT_ROOMS?: DurableObjectNamespace;
  PIDP_BASE_URL: string;
  PUBLIC_PORTAL_BASE_URL?: string;
  CHAT_ALLOWED_ORIGINS?: string;
  CHAT_TURN_KEY_ID?: string;
  CHAT_TURN_KEY_API_TOKEN?: string;
}
