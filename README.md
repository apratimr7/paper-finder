# Paper Finder

An [Obsidian](https://obsidian.md) plugin that finds research papers from whatever scraps of information you have and saves each one as a metadata-only source note.

You can type fuzzy text (`schuller constructive gravity 2020`), a DOI, an arXiv id (`1608.04948`, `hep-th/9711200`) or a URL (arXiv, doi.org, INSPIRE, OpenAlex, Semantic Scholar, or a journal page). Paper Finder searches several free databases at once, merges duplicates, and shows title, authors, year, venue and part of the abstract. Pick a result and it:

1. creates a source note from your template (or opens the existing note if the paper is already in your vault);
2. opens the paper in Obsidian's web viewer in a split, preferring the arXiv HTML version, which renders the math.

No account, no Zotero, and no leaving Obsidian.

> Status: early development (0.1.0). Not yet in the community plugin directory.

## Sources

| Source | Used for | Default |
|---|---|---|
| [OpenAlex](https://openalex.org) | Broad fuzzy search across all fields | on |
| [arXiv](https://info.arxiv.org/help/api/) | Preprints (throttled to 1 request / 3 s, as arXiv asks) | on |
| [INSPIRE-HEP](https://inspirehep.net) | High-energy physics, gravitation, cosmology | on |
| [Crossref](https://www.crossref.org) | Publisher metadata, DOI lookup | on |
| [Semantic Scholar](https://www.semanticscholar.org) | Extra coverage for vague queries (rate-limited) | off |

Identifiers are looked up directly. Free text is sent to every enabled source, and the results are ranked by reciprocal-rank fusion, so a paper that several sources rank highly comes first. A year in the query boosts papers from that year.

## Commands

- **Find paper**: open the search box. There's also a ribbon icon. No hotkey is set by default; assign one in *Settings → Hotkeys*.
- **Find paper from selected text**: search for the current selection.
- **Open paper link of current note**: open the current source note's paper, following your link order.
- **Download PDF for current note**: fetch the arXiv or open-access PDF of the paper in the current note.
- **Cite paper**: pick a source note and insert a citation, by default `[[Note|Author Year]]`.

## Settings

Everything that is specific to one vault can be configured.

- **Folder**: where notes go. It can contain placeholders, e.g. `Papers/{{year}}`.
- **File name**: default `{{author}} {{year}} - {{title}}`.
- **Note template**: a path to a note in your vault, or **Template text** written directly in the settings. If both are empty, the built-in metadata-only template is used.
- **Link saved in the note** and **Link opened for reading**: two separate, reorderable precedence lists. Link types: arXiv HTML, ar5iv, arXiv abstract, arXiv PDF, DOI, publisher page, open-access PDF, INSPIRE, OpenAlex, Semantic Scholar. arXiv HTML and ar5iv are checked to exist before they're used.
- **Open links in**: web viewer in a split, web viewer in a new tab, or the system browser. On mobile and without the core Web viewer plugin, the system browser is always used.
- **Cite from folder**: which notes the Cite command offers (default: the folder for new notes; `/` for the whole vault).
- **Property names**: the frontmatter keys your template uses for title, authors, year, DOI, arXiv id and link. They're used to detect papers already in the vault, to cite, and to open links.
- **PDFs**: download *never* (default), *ask each time* or *always* when a note is created.
  - **PDF folder**: empty means next to the note. A vault path (placeholders allowed) keeps the PDF in the vault, where it can be embedded with `![[file.pdf]]`. The embed goes before a "References" heading, or at the end. An absolute path (`~/Papers`, `/data/papers`, `C:\Papers`) saves outside the vault (desktop only); the note then gets a `file://` link and no embed.
  - Also configurable: the PDF file name, the source order (arXiv PDF, open-access PDF), the frontmatter property that receives the link, and the maximum size.
  - Only arXiv and open-access PDFs are fetched. Responses that aren't real PDFs (paywall or error pages) are rejected by checking the `%PDF-` header. Existing files are never overwritten.
- **Optional API access**: a contact e-mail for OpenAlex and Crossref's "polite pool", and API keys for OpenAlex and Semantic Scholar. All of these are empty by default, and nothing identifying is sent unless you add it.

### Placeholders

| Placeholder | Value |
|---|---|
| `{{title}}` | Paper title |
| `{{author}}` | First author's family name (keeps particles: `'t Hooft`, `van der Waals`) |
| `{{authorsShort}}` | `Smith`, `Smith and Doe`, or `Smith et al.` |
| `{{firstAuthor}}` | First author's full name |
| `{{authors}}` | All authors. On a YAML list line by itself it becomes one item per author; elsewhere it's `A; B; C` |
| `{{year}}` `{{venue}}` `{{doi}}` `{{arxiv}}` | Metadata |
| `{{url}}` | The link chosen by *Link saved in the note* |
| `{{citekey}}` | First author's family name + year, e.g. `Maldacena1999` |
| `{{abstract}}` | Abstract (plain text) |
| `{{date}}` `{{time}}` | Creation date `YYYY-MM-DD` and time `HH:mm` |
| `{{link}}` | Citation format only: link text to the source note |

Template example: see [`examples/academic-paper-template.md`](examples/academic-paper-template.md).

Frontmatter values are YAML-escaped automatically, quoted or not, so titles with `:`, `#`, quotes or line breaks can't break your properties. The rendered frontmatter is parsed before the note is written, and the note isn't created if parsing fails.

## Security and privacy

- **No runtime dependencies.** The shipped `main.js` is built only from this repository's source and Obsidian's API.
- **Three pinned dev dependencies** (`obsidian` type definitions, `typescript`, `esbuild`), installed with `ignore-scripts=true` (see `.npmrc`), with exact versions and a committed lockfile. Use `npm ci`.
- **Untrusted text is never treated as HTML.** API responses (titles, abstracts, which can contain markup) are converted to plain text and displayed with Obsidian's `setText`/`createEl`, never `innerHTML`. Publisher pages fetched to find a DOI are only scanned with regular expressions for `citation_doi` meta tags.
- **Only `https:`/`http:` links** are stored or opened.
- **Files outside the vault** are written only when you set an absolute PDF folder. Each path is checked to stay inside that folder, and existing files are never overwritten.
- **Network access** goes only to the sources you enable (plus `arxiv.org`/`ar5iv` to check HTML availability, and a publisher page when you paste its URL), through Obsidian's `requestUrl`.
- API keys, if you add any, are stored in the plugin's `data.json` inside your vault.

Please report security issues privately; see [SECURITY.md](SECURITY.md).

## Development

```bash
npm ci            # installs exactly the lockfile, no install scripts
npm run build     # type-check + production bundle → main.js
npm run dev       # watch mode
npm run test:live # exercises the search core against the real APIs from Node
```

To try it in a vault, copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/paper-finder/` and enable it in *Settings → Community plugins*.

The search core (`src/core.ts` and everything it imports) has no Obsidian dependency and takes an injected HTTP function, so it can be tested from Node.

## License

MIT
