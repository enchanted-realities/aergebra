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
}
doc.subscribe(() => localStorage.setItem(AUTOSAVE_KEY, doc.serialize()));

const rail = document.getElementById("toolrail")!;
const status = document.getElementById("status")!;

function renderRail() {
  rail.innerHTML = "";
  for (const t of TOOLS) {
    const b = document.createElement("button");
    b.textContent = t.label;
    b.className = tools.active === t.id ? "active" : "";
    b.addEventListener("click", () => tools.setTool(t.id));
    rail.appendChild(b);
  }
  status.textContent = `SCU7 · ${tools.active} — ${tools.hint}`;
}
tools.subscribe(renderRail);
doc.subscribe(() => { status.textContent = `SCU7 · ${tools.active} — ${tools.hint}`; });
renderRail();

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

const fileOpen = document.getElementById("file-open") as HTMLInputElement;
document.getElementById("btn-open")!.addEventListener("click", () => fileOpen.click());
fileOpen.addEventListener("change", async () => {
  const file = fileOpen.files?.[0];
  fileOpen.value = "";
  if (!file) return;
  const text = await file.text();
  const result = toolApi.load(text); // same façade a typed load(...) or an agent would use
  if (!result.ok) alert(`Aergebra: could not open "${file.name}" — ${result.error}`);
});

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

const fileImportSvg = document.getElementById("file-import-svg") as HTMLInputElement;
document.getElementById("btn-import-svg")!.addEventListener("click", () => fileImportSvg.click());
fileImportSvg.addEventListener("change", async () => {
  const file = fileImportSvg.files?.[0];
  fileImportSvg.value = "";
  if (!file) return;
  const text = await file.text();
  const width = 8;
  const height = width * svgAspect(text);
  doc.createImage(svgToDataUrl(text), { x: -width / 2, y: height / 2, width, height });
});

// Station 11 — real .ggb construction import: real points/segments/circles/polygons in the
// Inspector, never a thumbnail. Unsupported elements are skipped and receipted, never invented.
const fileImportGgb = document.getElementById("file-import-ggb") as HTMLInputElement;
document.getElementById("btn-import-ggb")!.addEventListener("click", () => fileImportGgb.click());
fileImportGgb.addEventListener("change", async () => {
  const file = fileImportGgb.files?.[0];
  fileImportGgb.value = "";
  if (!file) return;
  try {
    const summary = await importGgb(doc, file);
    const skippedNote = summary.skipped.length ? `; skipped ${summary.skipped.length} (see receipts)` : "";
    status.textContent = `Imported ${file.name}: ${summary.imported.points} points, ${summary.imported.segments} segments, ${summary.imported.circles} circles, ${summary.imported.polygons} polygons${skippedNote}`;
  } catch (err) {
    alert(`Aergebra: could not import "${file.name}" — ${(err as Error).message}`);
  }
});

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
