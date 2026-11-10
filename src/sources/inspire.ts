import type { Paper, Source, SourceContext } from "../types";
import { firstLast, getJson, normalizeArxiv, normalizeDoi, plainText, yearOf } from "../util";

const BASE = "https://inspirehep.net/api";
const FIELDS = "titles,authors.full_name,arxiv_eprints,dois,publication_info,abstracts,control_number,earliest_date,preprint_date";

export function fromInspire(hit: any): Paper | null {
  const m = hit?.metadata ?? hit;
  const title = plainText(m?.titles?.[0]?.title);
  if (!title) return null;
  const pub = (m.publication_info ?? []).find((p: any) => p?.journal_title) ?? {};
  const venue = [pub.journal_title, pub.journal_volume, pub.year ? `(${pub.year})` : ""].filter(Boolean).join(" ");
  const recid = m.control_number;
  const abstract = (m.abstracts ?? []).find((a: any) => a?.source === "arXiv")?.value ?? m.abstracts?.[0]?.value;
  return {
    title,
    authors: (m.authors ?? []).map((a: any) => firstLast(a?.full_name ?? "")).filter(Boolean),
    year: yearOf(pub.year),
    firstYear: yearOf(m.earliest_date) ?? yearOf(m.preprint_date),
    venue: plainText(venue) || undefined,
    abstract: plainText(abstract) || undefined,
    doi: normalizeDoi(m.dois?.[0]?.value),
    arxiv: normalizeArxiv(m.arxiv_eprints?.[0]?.value),
    inspireUrl: recid ? `https://inspirehep.net/literature/${recid}` : undefined,
    sources: ["inspire"],
  };
}

async function one(url: string, ctx: SourceContext): Promise<Paper | null> {
  const data = await getJson(ctx.http, `${url}?fields=${FIELDS}`);
  return data ? fromInspire(data) : null;
}

export const inspire: Source & { byRecid(id: string, ctx: SourceContext): Promise<Paper | null> } = {
  id: "inspire",
  async search(query, ctx) {
    const url = `${BASE}/literature?q=${encodeURIComponent(query)}&size=${ctx.limit}&sort=bestmatch&fields=${FIELDS}`;
    const data = await getJson(ctx.http, url);
    return (data?.hits?.hits ?? []).map(fromInspire).filter((p: Paper | null): p is Paper => !!p);
  },
  byDoi: (doi, ctx) => one(`${BASE}/doi/${encodeURIComponent(doi)}`, ctx),
  byArxiv: (id, ctx) => one(`${BASE}/arxiv/${id.split("/").map(encodeURIComponent).join("/")}`, ctx),
  byRecid: (id, ctx) => one(`${BASE}/literature/${encodeURIComponent(id)}`, ctx),
};
