import { createRequire } from "module";
globalThis.window = globalThis;
const req = createRequire(import.meta.url);
const pdf = req("./dist/pdf.cjs");
const ok = (c, m) => console.log(c ? "PASS" : "FAIL", m);
for (const [p, e] of [["/home/x", true], ["~/Papers", true], ["~", true], ["C:\\P", true], ["D:/P", true], ["\\\\srv\\s", true], ["Attachments/Papers", false], ["~notes", false], ["", false]])
  ok(pdf.isAbsolutePath(p) === e, `isAbsolutePath(${JSON.stringify(p)}) = ${e}`);
ok(pdf.looksLikePdf(new TextEncoder().encode("%PDF-1.7 ...").buffer), "pdf magic accepted");
ok(!pdf.looksLikePdf(new TextEncoder().encode("<!DOCTYPE html><html>").buffer), "html rejected");
ok(pdf.insertEmbed("---\na: 1\n---\n---\n\n\n# References:\n", "![[x.pdf]]") === "---\na: 1\n---\n---\n\n\n![[x.pdf]]\n\n# References:\n", "embed placed before References");
ok(pdf.insertEmbed("body\n\n", "![[x.pdf]]") === "body\n\n![[x.pdf]]\n", "embed at end");
ok(pdf.insertEmbed("---\n# References are below\n---\n#references-todo\ntext\n", "E") === "---\n# References are below\n---\n#references-todo\ntext\n\nE\n", "YAML comment and tag are not mistaken for the heading");
const r1 = await pdf.downloadPdf(["arxiv-pdf", "oa-pdf"], { arxiv: "1608.04948", sources: [] }, 50);
ok(r1.data && r1.data.byteLength > 100000, `arXiv PDF downloaded (${r1.data?.byteLength} bytes from ${r1.url})`);
const r2 = await pdf.downloadPdf(["oa-pdf"], { oaPdfUrl: "https://journals.aps.org/prd/abstract/10.1103/PhysRevD.101.084046", sources: [] }, 50);
ok("error" in r2, `non-PDF page rejected: ${r2.error}`);
const r3 = await pdf.downloadPdf(["arxiv-pdf"], { arxiv: "1608.04948", sources: [] }, 0.1);
ok("error" in r3, `size limit enforced: ${r3.error}`);
const os = req("os"), fs = req("fs"), path = req("path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-"));
const a = await pdf.saveOutside(dir, "Penedones 2016 - TASI", r1.data);
const b = await pdf.saveOutside(dir, "Penedones 2016 - TASI", r1.data);
ok(a.absPath !== b.absPath && b.absPath.endsWith("(2).pdf"), `no overwrite: ${path.basename(a.absPath)}, ${path.basename(b.absPath)}; url ${a.fileUrl}`);
let threw = false; try { await pdf.saveOutside(dir, "../escape", r1.data); } catch { threw = true; }
ok(threw, "path escaping the folder refused");
fs.rmSync(dir, { recursive: true });
