# Design Studio (Teeco)

Vacation-rental interior-design automation. Takes a process that costs a designer ~80 hours and compresses it into same-day client deliverables.

The app turns a floor plan + a few inputs into Teeco's three client artifacts:

1. **Design Presentation** — client-facing brochure / concept package
2. **Install Guide** — cover, how-to pages, full floor plan with an Art/Mirror/TV color key, and per-room boards (AI render + mini floor-plan inset + tips)
3. **Masterlist** — multi-sheet `.xlsx` (Common, Bedrooms, Kitchen, Baths, Consumables, Exterior, Budget Tally) with sources, quantities, and costs

---

## Quick start

```bash
npm install
cp .env.example .env.local   # then add your GEMINI_API_KEY (see below)
npm run dev                  # runs on http://localhost:3100
```

The app runs immediately in **offline mode** (localStorage only) — you can create projects, parse floor plans (OCR runs in-browser), plan space, and export the Masterlist with **no keys at all**. The one thing that needs a key is **AI image generation** (room renders / scene studio).

---

## Environment variables

Copy `.env.example` → `.env.local` and fill in what you need.

| Variable | Required? | What it powers |
|---|---|---|
| `GEMINI_API_KEY` | **Required for AI renders** | All image/vision AI: scene generation, room renders, item sourcing from a scene, cutouts, backdrop edits. This is the **"nano banana"** key (Google AI Studio → Gemini API key). |
| `GEMINI_IMAGE_MODEL` | Optional | Pin a specific image model. Defaults to a fallback chain: `gemini-3-pro-image` (Nano Banana 2) → `gemini-2.5-flash-image` (Nano Banana 1) → Imagen. Set this only if you want to force one. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | Multi-user: auth, shared projects, realtime, image storage. **Without these the app falls back to localStorage** — fine for solo/local use. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Server-side Supabase ops (only if using Supabase). |
| `MATTERPORT_TOKEN_ID` / `MATTERPORT_TOKEN_SECRET` / `MATTERPORT_ENDPOINT` | Optional | Only if importing a Matterport 3D scan. You can skip this and just upload a floor-plan image instead. |

**Not used:** there is no Anthropic or OpenAI dependency. All AI runs on Gemini.

### Getting a Gemini ("nano banana") key
1. Go to [aistudio.google.com](https://aistudio.google.com/) → **Get API key**.
2. Make sure the key's project has the **Gemini API** enabled and image-generation models available.
3. Put it in `.env.local` as `GEMINI_API_KEY=...` and restart `npm run dev`.
4. Verify it's live: the app has a health check at `/api/check-gemini` (and the UI surfaces Gemini status).

---

## How the workflow runs

The project workspace is organized as a sequence of hubs (see `src/components/*Hub.tsx` and `src/lib/ai-workflow.ts`):

1. **Floor plan → Rooms** — upload a plan; in-browser OCR (`lib/floor-plan-ocr.ts`) reads room labels + dimensions. Anchor the living/dining room; other rooms inherit style.
2. **Sleep plan** — algorithm maximizes guest capacity (bunks, primary-suite comfort, room dims).
3. **Design / Concept** — pick a style; mood/concept direction.
4. **Items** — pick furniture (catalog + sourced products); selecting an item places it on the space plan.
5. **AI Scene Studio** — generate photoreal room renders via Gemini, source real buyable items from the scene.
6. **Review → Order → Install → Deliver** — assemble and hand the three deliverables to the client.

Each step tracks `manualHours` (what it costs by hand) vs `estimatedMinutes` (automated) — that's the "80 hours → one day" math, in code.

---

## Tech stack

- Next.js 14 (App Router) · TypeScript · Tailwind CSS
- Gemini API (image + vision) for all AI
- Supabase (optional: auth, DB, realtime, storage) with a localStorage fallback
- Tesseract.js for in-browser floor-plan OCR
- `exceljs` for the Masterlist `.xlsx`

## Project structure

```
src/
├── app/
│   ├── api/            # Gemini routes: generate-scene, source-from-scene, generate-cutout,
│   │                   #   strip-scene, extract-items, check-gemini, matterport, etc.
│   └── projects/       # new · [id] (workspace) · install-guide · print
├── components/         # *Hub.tsx workflow steps, SpacePlanner, AiSceneStudio, RoomDesigner, …
└── lib/                # ai-workflow, masterlist-export, floor-plan-ocr, space-planning,
                        #   furniture-catalog, store (localStorage+Supabase), types, …
supabase/
└── migrations/         # SQL schema + RLS (only needed if using Supabase)
```

## Deploy (Vercel)

1. Import the repo in [vercel.com](https://vercel.com).
2. Add env vars (`GEMINI_API_KEY` at minimum; Supabase if multi-user).
3. Deploy. Currently live at `designers.teeco.co`.

## Notes for a new contributor

- **Start without keys** to learn the flow — create a project, parse a floor plan, plan the space, export a Masterlist. Then add `GEMINI_API_KEY` to unlock renders.
- Dev gotcha: hard-reloading a route mid-compile can throw a one-off `ChunkLoadError`. Just reload; if it sticks, `rm -rf .next` and restart.
- State lives in `lib/store.ts` — it transparently uses Supabase when configured, localStorage otherwise.
