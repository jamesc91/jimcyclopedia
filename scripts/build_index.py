"""Build the lesson index before Quarto renders the site.

Reads the YAML header of every lesson in lessons/, checks the prerequisite
graph, and writes four files into _generated/:

  lessons.json   every lesson's title, link, prerequisites and what it leads to
                 (read by filters/prereqs.lua to draw the "Before this lesson" box)
  sidebar.yml    the site sidebar, in the order given by paths/*.yml
  map.qmd        a Mermaid dependency map of every lesson
  path-<id>.qmd  a reading list for each path, used on the home page

Quarto runs this automatically (see pre-render in _quarto.yml). You can also
run it by hand to check the graph: python scripts/build_index.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
LESSONS = ROOT / "lessons"
PATHS = ROOT / "paths"
OUT = ROOT / "_generated"

STATUSES = {"published", "draft", "planned"}


def write_if_changed(path: Path, text: str) -> None:
    """Write only when the content differs. quarto preview treats a touched
    sidebar.yml as a config change and reloads the page, and this script runs
    before every render, so rewriting unchanged files causes a reload loop."""
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return
    path.write_text(text, encoding="utf-8")


def read_header(path: Path) -> dict:
    """Return the YAML front matter of a .qmd file as a dict."""
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    return yaml.safe_load(text[3:end]) or {}


def load_lessons() -> dict[str, dict]:
    lessons: dict[str, dict] = {}
    errors: list[str] = []
    for qmd in sorted(LESSONS.rglob("*.qmd")):
        meta = read_header(qmd)
        lid = meta.get("lesson-id")
        rel = qmd.relative_to(ROOT).as_posix()
        if not lid:
            errors.append(f"{rel}: missing lesson-id")
            continue
        if lid != qmd.stem:
            errors.append(f"{rel}: lesson-id '{lid}' should match the file name '{qmd.stem}'")
        if lid in lessons:
            errors.append(f"{rel}: lesson-id '{lid}' already used by {lessons[lid]['file']}")
            continue
        status = meta.get("status", "draft")
        if status not in STATUSES:
            errors.append(f"{rel}: status must be one of {sorted(STATUSES)}")
        lessons[lid] = {
            "id": lid,
            "title": meta.get("title", lid),
            "short": meta.get("short-title", meta.get("title", lid)),
            "file": rel,
            "href": rel[:-4] + ".html",
            "topic": qmd.parent.name,
            "status": status,
            "summary": meta.get("description", ""),
            "requires": list(meta.get("requires") or []),
            "helpful": list(meta.get("helpful") or []),
            "leads_to": [],
        }

    for lid, lesson in lessons.items():
        for kind in ("requires", "helpful"):
            for dep in lesson[kind]:
                if dep not in lessons:
                    errors.append(f"{lesson['file']}: {kind} unknown lesson '{dep}'")
                elif dep == lid:
                    errors.append(f"{lesson['file']}: lists itself in {kind}")
        for dep in lesson["requires"]:
            if dep in lessons:
                lessons[dep]["leads_to"].append(lid)

    errors += find_cycles(lessons)
    if errors:
        print("Lesson graph problems:\n  " + "\n  ".join(errors), file=sys.stderr)
        sys.exit(1)
    return lessons


def find_cycles(lessons: dict[str, dict]) -> list[str]:
    """Report any loop in the 'requires' graph (A needs B needs ... needs A)."""
    state: dict[str, int] = {}  # 1 = visiting, 2 = done
    errors: list[str] = []

    def visit(lid: str, trail: list[str]) -> None:
        if state.get(lid) == 2:
            return
        if state.get(lid) == 1:
            loop = trail[trail.index(lid):] + [lid]
            errors.append("circular prerequisites: " + " -> ".join(loop))
            return
        state[lid] = 1
        for dep in lessons[lid]["requires"]:
            if dep in lessons:
                visit(dep, trail + [lid])
        state[lid] = 2

    for lid in lessons:
        visit(lid, [])
    return errors


def load_paths(lessons: dict[str, dict]) -> list[dict]:
    paths = []
    for yml in sorted(PATHS.glob("*.yml")):
        path = yaml.safe_load(yml.read_text(encoding="utf-8"))
        path["id"] = path.get("id", yml.stem)
        for section in path["sections"]:
            for lid in section["lessons"]:
                if lid not in lessons:
                    sys.exit(f"{yml.name}: unknown lesson '{lid}'")
        paths.append(path)
    return paths


def label(lesson: dict) -> str:
    return lesson["short"] if lesson["status"] == "published" else f"{lesson['short']} [soon]{{.soon}}"


def write_sidebar(lessons: dict[str, dict], paths: list[dict]) -> None:
    contents = []
    listed = set()
    for path in paths:
        for section in path["sections"]:
            items = []
            for lid in section["lessons"]:
                items.append({"href": lessons[lid]["file"], "text": label(lessons[lid])})
                listed.add(lid)
            contents.append({"section": section["title"], "contents": items})
    # Lessons not on any path still get a place in the sidebar.
    extra = [l for lid, l in sorted(lessons.items()) if lid not in listed]
    if extra:
        contents.append({
            "section": "More lessons",
            "contents": [{"href": l["file"], "text": label(l)} for l in extra],
        })
    sidebar = {"website": {"sidebar": {"style": "docked", "search": False, "contents": contents}}}
    write_if_changed(OUT / "sidebar.yml", yaml.safe_dump(sidebar, sort_keys=False))


def mermaid_id(lid: str) -> str:
    return lid.replace("-", "_")


def write_map(lessons: dict[str, dict]) -> None:
    # Top-to-bottom, no topic boxes: lessons settle into rows by how many
    # steps they are from a starting point, which is the order to read them.
    lines = ["```{mermaid}", "%%| fig-responsive: false", "flowchart TB"]
    for lesson in lessons.values():
        lines.append(f'  {mermaid_id(lesson["id"])}["{lesson["short"]}"]')
    for lesson in lessons.values():
        for dep in lesson["requires"]:
            lines.append(f"  {mermaid_id(dep)} --> {mermaid_id(lesson['id'])}")
        for dep in lesson["helpful"]:
            lines.append(f"  {mermaid_id(dep)} -.-> {mermaid_id(lesson['id'])}")
    lines.append("  classDef published fill:#dce8fb,stroke:#1f5fbf,stroke-width:2px,color:#1b2430")
    lines.append("  classDef planned fill:#ffffff,stroke:#b4bdc9,color:#5b6675")
    for status in ("published", "planned", "draft"):
        ids = [mermaid_id(l["id"]) for l in lessons.values() if l["status"] == status]
        if ids:
            lines.append(f"  class {','.join(ids)} {'published' if status == 'published' else 'planned'}")
    for lesson in lessons.values():
        if lesson["status"] == "published":
            lines.append(f'  click {mermaid_id(lesson["id"])} "{lesson["href"]}"')
    lines.append("```")
    write_if_changed(OUT / "map.qmd", "\n".join(lines) + "\n")


def write_path_lists(lessons: dict[str, dict], paths: list[dict]) -> None:
    for path in paths:
        out = []
        for section in path["sections"]:
            out.append(f"### {section['title']}\n")
            if section.get("blurb"):
                out.append(section["blurb"] + "\n")
            out.append("::: {.path-list}\n")
            for lid in section["lessons"]:
                l = lessons[lid]
                cls = "published" if l["status"] == "published" else "planned"
                tag = "" if cls == "published" else " [coming soon]{.soon}"
                out.append(f"- [{l['title']}]({l['file']}){{.{cls}}}{tag}  \n  {l['summary']}")
            out.append(":::\n")
        write_if_changed(OUT / f"path-{path['id']}.qmd", "\n".join(out))


def main() -> None:
    OUT.mkdir(exist_ok=True)
    lessons = load_lessons()
    paths = load_paths(lessons)
    write_if_changed(OUT / "lessons.json", json.dumps(lessons, indent=2))
    write_sidebar(lessons, paths)
    write_map(lessons)
    write_path_lists(lessons, paths)
    published = sum(l["status"] == "published" for l in lessons.values())
    print(f"Lesson index: {len(lessons)} lessons ({published} published), {len(paths)} path(s)")


if __name__ == "__main__":
    main()
