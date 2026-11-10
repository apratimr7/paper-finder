import esbuild from "esbuild";

const mode = process.argv[2] ?? "dev";

if (mode === "test") {
  // Bundle only the Obsidian-free core so it can be exercised from Node.
  await esbuild.build({
    entryPoints: ["src/core.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2021",
    outfile: "test/dist/core.mjs",
    logLevel: "info",
  });
} else {
  const prod = mode === "production";
  const ctx = await esbuild.context({
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
    format: "cjs",
    target: "es2021",
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    minify: prod,
    outfile: "main.js",
  });
  if (prod) {
    await ctx.rebuild();
    await ctx.dispose();
  } else {
    await ctx.watch();
  }
}
