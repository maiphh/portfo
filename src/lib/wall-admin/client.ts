export class OwnerApiError extends Error {
  constructor(
    readonly status: number,
    readonly data: Record<string, unknown>,
    retry?: string | null,
  ) {
    super(
      `${typeof data.error === "string" ? data.error : "The request failed."}${retry ? ` Retry in ${retry} seconds.` : ""}`,
    );
  }

  get fields() {
    return this.data.fields as Record<string, string> | undefined;
  }
}

export function apiMessage(error: unknown) {
  return error instanceof OwnerApiError ? error.message : "Unable to connect. Please try again.";
}

export async function ownerRequest<T = void>(
  path: string,
  { json, ...init }: RequestInit & { json?: Record<string, unknown> } = {},
): Promise<T> {
  const result = await fetch(path, {
    ...init,
    ...(json && { body: JSON.stringify(json), headers: { "Content-Type": "application/json" } }),
  });
  if (!result.ok) {
    const data = await result.json().catch(() => ({}));
    throw new OwnerApiError(result.status, data, result.headers.get("Retry-After"));
  }
  return result.status === 204 ? (undefined as T) : result.json();
}
