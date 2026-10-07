# Local service directory

NGINX serves a searchable directory of all running Docker containers and the
routes in each running NGINX container's expanded configuration (`nginx -T`).
It includes websites, portal gateways, identity services, APIs, chat, databases,
automation and background workers. Services without an NGINX route remain visible.
It does not list every individual content page or inactive containers.

Start or update it from this directory:

```sh
python3 start.py
```

Open **http://localhost:8880/**, or **https://localhost:8443/services/** and
**https://localhost:8444/services/** on the running portal gateways. The installer
validates and reloads gateway configuration without restarting application
containers. `OrgPortal/run.py` preserves the directory route on future gateway
starts. An absent directory container affects only `/services/`.

The directory container mounts only its configuration, page and generated
inventory, read-only. It has no Docker socket. A host-side systemd user timer
runs `collect.py` every 30 seconds. Inventory writes are atomic; the page warns
if its last snapshot is older than 90 seconds. The refresh timer runs while the
user's systemd manager is active. Docker restarts the directory container unless
explicitly stopped.

HTTP probes are unauthenticated local GET requests with three-second timeouts;
redirects are not followed. Local HTTPS certificates are accepted. A running
container is not proof of application health: HTTP response, Docker state and
Docker health status are displayed separately. Database and background services
have no synthetic browser link. Only selected inventory fields are published;
container environment variables and command lines are never included.

The parser covers literal NGINX blocks, `set` variables, location matches,
proxy/grpc/FastCGI destinations, static roots and redirects. Dynamic expressions
that cannot resolve to a local URL stay visible without a clickable link.

Manual refresh and diagnostics:

```sh
python3 collect.py
systemctl --user status local-service-directory.timer
journalctl --user -u local-service-directory.service
```

Stop the directory and refresh timer:

```sh
systemctl --user disable --now local-service-directory.timer
docker stop local-service-directory
```

Generated runtime inventory and original gateway backups are ignored by Git.
Do not publish this local infrastructure inventory to external hosting.

## Service names

Local containers use the tenant plus the service role. The LifeTech shared stack
uses `lifetech-` and the Deism stack uses `deism-`:

| Suffix | Purpose |
| --- | --- |
| `community-web` | Portal development frontend |
| `community-api` | Organization and event API |
| `chat-api` | Chat API and WebSockets |
| `identity-api` | PIdP authentication service |
| `identity-db` | PostgreSQL identity storage |
| `nginx-gateway` | HTTPS reverse proxy |
| `data-replication` | Background organization snapshot refresh |

Websites are `medtech-website`, `lifetech-website-preview`, `deism-website`, and
`codecollective-website`. Shared tooling is `local-browser-automation` and
`local-service-directory`. The names live in `OrgPortal/service_names.py`; the
local launchers use that mapping. Docker volume names retain their existing
storage namespaces to preserve databases and application data.

To migrate an older running stack, review `python3 rename-services.py`, then
run `python3 rename-services.py --apply` and `python3 start.py`. The migration
renames containers in place, preserves IP addresses, and retains legacy DNS
aliases because existing processes may still reference those names.
