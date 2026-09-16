// poses.js — Five Poses
// ---------------------------------------------------------------------------
// Garment-type-aware pose engine.
//   • GARMENT_TYPES: upper-body / lower-body / dress-&-full-outfit.
//   • POSE_SETS[type][slot]: framing + crop + body-position variation pool,
//     tuned so the shot actually shows that garment region.
//   • When a POSE REFERENCE is uploaded, it is placed FIRST in the image stack
//     and the identity anchor is dropped, so the reference pose dominates.
// Settings, reference groups, baked-in models, and the fidelity prompt
// scaffolding live here too.
// ---------------------------------------------------------------------------

export const MODELS = [
  { id: "gpt-image-2", label: "GPT Image 2 — latest, best (recommended)" },
  { id: "gpt-image-1.5", label: "GPT Image 1.5 — supports transparent PNG" },
  { id: "gpt-image-1", label: "GPT Image 1 — older, cheaper" },
  { id: "gpt-image-1-mini", label: "GPT Image 1 Mini — cheapest" },
];

export const QUALITIES = ["high", "medium", "low"];

export const BACKGROUNDS = [
  { id: "opaque", label: "White #FFFFFF (opaque)" },
  { id: "transparent", label: "Transparent (GPT Image 1.5 only)" },
  { id: "auto", label: "Auto" },
];

export const ASPECT_RATIOS = [
  { id: "3:4", label: "3:4 — portrait (default)", w: 1536, h: 2048 },
  { id: "4:5", label: "4:5 — portrait", w: 1536, h: 1920 },
  { id: "2:3", label: "2:3 — tall portrait", w: 1536, h: 2304 },
  { id: "9:16", label: "9:16 — full length", w: 1152, h: 2048 },
  { id: "1:1", label: "1:1 — square", w: 1792, h: 1792 },
];

// Garment categories — drives the framing set for the five shots.
export const GARMENT_TYPES = [
  { id: "upper", label: "Upper body — shirt, tee, jacket, blazer" },
  { id: "lower", label: "Lower body — pants, jeans, trousers, skirt" },
  { id: "full", label: "Dress / full outfit" },
];

export const REF_GROUPS = [
  {
    id: "garment",
    title: "The product",
    hint:
      "Upload EVERY view of the one item you're selling — front, back, side, close-up. All images here describe a single product. Up to 10.",
    optional: false,
    cap: 10,
    primary: true,
  },
  {
    id: "secondary",
    title: "Secondary product",
    hint:
      "A second item to style WITH the main product (e.g. jeans under a sweater). Upload its views and describe it below. Up to 8.",
    optional: true,
    cap: 8,
  },
  {
    id: "model",
    title: "Model — face & likeness",
    hint:
      "Clear shots of the person to use. The app builds ONE consistent model from these and keeps them identical across all five images. Up to 10.",
    optional: false,
    cap: 10,
  },
  {
    id: "shoes",
    title: "Shoes to add",
    hint:
      "Footwear to put on the model — only when the product is a top, bottom or dress. Leave empty if the product is itself the shoes. Up to 10.",
    optional: true,
    cap: 10,
  },
  {
    id: "composition",
    title: "Reference look",
    hint: "An optional styling reference — used as loose guidance only, never copied. Up to 10.",
    optional: true,
    cap: 10,
  },
];

// Baked-in reusable models, grouped by gender via the `gender` field. Pick one
// instead of uploading. Male presets are added here once reference photos exist;
// until then the Men tab uses "Upload your own".
export const MODEL_PRESETS = [
  { key: "amara", name: "Amara", gender: "women", hair: "short natural afro", file: "amara.jpg", files: ["amara.jpg", "amara-b.jpg", "amara-c.jpg", "amara-d.jpg"] },
  { key: "lena", name: "Lena", gender: "women", hair: "brown pixie cut", file: "lena.jpg", files: ["lena.jpg", "lena-b.jpg", "lena-c.jpg", "lena-d.jpg"] },
  { key: "sofia", name: "Sofia", gender: "women", hair: "long dark wavy", file: "sofia.jpg", files: ["sofia.jpg", "sofia-b.jpg", "sofia-c.jpg", "sofia-d.jpg"] },
  { key: "naomi", name: "Naomi", gender: "women", hair: "curly afro", file: "naomi.jpg", files: ["naomi.jpg", "naomi-b.jpg", "naomi-c.jpg", "naomi-d.jpg"] },
  {
    key: "luca",
    name: "Luca",
    gender: "men",
    hair: "short cropped dark",
    face: "fair, lightly tanned skin and a completely clean-shaven face with no beard, moustache or stubble",
    file: "luca.jpg",
    files: ["luca.jpg", "luca-b.jpg", "luca-c.jpg", "luca-d.jpg"],
  },
  {
    key: "malik",
    name: "Malik",
    gender: "men",
    hair: "short buzz cut",
    face: "very deep, rich dark-brown (ebony) skin that must be rendered at its full depth and never lightened or brightened, and a completely clean-shaven face with no beard, moustache or stubble",
    file: "malik.jpg",
    files: ["malik.jpg", "malik-b.jpg", "malik-c.jpg", "malik-d.jpg"],
  },
  {
    key: "leo",
    name: "Leo",
    gender: "men",
    hair: "dark curly",
    face: "medium olive skin and a completely clean-shaven face with no beard, moustache or stubble",
    file: "leo.jpg",
    files: ["leo.jpg", "leo-b.jpg", "leo-c.jpg", "leo-d.jpg"],
  },
  {
    key: "andre",
    name: "Andre",
    gender: "men",
    hair: "short afro",
    face: "deep, dark-brown skin that must be rendered at its full depth and never lightened or brightened, and a completely clean-shaven face with no beard, moustache or stubble",
    file: "andre.jpg",
    files: ["andre.jpg", "andre-b.jpg", "andre-c.jpg", "andre-d.jpg"],
  },
  {
    key: "jaden",
    name: "Jaden",
    gender: "men",
    hair: "short fade",
    face: "rich medium-to-deep brown skin that must be rendered at its true depth and never lightened or brightened, and a completely clean-shaven face with no beard, moustache or stubble",
    file: "jaden.jpg",
    files: ["jaden.jpg", "jaden-b.jpg", "jaden-c.jpg", "jaden-d.jpg"],
  },
];

export const PRODUCT_PRESERVE =
  "EXACT MATCH — all writing, text, lettering, numbers, patterns, prints, graphics, logos and material textures on the item must be reproduced as an EXACT match to the reference images: never approximated, restyled or invented. " +
  "PRODUCT — every image in the product references shows the SAME single item from different angles; treat them as one product and reproduce it with total fidelity: identical colours, fabric, cut, fit, seams, panels, collars, cuffs, trims, buttons, zips, drawstrings, prints and graphics. " +
  "TEXT & PRINT — read any text, lettering, numbers, wordmarks or repeated all-over monogram print on the item closely and reproduce them EXACTLY: same words, spelling, capitalisation, typeface, scale, spacing and placement. If the item has an all-over repeating logo print (for example a repeated word), carry that print faithfully across the whole garment. Never add, remove, translate or invent any text. " +
  "LOGO — reproduce any embroidered pony-and-rider emblem exactly as in the references, facing the same direction (to the right). " +
  "TEXTURE — reproduce the exact fabric and texture shown (pique knit, weave, denim, jersey, ribbing, terry, sheen, drape) with photorealistic, tactile detail; match the real material finish. It must read as the same physical item from the references.";

export const MODEL_RULE =
  "MODEL — recreate ONE single, consistent model based on the model reference photo(s): the same person in every image, with the same face, bone structure, jawline, skin tone, realistic skin texture (natural pores and fine detail, never plastic, waxy or over-airbrushed), hair colour and style, FACIAL HAIR exactly as in the reference (a beard, moustache, stubble or a clean-shaven face — if the reference is clean-shaven keep the face completely clean-shaven with NO beard or stubble, and never add or remove facial hair), eyebrows, eyes, nose, lips, the EXACT same skin tone, undertone and complexion in every shot (do NOT lighten, brighten, wash out, desaturate or shift it between images — if the model has deep, dark or rich skin, preserve its full depth and richness exactly and never render it lighter than the reference), and any distinguishing features. Render a fully believable, photorealistic real human with natural proportions and lifelike skin, and dress that model in the product. The model must be recognisably the IDENTICAL person across the shot — do not change the face, body, facial hair or colouring.";

export const STUDIO =
  "Professional studio fashion e-commerce photograph on a seamless pure-white background, hex #FFFFFF. Soft, even studio lighting, sharp focus, true-to-life colour and material rendering, high detail, natural realistic skin. Expose for the model: render the complexion at its true, accurate depth and NEVER brighten, lighten, wash out or desaturate deep, dark or rich skin tones to match the bright white background — the bright background must not affect how dark the skin reads. Use the framing specified for this shot. No props, no text overlays, no added graphics or logos, no extra people.";

// ---- Body-position variation pools (shared where the framing allows) ----
const V_FRONT = [
  "standing straight with weight evenly balanced, both arms relaxed at the sides, looking directly at the camera",
  "one hand resting in a pocket, the other arm relaxed at the side, looking directly at the camera",
  "both hands resting in pockets, relaxed natural stance, head turned slightly to one side",
  "one hand on the hip with the elbow out, the other arm at the side, weight shifted onto one leg",
  "weight shifted onto one leg with the hip softly cocked, both arms loose at the sides, gaze off to the side",
  "one hand low on the hip, head tilted slightly downward, relaxed natural stance",
  "feet slightly apart, both arms relaxed at the sides, shoulders squared to the camera, looking straight ahead",
  "one hand tucked at the waistband, soft three-quarter turn of the torso while the face stays toward the camera",
  "relaxed contrapposto with one knee slightly bent, both arms loose at the sides, calm expression toward the camera",
  "one arm crossing loosely toward the opposite hip, the other arm at the side, head turned slightly away",
  "both hands resting in the front pockets, feet a little apart, shoulders relaxed, looking straight at the camera",
  "one hand in a front pocket while the body turns to a soft three-quarter, the face staying toward the camera, weight on one leg",
  "a relaxed editorial stance leaning onto the back leg, one hand in a pocket and the gaze directed off to one side",
  "standing tall and squared to the camera, both arms relaxed at the sides, chin level with a calm, confident expression",
  "both hands tucked into the front pockets with the thumbs out, an easy upright posture, looking into the lens",
  "one hand low in a pocket with the opposite shoulder dropped slightly, an unforced natural stance",
];
const V_MID = [
  "both arms relaxed at the sides, shoulders level, looking directly into the lens",
  "one hand resting in a pocket, relaxed shoulders, head facing the camera",
  "arms loosely crossed at the midriff, calm editorial expression toward the camera",
  "one hand on the hip with the torso angled slightly, looking at the camera",
  "hands clasped lightly behind the back, shoulders open, head turned to one side",
  "soft three-quarter rotation of the upper body, near shoulder dropped, gaze toward the camera",
  "one hand resting at the waistband, the other arm at the side, chin level, looking ahead",
  "both hands resting lightly near the hips, relaxed stance, looking at the camera",
  "one hand resting in a front pocket, a subtle three-quarter turn of the torso with the face to the camera",
  "both hands in the front pockets, relaxed shoulders, looking directly into the lens",
  "an editorial framing with the chin slightly lifted and the gaze off to one side, one hand in a pocket",
  "the near shoulder dropped in a relaxed three-quarter, the near hand resting at the hip",
];
const V_SIDE = [
  "arms relaxed at the sides, shoulders tall, looking straight ahead",
  "the near hand resting in a pocket, gaze forward",
  "the near hand on the hip, shoulders tall, looking ahead",
  "looking slightly downward, both arms loose at the sides",
  "a soft forward lean of the shoulders, hands relaxed at the sides",
  "the chin lifted slightly, weight settled onto the back leg, arms at the sides",
  "the near hand tucked into a pocket, the body held in clean profile, gaze forward",
  "a relaxed profile with both hands in the pockets and the weight settled on one leg",
];
const V_BACK = [
  "head turned to look back over one shoulder, both arms relaxed at the sides",
  "head facing away and tilted slightly downward, arms loose at the sides",
  "one hand resting in a back pocket, weight shifted onto one leg",
  "both hands relaxed at the sides, shoulders square to the backdrop",
  "one hand on the hip with a slight twist of the torso",
  "a three-quarter back turn revealing the side of the face, gaze toward the distance",
  "seen from directly behind, both hands resting in the pockets, shoulders relaxed and squared",
  "head turned down and to one side over the shoulder, both hands in the pockets, a relaxed back stance",
  "weight settled on one leg with a subtle shift of the hips, one hand in a back pocket, viewed from behind",
];
const V_LEG_FRONT = [
  "standing with weight evenly balanced, feet roughly hip-width apart",
  "weight shifted onto one leg, the other knee softly bent",
  "captured mid-stride, one foot stepping forward toward the camera",
  "feet together, legs straight, relaxed and natural",
  "one foot turned slightly outward, an easy natural stance",
  "a subtle contrapposto with the hip softly cocked to one side",
  "one hand resting in a front pocket, weight settled on one leg",
  "feet slightly apart, hands resting easily near the hips",
  "both hands resting in the front pockets, weight even, an easy natural stance",
  "one hand in a front pocket, weight on one leg with the other knee soft",
];
const V_LEG_BACK = [
  "standing square to the backdrop, weight even, feet hip-width apart",
  "weight on one leg with the hip softly cocked, seen from behind",
  "one hand resting in a back pocket, relaxed stance",
  "a slight turn of the hips revealing the side of the leg",
  "captured mid-stride stepping away from the camera",
  "feet together, a straight relaxed stance from behind",
  "both hands resting in the back or side pockets, standing square from directly behind",
  "weight on one leg with the hip shifted, one hand in a back pocket, viewed from behind",
];
const V_CLOSE_UPPER = [
  "shoulders squared to the camera, straight-on framing centred on the collar and chest",
  "a subtle three-quarter angle of the torso showing the collar and chest detail",
  "the chin lifted slightly, shoulders relaxed, centred on the upper chest and neckline",
  "a soft turn of one shoulder toward the camera, focus on the placket and chest",
  "squared shoulders with the head facing the camera, tight on the neckline and chest",
  "a gentle torso rotation with the near shoulder forward, emphasising the collar and chest",
  "shoulders squared, straight-on framing tight on the chest emblem and any chest print",
];
const V_CLOSE_LOWER = [
  "centred straight-on on the waistband and front button or fly",
  "a slight angle focused on the front pocket and upper thigh",
  "centred on the waistband with the hands resting easily at the hips",
  "a three-quarter angle showing the front pocket and side seam",
  "focused lower on the hem and the break over the shoe",
  "a three-quarter rear angle centred on the back pocket and seat",
  "a three-quarter rear angle on the back pocket and waistband, the near hand relaxed at the side",
];
const V_CLOSE_FULL = [
  "centred straight-on on the neckline and bodice",
  "a slight angle focused on the waist and how the garment falls",
  "a three-quarter angle showing the bodice and sleeve detail",
  "centred on the neckline with the shoulders relaxed",
  "focused lower on the skirt drape and hemline",
  "a soft turn showing the side seam and waist detail",
];

// ---- Framing sets per garment type. Each slot: label, framing, crop, variations.
// framing = full instruction (used for auto poses); crop = region only, no posture
// (used when a pose photo drives the pose).
export const POSE_SETS = {
  upper: {
    fullFront: {
      label: "Full Front",
      framing:
        "Full-length FRONT view, whole body from head to feet, feet not cropped, model facing the camera, the upper-body garment clearly visible, on a clean seamless studio backdrop, soft even lighting",
      crop: "Full-length view, whole body from head to feet, feet not cropped, clean seamless studio backdrop, soft even lighting",
      variations: V_FRONT,
    },
    midshot: {
      label: "Midshot",
      framing:
        "MIDSHOT view framed from the head to the upper thigh, model facing the camera, the upper-body garment filling most of the frame, on a clean seamless studio backdrop, soft even lighting",
      crop: "Framed from the head to the upper thigh, clean seamless studio backdrop, soft even lighting",
      variations: V_MID,
    },
    sideView: {
      label: "Side View",
      framing:
        "Full SIDE PROFILE at 90 degrees to the camera, framed from the head to mid-thigh, showing the side of the upper-body garment, on a clean seamless studio backdrop, soft even lighting",
      crop: "Framed from the head to mid-thigh, clean seamless studio backdrop, soft even lighting",
      variations: V_SIDE,
    },
    backView: {
      label: "Back View",
      framing:
        "Three-quarter BACK view framed from the head to mid-thigh, the back of the upper-body garment visible, on a clean seamless studio backdrop, soft even lighting",
      crop: "Framed from the head to mid-thigh, clean seamless studio backdrop, soft even lighting",
      variations: V_BACK,
    },
    closeUp: {
      label: "Close-up",
      framing:
        "CLOSE-UP detail from the lower face to mid-torso, centred on the collar, neckline, placket and chest of the top, on a clean seamless studio backdrop, soft even lighting",
      crop: "Close-up framed from the lower face to mid-torso, centred on the collar and chest, clean seamless studio backdrop, soft even lighting",
      variations: V_CLOSE_UPPER,
    },
  },

  lower: {
    fullFront: {
      label: "Full Front",
      framing:
        "Full-length FRONT view, whole body from head to feet, feet not cropped, model facing the camera, the trousers / lower-body garment fully visible from waist to hem, on a clean seamless studio backdrop, soft even lighting",
      crop: "Full-length view, whole body from head to feet, feet not cropped, clean seamless studio backdrop, soft even lighting",
      variations: V_FRONT,
    },
    midshot: {
      label: "Waist Down",
      framing:
        "WAIST-DOWN FRONT view framed from the waist to the feet, the trousers / lower-body garment the clear focus and fully visible including the hem and shoes, model facing the camera, on a clean seamless studio backdrop, soft even lighting",
      crop: "Framed from the waist to the feet, lower-body garment fully visible, clean seamless studio backdrop, soft even lighting",
      variations: V_LEG_FRONT,
    },
    sideView: {
      label: "Side View",
      framing:
        "Full-length SIDE PROFILE at 90 degrees to the camera, framed from the waist to the feet, showing the side drape, length and fit of the trousers, on a clean seamless studio backdrop, soft even lighting",
      crop: "Framed from the waist to the feet, side view, clean seamless studio backdrop, soft even lighting",
      variations: V_LEG_FRONT,
    },
    backView: {
      label: "Back (Seat)",
      framing:
        "WAIST-DOWN BACK view framed from the waist to the feet, seen from directly behind, showing the seat, rear pockets and rear fit of the trousers, on a clean seamless studio backdrop, soft even lighting",
      crop: "Framed from the waist to the feet, from directly behind, clean seamless studio backdrop, soft even lighting",
      variations: V_LEG_BACK,
    },
    closeUp: {
      label: "Detail",
      framing:
        "CLOSE-UP detail of the trousers, filling the frame from the waist to the upper thigh, centred on the waistband, button or fly and front pocket, on a clean seamless studio backdrop, soft even lighting",
      crop: "Close-up framed from the waist to the upper thigh, centred on the waistband and pocket, clean seamless studio backdrop, soft even lighting",
      variations: V_CLOSE_LOWER,
    },
  },

  full: {
    fullFront: {
      label: "Full Front",
      framing:
        "Full-length FRONT view, whole body from head to feet, feet not cropped, the full dress / outfit visible, model facing the camera, on a clean seamless studio backdrop, soft even lighting",
      crop: "Full-length view, whole body from head to feet, feet not cropped, clean seamless studio backdrop, soft even lighting",
      variations: V_FRONT,
    },
    midshot: {
      label: "Three-Quarter",
      framing:
        "THREE-QUARTER-LENGTH FRONT view framed from the head to the knees, showing the bodice and upper skirt of the dress / outfit, model facing the camera, on a clean seamless studio backdrop, soft even lighting",
      crop: "Framed from the head to the knees, clean seamless studio backdrop, soft even lighting",
      variations: V_MID,
    },
    sideView: {
      label: "Side View",
      framing:
        "Full-length SIDE PROFILE at 90 degrees to the camera, head to feet, showing the side silhouette and drape of the dress / outfit, on a clean seamless studio backdrop, soft even lighting",
      crop: "Full-length side view from head to feet, clean seamless studio backdrop, soft even lighting",
      variations: V_SIDE,
    },
    backView: {
      label: "Back View",
      framing:
        "Full-length BACK view from directly behind, head to feet, showing the back of the dress / outfit, on a clean seamless studio backdrop, soft even lighting",
      crop: "Full-length view from behind, head to feet, clean seamless studio backdrop, soft even lighting",
      variations: V_BACK,
    },
    closeUp: {
      label: "Detail",
      framing:
        "CLOSE-UP detail from the lower face to the waist, centred on the neckline and bodice of the dress / outfit, on a clean seamless studio backdrop, soft even lighting",
      crop: "Close-up framed from the lower face to the waist, centred on the neckline and bodice, clean seamless studio backdrop, soft even lighting",
      variations: V_CLOSE_FULL,
    },
  },
};

// Region focus per garment type (used to emphasise the selling region).
export const FOCUS = {
  upper: "upper-body garment (the top)",
  lower: "lower-body garment (the trousers / skirt)",
  full: "full dress / outfit",
};

// Fixed order the five slots appear in.
export const POSE_ORDER = ["fullFront", "midshot", "sideView", "backView", "closeUp"];

// Pick one random variation for a (type, slot); return framing/crop/variation/label/prompt.
export function pickPose(type, slotKey) {
  const set = (POSE_SETS[type] || POSE_SETS.upper)[slotKey];
  if (!set) throw new Error(`Unknown pose: ${type}/${slotKey}`);
  const variation = set.variations[Math.floor(Math.random() * set.variations.length)];
  return { framing: set.framing, crop: set.crop, variation, label: set.label, prompt: `${set.framing}, ${variation}.` };
}

export function getPosePrompt(type, slotKey) {
  return pickPose(type, slotKey).prompt;
}
export function getAllPosePrompts(type) {
  return POSE_ORDER.map((key) => ({ slot: key, label: POSE_SETS[type][key].label, prompt: getPosePrompt(type, key) }));
}

// Compose the full generation prompt for one slot.
// When hasPoseRef is true the pose reference is the FIRST image and there is NO
// anchor, so the reference pose dominates.
export function buildPrompt({
  posePrompt,
  focus,
  gender,
  faceDesc,
  productDesc,
  secondaryDesc,
  hasSecondary,
  hasShoes,
  hasComposition,
  hasPoseRef,
  hasAnchor,
  notes,
}) {
  const order = [];
  if (hasPoseRef) order.push("a POSE REFERENCE (the body pose to replicate — the FIRST image)");
  order.push("the PRIMARY PRODUCT (multiple views of one single item)");
  if (hasSecondary) order.push("the SECONDARY PRODUCT (a second item to wear with it)");
  order.push("the MODEL reference (the person to use)");
  if (hasShoes) order.push("the SHOES to put on the model");
  if (hasComposition) order.push("a REFERENCE LOOK (styling guidance)");
  if (hasAnchor) order.push("an IDENTITY ANCHOR (the definitive look of the model)");
  const orderLine = `You are given reference images, in this order: ${order.join("; then ")}.`;

  const prodLine =
    productDesc && productDesc.trim()
      ? ` PRIORITY ITEM — the product to feature is: ${productDesc.trim()}. Reproduce THIS item exactly and treat it as the hero of the image.${
          hasSecondary
            ? ""
            : " Any other garments present are secondary styling only — keep them simple and neutral, and never let them alter or compete with the priority item."
        }`
      : "";
  const secondaryLine = hasSecondary
    ? ` SECONDARY PRODUCT — the model also wears a second item${
        secondaryDesc && secondaryDesc.trim() ? `: ${secondaryDesc.trim()}` : " shown in the secondary-product references"
      }. Reproduce it faithfully from its reference images (colours, fabric, cut, any text and texture), worn naturally together with the priority item. Keep it clearly secondary so it complements the hero item without overpowering it.`
    : "";
  const focusLine = focus
    ? ` FRAMING FOCUS — this shot is selling the ${focus}; keep it fully in frame, in sharp focus and the clear subject of the image.`
    : "";
  const poseRefLine = hasPoseRef
    ? " POSE (mandatory) — the FIRST image is a POSE REFERENCE. Replicate its body pose exactly: overall stance, body and camera angle, weight distribution and the position of the legs, hips, torso, arms, hands and head. Take ONLY the pose from it and completely ignore its clothing, body shape, face and background. Do NOT default to a straight standing front pose — the generated pose must visibly match the reference."
    : "";
  const shoesLine = hasShoes
    ? " FOOTWEAR — put the shoes from the shoe reference on the model and reproduce them faithfully (colours, materials, logos and exact text)."
    : "";
  const compLine = hasComposition
    ? " REFERENCE LOOK — use it ONLY as loose guidance for styling and mood; do not copy it."
    : "";
  const anchorLine = hasAnchor
    ? " IDENTITY ANCHOR — the identity-anchor image is the DEFINITIVE appearance of the model. Reproduce exactly the same person as in it: same face, bone structure, hair, eyes, lips, the SAME exact skin tone, undertone and complexion (never lighter, brighter or washed out — preserve the full depth of deep or dark skin), and the SAME facial hair or clean-shaven face (never add stubble or a beard that is not in the anchor, and never remove facial hair that is). Use it for IDENTITY ONLY; keep the model identical to the anchor, but do not copy its pose."
    : "";
  const noteLine = notes && notes.trim() ? ` Additional styling notes to honour exactly: ${notes.trim()}.` : "";
  const genderLine = gender ? ` The model is an adult ${gender === "men" ? "man" : "woman"}.` : "";
  const faceLine =
    faceDesc && faceDesc.trim()
      ? ` The model has ${faceDesc.trim()}. Reproduce this identically in every shot — keep this EXACT skin tone, depth and complexion (never lighter, brighter, washed out or more desaturated than described) and this exact facial-hair state in all five images.`
      : "";

  return `Generate a single photorealistic fashion photograph of the model wearing the exact product from the references, in the framing and pose described below.

${orderLine}
${poseRefLine}

${PRODUCT_PRESERVE}${prodLine}${secondaryLine}${focusLine}

${MODEL_RULE}${genderLine}${faceLine}${shoesLine}${compLine}${anchorLine}${noteLine}

POSE / FRAMING — ${posePrompt}

${STUDIO}`;
}

// Re-frame the Full Front result into another shot. The FIRST image is that
// finished photo (the definitive person + outfit); ONLY the framing/pose change.
// This is the strongest identity lock available in this API — the other four
// shots become reframings of ONE rendered person instead of four new people.
export function buildReframePrompt({ posePrompt, gender, faceDesc, productDesc, notes }) {
  const genderWord = gender === "men" ? "man" : gender === "women" ? "woman" : "person";
  const faceClause =
    faceDesc && faceDesc.trim() ? ` The model has ${faceDesc.trim()} — preserve this exactly.` : "";
  const prodClause = productDesc && productDesc.trim() ? ` The product is: ${productDesc.trim()}.` : "";
  const noteLine = notes && notes.trim() ? ` Additional styling notes to honour exactly: ${notes.trim()}.` : "";
  return `Re-frame an existing studio fashion e-commerce photograph into a NEW camera angle and body pose, keeping the SAME person and the SAME outfit. The FIRST image is the definitive, finished photo — the exact ${genderWord} and the exact clothing in it must be preserved.

KEEP UNCHANGED from the first image — this is the single most important requirement: the person's exact face and facial features (face shape, bone structure, jawline, brow, eyes, nose, lips, ears), exact hairstyle and hairline, exact skin tone, undertone and complexion (never lighter, brighter or washed out — preserve the full depth of deep or dark skin), and exact facial-hair state (do not add or remove any beard, moustache or stubble), plus the overall build. It must be unmistakably the SAME individual — NOT a similar-looking or different person, NOT a sibling or lookalike. Also keep the garment identical: same colours, fabric, cut and fit, and all text, lettering, prints, graphics and logos (including any pony-and-rider emblem, kept facing right).${faceClause}${prodClause}

CHANGE ONLY the camera framing and the body pose to the following — ${posePrompt}${noteLine}

The other images are supporting references: the product (use only to keep the garment's details and text exact) and the model's face (use only to reinforce the identity). Do not introduce a new person, do not restyle the outfit, and do not change the lighting style.

${PRODUCT_PRESERVE}

${STUDIO}`;
}

// Prompt for the per-image "refine" box: edit the FIRST image (the current
// result) using the user's instruction, while protecting identity, product
// fidelity and the white background.
export function buildRefinePrompt(instruction) {
  return `You are refining an existing studio fashion e-commerce photograph. The FIRST image is the current photo to edit. The remaining images are references: the product (for exact fidelity) and the model (for identity).

APPLY THIS REQUESTED CHANGE to the first image: ${instruction}

Preserve the identity of the person (same face, bone structure, jawline, the exact same skin tone, undertone and complexion, realistic skin texture, hair colour and style, the same facial hair or clean-shaven face with no added or removed beard or stubble, eyebrows, eyes, nose and lips) and the exact product with total fidelity (same colours, fabric, cut, fit, seams, trims, buttons, zips, and all text, lettering, prints, graphics and logos — including any pony-and-rider emblem facing right). Keep the seamless pure-white #FFFFFF studio background. Apply ONLY the requested change and keep everything else as close to the original first image as possible. Do not add new people, props, text or graphics.

${PRODUCT_PRESERVE}

${STUDIO}`;
}
