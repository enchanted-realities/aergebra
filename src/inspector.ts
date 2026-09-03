// Station 5 — the right-hand Inspector: the algebra, live. The computer-facing truth.
// Station 6 — grouping without flattening: tap multi-select, a Group button, groups
// render as headers with members nested (fully listed, individually selectable) beneath them.
// Station 7 — meaning first-class: an inline editor sets/edits `meaning` on any object or group;
// meaning is never required, never invented, and every change receipts via the model already.
import type { AergebraDoc, AerGroup } from "./model";
import type { BoardView } from "./render";

export class Inspector {
  private root: HTMLElement;
  private selected = new Set<string>(); // AER ids and GRP ids share this set — prefixes never collide
  private hoveredGroupId: string | null = null;
  private editingId: string | null = null;

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

  private startEditing(id: string) {
    this.editingId = id;
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

  // Inline meaning editor — reachable by double-click (desktop bonus) or by the "meaning" tap
  // affordance that appears on a selected row. Enter/blur saves, Escape cancels. Never required.
  private appendMeaningEditor(list: Element, current: string | null, nested: boolean, commit: (v: string | null) => void) {
    const wrap = document.createElement("div");
    wrap.className = "row-wrap editing" + (nested ? " nested" : "");
    const input = document.createElement("input");
    input.className = "meaning-input";
    input.type = "text";
    input.placeholder = "meaning (optional)";
    input.value = current ?? "";
    const finish = (save: boolean) => {
      const val = input.value.trim() ? input.value.trim() : null;
      this.editingId = null;
      if (save) commit(val); // doc emits -> renderList via subscription
      else this.renderList();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    wrap.appendChild(input);
    list.appendChild(wrap);
    setTimeout(() => input.focus(), 0);
  }

  private renderObjRow(list: Element, id: string, nested: boolean) {
    const obj = this.doc.get(id);
    if (!obj) return;
    if (this.editingId === id) {
      this.appendMeaningEditor(list, obj.meaning, nested, (v) => this.doc.setMeaning(id, v));
      return;
    }
    const wrap = document.createElement("div");
    wrap.className = "row-wrap" + (nested ? " nested" : "");
    const row = document.createElement("button");
    row.className = "obj" + (this.selected.has(id) ? " selected" : "");
    row.innerHTML = `${this.doc.definitionOf(obj)} <em>· ${obj.id}${obj.meaning ? " · " + obj.meaning : ""}</em>`;
    row.addEventListener("click", () => this.toggleSelect(id));
    row.addEventListener("dblclick", (e) => { e.stopPropagation(); this.startEditing(id); });
    wrap.appendChild(row);
    if (this.selected.has(id)) {
      const editBtn = document.createElement("button");
      editBtn.className = "edit-btn";
      editBtn.textContent = "meaning";
      editBtn.addEventListener("click", (e) => { e.stopPropagation(); this.startEditing(id); });
      wrap.appendChild(editBtn);
    }
    list.appendChild(wrap);
  }

  private renderGroupHeader(list: Element, g: AerGroup) {
    if (this.editingId === g.id) {
      this.appendMeaningEditor(list, g.meaning, false, (v) => this.doc.setGroupMeaning(g.id, v));
      return;
    }
    const wrap = document.createElement("div");
    wrap.className = "row-wrap";
    const row = document.createElement("button");
    row.className = "grp-header" + (this.selected.has(g.id) ? " selected" : "");
    const framed = this.doc.frames.some((f) => f.frameOf === g.id);
    row.innerHTML = `&#9662; ${g.name} <em>· ${g.id} · ${g.members.length} members${framed ? " · framed" : ""}${g.meaning ? " · " + g.meaning : ""}</em>`;
    row.addEventListener("click", () => this.toggleSelect(g.id));
    row.addEventListener("dblclick", (e) => { e.stopPropagation(); this.startEditing(g.id); });
    // Hover highlight is a desktop bonus only — selection (tap) already highlights via refreshHighlight().
    row.addEventListener("mouseenter", () => { this.hoveredGroupId = g.id; this.refreshHighlight(); });
    row.addEventListener("mouseleave", () => { this.hoveredGroupId = null; this.refreshHighlight(); });
    wrap.appendChild(row);
    if (this.selected.has(g.id)) {
      const editBtn = document.createElement("button");
      editBtn.className = "edit-btn";
      editBtn.textContent = "meaning";
      editBtn.addEventListener("click", (e) => { e.stopPropagation(); this.startEditing(g.id); });
      wrap.appendChild(editBtn);
    }
    list.appendChild(wrap);
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
    const selectedGroupIds = Array.from(this.selected).filter((id) => id.startsWith("GRP"));
    if (selectedGroupIds.length === 1 && !this.doc.frames.some((f) => f.frameOf === selectedGroupIds[0])) {
      const frameBtn = document.createElement("button");
      frameBtn.className = "group-btn frame-btn";
      frameBtn.textContent = "Frame";
      frameBtn.addEventListener("click", () => this.doc.createFrame(selectedGroupIds[0]));
      actions.appendChild(frameBtn);
    }

    const receipts = this.root.querySelector(".receipts")!;
    const last = this.doc.receipts.at(-1);
    receipts.textContent = `${this.doc.receipts.length} receipts` + (last ? ` · last: ${last.action}` : "");

    this.refreshHighlight();
  }
}
