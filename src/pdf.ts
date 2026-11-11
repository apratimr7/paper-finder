import { App, Modal, normalizePath, Platform, requestUrl, TFile, TFolder } from "obsidian";
import { isSafeUrl, linkFor, type LinkKind } from "./links";
import type { Paper } from "./types";
import { errorMessage } from "./util";

// The few Node built-ins used to save PDFs outside the vault (desktop only, loaded lazily).
interface NodeFs {
  promises: {
    mkdir(path: string, opts: { recursive: boolean }): Promise<unknown>;
    writeFile(path: string, data: Uint8Array, opts: { flag: string }): Promise<void>;
  };
}
interface NodePath {
  resolve(...parts: string[]): string;
  join(...parts: string[]): string;
  dirname(p: string): string;
}
interface NodeOs {
  homedir(): string;
}
interface NodeUrl {
  pathToFileURL(p: string): { href: string };
}
declare const require: (id: "fs" | "path" | "os" | "url") => unknown;

export const PDF_LINK_KINDS: LinkKind[] = ["arxiv-pdf", "oa-pdf"];

export type PdfSaved =
  | { where: "vault"; file: TFile }
  | { where: "outside"; absPath: string; fileUrl: string };

/** True for "/x", "~/x", "C:\x", "C:/x" and "\\server\share". */
export function isAbsolutePath(p: string): boolean {
  return /^(\/|~(\/|\\|$)|[A-Za-z]:[\\/]|\\\\)/.test(p.trim());
}

const MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** A real PDF starts with "%PDF-" (the spec allows up to 1024 bytes of junk before it). */
export function looksLikePdf(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf, 0, Math.min(buf.byteLength, 1024 + MAGIC.length));
  outer: for (let i = 0; i + MAGIC.length <= b.length; i++) {
    for (let j = 0; j < MAGIC.length; j++) if (b[i + j] !== MAGIC[j]) continue outer;
    return true;
  }
  return false;
}

export interface PdfDownload {
  url: string;
  data: ArrayBuffer;
}

/**
 * Try the paper's PDF links in order. A response is accepted only if it is a 200, within the
 * size limit, and actually a PDF; HTML pages (paywalls, captchas, error pages) are rejected.
 */
export async function downloadPdf(order: LinkKind[], p: Paper, maxMB: number): Promise<PdfDownload | { error: string }> {
  const errors: string[] = [];
  const tried = new Set<string>();
  for (const kind of order) {
    const url = linkFor(kind, p);
    if (!isSafeUrl(url) || tried.has(url)) continue;
    tried.add(url);
    let timer = 0;
    try {
      // Ask for the size first, so a huge file is not downloaded into memory only to be rejected.
      const head = await requestUrl({ url, method: "HEAD", throw: false }).catch(() => null);
      const declared = Number(head?.headers?.["content-length"] ?? head?.headers?.["Content-Length"]);
      if (head && head.status === 200 && Number.isFinite(declared) && declared > maxMB * 1024 * 1024) {
        errors.push(`${new URL(url).host}: larger than ${maxMB} MB`);
        continue;
      }
      const res = await Promise.race([
        requestUrl({ url, throw: false }),
        new Promise<never>((_, rej) => (timer = window.setTimeout(() => rej(new Error("timed out")), 90_000))),
      ]);
      if (res.status !== 200) {
        errors.push(`${new URL(url).host}: HTTP ${res.status}`);
        continue;
      }
      const data = res.arrayBuffer;
      if (data.byteLength > maxMB * 1024 * 1024) {
        errors.push(`${new URL(url).host}: larger than ${maxMB} MB`);
        continue;
      }
      if (!looksLikePdf(data)) {
        errors.push(`${new URL(url).host}: not a PDF`);
        continue;
      }
      return { url, data };
    } catch (e) {
      errors.push(`${new URL(url).host}: ${errorMessage(e)}`);
    } finally {
      window.clearTimeout(timer);
    }
  }
  return { error: errors.length ? errors.join("; ") : "no arXiv or open-access PDF is known for this paper" };
}

async function ensureVaultFolder(app: App, path: string): Promise<void> {
  let cur = "";
  for (const seg of path.split("/").filter(Boolean)) {
    cur = cur ? `${cur}/${seg}` : seg;
    const f = app.vault.getAbstractFileByPath(cur);
    if (!f) await app.vault.createFolder(cur);
    else if (!(f instanceof TFolder)) throw new Error(`"${cur}" exists and is not a folder`);
  }
}

/** Save inside the vault. Never overwrites: "name (2).pdf" etc. */
export async function saveInVault(app: App, folder: string, base: string, data: ArrayBuffer): Promise<TFile> {
  const dir = normalizePath(folder || "/");
  if (dir !== "/") await ensureVaultFolder(app, dir);
  const at = (n: number) => normalizePath(`${dir === "/" ? "" : dir + "/"}${base}${n > 1 ? ` (${n})` : ""}.pdf`);
  let n = 1;
  while (app.vault.getAbstractFileByPath(at(n))) n++;
  return app.vault.createBinary(at(n), data);
}

/**
 * Save outside the vault (desktop only). The file name is already sanitised; the resolved path is
 * still checked to lie inside the chosen folder. Never overwrites an existing file.
 */
export async function saveOutside(folder: string, base: string, data: ArrayBuffer): Promise<{ absPath: string; fileUrl: string }> {
  if (!Platform.isDesktopApp) throw new Error("saving outside the vault needs desktop Obsidian");
  const fs = (require("fs") as NodeFs).promises;
  const path = require("path") as NodePath;
  const os = require("os") as NodeOs;
  const nodeUrl = require("url") as NodeUrl;

  let dir = folder.trim();
  if (dir === "~" || dir.startsWith("~/") || dir.startsWith("~\\")) dir = path.join(os.homedir(), dir.slice(1));
  dir = path.resolve(dir);
  await fs.mkdir(dir, { recursive: true });

  for (let n = 1; n < 1000; n++) {
    const abs = path.resolve(dir, `${base}${n > 1 ? ` (${n})` : ""}.pdf`);
    if (path.dirname(abs) !== dir) throw new Error("refusing a file name that leaves the PDF folder");
    try {
      // "wx": fail instead of overwriting if the file already exists.
      await fs.writeFile(abs, new Uint8Array(data), { flag: "wx" });
      return { absPath: abs, fileUrl: nodeUrl.pathToFileURL(abs).href };
    } catch (e) {
      if ((e as { code?: unknown } | null)?.code === "EEXIST") continue;
      throw e;
    }
  }
  throw new Error("too many files with the same name");
}

/** Insert an embed before a "References" heading if the note has one, otherwise at the end. */
export function insertEmbed(content: string, embed: string): string {
  const fm = content.match(/^---\n[\s\S]*?\n---(?:\n|$)/);
  const start = fm ? fm[0].length : 0;
  const m = content.slice(start).match(/^#{1,6}\s+References\s*:?\s*$/im);
  if (m && m.index !== undefined) {
    const at = start + m.index;
    return content.slice(0, at) + `${embed}\n\n` + content.slice(at);
  }
  return content.replace(/\s*$/, "") + `\n\n${embed}\n`;
}

/** Yes/no question as a promise. */
export function confirm(app: App, title: string, message: string, yes = "Download"): Promise<boolean> {
  return new Promise((resolve) => {
    const m = new (class extends Modal {
      done = false;
      onOpen() {
        this.titleEl.setText(title);
        this.contentEl.createEl("p", { text: message });
        const row = this.contentEl.createDiv({ cls: "modal-button-container" });
        row.createEl("button", { text: yes, cls: "mod-cta" }).addEventListener("click", () => this.finish(true));
        row.createEl("button", { text: "Skip" }).addEventListener("click", () => this.finish(false));
      }
      finish(v: boolean) {
        this.done = true;
        resolve(v);
        this.close();
      }
      onClose() {
        if (!this.done) resolve(false);
      }
    })(app);
    m.open();
  });
}
