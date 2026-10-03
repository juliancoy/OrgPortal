import base64
import importlib.util
import os
import secrets
import shlex
import subprocess
import sys
import textwrap
from pathlib import Path

import docker_utils

current_dir = Path(os.path.abspath(os.path.dirname(__file__)))
web_dir = current_dir / "web"
org_worker_dir = current_dir / "org-worker"
chat_worker_dir = current_dir / "chat-worker"
pidp_dir = current_dir.parent / "pidp"
if not pidp_dir.exists():
    pidp_dir = current_dir.parent / "PIdP"
local_dir = current_dir / ".local"
local_certs_dir = local_dir / "certs"
local_nginx_conf = local_dir / "nginx.conf"
container_app_dir = "/app"

DEFAULT_PROD_IMAGE = "ghcr.io/juliancoy/orgportal:latest"
DEFAULT_DEV_IMAGE = "node:24-alpine"
DEFAULT_WORKER_IMAGE = "node:22-bookworm-slim"
DEFAULT_DATA_SOURCE = "api"
DEFAULT_LOCAL_GATEWAY_PORT = "8443"
DEFAULT_WORKER_PORT = "8001"
DEFAULT_START_PROD = False
LOCAL_GATEWAY_ALIASES = ("localhost", "127.0.0.1", "bmoremedtech-local", "bmoremedtech-local-gateway", "local-orgportal")
PINNED_PIDP_ENV_KEYS = (
    "PIDP_SECRET_KEY",
    "PIDP_PII_ENCRYPTION_KEYS",
    "PIDP_JWT_PRIVATE_KEY",
    "PIDP_JWT_PUBLIC_KEY",
    "PIDP_JWT_ISSUER",
    "PIDP_JWT_AUDIENCE",
)


def _env_truthy(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _docker_image_exists(image_ref: str) -> bool:
    proc = subprocess.run(
        ["docker", "image", "inspect", image_ref],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return proc.returncode == 0


def _set_env_default(name: str, value: str) -> None:
    if not (os.getenv(name) or "").strip():
        os.environ[name] = value


def _merge_csv_env_default(name: str, values: list[str]) -> None:
    merged: list[str] = []
    for item in (os.getenv(name) or "").split(","):
        clean = item.strip()
        if clean and clean not in merged:
            merged.append(clean)
    for value in values:
        clean = value.strip()
        if clean and clean not in merged:
            merged.append(clean)
    os.environ[name] = ",".join(merged)


def _remove_container(name: str) -> None:
    try:
        container = docker_utils.DOCKER_CLIENT.containers.get(name)
        container.stop()
        container.remove(force=True)
    except Exception:
        pass


def _parse_simple_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists() or not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'\"")
        if key:
            values[key] = value
    return values


def _ensure_env_key(path: Path, key: str, value: str) -> None:
    if not path.exists():
        path.write_text("", encoding="utf-8")
    lines = path.read_text(encoding="utf-8").splitlines()
    for raw in lines:
        stripped = raw.strip()
        if stripped.startswith("export "):
            stripped = stripped[len("export ") :].strip()
        if stripped.split("=", 1)[0].strip() == key:
            return
    suffix = "" if not lines else "\n"
    path.write_text(path.read_text(encoding="utf-8") + f"{suffix}{key}={value}\n", encoding="utf-8")


def _apply_pidp_secret_defaults() -> Path:
    selected_path = pidp_dir / ".env.pidp"
    file_values = _parse_simple_env_file(selected_path)
    if not file_values.get("PIDP_SECRET_KEY"):
        file_values["PIDP_SECRET_KEY"] = secrets.token_urlsafe(48)
        _ensure_env_key(selected_path, "PIDP_SECRET_KEY", file_values["PIDP_SECRET_KEY"])
        print(f"Generated persistent PIDP_SECRET_KEY in {selected_path}")
    if not file_values.get("PIDP_PII_ENCRYPTION_KEYS"):
        file_values["PIDP_PII_ENCRYPTION_KEYS"] = base64.urlsafe_b64encode(os.urandom(32)).decode("utf-8")
        _ensure_env_key(selected_path, "PIDP_PII_ENCRYPTION_KEYS", file_values["PIDP_PII_ENCRYPTION_KEYS"])
        print(f"Generated persistent PIDP_PII_ENCRYPTION_KEYS in {selected_path}")
    for key, value in file_values.items():
        os.environ.setdefault(key, value)
    for key in PINNED_PIDP_ENV_KEYS:
        if file_values.get(key):
            os.environ[key] = file_values[key].strip()
    if not os.getenv("PIDP_JWT_PRIVATE_KEY") and not os.getenv("PIDP_JWT_PUBLIC_KEY"):
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa

        local_dir.mkdir(parents=True, exist_ok=True)
        key_path = local_dir / "pidp-jwt-private.pem"
        if not key_path.exists():
            private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            key_path.write_bytes(private_key.private_bytes(
                serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            ))
        key_path.chmod(0o600)
        private_key = serialization.load_pem_private_key(key_path.read_bytes(), password=None)
        os.environ["PIDP_JWT_PRIVATE_KEY"] = key_path.read_text()
        os.environ["PIDP_JWT_PUBLIC_KEY"] = private_key.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode()
    return selected_path


def _wait_for_http(url: str, network_name: str, retries: int = 60, delay: int = 2, expect_status: int | None = None) -> None:
    print(f"Waiting for {url}")
    status_expr = ""
    if expect_status is not None:
        status_expr = f'test "$status" = "{expect_status}"'
    else:
        status_expr = 'test "$status" -ge 200 -a "$status" -lt 500'
    script = textwrap.dedent(
        f"""
        i=0
        while [ "$i" -lt {retries} ]; do
          status="$(curl -k -s -o /dev/null -w '%{{http_code}}' --connect-timeout 5 "$TEST_URL" || true)"
          if {status_expr}; then
            echo "Service $TEST_URL responded with $status"
            exit 0
          fi
          echo "Waiting for service at $TEST_URL (last status: $status)"
          i=$((i+1))
          sleep {delay}
        done
        echo "Timed out waiting for $TEST_URL"
        exit 1
        """
    )
    subprocess.check_call(
        [
            "docker",
            "run",
            "--rm",
            "--network",
            network_name,
            "-e",
            f"TEST_URL={url}",
            "curlimages/curl:8.4.0",
            "sh",
            "-c",
            script,
        ]
    )


def _normalize_public_base(url: str | None) -> str | None:
    value = (url or "").strip()
    if not value:
        return None
    if not value.startswith(("http://", "https://")):
        value = "https://" + value
    if not value.endswith("/"):
        value += "/"
    return value


def _derive_dev_base(prod_base: str | None) -> str | None:
    normalized = _normalize_public_base(prod_base)
    if not normalized:
        return None
    if "://portal." in normalized:
        return normalized.replace("://portal.", "://dev.portal.", 1)
    return normalized


def _host_from_base(url: str | None) -> str | None:
    normalized = _normalize_public_base(url)
    if not normalized:
        return None
    return normalized.split("://", 1)[1].strip("/") or None


def _resolve_prod_image() -> str:
    return (os.getenv("ORGPORTAL_PROD_IMAGE") or "").strip() or DEFAULT_PROD_IMAGE


def _default_pidp_base(portal_host: str | None, dev: bool = False) -> str:
    if portal_host in {"codecollective.us", "www.codecollective.us"}:
        return "https://id.codecollective.us"
    if portal_host and "." in portal_host:
        domain = portal_host.split(".", 1)[1]
        if dev:
            return f"https://dev.pidp.{domain}"
        return f"https://pidp.{domain}"
    return "https://id.codecollective.us"


def _load_pidp_editme():
    editme_path = pidp_dir / "pidp_editme.py"
    if not editme_path.exists():
        sample_path = pidp_dir / "pidp_editme.example.py"
        if sample_path.exists():
            editme_path.write_text(sample_path.read_text(encoding="utf-8"), encoding="utf-8")
        else:
            raise RuntimeError(f"PIdP configuration not found at {editme_path}")
    spec = importlib.util.spec_from_file_location("orgportal_pidp_editme", editme_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load PIdP configuration from {editme_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _pidp_env(pidp_editme, db_url: str, gateway_base: str, allowed_origins: list[str]) -> dict[str, str | None]:
    pidp_base = f"{gateway_base}/pidp"
    return {
        "DATABASE_URL": db_url,
        "SECRET_KEY": os.getenv("PIDP_SECRET_KEY", ""),
        "PII_ENCRYPTION_KEYS": os.getenv("PIDP_PII_ENCRYPTION_KEYS") or os.getenv("PII_ENCRYPTION_KEYS", ""),
        "AUTO_CREATE_TABLES": "true",
        "ADMIN_EMAILS": os.getenv("PIDP_ADMIN_EMAILS", ""),
        "ADMIN_USER_IDS": os.getenv("PIDP_ADMIN_USER_IDS", ""),
        "EMAIL_VERIFICATION_REQUIRED": os.getenv("PIDP_EMAIL_VERIFICATION_REQUIRED", "true"),
        "EMAIL_VERIFICATION_TOKEN_MINUTES": os.getenv("PIDP_EMAIL_VERIFICATION_TOKEN_MINUTES", "1440"),
        "EMAIL_VERIFICATION_DELIVERY": os.getenv("PIDP_EMAIL_VERIFICATION_DELIVERY", "log"),
        "EMAIL_FROM": os.getenv("PIDP_EMAIL_FROM", ""),
        "SMTP_HOST": os.getenv("PIDP_SMTP_HOST", ""),
        "SMTP_PORT": os.getenv("PIDP_SMTP_PORT", "587"),
        "SMTP_USERNAME": os.getenv("PIDP_SMTP_USERNAME", ""),
        "SMTP_PASSWORD": os.getenv("PIDP_SMTP_PASSWORD", ""),
        "SMTP_STARTTLS": os.getenv("PIDP_SMTP_STARTTLS", "true"),
        "GOOGLE_WORKSPACE_SMTP_USERNAME": os.getenv("PIDP_GOOGLE_WORKSPACE_SMTP_USERNAME", ""),
        "GOOGLE_WORKSPACE_SMTP_PASSWORD": os.getenv("PIDP_GOOGLE_WORKSPACE_SMTP_PASSWORD", ""),
        "GOOGLE_WORKSPACE_EMAIL_FROM": os.getenv("PIDP_GOOGLE_WORKSPACE_EMAIL_FROM", ""),
        "GOOGLE_WORKSPACE_ALLOWED_SENDERS": os.getenv("PIDP_GOOGLE_WORKSPACE_ALLOWED_SENDERS", ""),
        "FRONTEND_REDIRECT_URL": f"{pidp_base}/auth/callback",
        "GOOGLE_CLIENT_ID": getattr(pidp_editme, "PIDP_GOOGLE_CLIENT_ID", "google-client-id"),
        "GOOGLE_CLIENT_SECRET": getattr(pidp_editme, "PIDP_GOOGLE_CLIENT_SECRET", "google-client-secret"),
        "GOOGLE_REDIRECT_URI": f"{pidp_base}/auth/google/callback",
        "GITHUB_CLIENT_ID": getattr(pidp_editme, "PIDP_GITHUB_CLIENT_ID", "github-client-id"),
        "GITHUB_CLIENT_SECRET": getattr(pidp_editme, "PIDP_GITHUB_CLIENT_SECRET", "github-client-secret"),
        "GITHUB_REDIRECT_URI": f"{pidp_base}/auth/github/callback",
        "JWT_PRIVATE_KEY": os.getenv("PIDP_JWT_PRIVATE_KEY"),
        "JWT_PUBLIC_KEY": os.getenv("PIDP_JWT_PUBLIC_KEY"),
        "JWT_ISSUER": os.getenv("PIDP_JWT_ISSUER"),
        "JWT_AUDIENCE": os.getenv("PIDP_JWT_AUDIENCE"),
        "MINIO_ENDPOINT": getattr(pidp_editme, "MINIO_ENDPOINT", "http://minio:9000"),
        "MINIO_ACCESS_KEY": getattr(pidp_editme, "MINIO_ACCESS_KEY", "minio"),
        "MINIO_SECRET_KEY": getattr(pidp_editme, "MINIO_SECRET_KEY", "changeme"),
        "MINIO_BUCKET": getattr(pidp_editme, "MINIO_BUCKET", "pidp-avatars"),
        "MINIO_PUBLIC_BASE_URL": getattr(pidp_editme, "MINIO_PUBLIC_BASE_URL", f"{pidp_base}/s3"),
        "MINIO_USE_SSL": os.getenv("PIDP_MINIO_USE_SSL", os.getenv("MINIO_USE_SSL", "true")),
        "MINIO_SERVER_SIDE_ENCRYPTION": os.getenv(
            "PIDP_MINIO_SERVER_SIDE_ENCRYPTION",
            os.getenv("MINIO_SERVER_SIDE_ENCRYPTION", "AES256"),
        ),
        "ENV": "dev",
        "ALLOWED_ORIGINS": ",".join(allowed_origins),
        "ALLOWED_NATIVE_REDIRECT_SCHEMES": os.getenv("PIDP_ALLOWED_NATIVE_REDIRECT_SCHEMES", "org.arkavo.portal"),
        "ALLOW_CROSS_LANE_REDIRECT": "false",
        "ACCESS_TOKEN_EXPIRE_MINUTES": (
            os.getenv("PIDP_DEV_ACCESS_TOKEN_EXPIRE_MINUTES")
            or os.getenv("PIDP_ACCESS_TOKEN_EXPIRE_MINUTES")
            or "525600"
        ),
        "WATCHFILES_FORCE_POLLING": "true",
        "BACKEND_IMAGE_RUNNING": "dev-bind-mount",
    }


def _ensure_local_tls_certificates() -> None:
    crt = local_certs_dir / "localhost.crt"
    key = local_certs_dir / "localhost.key"
    required_names = ["localhost", "bmoremedtech-local", "bmoremedtech-local-gateway", "local-orgportal"]
    if crt.exists() and key.exists():
        cert_text = subprocess.run(
            ["openssl", "x509", "-in", str(crt), "-noout", "-text"],
            check=False,
            capture_output=True,
            text=True,
        ).stdout
        if all(f"DNS:{name}" in cert_text for name in required_names):
            return

    local_certs_dir.mkdir(parents=True, exist_ok=True)
    openssl_config = local_certs_dir / "localhost-openssl.cnf"
    alt_names = "\n".join(f"DNS.{index} = {name}" for index, name in enumerate(required_names, start=1))
    openssl_config.write_text(
        textwrap.dedent(
            f"""
            [req]
            default_bits = 2048
            prompt = no
            default_md = sha256
            x509_extensions = v3_req
            distinguished_name = dn

            [dn]
            CN = localhost

            [v3_req]
            subjectAltName = @alt_names

            [alt_names]
            {alt_names}
            IP.1 = 127.0.0.1
            """
        ).strip()
        + "\n",
        encoding="utf-8",
    )
    subprocess.check_call(
        [
            "openssl",
            "req",
            "-x509",
            "-nodes",
            "-days",
            "365",
            "-newkey",
            "rsa:2048",
            "-keyout",
            str(key),
            "-out",
            str(crt),
            "-config",
            str(openssl_config),
            "-extensions",
            "v3_req",
        ]
    )
    crt.chmod(0o644)
    key.chmod(0o600)


def _write_local_gateway_config(
    dev_name: str,
    org_worker_name: str,
    pidp_dev_name: str,
    gateway_port: str,
    worker_port: str,
) -> None:
    local_dir.mkdir(parents=True, exist_ok=True)
    local_nginx_conf.write_text(
        textwrap.dedent(
            f"""
            events {{}}

            http {{
              map $http_upgrade $connection_upgrade {{
                default upgrade;
                '' close;
              }}
              server {{
                listen 8443 ssl;
                server_name localhost local-orgportal bmoremedtech-local bmoremedtech-local-gateway;

                ssl_certificate /certs/localhost.crt;
                ssl_certificate_key /certs/localhost.key;

                proxy_http_version 1.1;
                proxy_set_header Host $host;
                proxy_set_header X-Forwarded-Proto https;
                proxy_set_header X-Forwarded-Host localhost;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

                location /api/org/ {{
                  proxy_set_header X-Forwarded-Host {os.getenv("ORGPORTAL_LOCAL_TENANT_HOST", "localhost")};
                  rewrite ^/api/org/?(.*)$ /$1 break;
                  proxy_pass http://{org_worker_name}:{worker_port};
                }}

                location /api/chat/ {{
                  rewrite ^/api/chat/?(.*)$ /$1 break;
                  proxy_set_header Upgrade $http_upgrade;
                  proxy_set_header Connection $connection_upgrade;
                  proxy_read_timeout 1h;
                  proxy_send_timeout 1h;
                  proxy_pass http://{org_worker_name.removesuffix('org')}chat:8003;
                }}

                location /pidp/ {{
                  rewrite ^/pidp/?(.*)$ /$1 break;
                  proxy_set_header Host $host;
                  proxy_set_header Origin $http_origin;
                  proxy_set_header Referer $http_referer;
                  proxy_pass http://{pidp_dev_name}:8000;
                }}

                location / {{
                  proxy_set_header Host $host;
                  proxy_set_header Upgrade $http_upgrade;
                  proxy_set_header Connection $connection_upgrade;
                  proxy_read_timeout 1h;
                  proxy_send_timeout 1h;
                  proxy_buffering off;
                  add_header Cache-Control "no-store" always;
                  proxy_pass http://{dev_name}:5173;
                }}
              }}
            }}
            """
        ).lstrip(),
        encoding="utf-8",
    )


def _start_local_gateway(
    prefix: str,
    network_name: str,
    dev_name: str,
    org_worker_name: str,
    pidp_dev_name: str,
    worker_port: str,
) -> str:
    gateway_name = prefix + "local-gateway"
    gateway_port = (os.getenv("ORGPORTAL_LOCAL_GATEWAY_PORT") or DEFAULT_LOCAL_GATEWAY_PORT).strip()
    _ensure_local_tls_certificates()
    _write_local_gateway_config(dev_name, org_worker_name, pidp_dev_name, gateway_port, worker_port)

    try:
        container = docker_utils.DOCKER_CLIENT.containers.get(gateway_name)
        container.stop()
        container.remove(force=True)
    except Exception:
        pass

    docker_utils.run_container(
        {
            "image": os.getenv("ORGPORTAL_LOCAL_GATEWAY_IMAGE", "nginx:alpine"),
            "name": gateway_name,
            "network": network_name,
            "restart_policy": {"Name": "always"},
            "detach": True,
            "volumes": {
                str(local_nginx_conf): {"bind": "/etc/nginx/nginx.conf", "mode": "ro"},
                str(local_certs_dir): {"bind": "/certs", "mode": "ro"},
            },
            "ports": {"8443/tcp": int(gateway_port)},
        }
    )
    docker_utils.wait_for_port(gateway_name, 8443, network_name, retries=30, delay=2)
    return f"https://localhost:{gateway_port}"


def _start_pidp_if_available(prefix: str, network_name: str, gateway_base: str) -> bool:
    if not _env_truthy("ORGPORTAL_START_PIDP", default=True):
        print("Skipping PIdP startup because ORGPORTAL_START_PIDP is disabled")
        return False
    if not (pidp_dir / "run.py").exists():
        print(f"Skipping PIdP startup; sibling checkout not found at {pidp_dir}")
        return False

    selected_env_path = _apply_pidp_secret_defaults()
    pidp_editme = _load_pidp_editme()
    db_name = prefix + "pidpdb"
    db_user = getattr(pidp_editme, "PIDP_POSTGRES_USER", "PIdP")
    db_password = getattr(pidp_editme, "PIDP_POSTGRES_PASSWORD", "changeme")
    db_url = f"postgresql+asyncpg://{db_user}:{db_password}@{db_name}:5432/PIdP"
    gateway_port = gateway_base.rsplit(":", 1)[-1]
    allowed_origins = [f"https://{host}:{gateway_port}" for host in LOCAL_GATEWAY_ALIASES]
    allowed_origins.extend([f"http://localhost:{gateway_port}", f"http://127.0.0.1:{gateway_port}"])
    _set_env_default("PIDP_DEV_PUBLIC_BASE_URL", f"{gateway_base}/pidp/")
    _merge_csv_env_default("PIDP_DEV_ALLOWED_ORIGINS", allowed_origins)
    _merge_csv_env_default("PIDP_ALLOWED_ORIGINS", allowed_origins)

    pidp_db = {
        "image": "postgres:15-alpine",
        "detach": True,
        "name": db_name,
        "network": network_name,
        "restart_policy": {"Name": "always"},
        "user": "postgres",
        "environment": {
            "POSTGRES_PASSWORD": db_password,
            "POSTGRES_USER": db_user,
            "POSTGRES_DB": "PIdP",
        },
        "volumes": {
            prefix + "PIdP_POSTGRES": {"bind": "/var/lib/postgresql/data", "mode": "rw"}
        },
        "healthcheck": {
            "test": ["CMD-SHELL", "pg_isready"],
            "interval": 5000000000,
            "timeout": 5000000000,
            "retries": 10,
        },
    }
    pidp_dev = {
        "image": os.getenv("PIDP_DEV_RUNTIME_IMAGE", "python:3.11-slim"),
        "name": prefix + "pidp-dev",
        "volumes": {
            str(pidp_dir): {"bind": container_app_dir, "mode": "rw"},
            prefix + "PIDP_DEV_VENV": {"bind": "/venv", "mode": "rw"},
            prefix + "PIDP_DEV_PIP_CACHE": {"bind": "/root/.cache/pip", "mode": "rw"},
        },
        "environment": _pidp_env(pidp_editme, db_url, gateway_base, [
            item.strip() for item in os.environ["PIDP_DEV_ALLOWED_ORIGINS"].split(",") if item.strip()
        ]),
        "network": network_name,
        "restart_policy": {"Name": "always"},
        "detach": True,
        "working_dir": "/tmp",
        "command": [
            "sh",
            "-c",
            (
                "python -m venv /venv && "
                "/venv/bin/pip install -r /app/requirements.txt && "
                "exec /venv/bin/uvicorn main:app --app-dir /app --host 0.0.0.0 --port 8000 --reload --reload-dir /app"
            ),
        ],
    }

    if _env_truthy("ORGPORTAL_RECREATE_PIDP", default=True):
        _remove_container(prefix + "pidp-dev")
        _remove_container(prefix + "pidp")
    print(f"PIdP secrets pinned from {selected_env_path}")
    docker_utils.run_container(pidp_db)
    docker_utils.wait_for_db(network_name, db_url=db_url, db_user=db_user)
    docker_utils.run_container(pidp_dev)
    return True


def _ensure_prod_image_available(requested_image: str, pidp_base_url: str, pidp_app_slug: str) -> tuple[str, str]:
    skip_pull = _env_truthy("ORGPORTAL_SKIP_PROD_PULL", default=False)

    if not skip_pull:
        pull_proc = subprocess.run(["docker", "pull", requested_image])
        if pull_proc.returncode == 0:
            return requested_image, "pulled"
        print(f"Warning: failed to pull portal prod image {requested_image}")
    else:
        print("Skipping portal prod image pull because ORGPORTAL_SKIP_PROD_PULL is enabled")

    if _docker_image_exists(requested_image):
        print(f"Using cached local portal prod image: {requested_image}")
        return requested_image, "local-cache"

    raise RuntimeError(
        "Unable to start portal prod container: registry pull failed and no local image exists. "
        "Set ORGPORTAL_PROD_IMAGE to an accessible image, run `docker login ghcr.io`, "
        "or leave ORGPORTAL_START_PROD disabled for local bind-mounted development."
    )


def run(prefix: str, network_name: str) -> None:
    docker_utils.ensure_network(network_name)

    gateway_port = (os.getenv("ORGPORTAL_LOCAL_GATEWAY_PORT") or DEFAULT_LOCAL_GATEWAY_PORT).strip()
    worker_port = (os.getenv("ORGPORTAL_WORKER_PORT") or DEFAULT_WORKER_PORT).strip()
    gateway_base = f"https://localhost:{gateway_port}"
    _set_env_default("ORGPORTAL_DEV_PUBLIC_BASE_URL", gateway_base)
    _set_env_default("ORGPORTAL_DEV_PIDP_BASE_URL", "/pidp")
    _set_env_default("ORGPORTAL_ORG_API_BASE", f"http://{prefix}org:{worker_port}")

    prod_base = os.getenv("ORGPORTAL_PROD_PUBLIC_BASE_URL")
    dev_base = os.getenv("ORGPORTAL_DEV_PUBLIC_BASE_URL") or _derive_dev_base(prod_base)
    prod_host = _host_from_base(prod_base)
    dev_host = _host_from_base(dev_base) or prod_host
    prod_pidp_base_url = (
        os.getenv("ORGPORTAL_PROD_PIDP_BASE_URL")
        or os.getenv("ORGPORTAL_PIDP_BASE_URL")
        or _default_pidp_base(prod_host, dev=False)
    ).rstrip("/")
    dev_pidp_base_url = (
        os.getenv("ORGPORTAL_DEV_PIDP_BASE_URL")
        or _default_pidp_base(dev_host or prod_host, dev=True)
    ).rstrip("/")
    prod_pidp_app_slug = (
        os.getenv("ORGPORTAL_PROD_PIDP_APP_SLUG")
        or os.getenv("ORGPORTAL_PIDP_APP_SLUG")
        or "code-collective"
    ).strip()
    dev_pidp_app_slug = (os.getenv("ORGPORTAL_DEV_PIDP_APP_SLUG") or prod_pidp_app_slug).strip()

    prod_name = prefix + "portal"
    dev_name = prefix + "portal-dev"
    org_worker_name = prefix + "org"
    pidp_dev_name = prefix + "pidp-dev"
    prod_image = _resolve_prod_image()
    start_prod = _env_truthy("ORGPORTAL_START_PROD", default=DEFAULT_START_PROD)
    data_source = (os.getenv("ORGPORTAL_DATA_SOURCE") or DEFAULT_DATA_SOURCE).strip() or DEFAULT_DATA_SOURCE
    org_api_base = os.getenv("ORGPORTAL_ORG_API_BASE", f"http://{org_worker_name}:8001")

    prod = {
        "image": prod_image,
        "name": prod_name,
        "network": network_name,
        "restart_policy": {"Name": "always"},
        "detach": True,
        "environment": {
            "BACKEND_IMAGE_RUNNING": prod_image,
            "PORTAL_PUBLIC_HOST": prod_host or "",
            "PORT": "8080",
            "ORGPORTAL_ORG_API_BASE": org_api_base,
        },
    }

    org_worker = {
        "image": os.getenv("ORGPORTAL_WORKER_IMAGE", DEFAULT_WORKER_IMAGE),
        "name": org_worker_name,
        "network": network_name,
        "restart_policy": {"Name": "always"},
        "detach": True,
        "working_dir": container_app_dir,
        "volumes": {
            str(org_worker_dir): {"bind": container_app_dir, "mode": "rw"},
            prefix + "ORGPORTAL_ORG_WORKER_NODE_MODULES": {
                "bind": "/app/node_modules",
                "mode": "rw",
            },
            prefix + "ORGPORTAL_ORG_WORKER_WRANGLER": {
                "bind": "/app/.wrangler",
                "mode": "rw",
            },
        },
        "environment": {
            "NODE_ENV": "development",
            "PIDP_BASE_URL": (
                os.getenv("ORGPORTAL_WORKER_PIDP_BASE_URL")
                or f"http://{pidp_dev_name}:8000"
            ),
            "PUBLIC_PORTAL_BASE_URL": _normalize_public_base(dev_base) or "http://localhost:5173/",
            "EMAIL_SENDING_ENABLED": os.getenv("ORGPORTAL_LOCAL_EMAIL_SENDING_ENABLED", "false"),
            "EMAIL_ALLOWED_SENDERS": os.getenv("ORGPORTAL_LOCAL_EMAIL_ALLOWED_SENDERS", "dev@example.test"),
            "EMAIL_DAILY_LIMIT": os.getenv("ORGPORTAL_LOCAL_EMAIL_DAILY_LIMIT", "25"),
            "ADMIN_EMAILS": os.getenv("ORGPORTAL_LOCAL_ADMIN_EMAILS", ""),
            "ADMIN_USER_IDS": os.getenv("ORGPORTAL_LOCAL_ADMIN_USER_IDS", ""),
        },
        "command": [
            "sh",
            "-c",
            (
                "npm ci && "
                "npm run db:migrate:local && "
                f"npx wrangler dev --local --test-scheduled --ip 0.0.0.0 --port {worker_port} "
                f"--var {shlex.quote('PIDP_BASE_URL:' + (os.getenv('ORGPORTAL_WORKER_PIDP_BASE_URL') or f'http://{pidp_dev_name}:8000'))} "
                f"--var {shlex.quote('PUBLIC_PORTAL_BASE_URL:' + gateway_base)} "
                f"--var {shlex.quote('CHAT_API_ORIGIN:http://' + prefix + 'chat:8003')}"
            ),
        ],
    }

    chat_worker_name = prefix + "chat"
    chat_api_base = f"http://{chat_worker_name}:8003"
    chat_worker = {
        "image": os.getenv("ORGPORTAL_WORKER_IMAGE", DEFAULT_WORKER_IMAGE),
        "name": chat_worker_name,
        "network": network_name,
        "restart_policy": {"Name": "always"},
        "detach": True,
        "working_dir": container_app_dir,
        "volumes": {
            str(chat_worker_dir): {"bind": container_app_dir, "mode": "rw"},
            prefix + "ORGPORTAL_CHAT_WORKER_NODE_MODULES": {"bind": "/app/node_modules", "mode": "rw"},
            # Shared local storage lets chat resolve contacts from the org database.
            prefix + "ORGPORTAL_ORG_WORKER_WRANGLER": {"bind": "/app/.wrangler", "mode": "rw"},
        },
        "command": ["sh", "-c", (
            "npm ci && npm run db:migrate:local && "
            "npx wrangler dev --local --ip 0.0.0.0 --port 8003 "
            f"--var {shlex.quote('PIDP_BASE_URL:' + (os.getenv('ORGPORTAL_WORKER_PIDP_BASE_URL') or f'http://{pidp_dev_name}:8000'))} "
            f"--var {shlex.quote('PUBLIC_PORTAL_BASE_URL:' + gateway_base)} "
            f"--var {shlex.quote('CHAT_ALLOWED_ORIGINS:' + gateway_base)}"
        )],
    }

    dev = {
        "image": os.getenv("ORGPORTAL_DEV_IMAGE", DEFAULT_DEV_IMAGE),
        "name": dev_name,
        "network": network_name,
        "restart_policy": {"Name": "always"},
        "detach": True,
        "working_dir": container_app_dir,
        "volumes": {
            str(web_dir): {"bind": container_app_dir, "mode": "rw"},
            prefix + "ORGPORTAL_DEV_NODE_MODULES": {
                "bind": "/app/node_modules",
                "mode": "rw",
            },
        },
        "environment": {
            "NODE_ENV": "development",
            "CHOKIDAR_USEPOLLING": os.getenv("ORGPORTAL_DEV_CHOKIDAR_USEPOLLING", "1"),
            "CHOKIDAR_INTERVAL": os.getenv("ORGPORTAL_DEV_CHOKIDAR_INTERVAL", "200"),
            "WATCHPACK_POLLING": os.getenv("ORGPORTAL_DEV_WATCHPACK_POLLING", "true"),
            "VITE_PIDP_BASE_URL": dev_pidp_base_url,
            "VITE_PIDP_APP_SLUG": dev_pidp_app_slug,
            "VITE_DATA_SOURCE": data_source,
            "VITE_PUBLIC_BASE": "/",
            "VITE_ALLOWED_HOSTS": ",".join([h for h in [dev_host, prod_host, "localhost"] if h]),
            "ORG_API_ORIGIN": org_api_base,
            "CHAT_API_ORIGIN": chat_api_base,
        },
        "command": [
            "sh",
            "-c",
            (
                "npm ci && "
                "npm run dev -- --host 0.0.0.0 --port 5173 --strictPort"
            ),
        ],
    }

    for name in (prod_name, dev_name, org_worker_name, chat_worker_name):
        try:
            container = docker_utils.DOCKER_CLIENT.containers.get(name)
            container.stop()
            container.remove(force=True)
        except Exception:
            pass

    print(f"Portal prod base: {_normalize_public_base(prod_base) or 'unchanged'}")
    print(f"Portal dev base: {_normalize_public_base(dev_base) or 'unchanged'}")
    print(f"Portal prod PIdP base: {prod_pidp_base_url}")
    print(f"Portal dev PIdP base: {dev_pidp_base_url}")
    print(f"Portal prod PIdP app slug: {prod_pidp_app_slug}")
    print(f"Portal dev PIdP app slug: {dev_pidp_app_slug}")
    print(f"Portal org API base: {org_api_base}")
    if start_prod:
        resolved_prod_image, image_source = _ensure_prod_image_available(
            prod_image,
            prod_pidp_base_url,
            prod_pidp_app_slug,
        )
        print(f"Using portal prod image: {resolved_prod_image} ({image_source})")
        prod["image"] = resolved_prod_image
        prod["environment"]["BACKEND_IMAGE_RUNNING"] = resolved_prod_image
    else:
        print("Skipping portal prod container because ORGPORTAL_START_PROD is disabled")

    started_pidp = _start_pidp_if_available(prefix, network_name, gateway_base)
    if started_pidp:
        docker_utils.wait_for_port(pidp_dev_name, 8000, network_name, retries=60, delay=2)
        _wait_for_http(f"http://{pidp_dev_name}:8000/health", network_name, retries=60, delay=2)

    docker_utils.run_container(org_worker)
    docker_utils.run_container(chat_worker)
    docker_utils.wait_for_port(chat_worker_name, 8003, network_name, retries=60, delay=2)
    docker_utils.run_container(dev)
    docker_utils.wait_for_port(org_worker_name, int(worker_port), network_name, retries=60, delay=2)
    _wait_for_http(f"http://{org_worker_name}:{worker_port}/health", network_name, retries=60, delay=2)
    if start_prod:
        docker_utils.run_container(prod)
        docker_utils.wait_for_port(prod_name, 8080, network_name, retries=60, delay=2)
        _wait_for_http(f"http://{prod_name}:8080/", network_name, retries=60, delay=2)
    docker_utils.wait_for_port(dev_name, 5173, network_name, retries=60, delay=2)
    _wait_for_http(f"http://{dev_name}:5173/availability", network_name, retries=60, delay=2)
    if _env_truthy("ORGPORTAL_START_LOCAL_GATEWAY", default=True):
        local_url = _start_local_gateway(prefix, network_name, dev_name, org_worker_name, pidp_dev_name, worker_port)
        _wait_for_http(f"https://{prefix}local-gateway:8443/availability", network_name, retries=30, delay=2)
        print(f"Local portal gateway: {local_url}/availability")
    else:
        print("Skipping local HTTPS gateway because ORGPORTAL_START_LOCAL_GATEWAY is disabled")


if __name__ == "__main__":
    if len(sys.argv) >= 3:
        prefix = sys.argv[1]
        network_name = sys.argv[2]
    else:
        prefix = ""
        network_name = "arkavo"
    run(prefix, network_name)
