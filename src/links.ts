import type { HttpGet, Paper } from "./types";

export type LinkKind =
  | "arxiv-html"
  | "ar5iv"
  | "arxiv-abs"
  | "arxiv-pdf"
  | "doi"
  | "publisher"
  | "oa-pdf"
  | "inspire"
  | "openalex"
  | "semanticscholar";

export const LINK_LABELS: Record<LinkKind, string> = {
  "arxiv-html": "arXiv HTML (arxiv.org/html, renders math; papers since late 2023)",
  ar5iv: "ar5iv HTML (older arXiv papers rendered as HTML)",
  "arxiv-abs": "arXiv abstract page",
  "arxiv-pdf": "arXiv PDF",
  doi: "DOI link (doi.org)",
  publisher: "Publisher / landing page",
  "oa-pdf": "Open-access PDF (from OpenAlex)",
  inspire: "INSPIRE-HEP record",
  openalex: "OpenAlex record",
  semanticscholar: "Semantic Scholar page",
};

export const ALL_LINK_KINDS = Object.keys(LINK_LABELS) as LinkKind[];

export function linkFor(kind: LinkKind, p: Paper): string | undefined {
  const a = p.arxiv;
  switch (kind) {
    case "arxiv-html":
      return a ? `https://arxiv.org/html/${a}` : undefined;
    case "ar5iv":
      return a ? `https://ar5iv.labs.arxiv.org/html/${a}` : undefined;
    case "arxiv-abs":
      return a ? `https://arxiv.org/abs/${a}` : undefined;
    case "arxiv-pdf":
      return a ? `https://arxiv.org/pdf/${a}` : undefined;
    case "doi":
      return p.doi ? `https://doi.org/${p.doi}` : undefined;
    case "publisher":
      return p.publisherUrl;
    case "oa-pdf":
      return p.oaPdfUrl;
    case "inspire":
      return p.inspireUrl;
    case "openalex":
      return p.openalexUrl;
    case "semanticscholar":
      return p.s2Url;
  }
}

/** Only http(s) links are ever stored or opened. */
export function isSafeUrl(u: string | undefined): u is string {
  if (!u) return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** The first available link in the user's precedence order, without network checks. */
export function firstLink(order: LinkKind[], p: Paper): string | undefined {
  for (const k of order) {
    const u = linkFor(k, p);
    if (isSafeUrl(u)) return u;
  }
  return undefined;
}

/**
 * Like firstLink, but checks that an arXiv HTML rendering actually exists, since many papers
 * have none (arxiv.org/html started in Dec 2023; ar5iv lags and skips papers that fail to convert).
 */
export async function firstWorkingLink(order: LinkKind[], p: Paper, http: HttpGet): Promise<string | undefined> {
  for (const k of order) {
    const u = linkFor(k, p);
    if (!isSafeUrl(u)) continue;
    if (k === "arxiv-html" || k === "ar5iv") {
      try {
        const res = await http(u);
        if (res.status !== 200) continue;
        // ar5iv answers 200 with a "No content available" page when it has no rendering.
        if (k === "ar5iv" && /<title>\s*No content available/i.test(res.text.slice(0, 20_000))) continue;
      } catch {
        continue;
      }
    }
    return u;
  }
  return undefined;
}
