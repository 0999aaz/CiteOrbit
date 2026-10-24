# Paper Atlas: Architecture & Design Case Study

> **Target Role:** Design Engineer / Senior Frontend (Data Visualization & Creative Engineering)  
> **Core Artifact:** Polar Academic Citation Intelligence Engine  
> **Live Benchmark:** 778 Real Nodes · 3,612 Citation Edges · 2.20 ms p50 Frame Render Time (Canvas 2D)  

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
- **Profiling Result (300-Frame Benchmark @ 1440×900, 778 nodes + 3,612 edges):**
  - Compound Bezier path batching (`≤ 6` `ctx.stroke()` calls per frame) + reusable `RenderScratch` Map buffers reduced rAF render pass time from `7.00 ms` p50 (`11.30 ms` p95) down to **`2.20 ms` p50 / `2.55 ms` mean / `4.00 ms` p95**.
  - Headroom remaining in a 16.67ms 60Hz frame budget: **>75% idle headroom**.
  - Camera pan/zoom updates run via imperative refs (`cameraRef` + DOM `zoomHudRef`) with zero React component re-renders per pointer event.

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

### 3.2 Scale-Invariant Animated Hit Testing

Because nodes orbit with subtle sinusoidal wobble and expand (`1.18×` cluster radius, `1.12×` intra-cluster orbit) upon selection, `renderer.ts` and `hitTest.ts` share a single pure coordinate generator (`src/layout/positions.ts`) evaluated at `lastFrameTimeRef.current`. Tolerance is inversely scaled:
$$\text{Tolerance}_{world} = \frac{18\text{px}}{S_{camera}}$$
This guarantees exact visual-to-pointer parity across all zoom depths ($0.4\times$ to $4.0\times$) regardless of elapsed animation time.

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

### 4.2 Derived Purity & Metric Transparency
Operational indicators (`density`, composite `Coverage index`, 3-year `calculateGrowth`, structural citation gaps, and heuristic 5-year projections) are derived via pure WeakMap-memoized functions in `src/data/derive.ts` and `src/data/gaps.ts`. Raw `baseCoverage` is never read directly in UI components, author/venue counts reflect exact deduplicated `graph.nodes` tallies, and statistical template summaries are explicitly labeled to distinguish deterministic bibliometric reporting from optional offline LLM synthesis.

---

## 5. Summary of Achievements

- Zero third-party canvas or graphing library dependencies (built directly on the native HTML5 Canvas 2D API).
- Clean separation between declarative UI state (Zustand) and high-frequency rendering loops (rAF).
- Full test coverage for core coordinate transformations and derivation logic via `node:test`.
- Fully documented trade-offs reflecting deliberate production engineering choices.
