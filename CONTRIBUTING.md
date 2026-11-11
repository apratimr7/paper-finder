# Contributing to Paper Finder

Thanks for helping! Bug reports, ideas and pull requests are all welcome.

## Reporting bugs and ideas

Open an issue using one of the templates. For search problems, include the exact text, DOI or URL you typed. It makes the problem reproducible.

**Security issues:** please don't open a public issue. Use [private vulnerability reporting](https://github.com/apratimr7/paper-finder/security/advisories/new) instead.

## Development setup

You need Node.js 20 or newer.

```bash
git clone https://github.com/<you>/paper-finder.git
cd paper-finder
npm ci          # installs exactly the lockfile; install scripts are disabled by .npmrc
npm run dev     # rebuilds main.js on every change
```

To try your build, symlink or copy `main.js`, `manifest.json` and `styles.css` into `<a test vault>/.obsidian/plugins/paper-finder/`, then reload the plugin. Please use a test vault, not your main one.

Tests that don't need Obsidian:

```bash
npm run test:live   # search core against the real APIs (needs network)
npm run test:note   # template rendering, YAML escaping, file names (offline)
npm run test:pdf    # PDF checks, path safety and saving outside the vault
```

Obsidian's review runs [`eslint-plugin-obsidianmd`](https://github.com/obsidianmd/eslint-plugin) on submitted plugins. Maintainers run it before each release, so you don't need to install it. If you'd like to, install it outside this repository (it isn't a project dependency, to keep the dependency tree small) and use its recommended config.

## Code layout

| Path | What it does |
|---|---|
| `src/core.ts` | Re-exports the Obsidian-free core (used by the Node tests) |
| `src/detect.ts` | Works out whether the input is a DOI, arXiv id, URL or free text |
| `src/sources/*.ts` | One adapter per database, each returning the common `Paper` shape |
| `src/search.ts` | Runs the sources, merges duplicates, ranks results |
| `src/note.ts` | Placeholders, file names, YAML-safe template rendering |
| `src/links.ts` | Link types and precedence |
| `src/pdf.ts` | PDF download and saving (in or outside the vault) |
| `src/main.ts` | Plugin entry: commands, note creation, web viewer |
| `src/modal.ts` | The search box |
| `src/settings.ts` | Settings and the settings tab |

Adding a database means adding a file in `src/sources/` that implements `Source` from `src/types.ts`, then registering it in `ALL_SOURCES` in `src/search.ts` and in the settings.

## Rules for pull requests

- **No runtime dependencies.** The plugin ships as a single `main.js` built only from this repository.
- **New dev dependencies need a good reason.** Pin an exact version (`save-exact` is on) that has been published for at least two weeks, and commit the updated `package-lock.json`.
- **Never put text from an API or web page into HTML.** Use `setText` / `createEl({ text })`, not `innerHTML`. Clean text with `plainText()` from `src/util.ts`.
- **Anything written into frontmatter goes through `renderNote`**, which YAML-escapes values.
- Follow Obsidian's [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines): sentence case in the UI, no default hotkeys, no `console.log` left in.
- Respect the APIs' rate limits. arXiv allows one request every three seconds.
- Update `README.md` when you change behaviour or settings.
- Keep pull requests focused. Small ones get reviewed faster.

CI runs `npm ci`, `npm audit signatures`, `npm run build` and `npm run test:note` on every pull request. All pull requests need a maintainer's review before they're merged.

## Releasing (maintainers)

```bash
npm version 0.2.0         # updates package.json, manifest.json, versions.json and creates the tag
git push --follow-tags    # the Release workflow builds, attests and publishes main.js, manifest.json, styles.css
```

By contributing, you agree that your contributions are licensed under the MIT License.
