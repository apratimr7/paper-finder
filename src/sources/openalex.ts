import type { Paper, Source, SourceContext } from "../types";
import { getJson, normalizeArxiv, normalizeDoi, plainText, yearOf } from "../util";

const BASE = "https://api.openalex.org";
const SELECT = "id,doi,display_name,publication_year,authorships,primary_location,best_oa_location,locations,abstract_inverted_index";

function params(ctx: SourceContext): string {
  let p = `&select=${SELECT}`;
  if (ctx.mailto) p += `&mailto=${encodeURIComponent(ctx.mailto)}`;
  if (ctx.openalexKey) p += `&api_key=${encodeURIComponent(ctx.openalexKey)}`;
  return p;
}

/** OpenAlex ships abstracts as an inverted index {word: [positions]}. */
function invertAbstract(idx: Record<string, number[]> | null | undefined): string {
  if (!idx) return "";
  const words: string[] = [];
  for (const [w, positions] of Object.entries(idx)) for (const p of positions) words[p] = w;
  return plainText(words.join(" "));
}

export function fromOpenAlex(w: any): Paper | null {
  if (!w || !w.display_name) return null;
  const locations: any[] = Array.isArray(w.locations) ? w.locations : [];
  let arxiv: string | undefined;
  for (const l of locations) {
    const u: string = l?.landing_page_url || l?.pdf_url || "";
    if (/arxiv\.org\//i.test(u)) {
      arxiv = normalizeArxiv(u);
      if (arxiv) break;
    }
  }
  const doi = normalizeDoi(w.doi);
  // OpenAlex sometimes uses the arXiv DataCite DOI as "the" DOI.
  if (!arxiv && doi?.startsWith("10.48550/arxiv.")) arxiv = normalizeArxiv(doi.slice("10.48550/arxiv.".length));
  const venue = plainText(w.primary_location?.source?.display_name);
  return {
    title: plainText(w.display_name),
    authors: (w.authorships ?? []).map((a: any) => plainText(a?.author?.display_name)).filter(Boolean),
    year: yearOf(w.publication_year),
    venue: venue || undefined,
    abstract: invertAbstract(w.abstract_inverted_index) || undefined,
    doi: doi && !doi.startsWith("10.48550/arxiv.") ? doi : undefined,
    arxiv,
    publisherUrl: w.primary_location?.landing_page_url || undefined,
    oaPdfUrl: w.best_oa_location?.pdf_url || undefined,
    openalexUrl: typeof w.id === "string" ? w.id : undefined,
    sources: ["openalex"],
  };
}

export const openalex: Source & { byWork(id: string, ctx: SourceContext): Promise<Paper | null> } = {
  id: "openalex",
  async search(query, ctx) {
    const url = `${BASE}/works?search=${encodeURIComponent(query)}&per-page=${ctx.limit}${params(ctx)}`;
    const data = await getJson(ctx.http, url);
    return (data?.results ?? []).map(fromOpenAlex).filter((p: Paper | null): p is Paper => !!p);
  },
  async byDoi(doi, ctx) {
    const data = await getJson(ctx.http, `${BASE}/works/doi:${encodeURIComponent(doi)}?${params(ctx).slice(1)}`);
    return fromOpenAlex(data);
  },
  async byArxiv(id, ctx) {
    return this.byDoi!(`10.48550/arxiv.${id}`, ctx);
  },
  async byWork(id, ctx) {
    const data = await getJson(ctx.http, `${BASE}/works/${encodeURIComponent(id)}?${params(ctx).slice(1)}`);
    return fromOpenAlex(data);
  },
};
