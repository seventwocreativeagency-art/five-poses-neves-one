// Server-side only. The OpenAI key lives in process.env and is never exposed to
// the browser. We call /v1/images/edits directly with multipart form-data and
// return the image bytes straight back (no base64/JSON bloat for big images).
//
// The response contract is unchanged: raw image bytes on success, JSON { error }
// on failure. Job metadata rides along in an x-neves-meta header (base64 JSON)
// so nothing that already reads this route breaks.

import { getEngine, resolveModelId, validateRequest } from "../../../lib/engines";
import { encodeMeta } from "../../../lib/meta";

// OPENAI_BASE_URL exists only so the request shape can be tested against a
// local mock. Unset in production it always points at OpenAI.
const BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com";

export const runtime = "nodejs";
// GPT Image 2.5 Sunburst at max quality can run close to two minutes. Vercel Pro
// allows up to 300s. Drop this back to 60 if you ever deploy on Hobby.
export const maxDuration = 300;

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
const RETRY_BUDGET_MS = 200000;

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(",");
  const typeMatch = /data:(.*?);base64/.exec(meta);
  const type = typeMatch ? typeMatch[1] : "image/png";
  return new Blob([Buffer.from(b64, "base64")], { type });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function POST(req) {
  const started = Date.now();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY is not set. Add it in your Vercel project settings, then redeploy." },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    images,
    prompt,
    model = "gpt-image-2",
    quality = "high",
    size = "1536x2048",
    fidelity = "high",
    background = "opaque",
    outputFormat = "png",
    action = "edit",
  } = body || {};

  if (!Array.isArray(images) || images.length === 0) {
    return Response.json({ error: "Upload at least one reference photo first." }, { status: 400 });
  }
  if (!prompt || !prompt.trim()) {
    return Response.json({ error: "Missing prompt." }, { status: 400 });
  }

  // Server is authoritative on model, quality, size, background and action.
  const check = validateRequest({ model, quality, size, background, action });
  if (!check.ok) {
    return Response.json({ error: check.problems.join(" ") }, { status: 400 });
  }
  const engine = getEngine(model);
  const sentModel = resolveModelId(model, process.env.OPENAI_IMAGE_MODEL_SNAPSHOT);

  const format = ["png", "jpeg", "webp"].includes(outputFormat) ? outputFormat : "png";
  if (background === "transparent" && format === "jpeg") {
    return Response.json(
      { error: "A transparent background needs PNG or WebP output, not JPEG." },
      { status: 400 }
    );
  }

  function buildForm() {
    const form = new FormData();
    form.append("model", sentModel);
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("quality", quality);
    form.append("output_format", format);

    // input_fidelity applies only to gpt-image-1.5 / gpt-image-1. It is NOT a
    // documented GPT Image 2.5 control, so it is never sent to those engines.
    if (fidelity === "high" && engine.inputFidelityParam) {
      form.append("input_fidelity", "high");
    }

    // background: only sent when the engine supports the requested value.
    if (background && background !== "auto") {
      if (background !== "transparent" || engine.transparent) {
        form.append("background", background);
      }
    }

    images.forEach((dataUrl, i) => {
      form.append("image[]", dataUrlToBlob(dataUrl), `reference-${i}.png`);
    });
    return form;
  }

  let lastError = "";
  let lastStatus = 502;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE}/v1/images/edits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: buildForm(),
      });

      const requestId = res.headers.get("x-request-id") || "";
      const json = await res.json();

      if (!res.ok) {
        const message =
          json?.error?.message ||
          `OpenAI returned ${res.status}. Check your key, billing, model access (GPT Image models may require Organization Verification in the OpenAI console), and the requested size.`;
        lastError = message;
        lastStatus = res.status;

        const elapsed = Date.now() - started;
        // Never auto-retry quota, auth, permission, moderation or user errors
        // with the same unchanged request.
        if (!RETRYABLE.has(res.status) || attempt === MAX_RETRIES || elapsed > RETRY_BUDGET_MS) {
          console.error(
            `[neves] images.edits failed model=${sentModel} status=${res.status} request_id=${requestId} code=${json?.error?.code || ""}`
          );
          return Response.json({ error: message }, { status: res.status });
        }
        await sleep(Math.round(1200 * Math.pow(2, attempt) + Math.random() * 600));
        continue;
      }

      const b64 = json?.data?.[0]?.b64_json;
      if (!b64) {
        return Response.json({ error: "No image returned by the model." }, { status: 502 });
      }

      const bytes = Buffer.from(b64, "base64");
      // Validate the decoded payload really is an image before calling it done.
      const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50;
      const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
      const isWebp = bytes.length > 12 && bytes.slice(8, 12).toString("ascii") === "WEBP";
      if (!isPng && !isJpeg && !isWebp) {
        return Response.json({ error: "The model returned a file that is not a valid image." }, { status: 502 });
      }

      const meta = {
        path: "images.edits",
        imageModel: sentModel,
        imageModelAlias: engine.id,
        quality,
        size,
        background,
        action,
        outputFormat: format,
        referenceCount: images.length,
        latencyMs: Date.now() - started,
        requestId,
        usage: json?.usage || null,
        attempts: attempt + 1,
        at: new Date().toISOString(),
      };

      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": `image/${format}`,
          "Cache-Control": "no-store",
          "x-neves-meta": encodeMeta(meta),
        },
      });
    } catch (err) {
      lastError = `Request failed: ${err?.message || "unknown error"}.`;
      lastStatus = 502;
      if (attempt === MAX_RETRIES || Date.now() - started > RETRY_BUDGET_MS) break;
      await sleep(Math.round(1200 * Math.pow(2, attempt) + Math.random() * 600));
    }
  }

  return Response.json({ error: lastError || "Request failed." }, { status: lastStatus });
}
