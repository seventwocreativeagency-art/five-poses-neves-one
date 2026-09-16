// app/api/generate-seedream/route.js
// ---------------------------------------------------------------------------
// Drop-in replacement for /api/generate, running ByteDance Seedream 4.5 on fal.
// Identical contract: takes { images, prompt, size } and returns a raw image
// blob, so page.js only needs to point fetch() here instead.
//
// Needs: npm install @fal-ai/client   and   FAL_KEY in .env.local
// ---------------------------------------------------------------------------

import { fal } from "@fal-ai/client";

export const runtime = "nodejs";
export const maxDuration = 300;

fal.config({ credentials: process.env.FAL_KEY });

const ENDPOINT = "fal-ai/bytedance/seedream/v4.5/edit";

// Seedream takes up to 10 reference images. The app can send more than that in
// base mode, so we keep the first 10 — they are already ordered by importance
// (anchor / pose ref first, then product, then model).
const MAX_REFS = 10;

// Seedream will not accept arbitrary pixel dimensions the way gpt-image does.
// Map whatever size string the app sends onto the nearest supported preset.
function imageSizeFor(size) {
  const [w, h] = String(size || "1536x2048").split("x").map(Number);
  if (!w || !h) return "portrait_4_3";
  if (w === h) return "square_hd";
  return w < h ? "portrait_4_3" : "landscape_4_3";
}

// dataURL -> Blob, so we can push it to fal storage and get back a real URL.
function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const mime = header.slice(5, header.indexOf(";")) || "image/jpeg";
  const bytes = Buffer.from(dataUrl.slice(comma + 1), "base64");
  return new Blob([bytes], { type: mime });
}

export async function POST(request) {
  if (!process.env.FAL_KEY) {
    return Response.json({ error: "FAL_KEY is not set in .env.local" }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { images = [], prompt, size, seed } = body;

  if (!prompt) return Response.json({ error: "Missing prompt." }, { status: 400 });
  if (!images.length) {
    return Response.json({ error: "Seedream needs at least one reference image." }, { status: 400 });
  }

  try {
    // Upload the references so fal gets real URLs rather than a huge JSON body.
    // Sequential on purpose: fal rate-limits bursts of uploads on small plans.
    const urls = [];
    for (const dataUrl of images.slice(0, MAX_REFS)) {
      if (dataUrl.startsWith("http")) {
        urls.push(dataUrl);
      } else {
        urls.push(await fal.storage.upload(dataUrlToBlob(dataUrl)));
      }
    }

    const result = await fal.subscribe(ENDPOINT, {
      input: {
        prompt,
        image_urls: urls,
        image_size: imageSizeFor(size),
        num_images: 1,
        max_images: 1,
        enable_safety_checker: true,
        ...(Number.isFinite(seed) ? { seed } : {}),
      },
      logs: false,
    });

    const outUrl = result?.data?.images?.[0]?.url;
    if (!outUrl) {
      return Response.json(
        { error: "Seedream returned no image. The safety checker may have blocked it." },
        { status: 502 }
      );
    }

    // Stream the finished image back as a blob, exactly like /api/generate does.
    const img = await fetch(outUrl);
    const buf = Buffer.from(await img.arrayBuffer());

    return new Response(buf, {
      headers: {
        "Content-Type": img.headers.get("content-type") || "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err?.body?.detail || err?.message || "Seedream generation failed.";
    return Response.json({ error: String(msg) }, { status: 502 });
  }
}
