// WebMCP — the real thing. Station 14 left a seam (window.__aergebra_execute, one envelope,
// never throws); this module plugs that same façade into the Web Model Context API
// (document.modelContext / navigator.modelContext, Chrome 149+ behind
// chrome://flags/#enable-webmcp-testing, native in agentic browsers), so an agent's tool
// calls and a human's typed commands are literally the same calls, receipted the same way.
//
// The pitch, in one line: agents and humans should share live GEOMETRY, not screenshots.
// getView()/getAlgebra() give the agent the board as data; highlight() lets the agent point
// at things the human can see; every mutation lands in the same receipt line.
import type { AergebraToolApi } from "./toolapi";
import { executeToolCall } from "./toolapi";

// The subset of the W3C Web Model Context proposal we rely on.
interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<ModelContextToolResult>;
}
interface ModelContextToolResult {
  content: Array<{ type: "text"; text: string }>;
}
interface ModelContext {
  registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal }): void | Promise<void>;
}

const NO_ARGS = { type: "object", properties: {}, required: [] } as const;

const objectName = (what: string) => ({
  type: "string",
  description: `${what} — an id like AER3, or the human name shown in the Inspector`,
});

// One row per tool: the WebMCP-facing schema plus how it maps onto the station-13 façade.
// `args` turns the schema'd input object into the positional argument list the façade takes.
interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  tool: string; // façade method name
  args: (input: Record<string, unknown>) => unknown[];
}

const TOOL_SPECS: ToolSpec[] = [
  {
    name: "create_point",
    description: "Create a point at board coordinates (x, y). Returns its id and name. Points are the atoms every other shape is built from.",
    inputSchema: {
      type: "object",
      properties: {
        x: { type: "number", description: "x coordinate on the board" },
        y: { type: "number", description: "y coordinate on the board" },
      },
      required: ["x", "y"],
    },
    tool: "createPoint",
    args: (i) => [i.x, i.y],
  },
  {
    name: "create_segment",
    description: "Create a segment between two existing points.",
    inputSchema: {
      type: "object",
      properties: { a: objectName("First endpoint"), b: objectName("Second endpoint") },
      required: ["a", "b"],
    },
    tool: "createSegment",
    args: (i) => [i.a, i.b],
  },
  {
    name: "create_circle",
    description: "Create a circle from a center point and a point on its rim.",
    inputSchema: {
      type: "object",
      properties: { center: objectName("Center point"), radiusPoint: objectName("A point on the rim") },
      required: ["center", "radiusPoint"],
    },
    tool: "createCircle",
    args: (i) => [i.center, i.radiusPoint],
  },
  {
    name: "create_polygon",
    description: "Create a polygon from three or more existing points, in order.",
    inputSchema: {
      type: "object",
      properties: {
        vertices: { type: "array", items: objectName("Vertex point"), minItems: 3, description: "Vertex points in order" },
      },
      required: ["vertices"],
    },
    tool: "createPolygon",
    args: (i) => (Array.isArray(i.vertices) ? i.vertices : []),
  },
  {
    name: "group_objects",
    description: "Group two or more objects into a named cluster (a unit that can carry meaning and be framed or exported together).",
    inputSchema: {
      type: "object",
      properties: {
        names: { type: "array", items: objectName("Object"), minItems: 2, description: "Objects to group" },
      },
      required: ["names"],
    },
    tool: "group",
    args: (i) => (Array.isArray(i.names) ? i.names : []),
  },
  {
    name: "set_meaning",
    description: "Attach a human-readable meaning to an object or group (this is its visible label — objects show their MEANING, never an arbitrary letter). Pass no meaning to clear it.",
    inputSchema: {
      type: "object",
      properties: {
        name: objectName("Object or group"),
        meaning: { type: "string", description: "The meaning to attach; omit to clear" },
      },
      required: ["name"],
    },
    tool: "setMeaning",
    args: (i) => [i.name, i.meaning ?? null],
  },
  {
    name: "set_state",
    description: "Set an object's status colour: charcoal = at rest, brown = blocked track (tracks only), orange = ready/where the hold sits, teal = free and willing. Omit state to clear. Illegal combinations are refused with an explanation.",
    inputSchema: {
      type: "object",
      properties: {
        name: objectName("Object"),
        state: { type: "string", enum: ["charcoal", "brown", "orange", "teal"], description: "Status colour; omit to clear" },
      },
      required: ["name"],
    },
    tool: "setState",
    args: (i) => [i.name, i.state ?? null],
  },
  {
    name: "frame_group",
    description: "Draw a frame around an existing group, marking it as one settled unit on the board.",
    inputSchema: { type: "object", properties: { group: objectName("Group") }, required: ["group"] },
    tool: "frame",
    args: (i) => [i.group],
  },
  {
    name: "highlight",
    description: "Point at things: light up the named objects so the human sees exactly what you are talking about. Use this instead of describing locations in prose — shared geometry beats 'the circle on the left'.",
    inputSchema: {
      type: "object",
      properties: {
        names: { type: "array", items: objectName("Object"), minItems: 1, description: "Objects to light up" },
      },
      required: ["names"],
    },
    tool: "highlight",
    args: (i) => (Array.isArray(i.names) ? i.names : []),
  },
  {
    name: "clear_highlight",
    description: "Turn off all highlights you switched on.",
    inputSchema: NO_ARGS,
    tool: "clearHighlight",
    args: () => [],
  },
  {
    name: "get_algebra",
    description: "Read the whole construction as algebra: one line per object with its definition, id and meaning. This is the board as DATA — use it instead of a screenshot.",
    inputSchema: NO_ARGS,
    tool: "getAlgebra",
    args: () => [],
  },
  {
    name: "get_view",
    description: "Read the camera as data: the board window, the content bounds, and how much of the view the content occupies. Use it to know what the human is currently looking at — never guess from pixels.",
    inputSchema: NO_ARGS,
    tool: "getView",
    args: () => [],
  },
  {
    name: "get_receipts",
    description: "Read the last n receipts — the append-only record of everything that happened in this document, human actions and agent actions on the same line.",
    inputSchema: {
      type: "object",
      properties: { n: { type: "number", description: "How many recent receipts (default 20)" } },
      required: [],
    },
    tool: "getReceipts",
    args: (i) => (typeof i.n === "number" ? [i.n] : []),
  },
  {
    name: "fit_view",
    description: "Auto-fit the camera to the content so everything constructed is visible and readable.",
    inputSchema: NO_ARGS,
    tool: "fit",
    args: () => [],
  },
  {
    name: "load_document",
    description: "Replace the current document with a serialized Aergebra document (the JSON a save or serialize_document produced). The board rebuilds and auto-fits.",
    inputSchema: {
      type: "object",
      properties: { json: { type: "string", description: "A serialized Aergebra document" } },
      required: ["json"],
    },
    tool: "load",
    args: (i) => [i.json],
  },
  {
    name: "serialize_document",
    description: "Serialize the whole document (objects, groups, meanings, states, receipts) to JSON — the full construal, portable.",
    inputSchema: NO_ARGS,
    tool: "serialize",
    args: () => [],
  },
];

export interface WebMcpStatus {
  available: boolean;
  toolCount: number;
  namespace: "document" | "navigator" | null;
}

/**
 * Registers every Aergebra tool with the page's Model Context, if the browser provides one.
 * `onCall` fires for each agent call with a one-line human-readable echo, so agent activity
 * shows in the same command-line output a human's typed calls do.
 */
export function registerWebMcp(
  api: AergebraToolApi,
  onCall?: (line: string) => void,
): WebMcpStatus {
  const docMc = (document as unknown as { modelContext?: ModelContext }).modelContext;
  const navMc = (navigator as unknown as { modelContext?: ModelContext }).modelContext;
  const mc = docMc ?? navMc;
  if (!mc || typeof mc.registerTool !== "function") {
    return { available: false, toolCount: 0, namespace: null };
  }

  for (const spec of TOOL_SPECS) {
    void mc.registerTool({
      name: `aergebra_${spec.name}`,
      description: spec.description,
      inputSchema: spec.inputSchema,
      async execute(input) {
        const call = { tool: spec.tool, args: spec.args(input ?? {}) };
        const result = executeToolCall(api, call); // same envelope as station 14, never throws
        onCall?.(`agent → ${spec.name}(${JSON.stringify(input ?? {})}) → ${JSON.stringify(result)}`);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      },
    });
  }

  return {
    available: true,
    toolCount: TOOL_SPECS.length,
    namespace: docMc ? "document" : "navigator",
  };
}
