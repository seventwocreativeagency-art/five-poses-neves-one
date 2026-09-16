// engines.js — NEVES ONE · Five Poses
// ---------------------------------------------------------------------------
// Single source of truth for every image engine the app can call. Nothing else
// in the app hard-codes a model string. Adding an engine is one entry here.
//
// ADDITIVE BY DESIGN: the four original engines keep byte-identical request
// behaviour. GPT Image 2.5 Sunburst / Flare are new entries layered on top.
// ---------------------------------------------------------------------------

// Set OPENAI_IMAGE_MODEL_SNAPSHOT in the environment to pin a dated snapshot in
// production without a code change. Leave it unset to use the undated alias.
export const SNAPSHOTS = {
  "gpt-image-2.5-sunburst": "gpt-image-2.5-sunburst-2026-09-08",
  "gpt-image-2.5-flare": "gpt-image-2.5-flare-2026-09-08",
};

export const ENGINES = {
  "gpt-image-2.5-sunburst": {
    id: "gpt-image-2.5-sunburst",
    label: "GPT Image 2.5 Sunburst — highest fidelity (default)",
    group: "GPT Image 2.5 — new",
    blurb:
      "OpenAI's precision-first image model. Best subject and print preservation, slowest. Use for final client work.",
    qualities: ["max", "xhigh", "high", "medium", "low"],
    // "high" rather than "max": Sunburst is now the default engine, so this
    // value sets the cost floor for every run. Output is billed per token and
    // max is several times the price of high with no visible gain on plain
    // garments. Step up to xhigh or max per job when a fine repeat needs it.
    defaultQuality: "high",
    customSize: true,
    transparent: true,
    inputFidelityParam: false,
    snapshotKey: "gpt-image-2.5-sunburst",
    provider: "openai",
    route: "/api/generate",
    tier: "new",
  },
  "gpt-image-2.5-flare": {
    id: "gpt-image-2.5-flare",
    label: "GPT Image 2.5 Flare — fast, high quality (new)",
    group: "GPT Image 2.5 — new",
    blurb:
      "Same 2.5 quality jump at roughly half the latency of GPT Image 2. Good for volume runs and first drafts.",
    qualities: ["max", "xhigh", "high", "medium", "low"],
    defaultQuality: "high",
    customSize: true,
    transparent: true,
    inputFidelityParam: false,
    snapshotKey: "gpt-image-2.5-flare",
    provider: "openai",
    route: "/api/generate",
    tier: "new",
  },

  // ---- Existing engines. Behaviour unchanged from the shipped app. ----
  "gpt-image-2": {
    id: "gpt-image-2",
    label: "GPT Image 2 — previous default",
    group: "Current",
    blurb: "The engine the app ran before GPT Image 2.5. Kept so any set can be reproduced exactly as it was shot.",
    qualities: ["high", "medium", "low"],
    defaultQuality: "high",
    customSize: true,
    transparent: false,
    inputFidelityParam: false,
    provider: "openai",
    route: "/api/generate",
    tier: "stable",
  },
  "gpt-image-1.5": {
    id: "gpt-image-1.5",
    label: "GPT Image 1.5 — supports transparent PNG",
    group: "Current",
    blurb: "Older engine, kept for transparent-background cutouts.",
    qualities: ["high", "medium", "low"],
    defaultQuality: "high",
    customSize: false,
    transparent: true,
    inputFidelityParam: true,
    provider: "openai",
    route: "/api/generate",
    tier: "stable",
  },
  "gpt-image-1": {
    id: "gpt-image-1",
    label: "GPT Image 1 — older, cheaper",
    group: "Current",
    blurb: "Legacy engine.",
    qualities: ["high", "medium", "low"],
    defaultQuality: "high",
    customSize: false,
    transparent: true,
    inputFidelityParam: true,
    provider: "openai",
    route: "/api/generate",
    tier: "stable",
  },
  // ---- Other providers. Each has its own route and its own request shape.
  // They ignore quality, background and output format, so those controls are
  // hidden when one of these is selected. ----
  "gemini-flash-image": {
    id: "gemini-flash-image",
    label: "Gemini Flash Image — fast, cheap",
    group: "Other providers",
    blurb:
      "Google's Gemini Flash Image. Needs GEMINI_API_KEY. Aspect ratio is honoured; quality, background and output format are not used.",
    provider: "google",
    route: "/api/generate-gemini",
    qualities: [],
    defaultQuality: "high",
    customSize: false,
    transparent: false,
    inputFidelityParam: false,
    tier: "other",
  },
  "seedream-4.5": {
    id: "seedream-4.5",
    label: "Seedream 4.5 — ByteDance, via fal",
    group: "Other providers",
    blurb:
      "ByteDance Seedream 4.5 running on fal. Needs FAL_KEY. Needs at least one reference image. Aspect ratio is mapped to the nearest preset it supports.",
    provider: "fal",
    route: "/api/generate-seedream",
    qualities: [],
    defaultQuality: "high",
    customSize: false,
    transparent: false,
    inputFidelityParam: false,
    tier: "other",
  },

  "gpt-image-1-mini": {
    id: "gpt-image-1-mini",
    label: "GPT Image 1 Mini — cheapest",
    group: "Current",
    blurb: "Legacy budget engine.",
    qualities: ["high", "medium", "low"],
    defaultQuality: "high",
    customSize: false,
    transparent: false,
    inputFidelityParam: false,
    provider: "openai",
    route: "/api/generate",
    tier: "stable",
  },
};

export const ENGINE_ORDER = [
  "gpt-image-2.5-sunburst",
  "gpt-image-2.5-flare",
  "gpt-image-2",
  "gpt-image-1.5",
  "gpt-image-1",
  "gpt-image-1-mini",
  "gemini-flash-image",
  "seedream-4.5",
];

// Groups shown in the engine dropdown, in order.
export const ENGINE_GROUPS = ["GPT Image 2.5 — new", "Current", "Other providers"];

// Which route a given engine posts to.
export function routeFor(id) {
  return getEngine(id).route || "/api/generate";
}

// Only OpenAI engines obey the OpenAI quality / size / background rules.
export function isOpenAI(id) {
  return getEngine(id).provider === "openai";
}

export const DEFAULT_ENGINE = "gpt-image-2.5-sunburst";

export function getEngine(id) {
  return ENGINES[id] || ENGINES[DEFAULT_ENGINE];
}

export function isNewGeneration(id) {
  return getEngine(id).tier === "new";
}

// Resolve the model string actually sent to OpenAI. Honours a pinned snapshot.
export function resolveModelId(id, snapshotEnv) {
  const e = getEngine(id);
  if (snapshotEnv && e.snapshotKey && snapshotEnv.startsWith(e.id)) return snapshotEnv;
  return e.id;
}

// ---------------------------------------------------------------------------
// Size validation. GPT Image 2.5 accepts custom dimensions when BOTH edges are
// multiples of 16, neither edge exceeds 3840, the aspect ratio sits between
// 1:3 and 3:1, and total area is between 655,360 and 8,294,400 pixels.
// Above 3,686,400 pixels OpenAI documents the output as experimental — every
// preset shipped here stays below that line.
// ---------------------------------------------------------------------------
export const SIZE_LIMITS = {
  minArea: 655360,
  maxArea: 8294400,
  experimentalArea: 3686400,
  maxEdge: 3840,
  multiple: 16,
  minRatio: 1 / 3,
  maxRatio: 3,
};

export function validateCustomSize(w, h) {
  const problems = [];
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
    return { ok: false, problems: ["Width and height must be whole numbers above zero."], experimental: false };
  }
  if (w % SIZE_LIMITS.multiple || h % SIZE_LIMITS.multiple) problems.push("Both edges must be multiples of 16.");
  if (w > SIZE_LIMITS.maxEdge || h > SIZE_LIMITS.maxEdge) problems.push("Neither edge may exceed 3840 pixels.");
  const area = w * h;
  if (area < SIZE_LIMITS.minArea) problems.push("Total area must be at least 655,360 pixels.");
  if (area > SIZE_LIMITS.maxArea) problems.push("Total area must not exceed 8,294,400 pixels.");
  const ratio = w / h;
  if (ratio < SIZE_LIMITS.minRatio || ratio > SIZE_LIMITS.maxRatio)
    problems.push("Aspect ratio must sit between 1:3 and 3:1.");
  return { ok: problems.length === 0, problems, experimental: area > SIZE_LIMITS.experimentalArea };
}

// Server-authoritative request validation. Returns a normalised settings object
// or a list of problems. The browser validates too, but this is the gate.
export function validateRequest({ model, quality, size, background, action }) {
  const problems = [];
  const engine = ENGINES[model];
  if (!engine) {
    return { ok: false, problems: [`Unknown engine "${model}".`] };
  }
  // Non-OpenAI engines set their own quality, background and format server-side,
  // so only the size string is checked for them.
  if (engine.provider !== "openai") {
    if (!/^\d+x\d+$/.test(String(size || ""))) {
      problems.push(`Size "${size}" is not in WIDTHxHEIGHT form.`);
    }
    return { ok: problems.length === 0, problems, engine };
  }
  if (!engine.qualities.includes(quality)) {
    problems.push(`Quality "${quality}" is not supported by ${engine.label}.`);
  }
  if (background && !["auto", "opaque", "transparent"].includes(background)) {
    problems.push(`Background "${background}" is not valid.`);
  }
  if (background === "transparent" && !engine.transparent) {
    problems.push(`${engine.label} cannot render a transparent background.`);
  }
  if (action && !["edit", "generate"].includes(action)) {
    problems.push(`Action "${action}" is not valid.`);
  }
  const m = /^(\d+)x(\d+)$/.exec(String(size || ""));
  if (!m) {
    problems.push(`Size "${size}" is not in WIDTHxHEIGHT form.`);
  } else if (engine.customSize) {
    const v = validateCustomSize(Number(m[1]), Number(m[2]));
    if (!v.ok) problems.push(...v.problems);
  }
  return { ok: problems.length === 0, problems, engine };
}
