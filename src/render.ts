// Station 2 — JSXGraph in the canvas. The board is a PROJECTION of the model, never the truth.
import JXG from "jsxgraph";
import type { AergebraDoc, AerObject } from "./model";

const STYLE = {
  point: { size: 3, strokeColor: "#e7e9f0", fillColor: "#0a0b0d", label: { strokeColor: "#8b8fa3", fontSize: 12 } },
  line: { strokeColor: "#e7e9f0", strokeWidth: 1.6 },
  circle: { strokeColor: "#e7e9f0", strokeWidth: 1.6, fillOpacity: 0 },
  polygon: { borders: { strokeColor: "#e7e9f0", strokeWidth: 1.6 }, fillColor: "#7b7ff2", fillOpacity: 0.06 },
};

const HIGHLIGHT = "#7b7ff2";

export class BoardView {
  board: JXG.Board;
  private drawn = new Map<string, JXG.GeometryElement>();
  private syncing = false;
  private highlighted = new Set<string>();

  constructor(private doc: AergebraDoc, containerId: string) {
    this.board = JXG.JSXGraph.initBoard(containerId, {
      boundingbox: [-12, 8, 12, -8],
      axis: true,
      grid: false,
      showCopyright: false,
      showNavigation: false,
      pan: { enabled: true, needTwoFingers: false },
      zoom: { wheel: true, needShift: false },
      defaultAxes: {
        x: { strokeColor: "#3a3b44", ticks: { strokeColor: "#23242b", label: { strokeColor: "#5a5c68", fontSize: 10 } } },
        y: { strokeColor: "#3a3b44", ticks: { strokeColor: "#23242b", label: { strokeColor: "#5a5c68", fontSize: 10 } } },
      },
    });
    doc.subscribe(() => this.sync());
  }

  /** Screen → world coordinates for tool clicks. */
  worldFromEvent(e: PointerEvent): [number, number] {
    const coords = this.board.getUsrCoordsOfMouse(e as unknown as Event);
    return [Number(coords[0].toFixed(3)), Number(coords[1].toFixed(3))];
  }

  private sync() {
    if (this.syncing) return;
    this.syncing = true;
    try {
      for (const obj of this.doc.objects) {
        const existing = this.drawn.get(obj.id);
        if (existing) {
          if (obj.type === "point" && obj.coords) {
            const p = existing as JXG.Point;
            const [x, y] = obj.coords;
            if (p.X() !== x || p.Y() !== y) p.setPosition(JXG.COORDS_BY_USER, obj.coords);
          }
          continue;
        }
        this.drawn.set(obj.id, this.draw(obj));
      }
      this.board.update();
    } finally {
      this.syncing = false;
    }
  }

  private draw(obj: AerObject): JXG.GeometryElement {
    switch (obj.type) {
      case "point": {
        const p = this.board.create("point", obj.coords ?? [0, 0], { name: obj.name, ...STYLE.point });
        p.on("drag", () => this.doc.movePoint(obj.id, [Number(p.X().toFixed(3)), Number(p.Y().toFixed(3))]));
        return p;
      }
      case "segment": {
        const [a, b] = obj.parents.map((id) => this.drawn.get(id) as JXG.Point);
        return this.board.create("segment", [a, b], { name: obj.name, ...STYLE.line });
      }
      case "circle": {
        const [c, r] = obj.parents.map((id) => this.drawn.get(id) as JXG.Point);
        return this.board.create("circle", [c, r], { name: obj.name, ...STYLE.circle });
      }
      case "polygon": {
        const vertices = obj.parents.map((id) => this.drawn.get(id) as JXG.Point);
        return this.board.create("polygon", vertices, { name: obj.name, ...STYLE.polygon });
      }
    }
  }

  // Station 6 — a group is a projection over existing elements: highlight is a style toggle, never a new species.
  highlightObjects(ids: string[]) {
    this.clearHighlightObjects();
    for (const id of ids) {
      const obj = this.doc.get(id);
      const el = this.drawn.get(id);
      if (!obj || !el) continue;
      if (obj.type === "point") el.setAttribute({ strokeColor: HIGHLIGHT, fillColor: HIGHLIGHT });
      else if (obj.type === "polygon") el.setAttribute({ fillColor: HIGHLIGHT, fillOpacity: 0.22 });
      else el.setAttribute({ strokeColor: HIGHLIGHT, strokeWidth: 3 });
      this.highlighted.add(id);
    }
    this.board.update();
  }

  clearHighlightObjects() {
    for (const id of this.highlighted) {
      const obj = this.doc.get(id);
      const el = this.drawn.get(id);
      if (!obj || !el) continue;
      if (obj.type === "point") el.setAttribute({ strokeColor: STYLE.point.strokeColor, fillColor: STYLE.point.fillColor });
      else if (obj.type === "polygon") el.setAttribute({ fillColor: STYLE.polygon.fillColor, fillOpacity: STYLE.polygon.fillOpacity });
      else if (obj.type === "segment") el.setAttribute({ strokeColor: STYLE.line.strokeColor, strokeWidth: STYLE.line.strokeWidth });
      else if (obj.type === "circle") el.setAttribute({ strokeColor: STYLE.circle.strokeColor, strokeWidth: STYLE.circle.strokeWidth });
    }
    this.highlighted.clear();
    this.board.update();
  }
}
