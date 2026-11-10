import { identifiersFromHtml, parseInput } from "./detect";
import { arxiv } from "./sources/arxiv";
import { crossref } from "./sources/crossref";
import { inspire } from "./sources/inspire";
import { openalex } from "./sources/openalex";
import { semanticscholar } from "./sources/semanticscholar";
import type { Paper, Source, SourceContext, SourceId } from "./types";
import { getText } from "./util";

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

/** Fill the gaps in `into` from `from`. The first source to report a field wins, except where noted. */
function mergeInto(into: Paper, from: Paper): void {
  into.doi ??= from.doi;
  into.arxiv ??= from.arxiv;
  into.year ??= from.year;
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
        merged.push({ ...p, authors: [...p.authors], sources: [...p.sources], score: rrf });
      }
    });
  }
  if (queryYear) for (const m of merged) if (m.year === queryYear) m.score = (m.score ?? 0) + 0.15;
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
  const runs = enabled
    .map((sid) => ALL_SOURCES[sid])
    .filter((s) => (kind === "doi" ? s.byDoi : s.byArxiv))
    .map((s) => settle(s.id, (kind === "doi" ? s.byDoi! : s.byArxiv!).call(s, id, ctx)));
  const done = await Promise.all(runs);
  const lists = done.map((d) => (d.value ? [d.value] : []));
  return {
    mode: "lookup",
    papers: mergeResults(lists),
    status: done.map((d) => ({ source: d.source, count: d.value ? 1 : 0, error: d.error })),
  };
}

/** Entry point: detect the input type, then either look up an identifier or fuzzy-search. */
export async function findPapers(input: string, enabled: SourceId[], ctx: SourceContext): Promise<SearchResult> {
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
