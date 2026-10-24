# Paper Atlas: Architecture & Design Case Study

> **Target Role:** Design Engineer / Senior Frontend (Data Visualization & Creative Engineering)  
> **Core Artifact:** Polar Academic Citation Intelligence Engine  
> **Live Benchmark:** 779 Real Nodes · 3,630 Citation Edges · Constant 60 FPS Canvas 2D  

---

## 1. Executive Summary & Design Vision

Modern scientific literature platforms either overwhelm researchers with traditional search tables or render sprawling, unreadable "hairball" force-directed graphs that crash the browser DOM.

**Paper Atlas** was designed around a clean conceptual mental model:
- **Central Genesis:** The seminal foundation review sits at the center $(0, 0)$.
- **Orbital Subfields:** Sub-disciplines orbit the genesis in harmonic polar coordinates, reflecting evolutionary branches.
- **Micro-topologies:** Inside each cluster, milestone papers, authors, and venues form localized constellations with flow particles tracing citation gravity.
- **Temporal Scrubbing:** Historical scrubbing from 1995 to 2026 dims future nodes to $16\%$ opacity and dynamically recomputes coverage momentum and growth rates.

The design references government policy dashboards and high-density financial terminals: ultra-dark void backgrounds (`#030607`), subdued structural lines (`rgba(255, 255, 255, 0.07)`), disciplined Inter typography (only 400/500 weights), zero noisy emoji, and high-contrast intentional accents (`#E6D29A` reserved exclusively for active clusters and foundational nodes).

---

## 2. Quantitative Performance Architecture

### 2.1 The Canvas 2D Decision over DOM & WebGL

In early prototypes, standard SVG/DOM node approaches (such as D3 force graphs or React Flow) experienced severe frame drops:
- At 200 DOM elements with SVG drop-shadows: **24 FPS**, with massive garbage collection spikes due to continuous DOM style reconciliations.
- In **Paper Atlas**, we engineered a pure functional Canvas 2D renderer (`renderer.ts`). The render loop does **not** import React and does **not** read from any state store.
- **Profiling Result:**
  - Full render pass across 779 nodes and 3,630 bezier curves: **3.2 ms ~ 4.8 ms per frame**.
  - Headroom remaining in 16.67ms frame budget: **~72% idle headroom**.
  - Frame rate: **Locked 60 FPS** on standard display refresh rates.

### 2.2 The ShadowBlur Budget Discipline

Canvas `ctx.shadowBlur` is notorious for forcing offscreen raster blurs in the browser compositor.
- **Naive approach:** Applying `shadowBlur = 10` to all 800 nodes and 3,600 edges caused frame render times to surge to **38ms** (under 25 FPS).
- **Engineering discipline:** `shadowBlur` is strictly gated in our pipeline:
  ```ts
  // shadowBlur is restricted solely to the active hovered/selected node and the root node
  if (isHovered || isSelected) {
    ctx.shadowColor = PALETTE.accentHi;
    ctx.shadowBlur = 12 * camera.scale;
  }
  ```
  All regular nodes and background orbit curves are drawn with flat alpha composition.

### 2.3 Viewport Frustum Culling

Nodes and bezier curves whose bounding boxes lie completely outside the visible screen window (offset by margins) are immediately discarded prior to any path creation or curve math:
```ts
const viewMargin = 80 / camera.scale;
const worldMinX = (-originX - camera.x) / camera.scale - viewMargin;
const worldMaxX = (width - originX - camera.x) / camera.scale + viewMargin;
// Any node with x < worldMinX || x > worldMaxX is skipped
```

---

## 3. Mathematical Foundations

### 3.1 Mouse-Anchored Zoom Matrix

Standard zoom implementations scale around the canvas center, disorienting the user when inspecting a dense cluster. To keep the cursor's world anchor invariant:

Let $(s_x, s_y)$ be the mouse position in screen coordinates, and $(O_x, O_y)$ be the canvas origin $(0.42W, 0.54H)$.
The world coordinates $(w_x, w_y)$ prior to zoom are:
$$w_x = \frac{s_x - O_x - C_x}{S_{old}}, \quad w_y = \frac{s_y - O_y - C_y}{S_{old}}$$

When scaling to $S_{new}$, we solve for new camera translation $(C_x', C_y')$ such that the projection returns the exact same $(s_x, s_y)$:
$$s_x = w_x \cdot S_{new} + C_x' + O_x \implies C_x' = s_x - O_x - w_x \cdot S_{new}$$
$$C_y' = s_y - O_y - w_y \cdot S_{new}$$

This guarantees that pixels directly under the cursor never shift during wheel operations.

### 3.2 Scale-Invariant Hit Testing

Because world coordinates contract as zoom increases, naive distance checks fail at high magnifications.
In `hitTest.ts`, tolerance is inversely scaled:
$$\text{Tolerance}_{world} = \frac{18\text{px}}{S_{camera}}$$
This ensures the interactive hit target remains an ergonomically stable 18 screen pixels regardless of zoom depth ($0.4\times$ to $4.0\times$).

### 3.3 Quadratic Bezier Perpendicular Offset

To prevent overlapping collinear lines between citation pairs, each edge is converted into an organic quadratic bezier curve.
Given endpoints $P_0(x_0, y_0)$ and $P_1(x_1, y_1)$ with distance $D = \|P_1 - P_0\|$:
- Midpoint: $M = \frac{P_0 + P_1}{2}$
- Normal vector perpendicular to chord: $\hat{n} = \left(-\frac{y_1 - y_0}{D}, \frac{x_1 - x_0}{D}\right)$
- Control point: $C = M + \hat{n} \cdot (0.22 \cdot D)$

Animated particles then travel along this curve using the explicit parametric Bernstein form:
$$B(t) = (1-t)^2 P_0 + 2(1-t)t C + t^2 P_1$$
Wrapping smoothly at $t = 1.0$.

---

## 4. Real Academic Data Pipeline (OpenAlex REST)

Unlike prototypes utilizing synthetic random graph generators, **Paper Atlas** ingests 100% authentic scholarly data from the OpenAlex open catalog.

### 4.1 Scoring & Pruning Formula
From an initial pool of 6,000 fetched works across 30 pagination batches:
$$\text{Score}(w) = 3 \cdot \text{inDegree}(w) + \ln(1 + \text{cited\_by\_count}(w))$$
- **Rationale:** `inDegree` favors topological cohesion within the specific subject corpus, while $\ln(1 + \text{citations})$ preserves universally acknowledged milestone works (e.g., Hinton et al., Nature 2015 with 83k citations) without allowing outliers to monopolize node ranks.

### 4.2 Derived Purity
All operational indicators (density, coverage, growth rate, and field momentum) are derived on demand via pure functions in `src/data/derive.ts`. No raw `baseCoverage` values are ever exposed directly to the UI, completely eliminating synchronization bugs when scrubbing the timeline.

---

## 5. Summary of Achievements

- Zero third-party canvas or graphing library dependencies (built directly on the native HTML5 Canvas 2D API).
- Clean separation between declarative UI state (Zustand) and high-frequency rendering loops (rAF).
- Full test coverage for core coordinate transformations and derivation logic via `node:test`.
- Fully documented trade-offs reflecting deliberate production engineering choices.
