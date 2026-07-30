// app/api/generate/route.js
import { NextResponse } from 'next/server';
import {
  routeFor,
  aspectRatioFor,
  dimensionsFor,
  geminiImageSizeFor,
} from '../../../lib/engines';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function fail(message, status = 400, detail) {
  return NextResponse.json({ error: message, detail: detail || null }, { status });
}

// --- Seedream via fal -------------------------------------------------------

async function postToFal(route, key, body) {
  const res = await fetch(`https://fal.run/${route.path}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, text: await res.text() };
}

async function callFal(route, { prompt, images, aspectKey, resolutionKey, engine }) {
  const key = process.env.FAL_KEY;
  if (!key) {
    return { error: 'FAL_KEY is not set. Add it in Vercel under Settings, Environment Variables, then redeploy.' };
  }

  const base = { prompt, image_urls: images, num_images: 1, enable_safety_checker: false };
  const dims = dimensionsFor(engine, aspectKey, resolutionKey);

  // Explicit pixel dimensions give real control over output resolution, which
  // is what fine repeats need. If this build of the model rejects the object
  // form, fall back to the named size enum rather than failing the shot.
  let { res, text } = await postToFal(route, key, { ...base, image_size: dims });
  if (!res.ok && (res.status === 400 || res.status === 422)) {
    ({ res, text } = await postToFal(route, key, {
      ...base,
      image_size: aspectRatioFor(engine, aspectKey),
    }));
  }

  if (!res.ok) return { error: `fal returned ${res.status}`, detail: text.slice(0, 900) };

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { error: 'fal returned a response that could not be read.', detail: text.slice(0, 400) };
  }

  const url = data?.images?.[0]?.url || data?.image?.url;
  if (!url) return { error: 'fal returned no image.', detail: JSON.stringify(data).slice(0, 700) };

  // Pull the bytes back through our own origin so the browser canvas can read
  // them without tainting, and so the client always receives one consistent shape.
  const imgRes = await fetch(url);
  if (!imgRes.ok) return { error: `Could not download the generated image (${imgRes.status}).` };
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const mime = imgRes.headers.get('content-type') || 'image/png';
  return { bytes: buf, mime };
}

// --- Gemini (Nano Banana) ---------------------------------------------------

function splitDataUri(uri) {
  const match = /^data:([^;]+);base64,(.*)$/.exec(uri || '');
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

async function callGemini(route, { prompt, images, aspectKey, resolutionKey, engine }) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    return { error: 'GEMINI_API_KEY is not set. Add it in Vercel under Settings, Environment Variables, then redeploy.' };
  }

  const parts = [];
  for (const uri of images) {
    const piece = splitDataUri(uri);
    if (piece) parts.push({ inline_data: { mime_type: piece.mimeType, data: piece.data } });
  }
  parts.push({ text: prompt });

  const generationConfig = { responseModalities: ['TEXT', 'IMAGE'] };
  if (route.supportsImageConfig) {
    generationConfig.imageConfig = { aspectRatio: aspectRatioFor(engine, aspectKey) };
    const imageSize = geminiImageSizeFor(engine, resolutionKey);
    if (imageSize) generationConfig.imageConfig.imageSize = imageSize;
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${route.model}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig }),
    }
  );

  const text = await res.text();
  if (!res.ok) return { error: `Gemini returned ${res.status}`, detail: text.slice(0, 900) };

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { error: 'Gemini returned a response that could not be read.', detail: text.slice(0, 400) };
  }

  const candidateParts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = candidateParts.find((p) => p.inlineData || p.inline_data);
  const inline = imagePart?.inlineData || imagePart?.inline_data;

  if (!inline?.data) {
    const said = candidateParts.map((p) => p.text).filter(Boolean).join(' ').slice(0, 400);
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || '';
    return {
      error: 'Gemini returned no image.',
      detail: [reason, said].filter(Boolean).join(' - ') || JSON.stringify(data).slice(0, 500),
    };
  }

  const mime = inline.mimeType || inline.mime_type || 'image/png';
  return { bytes: Buffer.from(inline.data, 'base64'), mime };
}

// --- Handler ----------------------------------------------------------------

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return fail('The request body could not be read. The images may be too large.', 413);
  }

  const { engine, prompt, images, aspect, resolution } = payload || {};

  if (!prompt) return fail('No prompt was supplied.');
  if (!Array.isArray(images) || images.length === 0) {
    return fail('At least one reference image is required.');
  }

  const route = routeFor(engine);
  const args = {
    prompt,
    images,
    aspectKey: aspect || '3:4',
    resolutionKey: resolution || '2K',
    engine: route.id,
  };

  try {
    const result =
      route.provider === 'fal' ? await callFal(route, args) : await callGemini(route, args);

    if (result.error) {
      return NextResponse.json({ error: result.error, detail: result.detail || null }, { status: 502 });
    }

    return new Response(result.bytes, {
      status: 200,
      headers: {
        'Content-Type': result.mime,
        'Cache-Control': 'no-store',
        'X-Engine': route.id,
      },
    });
  } catch (err) {
    return fail(
      'The generation request failed before an image came back. If this took close to a minute, drop the output resolution or use a smaller reference.',
      500,
      String(err && err.message ? err.message : err)
    );
  }
}
