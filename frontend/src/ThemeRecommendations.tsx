import { useState } from "react";
import { getThemeHistory, pickThemeIdeas } from "./recommendations";

type Props = {
  onSelectTheme: (theme: string) => void;
  disabled?: boolean;
};

// Theme suggestions from this browser's own history (no server, no account).
export default function ThemeRecommendations({
  onSelectTheme,
  disabled = false,
}: Props) {
  // Read on every render so a new generation shows up straight away.
  const recent = getThemeHistory().slice(0, 6);
  const [ideas, setIdeas] = useState<string[]>(() => pickThemeIdeas(getThemeHistory()));

  function newIdeas() {
    if (disabled) return;
    setIdeas(pickThemeIdeas(getThemeHistory()));
  }

  function renderTopics(topics: string[]) {
    return (
      <div className="meme-theme-grid">
        {topics.map((topic, index) => (
          <button
            key={`${topic}-${index}`}
            type="button"
            className="meme-theme-button"
            disabled={disabled}
            onClick={() => onSelectTheme(topic)}
            title={`Use ${topic} as your meme theme`}
          >
            {topic}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 24, marginBottom: 24, display: "grid", gap: 18 }}>
      {recent.length > 0 && (
        <section style={{ padding: 20, border: "1px solid rgba(128,128,128,0.3)", borderRadius: 16 }}>
          <h3 style={{ marginTop: 0 }}>🕘 Your recent themes</h3>
          <p style={{ opacity: 0.75 }}>Saved in this browser only.</p>
          {renderTopics(recent)}
        </section>
      )}

      <section style={{ padding: 20, border: "1px solid rgba(128,128,128,0.3)", borderRadius: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>✨ Theme ideas</h3>
          <button type="button" className="meme-theme-button" disabled={disabled} onClick={newIdeas}>
            ↻ New ideas
          </button>
        </div>
        <p style={{ opacity: 0.75 }}>Tap one to use it as a custom theme.</p>
        {renderTopics(ideas)}
      </section>
    </div>
  );
}
