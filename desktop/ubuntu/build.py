#!/usr/bin/env python3
"""Build the OrgPortal Ubuntu package using the system Debian tools."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
VERSION = "3.0.0"


def build():
    arch = subprocess.check_output(["dpkg", "--print-architecture"], text=True).strip()
    runtime = ROOT / "node_modules/electron/dist"
    if not (runtime / "electron").exists():
        subprocess.run(["node", "-e", "require('electron')"], cwd=ROOT, check=True)
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)
    artifact = output / f"orgportal_{VERSION}_{arch}.deb"
    with tempfile.TemporaryDirectory(prefix="orgportal-deb-") as temp:
        stage = Path(temp)
        shutil.copytree(runtime, stage / "opt/orgportal")
        (stage / "opt/orgportal/resources/default_app.asar").unlink(missing_ok=True)
        for source, target, mode in (
            (ROOT / "orgportal", "usr/bin/orgportal", 0o755),
            (ROOT / "orgportal.desktop", "usr/share/applications/orgportal.desktop", 0o644),
            (ROOT / "icon.png", "usr/share/pixmaps/orgportal.png", 0o644),
            (ROOT / "orgportal-dev.desktop", "usr/share/applications/orgportal-dev.desktop", 0o644),
        ):
            dest = stage / target
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, dest)
            dest.chmod(mode)
        app = stage / "opt/orgportal/resources/app"
        app.mkdir()
        for filename in ("main.cjs", "preload.cjs", "browser-auth.cjs", "desktop.css"):
            shutil.copyfile(ROOT / filename, app / filename)
        shutil.copyfile(ROOT / "icon.png", app / "icon.png")
        (app / "package.json").write_text(json.dumps({"name": "orgportal", "productName": "OrgPortal", "version": VERSION, "main": "main.cjs"}))
        (stage / "opt/orgportal/chrome-sandbox").chmod(0o4755)
        control = stage / "DEBIAN/control"
        control.parent.mkdir()
        control.write_text(f"""Package: orgportal
Version: {VERSION}
Section: net
Priority: optional
Architecture: {arch}
Conflicts: lifetech
Replaces: lifetech
Maintainer: Julian Coy <jcloiacon@gmail.com>
Depends: libgtk-3-0 | libgtk-4-1, libnss3, libasound2t64 | libasound2, libgbm1, libdrm2, libxss1, libxtst6, libatspi2.0-0
Homepage: https://orgportal.cc/
Description: OrgPortal desktop app
 Shared OrgPortal desktop client, opening the LifeTech community view.
 Includes its web runtime; requires internet access for live services.
""")
        env = {**os.environ, "SOURCE_DATE_EPOCH": os.environ.get("SOURCE_DATE_EPOCH", "1792800000")}
        subprocess.run(["dpkg-deb", "--root-owner-group", "--build", str(stage), str(artifact)], check=True, env=env)
    print(artifact)


if __name__ == "__main__":
    build()
