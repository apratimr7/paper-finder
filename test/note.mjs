// Offline checks for template rendering and file names.
// The core uses window.setTimeout (Obsidian popout-window safety); Node has no window.
globalThis.window ??= globalThis;
import * as c from "./dist/core.mjs";
const ok = (cond, m) => { console.log(cond ? "PASS" : "FAIL", m); if (!cond) process.exitCode = 1; };
const p = { title: 'AdS/CFT: a "review" #2 \u0092 <b>bold</b> &lt;img src=x&gt;', authors: ["Juan Maldacena", "Gerard 't Hooft"], year: "1998", sources: [] };
p.title = c.plainText(p.title);
const v = c.templateVars(p, "https://doi.org/10.1/x");
const out = c.renderNote(`---
title: "{{title}}" # comment
aliases: ["{{title}}", {{citekey}}]
authors: [{{authors}}]
plain: {{title}}
---
Body {{title}}
`, v);
console.log(out);
ok(out.includes('aliases: ["AdS/CFT: a \\"review\\" #2 \\\\<img src=x>"') === false, "frontmatter values are not body-escaped");
ok(/^title: ".*" # comment$/m.test(out), "trailing comment kept");
ok(/^aliases: \[".*", "Maldacena1998"\]$/m.test(out), "flow sequence escaped per element");
ok(/^authors: \["Juan Maldacena", "Gerard 't Hooft"\]$/m.test(out), "authors expand in flow sequence");
ok(!out.includes("\u0092"), "C1 control character stripped");
ok(out.includes("Body AdS/CFT: a \"review\" #2 bold \\<img src=x>"), "entity-encoded tag escaped in body");
const long = c.sanitizeFilename("漢".repeat(120));
ok(new TextEncoder().encode(long).length <= 200, `long CJK name capped at ${new TextEncoder().encode(long).length} bytes`);
ok(c.parseInput("https://example.com/x%").kind === "url", "malformed percent-escape doesn't throw");
