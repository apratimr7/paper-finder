import type { Paper, Source, SourceContext } from "../types";
import { getText, normalizeArxiv, normalizeDoi, plainText, sleep, yearOf } from "../util";

const BASE = "https://export.arxiv.org/api/query";

// arXiv asks clients to make at most one request every three seconds.
const MIN_INTERVAL_MS = 3100;
let nextSlot = 0;
async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait > 0) await sleep(wait);
}

function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : undefined;
}

/**
 * Minimal Atom parsing with regular expressions. arXiv's feed is machine-generated and regular,
 * and this keeps the core free of DOM APIs so it also runs in Node tests.
 */
export function parseArxivAtom(xml: string): Paper[] {
  const out: Paper[] = [];
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  for (const e of entries) {
    const idUrl = tag(e, "id") ?? "";
    const id = normalizeArxiv(idUrl.replace(/^.*\/abs\//, ""));
    const title = plainText(tag(e, "title"));
    if (!id || !title || /^Error$/i.test(title)) continue;
    const authors = (e.match(/<author>[\s\S]*?<\/author>/g) ?? []).map((a) => plainText(tag(a, "name"))).filter(Boolean);
    const doi = normalizeDoi(tag(e, "arxiv:doi"));
    const journal = plainText(tag(e, "arxiv:journal_ref"));
    out.push({
      title,
      authors,
      year: yearOf(tag(e, "published")),
      venue: journal || "arXiv",
      abstract: plainText(tag(e, "summary")) || undefined,
      doi,
      arxiv: id,
      sources: ["arxiv"],
    });
  }
  return out;
}

// arXiv's search treats these as terms (or operators) and then matches nothing.
const STOPWORDS = new Set(["and", "or", "not", "andnot", "the", "of", "a", "an", "in", "on", "for", "to", "with", "by", "at", "from"]);

/** Build an arXiv search_query: every word must appear somewhere (all:), quoted phrases kept. */
export function arxivQuery(q: string): string {
  const terms = q
    .replace(/[()]/g, " ")
    .match(/"[^"]+"|\S+/g)
    ?.map((t) => t.replace(/[^\p{L}\p{N}"\-./ ]/gu, ""))
    // Years are dropped: all: does not search dates, so "2020" would only match abstracts mentioning it.
    .filter((t) => t && t !== '""' && !STOPWORDS.has(t.toLowerCase()) && !/^(1[89]|20)\d\d$/.test(t)) ?? [];
  return terms.map((t) => `all:${t.includes(" ") ? t : t.replace(/"/g, "")}`).join(" AND ");
}

export const arxiv: Source = {
  id: "arxiv",
  async search(query, ctx: SourceContext) {
    const sq = arxivQuery(query);
    if (!sq) return [];
    await throttle();
    const xml = await getText(ctx.http, `${BASE}?search_query=${encodeURIComponent(sq)}&start=0&max_results=${ctx.limit}`);
    return xml ? parseArxivAtom(xml) : [];
  },
  async byArxiv(id, ctx) {
    await throttle();
    const xml = await getText(ctx.http, `${BASE}?id_list=${encodeURIComponent(id)}&max_results=1`);
    return xml ? parseArxivAtom(xml)[0] ?? null : null;
  },
};
