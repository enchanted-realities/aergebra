// Station 11 — real .ggb construction import, not a thumbnail. Unzips in-browser, parses
// geogebra.xml, and maps free points, segments, circles, and polygons into REAL model objects
// with algebra. Anything Aergebra's basic model can't represent (a computed/anonymous endpoint,
// a numeric-radius circle, a non-geometry element) is skipped and receipted — never invented.
import type { AergebraDoc } from "./model";

/** Minimal ZIP central-directory walk — ported from the AERGEBRA v8 extractGGBThumb reference,
 *  generalized to fetch any named entry (method 0 = stored, method 8 = deflate-raw). */
async function extractZipEntry(buf: ArrayBuffer, entryName: string): Promise<Uint8Array> {
  const u = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a readable .ggb file (no ZIP end-of-central-directory)");
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOff = dv.getUint32(eocd + 16, true);
  let p = cdOff;
  while (p < cdOff + cdSize) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u.slice(p + 46, p + 46 + nameLen));
    if (name === entryName) {
      const ln = dv.getUint16(localOff + 26, true);
      const le = dv.getUint16(localOff + 28, true);
      const start = localOff + 30 + ln + le;
      const comp = u.slice(start, start + compSize);
      if (method === 0) return comp;
      if (method === 8) {
        if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot unpack .ggb files");
        return new Uint8Array(
          await new Response(new Blob([comp as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer(),
        );
      }
      throw new Error(`Unsupported .ggb compression method ${method} for ${entryName}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${entryName} not found in .ggb`);
}

interface GgbCommand {
  name: string;
  inputs: string[];
  outputs: string[];
}

/** A bare label reference — no operators, parens, or whitespace — as opposed to a computed expression. */
function isBareLabel(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && !/[\s+\-*/()^]/.test(t);
}

export interface GgbImportSummary {
  source: string;
  imported: { points: number; segments: number; circles: number; polygons: number };
  skipped: Array<{ label: string; type: string; reason: string }>;
}

export async function importGgb(doc: AergebraDoc, file: File): Promise<GgbImportSummary> {
  const buf = await file.arrayBuffer();
  const xmlBytes = await extractZipEntry(buf, "geogebra.xml");
  const xmlText = new TextDecoder("utf-8").decode(xmlBytes);
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("geogebra.xml did not parse as XML");

  const construction = xml.querySelector("construction");
  if (!construction) throw new Error("No <construction> in geogebra.xml");

  // Pass 1 — every <command>, keyed by each of its output labels (a command can produce more
  // than one output, e.g. Polygon also emits its edge segments).
  const commandsByOutput = new Map<string, GgbCommand>();
  for (const cmdEl of Array.from(construction.querySelectorAll(":scope > command"))) {
    const name = cmdEl.getAttribute("name") ?? "";
    const inputEl = cmdEl.querySelector(":scope > input");
    const outputEl = cmdEl.querySelector(":scope > output");
    const inputs: string[] = [];
    if (inputEl) {
      let i = 0;
      while (inputEl.hasAttribute(`a${i}`)) { inputs.push(inputEl.getAttribute(`a${i}`)!); i++; }
    }
    const outputs: string[] = [];
    if (outputEl) {
      let i = 0;
      while (outputEl.hasAttribute(`a${i}`)) { outputs.push(outputEl.getAttribute(`a${i}`)!); i++; }
    }
    const cmd: GgbCommand = { name, inputs, outputs };
    for (const out of outputs) commandsByOutput.set(out, cmd);
  }

  const summary: GgbImportSummary = { source: file.name, imported: { points: 0, segments: 0, circles: 0, polygons: 0 }, skipped: [] };
  const idByLabel = new Map<string, string>();

  // Pass 2 — every <element>, in document order, mapped by type.
  for (const el of Array.from(construction.querySelectorAll(":scope > element"))) {
    const type = el.getAttribute("type") ?? "";
    const label = el.getAttribute("label") ?? "(unlabeled)";

    if (type === "point") {
      const coords = el.querySelector(":scope > coords");
      const x = Number(coords?.getAttribute("x") ?? NaN);
      const y = Number(coords?.getAttribute("y") ?? NaN);
      const z = Number(coords?.getAttribute("z") ?? 1);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || z === 0) {
        summary.skipped.push({ label, type, reason: "point has no usable coordinates" });
        continue;
      }
      const obj = doc.create("point", { coords: [Number((x / z).toFixed(4)), Number((y / z).toFixed(4))], meaning: label });
      idByLabel.set(label, obj.id);
      summary.imported.points++;
      continue;
    }

    if (type === "segment") {
      const cmd = commandsByOutput.get(label);
      const [a, b] = cmd?.inputs ?? [];
      if (cmd?.name === "Segment" && a && b && isBareLabel(a) && isBareLabel(b) && idByLabel.has(a) && idByLabel.has(b)) {
        const obj = doc.create("segment", { parents: [idByLabel.get(a)!, idByLabel.get(b)!], meaning: label });
        idByLabel.set(label, obj.id);
        summary.imported.segments++;
      } else {
        summary.skipped.push({ label, type, reason: "endpoint is a computed expression, not a plain point reference" });
      }
      continue;
    }

    if (type === "conic") {
      const cmd = commandsByOutput.get(label);
      const [center, radius] = cmd?.inputs ?? [];
      if (cmd?.name === "Circle" && center && radius && isBareLabel(center) && isBareLabel(radius) && idByLabel.has(center) && idByLabel.has(radius)) {
        const obj = doc.create("circle", { parents: [idByLabel.get(center)!, idByLabel.get(radius)!], meaning: label });
        idByLabel.set(label, obj.id);
        summary.imported.circles++;
      } else {
        summary.skipped.push({ label, type: "circle", reason: "not a point-radius circle (Aergebra circles need a center point and a point on the circle)" });
      }
      continue;
    }

    if (type === "polygon") {
      const cmd = commandsByOutput.get(label);
      const verts = cmd?.inputs ?? [];
      if (cmd?.name === "Polygon" && verts.length >= 3 && verts.every((v) => isBareLabel(v) && idByLabel.has(v))) {
        const obj = doc.create("polygon", { parents: verts.map((v) => idByLabel.get(v)!), meaning: label });
        idByLabel.set(label, obj.id);
        summary.imported.polygons++;
      } else {
        summary.skipped.push({ label, type, reason: "vertex is a computed expression, not a plain point reference" });
      }
      continue;
    }

    summary.skipped.push({ label, type, reason: `unsupported element type "${type}"` });
  }

  doc.receipt("ggb-import", summary as unknown as Record<string, unknown>);
  return summary;
}
