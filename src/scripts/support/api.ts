import type { Attempt } from "./state";
export function secret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function request<T>(
  base: string,
  path: string,
  options: { body?: unknown; attempt?: Attempt } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.attempt) headers.Authorization = `Bearer ${options.attempt.key}`;
  const response = await fetch(`${base}/api/support/${path}`, {
    method: options.body === undefined ? "GET" : "POST",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "unavailable");
  return result as T;
}
