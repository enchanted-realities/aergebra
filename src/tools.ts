// Station 3 — only four creation tools: Point, Segment, Circle, Polygon.
// Every tool writes to the MODEL; the board just shows it. Arrow (default) is not a creation tool.
import type { AergebraDoc } from "./model";
import type { BoardView } from "./render";

export type ToolId = "arrow" | "point" | "segment" | "circle" | "polygon";

export const TOOLS: Array<{ id: ToolId; label: string }> = [
  { id: "arrow", label: "Arrow" },
  { id: "point", label: "Point" },
  { id: "segment", label: "Segment" },
  { id: "circle", label: "Circle" },
  { id: "polygon", label: "Polygon" },
];

export class ToolController {
  active: ToolId = "arrow";
  private pending: string[] = []; // point ids collected by multi-click tools
  private listeners = new Set<() => void>();

  constructor(private doc: AergebraDoc, private view: BoardView, canvasEl: HTMLElement) {
    canvasEl.addEventListener("pointerdown", (e) => this.onPointerDown(e));
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() { this.listeners.forEach((fn) => fn()); }

  setTool(id: ToolId) {
    this.active = id;
    this.pending = [];
    this.emit();
  }

  get hint(): string {
    switch (this.active) {
      case "arrow": return "drag points · pan · wheel zoom";
      case "point": return "click to place a point";
      case "segment": return this.pending.length === 0 ? "click first end" : "click second end";
      case "circle": return this.pending.length === 0 ? "click the centre" : "click a radius point";
      case "polygon": return this.pending.length < 3 ? `click vertices (${this.pending.length})` : `click vertices (${this.pending.length}) · double-click to close`;
    }
  }

  private onPointerDown(e: PointerEvent) {
    if (this.active === "arrow") return;
    // Ignore clicks on existing points so drags still work; creation happens on empty canvas.
    const world = this.view.worldFromEvent(e);

    if (this.active === "point") {
      this.doc.create("point", { coords: world });
      this.emit();
      return;
    }

    const p = this.doc.create("point", { coords: world });
    this.pending.push(p.id);

    if (this.active === "segment" && this.pending.length === 2) {
      this.doc.create("segment", { parents: this.pending });
      this.pending = [];
    } else if (this.active === "circle" && this.pending.length === 2) {
      this.doc.create("circle", { parents: this.pending });
      this.pending = [];
    } else if (this.active === "polygon" && e.detail >= 2 && this.pending.length >= 3) {
      // double-click closes the polygon (the double click added one extra point; drop it)
      const verts = this.pending.slice(0, -1);
      this.doc.create("polygon", { parents: verts });
      this.pending = [];
    }
    this.emit();
  }
}
