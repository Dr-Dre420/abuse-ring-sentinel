# Abuse-Ring Sentinel — Design System

**Codename:** `Deepwater`
**Product positioning:** AI Financial Risk Intelligence — an analyst console, not a marketing surface.
**Status:** Source of truth for all frontend visual decisions. No component may introduce a value that
contradicts this document. If a component needs something this document does not cover, extend this
document first, then implement.

---

## 0. Design intent

Abuse-Ring Sentinel is a defense-only investigation tool. An analyst opens it to answer one question:
**"is this surge organic, or is it a ring?"** Every visual decision serves that question.

The interface should feel **expensive, calm, analytical, and technically sophisticated** — a financial
intelligence command center. It should read as a live environment where evidence is layered over an
atmospheric field, not as a stack of rectangular cards on a flat page.

**Target feeling:** *"AI-powered financial intelligence command center."*

**Explicitly not:** generic Tailwind admin dashboard · shadcn template · AI SaaS landing page ·
neon cyberpunk · glassmorphism showcase · alarm panel.

### 0.1 Non-negotiable product rules

These outrank every aesthetic rule below.

| Rule | Meaning |
| --- | --- |
| **No fabricated telemetry** | Every number rendered must trace to `/case/*`, `/evaluate`, or a frozen artifact. No invented KPIs, no decorative counters, no fake "live" feeds, no placeholder user profiles. If real data does not exist for a slot, delete the slot. |
| **Deterministic ≠ generated** | Model output and deterministic explanations are the source of truth and are styled as primary evidence. Any composed/assistive language is visually subordinate and explicitly labelled. |
| **Defense-only framing stays visible** | "No automated financial action" and the synthetic-evaluation disclaimer are permanent UI, not fine print to be designed away. |
| **Scientific honesty over flattery** | Negative results (Seed 999 regression, background-FPR trade-off, modest aggregate lift) are shown with the same prominence as wins. |

---

## 1. Layer model (depth system)

Depth is the primary organizing device. Every element belongs to exactly one layer.

| Layer | Name | Contents | Treatment |
| --- | --- | --- | --- |
| **L0** | Atmosphere | Page field: near-black base, teal radial bloom, vignette, faint grid | No border, no blur, `pointer-events: none`, fixed |
| **L1** | Canvas | Graph viewport, chart plotting areas | Transparent to L0, inset ring only |
| **L2** | Surface | Panels, sections, tables — the main working plane | `--surface-1`, hairline border, `--elev-2` |
| **L3** | Floating | Inspectors, legends, toolbars, verdict strip over the graph | `--surface-3` + `--blur-md`, soft border, `--elev-3` |
| **L4** | Chrome | Nav rail, command bar (top), console bar (bottom) | `--surface-2` + `--blur-lg`, `--elev-3` |
| **L5** | Overlay | Menus, tooltips, toasts, focused/selected overlays | `--surface-4` + `--blur-lg`, `--elev-4` |

**Depth is expressed by** transparency → blur → border light → shadow → glow, in that order of preference.
Never express depth by adding another visible box around an existing box.

Rules:
- A floating layer must sit over content it relates to (inspector over graph), never in the document flow "pretending" to float.
- Do not nest glass in glass more than **two** levels (L2 → L3 max). Deeper nesting reads as mud.
- Blurred surfaces need an opaque-enough base (`≥0.55` alpha) so text stays at full contrast.

---

## 2. Color

### 2.1 Foundation

| Token | Value | Use |
| --- | --- | --- |
| `--bg-abyss` | `#04070a` | Page base, deepest point |
| `--bg-deep` | `#060c10` | Secondary base, rail |
| `--bg-hollow` | `rgba(2, 6, 8, 0.5)` | Sunken wells (tables, code, inset meters) |
| `--veil-teal` | `rgba(20, 90, 92, 0.30)` | Atmospheric bloom (L0 only) |
| `--veil-cyan` | `rgba(24, 74, 104, 0.22)` | Secondary bloom (L0 only) |
| `--veil-gold` | `rgba(120, 88, 40, 0.12)` | Tertiary warm bloom (L0 only, low) |

### 2.2 Surfaces

| Token | Value | Layer |
| --- | --- | --- |
| `--surface-1` | `rgba(13, 25, 29, 0.55)` | L2 panel |
| `--surface-2` | `rgba(10, 21, 25, 0.72)` | L4 chrome |
| `--surface-3` | `rgba(15, 30, 35, 0.78)` | L3 floating |
| `--surface-4` | `rgba(18, 35, 40, 0.90)` | L5 overlay |
| `--surface-raised` | `rgba(255, 255, 255, 0.035)` | Inline raised block inside a panel |
| `--surface-hover` | `rgba(255, 255, 255, 0.055)` | Hover wash |

### 2.3 Borders and light

| Token | Value | Use |
| --- | --- | --- |
| `--line-hairline` | `rgba(150, 205, 205, 0.10)` | Default panel edge, dividers |
| `--line-soft` | `rgba(150, 205, 205, 0.17)` | Emphasis edge, hover edge |
| `--line-strong` | `rgba(160, 220, 220, 0.30)` | Active/selected edge |
| `--edge-light` | `inset 0 1px 0 rgba(255,255,255,0.05)` | Top highlight — simulates light from above |

Every L2+ surface carries `--edge-light`. This single detail is what separates "floating pane" from "flat div".

### 2.4 Text

| Token | Value | Use | Min contrast |
| --- | --- | --- | --- |
| `--text-primary` | `#e6f1f1` | Headings, metrics, values | 4.5:1 |
| `--text-secondary` | `#9fb3b6` | Body, descriptions | 4.5:1 |
| `--text-muted` | `#6b8085` | Labels, metadata, benchmarks | 3:1 (non-essential only) |
| `--text-faint` | `#4a5c61` | Disabled, watermark, axis ticks | decorative only |

### 2.5 Accents

| Token | Value | Meaning |
| --- | --- | --- |
| `--accent-teal` | `#45d6cd` | **Primary interactive.** Active nav, focus, selection, primary action, graph-model identity |
| `--accent-cyan` | `#3fc7e0` | Informational / neutral data, device entities, causal-window markers |
| `--accent-gold` | `#e2ab63` | **Secondary highlight.** Focal entity, structural graph spine, key finding emphasis |
| `--accent-champagne` | `#f0cd94` | Gold at higher luminance — focal node core, large highlight numerals |

Amber/gold is a *highlight*, never a background fill for large areas. Teal is the only color allowed to
indicate interactivity — if it is teal, it can be clicked, is selected, or is the model in focus.

### 2.6 Risk semantics

Risk color is **reserved**. Never use these hues decoratively.

| Token | Value | Level | Treatment |
| --- | --- | --- | --- |
| `--risk-low` | `#4ad6a8` | Low / cleared / legitimate | Color only, no glow |
| `--risk-medium` | `#e5a951` | Elevated / review / disagreement | Color + 1px border tint |
| `--risk-high` | `#ff6b6b` | High / flagged abuse | Color + border tint + subtle fill wash |
| `--risk-critical` | `#ff4d61` | Critical / escalate | Color + fill + **the only permitted risk glow** |

Compatibility aliases (read directly by `app.js` inline styles — must remain defined):
`--accent-emerald` → `--risk-low` · `--accent-amber` → `--risk-medium` · `--accent-rose` → `--risk-high`

**Accessibility:** all four risk hues are luminance-tuned to clear 4.5:1 against `--surface-1` over
`--bg-abyss`. Risk is **never** encoded by color alone — always color + label text (and, where dense,
an icon or bar position).

### 2.7 Palette discipline

- Maximum **5 hues** on screen at once: teal, cyan, gold, one risk hue, neutral.
- Graph entity hues live inside the teal→gold family so the visualization never reads as a rainbow.
- Red belongs to risk. A red edge in the graph means multiplexed/shared infrastructure — a risk signal —
  never "merchant" or any other neutral category.

---

## 3. Typography

**Interface:** `Inter` (Google Fonts) with a real system fallback stack.
**Data / identifiers:** `JetBrains Mono`.

Mono is mandatory for: transaction IDs, entity IDs, risk scores, thresholds, deltas, counts, timestamps,
feature names. Analysts compare these vertically; proportional digits break scanning.

### 3.1 Scale

| Token | Size | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| `--fs-display` | 30px | 300 | −0.03em | View title (one per view) |
| `--fs-metric` | 34px | 300 (mono) | −0.02em | Hero metric numerals |
| `--fs-h1` | 21px | 500 | −0.02em | Section title |
| `--fs-h2` | 16px | 600 | −0.01em | Panel title |
| `--fs-h3` | 14px | 600 | 0 | Sub-panel / row title |
| `--fs-body` | 14px | 400 | 0 | Body copy |
| `--fs-sm` | 13px | 400 | 0 | Secondary copy, table cells |
| `--fs-xs` | 12px | 500 | 0 | Metadata, chips |
| `--fs-micro` | 11px | 600 | +0.09em | Eyebrow labels (uppercase permitted here only) |

Line height: 1.15 display · 1.3 headings · 1.5 body · 1.4 dense rows.

### 3.2 Rules

- **Uppercase is rationed.** Permitted only at `--fs-micro` for eyebrow/section labels and status chips.
  Never uppercase a sentence, a button, a panel title, or a value. The previous design's wall of caps is
  a defect this system exists to remove.
- Light weight (300) only at ≥30px. Below that it fails on dark backgrounds.
- Negative tracking scales with size; never apply negative tracking below 16px.
- One `--fs-display` per view. Competing display type destroys the hierarchy.
- Numerals: `font-variant-numeric: tabular-nums` on every metric, table, and meter.

---

## 4. Spacing and layout

4px base unit. Only these values may appear in layout code:

`--space-1:4 · --space-2:8 · --space-3:12 · --space-4:16 · --space-5:20 · --space-6:24 · --space-8:32 · --space-10:40 · --space-12:48 · --space-16:64`

| Context | Spacing |
| --- | --- |
| Inside a chip / inline control | `--space-2` |
| Panel padding | `--space-5` to `--space-6` |
| Between related panels | `--space-4` |
| Between composition rows | `--space-6` |
| Section separation | `--space-8` |
| Page top / bottom | `--space-6` / `--space-16` |

### 4.1 Composition

- Max content width `1680px`; the graph stage may run to the full workspace width.
- **Asymmetry is intentional.** Primary composition rows use `1.6fr / 1fr` or `1fr / 1.4fr`, not equal thirds.
- Never build a page as N identical cards in a uniform grid. Group by meaning: an editorial header, a
  dense list, a floating detail pane.
- Alignment: everything snaps to the 4px grid; optical alignment wins over mathematical when they conflict.

### 4.2 Radii

`--radius-xs:4 · --radius-sm:8 · --radius-md:12 · --radius-lg:16 · --radius-xl:22 · --radius-pill:999px`

Larger surfaces take larger radii (panel `--radius-lg`, chip `--radius-pill`, inline well `--radius-sm`).
Nested corners: inner radius = outer − padding, never equal.

---

## 5. Elevation, glass, glow

### 5.1 Shadows

| Token | Value | Use |
| --- | --- | --- |
| `--elev-1` | `0 1px 2px rgba(0,0,0,0.4)` | Inline controls |
| `--elev-2` | `0 10px 30px -12px rgba(0,0,0,0.6)` | L2 panels |
| `--elev-3` | `0 20px 50px -16px rgba(0,0,0,0.7)` | L3/L4 floating |
| `--elev-4` | `0 34px 80px -22px rgba(0,0,0,0.8)` | L5 overlay |

### 5.2 Blur

`--blur-sm: 8px · --blur-md: 16px · --blur-lg: 24px`

Blur is capped at 24px. **Never more than ~6 blurred surfaces composited at once** — this is a performance
rule, not a taste rule (see §11). Large scroll-region backgrounds must not be blurred; blur the chrome
and the floating panes only.

### 5.3 Glow — the scarcity rule

Glow is the most abused effect in dark UI. In this system it carries meaning, so it is **rationed to four
situations**:

1. Active navigation item (teal, small)
2. Focal / selected graph entity (gold, medium)
3. Critical risk state (red, medium) — critical only, never high/medium/low
4. Keyboard focus ring (teal, small)

Everything else establishes emphasis with border, contrast, weight, or spacing. If a screenshot shows more
than ~3 glowing elements at rest, it is wrong.

| Token | Value |
| --- | --- |
| `--glow-teal` | `0 0 20px -4px rgba(69,214,205,0.45)` |
| `--glow-gold` | `0 0 26px -4px rgba(226,171,99,0.40)` |
| `--glow-critical` | `0 0 24px -6px rgba(255,77,97,0.45)` |

---

## 6. Motion

Motion communicates spatial continuity. It never entertains.

### 6.1 Duration tokens

| Token | Value | Use |
| --- | --- | --- |
| `--dur-instant` | 90ms | Color/opacity on hover of small controls |
| `--dur-fast` | 150ms | Buttons, chips, icons, tooltips |
| `--dur-base` | 240ms | Panels, dropdowns, inspectors, list rows |
| `--dur-slow` | 420ms | View/tab transitions, layout expansion |
| `--dur-graph` | 700ms | Camera moves, focus transitions, zoom-to-fit |

### 6.2 Easing

| Token | Curve | Use |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Default — entrances, expansions |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Reversible state changes |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Exits, dismissals |

### 6.3 Permitted motion vocabulary

- opacity 0 → 1
- translateY ±8px (entrances), translateX ±4px (lateral affordance)
- scale 0.985 → 1 (never below 0.97, never above 1.02)
- blur 6px → 0 on view entrance only
- height/max-height for disclosure
- 1px lift on hover (`translateY(-1px)`)

### 6.4 Forbidden

Bouncing/overshoot springs · continuous floating or pulsing at rest · particle fields · animating every
element of a list simultaneously · motion that delays reading data · anything that moves while the analyst
is trying to compare numbers.

### 6.5 View transitions

Tab changes must express one continuous environment, not a page swap:

- Outgoing view: `opacity → 0`, `translateY(-6px)`, `--dur-fast`, `--ease-exit`
- Incoming view: `opacity 0 → 1`, `translateY(8px) → 0`, `blur(6px) → 0`, `--dur-slow`, `--ease-out`
- **Anchored chrome:** rail, command bar, and view title do not animate out. They persist and update in
  place, so the frame stays still while content moves through it.
- Staggering: at most 3 groups, ≤60ms apart. Never stagger per-row across a long list.

### 6.6 Reduced motion

Under `prefers-reduced-motion: reduce`: all durations collapse to ≤1ms, transforms and blur transitions are
removed, graph auto-orbit is disabled and its control is marked unavailable, camera moves become instant
cuts. Opacity changes may remain. This is enforced globally in one block — components must not re-enable it.

---

## 7. Components

### 7.1 Panel (L2)
Background `--surface-1` · 1px `--line-hairline` · `--radius-lg` · `--edge-light` · `--elev-2` ·
padding `--space-6`. Hover (only when interactive): border → `--line-soft`, `translateY(-1px)`.
A panel header is: optional micro eyebrow, `--fs-h2` title, optional `--fs-sm` muted subtitle, optional
right-aligned meta chip. No icon boxes in panel headers.

### 7.2 Floating pane (L3)
`--surface-3` + `backdrop-filter: blur(var(--blur-md))` · 1px `--line-soft` · `--radius-md` · `--elev-3`.
Used for: graph inspector, graph legend, graph toolbar, verdict strip, console bar.

### 7.3 Navigation rail (L4)
72px icon rail, expands to 236px. Item = 18px icon + label, `--radius-sm`, 40px tall.
Active state: `--surface-hover` fill, teal icon, `--text-primary` label, and a **2px teal indicator bar**
on the left edge that *slides* between items (`--dur-base`, `--ease-out`) rather than cutting.
Hover: `--surface-hover` at 60%, no movement. Collapsed rail keeps labels in `title` + `aria-label`.

### 7.4 Command bar (top, L4)
Height 56px. Left: view identity (eyebrow + title, updates in place). Right: integrated controls —
status indicator, search/lookup, and primary action. Controls are ghost-style: transparent fill, hairline
border, teal on hover. No filled "Bootstrap" buttons in the chrome.

### 7.5 Console bar (bottom, L3, investigate view)
Floating, centered, max 760px, `--radius-pill` outer with an inset field. Contains a deterministic query
input plus scope chips. **Must carry a persistent "Deterministic" marker** — see §9.

### 7.6 Buttons

| Variant | Rest | Hover | Active |
| --- | --- | --- | --- |
| `ghost` | transparent, hairline border, `--text-secondary` | `--surface-hover`, `--line-soft`, `--text-primary` | scale 0.99 |
| `subtle` | `--surface-raised`, hairline | `--surface-hover`, teal text | scale 0.99 |
| `primary` | teal 12% fill, teal border, teal text | teal 18% fill, `--glow-teal` | scale 0.99 |
| `danger` | risk-high 12% fill, risk border | 18% fill | scale 0.99 |

Never a saturated solid-fill button — it breaks the atmospheric depth. Height 34px standard, 28px compact.

### 7.7 Metric
Micro label (muted) · value in mono at `--fs-metric` or `--fs-h1` · unit at `--fs-xs` muted, baseline-aligned ·
optional delta chip (risk-low/high per direction, with explicit ▲/▼) · optional `--fs-xs` comparison line.
Metrics sit inline in composed rows — they do **not** each get their own card.

### 7.8 Chip / badge
`--radius-pill` · `--fs-xs` · 10% tinted fill of its semantic hue · 1px border at 30% of that hue ·
text at full hue. Status chips may use `--fs-micro` uppercase.

### 7.9 Data table
Header: `--fs-micro`, muted, uppercase, 1px bottom `--line-hairline`. Rows: 1px bottom
`rgba(255,255,255,0.04)`, hover `--surface-hover`. Numeric columns mono + tabular + right-aligned.
Emphasis row (mean/total): `--surface-raised` fill, weight 600. Tables live in a well (`--bg-hollow`)
inside a panel, never as a bare card.

### 7.10 Meter / threshold bar
6px track, `--radius-pill`, `--bg-hollow` fill. Score fill uses the risk hue of the current verdict.
Threshold marker is a 2px full-height notch in `--text-primary` at 70% with a 1px dark outline so it stays
legible over any fill color. Always paired with a numeric readout — never a bar alone.

### 7.11 Disclosure
Summary row with a rotating 8px chevron (`--dur-fast`). Content expands with height +opacity at
`--dur-base`. Technical/raw feature tables live here so the default view stays interpretable.

### 7.12 Card usage rule
A card is justified only when a block is **independently actionable or independently scannable**
(e.g. a case in the queue). Reference data, metrics, and explanations are grouped with dividers,
wells, and headings inside one panel instead. Target: no view should read as more than ~6 boxes.

---

## 8. Graph visualization

The 3D ego-network is the centerpiece of the investigation experience, not a chart.

### 8.1 Stage
Minimum 520px tall, full workspace width, `--radius-lg`, inset hairline ring, background transparent to a
local radial bloom so the graph feels embedded in the atmosphere. All controls float over it (L3).

### 8.2 Entity encoding

| Entity | Color | Size | Note |
| --- | --- | --- | --- |
| Focal customer | `--accent-champagne` | 20 | Only node permitted a glow; the visual anchor |
| Shared customer | `#9fc4c9` pale teal | 6.5 | Population, deliberately quiet |
| Device | `--accent-cyan` | 10 | |
| Payment method | `--risk-low` | 10 | |
| Merchant | `--accent-gold` | 14 | |

### 8.3 Edge encoding

| Edge | Color | Width | Meaning |
| --- | --- | --- | --- |
| Shared / multiplexed | `--risk-high` | 2.4 | **Risk signal** — shared device/PM across accounts |
| Focal-incident | `--accent-gold` @ 55% | 1.4 | Structural spine radiating from the focal entity |
| Ambient | teal @ 22% | 0.8 | Background topology |

Directional particles are permitted **only** on shared/multiplex edges (the risk carriers), capped at 3 per
edge, and disabled under reduced motion.

### 8.4 Focus behavior
On hover or select: highlight the entity and its incident edges; dim everything unrelated to
**12% opacity**; move the camera over `--dur-graph` with an eased path; reveal the inspector with a
`--dur-base` entrance. Deselect restores full opacity over `--dur-base`. No flashing, no strobing, no
color cycling.

### 8.5 Inspector
L3 pane anchored top-right of the stage: entity-type eyebrow, mono entity id, relationship classification,
connection count, and a plain-language explanation of *why this entity matters*. It must answer
"why am I looking at this?" without the analyst clicking further.

### 8.6 Window provenance
The stage always displays the causal window (`window_start → window_end`) and observed transaction count
from the API. The zero-lookahead guarantee is a scientific claim of this product and must be visible where
the evidence is shown.

### 8.7 Fallback
The 2D canvas fallback follows the same color, size, and emphasis rules. Degraded rendering is acceptable;
a different visual language is not.

---

## 9. Assistive / analysis surface

The console bar resembles a command interface, but this product has **no generative model**. Therefore:

- It executes **deterministic** actions only: case lookup, view navigation, and evidence summaries composed
  from API fields.
- It is permanently marked `Deterministic` and is styled as a **tool**, not an oracle: L3 floating pane,
  no avatar, no typing animation, no anthropomorphic language.
- Its output reuses the exact strings from `reasons[]`, `delta_analysis.explanation`, and
  `recommendation.guidance` — it never paraphrases model output.
- Visual weight is strictly below the evidence panels. If a future LLM integration is added, generated text
  must be enclosed in a visually distinct container labelled as generated, and must never occupy the
  position of the deterministic verdict.

---

## 10. Accessibility

- Contrast: body ≥ 4.5:1, large text ≥ 3:1, essential UI borders ≥ 3:1. Muted text is reserved for
  non-essential metadata.
- Never encode meaning by color alone — risk always carries a text label.
- Focus: 2px `--accent-teal` ring with 2px offset on every interactive element, visible over glass.
  `:focus-visible` only; never remove outlines without replacement.
- Semantics: `<nav>`, `<main>`, `<section>`, `<button>` for actions, `<table>` for tabular data,
  `aria-selected` + `role="tab"` on navigation, `aria-live="polite"` on the toast and the console output,
  `aria-label` on every icon-only control.
- Keyboard: all views and controls reachable by Tab; Enter/Space activate; Escape dismisses overlays;
  the graph provides button equivalents (focus/fit/reset) for every mouse-only camera gesture.
- Reduced motion per §6.6. Reduced transparency is respected by falling back to opaque surfaces.

---

## 11. Performance budget

The 3D graph owns the frame budget. UI must stay out of its way.

- Animate **only** `transform`, `opacity`, and `filter` — never `width`, `top`, `left`, or `box-shadow` in a loop.
- ≤6 simultaneously composited `backdrop-filter` surfaces; none over a long scrolling region.
- No `requestAnimationFrame` loop at rest. Graph physics must settle (`cooldownTicks`) and stop.
- Auto-orbit is opt-in, uses a single rAF loop (never `setInterval`), and cancels on unmount, tab change,
  and reduced-motion.
- Charts redraw on resize via a debounced handler (≥120ms), not per frame.
- `will-change` only on elements that are actively transitioning; never declared globally.
- Graph re-renders only on data change or explicit highlight change — never on unrelated UI state.

---

## 12. Do / Don't

| ✅ Do | ❌ Don't |
| --- | --- |
| Group related facts in one panel with dividers | Give every fact its own bordered card |
| Use gold to mark the single most important thing on screen | Fill large areas with gold or amber |
| Let the graph run edge-to-edge and float controls over it | Box the graph into a small chart tile |
| Show the causal window and sample counts next to claims | Present metrics without provenance |
| Use mono + tabular numerals for all comparable values | Set scores in the proportional UI font |
| Reserve red strictly for risk | Use red as a category or decorative color |
| Keep 2–3 glowing elements at rest, maximum | Add glow to every panel, badge, and border |
| Slide the nav indicator between items | Cut the active state instantly between tabs |
| Label risk with color **and** words | Rely on a red dot to communicate severity |
| Uppercase only 11px eyebrow labels | Uppercase titles, buttons, and values |
| Delete a slot when real data doesn't exist | Fill a slot with a plausible-looking number |
| Anchor chrome and animate only the content | Fade the entire screen on every tab change |

---

## 13. Implementation map

| Concern | Location |
| --- | --- |
| Tokens (§2–§6) | `src/static/styles.css` → `:root` |
| Layer/shell/chrome (§1, §7.3–7.5) | `src/static/styles.css` → *Shell*, `index.html` → `.app-shell` |
| Motion system (§6) | `styles.css` → *Motion*, `app.js` → `switchTab`, `prefersReducedMotion()` |
| Graph rules (§8) | `app.js` → `GRAPH_STYLE`, `init3DCausalNetwork`, `init2DFallbackNetwork` |
| Console bar (§9) | `index.html` → `.console-bar`, `app.js` → `runConsoleQuery` |
| Risk semantics (§2.6) | `styles.css` risk tokens + `app.js` verdict/severity class assignment |

Backend contract (`/health`, `/case/{id}`, `/case/demo/list`, `/score/batch`, `/evaluate`) is **frozen**.
The frontend adapts to it; it does not request changes to it.
