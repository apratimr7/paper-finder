import { App, PluginSettingTab, Setting } from "obsidian";
import { ALL_LINK_KINDS, LINK_LABELS, type LinkKind } from "./links";
import { DEFAULT_NOTE_TEMPLATE, PLACEHOLDER_HELP } from "./note";
import { PDF_LINK_KINDS } from "./pdf";
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
  openalexKey: string;
  s2Key: string;
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
  openalexKey: "",
  s2Key: "",
  props: { title: "title", authors: "authors", year: "year", doi: "doi", arxiv: "arxiv", url: "url" },
};

export class PaperFinderSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: PaperFinderPlugin) {
    super(app, plugin);
  }

  private get s() {
    return this.plugin.settings;
  }

  private save = () => this.plugin.saveSettings();

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("New notes").setHeading();

    new Setting(containerEl)
      .setName("Folder")
      .setDesc("Where new source notes are created. May contain placeholders, e.g. Papers/{{year}}.")
      .addText((t) => t.setPlaceholder("Papers").setValue(this.s.folder).onChange(async (v) => {
        this.s.folder = v.trim();
        await this.save();
      }));

    new Setting(containerEl)
      .setName("File name")
      .setDesc(`Placeholders: ${PLACEHOLDER_HELP}. Characters that are invalid in file names are removed.`)
      .addText((t) => t.setPlaceholder(DEFAULT_SETTINGS.filenameTemplate).setValue(this.s.filenameTemplate).onChange(async (v) => {
        this.s.filenameTemplate = v || DEFAULT_SETTINGS.filenameTemplate;
        await this.save();
      }));

    new Setting(containerEl)
      .setName("Note template")
      .setDesc(
        "Path to a template note in your vault (e.g. Templates/Paper.md). Leave empty for the built-in metadata-only template. " +
          "Same placeholders as above. A list item containing only {{authors}} becomes one item per author. " +
          "Frontmatter values are escaped automatically.",
      )
      .addText((t) => t.setPlaceholder("built-in").setValue(this.s.templatePath).onChange(async (v) => {
        this.s.templatePath = v.trim();
        await this.save();
      }));

    new Setting(containerEl)
      .setName("Year")
      .setDesc("Which year {{year}} means when they differ, e.g. a 1997 arXiv preprint published in 1999. Falls back to the other when only one is known.")
      .addDropdown((d) => d
        .addOptions({ published: "Journal publication year", first: "Year it first appeared (preprint)" })
        .setValue(this.s.yearMode)
        .onChange(async (v) => {
          this.s.yearMode = v as YearMode;
          await this.save();
        }));

    const tpl = new Setting(containerEl)
      .setName("Template text")
      .setDesc("Used when no template note is set. Leave empty for the built-in template shown as placeholder.");
    tpl.settingEl.addClass("paper-finder-template-setting");
    tpl.addTextArea((t) => {
      t.setPlaceholder(DEFAULT_NOTE_TEMPLATE).setValue(this.s.templateText).onChange(async (v) => {
        this.s.templateText = v;
        await this.save();
      });
      t.inputEl.rows = 14;
      t.inputEl.addClass("paper-finder-template-text");
    });

    new Setting(containerEl).setName("Sources").setHeading();
    for (const id of Object.keys(SOURCE_LABELS) as SourceId[]) {
      const desc: Record<SourceId, string> = {
        openalex: "Broad coverage across all fields (about 250M works).",
        arxiv: "Preprints. Limited to one request every 3 seconds, as arXiv asks.",
        inspire: "High-energy physics, gravitation and cosmology.",
        crossref: "Publisher metadata and exact DOI lookup.",
        semanticscholar: "Extra coverage for vague queries. Strictly rate-limited without an API key.",
      };
      new Setting(containerEl).setName(SOURCE_LABELS[id]).setDesc(desc[id]).addToggle((t) =>
        t.setValue(this.s.sources[id]).onChange(async (v) => {
          this.s.sources[id] = v;
          await this.save();
        }),
      );
    }
    new Setting(containerEl)
      .setName("Results per source")
      .addSlider((sl) => sl.setLimits(3, 25, 1).setValue(this.s.resultsPerSource).setDynamicTooltip().onChange(async (v) => {
        this.s.resultsPerSource = v;
        await this.save();
      }));

    new Setting(containerEl).setName("Links").setHeading();
    this.orderList(
      containerEl,
      "Link saved in the note",
      "The first link that exists for a paper, in this order, is stored as {{url}}.",
      "noteLinkOrder",
    );
    this.orderList(
      containerEl,
      "Link opened for reading",
      "Tried in this order. arXiv HTML and ar5iv are checked to exist before being used.",
      "openLinkOrder",
    );
    new Setting(containerEl)
      .setName("Open links in")
      .setDesc("The web viewer needs the core Web viewer plugin and desktop Obsidian; otherwise the system browser is used.")
      .addDropdown((d) => d
        .addOptions({ webviewer: "Web viewer, in a split", tab: "Web viewer, in a new tab", browser: "System browser" })
        .setValue(this.s.openMode)
        .onChange(async (v) => {
          this.s.openMode = v as OpenMode;
          await this.save();
        }));
    new Setting(containerEl).setName("Open the paper after creating its note").addToggle((t) =>
      t.setValue(this.s.openLinkAfterCreate).onChange(async (v) => {
        this.s.openLinkAfterCreate = v;
        await this.save();
      }),
    );
    new Setting(containerEl).setName("Open the new note").addToggle((t) =>
      t.setValue(this.s.openNoteAfterCreate).onChange(async (v) => {
        this.s.openNoteAfterCreate = v;
        await this.save();
      }),
    );

    new Setting(containerEl)
      .setName("PDFs")
      .setHeading()
      .setDesc("Only arXiv and open-access PDFs are downloaded. Files that are not real PDFs (e.g. paywall pages) are rejected.");
    new Setting(containerEl)
      .setName("Download PDF when creating a note")
      .setDesc("The Download PDF for current note command works whatever this is set to.")
      .addDropdown((d) => d
        .addOptions({ off: "Never", ask: "Ask each time", always: "Always" })
        .setValue(this.s.pdfMode)
        .onChange(async (v) => {
          this.s.pdfMode = v as PdfMode;
          await this.save();
        }));
    new Setting(containerEl)
      .setName("Save PDFs outside the vault")
      .setDesc("Off: PDFs go into the vault and can be embedded. On: PDFs go to a folder anywhere on this computer; the note gets a file:// link and no embed.")
      .addToggle((t) => t.setValue(this.s.pdfOutsideVault).onChange(async (v) => {
        this.s.pdfOutsideVault = v;
        await this.save();
        this.display();
      }));
    new Setting(containerEl)
      .setName("PDF folder")
      .setDesc(
        this.s.pdfOutsideVault
          ? "An absolute path on this computer, e.g. ~/Papers, /data/papers or C:\\Users\\me\\Papers. May contain placeholders."
          : "A folder in the vault, e.g. Attachments/Papers. May contain placeholders. Empty: next to the note.",
      )
      .addText((t) => t.setPlaceholder(this.s.pdfOutsideVault ? "~/Papers" : "next to the note").setValue(this.s.pdfFolder).onChange(async (v) => {
        this.s.pdfFolder = v.trim();
        await this.save();
      }));
    new Setting(containerEl)
      .setName("PDF file name")
      .setDesc("Placeholders as for notes. Empty: same as the note's file name.")
      .addText((t) => t.setPlaceholder("same as note").setValue(this.s.pdfFilenameTemplate).onChange(async (v) => {
        this.s.pdfFilenameTemplate = v;
        await this.save();
      }));
    this.orderList(containerEl, "PDF sources", "Tried in this order.", "pdfOrder", PDF_LINK_KINDS);
    new Setting(containerEl)
      .setName("Embed the PDF in the note")
      .setDesc("Adds ![[file.pdf]] before a References heading, or at the end. Only for PDFs inside the vault.")
      .addToggle((t) => t.setValue(this.s.pdfEmbed).onChange(async (v) => {
        this.s.pdfEmbed = v;
        await this.save();
      }));
    new Setting(containerEl)
      .setName("PDF property")
      .setDesc("Frontmatter key that gets the link to the PDF. Empty: don't add one.")
      .addText((t) => t.setPlaceholder("pdf").setValue(this.s.pdfProperty).onChange(async (v) => {
        this.s.pdfProperty = v.trim();
        await this.save();
      }));
    new Setting(containerEl)
      .setName("Maximum PDF size (MB)")
      .addSlider((sl) => sl.setLimits(5, 200, 5).setValue(this.s.pdfMaxMB).setDynamicTooltip().onChange(async (v) => {
        this.s.pdfMaxMB = v;
        await this.save();
      }));

    new Setting(containerEl).setName("Search").setHeading();
    new Setting(containerEl).setName("Search as you type").setDesc("Off: search only when you press Enter.").addToggle((t) =>
      t.setValue(this.s.searchAsYouType).onChange(async (v) => {
        this.s.searchAsYouType = v;
        await this.save();
      }),
    );
    new Setting(containerEl)
      .setName("Typing delay (ms)")
      .setDesc("How long to wait after the last keystroke before searching.")
      .addSlider((sl) => sl.setLimits(300, 2000, 100).setValue(this.s.debounceMs).setDynamicTooltip().onChange(async (v) => {
        this.s.debounceMs = v;
        await this.save();
      }));

    new Setting(containerEl).setName("Citations").setHeading();
    new Setting(containerEl)
      .setName("Citation format")
      .setDesc("Inserted by the Cite paper command. {{link}} is the link to the source note; other placeholders come from its properties.")
      .addText((t) => t.setPlaceholder(DEFAULT_SETTINGS.citeTemplate).setValue(this.s.citeTemplate).onChange(async (v) => {
        this.s.citeTemplate = v || DEFAULT_SETTINGS.citeTemplate;
        await this.save();
      }));

    new Setting(containerEl)
      .setName("Cite from folder")
      .setDesc("Source notes offered by Cite paper. Leave empty to use the folder for new notes; use / for the whole vault.")
      .addText((t) => t.setPlaceholder("same as new notes").setValue(this.s.citeFolder).onChange(async (v) => {
        this.s.citeFolder = v.trim();
        await this.save();
      }));

    new Setting(containerEl)
      .setName("Property names")
      .setHeading()
      .setDesc("The frontmatter keys your template uses. Used to detect papers already in the vault, to cite, and to open links.");
    const labels: Record<keyof PaperFinderSettings["props"], string> = {
      title: "Title", authors: "Authors", year: "Year", doi: "DOI", arxiv: "arXiv id", url: "Link",
    };
    for (const k of Object.keys(labels) as (keyof PaperFinderSettings["props"])[]) {
      new Setting(containerEl).setName(labels[k]).addText((t) => t.setPlaceholder(DEFAULT_SETTINGS.props[k]).setValue(this.s.props[k]).onChange(async (v) => {
        this.s.props[k] = v.trim() || DEFAULT_SETTINGS.props[k];
        await this.save();
      }));
    }

    new Setting(containerEl)
      .setName("Optional API access")
      .setHeading()
      .setDesc("All of these are optional and empty by default. They are stored in this plugin's data.json in your vault, so don't use this if you sync your vault somewhere public.");
    new Setting(containerEl)
      .setName("Contact e-mail")
      .setDesc("Sent to OpenAlex and Crossref only if you fill it in. They give faster, more reliable service to identified clients.")
      .addText((t) => t.setValue(this.s.mailto).onChange(async (v) => {
        this.s.mailto = v.trim();
        await this.save();
      }));
    new Setting(containerEl).setName("OpenAlex API key").addText((t) => {
      t.inputEl.type = "password";
      t.setValue(this.s.openalexKey).onChange(async (v) => {
        this.s.openalexKey = v.trim();
        await this.save();
      });
    });
    new Setting(containerEl).setName("Semantic Scholar API key").addText((t) => {
      t.inputEl.type = "password";
      t.setValue(this.s.s2Key).onChange(async (v) => {
        this.s.s2Key = v.trim();
        await this.save();
      });
    });
  }

  /** A reorderable list of link kinds, with add / remove. */
  private orderList(
    el: HTMLElement,
    name: string,
    desc: string,
    key: "noteLinkOrder" | "openLinkOrder" | "pdfOrder",
    allowed: LinkKind[] = ALL_LINK_KINDS,
  ): void {
    new Setting(el).setName(name).setDesc(desc);
    const order = this.s[key];
    order.forEach((kind, i) => {
      new Setting(el)
        .setClass("paper-finder-order-item")
        .setName(`${i + 1}. ${LINK_LABELS[kind]}`)
        .addExtraButton((b) => b.setIcon("arrow-up").setTooltip("Move up").setDisabled(i === 0).onClick(async () => {
          [order[i - 1], order[i]] = [order[i], order[i - 1]];
          await this.save();
          this.display();
        }))
        .addExtraButton((b) => b.setIcon("arrow-down").setTooltip("Move down").setDisabled(i === order.length - 1).onClick(async () => {
          [order[i + 1], order[i]] = [order[i], order[i + 1]];
          await this.save();
          this.display();
        }))
        .addExtraButton((b) => b.setIcon("x").setTooltip("Remove").setDisabled(order.length === 1).onClick(async () => {
          order.splice(i, 1);
          await this.save();
          this.display();
        }));
    });
    const missing = allowed.filter((k) => !order.includes(k));
    if (missing.length) {
      new Setting(el).setClass("paper-finder-order-item").addDropdown((d) => {
        d.addOption("", "Add a link type…");
        for (const k of missing) d.addOption(k, LINK_LABELS[k]);
        d.onChange(async (v) => {
          if (!v) return;
          order.push(v as LinkKind);
          await this.save();
          this.display();
        });
      });
    }
  }
}
