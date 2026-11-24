"""Generate an English index of public architecture guides using only the public GitHub API."""
import base64
import hashlib
import json
import os
import re
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

OWNER = "IT-Yun"
ROOT = Path(__file__).resolve().parents[1]

def fetch(route):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "public-architecture-index"}
    if os.getenv("GH_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["GH_TOKEN"]
    with urlopen(Request("https://api.github.com/" + route, headers=headers), timeout=30) as reply:
        return json.load(reply)

def architecture(text):
    match = re.search(r"^## Architecture[^\n]*\n(.*?)(?=^## |\Z)", text, re.M | re.S | re.I)
    return match.group(0).strip() if match else ""

def build():
    records = []
    for page in range(1,1000):
        repos = fetch(f"users/{OWNER}/repos?type=owner&per_page=100&page={page}")
        if not repos:break
        for repo in repos:
            if repo["private"] or repo["visibility"] != "public" or repo["owner"]["login"] != OWNER:
                continue
            name = repo["name"]
            if not re.fullmatch(r"[a-zA-Z0-9._-]+", name):
                raise ValueError("Unexpected repository name")
            try:
                readme = fetch(f"repos/{OWNER}/{name}/readme")
            except HTTPError as exc:
                if exc.code != 404:raise
                readme = {"content": ""}
            section = architecture(base64.b64decode(readme["content"]).decode("utf-8",errors="replace"))
            records.append((name,section))
        if len(repos)<100:break
    if not records:raise RuntimeError("Public inventory is empty")
    reviewed = json.loads((ROOT/"scripts/reviewed-architectures.json").read_text())
    lines = ["# Public repository architecture", "",
             "Open a repository to inspect its README and source. The system column describes the application or guide. A public source extract may contain only one part of that application.", "",
             "| Repository | System and data flow | Documentation review |", "| --- | --- | --- |"]
    for name, section in sorted(records,key=lambda r:r[0].lower()):
        entry=reviewed.get(name,{})
        status="Reviewed" if section and entry.get("digest")==hashlib.sha256(section.encode()).hexdigest() else ("Design needs review" if section else "Architecture heading missing")
        description=entry.get("system","Awaiting a reviewed system description")
        lines.append(f"| [{name}](https://github.com/{OWNER}/{name}#readme) | {description} | {status} |")
    lines+=["","The daily check discovers public repositories and flags new or changed architecture sections. Only reviewed descriptions appear here. [View the check history](../../actions/workflows/architecture-index.yml).",""]
    (ROOT/"ARCHITECTURE.md").write_text("\n".join(lines))

if __name__ == "__main__":build()
