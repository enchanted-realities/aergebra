// Aergebra — built to SCU7, station by station. Reuse don't lose.
import "./jsxgraph.css";
import "./style.css";
import { AergebraDoc } from "./model";
import { BoardView } from "./render";
import { ToolController, TOOLS } from "./tools";
import { Inspector } from "./inspector";

const AUTOSAVE_KEY = "aergebra:autosave";

const doc = new AergebraDoc();
doc.receipt("open", { app: "aergebra", recipe: "SCU7", note: "document opened" });

const view = new BoardView(doc, "board");
const tools = new ToolController(doc, view, document.getElementById("canvas-wrap")!);
const inspector = new Inspector(doc, document.getElementById("inspector")!, view);

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

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
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
  try {
    view.rebuild(); // fresh board — old elements can't reconcile against an arbitrary loaded doc
    doc.load(text);
  } catch (err) {
    alert(`Aergebra: could not open "${file.name}" — ${(err as Error).message}`);
  }
});
