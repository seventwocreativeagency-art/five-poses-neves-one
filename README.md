# NEVES ONE · Five Poses

Put your product on your model and generate five consistent catalogue shots.

---

## Two apps, one deployment

| URL | What it is |
| --- | --- |
| `/` | **NEVES ONE (v2)** — the new build. All engines, rebrand, kidswear, diagnostics. |
| `/classic` | **Five Poses (v1)** — your original app, untouched. |

Both run off the same `OPENAI_API_KEY` and the same Vercel project. There is a
button in the top-right corner of each to switch to the other:

- on `/classic`, an orange **NEVES ONE v2 →** button
- on `/`, a **← Classic (v1)** button

The classic app is a verbatim copy of the original code, deliberately isolated
so the two can never affect each other:

- its own page (`app/classic/page.js`)
- its own stylesheet (`app/classic/classic.css`)
- its own prompt library (`lib/classic-poses.js`)
- its own API route (`app/api/generate-classic/route.js`)

Nothing in v2 imports anything from v1 or vice versa. Changing one cannot break
the other. The classic app keeps its original four engines and its original
60-second timeout.

## What's new in this version

**GPT Image 2.5 Sunburst is now the engine the app opens on.**

It was already in the dropdown; it is now the default, so every run uses it
unless someone picks something else. It is OpenAI's most capable model for image
editing and the best of the list at changing one thing and leaving the rest of
the frame alone.

Its default quality is **high**, not max. Sunburst supports max, and it is still
in the Quality dropdown, but max is several times the price of high per image
with no visible gain on plain garments. Step up to xhigh or max on the jobs that
need it, rather than paying for it on every draft.

If Sunburst gives you trouble, pick GPT Image 2 from the same dropdown and you
are back exactly where you were. Nothing else needs changing. To move the
default back permanently, change one line in `lib/engines.js`:

```js
export const DEFAULT_ENGINE = "gpt-image-2";
```

The app has also been rebranded to NEVES ONE.

---

## Logo / emblem reference

Section 1, under the garment colour code. Optional, up to three crops.

Upload a tight, sharp, square-on macro of the brand mark exactly as it appears on
this product. Well lit, filling the frame. This is the single highest-value
reference in the app: without it the engine redraws the mark from whatever it can
make out in the product photos, which is how marks come back softened, mirrored,
missing elements, or redrawn as a different brand's logo entirely.

What the app does with it:

- **Sends it at higher resolution than everything else.** Always at least 1536px
  regardless of the Detail setting. A 1024px logo crop is the main reason marks
  come back as approximations.
- **Places it directly after the product** in the reference order, where engines
  weight it most heavily.
- **Declares it the ground truth for the mark**, outranking the product photos and
  the identity anchor.
- **Sends an extra crop on the close-up**, which is the shot where a mangled
  emblem is actually visible to a client.

The prompt block that comes with it forbids mirroring and flipping, forbids
redrawing from memory, requires the exact facing direction, requires every
internal shape and the correct element count, requires any text in the mark to be
spelled and set exactly, and requires the mark to survive at 100 percent zoom
rather than only working at thumbnail size. It also requires the mark to sit flat
on the fabric and follow the drape, rather than looking like a sticker.

There is a placement note field under it. Use it for things a macro cannot show,
for example "left chest, about 5 cm wide, pony faces right". The note works on its
own without a macro, but a macro is worth far more.

The logo carries through all four paths: the five-pose set, reframes, refine
passes and kidswear. A recolour never touches the mark.

---

## Garment colour code

Section 1, under the secondary product. Leave it blank and the product colour is
reproduced exactly from the references, which is the normal case. Enter a hex
value and the **main fabric of the primary product** is re-dyed to it.

What is protected and never recoloured:

- logos, emblems, embroidery and wordmarks
- prints, patterns, stripes and checks, including their geometry
- text and lettering
- contrast collars, cuffs, plackets, tipping and hems
- buttons, zips, eyelets, drawcords and hardware
- the secondary product, the shoes, the model, the background and the lighting

The hex is sent to the engine alongside a plain-language name for the same
colour, so `#1B2A4A` goes across as "very deep soft blue, hex #1B2A4A". A hex on
its own gets approximated; a named colour lands much closer.

Expect a close match, not a pixel-exact one. The fabric still has to shade
correctly under studio light, so the flat lit areas sit on the target value while
folds read darker and highlights lighter. For pixel-exact work, finish with an
eyedropper in your editor.

A half-typed or invalid hex is ignored rather than guessed at, and the field says
so. The Clear button removes the override.

The colour carries through every path: the five-pose set, reframes, refine passes
and kidswear. A refine cannot quietly revert the product to its original colour.

Strict fidelity mode is aware of it. Normally strict mode demands the source
colours be preserved, which would directly contradict a recolour; with a hex set,
that rule is narrowed to prints, logos, text and trims, and the base fabric
colour is added to the permitted-changes list.

---

## The engine dropdown

| Choose this | When |
| --- | --- |
| **GPT Image 2.5 Sunburst** | Final client work. Best print, logo and product accuracy. Slowest, roughly up to two minutes per image. |
| **GPT Image 2.5 Flare** | Same quality jump, about twice as fast. Good for drafts and volume. |
| **GPT Image 2** | What you have been using. Still here. Switch back to this if anything goes wrong. |
| GPT Image 1.5 / 1 / 1 Mini | Older engines, untouched. |
| **Gemini Flash Image** | Google. Fast and cheap. Needs `GEMINI_API_KEY`. |
| **Seedream 4.5** | ByteDance, via fal. Needs `FAL_KEY` and at least one reference image. |

Gemini and Seedream set their own quality, background and file format, so those
three controls disappear when you select them. Aspect ratio, your references and
your styling notes all still apply.

Switching engine also updates the Quality dropdown automatically. Sunburst adds
**Maximum** and **Extra high**, which the older engines do not have. Pick an
engine first, then quality.

---

## Kidswear

Pick **Kids** in the Category tabs at the top of the panel. The app switches to
garment-only mode. No child is generated, and no model picker appears.

**Age band** is the important control. It sets the true garment scale, which is
what stops a size 4 tee rendering as a shrunken adult tee. Body length, sleeve
length, shoulder width, neck opening, armhole depth, hem position, buttons,
zips and prints all scale to the band you choose:

| Band | Height |
| --- | --- |
| 2–3 years (toddler) | 88–98 cm |
| 4–5 years | 100–112 cm |
| 6–7 years | 115–122 cm |
| 8–9 years | 126–135 cm |
| 10–12 years (tween) | 138–152 cm |

**Presentation** offers three ways to shoot it:

- **Ghost mannequin** — the garment holds a natural worn shape with nobody in
  it, neck opening hollow, inside back collar visible. This is what most kids'
  catalogues actually run.
- **Flat lay** — laid flat, shot from directly overhead. Best for prints and sets.
- **Hanging** — on a child-size wooden hanger. Best for outerwear and drape.

Each gives you five views. If a reference photo has a child wearing the garment,
the prompt instructs the engine to remove the person entirely and rebuild the
parts of the garment they were covering.

## Other new switches (all off by default)

**Strict product fidelity** — tells the engine which uploaded image is the
product, which is the face, which is the pose, and which is just styling mood.
Then it adds a long list of "do not change the print, the logo, the seams, the
colour" rules. Worth turning on for catalogue work. Costs nothing extra.

**Reference detail** — Standard sends your reference photos at 1024px, which is
what the app has always done. High sends them at 1536px, so more of the real
print and fabric texture reaches the engine. Turn this on if patterns are coming
back wrong.

**Output format** — PNG is the default and best for masters. WebP or JPEG give
you smaller files for delivery.

**Diagnostics line** under each finished image — shows which engine made it, at
what quality, and how long it took. Click it to expand.

---

## Honest limitations

- These are generated images, not composites of your original photos.
- Sunburst holds prints, logos and product shapes much better than GPT Image 2,
  but no AI engine copies every motif or brand mark perfectly, and two runs of
  the same product can differ.
- Check the print repeat, any text or logo, the colour, the skin tone and the
  hands on every frame before it goes to a client.
- If a garment or label has to be pixel-perfect, shoot the real product and
  composite it. This app does not do that.
- There is no silent swapping. If Sunburst is unavailable the app tells you and
  stops. It will never quietly render on a weaker engine behind your back.

---

## Environment variables

| Variable | Needed? | What it does |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Your existing key. Lives on the server, never reaches the browser. |
| `GEMINI_API_KEY` | Only for the Gemini engine | Free from aistudio.google.com/apikey. |
| `FAL_KEY` | Only for the Seedream engine | From fal.ai. |
| `NEVES_ADMIN_TOKEN` | Optional | Switches on the `/api/diagnostics` page that checks whether your OpenAI account can actually use Sunburst. Without it that page returns 404. |
| `OPENAI_IMAGE_MODEL_SNAPSHOT` | Optional | Locks a 2.5 engine to a fixed dated version so results stay repeatable. Use `gpt-image-2.5-sunburst-2026-09-08` or `gpt-image-2.5-flare-2026-09-08`. |
| `OPENAI_BASE_URL` | No | Testing only. Leave it unset. |

---

## Checking your OpenAI account can use Sunburst

### The quick way: one command

```
npm install
npm run access-test
```

It asks OpenAI for a single cheap test image using `gpt-image-2.5-sunburst` and
nothing else. It reads your key from `.env.local` or your shell, never prints it,
never tries a different model, and changes nothing in the app.

If it works you get `ACCESS CONFIRMED` and a file called
`gpt-image-2.5-sunburst-access-test.png` in the project folder.

If it does not, you get `ACCESS NOT CONFIRMED` plus the HTTP status, the error
type and code, the full message from OpenAI, and a plain-English line telling you
whether the problem is your key, organisation verification, project permissions,
billing, or just a rate limit.

### The other way: from the deployed app

OpenAI often requires Organization Verification before an account can use GPT
Image models. Better to find out now than mid-job.

Set `NEVES_ADMIN_TOKEN` to any long random string, then visit:

```
https://your-app.vercel.app/api/diagnostics?token=YOUR_TOKEN&smoke=1
```

That runs one real, cheap test image and tells you plainly whether it worked.
It never runs on its own.

---

## Rolling it out sensibly

Don't switch everything to Sunburst at once.

1. Find your worst GPT Image 2 results — striped or monogrammed pieces, anything
   with a logo, deep skin tones, close face crops.
2. Re-run those exact jobs with only the engine changed to Sunburst.
3. Compare like for like. Then try turning Strict product fidelity on.
4. Run the hard ones a few times. You're checking consistency, not luck.

Rolling back is one dropdown.

---

## Running it locally

```
npm install
npm run dev
```

```
npm test        # 55 checks, no extra packages needed
npm run build
```

---

## Where things live

```
app/page.js                    NEVES ONE v2
app/classic/page.js            Five Poses v1, untouched
app/api/generate/route.js      The OpenAI route (all GPT Image engines)
app/api/generate-classic/route.js    v1's own route, untouched
app/api/generate-gemini/route.js     The Gemini route
app/api/generate-seedream/route.js   The Seedream route
app/api/diagnostics/route.js   Locked admin check
lib/engines.js                 Every model name and rule, in one file
lib/poses.js                   The pose engine and prompts
lib/meta.js                    The per-image info shown under each result
```

No model name is written anywhere except `lib/engines.js`. Each engine declares
which route it posts to, so adding another provider means one entry in that file
plus its route.
