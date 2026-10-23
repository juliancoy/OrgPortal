# Common form clickthroughs

From the Organization checkout:

```sh
python3 -m pip install -r OrgPortal/web/docker/forms/requirements.txt
npm --prefix OrgPortal/web run test:forms:docker
```

Requires Linux, local Docker, the sibling PIdP checkout and the Python dependencies
used by the workspace `run.py`. The Playwright client and Docker browser are pinned
to the same version in `web/docker/forms/requirements.txt`.

The command starts or reuses a dedicated `common-form-test` Docker stack at
`https://localhost:19458`, disables remote organization replication, and uses local
verification-log delivery with synthetic accounts. Existing development and
production accounts are not used. The stack and its fixture data remain available
for debugging and later runs.

Chromium runs headlessly in a separate Docker container. The host runs the Python
fixture helpers and connects through Playwright's loopback WebSocket on port
9460. The browser container has no Docker socket or repository mounts and is
removed after the run. Browser requests to non-loopback hosts are blocked.

Both **Desktop Chrome** and **Pixel 7** profiles run the real presentation workflow:

- Required fields and missing-teammate validation, with no saved submission.
- Clear a draft; restore a populated draft after navigation and reload.
- Create a team, select teammates, and queue a local email invitation.
- Submit for an existing team and create multiple independent proposals.
- Upload images, PDF and PowerPoint; download public files; add/remove attachments.
- Review applications, paginate, change status, export full and filtered CSV files.
- Public presenter privacy and guest sign-in return destination.
- Favorite limits, persistence, removal and organizer configuration.
- Edit after intake closes; preserve presenters and other proposals' attachments.
- Cancel deletion, confirm deletion and reject new applications after closure.
- Narrow/wide layouts, visible submit buttons and horizontal overflow.

Use `-- --device pixel` or `-- --device desktop` after the npm command to run one
profile. Each run writes logs, screenshots, actual downloaded CSV files and a
`results.json` under `.local/common-form-tests/<UTC run timestamp>/`. A failing
profile gives the command a nonzero exit status; both profiles are attempted.
Artifacts contain synthetic local fixture details and should stay local.

Pixel emulation exercises Chromium with mobile viewport, device scale, user agent
and touch settings. It does not run Android's native keyboard, file picker or
download manager. Login sessions are provisioned through the local API; this
suite does not test the interactive sign-in flow. Keep real-device checks for
those behaviors. The separate Playwright E2E configuration also uses Pixel 7
for its `mobile-chromium` project.
