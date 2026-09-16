// Guarded, admin-only access check. Confirms the key exists, that the app can
// authenticate, and whether this project/organisation can actually use the
// configured models. Model discovery alone is not proof, so a real (paid) smoke
// generation is available but must be triggered deliberately with &smoke=1.
//
// Requires NEVES_ADMIN_TOKEN to be set in the environment. Never returns the
// key, headers, environment or raw stack traces.

import { ENGINE_ORDER, getEngine, resolveModelId } from "../../../lib/engines";

const BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || req.headers.get("x-neves-admin") || "";
  const expected = process.env.NEVES_ADMIN_TOKEN;

  if (!expected) {
    return Response.json(
      { error: "Diagnostics are disabled. Set NEVES_ADMIN_TOKEN in the environment to enable them." },
      { status: 404 }
    );
  }
  if (token !== expected) {
    return Response.json({ error: "Not authorised." }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const report = {
    keyPresent: Boolean(apiKey),
    authenticated: false,
    snapshotPinned: process.env.OPENAI_IMAGE_MODEL_SNAPSHOT || null,
    models: {},
    liveImageAccess: "not verified",
    notes: [],
    at: new Date().toISOString(),
  };

  if (!apiKey) {
    report.notes.push("OPENAI_API_KEY is not set on the server.");
    return Response.json(report, { status: 200 });
  }

  // 1. Can we authenticate at all, and what is listed for this project?
  let listed = new Set();
  try {
    const res = await fetch(`${BASE}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      report.authenticated = true;
      const json = await res.json();
      listed = new Set((json?.data || []).map((m) => m.id));
    } else {
      report.notes.push(`Authentication check returned ${res.status}.`);
      return Response.json(report, { status: 200 });
    }
  } catch {
    report.notes.push("Could not reach the OpenAI API.");
    return Response.json(report, { status: 200 });
  }

  for (const id of ENGINE_ORDER) {
    report.models[id] = listed.has(id) ? "listed" : "not listed for this project";
  }
  report.notes.push(
    "Listing a model is not proof that image generation is authorised. Run with &smoke=1 for a real, billed test render."
  );

  // 2. Optional real generation. Deliberate, never automatic, never on a health poll.
  if (url.searchParams.get("smoke") === "1") {
    const target = url.searchParams.get("model") || "gpt-image-2.5-sunburst";
    const engine = getEngine(target);
    const sentModel = resolveModelId(engine.id, process.env.OPENAI_IMAGE_MODEL_SNAPSHOT);
    try {
      const res = await fetch(`${BASE}/v1/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: sentModel,
          prompt: "A plain mid-grey square on a white background. No text.",
          size: "1024x1024",
          quality: "low",
          n: 1,
        }),
      });
      const json = await res.json();
      if (res.ok && json?.data?.[0]?.b64_json) {
        report.liveImageAccess = `verified for ${sentModel}`;
      } else {
        report.liveImageAccess = "failed";
        report.notes.push(
          json?.error?.message ||
            `${sentModel} is configured but is not available to this OpenAI project or organisation. Check project model access, organisation verification, billing and rate limits. No fallback model was used.`
        );
      }
    } catch {
      report.liveImageAccess = "failed";
      report.notes.push("The smoke test could not reach the OpenAI API.");
    }
  }

  return Response.json(report, { status: 200 });
}
