import {
  App,
  Menu,
  PluginSettingTab,
  type SettingDefinition,
  type SettingDefinitionItem,
  type SettingDefinitionList,
} from "obsidian";
import { ALL_LINK_KINDS, LINK_LABELS, type LinkKind } from "./links";
import { DEFAULT_NOTE_TEMPLATE, PLACEHOLDER_HELP } from "./note";
import { isAbsolutePath, PDF_LINK_KINDS } from "./pdf";
import type { YearMode } from "./search";
import { SOURCE_LABELS, type SourceId } from "./types";
import type PaperFinderPlugin from "./main";

export type OpenMode = "webviewer" | "tab" | "browser";
export type PdfMode = "off" | "ask" | "always";

export interface PaperFinderSettings {
  folder: string;
  filenameTemplate: string;
  templatePath: string;
  templateText: string;
  citeTemplate: string;
  citeFolder: string;
  sources: Record<SourceId, boolean>;
  noteLinkOrder: LinkKind[];
  openLinkOrder: LinkKind[];
  openMode: OpenMode;
  openLinkAfterCreate: boolean;
  openNoteAfterCreate: boolean;
  yearMode: YearMode;
  searchAsYouType: boolean;
  debounceMs: number;
  resultsPerSource: number;
  pdfMode: PdfMode;
  pdfFolder: string;
  pdfOutsideVault: boolean;
  pdfFilenameTemplate: string;
  pdfOrder: LinkKind[];
  pdfEmbed: boolean;
  pdfProperty: string;
  pdfMaxMB: number;
  mailto: string;
  /** Ids of secrets in Obsidian's secret storage (the keys themselves are not stored in data.json). */
  openalexSecret: string;
  s2Secret: string;
  props: { title: string; authors: string; year: string; doi: string; arxiv: string; url: string };
}

export const DEFAULT_SETTINGS: PaperFinderSettings = {
  folder: "Papers",
  filenameTemplate: "{{author}} {{year}} - {{title}}",
  templatePath: "",
  templateText: "",
  citeTemplate: "[[{{link}}|{{authorsShort}} {{year}}]]",
  citeFolder: "",
  sources: { openalex: true, arxiv: true, inspire: true, crossref: true, semanticscholar: false },
  noteLinkOrder: ["doi", "arxiv-abs", "publisher", "inspire", "openalex"],
  openLinkOrder: ["arxiv-html", "ar5iv", "doi", "publisher"],
  openMode: "webviewer",
  openLinkAfterCreate: true,
  openNoteAfterCreate: true,
  yearMode: "published",
  searchAsYouType: true,
  debounceMs: 800,
  resultsPerSource: 8,
  pdfMode: "off",
  pdfFolder: "",
  pdfOutsideVault: false,
  pdfFilenameTemplate: "",
  pdfOrder: ["arxiv-pdf", "oa-pdf"],
  pdfEmbed: true,
  pdfProperty: "pdf",
  pdfMaxMB: 50,
  mailto: "",
  openalexSecret: "",
  s2Secret: "",
  props: { title: "title", authors: "authors", year: "year", doi: "doi", arxiv: "arxiv", url: "url" },
};

type OrderKey = "noteLinkOrder" | "openLinkOrder" | "pdfOrder";

const SOURCE_DESC: Record<SourceId, string> = {
  openalex: "Broad coverage across all fields (about 250 million works).",
  arxiv: "Preprints. Limited to one request every 3 seconds, as arXiv asks.",
  inspire: "High-energy physics, gravitation and cosmology.",
  crossref: "Publisher metadata and exact DOI lookup.",
  semanticscholar: "Extra coverage for vague queries. Strictly rate-limited without an API key.",
};

const PROP_LABELS: Record<keyof PaperFinderSettings["props"], string> = {
  title: "Title property",
  authors: "Authors property",
  year: "Year property",
  doi: "DOI property",
  arxiv: "arXiv ID property",
  url: "Link property",
};

const notEmpty = (what: string) => (v: string) => (v.trim() ? undefined : `${what} can't be empty.`);

/** Settings built with Obsidian's declarative settings API, so they are searchable in the settings. */
export class PaperFinderSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: PaperFinderPlugin) {
    super(app, plugin);
  }

  private get s(): PaperFinderSettings {
    return this.plugin.settings;
  }

  /** Supports nested keys such as "sources.arxiv" and "props.doi". */
  getControlValue(key: string): unknown {
    const [head, sub] = key.split(".");
    const top = (this.s as unknown as Record<string, unknown>)[head];
    if (sub === undefined) return top;
    return top !== null && typeof top === "object" ? (top as Record<string, unknown>)[sub] : undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const [head, sub] = key.split(".");
    const settings = this.s as unknown as Record<string, unknown>;
    if (sub === undefined) settings[head] = value;
    else (settings[head] as Record<string, unknown>)[sub] = value;
    await this.plugin.saveSettings();
    // Settings whose value shows or hides other settings.
    if (key === "pdfOutsideVault" || key === "searchAsYouType" || key === "pdfMode") this.update();
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: "group",
        heading: "New notes",
        items: [
          {
            name: "Folder",
            desc: "Where new source notes are created. May contain placeholders, e.g. Papers/{{year}}.",
            control: { type: "text", key: "folder", placeholder: "Papers", validate: notEmpty("The folder") },
          },
          {
            name: "File name",
            desc: `Placeholders: ${PLACEHOLDER_HELP}. Characters that are invalid in file names are removed.`,
            control: { type: "text", key: "filenameTemplate", placeholder: DEFAULT_SETTINGS.filenameTemplate, validate: notEmpty("The file name") },
          },
          {
            name: "Note template",
            desc:
              "A template note in your vault. Leave empty to use the template text below. " +
              "A list item containing only {{authors}} becomes one item per author. Frontmatter values are escaped automatically.",
            control: { type: "file", key: "templatePath", placeholder: "Templates/Paper.md", filter: (f) => f.extension === "md" },
          },
          {
            name: "Template text",
            desc: "Used when no template note is set. Leave empty for the built-in template shown as placeholder.",
            control: { type: "textarea", key: "templateText", placeholder: DEFAULT_NOTE_TEMPLATE, rows: 14 },
          },
          {
            name: "Year",
            desc: "Which year {{year}} means when they differ, e.g. a 1997 preprint published in 1998. Falls back to the other when only one is known.",
            control: {
              type: "dropdown",
              key: "yearMode",
              options: { published: "Journal publication year", first: "Year it first appeared (preprint)" },
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Sources",
        items: [
          ...(Object.keys(SOURCE_LABELS) as SourceId[]).map(
            (id): SettingDefinition => ({
              name: SOURCE_LABELS[id],
              desc: SOURCE_DESC[id],
              control: { type: "toggle", key: `sources.${id}` },
            }),
          ),
          {
            name: "Results per source",
            control: { type: "slider", key: "resultsPerSource", min: 3, max: 25, step: 1 },
          },
        ],
      },
      {
        type: "group",
        heading: "Links",
        items: [
          {
            name: "Open links in",
            desc: "The Web viewer needs the core Web viewer plugin; otherwise the system browser is used.",
            control: {
              type: "dropdown",
              key: "openMode",
              options: { webviewer: "Web viewer, in a split", tab: "Web viewer, in a new tab", browser: "System browser" },
            },
          },
          { name: "Open the paper after creating its note", control: { type: "toggle", key: "openLinkAfterCreate" } },
          { name: "Open the new note", control: { type: "toggle", key: "openNoteAfterCreate" } },
        ],
      },
      this.orderList("Link saved in the note", "The first link that exists is stored as {{url}}.", "noteLinkOrder", ALL_LINK_KINDS),
      this.orderList(
        "Link opened for reading",
        "Tried in order. arXiv HTML and ar5iv are checked to exist first.",
        "openLinkOrder",
        ALL_LINK_KINDS,
      ),
      {
        type: "group",
        heading: "PDFs",
        items: [
          {
            name: "Download PDF when creating a note",
            desc: "Only arXiv and open-access PDFs are downloaded; files that aren't real PDFs (e.g. paywall pages) are rejected. The Download PDF for current note command works whatever this is set to.",
            control: { type: "dropdown", key: "pdfMode", options: { off: "Never", ask: "Ask each time", always: "Always" } },
          },
          {
            name: "Save PDFs outside the vault",
            desc: "Off: PDFs go into the vault and can be embedded. On: PDFs go to a folder anywhere on this computer; the note gets a file:// link and no embed.",
            control: { type: "toggle", key: "pdfOutsideVault" },
          },
          {
            name: "PDF folder",
            desc: "A folder in the vault, e.g. Attachments/Papers. May contain placeholders. Empty: next to the note.",
            visible: () => !this.s.pdfOutsideVault,
            control: { type: "text", key: "pdfFolder", placeholder: "next to the note" },
          },
          {
            name: "PDF folder",
            desc: "An absolute path on this computer, e.g. ~/Papers, /data/papers or C:\\Users\\me\\Papers. May contain placeholders.",
            visible: () => this.s.pdfOutsideVault,
            control: {
              type: "text",
              key: "pdfFolder",
              placeholder: "~/Papers",
              validate: (v) => (isAbsolutePath(v) ? undefined : "Use an absolute path, e.g. ~/Papers."),
            },
          },
          {
            name: "PDF file name",
            desc: "Placeholders as for notes. Empty: same as the note's file name.",
            control: { type: "text", key: "pdfFilenameTemplate", placeholder: "same as the note" },
          },
          {
            name: "Embed the PDF in the note",
            desc: "Adds ![[file.pdf]] before a References heading, or at the end.",
            visible: () => !this.s.pdfOutsideVault,
            control: { type: "toggle", key: "pdfEmbed" },
          },
          {
            name: "PDF property",
            desc: "Frontmatter key that gets the link to the PDF. Empty: don't add one.",
            control: { type: "text", key: "pdfProperty", placeholder: "pdf" },
          },
          {
            name: "Maximum PDF size",
            control: { type: "slider", key: "pdfMaxMB", min: 5, max: 200, step: 5, displayFormat: (v) => `${v} MB` },
          },
        ],
      },
      this.orderList("PDF sources", "Tried in this order.", "pdfOrder", PDF_LINK_KINDS),
      {
        type: "group",
        heading: "Search",
        items: [
          {
            name: "Search as you type",
            desc: "Off: search only when you press Enter.",
            control: { type: "toggle", key: "searchAsYouType" },
          },
          {
            name: "Typing delay",
            desc: "How long to wait after the last keystroke before searching.",
            control: {
              type: "slider",
              key: "debounceMs",
              min: 300,
              max: 2000,
              step: 100,
              displayFormat: (v) => `${v} ms`,
              disabled: () => !this.s.searchAsYouType,
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Citations",
        items: [
          {
            name: "Citation format",
            desc: "Inserted by the Cite paper command. {{link}} is the link to the source note; other placeholders come from its properties.",
            control: { type: "text", key: "citeTemplate", placeholder: DEFAULT_SETTINGS.citeTemplate, validate: notEmpty("The citation format") },
          },
          {
            name: "Cite from folder",
            desc: "Source notes offered by Cite paper. Empty: the folder for new notes. Use / for the whole vault.",
            control: { type: "text", key: "citeFolder", placeholder: "same as new notes" },
          },
        ],
      },
      {
        type: "group",
        heading: "Property names",
        items: [
          {
            name: "About property names",
            desc: "The frontmatter keys your template uses. They are used to detect papers already in the vault, to cite, and to open links and download PDFs for existing notes.",
          },
          ...(Object.keys(PROP_LABELS) as (keyof PaperFinderSettings["props"])[]).map(
            (k): SettingDefinition => ({
              name: PROP_LABELS[k],
              control: { type: "text", key: `props.${k}`, placeholder: DEFAULT_SETTINGS.props[k], validate: notEmpty("The property name") },
            }),
          ),
        ],
      },
      {
        type: "group",
        heading: "Optional API access",
        items: [
          {
            name: "Contact e-mail",
            desc: "Sent to OpenAlex and Crossref only if you fill it in. They give faster, more reliable service to identified clients. Stored in this plugin's data.json in your vault.",
            control: { type: "text", key: "mailto", placeholder: "none" },
          },
          {
            name: "OpenAlex API key",
            desc: "Optional. Kept in Obsidian's secret storage, not in your vault.",
            control: { type: "secret", key: "openalexSecret" },
          },
          {
            name: "Semantic Scholar API key",
            desc: "Recommended if Semantic Scholar is enabled. Kept in Obsidian's secret storage, not in your vault.",
            control: { type: "secret", key: "s2Secret" },
          },
        ],
      },
    ];
  }

  /** A drag-to-reorder list of link types, with delete and add. */
  private orderList(heading: string, desc: string, key: OrderKey, allowed: readonly LinkKind[]): SettingDefinitionList {
    const order = this.s[key];
    const missing = allowed.filter((k) => !order.includes(k));
    return {
      type: "list",
      heading,
      items: order.map((kind, i): SettingDefinition => ({ name: LINK_LABELS[kind], desc: i === 0 ? desc : undefined })),
      emptyState: "Add at least one link type.",
      onReorder: (from, to) => {
        const [moved] = order.splice(from, 1);
        order.splice(to, 0, moved);
        void this.saveAndRefresh();
      },
      onDelete: (i) => {
        if (order.length <= 1) return;
        order.splice(i, 1);
        void this.saveAndRefresh();
      },
      addItem: missing.length
        ? {
            name: "Add a link type",
            action: (el) => {
              const menu = new Menu();
              for (const k of missing) {
                menu.addItem((item) =>
                  item.setTitle(LINK_LABELS[k]).onClick(() => {
                    order.push(k);
                    void this.saveAndRefresh();
                  }),
                );
              }
              const r = el.getBoundingClientRect();
              menu.showAtPosition({ x: r.left, y: r.bottom });
            },
          }
        : undefined,
    };
  }

  private async saveAndRefresh(): Promise<void> {
    await this.plugin.saveSettings();
    this.update();
  }
}
