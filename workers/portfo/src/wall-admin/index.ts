import type { Env } from "../env";
import { handleAuth, limit, requireSession } from "./auth";
import { publishDraft, readDraft, resetDraft, saveDraft } from "./draft";
import { json, reply, RequestError, sha256, uuidPattern } from "./http";
import { privateMedia, storeImage } from "./media";
import { decide, listSubmissions, submissionReceipt, submit } from "./submissions";

const prefix = "/internal/wall-admin";

export async function handleWallAdmin(request: Request, url: URL, env: Env) {
  const key = env.WALL_ADMIN_SERVICE_KEY;
  if (!key) return reply({ error: "The owner service is unavailable." }, 503);
  const supplied = request.headers.get("X-Wall-Service") ?? "";
  const [expected, received] = await Promise.all([sha256(key), sha256(supplied)]);
  if (!supplied || !crypto.subtle.timingSafeEqual(expected, received))
    return reply({ error: "Service authorization required." }, 403);
  const pathname = url.pathname.slice(prefix.length);
  const path = `${request.method} ${pathname}`;
  const token = request.headers.get("X-Wall-Session") ?? "";
  try {
    const auth = await handleAuth(request, env.DB, path, token);
    if (auth) return auth;
    if (path.startsWith("POST /limit/")) {
      const action = pathname.slice("/limit/".length);
      if (action === "change-password") await requireSession(env.DB, token);
      return await limit(env.DB, request, action, key);
    }
    if (path === "POST /submission-receipt") {
      const { id, fingerprint } = await json(request);
      return await submissionReceipt(env.DB, id, fingerprint);
    }
    if (path === "POST /submissions") return await submit(env, await request.formData());

    await requireSession(env.DB, token);
    switch (path) {
      case "GET /draft":
        return reply(await readDraft(env.DB));
      case "PUT /draft": {
        const { version, items } = await json(request);
        return await saveDraft(env.DB, version, items);
      }
      case "POST /publish": {
        const { version, baseRevision } = await json(request);
        return await publishDraft(env, version, baseRevision);
      }
      case "POST /reset": {
        const { version, activeRevision } = await json(request);
        return await resetDraft(env.DB, version, activeRevision);
      }
      case "POST /media":
        return reply(await storeImage(env, await request.formData(), true));
      case "GET /submissions":
        return await listSubmissions(env.DB, url.searchParams);
    }
    const image = /^GET \/media\/([a-f0-9]{64})\/(thumbnail|detail)$/.exec(path);
    if (image?.[1] && image[2]) return await privateMedia(env, image[1], image[2]);
    const review = /^POST \/submissions\/([^/]+)\/decision$/.exec(path)?.[1];
    if (review && uuidPattern.test(review))
      return await decide(env.DB, review, await json(request));
    return reply({ error: "Route not found." }, 404);
  } catch (error) {
    if (error instanceof RequestError) return reply({ error: error.message }, error.status);
    // Avoid logging upstream errors that can contain request-bound values.
    console.error("[wall-admin] private request failed", request.method, pathname.split("/")[1]);
    return reply({ error: "The wall service is temporarily unavailable. Please retry." }, 503);
  }
}
