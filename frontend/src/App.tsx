import { removeBackground } from "@imgly/background-removal";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import JSZip from "jszip";
import ThemeRecommendations from "./ThemeRecommendations";
import { isQuotaError, postForm } from "./api";
import { QuotaModals } from "./components/QuotaModals";
import { recordThemeGeneration, themeLabel } from "./recommendations";
import { createSticker } from "./sticker";
import {
  createMultiPersonSticker,
  isolateSelectedPerson,
  type StickerCharacter,
} from "./multiPersonSticker";
import "./App.css";
import "./StickerPack.css";
import "./TwoPerson.css";
type Theme =
  | "Work"
  | "Relationships"
  | "Life"
  | "Tech"
  | "Surprise Me"
  | "Custom Theme";
type Person = {
  person_index: number;
  x: number;
  y: number;
};
type Meme = {
  caption: string;
  characters: {
    person_index: number;
    label: string;
  }[];
};
type APIResponse = {
  people_count: number;
  people: Person[];
  memes: Meme[];
  captions: string[];
};
type PackSticker = {
  id: string;
  image: string;
  caption: string;
};
type PersonMode = "everyone" | "one" | null;
const themes: Theme[] = [
  "Work",
  "Relationships",
  "Life",
  "Tech",
  "Surprise Me",
  "Custom Theme",
];
function App() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleCount, setPeopleCount] = useState<number | null>(null);
  const [personMode, setPersonMode] = useState<PersonMode>(null);
  const [selectedPerson, setSelectedPerson] = useState<number | null>(null);
  const [peopleConfirmed, setPeopleConfirmed] = useState(false);
  const [theme, setTheme] = useState<Theme>("Life");
  const [customTheme, setCustomTheme] = useState("");
  const [suggestedTheme, setSuggestedTheme] = useState<string | null>(null);
  const [memes, setMemes] = useState<Meme[]>([]);
  // Captions already shown for the current photo, per theme. Sent back so a
  // fresh generation avoids repeats (the API itself stores nothing).
  const seenCaptionsRef = useRef<Record<string, string[]>>({});
  const [selectedMeme, setSelectedMeme] = useState<number | null>(null);
  const [caption, setCaption] = useState("");
  const [characters, setCharacters] = useState<StickerCharacter[]>([]);
  const [sticker, setSticker] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [loadingCaptions, setLoadingCaptions] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pack, setPack] = useState<PackSticker[]>([]);
  const [packName, setPackName] = useState("My Meme-it Pack");
  const [downloadingPack, setDownloadingPack] = useState(false);
  const [packMessage, setPackMessage] = useState("");
  const photoRef = useRef<string | null>(null);
  const cutoutCache = useRef<string | null>(null);
  const cutoutPromise = useRef<Promise<string> | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const busy = detecting || loadingCaptions || generating;
  useEffect(() => {
    return () => {
      requestRef.current?.abort();
      if (photoRef.current) URL.revokeObjectURL(photoRef.current);
      if (cutoutCache.current) URL.revokeObjectURL(cutoutCache.current);
    };
  }, []);
  function cancelRequest() {
    requestRef.current?.abort();
    requestRef.current = null;
    setDetecting(false);
    setLoadingCaptions(false);
  }
  function clearMemeResults() {
    setMemes([]);
    setSelectedMeme(null);
    setCaption("");
    setCharacters([]);
    setSticker(null);
  }
  function allPeopleAsCharacters(): StickerCharacter[] {
    return people.map(person => ({
      person_index: person.person_index,
      label: `PERSON ${person.person_index}`,
      x: person.x,
      y: person.y,
    }));
  }
  function buildCharacters(meme: Meme): StickerCharacter[] {
    const relevant =
      personMode === "one"
        ? meme.characters.filter(
            character => character.person_index === selectedPerson
          )
        : meme.characters;
    if (personMode === "one") return [];
    return relevant.map(character => {
      const person = people.find(
        p => p.person_index === character.person_index
      );
      return {
        person_index: character.person_index,
        label: character.label,
        x: person?.x ?? 0.5,
        y: person?.y ?? 0.35,
      };
    });
  }
async function requestMemes(
  file: File,
  selectedTheme: Theme,
  custom: string,
  signal: AbortSignal,
  fresh: boolean = true
): Promise<APIResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("theme", selectedTheme);
  formData.append(
    "custom_theme",
    selectedTheme === "Custom Theme" ? custom.trim() : ""
  );
  // Tell the backend whether to generate new captions.
  formData.append("fresh", String(fresh));
  if (fresh) {
    formData.append(
      "previous_captions",
      JSON.stringify(seenCaptionsRef.current[captionKey(selectedTheme, custom)] ?? [])
    );
  }
  const data = await postForm<APIResponse>(
    "/api/generate-captions",
    formData,
    signal
  );
  if (
    !Number.isInteger(data.people_count) ||
    !Array.isArray(data.people) ||
    !Array.isArray(data.memes) ||
    data.memes.length !== 5
  ) {
    throw new Error("The photo results were incomplete.");
  }
  return data;
}
async function detectPeople(file: File) {
  const controller = new AbortController();
  requestRef.current = controller;
  setDetecting(true);
  setError("");
  setStatus("");
  try {
    // Reuse the existing endpoint to detect people.
    // Do not force fresh meme generation during detection.
    const data = await requestMemes(
      file,
      "Life",
      "",
      controller.signal,
      false
    );
    if (controller.signal.aborted) return;
    rememberCaptions("Life", "", data.captions);
    setPeople(data.people);
    setPeopleCount(data.people_count);
    if (data.people_count <= 1) {
      setPersonMode("one");
      setSelectedPerson(data.people[0]?.person_index ?? 1);
      setPeopleConfirmed(true);
    } else {
      setPersonMode(null);
      setSelectedPerson(null);
      setPeopleConfirmed(false);
    }
  } catch (err) {
    if (controller.signal.aborted) return;
    // 429 / 503 are shown as modals by <QuotaModals />.
    if (isQuotaError(err)) return;
    setError(
      err instanceof Error
        ? err.message
        : "Could not check your photo."
    );
  } finally {
    if (requestRef.current === controller) {
      requestRef.current = null;
      setDetecting(false);
    }
  }
}
  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Please upload a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Maximum file size is 10 MB.");
      return;
    }
    cancelRequest();
    if (photoRef.current) URL.revokeObjectURL(photoRef.current);
    if (cutoutCache.current) URL.revokeObjectURL(cutoutCache.current);
    cutoutCache.current = null;
    cutoutPromise.current = null;
    seenCaptionsRef.current = {};
    const url = URL.createObjectURL(file);
    photoRef.current = url;
    setPhoto(url);
    setOriginalFile(file);
    setPeople([]);
    setPeopleCount(null);
    setPersonMode(null);
    setSelectedPerson(null);
    setPeopleConfirmed(false);
    setTheme("Life");
    setSuggestedTheme(null);
    setCustomTheme("");
    clearMemeResults();
    setError("");
    setStatus("");
    void detectPeople(file);
  }
  function chooseMode(mode: PersonMode) {
    setPersonMode(mode);
    setSelectedPerson(null);
    setPeopleConfirmed(false);
    clearMemeResults();
  }
  function confirmPeople() {
    if (personMode === "one" && selectedPerson === null) {
      setError("Choose a person first.");
      return;
    }
    if (!personMode) return;
    setPeopleConfirmed(true);
    setError("");
    clearMemeResults();
  }
  function changeTheme(value: Theme) {
    cancelRequest();
    setTheme(value);
    setSuggestedTheme(null);
    clearMemeResults();
    setError("");
    setStatus("");
  }
  function chooseSuggestedTheme(suggestion: string) {
    if (busy) return;
    cancelRequest();
    setTheme("Custom Theme");
    setCustomTheme(suggestion.slice(0, 100));
    setSuggestedTheme(suggestion.slice(0, 100));
    clearMemeResults();
    setError("");
    setStatus("");
  }
  function updateCharacterLabel(personIndex: number, label: string) {
    setCharacters(current =>
      current.map(character =>
        character.person_index === personIndex
          ? { ...character, label }
          : character
      )
    );
    setSticker(null);
  }
  function captionKey(selectedTheme: Theme, custom: string) {
    return themeLabel(selectedTheme, custom).toLowerCase();
  }
  function rememberCaptions(selectedTheme: Theme, custom: string, captions: string[]) {
    const key = captionKey(selectedTheme, custom);
    const seen = seenCaptionsRef.current[key] ?? [];
    seenCaptionsRef.current[key] = [...seen, ...captions].slice(-60);
  }
  function trackSuccessfulGeneration(data: APIResponse) {
    // Remember captions and the theme in this browser only.
    rememberCaptions(theme, customTheme, data.captions);
    recordThemeGeneration(theme, customTheme);
  }
  function chooseMeme(index: number) {
    const meme = memes[index];
    if (!meme) return;
    setSelectedMeme(index);
    setCaption(meme.caption);
    setCharacters(buildCharacters(meme));
    setSticker(null);
    setError("");
    setStatus("");
  }
async function generateMemes() {
  if (!originalFile || !peopleConfirmed || busy) return;
  if (theme === "Custom Theme" && !customTheme.trim()) {
    setError("Enter your custom theme first.");
    return;
  }
  const controller = new AbortController();
  requestRef.current = controller;
  setLoadingCaptions(true);
  setError("");
  setStatus("");
  clearMemeResults();
  try {
    const data = await requestMemes(
      originalFile,
      theme,
      customTheme,
      controller.signal,
      true // Request fresh meme captions
    );
    if (controller.signal.aborted) return;
    setMemes(data.memes);
    setSelectedMeme(0);
    setCaption(data.memes[0].caption);
    setCharacters(buildCharacters(data.memes[0]));
    setStatus("Your memes are ready!");
    // Only the explicit successful generation counts, never photo detection.
    trackSuccessfulGeneration(data);
  } catch (err) {
    if (controller.signal.aborted) return;
    if (isQuotaError(err)) return;
    setError(
      err instanceof Error
        ? err.message
        : "Could not find your memes."
    );
  } finally {
    if (requestRef.current === controller) {
      requestRef.current = null;
      setLoadingCaptions(false);
    }
  }
}
  
async function getCutout(file: File): Promise<string> {
  if (cutoutCache.current) return cutoutCache.current;
  if (cutoutPromise.current) return cutoutPromise.current;

  const pending = (async () => {
    const blob = await removeBackground(file);
    const url = URL.createObjectURL(blob);

    if (originalFile === file) {
      cutoutCache.current = url;
    }

    return url;
  })();

  cutoutPromise.current = pending;

  try {
    return await pending;
  } finally {
    if (cutoutPromise.current === pending) {
      cutoutPromise.current = null;
    }
  }
}

  async function createMemeSticker() {
    if (!originalFile || !caption.trim() || busy) return;
    if (
      personMode === "everyone" &&
      characters.some(character => !character.label.trim())
    ) {
      setError("Enter every character name.");
      return;
    }
    setGenerating(true);
    setSticker(null);
    setError("");
    setStatus("");
    try {
      const cutoutUrl = await getCutout(originalFile);
      let result: string;
      if (personMode === "everyone" && characters.length > 0) {
        result = await createMultiPersonSticker(
          cutoutUrl,
          caption,
          characters
        );
      } else if (
        personMode === "one" &&
        selectedPerson !== null &&
        peopleCount !== null &&
        peopleCount > 1
      ) {
        const selected = people.find(
          person => person.person_index === selectedPerson
        );
        if (!selected) {
          throw new Error("Selected person was not found.");
        }
        const isolated = await isolateSelectedPerson(
          cutoutUrl,
          {
            ...selected,
            label: "",
          },
          allPeopleAsCharacters()
        );
        result = await createSticker(isolated, caption);
      } else {
        result = await createSticker(cutoutUrl, caption);
      }
      setSticker(result);
      setStatus("Your sticker is ready!");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not create your sticker."
      );
    } finally {
      setGenerating(false);
    }
  }
  function addToPack() {
    if (!sticker || pack.length >= 12) return;
    if (pack.some(item => item.image === sticker)) {
      setPackMessage("This sticker is already in your pack.");
      return;
    }
    setPack(current => [
      ...current,
      {
        id: crypto.randomUUID(),
        image: sticker,
        caption: caption.trim(),
      },
    ]);
    setPackMessage("Sticker added!");
  }
  function removeSticker(id: string) {
    setPack(current => current.filter(item => item.id !== id));
    setPackMessage("Sticker removed.");
  }
  function moveSticker(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= pack.length) return;
    setPack(current => {
      const updated = [...current];
      [updated[index], updated[target]] = [
        updated[target],
        updated[index],
      ];
      return updated;
    });
  }
  async function downloadPack() {
    if (pack.length < 6 || downloadingPack) return;
    setDownloadingPack(true);
    setPackMessage("Preparing your pack...");
    try {
      const zip = new JSZip();
      const folder = zip.folder("stickers");
      if (!folder) {
        throw new Error("Could not create ZIP folder.");
      }
      for (let i = 0; i < pack.length; i++) {
        const response = await fetch(pack[i].image);
        if (!response.ok) {
          throw new Error("Could not read a sticker.");
        }
        folder.file(
          `sticker-${String(i + 1).padStart(2, "0")}.png`,
          await response.blob()
        );
      }
      zip.file(
        "README.txt",
        `${packName}\n${pack.length} stickers\nMade with Meme-it`
      );
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename =
        packName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "meme-it-pack";
      link.href = url;
      link.download = `${filename}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPackMessage("Pack downloaded!");
    } catch (err) {
      setPackMessage(
        err instanceof Error
          ? err.message
          : "Download failed."
      );
    } finally {
      setDownloadingPack(false);
    }
  }
  const alreadyAdded =
    !!sticker &&
    pack.some(item => item.image === sticker);
  return (
    <div className="app">
      <header className="navbar">
        <div className="logo">
          meme<span>it.</span>
        </div>
        <span className="nav-label">
          Your face. Your memes.
        </span>
      </header>
      <main>
        <section className="hero">
          <div className="eyebrow">
            YOUR PERSONAL MEME FACTORY
          </div>
          <h1>
            Your face deserves
            <br />
            to be a <span>meme.</span>
          </h1>
          <p>
            Upload a photo, find funny memes,
            and turn them into stickers.
          </p>
        </section>
        <div className="workspace">
          {/* STEP 1 - PHOTO */}
          <section className="section">
            <div className="section-heading">
              <span className="step">01</span>
              <div>
                <h2>Upload your photo</h2>
                <p>Choose your funniest reaction photo.</p>
              </div>
            </div>
            <label className="upload-box">
              {photo ? (
                <>
                  <img
                    src={photo}
                    alt="Uploaded photo"
                    className="uploaded-preview"
                  />
                  <span className="change-photo">
                    Click to change photo
                  </span>
                </>
              ) : (
                <>
                  <span className="upload-icon">📸</span>
                  <strong>
                    Click to upload a photo
                  </strong>
                  <span>
                    JPG, PNG or WebP · Max 10 MB
                  </span>
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleUpload}
                disabled={busy}
                hidden
              />
            </label>
            {detecting && (
              <p className="upload-success" role="status">
                Checking your photo...
              </p>
            )}
            <p className="privacy-note">
              🔒 To count people and write captions, your photo is sent to an
              AI model provider (via OpenRouter). Meme-it does not store your
              photos. Background removal and stickers are made in your browser.
            </p>
          </section>
          {/* STEP 2 - PEOPLE */}
          {photo && peopleCount !== null && !peopleConfirmed && (
            <section className="section">
              <div className="section-heading">
                <span className="step">02</span>
                <div>
                  <h2>Who's starring in this meme?</h2>
                  <p>
                    We found multiple people.
                    Who should be featured?
                  </p>
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 14,
                }}
              >
                <button
                  type="button"
                  className={`meme-theme-button ${
                    personMode === "everyone" ? "selected" : ""
                  }`}
                  onClick={() => chooseMode("everyone")}
                  style={{ padding: 20 }}
                >
                  👥 Everyone in the photo
                </button>
                <button
                  type="button"
                  className={`meme-theme-button ${
                    personMode === "one" ? "selected" : ""
                  }`}
                  onClick={() => chooseMode("one")}
                  style={{ padding: 20 }}
                >
                  👤 Just one person
                </button>
              </div>
              {personMode === "one" && (
                <div style={{ marginTop: 24 }}>
                  <h3>Choose your person</h3>
                  <p>
                    Select the person you want in your sticker.
                  </p>
                  <div
                    style={{
                      position: "relative",
                      maxWidth: 560,
                      margin: "18px auto",
                    }}
                  >
                    <img
                      src={photo}
                      alt="Choose a person"
                      style={{
                        display: "block",
                        width: "100%",
                        borderRadius: 14,
                      }}
                    />
                    {people.map(person => (
                      <button
                        key={person.person_index}
                        type="button"
                        onClick={() =>
                          setSelectedPerson(person.person_index)
                        }
                        title={`Choose person ${person.person_index}`}
                        style={{
                          position: "absolute",
                          left: `${person.x * 100}%`,
                          top: `${person.y * 100}%`,
                          transform: "translate(-50%, -50%)",
                          width: 44,
                          height: 44,
                          borderRadius: "50%",
                          border:
                            selectedPerson === person.person_index
                              ? "3px solid #ffffff"
                              : "2px solid #151515",
                          background:
                            selectedPerson === person.person_index
                              ? "#c4ff70"
                              : "#ffffff",
                          color: "#151515",
                          fontWeight: 900,
                          cursor: "pointer",
                          boxShadow: "0 2px 10px #0007",
                        }}
                      >
                        {person.person_index}
                      </button>
                    ))}
                  </div>
                  <p style={{ textAlign: "center" }}>
                    {selectedPerson !== null
                      ? `Person ${selectedPerson} selected`
                      : "Tap a numbered face to choose"}
                  </p>
                </div>
              )}
              <button
                type="button"
                className="generate-button"
                style={{ marginTop: 20 }}
                disabled={
                  !personMode ||
                  (personMode === "one" &&
                    selectedPerson === null)
                }
                onClick={confirmPeople}
              >
                Continue to themes →
              </button>
            </section>
          )}
          {/* STEP 3 - THEME */}
          {peopleConfirmed && (
            <section className="section mode-details">
              <div className="section-heading">
                <span className="step">03</span>
                <div>
                  <h2>Pick your meme theme</h2>
                  <p>What kind of humour are we going for?</p>
                </div>
              </div>
              <ThemeRecommendations
                onSelectTheme={chooseSuggestedTheme}
                disabled={busy}
              />
              {suggestedTheme && (
                <p style={{ marginBottom: 12 }}>
                  Selected theme: <strong>{suggestedTheme}</strong>
                </p>
              )}
              <div className="meme-theme-grid">
                {themes.map(item => (
                  <button
                    key={item}
                    type="button"
                    className={`meme-theme-button ${
                      theme === item && !suggestedTheme ? "selected" : ""
                    }`}
                    disabled={busy}
                    onClick={() => changeTheme(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              {theme === "Custom Theme" && !suggestedTheme && (
                <div className="meme-custom-theme">
                  <label htmlFor="custom-theme">
                    Custom theme
                  </label>
                  <input
                    id="custom-theme"
                    type="text"
                    maxLength={100}
                    value={customTheme}
                    placeholder="e.g. Office drama"
                    disabled={busy}
                    onChange={event => {
                      cancelRequest();
                      setCustomTheme(event.target.value);
                    setSuggestedTheme(null);
                      clearMemeResults();
                    }}
                  />
                </div>
              )}
              <div className="meme-suggestions-section">
                <button
                  type="button"
                  className="generate-button"
                  disabled={
                    busy ||
                    (theme === "Custom Theme" &&
                      !customTheme.trim())
                  }
                  onClick={generateMemes}
                >
                  {loadingCaptions
                    ? "Making your memes..."
                    : "Find my memes →"}
                </button>
              </div>
              {/* STEP 4 - MEME IDEAS */}
              {memes.length > 0 && (
                <div className="meme-suggestions">
                  <div className="section-heading">
                    <span className="step">04</span>
                    <div>
                      <h2>Choose your favourite meme</h2>
                      <p>Pick your favourite concept.</p>
                    </div>
                  </div>
                  {memes.map((meme, index) => (
                    <button
                      key={index}
                      type="button"
                      className={`meme-suggestion ${
                        selectedMeme === index ? "selected" : ""
                      }`}
                      disabled={busy}
                      onClick={() => chooseMeme(index)}
                      style={{
                        display: "flex",
                        gap: 12,
                        textAlign: "left",
                      }}
                    >
                      <span className="meme-suggestion-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <strong>{meme.caption}</strong>
                        {personMode === "everyone" &&
                          meme.characters.length > 0 && (
                            <small
                              style={{
                                display: "block",
                                marginTop: 6,
                                opacity: 0.7,
                              }}
                            >
                              {meme.characters
                                .map(c => c.label)
                                .join(" · ")}
                            </small>
                          )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {/* CHARACTER NAMES */}
              {memes.length > 0 &&
                personMode === "everyone" &&
                characters.length > 0 && (
                  <div className="two-person-section">
                    <div className="two-person-heading">
                      <div>
                        <h3>Character names</h3>
                        <p>
                          We'll arrange everyone automatically.
                          You can edit the names.
                        </p>
                      </div>
                    </div>
                    <div className="two-person-inputs">
                      {characters.map(character => (
                        <label key={character.person_index}>
                          Character {character.person_index}
                          <input
                            type="text"
                            maxLength={28}
                            value={character.label}
                            disabled={busy}
                            onChange={event =>
                              updateCharacterLabel(
                                character.person_index,
                                event.target.value
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              {/* STEP 5 - CAPTION */}
              {memes.length > 0 && (
                <>
                  <div
                    className="section-heading"
                    style={{ marginTop: 32 }}
                  >
                    <span className="step">05</span>
                    <div>
                      <h2>Edit your caption</h2>
                      <p>Make it yours.</p>
                    </div>
                  </div>
                  <textarea
                    className="caption-input"
                    value={caption}
                    rows={3}
                    maxLength={120}
                    disabled={busy}
                    placeholder="Your funniest caption..."
                    onChange={event => {
                      setCaption(event.target.value);
                      setSticker(null);
                    }}
                  />
                  <div className="character-count">
                    {caption.length}/120 characters
                  </div>
                  <section className="generate-section">
                    <button
                      type="button"
                      className="generate-button"
                      disabled={
                        !caption.trim() ||
                        busy ||
                        (personMode === "everyone" &&
                          characters.some(
                            character => !character.label.trim()
                          ))
                      }
                      onClick={createMemeSticker}
                    >
                      {generating
                        ? "Putting it together..."
                        : "Create my sticker →"}
                    </button>
                  </section>
                </>
              )}
            </section>
          )}
          {status && !busy && (
            <p className="upload-success" role="status">
              {status}
            </p>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {/* RESULT */}
          {sticker && (
            <section className="result-section">
              <div className="result-heading">
                <span>✨</span>
                <div>
                  <h2>Your sticker is ready!</h2>
                  <p>Transparent PNG reaction sticker.</p>
                </div>
              </div>
              <div className="sticker-display">
                <img
                  src={sticker}
                  alt="Generated meme sticker"
                  className="sticker-preview"
                />
              </div>
              <a
                href={sticker}
                download="meme-it-sticker.png"
                className="download-button"
              >
                ↓ Download PNG
              </a>
              <button
                type="button"
                className="pack-add-button"
                onClick={addToPack}
                disabled={
                  pack.length >= 12 ||
                  alreadyAdded
                }
              >
                {alreadyAdded
                  ? "✓ Added to sticker pack"
                  : pack.length >= 12
                  ? "Pack full"
                  : "+ Add to sticker pack"}
              </button>
              <p className="result-note">
                512 × 512 PNG · Transparent background
              </p>
            </section>
          )}
          {/* STICKER PACK */}
          <section className="section sticker-pack-section">
            <div className="section-heading">
              <span className="step">06</span>
              <div>
                <h2>Your sticker pack</h2>
                <p>
                  Collect 6–12 stickers and download a ZIP.
                </p>
              </div>
            </div>
            <div className="pack-header">
              <label
                className="pack-name-label"
                htmlFor="pack-name"
              >
                Pack name
                <input
                  id="pack-name"
                  type="text"
                  maxLength={60}
                  value={packName}
                  onChange={event =>
                    setPackName(event.target.value)
                  }
                />
              </label>
              <strong className="pack-counter">
                {pack.length}/12 stickers
              </strong>
            </div>
            <div
              className="pack-progress"
              role="progressbar"
              aria-label="Sticker pack progress"
              aria-valuemin={0}
              aria-valuemax={12}
              aria-valuenow={pack.length}
            >
              <div
                className="pack-progress-fill"
                style={{
                  width: `${(pack.length / 12) * 100}%`,
                }}
              />
            </div>
            {pack.length === 0 ? (
              <p className="pack-empty">
                Create a sticker and add it to your pack.
              </p>
            ) : (
              <div className="pack-gallery">
                {pack.map((item, index) => (
                  <article
                    className="pack-item"
                    key={item.id}
                  >
                    <img
                      src={item.image}
                      alt={`Sticker ${index + 1}`}
                    />
                    <p title={item.caption}>
                      {item.caption}
                    </p>
                    <div className="pack-item-controls">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() =>
                          moveSticker(index, -1)
                        }
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        disabled={
                          index === pack.length - 1
                        }
                        onClick={() =>
                          moveSticker(index, 1)
                        }
                      >
                        →
                      </button>
                      <button
                        type="button"
                        className="pack-remove"
                        onClick={() =>
                          removeSticker(item.id)
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <button
              type="button"
              className="generate-button pack-download-button"
              disabled={
                pack.length < 6 ||
                downloadingPack
              }
              onClick={downloadPack}
            >
              {downloadingPack
                ? "Preparing your pack..."
                : `↓ Download Pack (ZIP) — ${pack.length}/12`}
            </button>
            <p className="pack-hint">
              {pack.length < 6
                ? `Add ${6 - pack.length} more stickers to unlock ZIP download.`
                : "Your pack is ready!"}
            </p>
            {packMessage && (
              <p
                className="pack-message"
                role="status"
              >
                {packMessage}
              </p>
            )}
            <p className="pack-hint">
              Sticker packs are temporary and reset
              when you refresh the page.
            </p>
          </section>
        </div>
      </main>
      <footer>
        Made for the chronically online ✦ Meme-it
      </footer>
      <QuotaModals />
    </div>
  );
}
export default App;
