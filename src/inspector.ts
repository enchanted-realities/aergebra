// Station 5 — the right-hand Inspector: the algebra, live. The computer-facing truth.
// Station 6 — grouping without flattening: shift-click multi-select, a Group button, groups
// render as headers with members nested (fully listed, individually selectable) beneath them.
import type { AergebraDoc, AerGroup } from "./model";
import type { BoardView } from "./render";

export class Inspector {
  private root: HTMLElement;
  private selected = new Set<string>(); // AER ids and GRP ids share this set — prefixes never collide
  private hoveredGroupId: string | null = null;

  constructor(private doc: AergebraDoc, container: HTMLElement, private board: BoardView) {
    this.root = container;
    doc.subscribe(() => this.renderList());
    this.renderShell();
  }

  private renderShell() {
    this.root.innerHTML = `
      <h2>Algebra</h2>
      <div class="actions"></div>
      <div class="objects"></div>
      <div class="receipts"></div>
    `;
    this.renderList();
  }

  // A plain tap toggles the row in/out of selection — no modifier key required, ever.
  // (Andrea, standing rule: "I can't shift click." Nothing may require a keyboard modifier or hover.)
  private toggleSelect(id: string) {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
    this.renderList();
  }

  private refreshHighlight() {
    let members: string[] = [];
    if (this.hoveredGroupId) {
      members = this.doc.groups.find((g) => g.id === this.hoveredGroupId)?.members ?? [];
    } else {
      for (const g of this.doc.groups) {
        if (this.selected.has(g.id)) members = members.concat(g.members);
      }
    }
    if (members.length) this.board.highlightObjects(members);
    else this.board.clearHighlightObjects();
  }

  private renderObjRow(list: Element, id: string, nested: boolean) {
    const obj = this.doc.get(id);
    if (!obj) return;
    const row = document.createElement("button");
    row.className = "obj" + (nested ? " nested" : "") + (this.selected.has(id) ? " selected" : "");
    row.innerHTML = `${this.doc.definitionOf(obj)} <em>· ${obj.id}${obj.meaning ? " · " + obj.meaning : ""}</em>`;
    row.addEventListener("click", () => this.toggleSelect(id));
    list.appendChild(row);
  }

  private renderGroupHeader(list: Element, g: AerGroup) {
    const row = document.createElement("button");
    row.className = "grp-header" + (this.selected.has(g.id) ? " selected" : "");
    row.innerHTML = `&#9662; ${g.name} <em>· ${g.id} · ${g.members.length} members${g.meaning ? " · " + g.meaning : ""}</em>`;
    row.addEventListener("click", () => this.toggleSelect(g.id));
    // Hover highlight is a desktop bonus only — selection (tap) already highlights via refreshHighlight().
    row.addEventListener("mouseenter", () => { this.hoveredGroupId = g.id; this.refreshHighlight(); });
    row.addEventListener("mouseleave", () => { this.hoveredGroupId = null; this.refreshHighlight(); });
    list.appendChild(row);
  }

  private renderList() {
    const list = this.root.querySelector(".objects")!;
    list.innerHTML = "";
    const grouped = new Set<string>();
    for (const g of this.doc.groups) {
      this.renderGroupHeader(list, g);
      for (const memberId of g.members) {
        grouped.add(memberId);
        this.renderObjRow(list, memberId, true);
      }
    }
    for (const obj of this.doc.objects) {
      if (grouped.has(obj.id)) continue;
      this.renderObjRow(list, obj.id, false);
    }

    const actions = this.root.querySelector(".actions")!;
    const selectedObjectIds = Array.from(this.selected).filter((id) => id.startsWith("AER"));
    actions.innerHTML = "";
    if (selectedObjectIds.length >= 2) {
      const btn = document.createElement("button");
      btn.className = "group-btn";
      btn.textContent = `Group (${selectedObjectIds.length})`;
      btn.addEventListener("click", () => {
        this.selected.clear();
        this.doc.createGroup(selectedObjectIds);
      });
      actions.appendChild(btn);
    }

    const receipts = this.root.querySelector(".receipts")!;
    const last = this.doc.receipts.at(-1);
    receipts.textContent = `${this.doc.receipts.length} receipts` + (last ? ` · last: ${last.action}` : "");

    this.refreshHighlight();
  }
}
