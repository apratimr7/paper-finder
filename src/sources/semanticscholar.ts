import type { Paper, Source, SourceContext } from "../types";
import { getJson, normalizeArxiv, normalizeDoi, plainText, yearOf } from "../util";

const BASE = "https://api.semanticscholar.org/graph/v1";
const FIELDS = "title,authors,year,venue,abstract,externalIds,url";

function headers(ctx: SourceContext): Record<string, string> {
  return ctx.s2Key ? { "x-api-key": ctx.s2Key } : {};
}

export function fromS2(p: any): Paper | null {
  const title = plainText(p?.title);
  if (!title) return null;
  return {
    title,
    authors: (p.authors ?? []).map((a: any) => plainText(a?.name)).filter(Boolean),
    year: yearOf(p.year),
    venue: plainText(p.venue) || undefined,
    abstract: plainText(p.abstract) || undefined,
    doi: normalizeDoi(p.externalIds?.DOI),
    arxiv: normalizeArxiv(p.externalIds?.ArXiv),
    s2Url: p.url || undefined,
    sources: ["semanticscholar"],
  };
}

export const semanticscholar: Source & { byId(id: string, ctx: SourceContext): Promise<Paper | null> } = {
  id: "semanticscholar",
  async search(query, ctx) {
    const url = `${BASE}/paper/search?query=${encodeURIComponent(query)}&limit=${ctx.limit}&fields=${FIELDS}`;
    const data = await getJson(ctx.http, url, headers(ctx));
    return (data?.data ?? []).map(fromS2).filter((p: Paper | null): p is Paper => !!p);
  },
  byDoi(doi, ctx) {
    return this.byId(`DOI:${doi}`, ctx);
  },
  byArxiv(id, ctx) {
    return this.byId(`ARXIV:${id}`, ctx);
  },
  async byId(id, ctx) {
    const data = await getJson(ctx.http, `${BASE}/paper/${encodeURIComponent(id)}?fields=${FIELDS}`, headers(ctx));
    return fromS2(data);
  },
};
