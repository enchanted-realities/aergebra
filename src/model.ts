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

  setTitle(title: string) {
    if (title === this.title) return;
    this.title = title;
    this.receipt("title", { title });
    this.emit();
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

  private counterSnapshot() {
    return { seq: this.seq, nextId: this.nextId, nextGroupId: this.nextGroupId, nextFrameId: this.nextFrameId, names: { ...this.counters } };
  }

  // Station 9 — the whole-project save. Format AERGEBRA_DOC_V1: everything round-trips —
  // objects, groups, frames, the full receipted line, and the counters that mint the next id.
  serialize(): string {
    return JSON.stringify(
      {
        format: "AERGEBRA_DOC_V1",
        title: this.title,
        objects: this.objects,
        groups: this.groups,
        frames: this.frames,
        receipts: this.receipts,
        counters: this.counterSnapshot(),
      },
      null,
      2,
    );
  }

  // The Aerth format family (Andrea, 2026-09-04): .acu = the timeline, .scu = a polygon/cluster
  // projection, .htt = hyperbolic time chambers (reserved, not emitted here). Export .scu is the
  // same schema under format SCU_V1 — either the whole current construction, or (with groupId) a
  // self-contained slice: the group, its members, their defining points, and any frame on it.
  serializeScu(groupId?: string): string {
    let objects = this.objects;
    let groups = this.groups;
    let frames = this.frames;
    if (groupId) {
      const group = this.groups.find((g) => g.id === groupId);
      if (group) {
        const ids = new Set<string>(group.members);
        for (const id of group.members) this.get(id)?.parents.forEach((p) => ids.add(p));
        objects = this.objects.filter((o) => ids.has(o.id));
        groups = [group];
        frames = this.frames.filter((f) => f.frameOf === groupId);
      }
    }
    return JSON.stringify(
      { format: "SCU_V1", title: this.title, objects, groups, frames, receipts: this.receipts, counters: this.counterSnapshot() },
      null,
      2,
    );
  }

  /** Highest numeric suffix among ids sharing a prefix — a safety floor for minted ids after load. */
  private static maxSuffix(ids: string[], prefix: string): number {
    let max = 0;
    for (const id of ids) {
      if (!id.startsWith(prefix)) continue;
      const n = Number(id.slice(prefix.length));
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max;
  }

  // Station 9 — load rebuilds the model from a serialized doc (AERGEBRA_DOC_V1 or SCU_V1) and
  // hands back a FRESH board (the caller re-inits BoardView). History is forward-only: the loaded
  // receipts are kept verbatim and a "load" receipt is appended, never inserted or rewritten.
  // Counters are restored from the file, then floored against the actual loaded ids so a hand-edited
  // or foreign file can never mint a colliding AER/GRP/FRM id.
  load(json: string) {
    const data = JSON.parse(json);
    if (data.format !== "AERGEBRA_DOC_V1" && data.format !== "SCU_V1") {
      throw new Error(`Unrecognized format: ${data.format}`);
    }
    this.title = data.title ?? "Untitled project";
    this.objects = Array.isArray(data.objects) ? data.objects : [];
    this.groups = Array.isArray(data.groups) ? data.groups : [];
    this.frames = Array.isArray(data.frames) ? data.frames : [];
    this.receipts = Array.isArray(data.receipts) ? data.receipts : [];

    const c = data.counters ?? {};
    this.seq = Math.max(c.seq ?? 0, ...this.receipts.map((r: Receipt) => r.seq), 0);
    this.nextId = Math.max(c.nextId ?? 1, AergebraDoc.maxSuffix(this.objects.map((o) => o.id), "AER") + 1);
    this.nextGroupId = Math.max(c.nextGroupId ?? 1, AergebraDoc.maxSuffix(this.groups.map((g) => g.id), "GRP") + 1);
    this.nextFrameId = Math.max(c.nextFrameId ?? 1, AergebraDoc.maxSuffix(this.frames.map((f) => f.id), "FRM") + 1);
    this.counters = { ...(c.names ?? {}) };
    for (const type of ["point", "segment", "circle", "polygon"] as AerType[]) {
      const seen = this.objects.filter((o) => o.type === type).length;
      this.counters[type] = Math.max(this.counters[type] ?? 0, seen);
    }

    this.receipt("load", { format: data.format, title: this.title, objects: this.objects.length });
    this.emit();
  }
}
