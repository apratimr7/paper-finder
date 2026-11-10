/** A paper as returned by one or more sources, normalised to a common shape. */
export interface Paper {
  title: string;
  /** Full names in "First Last" order. */
  authors: string[];
  /** Year of the journal publication when known, otherwise of the record. */
  year?: string;
  /** Year the work first appeared (e.g. on arXiv), when a source reports it. */
  firstYear?: string;
  venue?: string;
  abstract?: string;
  /** Lower-case DOI without any resolver prefix, e.g. "10.1103/physrevd.101.084046". */
  doi?: string;
  /** arXiv identifier without version, e.g. "1608.04948" or "hep-th/9711200". */
  arxiv?: string;
  /** Publisher / landing page. */
  publisherUrl?: string;
  /** Open-access PDF if a source knows one. */
  oaPdfUrl?: string;
  inspireUrl?: string;
  openalexUrl?: string;
  s2Url?: string;
  /** Source ids that returned this paper (after merging). */
  sources: SourceId[];
  /** Internal ranking score, higher is better. */
  score?: number;
  /** Internal: which source supplied title / doi / year after merging. */
  fieldSrc?: Partial<Record<"title" | "doi" | "year", SourceId>>;
}

export type SourceId = "openalex" | "arxiv" | "inspire" | "crossref" | "semanticscholar";

export const SOURCE_LABELS: Record<SourceId, string> = {
  openalex: "OpenAlex",
  arxiv: "arXiv",
  inspire: "INSPIRE-HEP",
  crossref: "Crossref",
  semanticscholar: "Semantic Scholar",
};

export interface HttpResponse {
  status: number;
  text: string;
}

/** Injected HTTP GET so the core can run both inside Obsidian (requestUrl) and in Node tests (fetch). */
export type HttpGet = (url: string, headers?: Record<string, string>) => Promise<HttpResponse>;

export interface SourceContext {
  http: HttpGet;
  /** Optional contact e-mail for the OpenAlex / Crossref "polite pool". Empty means none is sent. */
  mailto: string;
  /** Optional OpenAlex API key. */
  openalexKey: string;
  /** Optional Semantic Scholar API key. */
  s2Key: string;
  limit: number;
  /** Lets slow or throttled sources skip work for a search that has been superseded. */
  isCancelled?: () => boolean;
}

export interface Source {
  id: SourceId;
  search(query: string, ctx: SourceContext): Promise<Paper[]>;
  byDoi?(doi: string, ctx: SourceContext): Promise<Paper | null>;
  byArxiv?(id: string, ctx: SourceContext): Promise<Paper | null>;
}
