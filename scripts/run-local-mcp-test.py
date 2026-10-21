#!/usr/bin/env python3
"""Provision a synthetic, isolated Docker stack and test ChatGPT-style MCP OAuth."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import ssl
import subprocess
import time
from urllib.request import urlopen
from uuid import uuid5, NAMESPACE_URL

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".local" / "mcp-e2e"
PROJECT = "orgportal-mcp-e2e"


def write_private(path, value):
    path.write_text(value)
    path.chmod(0o600)


def provision(pidp, port):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec, rsa

    STATE.mkdir(parents=True, exist_ok=True)
    STATE.chmod(0o700)
    secrets_path = STATE / "secrets.json"
    if not secrets_path.exists():
        key = ec.generate_private_key(ec.SECP256R1()).private_numbers()
        enc = (
            lambda n: base64.urlsafe_b64encode(n.to_bytes(32, "big"))
            .decode()
            .rstrip("=")
        )
        rsa_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        private = rsa_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode()
        public = (
            rsa_key.public_key()
            .public_bytes(
                serialization.Encoding.PEM,
                serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            .decode()
        )
        write_private(
            secrets_path,
            json.dumps(
                dict(
                    secret=secrets.token_urlsafe(48),
                    pii=base64.urlsafe_b64encode(os.urandom(32)).decode(),
                    database=secrets.token_urlsafe(32),
                    introspection=secrets.token_urlsafe(48),
                    private=private,
                    public=public,
                    jwk=dict(
                        kty="EC",
                        crv="P-256",
                        kid="local-mcp-e2e",
                        d=enc(key.private_value),
                        x=enc(key.public_numbers.x),
                        y=enc(key.public_numbers.y),
                    ),
                )
            ),
        )
    s = json.loads(secrets_path.read_text())
    base = f"https://localhost:{port}"
    resource = base + "/api/org/mcp"
    certificate = STATE / "localhost.crt"
    valid_certificate = (
        certificate.exists()
        and subprocess.run(
            [
                "openssl",
                "x509",
                "-checkend",
                "86400",
                "-noout",
                "-in",
                str(certificate),
            ],
            capture_output=True,
        ).returncode
        == 0
    )
    if not valid_certificate:
        subprocess.run(
            [
                "openssl",
                "req",
                "-x509",
                "-nodes",
                "-days",
                "30",
                "-newkey",
                "rsa:2048",
                "-keyout",
                str(STATE / "localhost.key"),
                "-out",
                str(STATE / "localhost.crt"),
                "-subj",
                "/CN=localhost",
                "-addext",
                "subjectAltName=DNS:localhost,IP:127.0.0.1",
            ],
            check=True,
            capture_output=True,
        )
        (STATE / "localhost.key").chmod(0o600)
    pidp_env = dict(
        DATABASE_URL=f'postgresql+asyncpg://fixture:{s["database"]}@db:5432/fixture',
        SECRET_KEY=s["secret"],
        PII_ENCRYPTION_KEYS=s["pii"],
        JWT_PRIVATE_KEY=s["private"],
        JWT_PUBLIC_KEY=s["public"],
        JWT_ISSUER=base + "/pidp",
        JWT_AUDIENCE="orgportal-local-mcp",
        AUTO_CREATE_TABLES="true",
        ADMIN_USER_IDS=str(uuid5(NAMESPACE_URL, "orgportal:local-developer-admin")),
        PUBLIC_BASE_URL=base + "/pidp",
        ALLOWED_ORIGINS=base,
        PORTAL_AUTH_ORIGINS=base,
        PORTAL_SSO_APP_SLUG="orgportal",
        PORTAL_CLIENTS_JSON=json.dumps(
            {
                base: dict(
                    name="Local MCP test",
                    accountApp="orgportal",
                    callbacks=["/auth/callback"],
                )
            }
        ),
        EMAIL_VERIFICATION_REQUIRED="true",
        EMAIL_VERIFICATION_DELIVERY="log",
        ENV="dev",
        MCP_OAUTH_ISSUER=base,
        MCP_OAUTH_PRIVATE_JWK=json.dumps(s["jwk"]),
        MCP_OAUTH_DYNAMIC_REGISTRATION="true",
        MCP_OAUTH_CLIENTS_JSON=json.dumps(
            {
                "fixture-bootstrap": dict(
                    name="Fixture bootstrap",
                    tokenEndpointAuthMethod="none",
                    redirectUris=["http://127.0.0.1/callback"],
                    resources=[resource],
                    scopes=["org:portal.read"],
                )
            }
        ),
        MCP_OAUTH_RESOURCES_JSON=json.dumps(
            {
                resource: dict(
                    secretHash=hashlib.sha256(s["introspection"].encode()).hexdigest()
                )
            }
        ),
        MCP_OAUTH_PORTALS_JSON=json.dumps(
            {
                resource: dict(
                    name="Local OrgPortal", loginUrl=base + "/users/mcp-connect"
                )
            }
        ),
    )
    # Isolated configuration: no production bindings, secrets, replicas, queues or service calls.
    worker = dict(
        name="orgportal-mcp-local-test",
        main="/app/src/index.ts",
        compatibility_date="2026-06-07",
        compatibility_flags=["nodejs_compat"],
        vars=dict(
            PIDP_BASE_URL=base + "/pidp",
            PUBLIC_PORTAL_BASE_URL=base,
            ORGANIZATION_REPLICA_SOURCE="",
            EMAIL_SENDING_ENABLED="false",
            CHAT_API_ORIGIN="http://127.0.0.1:8999",
            MCP_PUBLIC_URL=resource,
            MCP_RESOURCE_CONFIG_JSON="{}",
            MCP_OAUTH_ISSUER=base,
            MCP_OAUTH_JWKS_URL=base + "/.well-known/jwks.json",
            MCP_OAUTH_INTROSPECTION_URL=base + "/oauth/mcp/introspect",
            MCP_OAUTH_INTROSPECTION_SECRET=s["introspection"],
            MCP_SUBJECT_MAP_JSON="{}",
            MCP_PIDP_ACCOUNT_NAMESPACES_JSON='["owner"]',
        ),
        d1_databases=[
            dict(
                binding="DB",
                database_name="org",
                database_id="00000000-0000-0000-0000-000000000001",
                migrations_dir="/app/migrations",
            )
        ],
    )
    worker["vars"].pop("MCP_OAUTH_INTROSPECTION_SECRET")
    write_private(
        STATE / "worker.dev.vars",
        "MCP_OAUTH_INTROSPECTION_SECRET=" + s["introspection"] + "\n",
    )
    write_private(STATE / "worker.json", json.dumps(worker))
    proxy_headers = 'proxy_set_header Host $http_host; proxy_set_header X-Forwarded-Proto https; proxy_set_header X-Forwarded-Host "";'
    nginx = f"""events {{}}\nhttp {{ access_log off; server {{ listen {port} ssl; server_name localhost; ssl_certificate /test/localhost.crt; ssl_certificate_key /test/localhost.key;
      {proxy_headers}
      location /api/org/ {{ rewrite ^/api/org/(.*)$ /$1 break; proxy_pass https://127.0.0.1:8001; }}
      location /.well-known/oauth-protected-resource {{ proxy_pass https://127.0.0.1:8001; }}
      location /.well-known/ {{ proxy_pass http://127.0.0.1:8000; }}
      location /oauth/mcp/ {{ proxy_pass http://127.0.0.1:8000; }}
      location /pidp/ {{ rewrite ^/pidp/(.*)$ /$1 break; proxy_set_header X-Forwarded-Prefix /pidp; {proxy_headers} proxy_pass http://127.0.0.1:8000; }}
      location /chatgpt-simulator {{ proxy_pass http://127.0.0.1:8005; }}
      location / {{ proxy_pass http://127.0.0.1:5173; }}
    }} }}"""
    (STATE / "nginx.conf").write_text(nginx)
    shared_network = dict(network_mode="service:gateway", depends_on=["gateway"])

    def node_service(source, volume, command, extra=None):
        return dict(
            dict(
                image="node:22-bookworm-slim",
                working_dir="/app",
                volumes=[
                    f"{ROOT/source}:/app",
                    f'{ROOT/"shared"}:/shared:ro',
                    f"{STATE}:/test:ro",
                    f"{volume}:/app/node_modules",
                ],
                command=["sh", "-ec", command],
                **shared_network,
            ),
            **(extra or {}),
        )

    services = dict(
        gateway=dict(
            image="nginx:alpine",
            ports=[f"127.0.0.1:{port}:{port}"],
            volumes=[
                f"{STATE}:/test:ro",
                f'{STATE/"nginx.conf"}:/etc/nginx/nginx.conf:ro',
            ],
        ),
        db=dict(
            image="postgres:15-alpine",
            environment=dict(
                POSTGRES_USER="fixture",
                POSTGRES_PASSWORD=s["database"],
                POSTGRES_DB="fixture",
            ),
            volumes=["identity-db:/var/lib/postgresql/data"],
            healthcheck=dict(
                test=["CMD-SHELL", "pg_isready -U fixture -d fixture"],
                interval="2s",
                timeout="2s",
                retries=40,
            ),
        ),
        identity=dict(
            image="python:3.11-slim",
            working_dir="/tmp",
            environment=pidp_env,
            volumes=[f"{pidp}:/app:ro", "identity-venv:/venv"],
            command=[
                "sh",
                "-ec",
                'python -m venv /venv; /venv/bin/pip install -q -r /app/requirements.txt; exec /venv/bin/uvicorn main:app --app-dir /app --host 0.0.0.0 --port 8000 --no-access-log --forwarded-allow-ips "*"',
            ],
            network_mode="service:gateway",
            depends_on=dict(
                gateway=dict(condition="service_started"),
                db=dict(condition="service_healthy"),
            ),
        ),
        worker=node_service(
            "org-worker",
            "worker-deps",
            "npm ci --ignore-scripts; npm run build:metadata; cp /test/worker.json /test/worker.dev.vars /test-worker-data/; mv /test-worker-data/worker.dev.vars /test-worker-data/.dev.vars; npx wrangler d1 migrations apply org --local --config /test-worker-data/worker.json; exec npx wrangler dev --local --config /test-worker-data/worker.json --ip 0.0.0.0 --port 8001 --local-protocol https --https-cert-path /test/localhost.crt --https-key-path /test/localhost.key",
            dict(
                environment=dict(
                    NODE_EXTRA_CA_CERTS="/test/localhost.crt",
                    WRANGLER_SEND_METRICS="false",
                ),
                volumes=[
                    f'{ROOT/"org-worker"}:/app',
                    f'{ROOT/"shared"}:/shared:ro',
                    f'{ROOT/"docs"}:/docs:ro',
                    f"{STATE}:/test:ro",
                    "worker-deps:/app/node_modules",
                    "worker-data:/test-worker-data",
                ],
            ),
        ),
        web=node_service(
            "web",
            "web-deps",
            "npm ci; exec npm run dev -- --host 0.0.0.0 --port 5173 --strictPort",
            dict(
                environment=dict(
                    VITE_PIDP_BASE_URL="/pidp",
                    VITE_PIDP_APP_SLUG="orgportal",
                    VITE_PUBLIC_BASE="/",
                    ORG_API_ORIGIN="http://127.0.0.1:8001",
                    CHAT_API_ORIGIN="http://127.0.0.1:8999",
                    VITE_ALLOWED_HOSTS="localhost",
                )
            ),
        ),
        simulator=dict(
            image="node:22-bookworm-slim",
            volumes=[f'{ROOT/"scripts/mcp-local"}:/simulator:ro', f"{STATE}:/test:ro"],
            environment=dict(
                LOCAL_MCP_BASE=base, NODE_EXTRA_CA_CERTS="/test/localhost.crt"
            ),
            command=["node", "/simulator/chatgpt-client.mjs"],
            **shared_network,
        ),
    )
    # Keep SQLite state inside a dedicated volume; never write the checkout's replica.
    services["worker"]["command"][2] = services["worker"]["command"][2].replace(
        "--local --config", "--local --persist-to /test-worker-data --config"
    )
    config = dict(
        services=services,
        volumes={
            name: {}
            for name in [
                "identity-db",
                "identity-venv",
                "worker-deps",
                "worker-data",
                "web-deps",
            ]
        },
    )
    write_private(STATE / "compose.json", json.dumps(config))
    return base


def compose(*args):
    subprocess.run(
        [
            "docker",
            "compose",
            "--project-name",
            PROJECT,
            "--file",
            str(STATE / "compose.json"),
            *args,
        ],
        check=True,
    )


def wait(base, path):
    for _ in range(180):
        try:
            with urlopen(
                base + path,
                context=ssl.create_default_context(cafile=str(STATE / "localhost.crt")),
                timeout=3,
            ) as r:
                if r.status == 200:
                    return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError(
        f"Local service not ready: {path}. Inspect the isolated compose logs."
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pidp-dir", type=Path, default=ROOT.parent / "PIdP")
    parser.add_argument("--port", type=int, default=9446)
    parser.add_argument(
        "--stop",
        action="store_true",
        help="Remove this dedicated test stack and its synthetic data volumes.",
    )
    parser.add_argument("--start-only", action="store_true")
    args = parser.parse_args()
    context = subprocess.check_output(
        ["docker", "context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"],
        text=True,
    )
    if not (os.getenv("DOCKER_HOST") or json.loads(context)).startswith("unix://"):
        parser.error("A local Docker socket is required")
    if args.stop:
        compose("down", "--volumes", "--remove-orphans")
        import shutil

        shutil.rmtree(STATE)
        return
    if not (args.pidp_dir / "main.py").is_file():
        parser.error("--pidp-dir must point to the local PIdP source checkout")
    if not 1024 <= args.port <= 65535:
        parser.error("Use an unprivileged local port")
    base = provision(args.pidp_dir.resolve(), args.port)
    compose("up", "-d")
    compose("exec", "-T", "gateway", "nginx", "-s", "reload")
    for path in [
        "/pidp/health",
        "/api/org/health",
        "/",
        ".well-known/oauth-authorization-server",
    ]:
        wait(base, "/" + path.lstrip("/"))
    compose(
        "exec",
        "-T",
        "identity",
        "/venv/bin/python",
        "/app/scripts/register_local_portal.py",
    )
    # Trust only the actual local portal namespace, obtained from its registered app.
    query = """import asyncio
from db import SessionLocal, engine
from models import Website
from sqlalchemy import select
async def read():
    async with SessionLocal() as db:
        print((await db.execute(select(Website.id).where(Website.slug == 'orgportal'))).scalar_one())
    await engine.dispose()
asyncio.run(read())
"""
    identity_id = subprocess.check_output(
        [
            "docker",
            "compose",
            "-p",
            PROJECT,
            "-f",
            str(STATE / "compose.json"),
            "exec",
            "-T",
            "-w",
            "/app",
            "identity",
            "/venv/bin/python",
            "-c",
            query,
        ],
        text=True,
    ).strip()
    from uuid import UUID

    identity_id = str(UUID(identity_id))
    worker = json.loads((STATE / "worker.json").read_text())
    worker["vars"]["MCP_PIDP_ACCOUNT_NAMESPACES_JSON"] = json.dumps(
        ["owner", "website:" + identity_id]
    )
    write_private(STATE / "worker.json", json.dumps(worker))
    compose(
        "exec",
        "-T",
        "worker",
        "cp",
        "/test/worker.json",
        "/test-worker-data/worker.json",
    )
    compose("restart", "simulator")
    print("Local MCP simulator: " + base + "/chatgpt-simulator", flush=True)
    if not args.start_only:
        subprocess.run(
            ["node", str(ROOT / "web/scripts/test-local-mcp.mjs")],
            env={
                **os.environ,
                "LOCAL_MCP_BASE": base,
                "LOCAL_MCP_PROJECT": PROJECT,
                "LOCAL_MCP_COMPOSE": str(STATE / "compose.json"),
            },
            check=True,
            cwd=ROOT / "web",
            timeout=240,
        )


if __name__ == "__main__":
    main()
