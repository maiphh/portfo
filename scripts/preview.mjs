// Serves the built static output (.vercel/output/static) for a quick local check.
// The @astrojs/vercel adapter doesn't support `astro preview`; use `vercel dev` to run /api routes.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), ".vercel/output/static");
const port = Number(process.env.PORT ?? 4321);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

if (!existsSync(root)) {
  console.error("No build found. Run `pnpm build` first.");
  process.exit(1);
}

const resolve = (url) => {
  const path = normalize(decodeURIComponent(new URL(url, "http://x").pathname)).replace(
    /^(\.\.[/\\])+/,
    "",
  );
  const candidates = [join(root, path), join(root, path, "index.html"), join(root, `${path}.html`)];
  return candidates.find((p) => p.startsWith(root) && existsSync(p) && statSync(p).isFile());
};

createServer((req, res) => {
  const file = resolve(req.url ?? "/");
  const target = file ?? join(root, "404.html");
  if (!target || !existsSync(target)) {
    // Can vanish for a beat while `pnpm build` rewrites the output dir.
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found (rebuilding?)");
    return;
  }
  res.writeHead(file ? 200 : 404, {
    "Content-Type": types[extname(target)] ?? "application/octet-stream",
  });
  const stream = createReadStream(target);
  stream.pipe(res);
  let done = false;
  res.on("close", () => {
    if (!done) stream.destroy();
    done = true;
  });
  stream.on("error", (err) => {
    if (!done) res.destroy(err);
    done = true;
  });
}).listen(port, () => console.log(`Static preview on http://localhost:${port} (no /api routes)`));
