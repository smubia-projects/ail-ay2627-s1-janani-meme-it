# Meme-it
### AI-Powered Personalized Meme & Sticker Pack Generator

**Your face. Your memes.**

Meme-it is an AI-powered web application that transforms personal photos into funny, customized memes and downloadable stickers.

**Hackathon:** AI Lodge Hackathon 2026  
**Track:** Projects for Daily Life

**Live Demo (AI Lodge):** https://ail-ay2627-s1-janani-meme-it.vercel.app

**GitHub Repository:** https://github.com/smubia-projects/ail-ay2627-s1-janani-meme-it (original: https://github.com/jananij2025-blip/Meme-it)

---

## 1. Problem Statement

Memes and stickers are a popular way to communicate online, but creating personalized ones often requires editing software, creativity, and time.

Most meme generators rely on existing templates rather than allowing users to easily turn their own photos into expressive stickers.

Meme-it addresses this by combining AI-powered caption generation with automated image editing, allowing users to create personalized memes without design experience.

## 2. Solution Overview

Meme-it is a web application that transforms uploaded photos into personalized meme stickers.

Users upload a photo, select a theme, generate AI-powered captions, customize their favourite caption, and create a transparent PNG sticker.

Users can also organize their creations into sticker packs and download them as ZIP files.

The application aims to make personalized meme creation accessible, quick, and enjoyable.

## 3. Key Features

### Photo Upload and People Detection
- Upload JPG, PNG, or WebP images.
- Detect people in uploaded photos.
- Choose to feature one person or everyone in a group photo.

### AI-Powered Meme Generation
- Generate five meme caption suggestions.
- Choose from Work, Relationships, Life, Tech, and other themes.
- Enter custom themes.
- Pick from theme ideas or your recent custom themes (remembered in your browser).

### Meme Customization
- Select a favourite AI-generated caption.
- Edit captions before creating stickers.
- Customize character labels for group photos.

### Automatic Sticker Creation
- Remove image backgrounds using AI.
- Generate transparent PNG stickers.
- Download individual stickers.

### Sticker Pack Builder
- Collect up to 12 stickers.
- Rearrange or remove stickers.
- Download packs containing 6–12 stickers as ZIP files.

### Personalized Experience
- Recent custom themes are saved in your browser (localStorage) and offered again.
- "Find my memes" avoids repeating captions you have already seen for the same photo.

## 4. AI Integration

Meme-it integrates AI into two main parts of its workflow.

**Multimodal Meme Caption Generation**

Gemini (`gemini-3.1-flash-lite` by default), accessed through apiyi, processes the uploaded image together with the selected theme to generate contextually relevant meme captions.

The model can interpret visual context, including expressions, poses, and situations, although it is not a dedicated facial-expression classifier.

**AI Background Removal**

Meme-it uses the `@imgly/background-removal` library to remove image backgrounds directly in the user's browser.

This enables the creation of transparent stickers while reducing server-side processing requirements.

**Personalization**

Theme history stays in the user's browser. The public demo has no accounts or database.

## 5. External Tools, Technologies and Datasets

| Technology | Purpose |
|---|---|
| React | Frontend user interface |
| TypeScript | Frontend application logic |
| Vite | Frontend build tool |
| Python | Backend programming |
| FastAPI | Backend API |
| Gemini via OpenRouter | AI-powered caption generation |
| @imgly/background-removal | Browser-based AI background removal (AGPL-3.0) |
| JSZip | Sticker pack ZIP downloads |
| Vercel | Frontend hosting |
| Google Cloud Run | Backend hosting |
| Upstash Redis | Shared AI Lodge rate limiting |
| GitHub | Source code management |

**Datasets:** No custom training dataset is required for the core caption-generation and background-removal workflow. The application uses pretrained AI models.

## 6. Installation and Setup

### Prerequisites

- Node.js and npm
- Python 3.11+
- An OpenRouter API key

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env             # then set API_KEY
uvicorn main:app --reload --port 8000
```

The API runs at `http://localhost:8000` (`GET /api/health` returns `{"status": "ok", ...}`).
Rate limiting is disabled locally when the Upstash variables are empty.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The frontend calls `VITE_API_BASE` (default `http://localhost:8000`);
see `frontend/.env.example`.

### API

| Route | Purpose |
|---|---|
| `GET /api/health` | Health check |
| `POST /api/generate-captions` | One vision LLM call: people count + five captions (rate-limited, bucket `captions`) |
| `POST /api/prepare-image` | Validates and resizes an image (no LLM; not used by the current UI) |

The API is stateless: it stores no photos, captions or user data.

**Security:** Never commit actual API keys, service-role credentials, or `.env` files to GitHub.

## 7. AI Safety and Limitations

Meme-it has several important considerations for responsible AI use.

### Image Privacy
Users upload personal photos, which may contain identifiable people. Images should only be uploaded with appropriate permission.

The caption-generation workflow sends a downscaled copy of the uploaded image to the backend and on to an AI model provider through OpenRouter. The backend does not store images, and the app shows this notice next to the upload box. Background removal runs locally in the browser.

### AI-Generated Content
AI-generated captions may occasionally be inaccurate, irrelevant, or inappropriate.

Users can review, select, and edit captions before generating stickers. This human review is helpful but does not replace automated content moderation.

### Image Processing Limitations
Background removal may produce imperfect results with complex backgrounds, overlapping people, or poor lighting.

Browser-based AI processing may also be slower on devices with limited memory or processing power.

### File Upload Restrictions
The frontend accepts JPG, PNG, and WebP images with a maximum upload size of 10 MB.

These client-side restrictions should be complemented by server-side validation.

### Reliability and Testing
During deployment, server-side background removal exceeded Render's 512 MB memory limit.

To address this, background removal was moved to the browser, reducing the backend's memory requirements during sticker creation.

The application has been manually tested through its deployed meme and sticker creation workflow. Broader automated security, content-safety, and cross-device testing remains future work.

## 8. Challenges and Solutions

**Challenge: Backend memory limitations**

Initially, background removal ran on the FastAPI backend using `rembg`. This caused memory crashes on Render's free hosting instance.

**Solution:** Moved AI background removal to the browser using `@imgly/background-removal`, allowing sticker creation without sending images to the backend for cutout processing.

This experience highlighted the importance of designing AI applications around deployment constraints.

## 9. Future Improvements

- Short and normal caption length options.
- More personalized meme recommendations.
- Additional sticker styles and templates.
- Improved background removal for complex group photos.
- Stronger AI content moderation and safety testing.
- Persistent sticker-pack storage and sharing.
- Better performance on mobile devices.

## 10. Deployment (AI Lodge)

**Frontend:** Vercel, root directory `frontend/` (`vercel.json`: Vite, `npm run build`, output `dist`), env `VITE_API_BASE`.
https://ail-ay2627-s1-janani-meme-it.vercel.app

**Backend:** Google Cloud Run, built from `backend/Dockerfile` by `.github/workflows/deploy.yml` on every push to `main`.
Env vars come from the repo's `DOTENV` secret (see `backend/.env.example`).
https://ail-ay2627-s1-janani-meme-it-464725632804.asia-southeast3.run.app

AI calls are limited per visitor by the shared AI Lodge rate limiter; when the limit is reached the app shows the AI Lodge call-to-action.

---

**Built for AI Lodge Hackathon 2026.**