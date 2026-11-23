import type { APIContext } from "astro";
import sharp from "sharp";
import { changePassword, signIn, signOut } from "./password";
import { digest, forward, GatewayError, gatewayFailure, worker } from "./server";

const photoLimit = 4_000_000;
const multipartLimit = 4_100_000;
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
const imagePath = /^media\/([a-f0-9]{64})\/(thumbnail|detail)$/;
const reviewPath = new RegExp(`^submissions/(${uuid})/decision$`);

async function boundedRequest(request: Request, limit: number) {
  if (Number(request.headers.get("Content-Length")) > limit)
    throw new GatewayError(413, "The request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new GatewayError(400, "A request body is required.");
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new GatewayError(413, "The request is too large.");
      parts.push(value);
    }
  } finally {
    if (size > limit) void reader.cancel().catch(() => {});
    else reader.releaseLock();
  }
  return new Response(new Blob(parts), {
    headers: { "Content-Type": request.headers.get("Content-Type") ?? "" },
  });
}

async function readJson(request: Request, limit = 8192): Promise<Record<string, unknown>> {
  const body = await boundedRequest(request, limit);
  const data: unknown = await body.json().catch(() => null);
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new GatewayError(400, "Expected a JSON object.");
  return data as Record<string, unknown>;
}

async function readForm(request: Request) {
  if (!request.headers.get("Content-Type")?.startsWith("multipart/form-data;"))
    throw new GatewayError(400, "Expected a multipart form.");
  const body = await boundedRequest(request, multipartLimit);
  return body.formData().catch(() => {
    throw new GatewayError(400, "The form could not be read.");
  });
}

async function normalizeImage(buffer: Buffer, target: FormData) {
  try {
    const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: "warning" });
    const { format, pages, width, height } = await image.metadata();
    if (
      !format ||
      !["jpeg", "png", "webp"].includes(format) ||
      !width ||
      !height ||
      width * height > 40_000_000 ||
      (pages ?? 1) !== 1
    )
      throw new Error("Unsupported input.");

    const variant = (size: number) =>
      image
        .clone()
        .autoOrient()
        .resize(size, size, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
    const thumbnail = await variant(600);
    const detail = await variant(2000);
    target.set("mediaId", digest(Buffer.concat([thumbnail.data, detail.data])));
    target.set("width", String(detail.info.width));
    target.set("height", String(detail.info.height));
    target.set(
      "thumbnail",
      new Blob([new Uint8Array(thumbnail.data)], { type: "image/webp" }),
      "thumbnail.webp",
    );
    target.set(
      "detail",
      new Blob([new Uint8Array(detail.data)], { type: "image/webp" }),
      "detail.webp",
    );
  } catch {
    throw new GatewayError(
      422,
      "Choose a readable, single-frame JPEG, PNG, or WebP under 40 megapixels.",
    );
  }
}

function checkOrigin(context: APIContext) {
  if (
    context.request.method !== "GET" &&
    context.request.headers.get("Origin") !== context.url.origin
  )
    throw new GatewayError(403, "This request must come from the same site.");
}

function file(form: FormData) {
  const values = form.getAll("photo");
  if (values.length > 1 || (values.length && !(values[0] instanceof File)))
    throw new GatewayError(422, "Choose a single photo.");
  const photo = values[0];
  if (!(photo instanceof File) || !photo.size) return null;
  if (photo.size > photoLimit) throw new GatewayError(413, "Use a photo up to 4 MB.");
  return photo;
}

export async function publicSubmission(context: APIContext) {
  try {
    if (context.request.method !== "POST") throw new GatewayError(405, "Use POST.");
    checkOrigin(context);
    const rate = await worker(context, "/limit/submission", { method: "POST", client: true });
    if (!rate.ok) return forward(rate);

    const input = await readForm(context.request);
    const photo = file(input);
    const getText = (key: string) => {
      const values = input.getAll(key);
      if (values.length > 1 || (values.length === 1 && typeof values[0] !== "string"))
        throw new GatewayError(422, "Check your contribution fields.");
      return typeof values[0] === "string" ? values[0].trim() : "";
    };
    const id = getText("id");
    const title = getText("title");
    const body = getText("body");
    const alt = photo ? getText("alt") : "";
    const folderHint = getText("folderHint");
    const visitorName = getText("visitorName");
    if (
      !new RegExp(`^${uuid}$`).test(id) ||
      title.length > 100 ||
      body.length > 5000 ||
      visitorName.length > 100 ||
      (!photo && (!title || !body)) ||
      (photo && alt.length > 500) ||
      (folderHint &&
        folderHint !== "root" &&
        !/^[A-Za-z0-9_-]{1,100}$/.test(folderHint))
    )
      throw new GatewayError(422, "Check your title, note, and image description.");
    const bytes = photo ? Buffer.from(await photo.arrayBuffer()) : null;
    const fingerprint = digest(
      JSON.stringify([
        title,
        body,
        alt,
        folderHint || null,
        visitorName || null,
        bytes ? digest(bytes) : null,
      ]),
    );
    const receipt = await worker(context, "/submission-receipt", {
      method: "POST",
      body: { id, fingerprint },
    });
    if (receipt.status !== 404) return forward(receipt);

    const normalized = new FormData();
    for (const [key, value] of Object.entries({ id, fingerprint, title, body, alt }))
      normalized.set(key, value);
    if (folderHint) normalized.set("folderHint", folderHint);
    if (visitorName) normalized.set("visitorName", visitorName);
    if (bytes) await normalizeImage(bytes, normalized);
    return forward(await worker(context, "/submissions", { method: "POST", body: normalized }));
  } catch (error) {
    return gatewayFailure(error);
  }
}

export async function adminApi(context: APIContext) {
  try {
    checkOrigin(context);
    const { request } = context;
    const path = (context.params.route ?? "").replace(/\/$/, "");
    switch (`${request.method} ${path}`) {
      case "POST login":
        return await signIn(context, await readJson(request));
      case "POST logout":
        return await signOut(context);
      case "POST password":
        return await changePassword(context, await readJson(request));
      case "GET wall/draft":
        return forward(await worker(context, "/draft"));
      case "PUT wall/draft":
        return forward(
          await worker(context, "/draft", {
            method: "PUT",
            body: await readJson(request, 1_510_000),
          }),
        );
      case "POST wall/publish":
      case "POST wall/reset":
        return forward(
          await worker(context, `/${path.slice(5)}`, {
            method: "POST",
            body: await readJson(request),
          }),
        );
      case "GET wall/submissions": {
        const query = new URLSearchParams();
        for (const name of ["status", "cursor"]) {
          const value = context.url.searchParams.get(name);
          if (value !== null) query.set(name, value);
        }
        return forward(await worker(context, `/submissions?${query}`));
      }
      case "POST wall/media": {
        const authorized = await worker(context, "/session");
        if (!authorized.ok) return forward(authorized);
        const photo = file(await readForm(request));
        if (!photo) throw new GatewayError(422, "Choose a photo.");
        const body = new FormData();
        await normalizeImage(Buffer.from(await photo.arrayBuffer()), body);
        return forward(await worker(context, "/media", { method: "POST", body }));
      }
    }

    const route = path.startsWith("wall/") ? path.slice(5) : "";
    if (request.method === "GET" && imagePath.test(route))
      return forward(await worker(context, `/${route}`));
    if (request.method === "POST" && reviewPath.test(route))
      return forward(
        await worker(context, `/${route}`, { method: "POST", body: await readJson(request) }),
      );
    throw new GatewayError(404, "Route not found.");
  } catch (error) {
    return gatewayFailure(error);
  }
}
