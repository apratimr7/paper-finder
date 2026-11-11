// Live smoke test of the Obsidian-free core against the real APIs.
// Run with: npm run test:live
import * as core from "./dist/core.mjs";

const http = async (url, headers = {}) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "paper-finder-test/0.1", ...headers }, signal: ctl.signal, redirect: "follow" });
    return { status: res.status, text: await res.text() };
  } finally {
    clearTimeout(t);
  }
};

const ctx = { http, mailto: "", openalexKey: "", s2Key: process.env.S2_KEY ?? "", limit: 8 };
const enabled = (process.env.SOURCES ?? "openalex,arxiv,inspire,crossref").split(",");

const queries = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "schuller constructive gravity 2020",
      "Penedones TASI AdS/CFT",
      "1608.04948",
      "hep-th/9711200",
      "10.1103/PhysRevD.101.084046",
      "https://arxiv.org/abs/1711.03220v2",
      "https://journals.aps.org/prd/abstract/10.1103/PhysRevD.101.084046",
      "https://inspirehep.net/literature/451647",
      "maldacena large n limit superconformal",
      "geometric anatomy theoretical physics schuller lectures",
    ];

for (const q of queries) {
  console.log(`\n=== ${q}   [${JSON.stringify(core.parseInput(q))}]`);
  const t0 = Date.now();
  const r = await core.findPapers(q, enabled, ctx);
  console.log(`  ${r.mode} in ${Date.now() - t0} ms; ` + r.status.map((s) => `${s.source}:${s.error ? "ERR " + s.error : s.count}`).join(" "));
  for (const p of r.papers.slice(0, 4)) {
    console.log(`  - [${p.score?.toFixed(2)}] ${p.title}`);
    console.log(`      ${core.authorsShort(p.authors)} ${p.year ?? "?"} | ${p.venue ?? ""} | doi=${p.doi ?? "-"} arxiv=${p.arxiv ?? "-"} | ${p.sources.join("+")}`);
    if (p.abstract) console.log(`      ${core.truncate(p.abstract, 120)}`);
  }
  const top = r.papers[0];
  if (top) {
    const vars = core.templateVars(top, core.firstLink(["doi", "arxiv-abs", "publisher"], top));
    console.log(`  filename: ${core.renderFilename("{{author}} {{year}} - {{title}}", vars)}`);
    const open = await core.firstWorkingLink(["arxiv-html", "ar5iv", "doi", "publisher"], top, http);
    console.log(`  open in split: ${open}`);
  }
}

// Offline checks of the YAML escaping.
const evil = {
  title: 'A: "quoted" title\nwith newline #hash',
  authors: ['O\'Brien, "Jr"', "Gerard 't Hooft"],
  year: "1999",
  doi: "10.1/x",
  sources: [],
};
const vars = core.templateVars(evil, "https://doi.org/10.1/x");
const userTemplate = `---
Title: "{{title}}"
URL/Source/DOI: {{url}}
Authors:
  - "{{authors}}"
Year of Publication: '{{year}}'
CitationKey: {{citekey}}
Date & time: "{{date}} {{time}}"
Status: 🟡
---
---
# {{title}}
`;
console.log("\n=== template rendering\n" + core.renderNote(userTemplate, vars));
console.log(core.renderNote(core.DEFAULT_NOTE_TEMPLATE, vars));
console.log("filename:", core.renderFilename("{{author}} {{year}} - {{title}}", vars));
console.log("folder:", core.renderFolder("Papers/../{{year}}/", vars));

// The same paper found in different ways must end up with the same file name.
{
  const names = new Set();
  for (const q of ["maldacena large n limit superconformal", "hep-th/9711200", "https://inspirehep.net/literature/451647", "10.4310/atmp.1998.v2.n2.a1"]) {
    const r = await core.findPapers(q, enabled, ctx);
    const top = await core.confirmByDoi(r.papers[0], enabled, ctx);
    names.add(core.renderFilename("{{author}} {{year}} - {{title}}", core.templateVars(top, undefined)));
  }
  console.log(names.size === 1 ? "PASS" : "FAIL", "consistent file name:", [...names]);
}
