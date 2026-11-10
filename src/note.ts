import type { Paper } from "./types";
import { authorsShort, citationKey, lastName } from "./util";

/** Values available as {{placeholders}} in filename, folder, citation and note templates. */
export interface TemplateVars {
  title: string;
  /** Expanded to one list item per author when it is alone on a YAML list line; otherwise "A; B; C". */
  authors: string[];
  /** First author's family name. */
  author: string;
  firstAuthor: string;
  authorsShort: string;
  year: string;
  venue: string;
  doi: string;
  arxiv: string;
  url: string;
  citekey: string;
  abstract: string;
  date: string;
  time: string;
}

export const PLACEHOLDER_HELP =
  "{{title}} {{author}} (first author's family name) {{authorsShort}} (Smith / Smith and Doe / Smith et al.) " +
  "{{firstAuthor}} {{authors}} {{year}} {{venue}} {{doi}} {{arxiv}} {{url}} {{citekey}} {{abstract}} {{date}} {{time}}";

const pad = (n: number) => String(n).padStart(2, "0");

export function templateVars(p: Paper, url: string | undefined, now = new Date()): TemplateVars {
  return {
    title: p.title,
    authors: p.authors,
    author: p.authors.length ? lastName(p.authors[0]) : "Anonymous",
    firstAuthor: p.authors[0] ?? "",
    authorsShort: authorsShort(p.authors),
    year: p.year ?? "",
    venue: p.venue ?? "",
    doi: p.doi ?? "",
    arxiv: p.arxiv ?? "",
    url: url ?? "",
    citekey: citationKey(p.authors, p.year),
    abstract: p.abstract ?? "",
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

const PH = /\{\{\s*([A-Za-z]+)\s*\}\}/g;
const HAS_PH = /\{\{\s*[A-Za-z]+\s*\}\}/;

function valueOf(vars: TemplateVars, key: string): string | undefined {
  if (!(key in vars)) return undefined;
  const v = (vars as unknown as Record<string, string | string[]>)[key];
  return Array.isArray(v) ? v.join("; ") : v;
}

/** Plain substitution; unknown placeholders are left as they are so mistakes are visible. */
export function render(template: string, vars: TemplateVars, map: (s: string) => string = (s) => s): string {
  return template.replace(PH, (m, k: string) => {
    const v = valueOf(vars, k);
    return v === undefined ? m : map(v);
  });
}

// Characters that are invalid in file names on some OS, or that break Obsidian links.
const BAD_FILENAME = /[\\/:*?"<>|#^[\]\u0000-\u001f]/g;

export function sanitizeFilename(name: string, maxLength = 150): string {
  let s = name
    .replace(/[\r\n\t]+/g, " ")
    .replace(/:/g, " -")
    .replace(/\//g, "-")
    .replace(BAD_FILENAME, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  if (s.length > maxLength) s = s.slice(0, maxLength).replace(/[\s\-–,;.]+\S*$/, "") || s.slice(0, maxLength);
  return s || "Untitled paper";
}

export function renderFilename(template: string, vars: TemplateVars, maxLength?: number): string {
  return sanitizeFilename(render(template, vars), maxLength);
}

/** Folder templates may contain placeholders, e.g. "Papers/{{year}}". Each segment is sanitised. */
export function renderFolder(template: string, vars: TemplateVars): string {
  return render(template, vars)
    .split("/")
    .map((seg) => seg.trim())
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .map((seg) => sanitizeFilename(seg, 100))
    .join("/");
}

const oneLine = (s: string) => s.replace(/\s+/g, " ");

/** YAML double-quoted scalar. JSON string syntax is valid YAML. */
export const yamlQuote = (s: string) => JSON.stringify(s.replace(/\s+/g, " "));
/** Content for inside an existing "..." in the template. */
const inDouble = (s: string) => yamlQuote(s).slice(1, -1);
/** Content for inside an existing '...' in the template. */
const inSingle = (s: string) => s.replace(/\s+/g, " ").replace(/'/g, "''");

/**
 * Render a note template. Values in the frontmatter are YAML-escaped so that titles containing
 * ':', '#', quotes or newlines cannot break the YAML or inject extra properties.
 */
export function renderNote(template: string, vars: TemplateVars): string {
  const t = template.replace(/\r\n/g, "\n");
  const fm = t.match(/^---\n([\s\S]*?)\n---(?=\n|$)/);
  if (!fm) return render(t, vars);
  const yaml = fm[1].split("\n").map((line) => renderYamlLine(line, vars)).join("\n");
  return `---\n${yaml}\n---` + render(t.slice(fm[0].length), vars, oneLine);
}

function renderYamlLine(line: string, vars: TemplateVars): string {
  if (!HAS_PH.test(line)) return line;

  // "key: value" or "- value" (list item), keeping indentation and the key as written.
  const m = line.match(/^(\s*(?:-\s+)?(?:[^:#"']+:\s*)?|\s*-\s+)(.*)$/);
  const prefix = m ? m[1] : "";
  const rest = (m ? m[2] : line).trimEnd();

  // A list item that is only {{authors}} becomes one item per author.
  const bare = rest.replace(/^(["'])(.*)\1$/, "$2").trim();
  if (/^\s*-\s+$/.test(prefix) && /^\{\{\s*authors\s*\}\}$/.test(bare)) {
    if (!vars.authors.length) return `${prefix}`.trimEnd();
    return vars.authors.map((a) => `${prefix}${yamlQuote(a)}`).join("\n");
  }

  if (/^".*"$/.test(rest)) return prefix + '"' + render(rest.slice(1, -1), vars, inDouble) + '"';
  if (/^'.*'$/.test(rest)) return prefix + "'" + render(rest.slice(1, -1), vars, inSingle) + "'";

  const value = render(rest, vars).trim();
  if (!value) return prefix.trimEnd();
  return prefix + yamlQuote(value);
}

export const DEFAULT_NOTE_TEMPLATE = `---
title: "{{title}}"
authors:
  - "{{authors}}"
year: "{{year}}"
venue: "{{venue}}"
doi: "{{doi}}"
arxiv: "{{arxiv}}"
url: "{{url}}"
citekey: "{{citekey}}"
type: article
created: "{{date}} {{time}}"
---
`;
