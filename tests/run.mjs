// Dependency-free test runner: node tests/run.mjs  (or: npm test)
//
// The lib modules are ESM inside a CommonJS package, so they are copied to a
// temp folder as .mjs before import. Nothing in app/ or lib/ is modified.

import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "neves-test-"));
for (const f of ["engines", "meta", "poses", "colour"]) {
  const src = readFileSync(new URL(`../lib/${f}.js`, import.meta.url), "utf8").replace(
    /from "\.\/(\w+)"/g,
    'from "./$1.mjs"'
  );
  writeFileSync(join(tmp, `${f}.mjs`), src);
}

const engines = await import(`file://${join(tmp, "engines.mjs")}`);
const colour = await import(`file://${join(tmp, "colour.mjs")}`);
const meta = await import(`file://${join(tmp, "meta.mjs")}`);
const poses = await import(`file://${join(tmp, "poses.mjs")}`);

let pass = 0;
const fails = [];
function check(name, cond) {
  if (cond) pass++;
  else fails.push(name);
}

// ---- central configuration ----
check("Sunburst is registered", engines.ENGINES["gpt-image-2.5-sunburst"].id === "gpt-image-2.5-sunburst");
check("Sunburst defaults to high quality, not max", engines.getEngine("gpt-image-2.5-sunburst").defaultQuality === "high");
check("max is still selectable on Sunburst", engines.getEngine("gpt-image-2.5-sunburst").qualities.includes("max"));
check("default engine is GPT Image 2.5 Sunburst", engines.DEFAULT_ENGINE === "gpt-image-2.5-sunburst");
check("the default engine is a real entry", !!engines.ENGINES[engines.DEFAULT_ENGINE]);
check("the default engine default quality is one it supports", engines.getEngine(engines.DEFAULT_ENGINE).qualities.includes(engines.getEngine(engines.DEFAULT_ENGINE).defaultQuality));
check("both 2.5 engines can be pinned to a snapshot", !!engines.SNAPSHOTS["gpt-image-2.5-sunburst"] && !!engines.SNAPSHOTS["gpt-image-2.5-flare"]);
check("unknown engine falls back to the default engine", engines.getEngine("nope").id === engines.DEFAULT_ENGINE);
check(
  "snapshot pins when configured",
  engines.resolveModelId("gpt-image-2.5-sunburst", "gpt-image-2.5-sunburst-2026-09-08") ===
    "gpt-image-2.5-sunburst-2026-09-08"
);
check(
  "snapshot is ignored for a different engine",
  engines.resolveModelId("gpt-image-2", "gpt-image-2.5-sunburst-2026-09-08") === "gpt-image-2"
);
check("old engines never get a snapshot key", !engines.ENGINES["gpt-image-2"].snapshotKey);
check(
  "input_fidelity stays off for 2.5",
  engines.ENGINES["gpt-image-2.5-sunburst"].inputFidelityParam === false &&
    engines.ENGINES["gpt-image-1.5"].inputFidelityParam === true
);

// ---- size rules ----
const good = ["1536x2048", "1536x1920", "1536x2304", "1152x2048", "1792x1792", "2048x1152"];
for (const g of good) {
  const [w, h] = g.split("x").map(Number);
  const v = engines.validateCustomSize(w, h);
  check(`preset ${g} is valid`, v.ok);
  check(`preset ${g} is not experimental`, !v.experimental);
}
check("non-multiple-of-16 rejected", !engines.validateCustomSize(1000, 2048).ok);
check("oversized edge rejected", !engines.validateCustomSize(4096, 1024).ok);
check("under-minimum area rejected", !engines.validateCustomSize(512, 512).ok);
check("out-of-range ratio rejected", !engines.validateCustomSize(3200, 640).ok);

// ---- request validation ----
check(
  "max quality rejected on gpt-image-2",
  !engines.validateRequest({ model: "gpt-image-2", quality: "max", size: "1536x2048", background: "opaque", action: "edit" }).ok
);
check(
  "max quality accepted on Sunburst",
  engines.validateRequest({ model: "gpt-image-2.5-sunburst", quality: "max", size: "1536x2048", background: "opaque", action: "edit" }).ok
);
check(
  "transparent rejected on gpt-image-2",
  !engines.validateRequest({ model: "gpt-image-2", quality: "high", size: "1536x2048", background: "transparent", action: "edit" }).ok
);
check(
  "transparent accepted on Sunburst",
  engines.validateRequest({ model: "gpt-image-2.5-sunburst", quality: "max", size: "1536x2048", background: "transparent", action: "edit" }).ok
);
check(
  "bad action rejected",
  !engines.validateRequest({ model: "gpt-image-2", quality: "high", size: "1536x2048", background: "opaque", action: "morph" }).ok
);
check(
  "malformed size rejected",
  !engines.validateRequest({ model: "gpt-image-2", quality: "high", size: "big", background: "opaque", action: "edit" }).ok
);
check(
  "unknown model rejected",
  !engines.validateRequest({ model: "gpt-image-9", quality: "high", size: "1536x2048", background: "opaque", action: "edit" }).ok
);
check(
  "legacy engine skips custom-size rules",
  engines.validateRequest({ model: "gpt-image-1", quality: "high", size: "1024x1536", background: "opaque", action: "edit" }).ok
);

// ---- reference roles ----
const lines = poses.buildRoleLines([
  { group: "garment", count: 3 },
  { group: "secondary", count: 0 },
  { group: "model", count: 2 },
  { group: "shoes", count: 1 },
]);
check("roles are numbered in send order", lines.includes("Images 1–3") && lines.includes("Images 4–5") && lines.includes("Image 6"));
check("empty groups are skipped", !lines.includes("SECONDARY PRODUCT"));
check("roles are deterministic", poses.buildRoleLines([{ group: "garment", count: 2 }]) === poses.buildRoleLines([{ group: "garment", count: 2 }]));

// ---- prompt construction ----
const baseArgs = {
  posePrompt: "Full-length FRONT view.",
  focus: "upper-body garment (the top)",
  gender: "women",
  faceDesc: "",
  productDesc: "the navy striped polo",
  secondaryDesc: "",
  hasSecondary: false,
  hasShoes: false,
  hasComposition: false,
  hasPoseRef: false,
  hasAnchor: false,
  notes: "",
};
const loose = poses.buildPrompt(baseArgs);
const strictP = poses.buildPrompt({ ...baseArgs, strict: true, roleLines: lines });

check("strict is off by default", !loose.includes("STRICT PRODUCT FIDELITY"));
check("existing prompt body is preserved verbatim", strictP.startsWith(loose));
check("strict adds the fidelity block", strictP.includes("STRICT PRODUCT FIDELITY"));
check("strict lists permitted changes", strictP.includes("PERMITTED CHANGES"));
check("strict carries the role labels", strictP.includes("Images 1–3"));
check("strict names the product", strictP.includes("the navy striped polo"));
check("strict sets the conflict priority", strictP.includes("takes priority over styling"));
check("no empty placeholder sections", !strictP.includes("undefined") && !strictP.includes("[value]"));

const reframeLoose = poses.buildReframePrompt({ posePrompt: "Side view.", gender: "men", productDesc: "" });
const reframeStrict = poses.buildReframePrompt({ posePrompt: "Side view.", gender: "men", productDesc: "", strict: true, roleLines: lines });
check("reframe prompt unchanged when strict is off", !reframeLoose.includes("STRICT PRODUCT FIDELITY"));
check("reframe prompt extends when strict is on", reframeStrict.startsWith(reframeLoose));

const refineLoose = poses.buildRefinePrompt("brighten the lighting");
const refineStrict = poses.buildRefinePrompt("brighten the lighting", { strict: true, roleLines: lines });
check("refine keeps its old single-argument signature", refineLoose.includes("brighten the lighting"));
check("refine extends when strict is on", refineStrict.startsWith(refineLoose));
check("refine scopes the permitted change", refineStrict.includes("only this requested change: brighten the lighting"));

// ---- metadata round trip ----
const sample = { imageModel: "gpt-image-2.5-sunburst", quality: "max", revisedPrompt: "café — naïve résumé ✓" };
check("metadata survives a UTF-8 round trip", meta.decodeMeta(meta.encodeMeta(sample)).revisedPrompt === sample.revisedPrompt);
check("long revised prompts are truncated", meta.decodeMeta(meta.encodeMeta({ revisedPrompt: "x".repeat(5000) })).revisedPrompt.length <= 1201);
check("bad metadata header fails safely", meta.decodeMeta("not-base64!!") === null);
check("missing metadata header fails safely", meta.decodeMeta(null) === null);
check("metadata never carries a key", !JSON.stringify(sample).includes("sk-"));

// ---- the app must have exactly one generation route and no orchestration layer ----
check("no reasoning model is configured", engines.REASONING_MODEL === undefined);
check("no engine claims orchestration", Object.values(engines.ENGINES).every((e) => e.astraCapable === undefined));

// ---- the other providers must survive alongside the OpenAI engines ----
check("Gemini engine is registered", Boolean(engines.ENGINES["gemini-flash-image"]));
check("Seedream engine is registered", Boolean(engines.ENGINES["seedream-4.5"]));
check("Gemini posts to its own route", engines.routeFor("gemini-flash-image") === "/api/generate-gemini");
check("Seedream posts to its own route", engines.routeFor("seedream-4.5") === "/api/generate-seedream");
check("OpenAI engines still post to /api/generate", engines.routeFor("gpt-image-2.5-sunburst") === "/api/generate" && engines.routeFor("gpt-image-2") === "/api/generate");
check("every engine declares a provider", Object.values(engines.ENGINES).every((e) => e.provider));
check("isOpenAI separates the providers", engines.isOpenAI("gpt-image-2") && !engines.isOpenAI("gemini-flash-image") && !engines.isOpenAI("seedream-4.5"));
check("every engine appears in exactly one dropdown group", engines.ENGINE_ORDER.every((id) => engines.ENGINE_GROUPS.includes(engines.ENGINES[id].group)));
check("no engine is missing from the dropdown order", Object.keys(engines.ENGINES).every((id) => engines.ENGINE_ORDER.includes(id)));
check(
  "OpenAI quality rules do not apply to Gemini",
  engines.validateRequest({ model: "gemini-flash-image", quality: "whatever", size: "1536x2048", background: "opaque", action: "edit" }).ok
);
check(
  "Gemini still rejects a malformed size",
  !engines.validateRequest({ model: "gemini-flash-image", quality: "high", size: "big", background: "opaque", action: "edit" }).ok
);
check(
  "Sunburst rules still bite after the merge",
  !engines.validateRequest({ model: "gpt-image-2.5-sunburst", quality: "max", size: "1000x2048", background: "opaque", action: "edit" }).ok
);

// ---- kidswear: garment-only, true child scale, no person ----
check("five age bands are defined", poses.KIDS_AGE_BANDS.length === 5);
check("6-7 band carries the documented height", poses.KIDS_AGE_BANDS.find((b) => b.id === "6-7").height === "115–122 cm");
check("every age band has build, scale and shoe guidance", poses.KIDS_AGE_BANDS.every((b) => b.build && b.scale && b.shoe));
check("three presentations are offered", poses.KIDS_PRESENTATIONS.length === 3);
check("every presentation has a full set of five views", poses.KIDS_PRESENTATIONS.every((pr) => poses.POSE_ORDER.every((k) => poses.KIDS_POSE_SETS[pr.id]?.[k]?.framing)));

const kid = poses.buildKidsPrompt({
  presentation: "ghost",
  slotFraming: poses.KIDS_POSE_SETS.ghost.fullFront.framing,
  ageBand: "6-7",
  productDesc: "the navy striped tee",
  hasSecondary: false,
  hasShoes: false,
  notes: "",
});

check("kids prompt forbids rendering a person", kid.includes("Do not render a child"));
check("kids prompt forbids a visible mannequin or doll", kid.includes("doll") && kid.includes("no visible mannequin"));
check("kids prompt strips a person out of the references", kid.includes("remove the person completely"));
check("kids prompt carries the age band height", kid.includes("115–122 cm"));
check("kids prompt blocks the shrunken-adult failure", kid.includes("Do NOT render an adult garment reduced in size"));
check("kids prompt keeps the product preservation rules", kid.includes("EXACT MATCH"));
check("kids prompt never asks for skin or anatomy", !kid.includes("realistic skin") && !kid.includes("anatomically"));

for (const pr of ["ghost", "flat", "hanging"]) {
  const p2 = poses.buildKidsPrompt({ presentation: pr, slotFraming: poses.KIDS_POSE_SETS[pr].fullFront.framing, ageBand: "2-3" });
  check(`${pr} presentation still forbids a person`, p2.includes("No human being appears in this image at all"));
  check(`${pr} presentation has no undefined slots`, !p2.includes("undefined"));
}

const kidStrict = poses.buildKidsPrompt({ presentation: "ghost", slotFraming: "x", ageBand: "6-7", strict: true, roleLines: lines });
check("kids strict mode adds the fidelity block", kidStrict.includes("STRICT PRODUCT FIDELITY"));
check("kids strict mode omits the human-anatomy section", !kidStrict.includes("MODEL AND SKIN REALISM"));

const kidRefine = poses.buildKidsRefinePrompt("brighten the collar");
check("kids refine keeps the no-person rule", kidRefine.includes("Do not render a child"));
check("kids refine scopes the change", kidRefine.includes("brighten the collar"));

// ---------------------------------------------------------------------------
// Garment colour code
// ---------------------------------------------------------------------------

check("hex normalises with a hash", colour.normaliseHex("#1b2a4a") === "#1B2A4A");
check("hex normalises without a hash", colour.normaliseHex("1b2a4a") === "#1B2A4A");
check("shorthand hex expands", colour.normaliseHex("#0af") === "#00AAFF");
check("whitespace is tolerated", colour.normaliseHex("  #1B2A4A  ") === "#1B2A4A");
check("a half-typed hex is rejected", colour.normaliseHex("#1b2a") === null);
check("a non-hex string is rejected", colour.normaliseHex("navy") === null);
check("an empty value is rejected", colour.normaliseHex("") === null);
check("describeHex names a dark blue", /blue/.test(colour.describeHex("#1B2A4A")));
check("describeHex names pure black", colour.describeHex("#000000") === "pure black");
check("describeHex names pure white", colour.describeHex("#FFFFFF") === "pure white");
check("describeHex treats greys as neutral", /grey/.test(colour.describeHex("#7A7A7A")));
check("colourPhrase carries the name and the hex", colour.colourPhrase("#1B2A4A").includes("#1B2A4A") && /blue/.test(colour.colourPhrase("#1B2A4A")));
check("colourPhrase is empty for an invalid hex", colour.colourPhrase("nope") === "");
check("readable ink is dark on a pale swatch", colour.readableInk("#FFFFFF") === "#000000");
check("readable ink is light on a dark swatch", colour.readableInk("#1B2A4A") === "#FFFFFF");

const phrase = colour.colourPhrase("#1B2A4A");
const noColour = poses.buildPrompt({ posePrompt: "front", gender: "women", productDesc: "polo" });
const withColour = poses.buildPrompt({ posePrompt: "front", gender: "women", productDesc: "polo", colour: phrase });

check("no colour block when none is set", !noColour.includes("PRODUCT COLOUR OVERRIDE"));
check("colour block appears when one is set", withColour.includes("PRODUCT COLOUR OVERRIDE"));
check("colour block carries the hex", withColour.includes("#1B2A4A"));
check("colour block protects logos and prints", withColour.includes("ARE NOT RECOLOURED"));
check("colour block states it overrides earlier colour rules", withColour.includes("THIS OVERRIDES EVERY"));
check("colour block leaves the secondary product alone", withColour.includes("SECONDARY product"));

const reframeColour = poses.buildReframePrompt({ posePrompt: "side", productDesc: "polo", colour: phrase });
check("reframe carries the colour override", reframeColour.includes("PRODUCT COLOUR OVERRIDE"));
const refineColour = poses.buildRefinePrompt("fix the collar", { colour: phrase });
check("refine carries the colour override", refineColour.includes("PRODUCT COLOUR OVERRIDE"));
const kidsColour = poses.buildKidsPrompt({ slotFraming: "front", ageBand: "4-6", productDesc: "tee", colour: phrase });
check("kidswear carries the colour override", kidsColour.includes("PRODUCT COLOUR OVERRIDE"));
check("kidswear without colour is unchanged", !poses.buildKidsPrompt({ slotFraming: "front", ageBand: "4-6" }).includes("PRODUCT COLOUR OVERRIDE"));

// Strict fidelity must not simultaneously demand the colour be preserved.
const strictNo = poses.buildPrompt({ posePrompt: "front", productDesc: "polo", strict: true });
const strictYes = poses.buildPrompt({ posePrompt: "front", productDesc: "polo", strict: true, colour: phrase });
check("strict mode normally preserves product colours", strictNo.includes("Preserve the source product colours"));
check("strict mode drops that line when recolouring", !strictYes.includes("- Preserve the source product colours."));
check("strict mode still protects print colours when recolouring", strictYes.includes("Preserve the source colours of every print"));
check("recolour is listed as a permitted change", strictYes.includes("base colour of the primary product"));

// ---------------------------------------------------------------------------
// Logo / emblem reference
// ---------------------------------------------------------------------------

const logoGroup = poses.REF_GROUPS.find((g) => g.id === "logo");
check("a logo reference group exists", !!logoGroup);
check("the logo group is optional", logoGroup.optional === true);
check("the logo group caps at 3", logoGroup.cap === 3);
check("the logo group sits directly after the product", poses.REF_GROUPS.findIndex((g) => g.id === "logo") === poses.REF_GROUPS.findIndex((g) => g.id === "garment") + 1);
check("a role label exists for the logo", /EMBLEM/.test(poses.ROLE_LABELS.logo));

const noLogo = poses.buildPrompt({ posePrompt: "front", productDesc: "polo" });
const withLogo = poses.buildPrompt({ posePrompt: "front", productDesc: "polo", hasLogo: true });

check("no logo block when none is uploaded", !noLogo.includes("LOGO / EMBLEM"));
check("logo block appears when one is uploaded", withLogo.includes("LOGO / EMBLEM"));
check("logo block forbids mirroring", /Never mirror it/.test(withLogo));
check("logo block forbids redrawing from memory", /redraw the mark from memory/.test(withLogo));
check("logo block demands it survive full zoom", /100 percent/.test(withLogo));
check("logo block outranks the other references", /outranks every other image/.test(withLogo));
check("logo is listed in the reference order sentence", /MACRO OF THE BRAND EMBLEM/.test(withLogo));

const noteOnly = poses.buildPrompt({ posePrompt: "front", logoNote: "left chest, 5cm" });
check("a placement note alone still reaches the prompt", noteOnly.includes("left chest, 5cm"));
check("a placement note alone does not claim a macro exists", !/outranks every other image/.test(noteOnly));

const bothLogo = poses.buildPrompt({ posePrompt: "front", hasLogo: true, logoNote: "left chest, pony faces right" });
check("macro and placement note combine", /outranks every other image/.test(bothLogo) && bothLogo.includes("pony faces right"));

check("reframe carries the logo block", poses.buildReframePrompt({ posePrompt: "side", hasLogo: true }).includes("LOGO / EMBLEM"));
check("refine carries the logo block", poses.buildRefinePrompt("fix the cuff", { hasLogo: true }).includes("LOGO / EMBLEM"));
check("kidswear carries the logo block", poses.buildKidsPrompt({ slotFraming: "front", ageBand: "4-6", hasLogo: true }).includes("LOGO / EMBLEM"));
check("kidswear without a logo is unchanged", !poses.buildKidsPrompt({ slotFraming: "front", ageBand: "4-6" }).includes("LOGO / EMBLEM"));

// Recolouring must never touch the mark.
const logoAndColour = poses.buildPrompt({ posePrompt: "front", hasLogo: true, colour: colour.colourPhrase("#1B2A4A") });
check("logo and colour blocks coexist", logoAndColour.includes("LOGO / EMBLEM") && logoAndColour.includes("PRODUCT COLOUR OVERRIDE"));
check("a recolour still protects the emblem", logoAndColour.includes("ARE NOT RECOLOURED"));

// Role lines must number the images correctly once the logo is in the order.
const logoLines = poses.buildRoleLines([
  { group: "garment", count: 3 },
  { group: "logo", count: 2 },
  { group: "model", count: 2 },
]);
check("role lines number the logo images correctly", logoLines.includes("Images 4\u20135") && /Images 4\u20135 are a MACRO|Images 4\u20135 are/.test(logoLines));
check("role lines put the model after the logo", logoLines.includes("Images 6\u20137"));

rmSync(tmp, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log(`  FAIL  ${f}`);
  process.exit(1);
}
