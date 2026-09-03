// Aergebra — built to SCU7, station by station. Reuse don't lose.
import "jsxgraph/distrib/jsxgraph.css";
import "./style.css";
import { AergebraDoc } from "./model";
import { BoardView } from "./render";
import { ToolController, TOOLS } from "./tools";
import { Inspector } from "./inspector";

const doc = new AergebraDoc();
doc.receipt("open", { app: "aergebra", recipe: "SCU7", note: "document opened" });

const view = new BoardView(doc, "board");
const tools = new ToolController(doc, view, document.getElementById("canvas-wrap")!);
new Inspector(doc, document.getElementById("inspector")!);

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
