import { normalizeArxiv, normalizeDoi } from "./util";

export type ParsedInput =
  | { kind: "doi"; doi: string }
  | { kind: "arxiv"; id: string }
  | { kind: "inspire"; recid: string }
  | { kind: "openalex"; work: string }
  | { kind: "s2"; paperId: string }
  | { kind: "url"; url: string }
  | { kind: "text"; text: string };

const NEW_ARXIV = /^(?:arxiv:\s*)?(\d{4}\.\d{4,5})(v\d+)?$/i;
const OLD_ARXIV = /^(?:arxiv:\s*)?([a-z-]+(?:\.[a-z]{2})?\/\d{7})(v\d+)?$/i;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Work out what the user typed: an identifier, a URL, or free text. */
export function parseInput(raw: string): ParsedInput {
  const s = raw.trim();

  if (/^https?:\/\//i.test(s)) {
    let u: URL;
    try {
      u = new URL(s);
    } catch {
      return { kind: "text", text: s };
    }
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const path = safeDecode(u.pathname);

    if (/(^|\.)arxiv\.org$/.test(host) || host === "ar5iv.labs.arxiv.org" || host === "ar5iv.org") {
      const id = normalizeArxiv(path.replace(/^\/(abs|pdf|html|format|src)\//, "").replace(/\.pdf$/, ""));
      if (id) return { kind: "arxiv", id };
    }
    if (host === "doi.org" || host === "dx.doi.org") {
      const doi = normalizeDoi(path.slice(1));
      if (doi) return { kind: "doi", doi };
    }
    if (host === "inspirehep.net") {
      const m = path.match(/\/(?:api\/)?literature\/(\d+)/);
      if (m) return { kind: "inspire", recid: m[1] };
      const a = path.match(/\/(?:api\/)?arxiv\/(.+)$/);
      if (a && normalizeArxiv(a[1])) return { kind: "arxiv", id: normalizeArxiv(a[1])! };
    }
    if (host === "openalex.org" || host === "api.openalex.org") {
      const m = path.match(/\b(W\d+)\b/i);
      if (m) return { kind: "openalex", work: m[1].toUpperCase() };
    }
    if (host === "semanticscholar.org" || host === "api.semanticscholar.org") {
      const m = path.match(/\b([0-9a-f]{40})\b/i);
      if (m) return { kind: "s2", paperId: m[1].toLowerCase() };
    }
    // Many publisher URLs embed the DOI (APS, Springer, Wiley, IOP, Elsevier's "doi/..." paths).
    const doi = normalizeDoi(path + (u.search ? safeDecode(u.search) : ""));
    if (doi) return { kind: "doi", doi };
    return { kind: "url", url: u.toString() };
  }

  const doi = s.match(/^(?:doi:\s*)?(10\.\d{4,9}\/\S+)$/i);
  if (doi) return { kind: "doi", doi: normalizeDoi(doi[1])! };

  const na = s.match(NEW_ARXIV);
  if (na) return { kind: "arxiv", id: na[1] };
  const oa = s.match(OLD_ARXIV);
  if (oa) return { kind: "arxiv", id: oa[1] };

  return { kind: "text", text: s };
}

/**
 * Look for a DOI or arXiv id in a publisher page's HTML via the standard citation meta tags.
 * The HTML is only scanned with regular expressions; it is never rendered or parsed into a DOM.
 */
export function identifiersFromHtml(html: string): { doi?: string; arxiv?: string } {
  const head = html.slice(0, 300_000);
  const meta = (name: string): string | undefined => {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
    const tag = head.match(re)?.[0];
    return tag?.match(/content=["']([^"']+)["']/i)?.[1];
  };
  const doi =
    normalizeDoi(meta("citation_doi")) ||
    normalizeDoi(meta("dc\\.identifier")) ||
    normalizeDoi(meta("prism\\.doi")) ||
    normalizeDoi(meta("DC\\.Identifier"));
  const arxiv = normalizeArxiv(meta("citation_arxiv_id"));
  return { doi, arxiv };
}
