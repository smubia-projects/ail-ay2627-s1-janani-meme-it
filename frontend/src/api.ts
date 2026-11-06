// Meme-it API client. The base URL is baked in at build time from
// VITE_API_BASE (set it in Vercel to the Cloud Run URL of backend/).
//
// Responses from the shared rate-limit engine become window events that
// components/QuotaModals.tsx turns into modals:
//  - 429 -> RATE_LIMIT_EVENT with detail.queries_used (the AI Lodge CTA)
//  - 503 -> DEMO_PAUSED_EVENT with the body's message ("demo paused" notice)
export const API_BASE = (
  import.meta.env.VITE_API_BASE || "http://localhost:8000"
).replace(/\/+$/, "");

export const RATE_LIMIT_EVENT = "ail-ay2627-s1-janani-meme-it:rate-limit";
export const DEMO_PAUSED_EVENT = "ail-ay2627-s1-janani-meme-it:demo-paused";

/** HTTP 429: this visitor used up the demo's AI requests. */
export class RateLimitError extends Error {
  readonly queriesUsed: number;
  constructor(queriesUsed: number) {
    super("You've reached this demo's limit for AI memes.");
    this.queriesUsed = queriesUsed;
  }
}

/** HTTP 503 from the kill switch: the operators paused the demo. */
export class DemoPausedError extends Error {}

/** True for the two errors shown as modals, so pages skip the inline error. */
export const isQuotaError = (error: unknown) =>
  error instanceof RateLimitError || error instanceof DemoPausedError;

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

  if (response.status === 429) {
    const detail = body.detail as { queries_used?: unknown } | undefined;
    const used =
      detail && typeof detail === "object" && typeof detail.queries_used === "number"
        ? detail.queries_used
        : 0;
    window.dispatchEvent(new CustomEvent(RATE_LIMIT_EVENT, { detail: { queriesUsed: used } }));
    throw new RateLimitError(used);
  }
  if (response.status === 503) {
    const message = detailMessage(body, "This demo is temporarily paused. Check back soon.");
    window.dispatchEvent(new CustomEvent(DEMO_PAUSED_EVENT, { detail: { message } }));
    throw new DemoPausedError(message);
  }
  if (!response.ok) {
    throw new Error(detailMessage(body, "Could not generate your memes."));
  }
  return body as T;
}
