import type { Paper, Source, SourceContext } from "../types";
import { arr, fixCaps, get, getJson, normalizeDoi, plainText, str, yearOf, type Json } from "../util";

const BASE = "https://api.crossref.org";
const SELECT = "DOI,title,author,issued,container-title,abstract,URL,type";

function mailto(ctx: SourceContext): string {
  return ctx.mailto ? `&mailto=${encodeURIComponent(ctx.mailto)}` : "";
}

export function fromCrossref(w: Json): Paper | null {
  const rawTitle = get(w, "title");
  const title = plainText(Array.isArray(rawTitle) ? str(rawTitle[0]) : str(rawTitle));
  if (!title) return null;
  const authors = arr(get(w, "author"))
    .map((a) => {
      const given = str(get(a, "given"));
      const family = str(get(a, "family"));
      return fixCaps(plainText(given ? `${given} ${family ?? ""}` : family ?? str(get(a, "name")) ?? ""));
    })
    .filter(Boolean);
  const doi = normalizeDoi(str(get(w, "DOI")));
  return {
    title,
    authors,
    year: yearOf(str(get(w, "issued", "date-parts", 0, 0))),
    venue: plainText(str(get(w, "container-title", 0))) || undefined,
    abstract: plainText(str(get(w, "abstract"))) || undefined,
    doi,
    publisherUrl: doi ? `https://doi.org/${doi}` : str(get(w, "URL")),
    sources: ["crossref"],
  };
}

const isPaper = (p: Paper | null): p is Paper => p !== null;

export const crossref: Source = {
  id: "crossref",
  search: async (query, ctx) => {
    const url = `${BASE}/works?query.bibliographic=${encodeURIComponent(query)}&rows=${ctx.limit}&select=${SELECT}${mailto(ctx)}`;
    const data = await getJson(ctx.http, url);
    return arr(get(data, "message", "items")).map(fromCrossref).filter(isPaper);
  },
  byDoi: async (doi, ctx) => {
    const data = await getJson(ctx.http, `${BASE}/works/${encodeURIComponent(doi)}${mailto(ctx).replace("&", "?")}`);
    return data ? fromCrossref(get(data, "message")) : null;
  },
};
