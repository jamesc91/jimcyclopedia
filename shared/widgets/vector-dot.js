// <vector-dot> : drag two arrows and watch their dot product.
//
// Two arrows start at the origin on graph paper. Drag either tip, or tab to it
// and use the arrow keys, and the readout updates: the sum of products, both
// lengths, the angle between the arrows, the "shadow" of a on b, and cosine
// similarity. Arrow a is blue (data); arrow b is amber (weights, or a reference
// to compare against). Both axes share one scale, so angles on screen are true.
//
// Usage in a lesson (inside a ```{=html} block):
//   <vector-dot
//     a="[9,3]" b="[6,1]"
//     a-label="Flight" b-label="Prop imbalance"
//     x-label="Rotor band (m/s²)" y-label="High band (m/s²)"
//     x-range="[-4,10]" y-range="[-4,7]"
//     step="0.5" decimals="2"
//     presets='[{"label":"Loud flight","a":[9,3]},{"label":"Bearing wear","b":[1,5]}]'
//     no-shadow></vector-dot>
// Every attribute is optional. Defaults: a=[3,4], b=[2,1], both ranges [-5,5],
// step 0.5, 2 decimals. A preset sets a, b or both. no-shadow starts with the
// shadow hidden. Keys on a focused tip: arrows move one step, Shift+arrows five.


const fmt = (x, d) => {
  let s = Number(x).toFixed(d);
  if (s.includes(".")) s = s.replace(/\.?0+$/, "");
  if (s === "-0") s = "0";
  return s.replace("-", "−");
};
// Fixed decimals for measured values, so 0.50 doesn't flicker to 0.5.
const fix = (x, d) => {
  const s = Number(x).toFixed(d);
  return (Number(s) === 0 ? s.replace("-", "") : s).replace("-", "−");
};
const paren = (s) => (s.startsWith("−") ? `(${s})` : s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

class VectorDot extends HTMLElement {
  connectedCallback() {
    if (this._built) return this.watchWidth();
    this._built = true;
    const json = (name, fallback) => {
      const v = this.getAttribute(name);
      return v ? JSON.parse(v) : fallback;
    };
    this.start = { a: json("a", [3, 4]), b: json("b", [2, 1]) };
    this.xr = json("x-range", [-5, 5]);
    this.yr = json("y-range", [-5, 5]);
    this.stepSize = Number(this.getAttribute("step") ?? 0.5);
    this.d = Number(this.getAttribute("decimals") ?? 2);
    this.labels = {
      a: this.getAttribute("a-label") ?? "a",
      b: this.getAttribute("b-label") ?? "b",
      x: this.getAttribute("x-label") ?? "x",
      y: this.getAttribute("y-label") ?? "y",
    };
    this.presets = json("presets", []);
    this.v = { a: [...this.start.a], b: [...this.start.b] };
    this.showShadow = !this.hasAttribute("no-shadow");
    this.U = 32;
    this.build();
    this.layout();
    this.watchWidth();
  }

  // Maths coordinates to viewBox pixels and back. U is pixels per unit.
  X(x) { return (x - this.xr[0]) * this.U; }
  Y(y) { return (this.yr[1] - y) * this.U; }
  get W() { return (this.xr[1] - this.xr[0]) * this.U; }
  get H() { return (this.yr[1] - this.yr[0]) * this.U; }

  // Redraw at the plot's real width, so 1 viewBox pixel is 1 screen pixel and
  // text stays readable on a phone instead of shrinking with the drawing.
  watchWidth() {
    this._ro ??= new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w && w !== this._width) { this._width = w; this.layout(); }
    });
    this._ro.observe(this.$plot);
  }

  layout() {
    const { xr, yr, labels } = this;
    const w = this.$plot.clientWidth;
    if (w > 0) this.U = w / (xr[1] - xr[0]);
    const { W, H, U } = this;
    const ox = this.X(0), oy = this.Y(0);
    this.$svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    let grid = "";
    const every = U < 26 ? 2 : 1;
    const inside = (t, [lo, hi]) => t > lo + 0.3 && t < hi - 0.3; // no clipped edge numbers
    for (let x = Math.ceil(xr[0]); x <= xr[1]; x++) {
      grid += `<line class="${x === 0 ? "vd-axis" : "vd-gridline"}" x1="${this.X(x)}" y1="0" x2="${this.X(x)}" y2="${H}"/>`;
      if (x !== 0 && x % every === 0 && inside(x, xr)) grid += `<text class="vd-tick" x="${this.X(x)}" y="${oy + 13}" text-anchor="middle">${fmt(x, 0)}</text>`;
    }
    for (let y = Math.ceil(yr[0]); y <= yr[1]; y++) {
      grid += `<line class="${y === 0 ? "vd-axis" : "vd-gridline"}" x1="0" y1="${this.Y(y)}" x2="${W}" y2="${this.Y(y)}"/>`;
      if (y !== 0 && y % every === 0 && inside(y, yr)) grid += `<text class="vd-tick" x="${ox - 5}" y="${this.Y(y) + 3.5}" text-anchor="end">${fmt(y, 0)}</text>`;
    }
    // x label under the axis (below the tick numbers) when there is room.
    const xly = oy + 30 < H - 4 ? oy + 30 : oy - 7;
    grid += `<text class="vd-axis-label" x="${W - 6}" y="${xly}" text-anchor="end">${esc(labels.x)}</text>`;
    grid += `<text class="vd-axis-label" x="${ox + 7}" y="14">${esc(labels.y)}</text>`;
    this.$grid.innerHTML = grid;
    this.$origin.setAttribute("cx", ox);
    this.$origin.setAttribute("cy", oy);
    this.render();
  }

  build() {
    const { labels } = this;
    this.classList.add("vd");
    this.setAttribute("role", "group");
    this.setAttribute("aria-label", `Dot product of ${labels.a} and ${labels.b}`);

    const tip = (k) => `
      <g class="vd-tip vd-tip-${k}" data-k="${k}" tabindex="0" role="button"
         aria-roledescription="draggable arrow tip">
        <circle class="vd-ring" r="13"/>
        <circle class="vd-handle" r="7"/>
        <circle class="vd-hit" r="22"/>
      </g>`;

    const presets = this.presets
      .map((p, i) => `<button type="button" data-preset="${i}">${esc(p.label)}</button>`)
      .join("");

    this.innerHTML = `
      <div class="vd-wrap">
        <div class="vd-plot">
        <svg class="vd-svg" aria-label="Arrows ${esc(labels.a)} and ${esc(labels.b)} on a grid">
          <g class="vd-grid"></g>
          <line class="vd-guide"/>
          <line class="vd-shadow"/>
          <line class="vd-drop"/>
          <polyline class="vd-arc"/>
          <text class="vd-theta">θ</text>
          <line class="vd-line vd-line-b"/><polygon class="vd-head vd-head-b"/>
          <line class="vd-line vd-line-a"/><polygon class="vd-head vd-head-a"/>
          <circle class="vd-origin" r="3"/>
          <text class="vd-lab vd-lab-b">${esc(labels.b)}</text>
          <text class="vd-lab vd-lab-a">${esc(labels.a)}</text>
          ${tip("b")}${tip("a")}
        </svg>
        </div>
        <div class="vd-read">
          <div class="vd-vec"><span class="vd-sw vd-sw-a"></span><span>${esc(labels.a)}</span><span class="vd-num" data-out="a"></span></div>
          <div class="vd-vec"><span class="vd-sw vd-sw-b"></span><span>${esc(labels.b)}</span><span class="vd-num" data-out="b"></span></div>
          <div class="vd-eq" data-out="eq"></div>
          <dl class="vd-stats">
            <dt>Length of ${esc(labels.a)}</dt><dd data-out="na"></dd>
            <dt>Length of ${esc(labels.b)}</dt><dd data-out="nb"></dd>
            <dt>Angle between</dt><dd data-out="deg"></dd>
            <dt>Shadow of ${esc(labels.a)} on ${esc(labels.b)}</dt><dd data-out="shadow"></dd>
            <dt>Cosine similarity</dt><dd data-out="cos"></dd>
          </dl>
          <div class="vd-meter" aria-hidden="true">
            <div class="vd-track"><span class="vd-zero"></span><span class="vd-dot"></span></div>
            <div class="vd-scale"><span>−1 opposite</span><span>0</span><span>1 same way</span></div>
          </div>
          <p class="vd-verdict" data-out="verdict"></p>
        </div>
      </div>
      <div class="vd-controls">
        ${presets}
        <label class="vd-check"><input type="checkbox" ${this.showShadow ? "checked" : ""}> Show shadow</label>
        <button type="button" data-act="reset">Reset</button>
      </div>
      <div class="vd-sr" aria-live="polite"></div>`;

    this.$plot = this.querySelector(".vd-plot");
    this.$svg = this.querySelector(".vd-svg");
    this.$grid = this.querySelector(".vd-grid");
    this.$origin = this.querySelector(".vd-origin");
    this.$ = {};
    for (const sel of ["guide", "shadow", "drop", "arc", "theta", "line-a", "line-b", "head-a", "head-b", "lab-a", "lab-b", "tip-a", "tip-b", "dot", "sr"]) {
      this.$[sel] = this.querySelector(`.vd-${sel}`);
    }
    this.$out = {};
    this.querySelectorAll("[data-out]").forEach((el) => (this.$out[el.dataset.out] = el));

    // Dragging. A mouse or pen can press anywhere on the grid and the nearest
    // tip jumps there; touch must start on a tip, so the page still scrolls.
    this.$svg.addEventListener("pointerdown", (e) => {
      const tipEl = e.target.closest(".vd-tip");
      if (!tipEl && e.pointerType === "touch") return;
      const p = this.toMaths(e);
      const k = tipEl?.dataset.k ?? this.nearest(p);
      this.drag = k;
      this.$svg.setPointerCapture(e.pointerId);
      this.$[`tip-${k}`].focus({ preventScroll: true });
      this.moveTo(k, p);
      e.preventDefault();
    });
    this.$svg.addEventListener("pointermove", (e) => {
      if (this.drag) this.moveTo(this.drag, this.toMaths(e));
    });
    const end = () => {
      if (!this.drag) return;
      this.drag = null;
      this.announce();
    };
    this.$svg.addEventListener("pointerup", end);
    this.$svg.addEventListener("pointercancel", end);

    this.$svg.addEventListener("keydown", (e) => {
      const k = e.target.closest?.(".vd-tip")?.dataset.k;
      const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
      if (!k || !dir) return;
      const s = this.stepSize * (e.shiftKey ? 5 : 1);
      this.moveTo(k, [this.v[k][0] + dir[0] * s, this.v[k][1] + dir[1] * s]);
      this.announce();
      e.preventDefault();
    });

    this.querySelector(".vd-controls").addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.dataset.act === "reset") this.v = { a: [...this.start.a], b: [...this.start.b] };
      const p = this.presets[btn.dataset.preset];
      if (p?.a) this.v.a = [...p.a];
      if (p?.b) this.v.b = [...p.b];
      this.render();
      this.announce();
    });
    this.querySelector(".vd-check input").addEventListener("change", (e) => {
      this.showShadow = e.target.checked;
      this.render();
    });
  }

  toMaths(e) {
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(this.$svg.getScreenCTM().inverse());
    return [pt.x / this.U + this.xr[0], this.yr[1] - pt.y / this.U];
  }

  nearest(p) {
    const dist = (v) => Math.hypot(v[0] - p[0], v[1] - p[1]);
    return dist(this.v.a) <= dist(this.v.b) ? "a" : "b";
  }

  moveTo(k, [x, y]) {
    const s = this.stepSize;
    const snap = (t, [lo, hi]) => Math.min(hi, Math.max(lo, Math.round(t / s) * s));
    const next = [snap(x, this.xr), snap(y, this.yr)];
    if (next[0] === this.v[k][0] && next[1] === this.v[k][1]) return;
    this.v[k] = next;
    this.render();
  }

  // Draw one arrow from the origin to v, with its head and its label.
  arrow(k, v) {
    const ox = this.X(0), oy = this.Y(0);
    const tx = this.X(v[0]), ty = this.Y(v[1]);
    const len = Math.hypot(tx - ox, ty - oy);
    const line = this.$[`line-${k}`], head = this.$[`head-${k}`], lab = this.$[`lab-${k}`];
    this.$[`tip-${k}`].setAttribute("transform", `translate(${tx} ${ty})`);
    this.$[`tip-${k}`].setAttribute("aria-label",
      `Tip of ${this.labels[k]}, at ${fmt(v[0], this.d)}, ${fmt(v[1], this.d)}. Arrow keys move it.`);
    const show = len > 1;
    for (const el of [line, head]) el.style.display = show ? "" : "none";
    if (!show) {
      lab.setAttribute("x", tx + 10); lab.setAttribute("y", ty - 10); lab.setAttribute("text-anchor", "start");
      return;
    }
    const ux = (tx - ox) / len, uy = (ty - oy) / len;
    const hl = Math.min(12, len * 0.6), hw = 5.5;
    const bx = tx - ux * hl, by = ty - uy * hl;
    line.setAttribute("x1", ox); line.setAttribute("y1", oy);
    line.setAttribute("x2", bx); line.setAttribute("y2", by);
    head.setAttribute("points", `${tx},${ty} ${bx - uy * hw},${by + ux * hw} ${bx + uy * hw},${by - ux * hw}`);
    // Label just past the tip. If that would run off the plot, slide it back
    // inside and lift it above the tip so it doesn't sit on the arrow.
    const { W, H } = this;
    const tw = lab.getComputedTextLength() || lab.textContent.length * 7.5;
    const lx = tx + ux * 16;
    let ly = ty + uy * 16 + 4;
    const want = ux >= 0.3 ? lx : ux <= -0.3 ? lx - tw : lx - tw / 2;
    const left = Math.min(W - 4 - tw, Math.max(4, want));
    if (Math.abs(left - want) > 4) ly = ty > 34 ? ty - 15 : ty + 26;
    lab.setAttribute("text-anchor", "start");
    lab.setAttribute("x", left);
    lab.setAttribute("y", Math.min(H - 6, Math.max(14, ly)));
  }

  render() {
    const { a, b } = this.v;
    const d = this.d;
    const dot = a[0] * b[0] + a[1] * b[1];
    const na = Math.hypot(...a), nb = Math.hypot(...b);
    const both = na > 0 && nb > 0;
    const cos = both ? Math.max(-1, Math.min(1, dot / (na * nb))) : NaN;
    const deg = (Math.acos(cos) * 180) / Math.PI;
    const ox = this.X(0), oy = this.Y(0);

    this.arrow("b", b);
    this.arrow("a", a);

    // b's line, extended across the plot so a long shadow still has a track.
    const guide = this.$.guide;
    guide.style.display = nb > 0 ? "" : "none";
    if (nb > 0) {
      const L = 4000 / nb;
      guide.setAttribute("x1", this.X(-b[0] * L)); guide.setAttribute("y1", this.Y(-b[1] * L));
      guide.setAttribute("x2", this.X(b[0] * L)); guide.setAttribute("y2", this.Y(b[1] * L));
    }

    // a's shadow on b: drop a straight down onto b's line.
    const showShadow = this.showShadow && both;
    for (const el of [this.$.shadow, this.$.drop]) el.style.display = showShadow ? "" : "none";
    if (showShadow) {
      const t = dot / (nb * nb);
      const px = this.X(b[0] * t), py = this.Y(b[1] * t);
      this.$.shadow.setAttribute("x1", ox); this.$.shadow.setAttribute("y1", oy);
      this.$.shadow.setAttribute("x2", px); this.$.shadow.setAttribute("y2", py);
      this.$.drop.setAttribute("x1", this.X(a[0])); this.$.drop.setAttribute("y1", this.Y(a[1]));
      this.$.drop.setAttribute("x2", px); this.$.drop.setAttribute("y2", py);
    }

    // The angle, drawn the short way round from b to a.
    for (const el of [this.$.arc, this.$.theta]) el.style.display = both ? "" : "none";
    if (both) {
      const ta = Math.atan2(a[1], a[0]), tb = Math.atan2(b[1], b[0]);
      let diff = ta - tb;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff <= -Math.PI) diff += 2 * Math.PI;
      const r = Math.max(14, Math.min(30, 0.55 * Math.min(na, nb) * this.U));
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const t = tb + (diff * i) / 24;
        pts.push(`${ox + r * Math.cos(t)},${oy - r * Math.sin(t)}`);
      }
      this.$.arc.setAttribute("points", pts.join(" "));
      const mid = tb + diff / 2;
      this.$.theta.setAttribute("x", ox + (r + 11) * Math.cos(mid) - 4);
      this.$.theta.setAttribute("y", oy - (r + 11) * Math.sin(mid) + 5);
    }

    // Readout.
    const A = a.map((x) => fmt(x, d)), B = b.map((x) => fmt(x, d));
    this.$out.a.textContent = `(${A.join(", ")})`;
    this.$out.b.textContent = `(${B.join(", ")})`;
    const terms = A.map((x, i) => `<span class="vd-term"><span class="vd-a">${paren(x)}</span>×<span class="vd-b">${paren(B[i])}</span></span>`);
    this.$out.eq.innerHTML = `${terms.join(" + ")} = <span class="vd-out">${fmt(dot, d)}</span>`;
    this.$out.na.textContent = fix(na, d);
    this.$out.nb.textContent = fix(nb, d);
    this.$out.deg.textContent = both ? `${deg.toFixed(1)}°` : "–";
    this.$out.shadow.textContent = both ? fix(dot / nb, d) : "–";
    this.$out.cos.textContent = both ? fix(cos, d) : "–";
    this.$.dot.style.display = both ? "" : "none";
    if (both) this.$.dot.style.left = `${((cos + 1) / 2) * 100}%`;

    let verdict;
    if (!both) verdict = "An arrow of length 0 has no direction, so there is no angle.";
    else if (Math.abs(dot) < 1e-9) verdict = "At right angles: the dot product is 0.";
    else if (cos > 0.95) verdict = "Pointing almost the same way.";
    else if (cos > 0) verdict = "Pointing the same general way, so the dot product is positive.";
    else if (cos > -0.95) verdict = "Pointing generally opposite ways, so the dot product is negative.";
    else verdict = "Pointing almost exactly opposite ways.";
    this.$out.verdict.textContent = verdict;
    this._summary = `${this.labels.a} (${A.join(", ")}), ${this.labels.b} (${B.join(", ")}). ` +
      `Dot product ${fmt(dot, d)}.` + (both ? ` Angle ${deg.toFixed(1)} degrees, cosine similarity ${fix(cos, d)}.` : "");
  }

  // Tell screen readers the result once a move has finished, not on every frame.
  announce() {
    this.$.sr.textContent = this._summary;
  }

  disconnectedCallback() {
    this._ro?.disconnect();
  }
}

if (!customElements.get("vector-dot")) customElements.define("vector-dot", VectorDot);
