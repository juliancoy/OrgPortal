import os
import subprocess
import sys
from pathlib import Path

import docker_utils

current_dir = Path(os.path.abspath(os.path.dirname(__file__)))
web_dir = current_dir / "web"
container_app_dir = "/app"

DEFAULT_PROD_IMAGE = "ghcr.io/juliancoy/orgportal:latest"
DEFAULT_PROD_LOCAL_IMAGE = "orgportal-prod:local"
DEFAULT_DEV_IMAGE = "node:24-alpine"
DEFAULT_DATA_SOURCE = "api"


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
    if portal_host and "." in portal_host:
        domain = portal_host.split(".", 1)[1]
        if dev:
            return f"https://dev.pidp.{domain}"
        return f"https://pidp.{domain}"
    if dev:
        return "https://dev.pidp.arkavo.org"
    return "https://pidp.arkavo.org"


def _build_local_prod_image(local_tag: str, pidp_base_url: str, pidp_app_slug: str) -> None:
    data_source = (os.getenv("ORGPORTAL_DATA_SOURCE") or DEFAULT_DATA_SOURCE).strip() or DEFAULT_DATA_SOURCE
    subprocess.check_call(
        [
            "docker",
            "build",
            "-f",
            str(web_dir / "Dockerfile"),
            "--build-arg",
            f"VITE_PIDP_BASE_URL={pidp_base_url}",
            "--build-arg",
            f"VITE_PIDP_APP_SLUG={pidp_app_slug}",
            "--build-arg",
            f"VITE_DATA_SOURCE={data_source}",
            "--build-arg",
            "VITE_PUBLIC_BASE=/",
            "-t",
            local_tag,
            str(web_dir),
        ]
    )


def _ensure_prod_image_available(requested_image: str, pidp_base_url: str, pidp_app_slug: str) -> tuple[str, str]:
    skip_pull = _env_truthy("ORGPORTAL_SKIP_PROD_PULL", default=False)
    fallback_build = _env_truthy("ORGPORTAL_ALLOW_LOCAL_PROD_BUILD", default=True)

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

    if fallback_build:
        local_tag = os.getenv("ORGPORTAL_PROD_LOCAL_IMAGE", DEFAULT_PROD_LOCAL_IMAGE)
        print(
            "Portal prod image unavailable via registry/local cache; "
            f"building local fallback image as {local_tag}"
        )
        _build_local_prod_image(local_tag, pidp_base_url, pidp_app_slug)
        return local_tag, "local-build-fallback"

    raise RuntimeError(
        "Unable to start portal prod container: registry pull failed and no local image exists. "
        "Set ORGPORTAL_PROD_IMAGE to an accessible image, run `docker login ghcr.io`, "
        "or enable ORGPORTAL_ALLOW_LOCAL_PROD_BUILD=true."
    )


def run(prefix: str, network_name: str) -> None:
    docker_utils.ensure_network(network_name)

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
    prod_image = _resolve_prod_image()
    data_source = (os.getenv("ORGPORTAL_DATA_SOURCE") or DEFAULT_DATA_SOURCE).strip() or DEFAULT_DATA_SOURCE

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
            "ORGPORTAL_ORG_API_BASE": os.getenv("ORGPORTAL_ORG_API_BASE", f"http://{prefix}org:8001"),
        },
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
            "VITE_HMR_HOST": dev_host or "",
            "VITE_ALLOWED_HOSTS": ",".join([h for h in [dev_host, prod_host, "localhost"] if h]),
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

    for name in (prod_name, dev_name):
        try:
            container = docker_utils.DOCKER_CLIENT.containers.get(name)
            container.stop()
            container.remove(force=True)
        except Exception:
            pass

    resolved_prod_image, image_source = _ensure_prod_image_available(
        prod_image,
        prod_pidp_base_url,
        prod_pidp_app_slug,
    )
    print(f"Using portal prod image: {resolved_prod_image} ({image_source})")
    print(f"Portal prod base: {_normalize_public_base(prod_base) or 'unchanged'}")
    print(f"Portal dev base: {_normalize_public_base(dev_base) or 'unchanged'}")
    print(f"Portal prod PIdP base: {prod_pidp_base_url}")
    print(f"Portal dev PIdP base: {dev_pidp_base_url}")
    print(f"Portal prod PIdP app slug: {prod_pidp_app_slug}")
    print(f"Portal dev PIdP app slug: {dev_pidp_app_slug}")
    prod["image"] = resolved_prod_image
    prod["environment"]["BACKEND_IMAGE_RUNNING"] = resolved_prod_image

    docker_utils.run_container(prod)
    docker_utils.run_container(dev)
    docker_utils.wait_for_port(prod_name, 8080, network_name, retries=60, delay=2)
    docker_utils.wait_for_port(dev_name, 5173, network_name, retries=60, delay=2)


if __name__ == "__main__":
    if len(sys.argv) >= 3:
        prefix = sys.argv[1]
        network_name = sys.argv[2]
    else:
        prefix = ""
        network_name = "arkavo"
    run(prefix, network_name)
