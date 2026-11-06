// Meme-it API client. The base URL is baked in at build time from
// VITE_API_BASE (set it in Vercel to the Cloud Run URL of backend/).
export const API_BASE = (
  import.meta.env.VITE_API_BASE || "http://localhost:8000"
).replace(/\/+$/, "");

type ErrorBody = { detail?: unknown };

function detailMessage(body: ErrorBody, fallback: string): string {
  const detail = body.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail) {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}

// POST multipart form data to the API and return the parsed JSON body.
export async function postForm<T>(
  path: string,
  formData: FormData,
  signal: AbortSignal
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: formData,
    signal,
    cache: "no-store",
  });

  let body: ErrorBody & Record<string, unknown> = {};
  try {
    body = await response.json();
  } catch {
    // Non-JSON body: handled by the status check below.
  }

  if (!response.ok) {
    throw new Error(detailMessage(body, "Could not generate your memes."));
  }
  return body as T;
}
