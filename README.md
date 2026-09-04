# Aergebra

Aergebra is a deliberately basic geometry app — JSXGraph on a canvas, a small document model, and
an Inspector — built to the SCU7 recipe, station by station. The MODEL is the truth and the board
is only a projection of it: every point, segment, circle, and polygon is a receipted entry in the
document, never flattened, so the full history of a construction is always there to read back.
Aergebra is the ENGINE half of the Aergebra project (the v8 workroom is the SHELL that will
eventually mount it) — no frameworks, no decoration, just the four tools and what's built on top
of them.

## The 15 stations

| # | Station | Status |
|---|---|---|
| 1 | Repo + app shell | done |
| 2 | JSXGraph canvas | done |
| 3 | Four creation tools (Point, Segment, Circle, Polygon) | done |
| 4 | Document model (receipts, `meaning` slot, parents never flatten) | done |
| 5 | Inspector (the algebra, live) | done |
| 6 | Grouping without flattening | done |
| 7 | Meaning first-class | done |
| 8 | Footprints/frames | done |
| 9 | Save Aergebra projects (+ Export .scu) | done |
| 10 | SVG/photo import, SVG export | done |
| 11 | Real .ggb construction import | done |
| 12 | MathLive + Compute Engine | done |
| 13 | Tool API + bottom command line | done |
| 14 | Expose tools to agents | done |
| 15 | Exports/demo | done (this) |

## Running it

```
npm install
npm run dev     # vite dev server, default port 5180
```

Open the printed local URL. There's nothing to build for local use; `npm run build` produces a
static `dist/` if you need one.

## The tool API

Every mutation — a toolrail click, a typed math-line command, the bottom command line, or an
agent — goes through the same façade, `window.Aergebra` (`src/toolapi.ts`):

```js
window.Aergebra.createPoint(2, 3);
window.Aergebra.createSegment("A", "B");
window.Aergebra.createCircle("A", "B");
window.Aergebra.createPolygon("A", "B", "C");
window.Aergebra.group("A", "B");
window.Aergebra.setMeaning("A", "launch point");
window.Aergebra.setState("seg1", "brown");  // colour canon — track/indicator state; see below
window.Aergebra.frame("grp1");
window.Aergebra.highlight("A");   // light up a station — the superorganism must SHOW who's live
window.Aergebra.clearHighlight(); // hand off before lighting the next one
window.Aergebra.getAlgebra();     // every object's algebra line
window.Aergebra.getReceipts(20);  // the tail of the receipted history
window.Aergebra.serialize();      // the whole document, AERGEBRA_DOC_V1
window.Aergebra.load(json);       // replaces the document; hands back a fresh board
```

Every method returns `{ ok, result }` or `{ ok: false, error }` and never throws. For a driving
agent that would rather send one call shape, `window.__aergebra_execute({ tool, args })` dispatches
to the same methods — see **AGENTS.md** for the full contract. That seam is now plugged into the
real thing — see **WebMCP** below.

## WebMCP

The page registers **16 tools** with the browser's Web Model Context
(`document.modelContext.registerTool(...)`, with a `navigator.modelContext` fallback and retries
for late-injected contexts) — the [W3C Web Model Context proposal](https://github.com/webmachinelearning/webmcp).
An agent in a WebMCP-capable browser gets the full construction kit: `aergebra_create_point`,
`aergebra_create_segment`, `aergebra_create_circle`, `aergebra_create_polygon`,
`aergebra_group_objects`, `aergebra_set_meaning`, `aergebra_set_state`, `aergebra_frame_group`,
`aergebra_highlight`, `aergebra_clear_highlight`, `aergebra_get_algebra`, `aergebra_get_view`,
`aergebra_get_receipts`, `aergebra_fit_view`, `aergebra_load_document`,
`aergebra_serialize_document`.

The point of it: **agents and humans share live geometry instead of screenshots.** The agent
reads the board as data (`get_algebra`, `get_view` — never pixels), builds on the same board the
human is touching, and *points* (`highlight`) instead of describing locations in prose. Both
kinds of hands go through the same façade, so every action — human tap or agent call — lands on
the same receipt line, and agent calls echo live in the bottom command-line output. The colour
canon is enforced at the boundary: an agent asking for a colour outside the canon is refused
with the rule quoted, not silently corrected.

To try it: Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled (or any browser/agent
that provides a model context, e.g. ChatGPT's in-app browser). The badge in the bottom status row
reports `WebMCP · 16 tools live` when a model context is present. Without one, the page runs
exactly as before — the same tools remain reachable via `window.Aergebra` and
`window.__aergebra_execute`.

### Submission-period work (WebMCP Challenge)

Everything in this repository was built during the Challenge submission period — the commit
history is the evidence: the engine (stations 1–15: document model, tools, Inspector, receipts,
imports/exports, command line, and the `window.Aergebra` / `window.__aergebra_execute` façade)
landed first, station by station, and the WebMCP integration (`src/webmcp.ts`, its wiring in
`src/main.ts`, the status-row badge, and this deployment) landed on top of it, from the commit
"WebMCP proper: the station-14 seam plugged into document.modelContext" onward. The project
qualifies as newly created during the submission period.

The bottom bar is a command line over this same API: type `createPoint(2,3)` and tap Run. The
Inspector's math line (above the object list) additionally runs `Point(...)`, `Segment(...)`,
`Circle(...)`, `Polygon(...)` or evaluates free math through the Compute Engine.

**Walk** — Andrea's superorganism ruling (2026-09-04): the system is a superorganism of narrow
specialists, and the geometry must show which node is live. Select a group in the Inspector and a
"Walk" button appears alongside Frame; one tap steps through the group's members in order,
lighting each one up and handing off to the next — the same `highlight`/`clearHighlight` an
outside agent would call directly to show its own progress through a mission.

## The colour canon (ruled, no red)

`setState(name, state)` — `state` is `"charcoal"`, `"brown"`, `"orange"`, `"teal"`, or `null` to
clear. Two axes, never conflated: TRACK (segment/circle/polygon border — the road) vs
INDICATOR/driver (point — the actor). Colour never judges outcome — a clean NO rests charcoal
same as a clean YES.

- `charcoal` — at rest. Any object.
- `brown` — TRACK ONLY: resting but muddied, undrivable. Rejected on a point.
- `orange` — where the hold sits: on a track, road ready/reserved; on a point, the driver IS the
  brake (deliberate hold).
- `teal` — the axis that's free and willing: on a point, ready to go; on a track, ONLY as the
  held-reserved swap (track teal + point orange = everything ready, parked on purpose).
- No state set = default styling, untouched.

Every change receipts (action `"state"`). An illegal combination (brown on a point) comes back
`{ ok: false, error: "..." }`, never a silent no-op. The Inspector shows the state as a plain text
tag next to a selected row (e.g. `· brown`) — no colour swatches or pickers.

## The Aerth format family

- `.acu` — the timeline format (a receipted line).
- `.scu` — a polygon/cluster projection (Export .scu: the whole construction, or a selected group).
- `.htt` — hyperbolic time chambers. Reserved; Aergebra doesn't emit `.htt` yet.

## config/ — the canon files

`config/` holds the ruled vocabulary from the AERI Normalized Technical Specification and the
ratified AERDNA intake kernel, as literal JSON, for later stations to read rather than re-derive:

- `six-banks.json` — WHO / WHAT / WHERE / WHEN / WHY / HOW.
- `five-stations.json` — Kapture → Construe → Agency (optional) → Settle → Rest.
- `aer-states.json` — the 10 AER states (codes 1–10).
- `station-state-whitelist.json` — the 19 ruled legal Station × State cells (`*` = guarded).
- `fact-modes.json` — the 9 epistemic modes.
- `verification.json` — VERIFIED / UNVERIFIED / NOT_APPLICABLE.

## demo/

`demo/scu65-mission.aergebra.json` — a small mission-shaped construction built entirely through
`window.Aergebra` (not hand-authored JSON): a 9-gon, one vertex point per SCU65 station, each
carrying that station's real caption as its `meaning` (Breach, Response activation, Capability
assembly, Contact and capture, Containment and diagnosis, Fracture and loss, Reassembly and
pursuit, Invasion response, Settlement and handoff — the actual notch labels from
`SCU65-SCU-THE-AVENGERS-MISSION.ggb`), grouped in station order so selecting the group and
tapping Walk lights up each station in sequence. Open it via the topbar's Open button, or:

```js
const json = await (await fetch("/demo/scu65-mission.aergebra.json")).text();
window.Aergebra.load(json);
```
