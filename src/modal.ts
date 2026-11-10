import { App, Modal, TFile } from "obsidian";
import type PaperFinderPlugin from "./main";
import { parseInput } from "./detect";
import type { SearchResult } from "./search";
import { SOURCE_LABELS, type Paper } from "./types";
import { authorsShort, truncate } from "./util";

/**
 * Search box with a live results list. Written as a plain Modal (rather than SuggestModal) to
 * control debouncing, cancel stale searches and show per-source status.
 * All API text is inserted with setText / createEl text, never as HTML.
 */
export class FindPaperModal extends Modal {
  private input!: HTMLInputElement;
  private statusEl!: HTMLElement;
  private listEl!: HTMLElement;
  private papers: Paper[] = [];
  private existing: (TFile | null)[] = [];
  private selected = 0;
  private seq = 0;
  private timer: number | null = null;
  private lastQuery = "";
  private busy = false;

  constructor(app: App, private plugin: PaperFinderPlugin, private initial = "") {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("paper-finder-modal");
    this.titleEl.setText("Find paper");
    const { contentEl } = this;
    this.input = contentEl.createEl("input", {
      type: "text",
      cls: "paper-finder-input",
      attr: { placeholder: "Title words, authors, year, DOI, arXiv id or URL", spellcheck: "false" },
    });
    this.statusEl = contentEl.createDiv({ cls: "paper-finder-status" });
    this.listEl = contentEl.createDiv({ cls: "paper-finder-results" });

    this.input.addEventListener("input", () => this.onType());
    this.input.addEventListener("keydown", (e) => this.onKey(e));
    this.input.value = this.initial;
    this.input.focus();
    if (this.initial) void this.run();
    else this.setStatus("Type and wait, or press Enter.");
  }

  onClose(): void {
    this.seq++;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.contentEl.empty();
  }

  private setStatus(s: string) {
    this.statusEl.setText(s);
  }

  private onType(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    const q = this.input.value.trim();
    if (!this.plugin.settings.searchAsYouType) return;
    const kind = parseInput(q).kind;
    // Identifiers are complete when pasted; free text needs a few characters and a pause.
    if (kind === "text" && q.length < 4) return;
    const delay = kind === "text" ? this.plugin.settings.debounceMs : 150;
    this.timer = window.setTimeout(() => void this.run(), delay);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!this.papers.length) return;
      const d = e.key === "ArrowDown" ? 1 : -1;
      this.select((this.selected + d + this.papers.length) % this.papers.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const q = this.input.value.trim();
      if (q !== this.lastQuery || !this.papers.length) {
        if (this.timer !== null) window.clearTimeout(this.timer);
        void this.run();
      } else {
        void this.choose(this.selected);
      }
    }
  }

  private async run(): Promise<void> {
    const q = this.input.value.trim();
    if (!q) return;
    const my = ++this.seq;
    this.lastQuery = q;
    this.busy = true;
    this.setStatus("Searching…");
    let res: SearchResult;
    try {
      res = await this.plugin.search(q);
    } catch (e) {
      if (my === this.seq) this.setStatus(`Search failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    } finally {
      if (my === this.seq) this.busy = false;
    }
    if (my !== this.seq) return; // superseded by a newer search
    this.papers = res.papers;
    this.existing = res.papers.map((p) => this.plugin.findExisting(p));
    const parts = res.status.map((s) => `${SOURCE_LABELS[s.source]} ${s.error ? "failed" : s.count}`);
    const failed = res.status.filter((s) => s.error).map((s) => `${SOURCE_LABELS[s.source]}: ${s.error}`);
    this.setStatus(
      (res.papers.length ? `${res.papers.length} result${res.papers.length === 1 ? "" : "s"}` : "No results") +
        (parts.length ? ` · ${parts.join(" · ")}` : "") +
        (failed.length ? ` (${failed.join("; ")})` : ""),
    );
    this.renderList();
  }

  private renderList(): void {
    this.listEl.empty();
    this.papers.forEach((p, i) => {
      const item = this.listEl.createDiv({ cls: "paper-finder-item" });
      const title = item.createDiv({ cls: "paper-finder-title", text: p.title });
      if (this.existing[i]) title.createSpan({ cls: "paper-finder-badge", text: "in vault" });
      const meta = [authorsShort(p.authors), p.year, p.venue].filter(Boolean).join(" · ");
      item.createDiv({ cls: "paper-finder-meta", text: meta });
      const ids = [p.arxiv && `arXiv:${p.arxiv}`, p.doi && `doi:${p.doi}`].filter(Boolean).join("  ");
      item.createDiv({ cls: "paper-finder-ids", text: `${ids}${ids ? "  ·  " : ""}${p.sources.map((s) => SOURCE_LABELS[s]).join(", ")}` });
      if (p.abstract) item.createDiv({ cls: "paper-finder-abstract", text: truncate(p.abstract, 240) });
      item.addEventListener("mousemove", () => this.select(i, false));
      item.addEventListener("click", () => void this.choose(i));
    });
    this.select(0);
  }

  private select(i: number, scroll = true): void {
    if (i === this.selected && this.listEl.children[i]?.hasClass("is-selected")) return;
    this.listEl.children[this.selected]?.removeClass("is-selected");
    this.selected = i;
    const el = this.listEl.children[i] as HTMLElement | undefined;
    el?.addClass("is-selected");
    if (scroll) el?.scrollIntoView({ block: "nearest" });
  }

  private async choose(i: number): Promise<void> {
    const p = this.papers[i];
    if (!p || this.busy) return;
    this.close();
    await this.plugin.saveAndOpen(p, this.existing[i]);
  }
}
