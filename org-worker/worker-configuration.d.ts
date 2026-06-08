interface Env {
  DB: D1Database;
  PIDP_BASE_URL?: string;
  PUBLIC_PORTAL_BASE_URL?: string;
  ORG_INGEST_TOKEN?: string;
  ADMIN_EMAILS?: string;
  ADMIN_USER_IDS?: string;
  ORG_MATRIX_HOMESERVER_URL?: string;
  ORG_MATRIX_SERVER_NAME?: string;
  ORG_MATRIX_ADMIN_TOKEN?: string;
  ORG_MATRIX_PASSWORD_SECRET?: string;
}
