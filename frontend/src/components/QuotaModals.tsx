import { useEffect, useState } from "react";
import { DEMO_PAUSED_EVENT, RATE_LIMIT_EVENT } from "../api";
import { DemoPausedNotice, RateLimitCTA } from "./RateLimitCTA";

/**
 * Listens for the events src/api.ts dispatches and shows the AI Lodge
 * rate-limit CTA (429) or the distinct "demo paused" notice (503).
 */
export function QuotaModals() {
  const [limited, setLimited] = useState<number | null>(null);
  const [paused, setPaused] = useState<string | null>(null);

  useEffect(() => {
    const onLimit = (e: Event) =>
      setLimited((e as CustomEvent<{ queriesUsed: number }>).detail.queriesUsed);
    const onPaused = (e: Event) =>
      setPaused((e as CustomEvent<{ message: string }>).detail.message);
    window.addEventListener(RATE_LIMIT_EVENT, onLimit);
    window.addEventListener(DEMO_PAUSED_EVENT, onPaused);
    return () => {
      window.removeEventListener(RATE_LIMIT_EVENT, onLimit);
      window.removeEventListener(DEMO_PAUSED_EVENT, onPaused);
    };
  }, []);

  if (paused !== null) return <DemoPausedNotice message={paused} onDismiss={() => setPaused(null)} />;
  if (limited !== null) return <RateLimitCTA queriesMade={limited} onDismiss={() => setLimited(null)} />;
  return null;
}
