import type { Paper, Source, SourceContext } from "../types";
import { arr, firstLast, get, getJson, normalizeArxiv, normalizeDoi, plainText, str, yearOf, type Json } from "../util";

const BASE = "https://inspirehep.net/api";
const FIELDS = "titles,authors.full_name,arxiv_eprints,dois,publication_info,abstracts,control_number,earliest_date,preprint_date";

export function fromInspire(hit: Json): Paper | null {
  // Search hits wrap the record in "metadata"; single-record endpoints return it the same way.
  const m = get(hit, "metadata") ?? hit;
  const title = plainText(str(get(m, "titles", 0, "title")));
  if (!title) return null;
  const pub = arr(get(m, "publication_info")).find((p) => str(get(p, "journal_title"))) ?? {};
  const pubYear = str(get(pub, "year"));
  const venue = [str(get(pub, "journal_title")), str(get(pub, "journal_volume")), pubYear ? `(${pubYear})` : ""]
    .filter(Boolean)
    .join(" ");
  const recid = str(get(m, "control_number"));
  const abstracts = arr(get(m, "abstracts"));
  const abstract = str(get(abstracts.find((a) => str(get(a, "source")) === "arXiv"), "value")) ?? str(get(abstracts, 0, "value"));
  return {
    title,
    authors: arr(get(m, "authors"))
      .map((a) => firstLast(str(get(a, "full_name")) ?? ""))
      .filter(Boolean),
    year: yearOf(pubYear),
    firstYear: yearOf(str(get(m, "earliest_date"))) ?? yearOf(str(get(m, "preprint_date"))),
    venue: plainText(venue) || undefined,
    abstract: plainText(abstract) || undefined,
    doi: normalizeDoi(str(get(m, "dois", 0, "value"))),
    arxiv: normalizeArxiv(str(get(m, "arxiv_eprints", 0, "value"))),
    inspireUrl: recid && /^\d+$/.test(recid) ? `https://inspirehep.net/literature/${recid}` : undefined,
    sources: ["inspire"],
  };
}

const isPaper = (p: Paper | null): p is Paper => p !== null;

async function one(url: string, ctx: SourceContext): Promise<Paper | null> {
  const data = await getJson(ctx.http, `${url}?fields=${FIELDS}`);
  return data ? fromInspire(data) : null;
}

export const inspire: Source & { byRecid: (id: string, ctx: SourceContext) => Promise<Paper | null> } = {
  id: "inspire",
  search: async (query, ctx) => {
    const url = `${BASE}/literature?q=${encodeURIComponent(query)}&size=${ctx.limit}&sort=bestmatch&fields=${FIELDS}`;
    const data = await getJson(ctx.http, url);
    return arr(get(data, "hits", "hits")).map(fromInspire).filter(isPaper);
  },
  byDoi: (doi, ctx) => one(`${BASE}/doi/${encodeURIComponent(doi)}`, ctx),
  byArxiv: (id, ctx) => one(`${BASE}/arxiv/${id.split("/").map(encodeURIComponent).join("/")}`, ctx),
  byRecid: (id, ctx) => one(`${BASE}/literature/${encodeURIComponent(id)}`, ctx),
};
