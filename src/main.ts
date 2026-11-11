import {
  Editor,
  FuzzySuggestModal,
  normalizePath,
  Notice,
  parseYaml,
  Platform,
  Plugin,
  requestUrl,
  TFile,
  TFolder,
  type App,
} from "obsidian";
import { ALL_LINK_KINDS, firstLink, firstWorkingLink, isSafeUrl, type LinkKind } from "./links";
import { FindPaperModal } from "./modal";
import { DEFAULT_NOTE_TEMPLATE, render, renderFilename, renderFolder, renderNote, sanitizeFilename, templateVars } from "./note";
import { confirm, downloadPdf, insertEmbed, isAbsolutePath, PDF_LINK_KINDS, saveInVault, saveOutside } from "./pdf";
import { confirmByDoi, findPapers, type SearchResult } from "./search";
import { openalex } from "./sources/openalex";
import { DEFAULT_SETTINGS, PaperFinderSettingTab, type PaperFinderSettings } from "./settings";
import type { HttpGet, Paper, SourceContext, SourceId } from "./types";
import { errorMessage, normalizeArxiv, normalizeDoi, plainText, yearOf } from "./util";

const TIMEOUT_MS = 20_000;

/** requestUrl avoids CORS. It has no timeout of its own, so one is added here. */
const obsidianHttp: HttpGet = (url, headers) => {
  if (!isSafeUrl(url)) return Promise.reject(new Error("Refusing a non-http(s) URL"));
  const req = requestUrl({ url, headers, throw: false }).then((r) => ({ status: r.status, text: r.text }));
  let timer = 0;
  const timeout = new Promise<never>((_, rej) => (timer = window.setTimeout(() => rej(new Error("timed out")), TIMEOUT_MS)));
  return Promise.race([req, timeout]).finally(() => window.clearTimeout(timer));
};

const normTitle = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");

export default class PaperFinderPlugin extends Plugin {
  settings!: PaperFinderSettings;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new PaperFinderSettingTab(this.app, this));

    this.addRibbonIcon("file-search", "Find paper", () => new FindPaperModal(this.app, this).open());

    this.addCommand({
      id: "find-paper",
      name: "Find paper",
      callback: () => new FindPaperModal(this.app, this).open(),
    });

    this.addCommand({
      id: "find-paper-from-selection",
      name: "Find paper from selected text",
      editorCallback: (editor: Editor) => new FindPaperModal(this.app, this, editor.getSelection().trim()).open(),
    });

    this.addCommand({
      id: "open-paper-link",
      name: "Open paper link of current note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !this.app.metadataCache.getFileCache(file)?.frontmatter) return false;
        if (!checking) void this.openLinkOfNote(file);
        return true;
      },
    });

    this.addCommand({
      id: "download-pdf",
      name: "Download PDF for current note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md" || !this.app.metadataCache.getFileCache(file)?.frontmatter) return false;
        if (!checking) void this.downloadPdfForNote(file);
        return true;
      },
    });

    this.addCommand({
      id: "cite-paper",
      name: "Cite paper",
      editorCallback: (editor: Editor, view) => {
        const sourcePath = view.file?.path ?? "";
        new CitePickerModal(this.app, this, (file) => editor.replaceSelection(this.citation(file, sourcePath))).open();
      },
    });
  }

  async loadSettings(): Promise<void> {
    const raw: unknown = await this.loadData();
    const data = (raw !== null && typeof raw === "object" ? raw : {}) as Partial<PaperFinderSettings>;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      sources: { ...DEFAULT_SETTINGS.sources, ...(data.sources ?? {}) },
      props: { ...DEFAULT_SETTINGS.props, ...(data.props ?? {}) },
      pdfOrder: Array.isArray(data.pdfOrder) ? data.pdfOrder : [...DEFAULT_SETTINGS.pdfOrder],
      noteLinkOrder: Array.isArray(data.noteLinkOrder) ? data.noteLinkOrder : [...DEFAULT_SETTINGS.noteLinkOrder],
      openLinkOrder: Array.isArray(data.openLinkOrder) ? data.openLinkOrder : [...DEFAULT_SETTINGS.openLinkOrder],
    };
    this.cleanOrders();
    await this.migrateApiKeys(raw);
  }

  /**
   * Before 0.1.1, API keys were stored in plain text in data.json. Move them into Obsidian's
   * secret storage and remove them from data.json.
   */
  private async migrateApiKeys(raw: unknown): Promise<void> {
    const data = (raw !== null && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const moves: [string, "openalexSecret" | "s2Secret", string][] = [
      ["openalexKey", "openalexSecret", "paper-finder-openalex"],
      ["s2Key", "s2Secret", "paper-finder-semantic-scholar"],
    ];
    let changed = false;
    for (const [oldKey, newKey, id] of moves) {
      const plain = data[oldKey];
      if (oldKey in this.settings) {
        delete (this.settings as unknown as Record<string, unknown>)[oldKey];
        changed = true;
      }
      if (typeof plain === "string" && plain.trim() && !this.settings[newKey]) {
        this.app.secretStorage.setSecret(id, plain.trim());
        this.settings[newKey] = id;
      }
    }
    if (changed) await this.saveSettings();
  }

  /** Drop unknown link kinds from saved settings (e.g. after a downgrade or a hand-edited data.json). */
  private cleanOrders(): void {
    const s = this.settings;
    const keep = (arr: LinkKind[], allowed: readonly LinkKind[], fallback: LinkKind[]) => {
      const out = arr.filter((k, i) => allowed.includes(k) && arr.indexOf(k) === i);
      return out.length ? out : [...fallback];
    };
    s.noteLinkOrder = keep(s.noteLinkOrder, ALL_LINK_KINDS, DEFAULT_SETTINGS.noteLinkOrder);
    s.openLinkOrder = keep(s.openLinkOrder, ALL_LINK_KINDS, DEFAULT_SETTINGS.openLinkOrder);
    s.pdfOrder = keep(s.pdfOrder, PDF_LINK_KINDS, DEFAULT_SETTINGS.pdfOrder);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private secret(id: string): string {
    return id ? this.app.secretStorage.getSecret(id) ?? "" : "";
  }

  private ctx(): SourceContext {
    const s = this.settings;
    return {
      http: obsidianHttp,
      mailto: s.mailto.trim(),
      openalexKey: this.secret(s.openalexSecret),
      s2Key: this.secret(s.s2Secret),
      limit: s.resultsPerSource,
    };
  }

  private enabledSources(): SourceId[] {
    return (Object.keys(this.settings.sources) as SourceId[]).filter((k) => this.settings.sources[k]);
  }

  search(query: string, isCancelled?: () => boolean): Promise<SearchResult> {
    const enabled = this.enabledSources();
    if (!enabled.length) return Promise.reject(new Error("No sources are enabled in the settings"));
    return findPapers(query, enabled, { ...this.ctx(), isCancelled }, this.settings.yearMode);
  }

  /** Property names from the settings, falling back to the defaults for empty ones. */
  private propNames(): PaperFinderSettings["props"] {
    const out = { ...DEFAULT_SETTINGS.props };
    for (const k of Object.keys(out) as (keyof PaperFinderSettings["props"])[]) {
      const v = this.settings.props[k]?.trim();
      if (v) out[k] = v;
    }
    return out;
  }

  private fm(file: TFile): Record<string, unknown> | undefined {
    return this.app.metadataCache.getFileCache(file)?.frontmatter;
  }

  /** Case-insensitive frontmatter lookup. */
  private prop(fm: Record<string, unknown> | undefined, key: string): unknown {
    if (!fm) return undefined;
    if (key in fm) return fm[key];
    const k = Object.keys(fm).find((x) => x.toLowerCase() === key.toLowerCase());
    return k ? fm[k] : undefined;
  }

  /** Frontmatter value as text: strings, numbers, booleans and lists of them. */
  private str(v: unknown): string {
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v)) return v.map((x) => this.str(x)).filter(Boolean).join("; ");
    return "";
  }

  /** A note for this paper already in the vault: same DOI, same arXiv id, or same (long) title. */
  findExisting(p: Paper): TFile | null {
    const P = this.propNames();
    const title = normTitle(p.title);
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = this.fm(f);
      if (!fm) continue;
      const doiRaw = this.str(this.prop(fm, P.doi)) + " " + this.str(this.prop(fm, P.url));
      if (p.doi && normalizeDoi(doiRaw) === p.doi) return f;
      const ax = normalizeArxiv(this.str(this.prop(fm, P.arxiv))) ?? (/arxiv\.org/.test(doiRaw) ? normalizeArxiv(doiRaw) : undefined);
      if (p.arxiv && ax === p.arxiv) return f;
      if (title.length >= 25 && normTitle(this.str(this.prop(fm, P.title))) === title) return f;
    }
    return null;
  }

  private async noteTemplate(): Promise<string> {
    const path = this.settings.templatePath;
    if (!path) return this.settings.templateText.trim() ? this.settings.templateText : DEFAULT_NOTE_TEMPLATE;
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path.endsWith(".md") ? path : `${path}.md`));
    if (!(file instanceof TFile)) {
      new Notice(`Paper Finder: template "${path}" not found; not creating the note.`);
      throw new Error(`template "${path}" not found`);
    }
    return this.app.vault.cachedRead(file);
  }

  private async ensureFolder(path: string): Promise<void> {
    if (!path) return;
    let cur = "";
    for (const seg of path.split("/")) {
      cur = cur ? `${cur}/${seg}` : seg;
      const f = this.app.vault.getAbstractFileByPath(cur);
      if (!f) await this.app.vault.createFolder(cur);
      else if (!(f instanceof TFolder)) throw new Error(`"${cur}" exists and is not a folder`);
    }
  }

  async createNote(p: Paper): Promise<TFile> {
    const url = firstLink(this.settings.noteLinkOrder, p);
    const vars = templateVars(p, url);
    const content = renderNote(await this.noteTemplate(), vars);

    // Never write a note whose frontmatter would not parse.
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    if (fm) {
      try {
        parseYaml(fm[1]);
      } catch (e) {
        throw new Error(`the note template produced invalid YAML (${errorMessage(e)})`);
      }
    }

    const folder = normalizePath(renderFolder(this.settings.folder, vars) || "/");
    await this.ensureFolder(folder === "/" ? "" : folder);
    const base = renderFilename(this.settings.filenameTemplate.trim() || DEFAULT_SETTINGS.filenameTemplate, vars);
    let path = normalizePath(folder === "/" ? `${base}.md` : `${folder}/${base}.md`);
    for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) {
      path = normalizePath(folder === "/" ? `${base} (${n}).md` : `${folder}/${base} (${n}).md`);
    }
    return this.app.vault.create(path, content);
  }

  async saveAndOpen(p: Paper, existing: TFile | null): Promise<void> {
    let file = existing;
    try {
      if (file) new Notice(`Already in your vault: ${file.basename}`);
      else {
        // In "first appearance" mode the preprint year is wanted, so only title/venue are refreshed.
        const confirmed = await confirmByDoi(p, this.enabledSources(), this.ctx());
        if (this.settings.yearMode === "first") confirmed.year = p.year;
        p = confirmed;
        file = await this.createNote(p);
        new Notice(`Created ${file.basename}`);
      }
    } catch (e) {
      new Notice(`Paper Finder: could not create the note: ${errorMessage(e)}`);
      return;
    }
    if (this.settings.openNoteAfterCreate || existing) await this.app.workspace.getLeaf(false).openFile(file);
    if (!existing && this.settings.pdfMode !== "off") {
      const go = this.settings.pdfMode === "always" || (await confirm(this.app, "Download PDF?", `Download the PDF of "${p.title}"?`));
      if (go) await this.attachPdf(file, p);
    }
    if (this.settings.openLinkAfterCreate) {
      const url = await firstWorkingLink(this.settings.openLinkOrder, p, obsidianHttp);
      if (url) await this.openUrl(url);
      else new Notice("Paper Finder: no link found for this paper.");
    }
  }

  /** Rebuild enough of a Paper from a note's properties to compute its links. */
  private paperFromNote(file: TFile): Paper {
    const P = this.propNames();
    const fm = this.fm(file);
    const url = this.str(this.prop(fm, P.url)).match(/https?:\/\/[^\s<>"')\]]+/)?.[0];
    const doi = normalizeDoi(this.str(this.prop(fm, P.doi))) ?? (url && /doi\.org/.test(url) ? normalizeDoi(url) : undefined);
    const arxiv = normalizeArxiv(this.str(this.prop(fm, P.arxiv))) ?? (url && /arxiv\.org/.test(url) ? normalizeArxiv(url) : undefined);
    const authorsRaw = this.prop(fm, P.authors);
    const authors = (Array.isArray(authorsRaw) ? authorsRaw.map((a) => this.str(a)) : this.str(authorsRaw).split(/\s*;\s*/))
      .map((a) => plainText(a))
      .filter(Boolean);
    return {
      title: plainText(this.str(this.prop(fm, P.title))) || file.basename,
      authors,
      year: yearOf(this.str(this.prop(fm, P.year))),
      doi,
      arxiv,
      publisherUrl: url,
      sources: [],
    };
  }

  async downloadPdfForNote(file: TFile): Promise<void> {
    const p = this.paperFromNote(file);
    const prop = this.settings.pdfProperty;
    if (prop && this.str(this.prop(this.fm(file), prop)).trim()) {
      if (!(await confirm(this.app, "Download PDF again?", `"${file.basename}" already has a ${prop} property.`, "Download again"))) return;
    }
    // Notes only store a DOI / arXiv id; ask OpenAlex for an open-access PDF (and a missing arXiv id).
    if (p.doi && (!p.arxiv || this.settings.pdfOrder.includes("oa-pdf"))) {
      const extra = await openalex.byDoi!(p.doi, this.ctx()).catch(() => null);
      if (extra) {
        p.arxiv ??= extra.arxiv;
        p.oaPdfUrl = extra.oaPdfUrl;
      }
    }
    await this.attachPdf(file, p);
  }

  /** Download the PDF, save it where the settings say, and link / embed it in the note. */
  async attachPdf(note: TFile, p: Paper): Promise<void> {
    const s = this.settings;
    const notice = new Notice("Downloading PDF…", 0);
    try {
      const dl = await downloadPdf(s.pdfOrder, p, s.pdfMaxMB);
      if ("error" in dl) {
        new Notice(`Paper Finder: no PDF saved (${dl.error}).`, 8000);
        return;
      }
      const vars = templateVars(p, undefined);
      const base = renderFilename(s.pdfFilenameTemplate.trim() || s.filenameTemplate.trim() || DEFAULT_SETTINGS.filenameTemplate, vars);
      let link: string;
      let embed: string | null = null;
      let where: string;
      if (s.pdfOutsideVault) {
        if (!isAbsolutePath(s.pdfFolder)) throw new Error("the PDF folder must be an absolute path (e.g. ~/Papers) when saving outside the vault");
        const dir = render(s.pdfFolder, vars, (v) => sanitizeFilename(v, 100));
        const out = await saveOutside(dir, base, dl.data);
        link = out.fileUrl;
        where = out.absPath;
      } else {
        const dir = s.pdfFolder ? renderFolder(s.pdfFolder, vars) : note.parent?.path ?? "";
        const pdf = await saveInVault(this.app, dir, base, dl.data);
        const linktext = this.app.metadataCache.fileToLinktext(pdf, note.path, false);
        link = `[[${linktext}]]`;
        embed = s.pdfEmbed ? `![[${linktext}]]` : null;
        where = pdf.path;
      }
      if (s.pdfProperty) await this.app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
          fm[s.pdfProperty] = link;
        });
      if (embed) {
        const e = embed;
        await this.app.vault.process(note, (c) => insertEmbed(c, e));
      }
      new Notice(`Saved PDF: ${where}`);
    } catch (e) {
      new Notice(`Paper Finder: could not save the PDF: ${errorMessage(e)}`, 8000);
    } finally {
      notice.hide();
    }
  }

  async openLinkOfNote(file: TFile): Promise<void> {
    const p = this.paperFromNote(file);
    const url = (await firstWorkingLink(this.settings.openLinkOrder, p, obsidianHttp)) ?? p.publisherUrl;
    if (isSafeUrl(url)) await this.openUrl(url);
    else new Notice("Paper Finder: this note has no DOI, arXiv ID or link.");
  }

  citation(file: TFile, sourcePath: string): string {
    const p = this.paperFromNote(file);
    const vars = templateVars(p, p.publisherUrl);
    const link = this.app.metadataCache.fileToLinktext(file, sourcePath, true);
    // Characters that would break a wikilink alias.
    const safe = (s: string) => s.replace(/[[\]|]/g, "");
    // Render the parts around {{link}} and join them with the link itself, so the link is never
    // re-interpreted as a template.
    return (this.settings.citeTemplate.trim() || DEFAULT_SETTINGS.citeTemplate)
      .split(/\{\{\s*link\s*\}\}/)
      .map((part) => render(part, vars, safe))
      .join(link);
  }

  async openUrl(url: string): Promise<void> {
    if (!isSafeUrl(url)) return;
    const mode = this.settings.openMode;
    // If the core Web viewer plugin is off, the view type below doesn't exist and we fall back.
    if (mode === "browser" || Platform.isMobile) {
      window.open(url, "_blank");
      return;
    }
    const leaf = mode === "tab" ? this.app.workspace.getLeaf("tab") : this.app.workspace.getLeaf("split", "vertical");
    try {
      await leaf.setViewState({ type: "webviewer", state: { url, navigate: true }, active: true });
      if (leaf.view.getViewType() !== "webviewer") throw new Error("web viewer unavailable");
    } catch {
      leaf.detach();
      window.open(url, "_blank");
    }
  }
}

class CitePickerModal extends FuzzySuggestModal<TFile> {
  constructor(app: App, private plugin: PaperFinderPlugin, private onPick: (f: TFile) => void) {
    super(app);
    this.setPlaceholder("Cite a source note…");
  }

  getItems(): TFile[] {
    // Static part of the folder setting, before any placeholder.
    const s = this.plugin.settings;
    const root = normalizePath((s.citeFolder || s.folder).split("{{")[0].replace(/\/+$/, "") || "/");
    const files = this.app.vault.getMarkdownFiles();
    return root === "/" ? files : files.filter((f) => f.path.startsWith(`${root}/`));
  }

  getItemText(f: TFile): string {
    return f.basename;
  }

  onChooseItem(f: TFile): void {
    this.onPick(f);
  }
}
