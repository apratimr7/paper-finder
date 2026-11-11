import type { Paper, Source, SourceContext } from "../types";
import { arr, get, getJson, normalizeArxiv, normalizeDoi, plainText, str, yearOf, type Json } from "../util";

const BASE = "https://api.semanticscholar.org/graph/v1";
const FIELDS = "title,authors,year,venue,abstract,externalIds,url";

function headers(ctx: SourceContext): Record<string, string> {
  return ctx.s2Key ? { "x-api-key": ctx.s2Key } : {};
}

export function fromS2(p: Json): Paper | null {
  const title = plainText(str(get(p, "title")));
  if (!title) return null;
  return {
    title,
    authors: arr(get(p, "authors"))
      .map((a) => plainText(str(get(a, "name"))))
      .filter(Boolean),
    year: yearOf(str(get(p, "year"))),
    venue: plainText(str(get(p, "venue"))) || undefined,
    abstract: plainText(str(get(p, "abstract"))) || undefined,
    doi: normalizeDoi(str(get(p, "externalIds", "DOI"))),
    arxiv: normalizeArxiv(str(get(p, "externalIds", "ArXiv"))),
    s2Url: str(get(p, "url")) || undefined,
    sources: ["semanticscholar"],
  };
}

const isPaper = (p: Paper | null): p is Paper => p !== null;

async function byId(id: string, ctx: SourceContext): Promise<Paper | null> {
  const data = await getJson(ctx.http, `${BASE}/paper/${encodeURIComponent(id)}?fields=${FIELDS}`, headers(ctx));
  return fromS2(data);
}

export const semanticscholar: Source & { byId: (id: string, ctx: SourceContext) => Promise<Paper | null> } = {
  id: "semanticscholar",
  search: async (query, ctx) => {
    const url = `${BASE}/paper/search?query=${encodeURIComponent(query)}&limit=${ctx.limit}&fields=${FIELDS}`;
    const data = await getJson(ctx.http, url, headers(ctx));
    return arr(get(data, "data")).map(fromS2).filter(isPaper);
  },
  byDoi: (doi, ctx) => byId(`DOI:${doi}`, ctx),
  byArxiv: (id, ctx) => byId(`ARXIV:${id}`, ctx),
  byId,
};
