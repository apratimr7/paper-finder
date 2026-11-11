import { identifiersFromHtml, parseInput } from "./detect";
import { arxiv } from "./sources/arxiv";
import { crossref } from "./sources/crossref";
import { inspire } from "./sources/inspire";
import { openalex } from "./sources/openalex";
import { semanticscholar } from "./sources/semanticscholar";
import type { Paper, Source, SourceContext, SourceId } from "./types";
import { fixCaps, getText } from "./util";

export const ALL_SOURCES: Record<SourceId, Source> = { openalex, arxiv, inspire, crossref, semanticscholar };

export interface SourceStatus {
  source: SourceId;
  count: number;
  error?: string;
}

export interface SearchResult {
  papers: Paper[];
  status: SourceStatus[];
  mode: "lookup" | "search";
}

const normTitle = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");

function sameWork(a: Paper, b: Paper): boolean {
  if (a.doi && b.doi && a.doi === b.doi) return true;
  if (a.arxiv && b.arxiv && a.arxiv === b.arxiv) return true;
  // Title match alone is accepted only when years agree (or one is missing), and titles are long
  // enough not to collide ("Introduction", "Lectures on gravity").
  const ta = normTitle(a.title);
  if (ta.length < 25 || ta !== normTitle(b.title)) return false;
  if (a.year && b.year && Math.abs(+a.year - +b.year) > 1) return false;
  return true;
}

// Journal names are cleanest from Crossref, then INSPIRE; OpenAlex sometimes duplicates them.
const VENUE_PRIORITY: SourceId[] = ["crossref", "inspire", "semanticscholar", "openalex", "arxiv"];
function venueRank(p: Paper): number {
  if (!p.venue || p.venue === "arXiv" || /cornell university/i.test(p.venue)) return 99;
  return VENUE_PRIORITY.indexOf(p.sources[0]);
}

// For each field, which source is trusted most. This makes the merged record (and so the file name,
// citekey and link) the same however the paper was found.
const FIELD_PRIORITY: Record<"title" | "doi" | "year", SourceId[]> = {
  // Published titles; arXiv/INSPIRE titles often carry raw LaTeX ("Large $N$").
  title: ["crossref", "openalex", "semanticscholar", "arxiv", "inspire"],
  // INSPIRE curates the DOI of the original journal article; OpenAlex sometimes picks a reprint.
  doi: ["inspire", "crossref", "arxiv", "semanticscholar", "openalex"],
  year: ["crossref", "inspire", "openalex", "semanticscholar", "arxiv"],
};

function take(into: Paper, from: Paper, field: "title" | "doi" | "year"): void {
  const src = from.fieldSrc?.[field] ?? from.sources[0];
  const value = from[field];
  if (!value) return;
  const cur = into.fieldSrc?.[field];
  const pr = FIELD_PRIORITY[field];
  if (!into[field] || cur === undefined || pr.indexOf(src) < pr.indexOf(cur)) {
    into[field] = value;
    (into.fieldSrc ??= {})[field] = src;
  }
}

const minYear = (a?: string, b?: string) => (a && b ? (a < b ? a : b) : a ?? b);

/** Fill the gaps in `into` from `from`, using FIELD_PRIORITY where sources disagree. */
function noteDoi(into: Paper, from: Paper): void {
  const src = from.sources[0];
  // INSPIRE lists all DOIs and journal references of a record without pairing them, so its
  // year/venue may belong to a different publication than its first DOI.
  if (!from.doi || src === "inspire") return;
  const rec = ((into.byDoi ??= {})[from.doi] ??= {});
  if (rec.crossref) return;
  const venue = from.venue && from.venue !== "arXiv" ? from.venue : undefined;
  if (src === "crossref") {
    // Crossref is the DOI registry itself: its record for a DOI is authoritative.
    rec.year = from.year ?? rec.year;
    rec.venue = venue ?? rec.venue;
    rec.title = from.title;
    rec.crossref = true;
  } else {
    rec.year ??= from.year;
    rec.venue ??= venue;
  }
}

/**
 * Make sure year, venue and title come from Crossref's record of the paper's own DOI.
 * Called once when a result is picked, so the note is the same however the paper was found.
 */
export async function confirmByDoi(p: Paper, enabled: SourceId[], ctx: SourceContext): Promise<Paper> {
  if (!p.doi || !enabled.includes("crossref") || p.byDoi?.[p.doi]?.crossref) return p;
  const c = await crossref.byDoi!(p.doi, ctx).catch(() => null);
  if (!c || c.doi !== p.doi) return p;
  return { ...p, title: c.title || p.title, year: c.year ?? p.year, venue: c.venue ?? p.venue };
}

function mergeInto(into: Paper, from: Paper): void {
  noteDoi(into, from);
  take(into, from, "title");
  take(into, from, "doi");
  take(into, from, "year");
  into.firstYear = minYear(minYear(into.firstYear, from.firstYear), minYear(into.year, from.year));
  into.arxiv ??= from.arxiv;
  if (from.venue && venueRank(from) < venueRank(into)) into.venue = from.venue;
  if (!into.abstract || (from.abstract && from.abstract.length > into.abstract.length * 1.5)) into.abstract = from.abstract ?? into.abstract;
  if (from.authors.length > into.authors.length) into.authors = from.authors;
  into.publisherUrl ??= from.publisherUrl;
  into.oaPdfUrl ??= from.oaPdfUrl;
  into.inspireUrl ??= from.inspireUrl;
  into.openalexUrl ??= from.openalexUrl;
  into.s2Url ??= from.s2Url;
  for (const s of from.sources) if (!into.sources.includes(s)) into.sources.push(s);
}

/**
 * Merge result lists from several sources and rank them with reciprocal-rank fusion:
 * a paper ranked high by several sources beats one ranked high by a single source.
 */
export function mergeResults(lists: Paper[][], queryYear?: string): Paper[] {
  const merged: Paper[] = [];
  for (const list of lists) {
    list.forEach((p, rank) => {
      const rrf = 1 / (rank + 3);
      const hit = merged.find((m) => sameWork(m, p));
      if (hit) {
        mergeInto(hit, p);
        hit.score = (hit.score ?? 0) + rrf;
      } else {
        const src = p.sources[0];
        merged.push({
          ...p,
          authors: [...p.authors],
          sources: [...p.sources],
          score: rrf,
          firstYear: minYear(p.firstYear, p.year),
          fieldSrc: { title: src, doi: p.doi ? src : undefined, year: p.year ? src : undefined },
        });
        noteDoi(merged[merged.length - 1], p);
      }
    });
  }
  for (const m of merged) {
    m.authors = m.authors.map(fixCaps);
    // Year and venue must describe the same publication as the chosen DOI (e.g. not a reprint's).
    const rec = m.doi ? m.byDoi?.[m.doi] : undefined;
    if (rec?.year) m.year = rec.year;
    if (rec?.venue) m.venue = rec.venue;
    if (rec?.title) m.title = rec.title;
  }
  if (queryYear) for (const m of merged) if (m.year === queryYear || m.firstYear === queryYear) m.score = (m.score ?? 0) + 0.15;
  return merged.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

async function settle<T>(source: SourceId, p: Promise<T>): Promise<{ source: SourceId; value?: T; error?: string }> {
  try {
    return { source, value: await p };
  } catch (e) {
    return { source, error: e instanceof Error ? e.message : String(e) };
  }
}

async function lookupBy(
  kind: "doi" | "arxiv",
  id: string,
  enabled: SourceId[],
  ctx: SourceContext,
): Promise<SearchResult> {
  const runs: Promise<{ source: SourceId; value?: Paper | null; error?: string }>[] = [];
  for (const sid of enabled) {
    const s = ALL_SOURCES[sid];
    const lookup = kind === "doi" ? s.byDoi : s.byArxiv;
    if (lookup) runs.push(settle(s.id, lookup(id, ctx)));
  }
  const done = await Promise.all(runs);
  const lists = done.map((d) => (d.value ? [d.value] : []));
  // Crossref has no arXiv lookup, but once the DOI is known its published title and year are
  // fetched too, so a paper gets the same metadata whether found by arXiv id or by DOI.
  const doiFound = kind === "arxiv" ? mergeResults(lists)[0]?.doi : undefined;
  if (doiFound && enabled.includes("crossref")) {
    const c = await settle("crossref", crossref.byDoi!(doiFound, ctx));
    if (c.value) lists.push([c.value]);
    done.push(c);
  }
  const papers = mergeResults(lists);
  // The identifier the user gave always wins over what a source reports.
  if (papers[0]) {
    if (kind === "doi") papers[0].doi = id;
    else papers[0].arxiv = id;
  }
  return {
    mode: "lookup",
    papers,
    status: done.map((d) => ({ source: d.source, count: d.value ? 1 : 0, error: d.error })),
  };
}

export type YearMode = "published" | "first";

/**
 * Entry point: detect the input type, then either look up an identifier or fuzzy-search.
 * `yearMode` picks which year ends up in `year`: the journal publication year, or the year the
 * work first appeared (usually its arXiv submission). Either falls back to the other.
 */
export async function findPapers(input: string, enabled: SourceId[], ctx: SourceContext, yearMode: YearMode = "published"): Promise<SearchResult> {
  const res = await dispatch(input, enabled, ctx);
  for (const p of res.papers) {
    p.year = yearMode === "first" ? p.firstYear ?? p.year : p.year ?? p.firstYear;
  }
  return res;
}

async function dispatch(input: string, enabled: SourceId[], ctx: SourceContext): Promise<SearchResult> {
  const parsed = parseInput(input);
  switch (parsed.kind) {
    case "doi":
      return lookupBy("doi", parsed.doi, enabled, ctx);
    case "arxiv":
      return lookupBy("arxiv", parsed.id, enabled, ctx);
    case "inspire": {
      const r = await settle("inspire", inspire.byRecid(parsed.recid, ctx));
      return single(r, ctx, enabled);
    }
    case "openalex": {
      const r = await settle("openalex", openalex.byWork(parsed.work, ctx));
      return single(r, ctx, enabled);
    }
    case "s2": {
      const r = await settle("semanticscholar", semanticscholar.byId(parsed.paperId, ctx));
      return single(r, ctx, enabled);
    }
    case "url": {
      // Unknown site: read its citation meta tags for a DOI / arXiv id.
      const html = await getText(ctx.http, parsed.url).catch(() => null);
      const ids = html ? identifiersFromHtml(html) : {};
      if (ids.doi) return lookupBy("doi", ids.doi, enabled, ctx);
      if (ids.arxiv) return lookupBy("arxiv", ids.arxiv, enabled, ctx);
      return { mode: "lookup", papers: [], status: [] };
    }
    case "text":
      return fuzzy(parsed.text, enabled, ctx);
  }
}

/** A record found by a source-specific id; enrich it through the DOI / arXiv lookups. */
async function single(
  r: { source: SourceId; value?: Paper | null; error?: string },
  ctx: SourceContext,
  enabled: SourceId[],
): Promise<SearchResult> {
  const status: SourceStatus[] = [{ source: r.source, count: r.value ? 1 : 0, error: r.error }];
  if (!r.value) return { mode: "lookup", papers: [], status };
  const others = enabled.filter((s) => s !== r.source);
  const extra = r.value.doi
    ? await lookupBy("doi", r.value.doi, others, ctx)
    : r.value.arxiv
      ? await lookupBy("arxiv", r.value.arxiv, others, ctx)
      : null;
  const papers = mergeResults([[r.value], ...(extra ? [extra.papers] : [])]);
  return { mode: "lookup", papers: papers.slice(0, 1), status: [...status, ...(extra?.status ?? [])] };
}

async function fuzzy(text: string, enabled: SourceId[], ctx: SourceContext): Promise<SearchResult> {
  const done = await Promise.all(enabled.map((sid) => settle(sid, ALL_SOURCES[sid].search(text, ctx))));
  const queryYear = text.match(/\b(1[89]\d\d|20\d\d)\b/)?.[1];
  // A year in the query helps ranking but hurts some sources' full-text search; OpenAlex and
  // Crossref cope, so it is passed through unchanged.
  const papers = mergeResults(
    done.map((d) => d.value ?? []),
    queryYear,
  );
  return {
    mode: "search",
    papers,
    status: done.map((d) => ({ source: d.source, count: d.value?.length ?? 0, error: d.error })),
  };
}
