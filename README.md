# Jimcyclopedia

Engineering, math and machine learning, taught with pictures you can play with.
Built with [Quarto](https://quarto.org) and hosted on Cloudflare.

## Run it on your computer

You need Quarto and Python 3.10 or newer.

```bash
pip install -r requirements.txt
python scripts/build_index.py      # checks the lesson graph, builds sidebar and map
quarto preview                     # opens the site and reloads as you edit
```

Run `python scripts/build_index.py` again whenever you add a lesson or change a
lesson's `requires`, title or status. (Quarto also runs it before every render,
but it reads the sidebar before the script runs, so a new lesson shows up in the
sidebar one render later unless you run it first.)

## How the site is organised

```
lessons/<topic>/<lesson-id>.qmd   one file per lesson, grouped by topic
paths/*.yml                       ordered reading lists that pull in lessons
shared/widgets/                   reusable interactives used by many lessons
templates/lesson.qmd              copy this to start a new lesson
scripts/build_index.py            reads lesson headers, checks the graph
filters/prereqs.lua               adds "Before this lesson" and "Where this leads"
_generated/                       written by the script; committed on purpose
```

Lessons form a graph, not a fixed sequence. Each lesson's header lists only the
lessons it directly uses:

```yaml
lesson-id: qkv-tensors
requires: [attention-idea, matrix-multiply]
helpful: [tensors]          # gets a link, not a hard gate
status: published           # planned | draft | published
```

The script turns those lists into each page's "Before this lesson" box, the
"Where this leads" list, the sidebar and the [lesson map](map.qmd). It stops with a
clear message if a lesson needs one that doesn't exist, if two lessons share an
ID, or if prerequisites loop back on themselves.

### Add a lesson

1. Copy `templates/lesson.qmd` to `lessons/<topic>/<lesson-id>.qmd`. New topic? Just make the folder.
2. Fill in the header, keeping `requires` to what the lesson truly needs.
3. Add the ID to a path in `paths/` where it belongs (or leave it off; it will still appear under "More lessons").
4. Run `python scripts/build_index.py`, then `quarto preview`.

No other lesson has to change. To give an existing lesson a new prerequisite,
edit only that lesson's `requires`.

### Widgets

Widgets are plain web components, so a lesson uses them with one HTML tag inside
a ```` ```{=html} ```` block:

- `<matmul-stepper>` steps through a matrix multiply cell by cell. See
  `lessons/linear-algebra/matrix-multiply.qmd` for every option.
- `<py-cell packages="numpy,matplotlib">` is editable Python that runs in the
  reader's browser through Pyodide. Cells on a page share one Python session.

Colour means the same thing everywhere: blue for inputs and data, amber for
weights and parameters.

Heavy work (training real models, PyTorch) belongs in a Colab notebook linked
from the lesson, not in a `py-cell`.

## Publish

Every push to `main` builds the site and deploys it to Cloudflare Workers
(`.github/workflows/deploy.yml`). One-time setup:

1. Create a GitHub repository named `jimcyclopedia` and push this folder to it.
2. In Cloudflare, create an API token from the **Edit Cloudflare Workers** template,
   and copy your **Account ID** from the dashboard.
3. In the GitHub repository, go to Settings > Secrets and variables > Actions and
   add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. Push to `main`. The site appears at `https://jimcyclopedia.<your-subdomain>.workers.dev`.

To use your own domain later, add it in Cloudflare under Workers & Pages >
jimcyclopedia > Settings > Domains & Routes, then update `site-url` in `_quarto.yml`.

## Things to change before going public

- `website.title`, `repo-url`, `site-url` and the GitHub and LinkedIn links in `_quarto.yml`
- `about.qmd`, which is a draft
- The links in `about.qmd`
