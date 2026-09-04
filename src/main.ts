// Aergebra — built to SCU7, station by station. Reuse don't lose.
import "./jsxgraph.css";
import "./style.css";
import { MathfieldElement } from "mathlive"; // registers the <math-field> custom element
// Vite's dep pre-bundling breaks MathLive's relative font lookup; the fonts are copied to
// public/fonts (from node_modules/mathlive/fonts) and served from the site root instead.
MathfieldElement.fontsDirectory = `${import.meta.env.BASE_URL}fonts`;
import { AergebraDoc } from "./model";
import { BoardView } from "./render";
import { ToolController, TOOLS } from "./tools";
import { Inspector } from "./inspector";
import { importGgb } from "./ggbimport";
import { createToolApi, executeToolCall } from "./toolapi";
import { registerWebMcp } from "./webmcp";
import { runCommandLine } from "./cmdline";

const AUTOSAVE_KEY = "aergebra:autosave";

const doc = new AergebraDoc();
doc.receipt("open", { app: "aergebra", recipe: "SCU7", note: "document opened" });

const view = new BoardView(doc, "board");
const tools = new ToolController(doc, view, document.getElementById("canvas-wrap")!);
const inspector = new Inspector(doc, document.getElementById("inspector")!, view);

// Station 13 — every mutation, human-typed or agent-driven, goes through this SAME façade.
const toolApi = createToolApi(doc, view);
(window as unknown as { Aergebra: typeof toolApi }).Aergebra = toolApi;

// Station 14 — the WebMCP-shaped seam: any agent driving the page calls the same tools through
// one entry point. See AGENTS.md.
(window as unknown as { __aergebra_execute: (input: unknown) => unknown }).__aergebra_execute = (input: unknown) =>
  executeToolCall(toolApi, input);

// WebMCP proper — the seam plugged into the Web Model Context API. Agent calls echo in the
// same command-line output a human's typed calls use; the badge in that bar says whether the
// browser offers a model context at all.
const webMcpBadge = document.getElementById("webmcp-badge")!;
const echoAgentCall = (line: string) => {
  document.getElementById("cmdline-output")!.textContent = line;
};
let webMcpRegistered = false;
function tryRegisterWebMcp() {
  if (webMcpRegistered) return;
  const status = registerWebMcp(toolApi, echoAgentCall);
  webMcpRegistered = status.available;
  webMcpBadge.textContent = status.available
    ? `WebMCP · ${status.toolCount} tools live`
    : "WebMCP · not offered by this browser";
  webMcpBadge.classList.toggle("live", status.available);
}
tryRegisterWebMcp();
// A model context injected after load (an extension, a polyfill, an agentic browser attaching
// late) still gets the tools: re-check briefly, and leave a manual hook on the window.
for (const delay of [500, 1500, 4000]) setTimeout(tryRegisterWebMcp, delay);
(window as unknown as { __aergebra_webmcp_register: () => void }).__aergebra_webmcp_register = tryRegisterWebMcp;

// Station 9 — restore autosave on boot (board/tools/inspector are already subscribed, so the
// restored state draws onto the still-empty initial board), then wire autosave going forward.
const autosaved = localStorage.getItem(AUTOSAVE_KEY);
if (autosaved) {
  try {
    doc.load(autosaved);
  } catch (err) {
    console.warn("Aergebra: autosave restore failed", err);
  }
} else {
  // First visit: open on the demo mission instead of a blank board, through the same load(...)
  // any agent or Open click uses. Deferred past the first layout — a load's rebuild measures
  // the board container, and before first paint it measures 0×0 (a black board). A failed
  // fetch just leaves the empty board — never blocks boot.
  const loadDemo = () =>
    fetch(`${import.meta.env.BASE_URL}demo/scu65-mission.aergebra.json`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        if (!localStorage.getItem(AUTOSAVE_KEY) && doc.objects.length === 0) toolApi.load(json);
      })
      .catch((err) => console.warn("Aergebra: demo load skipped", err));
  // ?blank=1 skips the demo — an automation or a fresh workspace can ask for the empty board.
  if (!new URLSearchParams(location.search).has("blank")) {
    requestAnimationFrame(() => requestAnimationFrame(loadDemo));
  }
}
doc.subscribe(() => localStorage.setItem(AUTOSAVE_KEY, doc.serialize()));

const rail = document.getElementById("toolrail")!;
const status = document.getElementById("status")!;

// Rail icons — the v8 shell's Lucide set (aergebra-v8-src/app/page.tsx:855-865: MousePointer2, Grip,
// Circle, Pentagon), inlined as SVG so nothing loads over the network. Point has no shell icon
// (the shell's rail has no point tool) — it's a filled circle, the one glyph the canon allows.
const SVG_OPEN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`;
const RAIL_ICONS: Record<string, string> = {
  arrow: `${SVG_OPEN}<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/></svg>`,
  point: `${SVG_OPEN}<circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`,
  segment: `${SVG_OPEN}<circle cx="12" cy="5" r="1"/><circle cx="19" cy="5" r="1"/><circle cx="5" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="19" cy="19" r="1"/><circle cx="5" cy="19" r="1"/></svg>`,
  circle: `${SVG_OPEN}<circle cx="12" cy="12" r="10"/></svg>`,
  polygon: `${SVG_OPEN}<path d="M10.83 2.38a2 2 0 0 1 2.34 0l8 5.74a2 2 0 0 1 .73 2.25l-3.04 9.26a2 2 0 0 1-1.9 1.37H7.04a2 2 0 0 1-1.9-1.37L2.1 10.37a2 2 0 0 1 .73-2.25z"/></svg>`,
};

const statusHint = document.getElementById("status-hint")!;
function renderRail() {
  rail.innerHTML = "";
  for (const t of TOOLS) {
    const b = document.createElement("button");
    b.innerHTML = `${RAIL_ICONS[t.id] ?? ""}<span>${t.label}</span>`;
    b.className = tools.active === t.id ? "active" : "";
    b.setAttribute("aria-label", t.label);
    b.addEventListener("click", () => tools.setTool(t.id));
    rail.appendChild(b);
  }
  statusHint.textContent = tools.hint; // the shell's .aergebra-hint chip (AergebraBoard.tsx:208)
}
// Status row string as the shell mounts it (AergebraBoard.tsx:211): "SCU7 · N receipts".
const renderStatus = () => { status.textContent = `SCU7 · ${doc.receipts.length} receipts`; };
tools.subscribe(renderRail);
doc.subscribe(renderStatus);
doc.subscribe(renderRail);
renderRail();
renderStatus();

// Station 9 — editable title, Save (.aergebra.json), Open (.aergebra.json or .scu), Export .scu.
const titleInput = document.getElementById("doc-title") as HTMLInputElement;
titleInput.value = doc.title;
doc.subscribe(() => { if (document.activeElement !== titleInput) titleInput.value = doc.title; });
const commitTitle = () => doc.setTitle(titleInput.value.trim() || "Untitled project");
titleInput.addEventListener("blur", commitTitle);
titleInput.addEventListener("keydown", (e) => { if (e.key === "Enter") titleInput.blur(); });

function sanitizeFilename(name: string): string {
  return name.trim().replace(/[^a-z0-9 _-]/gi, "_") || "untitled";
}

function downloadText(filename: string, text: string, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById("btn-save")!.addEventListener("click", () => {
  downloadText(`${sanitizeFilename(doc.title)}.aergebra.json`, doc.serialize());
});

document.getElementById("btn-export-scu")!.addEventListener("click", () => {
  const groupId = inspector.selectedGroupId();
  const name = groupId ? doc.groups.find((g) => g.id === groupId)?.name ?? "scu" : doc.title;
  downloadText(`${sanitizeFilename(name)}.scu`, doc.serializeScu(groupId ?? undefined));
});

// One Import verb, as the shell has it (page.tsx:1398-1399): the file's extension decides whether it's
// a document to open, an image to underlay, or a .ggb construction to import.
const fileImport = document.getElementById("file-import") as HTMLInputElement;
document.getElementById("btn-import")!.addEventListener("click", () => fileImport.click());
fileImport.addEventListener("change", async () => {
  const file = fileImport.files?.[0];
  fileImport.value = "";
  if (!file) return;
  const name = file.name.toLowerCase();
  if (name.endsWith(".ggb")) return importGgbFile(file);
  if (name.endsWith(".json") || name.endsWith(".scu")) return openDocumentFile(file);
  return importImageFile(file);
});

async function openDocumentFile(file: File) {
  const text = await file.text();
  const result = toolApi.load(text); // same façade a typed load(...) or an agent would use
  if (!result.ok) alert(`Aergebra: could not open "${file.name}" — ${result.error}`);
}

// Station 10 — SVG import/export. Export serializes the live board's own SVG root; import places
// the file as a movable background image object, self-contained as a data: URL (no external ref).
document.getElementById("btn-export-svg")!.addEventListener("click", () => {
  const svgText = view.exportSvg();
  if (!svgText) return;
  downloadText(`${sanitizeFilename(doc.title)}.svg`, svgText, "image/svg+xml");
});

function svgToDataUrl(svgText: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svgText)}`;
}

/** Height/width ratio read from an SVG's own viewBox or width/height, so an import isn't stretched. */
function svgAspect(svgText: string): number {
  try {
    const parsed = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const root = parsed.documentElement;
    const viewBox = root.getAttribute("viewBox");
    if (viewBox) {
      const parts = viewBox.trim().split(/\s+/).map(Number);
      if (parts.length === 4 && parts[2] > 0) return parts[3] / parts[2];
    }
    const w = parseFloat(root.getAttribute("width") || "");
    const h = parseFloat(root.getAttribute("height") || "");
    if (w > 0 && h > 0) return h / w;
  } catch {
    // fall through to the default square aspect below
  }
  return 1;
}

async function importImageFile(file: File) {
  const width = 8;
  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    const text = await file.text();
    const height = width * svgAspect(text);
    doc.createImage(svgToDataUrl(text), { x: -width / 2, y: height / 2, width, height });
    return;
  }
  // Raster photo (png/jpeg/webp): same movable background image object, so geometry can be
  // drawn OVER the photo — "this right here is the problem", pointed at, meant, receipted.
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const aspect = await new Promise<number>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 1);
    img.onerror = () => resolve(1);
    img.src = dataUrl;
  });
  const height = width * aspect;
  doc.createImage(dataUrl, { x: -width / 2, y: height / 2, width, height });
}

// Station 11 — real .ggb construction import: real points/segments/circles/polygons in the
// Inspector, never a thumbnail. Unsupported elements are skipped and receipted, never invented.
async function importGgbFile(file: File) {
  try {
    const summary = await importGgb(doc, file);
    const skippedNote = summary.skipped.length ? `; skipped ${summary.skipped.length} (see receipts)` : "";
    status.textContent = `Imported ${file.name}: ${summary.imported.points} points, ${summary.imported.segments} segments, ${summary.imported.circles} circles, ${summary.imported.polygons} polygons${skippedNote}`;
  } catch (err) {
    alert(`Aergebra: could not import "${file.name}" — ${(err as Error).message}`);
  }
}

// Station 13 — the bottom bar becomes a command line: the SAME window.Aergebra calls, typed.
const cmdInput = document.getElementById("cmdline-input") as HTMLInputElement;
const cmdRun = document.getElementById("cmdline-run")!;
const cmdOutput = document.getElementById("cmdline-output")!;

function runCmdLine() {
  const line = cmdInput.value;
  if (!line.trim()) return;
  const output = runCommandLine(toolApi, line);
  cmdOutput.textContent = `${line} → ${output}`;
  cmdInput.value = "";
}
// Tap-first (the Run button); Enter is a desktop bonus — never a required keyboard modifier.
cmdRun.addEventListener("click", runCmdLine);
cmdInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runCmdLine(); });
