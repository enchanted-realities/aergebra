// Station 2 — JSXGraph in the canvas. The board is a PROJECTION of the model, never the truth.
import JXG from "jsxgraph";
import type { AergebraDoc, AerObject, AerState } from "./model";

const STYLE = {
  point: { size: 3, strokeColor: "#e7e9f0", fillColor: "#0a0b0d", label: { strokeColor: "#8b8fa3", fontSize: 12 } },
  line: { strokeColor: "#e7e9f0", strokeWidth: 1.6 },
  circle: { strokeColor: "#e7e9f0", strokeWidth: 1.6, fillOpacity: 0 },
  polygon: { borders: { strokeColor: "#e7e9f0", strokeWidth: 1.6 }, fillColor: "#7b7ff2", fillOpacity: 0.06 },
  frame: { strokeColor: "#4a4c58", strokeWidth: 1 },
};

const HIGHLIGHT = "#7b7ff2";

// Colour canon (Andrea, ratified — SCU433/438-440). Default (no aerState) is the STYLE.* colours
// above, untouched. charcoal reuses the existing at-rest gray family already used for frames.
const STATE_COLORS: Record<AerState, string> = {
  charcoal: "#4a4c58",
  brown: "#8b5e34",
  orange: "#e8a13c",
  teal: "#2bb5a0",
};

export class BoardView {
  board: JXG.Board;
  private drawn = new Map<string, JXG.GeometryElement>();
  private drawnFrames = new Map<string, { rect: JXG.Polygon; label: JXG.Text }>();
  private drawnImages = new Map<string, JXG.Image>();
  private syncing = false;
  private highlighted = new Set<string>();

  constructor(private doc: AergebraDoc, private containerId: string) {
    this.board = this.initBoard();
    doc.subscribe(() => this.sync());
  }

  private initBoard(): JXG.Board {
    return JXG.JSXGraph.initBoard(this.containerId, {
      boundingbox: [-12, 8, 12, -8],
      keepaspectratio: true, // one unit is one unit in both axes — a circle is a circle, a 9-gon isn't squashed
      resize: { enabled: true, throttle: 200 }, // self-heal if the container was 0×0 at init
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
  }

  // Station 9 — Open must hand back a FRESH board: old JSXGraph elements can't be reconciled
  // against an arbitrary loaded doc, so free the board and start empty. Call this BEFORE
  // doc.load(...) so the doc's emit draws the restored state onto the new board.
  rebuild() {
    JXG.JSXGraph.freeBoard(this.board);
    // JSXGraph leaves inline styles (notably `position: relative`) on the freed container,
    // which override our CSS `position: absolute; inset: 0` — the emptied div then measures
    // 0×0 and the new board is created with zero size (a black screen). Clear them so the
    // container measures its CSS-laid-out size again before initBoard reads it.
    document.getElementById(this.containerId)?.removeAttribute("style");
    this.drawn.clear();
    this.drawnFrames.clear();
    this.drawnImages.clear();
    this.highlighted.clear();
    this.board = this.initBoard();
  }

  // Space law: take up space, never clip — and never at ant scale. Content is DATA (the doc's
  // coords), so the fit is computed from the model, not from pixels.
  fitToContent(padRatio = 0.2) {
    const pts = this.doc.objects.filter((o) => o.type === "point" && o.coords);
    if (!pts.length && !this.doc.images.length) return;
    const xs = pts.map((p) => p.coords![0]);
    const ys = pts.map((p) => p.coords![1]);
    for (const img of this.doc.images) {
      xs.push(img.x, img.x + img.width);
      ys.push(img.y, img.y + img.height);
    }
    const xmin = Math.min(...xs), xmax = Math.max(...xs);
    const ymin = Math.min(...ys), ymax = Math.max(...ys);
    const pad = Math.max(xmax - xmin, ymax - ymin, 2) * padRatio;
    this.board.setBoundingBox([xmin - pad, ymax + pad, xmax + pad, ymin - pad], true);
  }

  /** The view as data: board window, content bounds, occupancy — so an agent asks, never screenshots. */
  viewInfo() {
    const [x1, y1, x2, y2] = this.board.getBoundingBox();
    const pts = this.doc.objects.filter((o) => o.type === "point" && o.coords);
    const xs = pts.map((p) => p.coords![0]);
    const ys = pts.map((p) => p.coords![1]);
    const content = pts.length
      ? { xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys) }
      : null;
    const occupancy = content
      ? ((content.xmax - content.xmin) * (content.ymax - content.ymin)) / Math.abs((x2 - x1) * (y1 - y2))
      : 0;
    return { board: { xmin: x1, xmax: x2, ymin: y2, ymax: y1 }, content, occupancy };
  }

  // Station 10 — export the live SVG root as a standalone, downloadable document.
  exportSvg(): string {
    const svg = document.getElementById(this.containerId)?.querySelector("svg");
    if (!svg) return "";
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    return new XMLSerializer().serializeToString(clone);
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
      this.syncImages(); // background images draw first — geometry stacks on top
      for (const obj of this.doc.objects) {
        const existing = this.drawn.get(obj.id);
        if (existing) {
          if (obj.type === "point" && obj.coords) {
            const p = existing as JXG.Point;
            const [x, y] = obj.coords;
            if (p.X() !== x || p.Y() !== y) p.setPosition(JXG.COORDS_BY_USER, obj.coords);
            const label = obj.meaning ?? "";
            if (p.getName() !== label) p.setAttribute({ name: label, withLabel: !!obj.meaning });
          }
          // Highlight wins while active — the state colour is only reasserted once
          // clearHighlightObjects() runs, so a live highlight is never fought over.
          if (!this.highlighted.has(obj.id)) this.applyBaseStyle(obj, existing);
          continue;
        }
        const el = this.draw(obj);
        this.applyBaseStyle(obj, el);
        this.drawn.set(obj.id, el);
      }
      this.syncFrames();
      this.board.update();
    } finally {
      this.syncing = false;
    }
  }

  // Station 8 — a frame is a derived bounding rectangle over a group's members: it carries no
  // geometry of its own, it is recomputed from member point coordinates on every sync.
  private frameBounds(memberIds: string[]): [number, number, number, number] | null {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const id of memberIds) {
      const obj = this.doc.get(id);
      if (!obj) continue;
      const points = obj.type === "point" ? [obj] : obj.parents.map((pid) => this.doc.get(pid));
      for (const p of points) {
        if (p?.type === "point" && p.coords) { xs.push(p.coords[0]); ys.push(p.coords[1]); }
      }
    }
    if (!xs.length) return null;
    const pad = 0.6;
    return [Math.min(...xs) - pad, Math.max(...ys) + pad, Math.max(...xs) + pad, Math.min(...ys) - pad]; // xmin, ymax, xmax, ymin
  }

  private syncFrames() {
    for (const frame of this.doc.frames) {
      const group = this.doc.groups.find((g) => g.id === frame.frameOf);
      const bounds = group && this.frameBounds(group.members);
      if (!group || !bounds) continue;
      const [xmin, ymax, xmax, ymin] = bounds;
      const corners: [number, number][] = [[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax]];
      const existing = this.drawnFrames.get(frame.id);
      if (!existing) {
        const rect = this.board.create("polygon", corners, {
          fillColor: "none",
          fillOpacity: 0,
          borders: STYLE.frame,
          vertices: { visible: false },
          highlight: false,
          fixed: true,
        });
        const label = this.board.create("text", [xmin, ymax + 0.25, group.name], { color: "#8b8fa3", fontSize: 12, fixed: true });
        this.drawnFrames.set(frame.id, { rect, label });
      } else {
        // JSXGraph closes a polygon's vertex list with a duplicate of vertex[0] — only the first
        // 4 are the real corners.
        corners.forEach((c, i) => existing.rect.vertices[i]?.setPosition(JXG.COORDS_BY_USER, c));
        existing.label.setPosition(JXG.COORDS_BY_USER, [xmin, ymax + 0.25]);
      }
    }
  }

  // Station 10 — an imported SVG becomes a movable background image, receipted like everything else.
  private syncImages() {
    for (const image of this.doc.images) {
      const existing = this.drawnImages.get(image.id);
      if (existing) {
        if (existing.X() !== image.x || existing.Y() !== image.y) existing.setPosition(JXG.COORDS_BY_USER, [image.x, image.y]);
        continue;
      }
      const el = this.board.create("image", [image.href, [image.x, image.y], [image.width, image.height]], { fixed: false });
      el.on("drag", () => this.doc.moveImage(image.id, Number(el.X().toFixed(3)), Number(el.Y().toFixed(3))));
      this.drawnImages.set(image.id, el);
    }
  }

  private draw(obj: AerObject): JXG.GeometryElement {
    switch (obj.type) {
      case "point": {
        // Label law (Andrea): no alphabet on the board — a point shows its MEANING or nothing.
        // The algebra panel still carries the minted name; the board is not the alphabet.
        const p = this.board.create("point", obj.coords ?? [0, 0], {
          name: obj.meaning ?? "",
          withLabel: !!obj.meaning,
          ...STYLE.point,
        });
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
  // Colour canon note: highlight touches strokeColor/fillColor same as before — it wins outright
  // while active. Polygon highlight is the fill (as it always was); a polygon's state colour lives
  // on its border, so the two never actually collide on screen.
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

  // Restores each element to its colour-canon state (or default styling if no state is set) —
  // never to a hardcoded base, so a highlighted brown segment comes back brown, not default.
  clearHighlightObjects() {
    for (const id of this.highlighted) {
      const obj = this.doc.get(id);
      const el = this.drawn.get(id);
      if (!obj || !el) continue;
      this.applyBaseStyle(obj, el);
      if (obj.type === "segment") el.setAttribute({ strokeWidth: STYLE.line.strokeWidth });
      else if (obj.type === "circle") el.setAttribute({ strokeWidth: STYLE.circle.strokeWidth });
    }
    this.highlighted.clear();
    this.board.update();
  }

  // Colour canon (Andrea, ratified — SCU433/438-440): applies the object's aerState colour, or
  // the untouched default STYLE.* colour when no state is set. Segments/circles: strokeColor.
  // Polygons: the BORDER strokeColor (fill stays the separate highlight channel, station 6).
  // Points: strokeColor + fillColor together — the indicator is one solid dot of colour.
  private applyBaseStyle(obj: AerObject, el: JXG.GeometryElement) {
    const stateColor = obj.aerState ? STATE_COLORS[obj.aerState] : null;
    switch (obj.type) {
      case "point":
        el.setAttribute({
          strokeColor: stateColor ?? STYLE.point.strokeColor,
          fillColor: stateColor ?? STYLE.point.fillColor,
        });
        break;
      case "segment":
        el.setAttribute({ strokeColor: stateColor ?? STYLE.line.strokeColor });
        break;
      case "circle":
        el.setAttribute({ strokeColor: stateColor ?? STYLE.circle.strokeColor });
        break;
      case "polygon": {
        const color = stateColor ?? STYLE.polygon.borders.strokeColor;
        const poly = el as unknown as { borders?: JXG.GeometryElement[] };
        (poly.borders ?? []).forEach((b) => b.setAttribute({ strokeColor: color }));
        break;
      }
    }
  }
}
