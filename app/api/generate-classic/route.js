// CLASSIC (v1) — untouched copy of the original route. Same OPENAI_API_KEY.
// Left exactly as it was so v1 behaviour can never drift when v2 changes.
//
// Server-side only. The OpenAI key lives in process.env and is never exposed to
// the browser. We call /v1/images/edits directly with multipart form-data and
// return the PNG bytes straight back (no base64/JSON bloat for big images).

export const runtime = "nodejs";
export const maxDuration = 60; // image edits can take 30-60s

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(",");
  const typeMatch = /data:(.*?);base64/.exec(meta);
  const type = typeMatch ? typeMatch[1] : "image/png";
  return new Blob([Buffer.from(b64, "base64")], { type });
}

export async function POST(req) {
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
  } = body || {};

  if (!Array.isArray(images) || images.length === 0) {
    return Response.json({ error: "Upload at least one reference photo first." }, { status: 400 });
  }
  if (!prompt || !prompt.trim()) {
    return Response.json({ error: "Missing prompt." }, { status: 400 });
  }

  const isV2 = model === "gpt-image-2";

  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("quality", quality);
  form.append("output_format", "png");

  // input_fidelity applies only to gpt-image-1.5 / gpt-image-1.
  // gpt-image-2 is always high-fidelity; mini doesn't support the parameter.
  if (fidelity === "high" && (model === "gpt-image-1.5" || model === "gpt-image-1")) {
    form.append("input_fidelity", "high");
  }

  // background: gpt-image-2 does not support transparent.
  if (background && background !== "auto" && !(isV2 && background === "transparent")) {
    form.append("background", background);
  }

  images.forEach((dataUrl, i) => {
    form.append("image[]", dataUrlToBlob(dataUrl), `reference-${i}.png`);
  });

  try {
    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const json = await res.json();

    if (!res.ok) {
      const message =
        json?.error?.message ||
        `OpenAI returned ${res.status}. Check your key, billing, model access (GPT Image 2 may require Organization Verification in the OpenAI console), and the requested size.`;
      return Response.json({ error: message }, { status: res.status });
    }

    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) {
      return Response.json({ error: "No image returned by the model." }, { status: 502 });
    }

    return new Response(Buffer.from(b64, "base64"), {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return Response.json(
      { error: `Request failed: ${err?.message || "unknown error"}.` },
      { status: 502 }
    );
  }
}
