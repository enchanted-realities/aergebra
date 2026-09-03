// Station 5 — the right-hand Inspector: the algebra, live. The computer-facing truth.
import type { AergebraDoc } from "./model";

export class Inspector {
  private root: HTMLElement;
  selectedId: string | null = null;

  constructor(private doc: AergebraDoc, container: HTMLElement) {
    this.root = container;
    doc.subscribe(() => this.renderList());
    this.renderShell();
  }

  private renderShell() {
    this.root.innerHTML = `
      <h2>Algebra</h2>
      <div class="objects"></div>
      <div class="receipts"></div>
    `;
    this.renderList();
  }

  private renderList() {
    const list = this.root.querySelector(".objects")!;
    list.innerHTML = "";
    for (const obj of this.doc.objects) {
      const row = document.createElement("button");
      row.className = "obj" + (obj.id === this.selectedId ? " selected" : "");
      row.innerHTML = `${this.doc.definitionOf(obj)} <em>· ${obj.id}${obj.meaning ? " · " + obj.meaning : ""}</em>`;
      row.addEventListener("click", () => {
        this.selectedId = obj.id === this.selectedId ? null : obj.id;
        this.renderList();
      });
      list.appendChild(row);
    }
    const receipts = this.root.querySelector(".receipts")!;
    const last = this.doc.receipts.at(-1);
    receipts.textContent = `${this.doc.receipts.length} receipts` + (last ? ` · last: ${last.action}` : "");
  }
}
