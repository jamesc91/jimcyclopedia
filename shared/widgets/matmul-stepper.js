// <matmul-stepper> : step through a matrix multiply one output cell at a time.
//
// Layout follows the classic textbook diagram: the right-hand matrix sits above the
// result, the left-hand matrix sits to its left, so every output cell lands
// exactly where its row and its column cross. When that layout is wider than
// the space available (phones, big matrices), the widget adds the class
// "mm-stacked" and the three matrices stack vertically instead of scrolling.
//
// Usage in a lesson (inside a ```{=html} block):
//   <matmul-stepper
//     a='[[1,2],[3,4]]'  b='[[5,6],[7,8]]'
//     a-label="X" b-label="W" c-label="X·W"
//     row-names='["r1","r2"]' inner-names='["k1","k2"]' col-names='["c1","c2"]'
//     decimals="2"></matmul-stepper>
// Only a and b are required.

const fmt = (x, d) => {
  const s = Number(x).toFixed(d);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
};
const paren = (s) => (s.startsWith("-") ? `(${s.replace("-", "−")})` : s);
const minus = (s) => s.replace("-", "−");

class MatmulStepper extends HTMLElement {
  connectedCallback() {
    if (this._built) return this.watchWidth();
    this._built = true;
    const json = (name, fallback) => {
      const v = this.getAttribute(name);
      return v ? JSON.parse(v) : fallback;
    };
    this.A = json("a", [[1]]);
    this.B = json("b", [[1]]);
    this.m = this.A.length;
    this.n = this.A[0].length;
    this.p = this.B[0].length;
    if (this.B.length !== this.n) {
      this.textContent = `Shapes do not line up: (${this.m}×${this.n}) · (${this.B.length}×${this.p}). The inner numbers must match.`;
      return;
    }
    this.d = Number(this.getAttribute("decimals") ?? 2);
    this.rowNames = json("row-names", this.A.map((_, i) => `row ${i + 1}`));
    this.innerNames = json("inner-names", this.B.map((_, k) => `${k + 1}`));
    this.colNames = json("col-names", this.B[0].map((_, j) => `col ${j + 1}`));
    this.labels = {
      a: this.getAttribute("a-label") ?? "A",
      b: this.getAttribute("b-label") ?? "B",
      c: this.getAttribute("c-label") ?? "A·B",
    };
    this.C = this.A.map((row) =>
      this.B[0].map((_, j) => row.reduce((s, a, k) => s + a * this.B[k][j], 0))
    );
    this.step = -1;
    this.total = this.m * this.p;
    this.build();
    this.render();
    this.watchWidth();
    document.fonts?.ready.then(() => this.fit()); // web fonts change table widths
  }

  // Use the crossing layout when it fits; otherwise stack the matrices.
  fit() {
    if (!this.$board) return;
    this.classList.remove("mm-stacked");
    if (this.$board.scrollWidth > this.$board.clientWidth + 1) this.classList.add("mm-stacked");
  }

  watchWidth() {
    if (!this.$board) return;
    this._ro ??= new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w !== this._width) { this._width = w; this.fit(); } // ignore height-only changes
    });
    this._ro.observe(this);
  }

  build() {
    const { m, n, p, labels } = this;
    this.classList.add("mm");
    this.tabIndex = 0;
    this.setAttribute("role", "group");
    this.setAttribute("aria-label", `Matrix multiply ${labels.a} times ${labels.b}`);

    const shape = `(${m}×${n}) · (${n}×${p}) → (${m}×${p})`;
    this.innerHTML = `
      <div class="mm-board">
        <div class="mm-corner">
          <div class="mm-shape" aria-label="shapes">${shape}</div>
          <div class="mm-shape-note">Inner sizes match (${n}). The outer sizes give the result.</div>
        </div>
        <div class="mm-b"></div>
        <div class="mm-a"></div>
        <div class="mm-c"></div>
      </div>
      <div class="mm-calc" aria-live="polite"></div>
      <div class="mm-controls">
        <button type="button" data-act="back">Back</button>
        <button type="button" data-act="next" class="mm-primary">Next cell</button>
        <button type="button" data-act="play">Play</button>
        <button type="button" data-act="all">Fill all</button>
        <button type="button" data-act="reset">Reset</button>
        <span class="mm-count"></span>
      </div>`;

    // Right-hand matrix: inner names down the side, column names on top.
    this.$b = this.querySelector(".mm-b");
    this.$b.innerHTML = this.table(
      labels.b,
      this.colNames,
      this.innerNames,
      this.B.map((r) => r.map((v) => minus(fmt(v, this.d)))),
      "b"
    );
    // Left-hand matrix: row names down the side, inner names on top.
    this.$a = this.querySelector(".mm-a");
    this.$a.innerHTML = this.table(
      labels.a,
      this.innerNames,
      this.rowNames,
      this.A.map((r) => r.map((v) => minus(fmt(v, this.d)))),
      "a"
    );
    // Result: same rows as A, same columns as B.
    this.$c = this.querySelector(".mm-c");
    this.$c.innerHTML = this.table(
      labels.c,
      this.colNames,
      this.rowNames,
      this.C.map((r) => r.map(() => "")),
      "c"
    );

    this.$board = this.querySelector(".mm-board");
    this.$calc = this.querySelector(".mm-calc");
    this.$count = this.querySelector(".mm-count");
    this.$play = this.querySelector('[data-act="play"]');

    this.querySelector(".mm-controls").addEventListener("click", (e) => {
      const act = e.target.closest("button")?.dataset.act;
      if (act) this.act(act);
    });
    this.$c.addEventListener("click", (e) => {
      const td = e.target.closest("td[data-i]");
      if (!td) return;
      this.stop();
      this.step = Number(td.dataset.i) * this.p + Number(td.dataset.j);
      this.render();
    });
    this.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { this.act("next"); e.preventDefault(); }
      if (e.key === "ArrowLeft") { this.act("back"); e.preventDefault(); }
    });
  }

  table(caption, colHeads, rowHeads, cells, kind) {
    const head = `<tr><th class="mm-cap" scope="col">${caption}</th>${colHeads
      .map((h, j) => `<th scope="col" data-j="${j}">${h}</th>`)
      .join("")}</tr>`;
    const body = cells
      .map(
        (row, i) =>
          `<tr><th scope="row" data-i="${i}">${rowHeads[i]}</th>${row
            .map((v, j) => `<td data-i="${i}" data-j="${j}"${kind === "c" ? ' title="Show this cell"' : ""}>${v}</td>`)
            .join("")}</tr>`
      )
      .join("");
    return `<table class="mm-table mm-${kind}t">${head}${body}</table>`;
  }

  act(a) {
    if (a === "next") { this.stop(); this.step = Math.min(this.step + 1, this.total - 1); }
    if (a === "back") { this.stop(); this.step = Math.max(this.step - 1, -1); }
    if (a === "reset") { this.stop(); this.step = -1; }
    if (a === "all") { this.stop(); this.step = this.total - 1; }
    if (a === "play") { return this.timer ? this.stop() : this.play(); }
    this.render();
  }

  play() {
    if (this.step >= this.total - 1) this.step = -1;
    this.$play.textContent = "Pause";
    const tick = () => {
      if (this.step >= this.total - 1) return this.stop();
      this.step += 1;
      this.render();
    };
    tick();
    this.timer = setInterval(tick, 1400);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.$play) this.$play.textContent = "Play";
  }

  render() {
    const { step, p, d } = this;
    const i = step >= 0 ? Math.floor(step / p) : -1;
    const j = step >= 0 ? step % p : -1;

    this.querySelectorAll(".mm-at td, .mm-at th[data-i]").forEach((el) =>
      el.classList.toggle("mm-row", Number(el.dataset.i) === i)
    );
    this.querySelectorAll(".mm-bt td, .mm-bt th[data-j]").forEach((el) =>
      el.classList.toggle("mm-col", Number(el.dataset.j) === j)
    );
    this.querySelectorAll(".mm-ct td").forEach((el) => {
      const ci = Number(el.dataset.i), cj = Number(el.dataset.j);
      const k = ci * p + cj;
      el.textContent = k <= step ? minus(fmt(this.C[ci][cj], d)) : "";
      el.classList.toggle("mm-done", k <= step);
      el.classList.toggle("mm-now", k === step);
    });

    this.$count.textContent = step < 0 ? `${this.total} cells to fill` : `Cell ${step + 1} of ${this.total}`;

    if (step < 0) {
      this.$calc.innerHTML = `Each result cell is one dot product: a <span class="mm-r">row of ${this.labels.a}</span> with a <span class="mm-k">column of ${this.labels.b}</span>. Press <b>Next cell</b>, or click any empty result cell.`;
      return;
    }
    const terms = this.A[i]
      .map((a, k) => `<span class="mm-term"><span class="mm-r">${paren(fmt(a, d))}</span>×<span class="mm-k">${paren(fmt(this.B[k][j], d))}</span></span>`)
      .join(" + ");
    this.$calc.innerHTML = `<div class="mm-calc-head"><b>${this.rowNames[i]}</b>, <b>${this.colNames[j]}</b></div>
      <div class="mm-calc-eq">${terms} = <span class="mm-out">${minus(fmt(this.C[i][j], d))}</span></div>`;
  }

  disconnectedCallback() {
    this.stop();
    this._ro?.disconnect();
  }
}

if (!customElements.get("matmul-stepper")) customElements.define("matmul-stepper", MatmulStepper);
