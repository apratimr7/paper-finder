# Paper Finder

Find research papers from whatever scraps of information you have, without leaving [Obsidian](https://obsidian.md). Save each one as a source note, and optionally save its PDF too.

You heard about a paper in a talk, saw it cited in a book, or caught half a title on social media. Type what you remember:

```
schuller constructive gravity 2020
Penedones TASI AdS/CFT
1608.04948
hep-th/9711200
10.1103/PhysRevD.101.084046
https://journals.aps.org/prd/abstract/10.1103/PhysRevD.101.084046
```

Paper Finder searches several free scholarly databases at once, merges the duplicates, and shows the best matches with authors, year, venue and part of the abstract. Pick one, and it:

1. **creates a source note** from your template, with title, authors, year, DOI, arXiv id, link and citation key. If the paper is already in your vault, it opens your existing note instead.
2. **opens the paper** in Obsidian's web viewer, in a split next to your note. It prefers the arXiv HTML version, which renders the math.
3. **optionally downloads the PDF**, either into your vault (embedded in the note) or into any folder on your computer.

No account and no reference manager are needed. Everything stays in Obsidian.

> **Status:** 0.1.0, early release. Feedback and pull requests are welcome (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [What you can type](#what-you-can-type)
- [Commands](#commands)
- [Settings](#settings)
- [Note templates and placeholders](#note-templates-and-placeholders)
- [PDFs](#pdfs-1)
- [Example setup](#example-setup)
- [Data sources](#data-sources)
- [Network use, files and privacy](#network-use-files-and-privacy)
- [Troubleshooting](#troubleshooting)
- [Contributing and development](#contributing-and-development)

## Installation

Paper Finder needs **desktop Obsidian** (Windows, macOS or Linux), version 1.8 or newer. It isn't available on mobile because it uses desktop-only file access to save PDFs outside the vault.

**From Obsidian** (once the plugin is listed in the community directory):
1. Open *Settings → Community plugins → Browse*.
2. Search for **Paper Finder**, then install and enable it.

**With BRAT** (beta releases):
1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin.
2. Choose *Add beta plugin*, enter `apratimr7/paper-finder`, and enable the plugin.

**Manually:**
1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/apratimr7/paper-finder/releases/latest).
2. Put them in `<your vault>/.obsidian/plugins/paper-finder/`.
3. Reload Obsidian and enable **Paper Finder** under *Settings → Community plugins*.

Release files are built by GitHub Actions and carry a [build provenance attestation](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations). You can verify a download with `gh attestation verify main.js --repo apratimr7/paper-finder`.

## Quick start

1. Under *Settings → Paper Finder*, set **Folder** to where your source notes should go (default: `Papers`).
2. Under *Settings → Hotkeys*, give **Paper Finder: Find paper** a hotkey. No hotkey is set by default. You can also click the search ribbon icon.
3. Run **Find paper**, type something, and wait a moment or press **Enter**.
4. Use **↑ / ↓** to move through the results and **Enter** to pick one. Clicking a result also picks it.

Results already in your vault are marked **in vault**. Picking one opens your note instead of creating a duplicate.

## What you can type

| Input | Example | What happens |
|---|---|---|
| Free text | `maldacena large n limit superconformal` | Fuzzy search in every enabled source. A year in the text boosts papers from that year. |
| DOI | `10.1103/PhysRevD.101.084046`, `doi:10.…` | Direct lookup |
| arXiv id | `1608.04948`, `arXiv:1608.04948v2`, `hep-th/9711200` | Direct lookup (the version is ignored) |
| arXiv / ar5iv URL | `https://arxiv.org/abs/1711.03220v2`, `…/pdf/…`, `…/html/…` | Direct lookup |
| doi.org URL | `https://doi.org/10.1038/s41586-019-1666-5` | Direct lookup |
| INSPIRE, OpenAlex, Semantic Scholar URL | `https://inspirehep.net/literature/451647` | Looked up in that database, then completed from the others |
| Publisher URL | `https://www.nature.com/articles/s41586-019-1666-5` | The DOI is read from the URL, or from the page's citation metadata |

Tip: select text in a note and run **Find paper from selected text**.

## Commands

| Command | What it does |
|---|---|
| **Find paper** | Opens the search box. |
| **Find paper from selected text** | Searches for the current selection. |
| **Open paper link of current note** | Opens the current source note's paper, following your *Link opened for reading* order. |
| **Download PDF for current note** | Downloads the PDF for the paper in the current note. Works on notes the plugin didn't create, as long as they have a DOI, arXiv id or link. |
| **Cite paper** | Pick a source note and insert a citation at the cursor, by default `[[Note\|Maldacena 1998]]`. |

## Settings

### New notes

| Setting | Default | Description |
|---|---|---|
| Folder | `Papers` | Where new notes are created. Can contain placeholders, e.g. `Papers/{{year}}`. Missing folders are created. |
| File name | `{{author}} {{year}} - {{title}}` | Gives e.g. `Maldacena 1998 - The large N limit of superconformal field theories and supergravity`. Characters that aren't allowed in file names are removed, and `:` becomes ` -`. |
| Note template | *(empty)* | Path to a template note in your vault, e.g. `Templates/Paper.md`. |
| Template text | *(empty)* | A template written directly in the settings. Used when no template note is set. If both are empty, the built-in template is used. |
| Year | Journal publication year | Which year `{{year}}` means when they differ, e.g. a 1997 preprint published in 1998. The other choice is *Year it first appeared (preprint)*. |

### Sources

You can turn each database on or off, and set how many results each one returns (default 8). See [Data sources](#data-sources).

### Links

| Setting | Default | Description |
|---|---|---|
| Link saved in the note | DOI → arXiv abstract → publisher → INSPIRE → OpenAlex | The first link that exists for a paper becomes `{{url}}`. |
| Link opened for reading | arXiv HTML → ar5iv → DOI → publisher | Tried in order. arXiv HTML and ar5iv are checked to exist before they're used. |
| Open links in | Web viewer, in a split | Or *Web viewer, in a new tab*, or *System browser*. If the core **Web viewer** plugin is off, the system browser is used. |
| Open the paper after creating its note | on | |
| Open the new note | on | |

Both link lists can be reordered, shortened and extended. Available link types: arXiv HTML, ar5iv, arXiv abstract, arXiv PDF, DOI, publisher page, open-access PDF, INSPIRE-HEP, OpenAlex, Semantic Scholar.

### PDFs

See [PDFs](#pdfs-1) below.

### Search

| Setting | Default | Description |
|---|---|---|
| Search as you type | on | Off means search only when you press Enter. |
| Typing delay | 800 ms | How long to wait after the last keystroke. Pasted identifiers are searched almost immediately. |

### Citations

| Setting | Default | Description |
|---|---|---|
| Citation format | `[[{{link}}\|{{authorsShort}} {{year}}]]` | Inserted by **Cite paper**. `{{link}}` is the link to the note; the other placeholders are read from the note's properties. |
| Cite from folder | *(the notes folder)* | Which notes **Cite paper** offers. Use `/` for the whole vault. |

### Property names

These are the frontmatter keys your template uses for **title, authors, year, DOI, arXiv id and link**. Defaults are `title`, `authors`, `year`, `doi`, `arxiv` and `url`, and matching ignores case. Paper Finder uses them to:

- recognise papers already in your vault;
- build citations;
- open links and download PDFs for existing notes.

If your template uses other keys (e.g. `Year of Publication`), enter them here.

### Optional API access

| Setting | Description |
|---|---|
| Contact e-mail | Sent to OpenAlex and Crossref only if you fill it in. They give identified clients faster, more reliable service (their "polite pool"). |
| OpenAlex API key | Optional. |
| Semantic Scholar API key | Recommended if you enable Semantic Scholar, which strictly rate-limits requests without a key. |

These are stored in the plugin's `data.json` inside your vault. Don't fill them in if you publish or share your vault folder.

## Note templates and placeholders

The built-in template creates a metadata-only note:

```yaml
---
title: "{{title}}"
authors:
  - "{{authors}}"
year: "{{year}}"
venue: "{{venue}}"
doi: "{{doi}}"
arxiv: "{{arxiv}}"
url: "{{url}}"
citekey: "{{citekey}}"
type: article
created: "{{date}} {{time}}"
---
```

Your own template can contain anything. These placeholders work in templates, file names, folders and the citation format:

| Placeholder | Value |
|---|---|
| `{{title}}` | Title |
| `{{author}}` | First author's family name. Particles are kept: `'t Hooft`, `van der Waals`. |
| `{{authorsShort}}` | `Smith`, `Smith and Doe`, or `Smith et al.` |
| `{{firstAuthor}}` | First author's full name |
| `{{authors}}` | All authors. Alone on a YAML list line (`  - "{{authors}}"`), it becomes one list item per author. Elsewhere it's `A; B; C`. |
| `{{year}}` | Year (see the *Year* setting) |
| `{{venue}}` | Journal or conference |
| `{{doi}}` | DOI, e.g. `10.1103/physrevd.101.084046` |
| `{{arxiv}}` | arXiv id, e.g. `1608.04948` |
| `{{url}}` | The link chosen by *Link saved in the note* |
| `{{citekey}}` | First author's family name + year, e.g. `Maldacena1998` |
| `{{abstract}}` | Abstract, as plain text |
| `{{date}}`, `{{time}}` | When the note was created: `YYYY-MM-DD`, `HH:mm` |

**Your frontmatter can't break.** Values are YAML-escaped automatically, whether you put quotes around the placeholder or not, so a title such as `AdS/CFT: a "review" #2` is safe. The result is parsed before anything is written; if your template produces invalid YAML, the note isn't created and you get an error message instead.

An example template with custom keys is in [`examples/academic-paper-template.md`](examples/academic-paper-template.md).

## PDFs

PDF download is **off by default**. Turn it on under *Settings → Paper Finder → PDFs*.

| Setting | Default | Description |
|---|---|---|
| Download PDF when creating a note | Never | *Never*, *Ask each time* or *Always*. **Download PDF for current note** works whatever this is set to. |
| Save PDFs outside the vault | off | See below. |
| PDF folder | *(next to the note)* | See below. |
| PDF file name | *(same as the note)* | Placeholders as above. |
| PDF sources | arXiv PDF → open-access PDF | Order in which download sources are tried. |
| Embed the PDF in the note | on | Adds `![[file.pdf]]` before the note's `References` heading, or at the end if it has none. |
| PDF property | `pdf` | Frontmatter key that gets the link to the PDF. Leave empty for none. |
| Maximum PDF size | 50 MB | Larger files are skipped. |

**Where PDFs go:**

- **Inside the vault** (*Save PDFs outside the vault* off): **PDF folder** is a vault folder such as `Attachments/Papers` or `PDFs/{{year}}`. Leave it empty to save next to the note. The PDF can be embedded and opened in Obsidian's PDF viewer.
- **Outside the vault** (*Save PDFs outside the vault* on): **PDF folder** must be an absolute path such as `~/Papers`, `/data/papers` or `C:\Users\me\Papers`. This is useful to keep large files out of a synced vault. The note gets a `file://` link in the PDF property. Obsidian can't embed files outside the vault, so there's no embed.

**What is downloaded:**
- Only free, legal copies: the arXiv PDF, or an open-access PDF that OpenAlex knows about.
- A file is only saved if it really is a PDF; it must start with `%PDF-`. Paywall, login and error pages are rejected.
- Existing files are never overwritten. A second copy is saved as `name (2).pdf`.

## Example setup

A physics-oriented setup with custom property names, PDFs outside a Dropbox-synced vault, and one-click citations:

| Setting | Value |
|---|---|
| Folder | `2 - Source Material/Academic Papers` |
| File name | `{{author}} {{year}} - {{title}}` |
| Template text | the contents of [`examples/academic-paper-template.md`](examples/academic-paper-template.md) |
| Property names | `Title`, `Authors`, `Year of Publication`, `DOI`, `arXiv`, `URL/Source/DOI` |
| Cite from folder | `2 - Source Material` |
| Download PDF | Ask each time |
| Save PDFs outside the vault | on |
| PDF folder | `~/Papers` |
| Link opened for reading | arXiv HTML → ar5iv → DOI |

## Data sources

| Source | Used for | Default |
|---|---|---|
| [OpenAlex](https://openalex.org) | Broad search across all fields (about 250 million works); open-access PDF links | on |
| [arXiv](https://arxiv.org) | Preprints, including the latest versions. Requests are limited to one every three seconds, as arXiv asks. | on |
| [INSPIRE-HEP](https://inspirehep.net) | High-energy physics, gravitation and cosmology, with curated journal references | on |
| [Crossref](https://www.crossref.org) | Publisher metadata and DOI lookup | on |
| [Semantic Scholar](https://www.semanticscholar.org) | Extra coverage for vague queries. Strictly rate-limited without an API key. | off |

**How results are ranked:** results are combined with reciprocal-rank fusion. A paper that several sources rank highly comes first.

**How duplicates are merged:** results are merged by DOI or arXiv id. Without either, they're merged by title, if the title is long enough and the years agree.

**Where merged details come from:** each field comes from the source that is best at it, so a paper gets the same file name however you found it:
- titles from Crossref;
- the original journal DOI from INSPIRE;
- journal names from Crossref or INSPIRE.

All five services are free and need no account. Thank you to arXiv for use of its open access interoperability.

## Network use, files and privacy

As required by Obsidian's [developer policies](https://docs.obsidian.md/Developer+policies), here is what the plugin accesses.

**Network use.** Paper Finder only connects to the internet when you search, create a note, open a link or download a PDF. It contacts:

- the sources you have enabled: `api.openalex.org`, `export.arxiv.org`, `inspirehep.net`, `api.crossref.org`, `api.semanticscholar.org`. Your search text is sent to them to find papers.
- `arxiv.org` and `ar5iv.labs.arxiv.org`, to check whether an HTML version exists and to download arXiv PDFs.
- a publisher's page, only when you paste its URL, to read the DOI from it.
- the host of an open-access PDF, only when downloading that PDF.

Requests go through Obsidian's `requestUrl`. Nothing identifying is sent unless you add a contact e-mail or API key yourself.

**Files outside the vault.** These are written only if you turn on **Save PDFs outside the vault**, and only PDF files inside the folder you chose. The plugin checks that every path stays inside the folder, and never overwrites existing files.

**No telemetry, no ads, no account, no payment.** The plugin collects no usage data.

### Security

- **No runtime dependencies.** `main.js` is built only from this repository's source code.
- **Three exact-pinned build tools** (Obsidian's type definitions, TypeScript and esbuild), installed with install scripts disabled. Package signatures are verified in CI.
- **Text from APIs and web pages is never treated as HTML.** It's converted to plain text, and the plugin never uses `innerHTML`.
- **Only `http(s)` links** are stored or opened.

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## Troubleshooting

| Problem | What to do |
|---|---|
| "Crossref failed (HTTP 429)" or another source failed | That database is rate-limiting you. The other sources still return results. Wait a moment, or add a contact e-mail under *Optional API access*. |
| Semantic Scholar always fails | It needs an API key for reliable use; [request one](https://www.semanticscholar.org/product/api) or leave it off. |
| The right paper isn't in the results | Add an author's surname or the year, paste the DOI or arXiv id, or enable more sources. Lecture notes and talks often aren't indexed as papers. |
| Links open in the browser instead of a split | Enable the core **Web viewer** plugin under *Settings → Core plugins*. |
| "No PDF saved: not a PDF" | The paper has no free PDF that the plugin knows of. Publisher pages behind a paywall are rejected on purpose. |
| A paper isn't recognised as already in the vault | Check that *Property names* match the keys in your notes, and that the note has a DOI, arXiv id or link. |

## Contributing and development

Pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the setup, code layout and rules. In short:

```bash
npm ci            # installs exactly the lockfile; install scripts are disabled
npm run dev       # watch mode
npm run build     # type-check + production build
npm run test:live # search core against the real APIs
npm run test:note # template, YAML and file-name checks (offline)
npm run test:pdf  # PDF and file-safety checks
```

## License

[MIT](LICENSE) © Apratim Rastogi
