const entrypoints = Array.from([
	...new Bun.Glob("providers/custom/**/client.ts").scanSync({
		absolute: true,
	}),
	...new Bun.Glob("providers/custom/**/index.ts").scanSync({
		absolute: true,
	}),
]);

Bun.build({
	entrypoints,
	outdir: "providers/build",
	splitting: false,
	target: "browser",
	jsx: {
		importSource: "hono/jsx",
	},
	root: "providers/custom",
});

console.log("Build terminé !");
