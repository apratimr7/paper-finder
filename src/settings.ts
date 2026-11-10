import { App, PluginSettingTab, Setting } from "obsidian";
import { ALL_LINK_KINDS, LINK_LABELS, type LinkKind } from "./links";
import { PLACEHOLDER_HELP } from "./note";
import { SOURCE_LABELS, type SourceId } from "./types";
import type PaperFinderPlugin from "./main";

export type OpenMode = "webviewer" | "tab" | "browser";

export interface PaperFinderSettings {
  folder: string;
  filenameTemplate: string;
  templatePath: string;
  citeTemplate: string;
  sources: Record<SourceId, boolean>;
  noteLinkOrder: LinkKind[];
  openLinkOrder: LinkKind[];
  openMode: OpenMode;
  openLinkAfterCreate: boolean;
  openNoteAfterCreate: boolean;
  searchAsYouType: boolean;
  debounceMs: number;
  resultsPerSource: number;
  mailto: string;
  openalexKey: string;
  s2Key: string;
  props: { title: string; authors: string; year: string; doi: string; arxiv: string; url: string };
}

export const DEFAULT_SETTINGS: PaperFinderSettings = {
  folder: "Papers",
  filenameTemplate: "{{author}} {{year}} - {{title}}",
  templatePath: "",
  citeTemplate: "[[{{link}}|{{authorsShort}} {{year}}]]",
  sources: { openalex: true, arxiv: true, inspire: true, crossref: true, semanticscholar: false },
  noteLinkOrder: ["doi", "arxiv-abs", "publisher", "inspire", "openalex"],
  openLinkOrder: ["arxiv-html", "ar5iv", "doi", "publisher"],
  openMode: "webviewer",
  openLinkAfterCreate: true,
  openNoteAfterCreate: true,
  searchAsYouType: true,
  debounceMs: 800,
  resultsPerSource: 8,
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
  private orderList(el: HTMLElement, name: string, desc: string, key: "noteLinkOrder" | "openLinkOrder"): void {
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
    const missing = ALL_LINK_KINDS.filter((k) => !order.includes(k));
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
