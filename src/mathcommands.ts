// Station 12 — the math line: Point/Segment/Circle/Polygon run straight through the model (same
// tools as the rail, typed); anything else evaluates via the Compute Engine. Errors show, never crash.
import { ComputeEngine } from "@cortex-js/compute-engine";
import type { AergebraDoc } from "./model";

let ce: ComputeEngine | null = null;
function getComputeEngine(): ComputeEngine {
  if (!ce) ce = new ComputeEngine();
  return ce;
}

/** MathLive serializes typed text as LaTeX (e.g. Point(3,2) -> \operatorname{Point}\left(3,2\right)).
 *  Flatten that back to plain call syntax before matching our four commands. */
function flattenLatex(latex: string): string {
  return latex
    .replace(/\\operatorname\{([^}]*)\}/g, "$1")
    .replace(/\\left|\\right/g, "")
    .replace(/\\,/g, "")
    .replace(/[{}]/g, "")
    .trim();
}

function splitArgs(s: string): string[] {
  return s.split(",").map((a) => a.trim()).filter(Boolean);
}

function findByName(doc: AergebraDoc, name: string): string | null {
  return doc.objects.find((o) => o.name === name)?.id ?? null;
}

export interface MathLineResult {
  text: string;
  isError: boolean;
}

/** Runs one line: a Point/Segment/Circle/Polygon command against the model, or a Compute Engine
 *  evaluation. Never throws — every failure comes back as a MathLineResult with isError: true. */
export function runMathLine(doc: AergebraDoc, latex: string): MathLineResult {
  const flat = flattenLatex(latex);

  const pointMatch = flat.match(/^Point\(([^)]*)\)$/i);
  if (pointMatch) {
    const [xs, ys] = splitArgs(pointMatch[1]);
    const x = Number(xs);
    const y = Number(ys);
    if (splitArgs(pointMatch[1]).length !== 2 || !Number.isFinite(x) || !Number.isFinite(y)) {
      return { text: `Point() needs two numbers, e.g. Point(3,2)`, isError: true };
    }
    const obj = doc.create("point", { coords: [x, y] });
    return { text: `${obj.name} = Point(${x}, ${y})`, isError: false };
  }

  const segMatch = flat.match(/^Segment\(([^)]*)\)$/i);
  if (segMatch) {
    const args = splitArgs(segMatch[1]);
    if (args.length !== 2) return { text: `Segment() needs two point names, e.g. Segment(A,B)`, isError: true };
    const ids = args.map((n) => findByName(doc, n));
    const missing = args.filter((_, i) => !ids[i]);
    if (missing.length) return { text: `Unknown point(s): ${missing.join(", ")}`, isError: true };
    const obj = doc.create("segment", { parents: ids as string[] });
    return { text: `${obj.name} = Segment(${args.join(", ")})`, isError: false };
  }

  const circMatch = flat.match(/^Circle\(([^)]*)\)$/i);
  if (circMatch) {
    const args = splitArgs(circMatch[1]);
    if (args.length !== 2) return { text: `Circle() needs two point names, e.g. Circle(A,B)`, isError: true };
    const ids = args.map((n) => findByName(doc, n));
    const missing = args.filter((_, i) => !ids[i]);
    if (missing.length) return { text: `Unknown point(s): ${missing.join(", ")}`, isError: true };
    const obj = doc.create("circle", { parents: ids as string[] });
    return { text: `${obj.name} = Circle(${args.join(", ")})`, isError: false };
  }

  const polyMatch = flat.match(/^Polygon\(([^)]*)\)$/i);
  if (polyMatch) {
    const args = splitArgs(polyMatch[1]);
    if (args.length < 3) return { text: `Polygon() needs at least three point names, e.g. Polygon(A,B,C)`, isError: true };
    const ids = args.map((n) => findByName(doc, n));
    const missing = args.filter((_, i) => !ids[i]);
    if (missing.length) return { text: `Unknown point(s): ${missing.join(", ")}`, isError: true };
    const obj = doc.create("polygon", { parents: ids as string[] });
    return { text: `${obj.name} = Polygon(${args.join(", ")})`, isError: false };
  }

  // Not one of the four tools — evaluate as math via the Compute Engine, on the ORIGINAL LaTeX
  // (flattening would break \frac{}, \sqrt{}, and similar bracketed structure).
  try {
    const boxed = getComputeEngine().parse(latex);
    if (!boxed) return { text: `Could not parse "${latex}"`, isError: true };
    const evaluated = boxed.evaluate();
    const readable = evaluated.toString();
    return { text: `${latex} = ${readable}`, isError: false };
  } catch (err) {
    return { text: `Error: ${(err as Error).message}`, isError: true };
  }
}
