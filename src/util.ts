import type { HttpGet } from "./types";

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
};

/** Decode the handful of HTML/XML entities that appear in API metadata. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/**
 * Turn untrusted API text (which may contain HTML/JATS/MathML markup) into plain text.
 * The result is only ever used as text (setText / file contents), never as HTML.
 */
export function plainText(s: string | undefined | null): string {
  if (!s) return "";
  return decodeEntities(String(s).replace(/<[^>]*>/g, " "))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDoi(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const m = String(raw).trim().match(/10\.\d{4,9}\/\S+/);
  if (!m) return undefined;
  return m[0].replace(/[.,;)\]]+$/, "").toLowerCase();
}

/** Strip prefixes and version suffix: "arXiv:1608.04948v2" → "1608.04948". */
export function normalizeArxiv(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim();
  const m = s.match(/(\d{4}\.\d{4,5})(v\d+)?/) || s.match(/([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?/i);
  return m ? m[1] : undefined;
}

/** "Schuller, Frederic P." → "Frederic P. Schuller"; leaves "First Last" untouched. */
export function firstLast(name: string): string {
  const n = plainText(name);
  const i = n.indexOf(",");
  if (i < 0) return n;
  const last = n.slice(0, i).trim();
  const first = n.slice(i + 1).trim();
  return first ? `${first} ${last}` : last;
}

const PARTICLES = new Set(["van", "von", "der", "den", "de", "del", "della", "di", "da", "la", "le", "du", "dos", "das", "ter", "ten"]);

/** Family name of a "First Last" name, keeping lower-case particles: "Gerard 't Hooft" → "'t Hooft". */
export function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] ?? "";
  // Drop suffixes like "Jr." / "III".
  while (parts.length > 1 && /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(parts[parts.length - 1])) parts.pop();
  let i = parts.length - 1;
  while (i > 0 && (PARTICLES.has(parts[i - 1].toLowerCase()) || parts[i - 1] === "'t")) i--;
  return parts.slice(i).join(" ");
}

/** "Maldacena", "Maldacena and Witten", "Maldacena et al." */
export function authorsShort(authors: string[]): string {
  if (authors.length === 0) return "Anonymous";
  if (authors.length === 1) return lastName(authors[0]);
  if (authors.length === 2) return `${lastName(authors[0])} and ${lastName(authors[1])}`;
  return `${lastName(authors[0])} et al.`;
}

/** CitationKey per the vault's style guide: first author's family name + year, ASCII letters only. */
export function citationKey(authors: string[], year: string | undefined): string {
  const base = authors.length ? lastName(authors[0]) : "Anon";
  const ascii = base.normalize("NFKD").replace(/[^A-Za-z]/g, "");
  return `${ascii || "Anon"}${year ?? ""}`;
}

export function yearOf(s: string | number | undefined | null): string | undefined {
  if (s === undefined || s === null) return undefined;
  const m = String(s).match(/\b(1[5-9]\d\d|20\d\d)\b/);
  return m ? m[1] : undefined;
}

export class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} for ${new URL(url).host}`);
  }
}

export async function getJson<T = any>(http: HttpGet, url: string, headers?: Record<string, string>): Promise<T | null> {
  const res = await http(url, { Accept: "application/json", ...headers });
  if (res.status === 404) return null;
  if (res.status < 200 || res.status >= 300) throw new HttpError(res.status, url);
  return JSON.parse(res.text) as T;
}

export async function getText(http: HttpGet, url: string, headers?: Record<string, string>): Promise<string | null> {
  const res = await http(url, headers);
  if (res.status === 404) return null;
  if (res.status < 200 || res.status >= 300) throw new HttpError(res.status, url);
  return res.text;
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut) + "…";
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
