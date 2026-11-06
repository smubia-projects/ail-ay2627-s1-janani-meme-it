// Theme suggestions kept entirely in this browser (localStorage).
// The public demo has no accounts or database, so "recent themes" are the
// themes this visitor generated memes for, most recent first.

const HISTORY_KEY = "ail-ay2627-s1-janani-meme-it:theme-history";
const MAX_HISTORY = 12;

// Starter ideas shown before the visitor has any history.
export const THEME_IDEAS = [
  "Office Lunches",
  "Exam Stress",
  "Group Projects",
  "Dating Apps",
  "Debugging",
  "Family Gatherings",
  "Monday Mornings",
  "Gym Motivation",
  "Online Shopping",
  "Group Chats",
  "Deadlines",
  "Weekend Plans",
];

export function themeLabel(theme: string, customTheme: string): string {
  return (theme === "Custom Theme" ? customTheme : theme).trim().slice(0, 100);
}

export function getThemeHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

// Only custom themes are remembered; the built-in ones always have a button.
export function recordThemeGeneration(theme: string, customTheme: string): void {
  if (theme !== "Custom Theme") return;
  const label = themeLabel(theme, customTheme);
  if (!label) return;
  const history = getThemeHistory().filter(
    item => item.toLowerCase() !== label.toLowerCase()
  );
  history.unshift(label);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {
    // Storage full or blocked: suggestions just won't remember this theme.
  }
}

export function pickThemeIdeas(exclude: string[], count = 6): string[] {
  const skip = new Set(exclude.map(item => item.toLowerCase()));
  const pool = THEME_IDEAS.filter(item => !skip.has(item.toLowerCase()));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
