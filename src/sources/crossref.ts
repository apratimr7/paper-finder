import type { Paper, Source, SourceContext } from "../types";
import { getJson, normalizeDoi, plainText, yearOf } from "../util";

const BASE = "https://api.crossref.org";
const SELECT = "DOI,title,author,issued,container-title,abstract,URL,type";

function mailto(ctx: SourceContext): string {
  return ctx.mailto ? `&mailto=${encodeURIComponent(ctx.mailto)}` : "";
}

export function fromCrossref(w: any): Paper | null {
  const title = plainText(Array.isArray(w?.title) ? w.title[0] : w?.title);
  if (!title) return null;
  const authors = (w.author ?? [])
    .map((a: any) => plainText(a.given ? `${a.given} ${a.family ?? ""}` : a.family ?? a.name ?? ""))
    .filter(Boolean);
  const doi = normalizeDoi(w.DOI);
  return {
    title,
    authors,
    year: yearOf(w.issued?.["date-parts"]?.[0]?.[0]),
    venue: plainText(w["container-title"]?.[0]) || undefined,
    abstract: plainText(w.abstract) || undefined,
    doi,
    publisherUrl: doi ? `https://doi.org/${doi}` : w.URL,
    sources: ["crossref"],
  };
}

export const crossref: Source = {
  id: "crossref",
  async search(query, ctx) {
    const url = `${BASE}/works?query.bibliographic=${encodeURIComponent(query)}&rows=${ctx.limit}&select=${SELECT}${mailto(ctx)}`;
    const data = await getJson(ctx.http, url);
    return (data?.message?.items ?? []).map(fromCrossref).filter((p: Paper | null): p is Paper => !!p);
  },
  async byDoi(doi, ctx) {
    const data = await getJson(ctx.http, `${BASE}/works/${encodeURIComponent(doi)}${mailto(ctx).replace("&", "?")}`);
    return data ? fromCrossref(data.message) : null;
  },
};
