import type { Paper, Source, SourceContext } from "../types";
import { arr, get, getJson, normalizeArxiv, normalizeDoi, obj, plainText, str, yearOf, type Json } from "../util";

const BASE = "https://api.openalex.org";
const SELECT = "id,doi,display_name,publication_year,authorships,primary_location,best_oa_location,locations,abstract_inverted_index";

function params(ctx: SourceContext): string {
  let p = `&select=${SELECT}`;
  if (ctx.mailto) p += `&mailto=${encodeURIComponent(ctx.mailto)}`;
  if (ctx.openalexKey) p += `&api_key=${encodeURIComponent(ctx.openalexKey)}`;
  return p;
}

/** OpenAlex ships abstracts as an inverted index {word: [positions]}. */
function invertAbstract(idx: Json): string {
  const index = obj(idx);
  if (!index) return "";
  const words: string[] = [];
  for (const [w, positions] of Object.entries(index)) {
    for (const p of arr(positions)) if (typeof p === "number" && p >= 0 && p < 100_000) words[p] = w;
  }
  return plainText(words.join(" "));
}

export function fromOpenAlex(w: Json): Paper | null {
  const title = plainText(str(get(w, "display_name")));
  if (!title) return null;
  let arxiv: string | undefined;
  for (const l of arr(get(w, "locations"))) {
    const u = str(get(l, "landing_page_url")) ?? str(get(l, "pdf_url")) ?? "";
    if (/arxiv\.org\//i.test(u)) {
      arxiv = normalizeArxiv(u);
      if (arxiv) break;
    }
  }
  const doi = normalizeDoi(str(get(w, "doi")));
  // OpenAlex sometimes uses the arXiv DataCite DOI as "the" DOI.
  if (!arxiv && doi?.startsWith("10.48550/arxiv.")) arxiv = normalizeArxiv(doi.slice("10.48550/arxiv.".length));
  const venue = plainText(str(get(w, "primary_location", "source", "display_name")));
  return {
    title,
    authors: arr(get(w, "authorships"))
      .map((a) => plainText(str(get(a, "author", "display_name"))))
      .filter(Boolean),
    year: yearOf(str(get(w, "publication_year"))),
    venue: venue || undefined,
    abstract: invertAbstract(get(w, "abstract_inverted_index")) || undefined,
    doi: doi && !doi.startsWith("10.48550/arxiv.") ? doi : undefined,
    arxiv,
    publisherUrl: str(get(w, "primary_location", "landing_page_url")) || undefined,
    oaPdfUrl: str(get(w, "best_oa_location", "pdf_url")) || undefined,
    openalexUrl: str(get(w, "id")) || undefined,
    sources: ["openalex"],
  };
}

const isPaper = (p: Paper | null): p is Paper => p !== null;

async function byPath(path: string, ctx: SourceContext): Promise<Paper | null> {
  const data = await getJson(ctx.http, `${BASE}/works/${path}?${params(ctx).slice(1)}`);
  return fromOpenAlex(data);
}

export const openalex: Source & { byWork: (id: string, ctx: SourceContext) => Promise<Paper | null> } = {
  id: "openalex",
  search: async (query, ctx) => {
    const url = `${BASE}/works?search=${encodeURIComponent(query)}&per-page=${ctx.limit}${params(ctx)}`;
    const data = await getJson(ctx.http, url);
    return arr(get(data, "results")).map(fromOpenAlex).filter(isPaper);
  },
  byDoi: (doi, ctx) => byPath(`doi:${encodeURIComponent(doi)}`, ctx),
  byArxiv: (id, ctx) => byPath(`doi:${encodeURIComponent(`10.48550/arxiv.${id}`)}`, ctx),
  byWork: (id, ctx) => byPath(encodeURIComponent(id), ctx),
};
