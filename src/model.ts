// Station 4 — the Aergebra document model.
// The algebra is for the computer: every object is a definition, receipted on append,
// carrying a `meaning` slot from birth (station 7) and parent links that never flatten (station 6).
// Reuse don't lose: shapes mirror the Aerth kernel (records/receipts) so a doc can kapture later.

export type AerType = "point" | "segment" | "circle" | "polygon";

export interface AerObject {
  id: string;              // AER1, AER2… one sequence, everything numbered
  type: AerType;
  name: string;            // A, B, c1, seg1…
  parents: string[];       // ids of defining objects (never flattened)
  coords?: [number, number]; // free points only
  meaning: string | null;  // station 7 slot — present from birth
  createdAt: string;
}

export interface Receipt {
  seq: number;
  at: string;
  action: string;
  details: Record<string, unknown>;
}

export interface AerGroup {
  id: string;              // GRP1, GRP2…
  name: string;
  members: string[];       // object ids — grouping is references, members keep full identity
  meaning: string | null;
  createdAt: string;
}

export interface AerFrame {
  id: string;               // FRM1, FRM2…
  frameOf: string;          // group id — a frame is a PROJECTION of a group, not a new species
  createdAt: string;
}

type Listener = () => void;

export class AergebraDoc {
  title = "Untitled project";
  objects: AerObject[] = [];
  groups: AerGroup[] = [];
  frames: AerFrame[] = [];
  receipts: Receipt[] = [];
  private seq = 0;
  private nextId = 1;
  private counters: Record<string, number> = {};
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  receipt(action: string, details: Record<string, unknown> = {}) {
    this.receipts.push(Object.freeze({ seq: ++this.seq, at: new Date().toISOString(), action, details }));
  }

  private mintName(type: AerType): string {
    if (type === "point") {
      const n = (this.counters.point = (this.counters.point ?? 0) + 1);
      // A, B, … Z, A1, B1…
      const letter = String.fromCharCode(65 + ((n - 1) % 26));
      const round = Math.floor((n - 1) / 26);
      return round === 0 ? letter : `${letter}${round}`;
    }
    const prefix = type === "segment" ? "seg" : type === "circle" ? "c" : "poly";
    const n = (this.counters[type] = (this.counters[type] ?? 0) + 1);
    return `${prefix}${n}`;
  }

  create(type: AerType, opts: { parents?: string[]; coords?: [number, number]; meaning?: string | null } = {}): AerObject {
    const obj: AerObject = {
      id: `AER${this.nextId++}`,
      type,
      name: this.mintName(type),
      parents: opts.parents ?? [],
      coords: opts.coords,
      meaning: opts.meaning ?? null,
      createdAt: new Date().toISOString(),
    };
    this.objects.push(obj);
    this.receipt("create", { id: obj.id, type, name: obj.name, parents: obj.parents, coords: obj.coords });
    this.emit();
    return obj;
  }

  movePoint(id: string, coords: [number, number]) {
    const obj = this.objects.find((o) => o.id === id);
    if (!obj || obj.type !== "point") return;
    obj.coords = [Number(coords[0].toFixed(4)), Number(coords[1].toFixed(4))];
    this.receipt("move", { id, coords: obj.coords });
    this.emit();
  }

  setMeaning(id: string, meaning: string | null) {
    const obj = this.objects.find((o) => o.id === id);
    if (!obj) return;
    obj.meaning = meaning;
    this.receipt("meaning", { id, meaning });
    this.emit();
  }

  get(id: string): AerObject | undefined {
    return this.objects.find((o) => o.id === id);
  }

  // Station 6 — grouping without flattening: a group holds references; nothing merges, nothing loses identity.
  private nextGroupId = 1;
  createGroup(memberIds: string[], name?: string): AerGroup | null {
    const members = memberIds.filter((id) => this.get(id));
    if (members.length < 2) return null;
    const group: AerGroup = {
      id: `GRP${this.nextGroupId++}`,
      name: name ?? `grp${this.nextGroupId - 1}`,
      members,
      meaning: null,
      createdAt: new Date().toISOString(),
    };
    this.groups.push(group);
    this.receipt("group", { id: group.id, name: group.name, members });
    this.emit();
    return group;
  }

  setGroupMeaning(id: string, meaning: string | null) {
    const g = this.groups.find((x) => x.id === id);
    if (!g) return;
    g.meaning = meaning;
    this.receipt("meaning", { id, meaning });
    this.emit();
  }

  // Station 8 — a frame is a derived bounding rectangle over a group: a projection, not a new
  // species. One frame per group; it carries no geometry of its own, only the reference.
  private nextFrameId = 1;
  createFrame(groupId: string): AerFrame | null {
    const group = this.groups.find((g) => g.id === groupId);
    if (!group) return null;
    if (this.frames.some((f) => f.frameOf === groupId)) return null;
    const frame: AerFrame = { id: `FRM${this.nextFrameId++}`, frameOf: groupId, createdAt: new Date().toISOString() };
    this.frames.push(frame);
    this.receipt("frame", { id: frame.id, frameOf: groupId });
    this.emit();
    return frame;
  }

  /** Human/computer-readable definition — the algebra line for the Inspector. */
  definitionOf(obj: AerObject): string {
    switch (obj.type) {
      case "point":
        return `${obj.name} = Point(${obj.coords?.[0] ?? "?"}, ${obj.coords?.[1] ?? "?"})`;
      case "segment": {
        const [a, b] = obj.parents.map((p) => this.get(p)?.name ?? "?");
        return `${obj.name} = Segment(${a}, ${b})`;
      }
      case "circle": {
        const [c, r] = obj.parents.map((p) => this.get(p)?.name ?? "?");
        return `${obj.name} = Circle(${c}, ${r})`;
      }
      case "polygon":
        return `${obj.name} = Polygon(${obj.parents.map((p) => this.get(p)?.name ?? "?").join(", ")})`;
    }
  }

  serialize(): string {
    return JSON.stringify(
      { format: "AERGEBRA_DOC_V1", title: this.title, objects: this.objects, receipts: this.receipts },
      null,
      2,
    );
  }
}
