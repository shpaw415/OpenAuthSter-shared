const entrypoints = Array.from(
  new Bun.Glob("providers/custom/**/index.ts").scanSync({
    absolute: true,
  }),
);

Bun.build({
  entrypoints,
  outdir: "providers/build",
  splitting: true,
  target: "browser",
  jsx: {
    importSource: "hono/jsx",
  },
  root: "providers/custom",
});
