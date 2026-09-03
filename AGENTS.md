# Aergebra — agent tool API

Aergebra is a basic JSXGraph-backed geometry app built to the SCU7 recipe. The MODEL is the
truth; the board is a projection. Every mutation — from the toolrail, the math line, the bottom
command line, or an agent — goes through the same document model (`AergebraDoc`) and appends a
receipt. Nothing bypasses it.

This file documents the two ways an agent (or any script) can drive Aergebra: the typed façade
`window.Aergebra`, and the single JSON entry point `window.__aergebra_execute`. Both call the
exact same underlying methods a human uses at the bottom bar — there is no separate "agent
grammar" and no network call. The API is the point.

## `window.Aergebra` — the typed façade

Defined in `src/toolapi.ts`, assigned to `window.Aergebra` in `src/main.ts`. Every method
resolves point/group references by the human-readable name shown in the Inspector (e.g. `"A"`,
`"grp1"`) or by the raw id (`"AER1"`, `"GRP1"`) — either works. Every method returns
`{ ok: true, result }` or `{ ok: false, error }` and never throws.

```ts
interface AergebraToolApi {
  createPoint(x: number, y: number): ApiResult<{ id: string; name: string }>;
  createSegment(a: string, b: string): ApiResult<{ id: string; name: string }>;
  createCircle(center: string, radiusPoint: string): ApiResult<{ id: string; name: string }>;
  createPolygon(...vertices: string[]): ApiResult<{ id: string; name: string }>;
  group(...names: string[]): ApiResult<{ id: string; name: string }>;
  setMeaning(name: string, meaning?: string | null): ApiResult<{ id: string; meaning: string | null }>;
  frame(groupName: string): ApiResult<{ id: string; frameOf: string }>;
  getAlgebra(): string[];             // one algebra line per object, e.g. "A = Point(3, 2) · AER1"
  getReceipts(n?: number): unknown[]; // the last n receipts (default 20)
  load(json: string): ApiResult<{ objects: number }>;  // AERGEBRA_DOC_V1 or SCU_V1
  serialize(): string;                // the whole current document, AERGEBRA_DOC_V1
}
```

Example, from a browser console or any script running on the page:

```js
window.Aergebra.createPoint(2, 3);        // { ok: true, result: { id: "AER1", name: "A" } }
window.Aergebra.createPoint(-2, -3);      // { ok: true, result: { id: "AER2", name: "B" } }
window.Aergebra.createSegment("A", "B");  // { ok: true, result: { id: "AER3", name: "seg1" } }
window.Aergebra.group("A", "B");          // { ok: true, result: { id: "GRP1", name: "grp1" } }
window.Aergebra.setMeaning("A", "launch point");
window.Aergebra.frame("grp1");
window.Aergebra.getAlgebra();
// ["A = Point(2, 3) · AER1 · launch point", "B = Point(-2, -3) · AER2", "seg1 = Segment(A, B) · AER3"]
```

## `window.__aergebra_execute(input)` — the WebMCP-shaped seam

A single entry point so a browser-automation agent (or any driver that would rather send one
call shape than reach for named methods) can call any tool above without knowing JavaScript
method dispatch. Defined in `src/toolapi.ts` as `executeToolCall`, bound to
`window.__aergebra_execute` in `src/main.ts`.

**Input** — either a JSON string or a plain object, shaped:

```json
{ "tool": "createPoint", "args": [2, 3] }
```

`tool` must name one of the `window.Aergebra` methods above; `args` is the positional argument
list (omit or use `[]` for zero-argument tools like `getAlgebra`).

**Output** — always `{ ok: boolean, result?: unknown, error?: string }`. Never throws, even on
malformed JSON, an unknown tool name, or a tool-level failure (unknown point, bad arguments) —
every failure comes back as `{ ok: false, error: "..." }`.

```js
window.__aergebra_execute('{"tool":"createPoint","args":[2,3]}');
// { ok: true, result: { id: "AER1", name: "A" } }

window.__aergebra_execute({ tool: "createSegment", args: ["A", "Z"] });
// { ok: false, error: "Unknown point(s): Z" }

window.__aergebra_execute({ tool: "getAlgebra" });
// { ok: true, result: ["A = Point(2, 3) · AER1"] }
```

This is the **WebMCP-shaped seam**: the same one-entry-point, JSON-in/JSON-out contract a WebMCP
transport would expose to a browsing agent. Today it's callable from any script running on the
page (browser automation, devtools, a future in-page assistant). The actual WebMCP transport
(a declared tool manifest, a handshake, cross-origin exposure) is not implemented — this is the
seam it would attach to, kept deliberately basic until that lands.

## Constraints

- No chat, no network. Every call is synchronous and local to the page.
- Every mutation receipts. `getReceipts(n)` shows the tail of that history — check it after a
  call if you want to confirm what actually happened, not just what the call returned.
- Names aren't guaranteed unique across a long session in the same way ids are (a meaning edit or
  a rename doesn't change an id) — when in doubt, resolve by id (`"AER3"`, `"GRP1"`) rather than
  by name.
- `load(json)` replaces the ENTIRE current document (objects, groups, frames, images, the full
  receipted line) and gives the board a fresh JSXGraph instance. It does not merge.
