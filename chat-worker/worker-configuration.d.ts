interface Env {
  DB: D1Database;
  CONTACTS_DB?: D1Database;
  CHAT_ROOMS?: DurableObjectNamespace;
  PIDP_BASE_URL: string;
  PUBLIC_PORTAL_BASE_URL?: string;
  CHAT_ALLOWED_ORIGINS?: string;
}

