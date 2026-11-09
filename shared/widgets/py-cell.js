// <py-cell> : editable Python that runs in the reader's browser (Pyodide).
//
// Usage in a lesson (inside a ```{=html} block):
//   <py-cell packages="numpy,matplotlib"><script type="text/x-python">
//   import numpy as np
//   print(np.arange(3))
//   </script></py-cell>
//
// All cells on a page share one Python session, like notebook cells.
// Python (about 10 MB) downloads on the first Run only, then is cached.

const PYODIDE_VERSION = "314.0.7";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js`;

let pyodidePromise = null;
function loadPython() {
  if (!pyodidePromise) {
    pyodidePromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = PYODIDE_URL;
      s.onload = () => window.loadPyodide().then(resolve, reject);
      s.onerror = () => reject(new Error("Could not download Python. Check your connection and try again."));
      document.head.appendChild(s);
    });
  }
  return pyodidePromise;
}

const loaded = new Set();
let queue = Promise.resolve(); // cells run one at a time

const FIGURES_TO_PNG = `
def _vl_figures():
    import sys
    if "matplotlib.pyplot" not in sys.modules:
        return []
    import io, base64
    import matplotlib.pyplot as plt
    out = []
    for num in plt.get_fignums():
        buf = io.BytesIO()
        plt.figure(num).savefig(buf, format="png", dpi=110, bbox_inches="tight")
        out.append(base64.b64encode(buf.getvalue()).decode())
    plt.close("all")
    return out
_vl_figures()
`;

function dedent(text) {
  const lines = text.replace(/\t/g, "    ").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(indent)).join("\n");
}

class PyCell extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;
    const src = this.querySelector('script[type="text/x-python"]');
    this.original = dedent(src ? src.textContent : this.textContent);
    this.packages = (this.getAttribute("packages") || "")
      .split(",").map((s) => s.trim()).filter(Boolean);

    this.classList.add("pyc");
    this.innerHTML = `
      <div class="pyc-bar">
        <span class="pyc-lang">Python, runs in your browser</span>
        <span class="pyc-status" aria-live="polite"></span>
        <button type="button" class="pyc-reset">Reset code</button>
        <button type="button" class="pyc-run">Run</button>
      </div>
      <textarea class="pyc-code" spellcheck="false" autocapitalize="off" aria-label="Python code, editable"></textarea>
      <div class="pyc-out" hidden></div>`;
    this.$code = this.querySelector(".pyc-code");
    this.$out = this.querySelector(".pyc-out");
    this.$status = this.querySelector(".pyc-status");
    this.$run = this.querySelector(".pyc-run");
    this.$code.value = this.original;
    this.fit();

    this.$code.addEventListener("input", () => this.fit());
    this.$code.addEventListener("keydown", (e) => {
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        this.$code.setRangeText("    ", this.$code.selectionStart, this.$code.selectionEnd, "end");
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.run(); }
    });
    this.$run.addEventListener("click", () => this.run());
    this.querySelector(".pyc-reset").addEventListener("click", () => {
      this.$code.value = this.original;
      this.fit();
    });
  }

  fit() {
    this.$code.style.height = "auto";
    this.$code.style.height = this.$code.scrollHeight + 4 + "px";
  }

  print(text, cls) {
    const pre = document.createElement("pre");
    if (cls) pre.className = cls;
    pre.textContent = text;
    this.$out.appendChild(pre);
  }

  run() {
    queue = queue.then(() => this._run());
    return queue;
  }

  async _run() {
    this.$run.disabled = true;
    this.$out.hidden = false;
    this.$out.replaceChildren();
    let buffer = "";
    try {
      if (!window.__vlPyReady) this.$status.textContent = "Loading Python (first run only)…";
      const py = await loadPython();
      window.__vlPyReady = true;
      const missing = this.packages.filter((p) => !loaded.has(p));
      if (missing.length) {
        this.$status.textContent = `Loading ${missing.join(", ")}…`;
        await py.loadPackage(missing);
        missing.forEach((p) => loaded.add(p));
        if (missing.includes("matplotlib")) {
          await py.runPythonAsync("import matplotlib\nmatplotlib.use('AGG')");
        }
      }
      this.$status.textContent = "Running…";
      py.setStdout({ batched: (s) => { buffer += s + "\n"; } });
      py.setStderr({ batched: (s) => { buffer += s + "\n"; } });
      const result = await py.runPythonAsync(this.$code.value);
      if (buffer) this.print(buffer.replace(/\n$/, ""));
      if (result !== undefined && result !== null) {
        this.print(String(result));
        if (result.destroy) result.destroy();
      }
      const figs = await py.runPythonAsync(FIGURES_TO_PNG);
      for (const b64 of figs.toJs()) {
        const img = document.createElement("img");
        img.src = `data:image/png;base64,${b64}`;
        img.alt = "Plot produced by the code above";
        this.$out.appendChild(img);
      }
      figs.destroy();
      if (!this.$out.childElementCount) this.print("Done. (No output: add print() to see values.)", "pyc-quiet");
      this.$status.textContent = "";
    } catch (err) {
      const msg = String(err.message || err);
      if (buffer) this.print(buffer.replace(/\n$/, ""));
      const lines = msg.trim().split("\n");
      // Show only the part of the traceback that points at the reader's code.
      const mine = lines.findLastIndex((l) => l.includes('File "<exec>"'));
      this.print((mine >= 0 ? lines.slice(mine) : lines.slice(-4)).join("\n"), "pyc-err");
      this.$status.textContent = "Error";
    } finally {
      this.$run.disabled = false;
    }
  }
}

if (!customElements.get("py-cell")) customElements.define("py-cell", PyCell);
