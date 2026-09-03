// Station 13 — a typed façade over the model: every call — human-typed at the bottom command
// line, or driven by an agent (station 14) — goes through the SAME four methods the tools on the
// rail use, so everything receipts. No chat, no network: the API is the point.
import type { AergebraDoc } from "./model";
import type { BoardView } from "./render";

export type ApiResult<T> = { ok: true; result: T } | { ok: false; error: string };

function ok<T>(result: T): ApiResult<T> {
  return { ok: true, result };
}
function fail(error: string): ApiResult<never> {
  return { ok: false, error };
}

/** Resolves a point/object/group by its AER/GRP id, or by the human name shown in the Inspector. */
function resolveObjectId(doc: AergebraDoc, ref: string): string | null {
  if (doc.get(ref)) return ref;
  return doc.objects.find((o) => o.name === ref)?.id ?? null;
}
function resolveGroupId(doc: AergebraDoc, ref: string): string | null {
  if (doc.groups.some((g) => g.id === ref)) return ref;
  return doc.groups.find((g) => g.name === ref)?.id ?? null;
}

export interface AergebraToolApi {
  createPoint(x: number, y: number): ApiResult<{ id: string; name: string }>;
  createSegment(a: string, b: string): ApiResult<{ id: string; name: string }>;
  createCircle(center: string, radiusPoint: string): ApiResult<{ id: string; name: string }>;
  createPolygon(...vertices: string[]): ApiResult<{ id: string; name: string }>;
  group(...names: string[]): ApiResult<{ id: string; name: string }>;
  setMeaning(name: string, meaning?: string | null): ApiResult<{ id: string; meaning: string | null }>;
  frame(groupName: string): ApiResult<{ id: string; frameOf: string }>;
  getAlgebra(): string[];
  getReceipts(n?: number): unknown[];
  load(json: string): ApiResult<{ objects: number }>;
  serialize(): string;
}

export function createToolApi(doc: AergebraDoc, view: BoardView): AergebraToolApi {
  return {
    createPoint(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return fail("createPoint needs two numbers");
      const obj = doc.create("point", { coords: [x, y] });
      return ok({ id: obj.id, name: obj.name });
    },

    createSegment(a, b) {
      const idA = resolveObjectId(doc, a);
      const idB = resolveObjectId(doc, b);
      if (!idA || !idB) return fail(`Unknown point(s): ${[!idA && a, !idB && b].filter(Boolean).join(", ")}`);
      const obj = doc.create("segment", { parents: [idA, idB] });
      return ok({ id: obj.id, name: obj.name });
    },

    createCircle(center, radiusPoint) {
      const idC = resolveObjectId(doc, center);
      const idR = resolveObjectId(doc, radiusPoint);
      if (!idC || !idR) return fail(`Unknown point(s): ${[!idC && center, !idR && radiusPoint].filter(Boolean).join(", ")}`);
      const obj = doc.create("circle", { parents: [idC, idR] });
      return ok({ id: obj.id, name: obj.name });
    },

    createPolygon(...vertices) {
      if (vertices.length < 3) return fail("createPolygon needs at least three point names");
      const ids = vertices.map((v) => resolveObjectId(doc, v));
      const missing = vertices.filter((_, i) => !ids[i]);
      if (missing.length) return fail(`Unknown point(s): ${missing.join(", ")}`);
      const obj = doc.create("polygon", { parents: ids as string[] });
      return ok({ id: obj.id, name: obj.name });
    },

    group(...names) {
      if (names.length < 2) return fail("group needs at least two object names");
      const ids = names.map((n) => resolveObjectId(doc, n));
      const missing = names.filter((_, i) => !ids[i]);
      if (missing.length) return fail(`Unknown object(s): ${missing.join(", ")}`);
      const g = doc.createGroup(ids as string[]);
      if (!g) return fail("group failed (need at least two valid members)");
      return ok({ id: g.id, name: g.name });
    },

    setMeaning(name, meaning) {
      const objId = resolveObjectId(doc, name);
      if (objId) {
        doc.setMeaning(objId, meaning ?? null);
        return ok({ id: objId, meaning: meaning ?? null });
      }
      const groupId = resolveGroupId(doc, name);
      if (groupId) {
        doc.setGroupMeaning(groupId, meaning ?? null);
        return ok({ id: groupId, meaning: meaning ?? null });
      }
      return fail(`Unknown object or group: ${name}`);
    },

    frame(groupName) {
      const groupId = resolveGroupId(doc, groupName);
      if (!groupId) return fail(`Unknown group: ${groupName}`);
      const f = doc.createFrame(groupId);
      if (!f) return fail(`frame failed (already framed, or "${groupName}" isn't a group)`);
      return ok({ id: f.id, frameOf: f.frameOf });
    },

    getAlgebra() {
      return doc.objects.map((o) => `${doc.definitionOf(o)} · ${o.id}${o.meaning ? " · " + o.meaning : ""}`);
    },

    getReceipts(n = 20) {
      return doc.receipts.slice(-n);
    },

    load(json) {
      try {
        view.rebuild(); // fresh board — same discipline as Open (station 9)
        doc.load(json);
        return ok({ objects: doc.objects.length });
      } catch (err) {
        return fail((err as Error).message);
      }
    },

    serialize() {
      return doc.serialize();
    },
  };
}
