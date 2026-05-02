import os
from pathlib import Path
import sys
import subprocess
import time

here = Path(os.path.abspath(os.path.dirname(__file__)))
root = here.parent
sys.path.append(str(root))

import docker_utils
import editme

COCKROACH_IMAGE = os.getenv("COCKROACH_IMAGE", "cockroachdb/cockroach:v25.1.5")


def ensure_ubi_image(force_rebuild: bool = False) -> None:
    images = docker_utils.DOCKER_CLIENT.images.list(name="ubi")
    if not force_rebuild:
        for image in images:
            if "ubi" in image.tags:
                return
    print("Building ubi image from ubi/Dockerfile...")
    docker_utils.DOCKER_CLIENT.images.build(
        path=str(here),
        tag="ubi",
        forcerm=True,
    )


def ensure_cockroach_certs(cert_dir: Path) -> None:
    cert_dir.mkdir(parents=True, exist_ok=True)
    ca_crt = cert_dir / "ca.crt"
    ca_key = cert_dir / "ca.key"
    node_crt = cert_dir / "node.crt"
    client_crt = cert_dir / "client.root.crt"
    if ca_crt.exists() and ca_key.exists() and node_crt.exists() and client_crt.exists():
        return

    volume = f"{cert_dir}:/certs"
    base_cmd = [
        "docker",
        "run",
        "--rm",
        "--entrypoint",
        "/cockroach/cockroach",
        "-v",
        volume,
        COCKROACH_IMAGE,
    ]
    subprocess.check_call(base_cmd + ["cert", "create-ca", "--certs-dir=/certs", "--ca-key=/certs/ca.key"])
    subprocess.check_call(
        base_cmd
        + [
            "cert",
            "create-node",
            "cockroach",
            "localhost",
            "127.0.0.1",
            "--certs-dir=/certs",
            "--ca-key=/certs/ca.key",
        ]
    )
    subprocess.check_call(
        base_cmd + ["cert", "create-client", "root", "--certs-dir=/certs", "--ca-key=/certs/ca.key"]
    )


def run_cockroach_secure(network_name: str, prefix: str, cert_dir: Path) -> None:
    name = prefix + "cockroach"
    try:
        existing = docker_utils.DOCKER_CLIENT.containers.get(name)
        existing.stop()
        existing.remove(force=True)
    except Exception:
        pass

    config = dict(
        image=COCKROACH_IMAGE,
        name=name,
        detach=True,
        network=network_name,
        restart_policy={"Name": "always"},
        entrypoint="/cockroach/cockroach",
        command=[
            "start-single-node",
            "--certs-dir=/cockroach/certs",
            "--listen-addr=localhost:26357",
            "--advertise-addr=cockroach:26357",
            "--sql-addr=0.0.0.0:26257",
            "--http-addr=0.0.0.0:8080",
        ],
        ports={"26257/tcp": 26257, "8080/tcp": 8081},
        volumes={str(cert_dir): {"bind": "/cockroach/certs", "mode": "ro"}},
    )
    docker_utils.run_container(config)


def bootstrap_ubi_schema(cockroach_name: str) -> None:
    sql = (
        "CREATE DATABASE IF NOT EXISTS defaultdb; "
        "USE defaultdb; "
        "CREATE TABLE IF NOT EXISTS public.accounts ("
        "id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "
        "entity_type STRING NOT NULL DEFAULT 'individual', "
        "balance DECIMAL(20,6) NOT NULL DEFAULT 0, "
        "dena_balance DECIMAL(20,6) NOT NULL DEFAULT 0, "
        "updated_at TIMESTAMPTZ NOT NULL DEFAULT now()); "
        "CREATE TABLE IF NOT EXISTS public.transactions ("
        "id UUID PRIMARY KEY, "
        "to_account_id UUID, "
        "amount DECIMAL(20,6) NOT NULL, "
        "currency STRING NOT NULL DEFAULT 'DEM', "
        "transaction_type STRING NOT NULL, "
        "description STRING, "
        "timestamp TIMESTAMPTZ NOT NULL DEFAULT now());"
    )
    cmd = [
        "docker",
        "exec",
        cockroach_name,
        "/cockroach/cockroach",
        "sql",
        "--certs-dir=/cockroach/certs",
        "--host=localhost:26257",
        "-e",
        sql,
    ]
    last_error: Exception | None = None
    for _ in range(30):
        try:
            subprocess.check_call(cmd)
            return
        except Exception as exc:
            last_error = exc
            time.sleep(1)
    if last_error:
        raise last_error


def _secure_db_url(prefix: str) -> str:
    db_host = f"{prefix}cockroach"
    db_name = os.getenv("UBI_COCKROACH_DB", os.getenv("ORG_COCKROACH_DB", "org"))
    return (
        f"postgresql://root@{db_host}:26257/{db_name}"
        "?sslmode=verify-full"
        "&sslrootcert=/cockroach-certs/ca.crt"
        "&sslcert=/cockroach-certs/client.root.crt"
        "&sslkey=/cockroach-certs/client.root.key"
    )


def _common_env(prefix: str, interval_seconds: str, secure_mode: bool) -> dict[str, str]:
    db_url_override = (os.getenv("COCKROACH_ASYNC_URL") or "").strip()
    if db_url_override:
        db_url = db_url_override
    elif secure_mode:
        db_url = _secure_db_url(prefix)
    else:
        db_host = os.getenv("UBI_DB_HOST", f"{prefix}cockroach")
        db_url = (
            f"postgresql://{editme.COCKROACH_USER}@{db_host}:"
            f"{editme.COCKROACH_SQL_PORT}/{editme.COCKROACH_DB}"
            f"?sslmode={'disable' if editme.COCKROACH_INSECURE else 'require'}"
        )
    return {
        "COCKROACH_ASYNC_URL": db_url,
        "UBI_INTERVAL_SECONDS": interval_seconds,
        "DENA_ANNUAL": os.getenv("DENA_ANNUAL", "1"),
        "DENA_PRECISION": os.getenv("DENA_PRECISION", "6"),
        "UBI_ENTITY_TYPES": os.getenv("UBI_ENTITY_TYPES", "individual"),
        "UBI_API_KEY": os.getenv("UBI_API_KEY", ""),
        "PIDP_BASE_URL": os.getenv("PIDP_BASE_URL", f"http://{prefix}pidp:8000"),
    }


def run(network_name: str = "arkavo", prefix: str = "") -> None:
    docker_utils.ensure_network(network_name)
    secure_mode = os.getenv("UBI_SECURE_COCKROACH", "1").strip().lower() in {"1", "true", "yes", "on"}
    cockroach_cert_dir = root / "certs" / "cockroach"
    if secure_mode:
        ensure_cockroach_certs(cockroach_cert_dir)
        run_cockroach_secure(network_name, prefix, cockroach_cert_dir)
        bootstrap_ubi_schema(prefix + "cockroach")
    ensure_ubi_image()
    prod_port = int(os.getenv("UBI_PROD_PORT", "8010"))
    dev_port = int(os.getenv("UBI_DEV_PORT", "8011"))
    prod_name = prefix + "ubi"
    dev_name = prefix + "ubi-dev"
    start_dev = os.getenv("UBI_START_DEV", "0").strip().lower() in {"1", "true", "yes", "on"}

    for name in (prod_name, dev_name):
        try:
            container = docker_utils.DOCKER_CLIENT.containers.get(name)
            container.stop()
            container.remove(force=True)
        except Exception:
            pass

    ubi_prod = dict(
        image="ubi",
        name=prod_name,
        detach=True,
        network=network_name,
        restart_policy={"Name": "always"},
        ports={"8000/tcp": prod_port},
        volumes={
            str(here): {"bind": "/app", "mode": "rw"},
            str(cockroach_cert_dir): {"bind": "/cockroach-certs", "mode": "ro"},
        },
        environment=_common_env(prefix, os.getenv("UBI_INTERVAL_SECONDS", "60"), secure_mode),
    )
    docker_utils.run_container(ubi_prod)
    if start_dev:
        ubi_dev = dict(
            image="ubi",
            name=dev_name,
            detach=True,
            network=network_name,
            restart_policy={"Name": "always"},
            ports={"8000/tcp": dev_port},
            volumes={
                str(here): {"bind": "/app", "mode": "rw"},
                str(cockroach_cert_dir): {"bind": "/cockroach-certs", "mode": "ro"},
            },
            environment=_common_env(prefix, os.getenv("UBI_DEV_INTERVAL_SECONDS", "15"), secure_mode),
        )
        docker_utils.run_container(ubi_dev)


if __name__ == "__main__":
    if len(sys.argv) >= 3:
        prefix = sys.argv[1]
        network_name = sys.argv[2]
    else:
        prefix = ""
        network_name = "arkavo"
    run(network_name=network_name, prefix=prefix)
