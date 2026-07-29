// lib/poses.js
// Prompt rules, pose library and prompt builders for Five Poses v2.
//
// Everything here is garment-neutral and brand-neutral. No brand name is ever
// written into a prompt: brand marks live on the physical product and must be
// transferred from the reference image, never described or re-drawn from words.

import { refLabel, routeFor } from './engines';

// ---------------------------------------------------------------------------
// 1. PATTERN LOCK  -  the core of this rebuild
// ---------------------------------------------------------------------------
// The failure being fixed: the engine treats a print as a *style* to repaint
// instead of *data* to transfer. Repeats drift, checks bend, motifs melt, and
// that distortion then propagates into the model's anatomy. These rules
// reframe the whole job as a transfer operation.

export const PATTERN_LOCK = `PATTERN AND PRINT LOCK (HIGHEST PRIORITY, OVERRIDES EVERYTHING ELSE):
- Treat every pattern, print, check, stripe, weave, jacquard, embroidery, badge, emblem and letterform on the reference garment as fixed photographic data to be transferred pixel-faithfully. It is not a style to reinterpret, redraw, restyle or improve.
- Preserve the exact repeat: the same motif shape, the same spacing between motifs, the same number of repeats across the chest width, and the same motif scale relative to the garment and to the body.
- Preserve stripe and check geometry exactly: identical stripe count, stripe widths, colour order and check grid. Do not thin, thicken, add or drop a single line.
- The pattern must follow the three-dimensional form of the body. It compresses over the chest and shoulder curve, bends around the sleeve, and breaks at folds and creases, but the motif itself must never stretch, smear, melt, ripple, duplicate, warp or change shape.
- Pattern alignment at seams, plackets, side seams, shoulder seams, cuffs and collar must match how the reference garment is actually constructed.
- Do not invent, add, remove, resize or re-space any motif. Do not fill empty fabric with new pattern. Do not simplify a busy pattern into a cleaner one.
- Reproduce any lettering or numerals character for character, with the same typeface weight, spacing, curvature and placement. Never generate text that is not present in the reference. Never correct, translate or tidy existing text.
- Any emblem, crest, badge or logo keeps the exact orientation and facing direction shown in the reference. Never mirror it, rotate it, recolour it or restyle it.
- Where a region of the garment is hidden in the reference, continue the established repeat logically rather than inventing a new motif.
- Never blur, smooth, denoise or paint over the weave. Fabric grain, knit loops, ribbing and pile must stay visible at full resolution.
- If pattern accuracy and pose ever conflict, pattern accuracy wins. Adjust the pose, never the pattern.`;

export const PATTERN_LOCK_STRICT = `ADDITIONAL PATTERN CONSTRAINTS (STRICT):
- Before rendering, read the reference pattern as a measured grid: count the motifs across and down, note the repeat pitch, and hold those counts constant in the output.
- Small-scale repeats (micro-checks, pin dots, fine stripes, houndstooth, tight florals) are the highest risk of collapse. Render them at full sharpness rather than averaging them into a texture or a flat colour field.
- Do not apply any global stylisation, painterly rendering, denoising or beautification pass that would soften pattern edges.`;

export const PATTERN_LOCK_FORENSIC = `ADDITIONAL PATTERN CONSTRAINTS (FORENSIC):
- The output will be compared against the reference side by side at 100 percent zoom. Any change in motif count, motif shape, repeat pitch, colour order or letterform is a failure.
- Treat the pattern close-up reference as the ground truth for motif detail and the full garment reference as the ground truth for placement and scale. Where they disagree, follow the close-up for detail and the full garment for layout.
- Reproduce imperfections faithfully: slight print misregistration, uneven dye, visible stitch lines and worn edges are part of the product and must survive.`;

export function patternLockFor(level) {
  if (level === 'forensic') return `${PATTERN_LOCK}\n\n${PATTERN_LOCK_STRICT}\n\n${PATTERN_LOCK_FORENSIC}`;
  if (level === 'strict') return `${PATTERN_LOCK}\n\n${PATTERN_LOCK_STRICT}`;
  return PATTERN_LOCK;
}

// ---------------------------------------------------------------------------
// 2. Core fidelity rules
// ---------------------------------------------------------------------------

export const STUDIO = `STUDIO AND LIGHTING:
- Clean seamless pure white e-commerce studio background, evenly lit, no gradient banding, no visible backdrop seam, no props, no furniture, no text or watermark anywhere in the frame.
- Large soft key light slightly camera-left with a broad fill on the opposite side and a soft overhead. Even, wraparound illumination with no split lighting, no hard shadow line down the face or body, and no colour cast.
- Soft contact shadow under the shoes only. Nothing else casts a shadow onto the backdrop.
- Neutral white balance. Exposure holds detail in both the brightest fabric highlight and the darkest fold.
- Do not brighten, lift, lighten or wash out the subject to separate them from the white background. The background is lit separately from the subject.
- Shot on a full-frame camera with an 85mm lens at f/8, sharp front to back, commercial catalogue quality.`;

export const MODEL_RULE = `MODEL IDENTITY:
- The same individual person appears in every frame of the set: identical face, bone structure, jawline, nose, eye shape, eyebrows, hairline, hairstyle, hair colour, body proportions, height and build.
- Skin tone is identical in every frame. Never lighten, brighten, whiten, desaturate or otherwise shift the model's complexion between shots or from the reference. Preserve the exact depth and undertone of the skin.
- Hands have five fingers, natural proportions, and short, neat, consistently shaped nails of the same length in every frame.
- Teeth are natural and slightly irregular with matte enamel, never uniform, never glossy, never plastic-white.
- Makeup, jewellery and grooming stay identical across the set.`;

export const PRODUCT_PRESERVE = `GARMENT CONSTRUCTION:
- The garment in the output is the exact garment in the reference. Same cut, same length, same fit, same drape, same collar shape, same cuff and hem finish, same pocket count and placement.
- Same fastening exactly as referenced: the same number of buttons in the same positions, or no buttons at all if there are none. Never add a drawstring, toggle, zip, button, pocket, seam, panel or trim that is not in the reference.
- Same colour. Match hue, saturation and value to the reference under neutral studio light. No colour drift across the set.
- Same material behaviour: knit reads as knit, twill as twill, fleece as fleece, satin as satin. Preserve pile, ribbing, sheen and weight.
- Collar, cuffs, hem and plackets keep their reference proportions and any tipping or contrast banding stays in the same order and width.`;

export const HUMAN_REALISM = `HUMAN REALISM:
- Anatomically correct, naturally balanced posture with believable weight distribution and joint articulation.
- Natural, relaxed facial expression suited to catalogue work. Eyes correctly aligned and focused, both irises the same colour and size.
- Hair has individual strands and natural fall, not a moulded helmet shape.
- Footwear is scaled correctly to the body, sits flat on the floor plane, and both shoes match.
- No extra or missing limbs, no fused fingers, no duplicated features, no floating garment edges.`;

export const SKIN_REALISM = `SKIN REALISM:
- Matte, natural skin with visible pores, fine micro-texture and peach fuzz. Real photographic skin, not rendered skin.
- No oily sheen, no plastic or waxy surface, no airbrushed or blurred complexion, no blotchy patches, no over-smoothed forehead or cheeks.
- Preserve natural texture variation across face, neck, chest, arms and hands.
- These are texture instructions only. Do not change the model's skin tone in any way.`;

export const FRAMING_RULE = `FRAMING:
- Vertical portrait frame, model centred, generous even margin on both sides.
- Horizon-level camera at chest height unless the pose specifies otherwise.
- The crop stated in the pose description is exact. Do not zoom out to a wider shot or in to a tighter one.`;

// The twelve rules, kept as a list so they can be shown in the UI and audited.
export const FIDELITY_RULES = [
  'Pattern repeat, scale and motif shape are transferred, never redrawn.',
  'Lettering and emblems are reproduced character for character and never mirrored.',
  'Garment construction matches the reference: no invented buttons, drawstrings or seams.',
  'Colour holds across the whole set with no drift between frames.',
  'Fabric texture and weave stay visible and are never smoothed away.',
  'One consistent model identity across all five frames.',
  'Skin tone is never lightened, brightened or shifted.',
  'Skin is matte and pored, never waxy, oily or airbrushed.',
  'Hands, nails and teeth stay natural and consistent frame to frame.',
  'Even studio lighting with no split lighting or hard facial shadow line.',
  'Footwear scaled correctly and seated on the floor plane.',
  'Pure white seamless background, no props, no text, no watermark.',
];

// ---------------------------------------------------------------------------
// 3. Pose library
// ---------------------------------------------------------------------------
// Format: view type -> stance and arm position -> framing with explicit crop.

export const POSES = [
  {
    id: 'full-front',
    name: 'Full Front',
    anchor: true,
    description:
      'Straight-on frontal view facing the camera squarely. Standing tall with weight evenly on both feet, feet a little under shoulder width apart, shoulders level and square to the lens, both arms relaxed and hanging naturally at the sides with a small gap between arm and torso so the full side seam of the garment reads. Full-length crop from just above the top of the head to just below the soles of the shoes, with even margin left and right.',
  },
  {
    id: 'three-quarter',
    name: 'Three-Quarter Turn',
    description:
      'Body rotated approximately forty-five degrees to the camera-left while the face turns back to look directly into the lens. Weight settled on the back leg with the front foot slightly forward, near arm relaxed at the side, far arm hanging naturally so the shoulder line and side seam stay visible. Full-length crop from just above the top of the head to just below the soles of the shoes.',
  },
  {
    id: 'side-profile',
    name: 'Side Profile',
    description:
      'Full ninety-degree side view with the body in profile to the camera and the head facing forward in the same direction as the body. Standing upright with feet together, arms hanging straight and relaxed at the sides, posture neutral so the garment silhouette, side seam and hem line read cleanly. Full-length crop from just above the top of the head to just below the soles of the shoes.',
  },
  {
    id: 'full-back',
    name: 'Full Back',
    description:
      'Straight-on rear view with the back squarely to the camera and the head facing away, no face visible. Standing tall with weight even on both feet, shoulders level, arms relaxed at the sides with a small gap from the torso so the back panel, yoke and hem read fully. Full-length crop from just above the top of the head to just below the soles of the shoes.',
  },
  {
    id: 'detail-half',
    name: 'Half Body Detail',
    description:
      'Frontal upper-body view facing the camera squarely with a slight lift of the chin. Shoulders level, one hand resting relaxed at the hip and the other loose at the side so the chest, placket, collar and print area are unobstructed. Crop from just above the top of the head to mid-thigh, framed tighter than the full-length shots so garment detail, weave and print sit large in frame.',
  },
];

export function poseById(id) {
  return POSES.find((p) => p.id === id) || POSES[0];
}

// ---------------------------------------------------------------------------
// 4. Model presets
// ---------------------------------------------------------------------------
// Descriptors carry explicit anti-lightening language on every dark-skin preset.

export const MODEL_PRESETS = [
  {
    id: 'from-reference',
    name: 'Use uploaded model reference',
    descriptor:
      'The model is the exact person shown in the model reference image. Match their face, complexion, hair and build precisely. Preserve their skin tone exactly as photographed with no lightening or brightening whatsoever.',
  },
  {
    id: 'male-deep',
    name: 'Male, deep skin tone',
    descriptor:
      'A male model in his late twenties with deep, richly pigmented dark brown skin with warm undertones, short natural hair, a clean-shaven jaw and an athletic build. Render the complexion at its true depth. Do not lighten, brighten, grey down or wash out the skin under studio light; the highlights on dark skin stay warm and specular rather than turning pale.',
  },
  {
    id: 'female-deep',
    name: 'Female, deep skin tone',
    descriptor:
      'A female model in her mid twenties with deep, richly pigmented dark brown skin with warm undertones, natural hair worn back off the face, and a slim athletic build. Render the complexion at its true depth. Do not lighten, brighten, grey down or wash out the skin under studio light; the highlights on dark skin stay warm and specular rather than turning pale.',
  },
  {
    id: 'male-medium',
    name: 'Male, medium skin tone',
    descriptor:
      'A male model in his late twenties with medium warm brown skin, short dark hair, a clean-shaven jaw and an athletic build. Hold the complexion at its true depth with no lightening under studio light.',
  },
  {
    id: 'female-medium',
    name: 'Female, medium skin tone',
    descriptor:
      'A female model in her mid twenties with medium warm brown skin, dark hair worn back off the face and a slim athletic build. Hold the complexion at its true depth with no lightening under studio light.',
  },
  {
    id: 'male-light',
    name: 'Male, light skin tone',
    descriptor:
      'A male model in his late twenties with light skin with neutral undertones, short dark hair, a clean-shaven jaw and an athletic build.',
  },
  {
    id: 'female-light',
    name: 'Female, light skin tone',
    descriptor:
      'A female model in her mid twenties with light skin with neutral undertones, dark hair worn back off the face and a slim athletic build.',
  },
];

export function modelPresetById(id) {
  return MODEL_PRESETS.find((m) => m.id === id) || MODEL_PRESETS[0];
}

// ---------------------------------------------------------------------------
// 5. Reference map
// ---------------------------------------------------------------------------

const ROLE_TEXT = {
  garment:
    'the garment product shot. This is the ground truth for cut, colour, construction, pattern layout and every mark printed or stitched on it.',
  pattern:
    'a close-up of the garment pattern. This is the ground truth for motif shape, repeat pitch, weave detail and lettering. Read it at full resolution.',
  model:
    'the model reference. Match this person exactly: face, hair, build and skin tone at its true depth.',
  footwear: 'the footwear to be worn, to be reproduced exactly and scaled correctly to the body.',
  anchor:
    'the approved anchor frame from this same set. Match the person, the garment rendering, the pattern placement, the colour and the lighting in it exactly. It defines the look of the whole set.',
};

export function buildReferenceMap(engine, refs) {
  if (!refs || !refs.length) return '';
  const lines = refs.map(
    (ref, i) => `- ${refLabel(engine, i)} is ${ROLE_TEXT[ref.role] || 'a reference image.'}`
  );
  return `REFERENCE MAP:\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// 6. Prompt builders
// ---------------------------------------------------------------------------

function assemble(parts) {
  return parts.filter(Boolean).join('\n\n');
}

function engineTail(engine) {
  const route = routeFor(engine);
  if (route.provider === 'fal') {
    return 'Output a single photograph. Do not add borders, captions, labels, collages, split panels or contact sheets.';
  }
  return 'Return one photographic image only. Do not return a collage, a grid, a mock-up or any explanatory text drawn into the image.';
}

// Main generation prompt for one pose.
export function buildPrompt({
  engine,
  pose,
  refs,
  modelDescriptor,
  patternLevel = 'strict',
  hasAnchor = false,
  notes = '',
}) {
  const p = typeof pose === 'string' ? poseById(pose) : pose;

  const task = `TASK: Produce one professional fashion e-commerce photograph of a model wearing the exact garment shown in the references, in a white studio, in the pose described below. This is a garment transfer job, not a redesign. Every physical detail of the garment comes from the reference images; only the pose, the body and the lighting are being created.`;

  const poseBlock = `POSE - ${p.name}:\n${p.description}`;

  const anchorBlock = hasAnchor
    ? `SET CONSISTENCY:\n- An approved anchor frame from this set is supplied. The person, garment rendering, pattern placement and scale, colour, and lighting in this frame must match the anchor exactly. Only the pose changes.\n- Do not re-interpret the pattern between frames. The motif count and repeat pitch that appear in the anchor are the motif count and repeat pitch here.`
    : '';

  return assemble([
    task,
    buildReferenceMap(engine, refs),
    patternLockFor(patternLevel),
    PRODUCT_PRESERVE,
    `MODEL:\n${modelDescriptor}`,
    MODEL_RULE,
    SKIN_REALISM,
    HUMAN_REALISM,
    STUDIO,
    FRAMING_RULE,
    poseBlock,
    anchorBlock,
    notes ? `ADDITIONAL DIRECTION:\n${notes}` : '',
    engineTail(engine),
  ]);
}

// Reframe an existing generated frame to a different crop without regenerating.
export function buildReframePrompt({ engine, refs, crop = 'full length', patternLevel = 'strict' }) {
  return assemble([
    `TASK: Reframe the supplied photograph to a ${crop} crop. Keep the same person, the same garment, the same pose, the same lighting and the same white studio background. This is a crop and recompose operation only.`,
    buildReferenceMap(engine, refs),
    patternLockFor(patternLevel),
    `REFRAME RULES:\n- Do not re-render the garment or the face. Do not change pose, expression, hands or footwear.\n- Keep the model centred with even margin left and right.\n- Preserve resolution and sharpness. Do not upscale softly or repaint detail.`,
    FRAMING_RULE,
    engineTail(engine),
  ]);
}

// Targeted correction pass on one frame.
export function buildRefinePrompt({ engine, refs, instruction, patternLevel = 'forensic' }) {
  return assemble([
    `TASK: Apply one targeted correction to the supplied photograph. Change only what the correction asks for. Everything else in the frame stays pixel-identical: same person, same face, same skin tone, same garment, same pattern, same pose, same crop, same lighting, same background.`,
    buildReferenceMap(engine, refs),
    `CORRECTION REQUESTED:\n${instruction}`,
    patternLockFor(patternLevel),
    PRODUCT_PRESERVE,
    MODEL_RULE,
    SKIN_REALISM,
    `REFINE RULES:\n- Do not use this pass as an excuse to restyle, beautify, smooth or relight the image.\n- Do not lighten the model's skin. Do not soften skin texture.\n- Do not redraw the pattern. If the correction is unrelated to the pattern, the pattern must come through untouched.`,
    engineTail(engine),
  ]);
}
