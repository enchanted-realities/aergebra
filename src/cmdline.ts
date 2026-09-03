// Station 13 — the bottom bar becomes a command line. It accepts the SAME calls as
// window.Aergebra, typed as text (e.g. createPoint(2,3)), and prints the result. No chat, no
// network, no separate grammar — human-typed is just another caller of the tool API.
import type { AergebraToolApi } from "./toolapi";

function splitTopLevelArgs(s: string): string[] {
  const args: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ",") {
      args.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

function parseArg(raw: string): unknown {
  const t = raw.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null" || t === "") return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t; // a bare word — a point/group name typed without quotes
}

interface ParsedCommand {
  name: string;
  args: unknown[];
}

function parseCommand(line: string): ParsedCommand | null {
  const m = line.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/s);
  if (!m) return null;
  const argsStr = m[2].trim();
  return { name: m[1], args: argsStr ? splitTopLevelArgs(argsStr).map(parseArg) : [] };
}

const METHOD_NAMES = new Set([
  "createPoint", "createSegment", "createCircle", "createPolygon",
  "group", "setMeaning", "frame", "getAlgebra", "getReceipts", "load", "serialize",
]);

/** Runs one typed line against the tool API. Never throws — every failure comes back as text. */
export function runCommandLine(api: AergebraToolApi, line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  const cmd = parseCommand(trimmed);
  if (!cmd) return `Not a command: "${trimmed}" — try createPoint(2,3), createSegment(A,B), group(A,B), getAlgebra()...`;
  if (!METHOD_NAMES.has(cmd.name)) return `Unknown command "${cmd.name}". Available: ${Array.from(METHOD_NAMES).join(", ")}`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (api as any)[cmd.name] as (...a: unknown[]) => unknown;
    const result = fn.apply(api, cmd.args);
    if (result && typeof result === "object" && "ok" in result) {
      const r = result as { ok: boolean; result?: unknown; error?: string };
      return r.ok ? JSON.stringify(r.result) : `Error: ${r.error}`;
    }
    return JSON.stringify(result);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
