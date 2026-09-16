# Five Poses v2

Five-shot fashion e-commerce image generation with pattern-locked references.

Generation runs on three providers:

- **GPT Image 2.5** (OpenAI) — `gpt-image-2.5-sunburst` is the default engine.
  Released 8 September 2026, it is OpenAI's most capable model for image editing
  and the strongest of the three at changing one thing while leaving the rest of
  the frame untouched. `gpt-image-2.5-flare` is the same family at roughly half
  the latency, for volume runs and quick tests.
- **Seedream 4.5** (ByteDance, via fal) — strong print, weave and check retention.
- **Nano Banana** (Google Gemini image models) — highest fidelity on micro-prints
  and fine lettering, and a useful second opinion when the default drifts.

All three are kept so the same references and prompt can be compared side by
side, and so a misbehaving engine is a dropdown change rather than a rebuild.

---

## What is different from v1

- **Pattern lock.** A dedicated rule block treats every print, check, stripe,
  emblem and letterform as photographic data to transfer, never as a style to
  redraw. Three levels: standard, strict, forensic.
- **Pattern close-up slot.** A second reference specifically for a tight crop of
  the repeat. This is the single biggest fix for print distortion.
- **Pattern test button.** Generates the anchor shot alone so a print can be
  checked in one call instead of five.
- **Engine switch.** Same references, same prompt, different engine, so results
  can be compared side by side.
- **Anchor-first generation.** The Full Front shot is generated first and passed
  to every other shot as the master reference, holding identity, colour and
  pattern placement across the set.
- **Raw copies preserved.** Desaturation and skin grain are applied to the
  display and download copy only. The raw frame stays clean as the identity
  anchor and the base for refine passes.

---

## Setup

### 1. Get the API keys

- **OpenAI** (for GPT Image 2.5, the default): https://platform.openai.com/api-keys
  → create a key. Image generation is not available on the free tier, and the
  per-minute image limit rises with your usage tier.
- **fal** (for Seedream): https://fal.ai/dashboard/keys → create a key.
- **Google AI Studio** (for Nano Banana): https://aistudio.google.com/apikey →
  create a key. Image models need billing enabled on the Google Cloud project.

### 2. Put the files in a GitHub repo

1. Go to https://github.com/new and create a new repository named
   `five-poses-v2`. Leave it empty, do not add a README.
2. On the new repo page, click **uploading an existing file**.
3. Unzip the delivered folder on your computer, open it, select everything
   **inside** it, and drag it into the browser window. The `app` and `lib`
   folders must land at the top level of the repo, not inside another folder.
4. Click **Commit changes**.

The repo should look like this:

```
package.json
next.config.js
.gitignore
.env.example
README.md
app/
  layout.js
  globals.css
  page.js
  api/generate/route.js
lib/
  engines.js
  poses.js
```

### 3. Deploy on Vercel

1. https://vercel.com/new → **Import** the `five-poses-v2` repo.
2. Framework preset: Next.js. Leave every other setting alone.
3. Before clicking Deploy, open **Environment Variables** and add:
   - `FAL_KEY` = your fal key
   - `GEMINI_API_KEY` = your Google AI Studio key
   Add both to Production, Preview and Development.
4. Click **Deploy**.
5. When the build finishes, confirm the commit hash shown in the Deployments
   panel matches your latest commit before judging the result. The panel can
   show a stale build.

If a key is added after the first deploy, redeploy from the Deployments tab
(three dots → Redeploy). Environment variables are only read at build time.

---

## Using it

1. Upload the **garment** reference: flat lay or ghost mannequin, shot square on.
2. Upload a **pattern close-up**: crop tight on the repeat, in focus, filling the
   frame. Do not skip this for anything printed or checked.
3. Set **pattern lock** to strict for prints and checks, forensic for fine
   repeats and lettering.
4. Pick the model preset and the frame ratio.
5. Click **Pattern test** first. Check the print at 100 percent before spending a
   full set.
6. When the print holds, click **Generate** for the full run.

To compare engines, change the engine dropdown and run the pattern test again
with the same references. Nothing else changes, so the two results are directly
comparable.

---

## Tuning

All in `app/page.js`, at the top of the file:

| Constant | Default | What it does |
| --- | --- | --- |
| `DESAT` | `0.1` | HSL saturation reduction on the display copy |
| `SKIN_TEXTURE` | `0.55` | Grain strength on skin midtones |
| `REF_MAX_DIM` | `1400` | Longest edge of an uploaded reference |
| `PATTERN_MAX_DIM` | `1600` | Longest edge of a pattern close-up |
| `ANCHOR_MAX_DIM` | `900` | Longest edge of the anchor when re-sent |
| `PAYLOAD_BUDGET` | `3400000` | Request ceiling, under Vercel's 4.5 MB limit |

Prompt rules live in `lib/poses.js`. Engine routes and model IDs live in
`lib/engines.js` — if a provider renames a model, that is the only file to edit.

---

## Notes

- No brand name is written into any prompt. Brand marks are transferred from the
  reference image only. Emblems keep the orientation shown in the reference and
  are never mirrored.
- Vercel functions time out at 60 seconds. Nano Banana Pro is the slowest route;
  if it times out, drop the reference size or use Nano Banana 2.
- Model IDs current as of July 2026: `fal-ai/bytedance/seedream/v4.5/edit`,
  `gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview`,
  `gemini-2.5-flash-image`.


---

## Environment variables

Set these in Vercel under Settings → Environment Variables, then redeploy.
You only need the key for the engines you actually intend to use.

| Variable | Needed for |
| --- | --- |
| `OPENAI_API_KEY` | GPT Image 2.5 Sunburst and Flare (default engine) |
| `FAL_KEY` | Seedream 4.5 and 4.0 |
| `GEMINI_API_KEY` | Nano Banana family |

---

## Colourway override

Off by default. When switched on, the garment is re-dyed to a target hex while
pattern geometry, emblem colours and hardware stay exactly as referenced. The
hex is passed to the engine alongside a plain-language name for the same colour,
because a hex on its own gets approximated and a named colour lands much closer.

Scope options: whole garment, body only, trims only, or pattern background only.

## Pairing slots

Optional **Trousers / bottoms** and **Footwear** slots. Each accepts up to five
views of the same item, composited into a single contact sheet so the whole set
fits inside one reference slot. Paired items are treated as real products to
reproduce, not as styling to invent, and they stay identical across the set.
