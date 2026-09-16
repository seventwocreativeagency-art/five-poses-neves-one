// app/api/generate-gemini/route.js
// ---------------------------------------------------------------------------
// Drop-in replacement for /api/generate, running Google's Gemini Flash Image
// (Nano Banana 2). Identical contract: takes { images, prompt, size } and
// returns a raw image blob.
//
// Needs: npm install @google/genai   and   GEMINI_API_KEY in .env.local
// Key is free from https://aistudio.google.com/apikey
// ---------------------------------------------------------------------------

import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";

// Gemini slows down noticeably past this. The app orders images by importance,
// so trimming the tail costs the least.
const MAX_REFS = 8;

function aspectFor(size) {
  const [w, h] = String(size || "1536x2048").split("x").map(Number);
  if (!w || !h) return "3:4";
  const r = w / h;
  if (Math.abs(r - 1) < 0.05) return "1:1";
  if (r < 0.6) return "9:16";
  if (r < 0.78) return "2:3";
  if (r < 0.9) return "3:4";
  return "4:3";
}

function toInlinePart(dataUrl) {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const mimeType = header.slice(5, header.indexOf(";")) || "image/jpeg";
  return { inlineData: { mimeType, data: dataUrl.slice(comma + 1) } };
}

export async function POST(request) {
  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ error: "GEMINI_API_KEY is not set in .env.local" }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { images = [], prompt, size } = body;
  if (!prompt) return Response.json({ error: "Missing prompt." }, { status: 400 });

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const parts = [
      ...images.slice(0, MAX_REFS).filter((d) => d?.startsWith("data:")).map(toInlinePart),
      { text: prompt },
    ];

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        responseFormat: {
          image: { aspectRatio: aspectFor(size), imageSize: "2K" },
        },
      },
    });

    const candidate = response?.candidates?.[0];
    const outParts = candidate?.content?.parts || [];
    const imagePart = outParts.find((p) => p?.inlineData?.data);

    if (!imagePart) {
      // Gemini returns a text explanation instead of an image when it refuses.
      const reason =
        outParts.find((p) => p?.text)?.text ||
        candidate?.finishReason ||
        "Gemini returned no image.";
      return Response.json({ error: String(reason).slice(0, 400) }, { status: 502 });
    }

    const buf = Buffer.from(imagePart.inlineData.data, "base64");

    return new Response(buf, {
      headers: {
        "Content-Type": imagePart.inlineData.mimeType || "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err?.message || "Gemini generation failed.";
    return Response.json({ error: String(msg) }, { status: 502 });
  }
}
