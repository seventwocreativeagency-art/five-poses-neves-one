// One-time, non-destructive access test for gpt-image-2.5-sunburst.
//
//   npm run access-test
//
// - Reads OPENAI_API_KEY from the environment or .env.local. Never prints it.
// - Talks straight to https://api.openai.com/v1/images/generations over HTTPS
//   with the raw model string. No SDK, so an out-of-date SDK cannot cause a
//   false negative.
// - Requests exactly one low-quality 1024x1024 image. Nothing else is called.
// - Never substitutes another model. If Sunburst fails, the test fails.
// - Touches no application code and installs nothing.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const MODEL = "gpt-image-2.5-sunburst";
const PROMPT =
  "A simple white ceramic coffee cup photographed against a clean light-grey studio background.";
const OUT = "gpt-image-2.5-sunburst-access-test.png";

// ---- find the key without ever revealing it ----
let key = process.env.OPENAI_API_KEY;
if (!key && existsSync(".env.local")) {
  const m = /^OPENAI_API_KEY\s*=\s*(.+)$/m.exec(readFileSync(".env.local", "utf8"));
  if (m) key = m[1].trim().replace(/^["']|["']$/g, "");
}
if (!key) {
  console.log("ACCESS NOT CONFIRMED");
  console.log("");
  console.log("No API key was found, so no request was sent.");
  console.log("Set OPENAI_API_KEY in your shell, or put it in .env.local, then run this again.");
  process.exit(1);
}

console.log(`Requesting one ${MODEL} image at low quality, 1024x1024...`);
console.log("");

let res, json, raw;
const started = Date.now();
try {
  res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt: PROMPT, quality: "low", size: "1024x1024", n: 1 }),
  });
  raw = await res.text();
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }
} catch (err) {
  console.log("ACCESS NOT CONFIRMED");
  console.log("");
  console.log(`Network error: ${err?.message || "unknown"}`);
  console.log("The request never reached OpenAI, so this says nothing about your model access.");
  process.exit(1);
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
const requestId = res.headers.get("x-request-id") || "(none returned)";

// ---- success ----
if (res.ok && json?.data?.[0]?.b64_json) {
  const bytes = Buffer.from(json.data[0].b64_json, "base64");
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50;
  if (!isPng) {
    console.log("ACCESS NOT CONFIRMED");
    console.log("");
    console.log("The API returned data that is not a valid PNG. Nothing was saved.");
    process.exit(1);
  }
  writeFileSync(OUT, bytes);

  console.log(`ACCESS CONFIRMED: This API project can use ${MODEL}.`);
  console.log("");
  console.log(`Model requested:   ${MODEL}`);
  console.log(
    `Model returned:    ${json.model || "(the Images API did not echo a model field; the request above is what was sent and it succeeded)"}`
  );
  console.log(`Output file:       ${process.cwd()}/${OUT}`);
  console.log(`File size:         ${(bytes.length / 1024).toFixed(0)} KB`);
  console.log(`HTTP status:       ${res.status}`);
  console.log(`Request ID:        ${requestId}`);
  console.log(`Time taken:        ${elapsed}s`);
  if (json.usage) console.log(`Tokens used:       ${JSON.stringify(json.usage)}`);
  process.exit(0);
}

// ---- failure ----
const err = json?.error || {};
const status = res.status;
const type = err.type || "(none given)";
const code = err.code || "(none given)";
const message = err.message || raw?.slice(0, 800) || "(no message returned)";
const blob = `${status} ${type} ${code} ${message}`.toLowerCase();

console.log("ACCESS NOT CONFIRMED");
console.log("");
console.log(`HTTP status:       ${status}`);
console.log(`Error type:        ${type}`);
console.log(`Error code:        ${code}`);
console.log(`Request ID:        ${requestId}`);
console.log("");
console.log("Full error message:");
console.log(message);
console.log("");

let cause, action;
if (status === 401) {
  cause = "The API key itself. It is missing, wrong, revoked, or belongs to a different project.";
  action = "Check the key in your OpenAI dashboard and in your Vercel environment variables.";
} else if (blob.includes("must be verified") || blob.includes("organization must be verified")) {
  cause = "Organization verification. Your account exists and the key works, but OpenAI has not yet verified your organisation for GPT Image models.";
  action = "Go to platform.openai.com > Settings > Organization > General and complete verification. It can take up to 15 minutes to take effect afterwards.";
} else if (status === 403 || blob.includes("does not have access") || blob.includes("not allowed")) {
  cause = "Project permissions. The key authenticated, but this project is not permitted to use this model.";
  action = "In the OpenAI dashboard, open this project's Limits or Model access page and enable gpt-image-2.5-sunburst.";
} else if (status === 404 || code === "model_not_found" || blob.includes("does not exist")) {
  cause = "Model availability for your account. The model name is correct, but your account cannot see it yet. This is usually unverified organisation or a staged rollout.";
  action = "Complete organisation verification first, then check the model appears in your dashboard's model list.";
} else if (code === "insufficient_quota" || blob.includes("quota") || blob.includes("billing")) {
  cause = "Billing. The account has no credit or has hit a spend limit.";
  action = "Add credit or raise the spend limit in Billing, then run this again.";
} else if (status === 429) {
  cause = "Rate limits. The request was throttled, not refused. This does not mean you lack access.";
  action = "Wait a minute and run it again.";
} else if (status >= 500) {
  cause = "An OpenAI-side error, not your configuration.";
  action = "Wait a few minutes and run it again.";
} else if (blob.includes("quality") || blob.includes("size") || blob.includes("invalid")) {
  cause = "A rejected parameter rather than model access. The model was reachable but disliked something in the request.";
  action = "Read the message above; it names the parameter.";
} else {
  cause = "Not one of the usual categories.";
  action = "Send the status, type, code and message above to OpenAI support with the request ID.";
}

console.log(`Most likely cause: ${cause}`);
console.log(`What to do:        ${action}`);
console.log("");
console.log("Note: no other model was tried. This result is only about gpt-image-2.5-sunburst.");
process.exit(1);
