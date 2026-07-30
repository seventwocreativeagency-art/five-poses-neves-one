// lib/poses.js
// Prompt rules, pose library and prompt builders for Five Poses v2.
//
// Everything here is garment-neutral and brand-neutral. No brand name is ever
// written into a prompt: brand marks live on the physical product and must be
// transferred from the reference image, never described or re-drawn from words.

import { refLabel, routeFor } from './engines';
import { CHILD_RULE } from './models';
import { buildDefectRules } from './qa';

// ---------------------------------------------------------------------------
// 1. PATTERN LOCK  -  one ruleset, always on
// ---------------------------------------------------------------------------
// Previously split across standard / strict / forensic tiers. Merged into a
// single block so every generation gets the full treatment and there is no
// setting to get wrong.
//
// The failure being fixed: the engine treats a print as a *style* to repaint
// instead of *data* to transfer. Repeats drift, checks bend, motifs melt, and
// that distortion then propagates into the model's anatomy.

export const PATTERN_LOCK = `PATTERN AND PRINT LOCK (HIGHEST PRIORITY, OVERRIDES EVERYTHING ELSE):
- Treat every pattern, print, check, stripe, weave, jacquard, embroidery, badge, emblem and letterform on the reference garment as fixed photographic data to be transferred pixel-faithfully. It is not a style to reinterpret, redraw, restyle or improve.
- Read the reference pattern as a measured grid before rendering: count the motifs across and down, note the repeat pitch, and hold those counts constant in the output.
- Preserve the exact repeat: the same motif shape, the same spacing between motifs, the same number of repeats across the chest width, and the same motif scale relative to the garment and to the body.
- Preserve stripe and check geometry exactly: identical stripe count, stripe widths, colour order and check grid. Do not thin, thicken, add or drop a single line.
- The pattern must follow the three-dimensional form of the body. It compresses over the chest and shoulder curve, bends around the sleeve, and breaks at folds and creases, but the motif itself must never stretch, smear, melt, ripple, duplicate, warp or change shape.
- Pattern alignment at seams, plackets, side seams, shoulder seams, cuffs and collar must match how the reference garment is actually constructed.
- Do not invent, add, remove, resize or re-space any motif. Do not fill empty fabric with new pattern. Do not simplify a busy pattern into a cleaner one.
- Reproduce any lettering or numerals character for character, with the same typeface weight, spacing, curvature and placement. Never generate text that is not present in the reference. Never correct, translate or tidy existing text.
- Any emblem, crest, badge or logo keeps the exact orientation and facing direction shown in the reference. Never mirror it, rotate it, recolour it or restyle it.
- Where a region of the garment is hidden in the reference, continue the established repeat logically rather than inventing a new motif.
- Never blur, smooth, denoise or paint over the weave. Fabric grain, knit loops, ribbing and pile must stay visible at full resolution.
- Small-scale repeats (micro-checks, pin dots, fine stripes, houndstooth, tight florals) are the highest risk of collapse. Render them at full sharpness rather than averaging them into a texture or a flat colour field.
- Do not apply any global stylisation, painterly rendering, denoising or beautification pass that would soften pattern edges.
- Reproduce imperfections faithfully: slight print misregistration, uneven dye, visible stitch lines and worn edges are part of the product and must survive.
- The output will be compared against the reference side by side at 100 percent zoom. Any change in motif count, motif shape, repeat pitch, colour order or letterform is a failure.
- If pattern accuracy and pose ever conflict, pattern accuracy wins. Adjust the pose, never the pattern.`;

// Written against the specific failures seen in real output: stripe pitch
// drifting across a panel, repeats breaking at the yoke and armhole, buttons
// swallowed by a busy ground, emblems dissolving into the print, and dense
// micro-repeats banding into a texture.
export const OBSERVED_FAILURES = `KNOWN FAILURE MODES TO AVOID (these are the exact errors that have to stop):
- STRIPE PITCH DRIFT: stripe spacing must not widen, narrow or fan out across a panel. The distance between stripes stays constant across the chest, back and sleeves, changing only as perspective and body curvature require. Stripes stay parallel and do not converge, wobble or splay.
- BROKEN LINES: a stripe or contour line must run unbroken from shoulder to hem. Do not let a line stop, jump sideways, fade out mid-panel, restart at a different pitch, or dissolve into the fabric. Lines break only where the garment is genuinely interrupted by a seam, a fold, a pocket or an overlapping arm.
- SEAM DISCONTINUITY: at the yoke, shoulder seam, armhole, side seam, cuff and collar join, the pattern either matches across the seam or steps by a consistent, deliberate offset the way real cut-and-sewn fabric does. Never let the repeat scramble, mirror, rotate or restart randomly at a seam.
- LOST BUTTONS AND PLACKET: every button stays a distinct, physically separate object sitting on top of the fabric with its own edge, thickness and shadow, even on a dark or busy ground. Buttons must not be absorbed into the print, blurred away, reduced in number or repositioned. The placket stays a readable vertical band with its own edge, and the button count matches the reference exactly.
- EMBLEM DISSOLVE: any embroidered emblem, crest or logo stays a crisp raised object with clean edges and readable internal detail, clearly separated from the pattern behind it. It must not blend into the print, lose limbs or internal shapes, gain stray threads, change colour, change size or change facing direction.
- MICRO-REPEAT BANDING: dense small-scale prints must resolve as individual discrete motifs with clean gaps between them. They must not average into a haze, smear into horizontal or vertical banding, form moire, or turn into a flat mottled texture. If a motif cannot be drawn cleanly at this size, render it sharper, never smoother.
- MOTIF DEFORMATION: geometric shapes keep their true geometry. Straight edges stay straight, right angles stay right angles, diagonals keep their angle, and repeating blocks stay congruent with one another. Shapes must not melt, bulge, taper, curve or fuse with neighbouring shapes anywhere except where genuine fabric folds bend them, and even there the shape stays recognisable.
- COLLAR AND CUFF CONTRAST: where the collar, cuff or hem is a solid contrast colour against a patterned body, that solid area stays completely clean with a hard edge. Pattern must not creep into it, and it must not pick up motifs from the body.`;

export const PATTERN_RULES = `${PATTERN_LOCK}\n\n${OBSERVED_FAILURES}`;

// ---------------------------------------------------------------------------
// 2. Core fidelity rules
// ---------------------------------------------------------------------------

export const STUDIO = `STUDIO AND LIGHTING:
- Clean seamless PURE WHITE e-commerce studio background, hex #FFFFFF exactly. Not cream, not ivory, not beige, not warm grey, not off-white. If the reference photographs have a warm or tinted backdrop, do not carry that tint across — the output backdrop is neutral pure white regardless of what the references show. Evenly lit, no gradient banding, no visible backdrop seam, no props, no furniture, no text or watermark anywhere in the frame.
- Large soft key light slightly camera-left with a broad fill on the opposite side and a soft overhead. Even, wraparound illumination with no split lighting, no hard shadow line down the face or body, and no colour cast.
- Soft contact shadow under the shoes only. Nothing else casts a shadow onto the backdrop.
- Neutral white balance. Exposure holds detail in both the brightest fabric highlight and the darkest fold.
- Expose for the subject, not the backdrop. Do not brighten, lift, lighten or wash out the person to separate them from the white background. The background is lit separately from the subject and must not affect how dark the skin reads.
- Shot on a full-frame camera with an 85mm lens at f/8, sharp front to back, commercial catalogue quality.`;

// The garment references supplied for catalogue work are almost always
// on-model shots of a different person. Without this, the engine blends that
// person with the model reference, or simply invents someone.
export const IDENTITY_LOCK = `MODEL IDENTITY LOCK (READ BEFORE ANYTHING ELSE):
- The model reference photographs are the ONLY source of the person's identity. The face, bone structure, jawline, nose, mouth, eyes, eyebrows, hairline, hair length, hair colour, hair texture and skin tone all come from those photographs and nowhere else.
- ANY PERSON VISIBLE IN THE GARMENT REFERENCE PHOTOGRAPHS IS NOT THE MODEL. They are present only because the product was photographed on a body. Ignore them completely: do not copy their face, their hair, their hair length, their build, their skin tone or their pose. Take only the garment from those images.
- Do not blend, average or merge features from two different people. If the garment reference shows a person with long hair and the model reference has short hair, the output has the model reference's short hair, and the reverse.
- Do not invent a new person. Do not substitute a generic catalogue face. If the model reference shows a specific individual, that exact individual appears in the output.
- The person must be recognisable as the same individual as the model reference at a glance, in every frame of the set.`

export const MODEL_RULE = `MODEL IDENTITY:
- The same individual person appears in every frame of the set: identical face, bone structure, jawline, nose, eye shape, eyebrows, hairline, hairstyle, hair colour, body proportions, height and build.
- Skin tone is identical in every frame. Never lighten, brighten, whiten, desaturate or otherwise shift the complexion between shots or from the reference. Preserve the exact depth and undertone of the skin.
- Facial hair matches the reference exactly. If the reference is clean-shaven, keep the face completely clean-shaven with no beard, moustache or stubble. Never add or remove facial hair.
- Hands have five fingers, natural proportions, and short, neat, consistently shaped nails of the same length in every frame.
- Teeth, when visible, are natural and slightly irregular with matte enamel, never uniform, never glossy, never plastic-white.
- Makeup, jewellery and grooming stay identical across the set.`;

// The single most-reported quality failure. Written as hard prohibitions
// because soft phrasing gets averaged away.
export const SKIN_REALISM = `SKIN REALISM (CRITICAL — JUDGED AT 100 PERCENT ZOOM):
- Skin must read as a real photograph of real human skin, captured by a camera. Not rendered skin, not illustrated skin, not retouched-to-death skin.
- Surface finish is MATTE. Real skin diffuses light. Any specular highlight is small, broken up by texture, and confined to the natural high points of the nose, cheekbones, brow and chin.
- FORBIDDEN, these are failures: an oily or greasy sheen; a wet, glossy or lacquered look; a plastic, vinyl, rubber or mannequin surface; a waxy or candle-like finish; an airbrushed, blurred, smoothed or poreless face; the uniform putty-smooth complexion typical of AI-generated portraits; blotchy or patchy tonal mottling; a doll-like face.
- Visible micro-texture is required across the whole of the skin: individual pores, fine surface grain, faint natural lines around the eyes and mouth, peach fuzz catching the light along the jaw and upper cheek, and slight natural irregularity in tone.
- Texture must vary by region the way real skin does: finer and tighter across the forehead and nose, softer on the cheeks, looser and more lined at the neck, coarser and more structured on the hands and knuckles.
- Keep real, natural imperfection: faint blemishes, small moles, subtle unevenness, natural asymmetry. A face with no imperfection at all reads as synthetic.
- On deep and dark skin the highlights stay warm and specular and the texture stays visible. Do not resolve dark skin into a flat, glossy, plastic-looking sheen, and do not lighten it to reveal detail — hold the depth and render the texture within it.
- These are texture and finish instructions only. Do not change the subject's skin tone in any way.`;

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

// The audit list surfaced in the UI.
export const FIDELITY_RULES = [
  'Pattern repeat, scale and motif shape are transferred, never redrawn.',
  'Stripe pitch stays constant; lines run unbroken and never fan out or restart.',
  'Repeats match or step cleanly at yoke, armhole, side seam, cuff and collar.',
  'Buttons stay separate raised objects and are never swallowed by a busy print.',
  'Emblems keep crisp edges, internal detail and reference facing direction.',
  'Dense micro-prints resolve as discrete motifs, never haze, banding or moire.',
  'Geometric motifs keep true geometry: straight edges, congruent repeats.',
  'Colour holds across the whole set with no drift between frames.',
  'Fabric texture and weave stay visible and are never smoothed away.',
  'Skin is matte and pored — never oily, waxy, plastic, airbrushed or AI-looking.',
  'Skin tone is never lightened, brightened or shifted.',
  'One consistent model identity across all five frames.',
  'Each shot is the camera angle it is named for, not a variation on the front.',
  'Hands, nails and teeth stay natural and consistent frame to frame.',
  'Even studio lighting with no split lighting or hard facial shadow line.',
  'Pure white seamless background, no props, no text, no watermark.',
];

// ---------------------------------------------------------------------------
// 3. Pose library  -  angles locked
// ---------------------------------------------------------------------------
// Each pose declares `angles`: the model reference-photo suffixes to send with
// it. Feeding the camera angle as an image is a far stronger instruction than
// describing it, and it is what stops every shot collapsing into a front view.
//
//   ''   = straight-on front      -b = three-quarter turn
//   -c   = three-quarter turn     -d = full profile

export const POSES = [
  {
    id: 'full-front',
    name: 'Full Front',
    anchor: true,
    angles: ['', '-c'],
    camera:
      'The camera is directly in front of the model at chest height, perpendicular to the shoulder line.',
    description:
      'Full-length frontal view, facing the camera. Natural catalogue stance: weight settled onto one leg with the other knee softly bent and the hip gently cocked, feet roughly hip-width apart. One hand rests easily in a front pocket, the other hangs relaxed at the side. Shoulders level and square to the lens, chin level, looking directly into the camera with a calm neutral expression.',
    mustSee:
      'the whole body from the top of the head to the soles of the shoes, both shoes complete and uncropped, the full front of the garment, both shoulders, the centre front and both sleeves',
    mustNotSee:
      'the feet or shoes cut off by the frame, a crop at the knee or thigh, a rotated torso, or a stiff symmetrical stance with both arms rigid at the sides',
    framing:
      'FULL LENGTH. The entire body is in frame with clear space above the head and below the shoes. The shoes must be completely visible and must not touch or cross the bottom edge.',
  },
  {
    id: 'three-quarter',
    name: 'Three-Quarter Turn',
    angles: ['-b'],
    camera: 'The camera stays front-on at chest height while the model rotates.',
    description:
      'The body rotates approximately forty-five degrees toward camera-left so the torso is clearly angled and one shoulder sits nearer the lens. The head turns back toward the camera. Weight settles on the back leg with the front foot slightly forward. Arms folded loosely across the waist, or the near hand resting at the hip with the far arm relaxed — a natural, unforced catalogue attitude. This is a genuine forty-five degree rotation, not a slight shift off centre.',
    mustSee:
      'the front and one side of the garment at the same time, the side seam, one shoulder clearly nearer the camera, and the depth of the chest',
    mustNotSee:
      'a square frontal stance, shoulders parallel to the lens, or a pose that reads as a front view with only the head turned',
    framing:
      'Three-quarter length. Crop from just above the top of the head to mid-thigh, or full length if the lower garment matters.',
  },
  {
    id: 'side-profile',
    name: 'Side Profile',
    angles: ['-d'],
    camera: 'The camera is at ninety degrees to the model, level with the chest.',
    description:
      'A true full profile. The body turns a full ninety degrees to the camera so only one side faces the lens, and the head faces forward in the same direction as the body, showing the face in complete profile. Weight settled naturally, the near hand tucked into a pocket or hanging relaxed at the side, shoulders tall, gaze level and forward.',
    mustSee:
      'the complete outline of the face in profile — forehead, nose, lips and chin read against the background — one shoulder only, the side seam running the full length, and the garment silhouette',
    mustNotSee:
      'both eyes, both sides of the face, the front of the chest, a three-quarter angle, or the head turned back toward the camera',
    framing:
      'Three-quarter to full length. Crop from just above the top of the head to mid-thigh or below.',
  },
  {
    id: 'full-back',
    name: 'Full Back',
    angles: ['-d'],
    camera: 'The camera is directly behind the model at chest height.',
    description:
      'A straight-on rear view. The back is squarely to the camera and the head faces directly away from the lens, so no facial features are visible. Weight settled onto one leg with a subtle shift of the hips, shoulders level, arms relaxed at the sides with a small gap from the torso, or one hand resting in a back pocket, so the back panel, yoke and hem read fully.',
    mustSee:
      'the entire back panel of the garment, the yoke, the back of the collar, the back of both sleeves, and the back of the head and hairline',
    mustNotSee:
      'the face, either eye, the nose, the front of the garment, or the head turned to look back over the shoulder',
    framing:
      'Three-quarter to full length. Crop from just above the top of the head to mid-thigh or below.',
  },
  {
    id: 'close-detail',
    name: 'Close Detail',
    angles: [''],
    camera: 'The camera is directly in front of the model and moved in close.',
    description:
      'A tight upper-body detail shot. The model faces the camera with the head very slightly turned, shoulders level, looking into the lens. Nothing obstructs the chest: no crossed arms, no hand raised into frame. The collar, placket, buttons, any chest emblem and the fabric structure all sit large in the frame and are the subject of the photograph.',
    mustSee:
      'the collar and its stand, the full placket with every button, any chest emblem at large scale with its stitching legible, and the weave structure of the cloth at close range',
    mustNotSee:
      'the waist, the hips, the legs, the hands, a full-length or half-length framing, or any part of the garment being covered by an arm',
    framing:
      'TIGHT. Crop from just above the top of the head to just below the chest. This is far closer than the other four shots — the garment detail fills the frame.',
  },
];

export function poseById(id) {
  return POSES.find((p) => p.id === id) || POSES[0];
}

// ---------------------------------------------------------------------------
// 4. Reference map
// ---------------------------------------------------------------------------

const ROLE_TEXT = {
  garment:
    'the primary garment product shot. This is the ground truth for cut, colour, construction, pattern layout and every mark printed or stitched on it.',
  garmentSheet:
    'a CONTACT SHEET of additional photographs of THE SAME SINGLE GARMENT, arranged in a grid on white. Every panel shows that one identical product photographed from a different angle, distance or detail — front, back, side, collar, cuff, hem, placket, trim, branding. This is ONE garment, not several different products: do not treat the panels as separate items, do not combine them into a new design, and do not average them. Read every panel and use them together to build a complete understanding of how this single garment is constructed, then reproduce that one garment exactly.',
  logo:
    'a MACRO PHOTOGRAPH OF THE BRAND EMBLEM exactly as it appears on this garment. This is the definitive ground truth for the mark and outranks every other reference for it. Reproduce the emblem from this image: the exact silhouette, every internal shape and detail, the correct number of limbs and elements, the exact proportions, the thread colour, the stitch direction and raised embroidered surface, and above all the exact facing direction shown here. Place it at the size and position shown on the garment reference. It must be instantly recognisable at 100 percent zoom, and it must never be mirrored, rotated, simplified, smoothed, recoloured or redrawn from imagination.',
  footwearSheet:
    'a CONTACT SHEET of additional photographs of THE SAME SINGLE PAIR OF SHOES, arranged in a grid on white. Every panel shows that one identical pair from a different angle or in detail. This is ONE pair, not several: read every panel and reproduce that exact pair, correctly scaled to the body and matched left to right.',
  pattern:
    'a close-up of the garment pattern. This is the ground truth for motif shape, repeat pitch, weave detail and lettering. Read it at full resolution.',
  model:
    'a photograph of the model, for identity only: face, bone structure, hair, and skin tone at its true depth.',
  modelAngle:
    'a photograph of the model at the exact head and body angle this shot requires. Match this camera angle and this degree of rotation.',
  footwear: 'the footwear to be worn, to be reproduced exactly and scaled correctly to the body.',
  anchor:
    'the approved anchor frame from this same set, supplied for IDENTITY, GARMENT AND PATTERN ONLY.',
};

export function buildReferenceMap(engine, refs) {
  if (!refs || !refs.length) return '';
  const lines = refs.map(
    (ref, i) => `- ${refLabel(engine, i)} is ${ROLE_TEXT[ref.role] || 'a reference image.'}`
  );
  return `REFERENCE MAP:\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// 5. Prompt builders
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

function poseBlock(p) {
  return `SHOT — ${p.name.toUpperCase()} (THE CAMERA ANGLE IS NOT NEGOTIABLE):
${p.camera}
${p.description}
MUST BE VISIBLE: ${p.mustSee}.
MUST NOT BE VISIBLE: ${p.mustNotSee}.
FRAMING: ${p.framing}
This shot is named for its camera angle. If the output could be mistaken for any of the other four shots in the set, it is wrong and the angle must be corrected.`;
}

// Main generation prompt for one pose.
export function buildPrompt({
  engine,
  pose,
  refs,
  modelDescriptor,
  isChild = false,
  hasAnchor = false,
  notes = '',
  overrideDescription = '',
}) {
  const base = typeof pose === 'string' ? poseById(pose) : pose;
  const p = overrideDescription
    ? { ...base, description: overrideDescription }
    : base;

  const task = `TASK: Produce one professional fashion e-commerce photograph of a model wearing the exact garment shown in the references, in a white studio, at the exact camera angle described below. This is a garment transfer job, not a redesign. Every physical detail of the garment comes from the reference images; only the pose, the body and the lighting are being created.`;

  // The anchor holds identity and print steady, but left unscoped it also
  // dictates camera position, which collapses every shot into a front view.
  const anchorBlock = hasAnchor
    ? `SET CONSISTENCY — WHAT THE ANCHOR FRAME GOVERNS:
- The anchor frame supplied with this request defines the PERSON, the GARMENT and the PATTERN. Match its face, skin tone, hair, build, garment rendering, pattern placement and scale, colour and lighting exactly.
- The anchor frame does NOT define the camera. Do NOT copy its camera angle, its body rotation, its head direction, its stance or its framing. Those come only from the shot description above, which is a deliberate departure from the anchor.
- Changing the camera angle away from the anchor is required, not optional. Keeping the anchor's angle is a failure.
- Do not re-interpret the pattern between frames. The motif count and repeat pitch in the anchor are the motif count and repeat pitch here.`
    : '';

  return assemble([
    task,
    buildReferenceMap(engine, refs),
    IDENTITY_LOCK,
    poseBlock(p),
    PATTERN_RULES,
    buildDefectRules(),
    PRODUCT_PRESERVE,
    `MODEL:\n${modelDescriptor}`,
    MODEL_RULE,
    isChild ? CHILD_RULE : '',
    SKIN_REALISM,
    HUMAN_REALISM,
    STUDIO,
    anchorBlock,
    notes ? `ADDITIONAL DIRECTION:\n${notes}` : '',
    engineTail(engine),
  ]);
}

// Reframe an existing generated frame to a different crop without regenerating.
export function buildReframePrompt({ engine, refs, crop = 'full length' }) {
  return assemble([
    `TASK: Reframe the supplied photograph to a ${crop} crop. Keep the same person, the same garment, the same pose, the same camera angle, the same lighting and the same white studio background. This is a crop and recompose operation only.`,
    buildReferenceMap(engine, refs),
    PATTERN_RULES,
    buildDefectRules(),
    `REFRAME RULES:\n- Do not re-render the garment or the face. Do not change pose, camera angle, expression, hands or footwear.\n- Keep the model centred with even margin left and right.\n- Preserve resolution and sharpness. Do not upscale softly or repaint detail.`,
    SKIN_REALISM,
    engineTail(engine),
  ]);
}

// Targeted correction pass on one frame.
export function buildRefinePrompt({ engine, refs, instruction, isChild = false }) {
  return assemble([
    `TASK: Apply one targeted correction to the supplied photograph. Change only what the correction asks for. Everything else in the frame stays pixel-identical: same person, same face, same skin tone, same garment, same pattern, same pose, same camera angle, same crop, same lighting, same background.`,
    buildReferenceMap(engine, refs),
    IDENTITY_LOCK,
    `CORRECTION REQUESTED:\n${instruction}`,
    PATTERN_RULES,
    buildDefectRules(),
    PRODUCT_PRESERVE,
    MODEL_RULE,
    isChild ? CHILD_RULE : '',
    SKIN_REALISM,
    `REFINE RULES:\n- Do not use this pass as an excuse to restyle, beautify, smooth or relight the image.\n- Do not lighten the skin. Do not smooth skin texture or add gloss, sheen or shine to it.\n- Do not redraw the pattern. If the correction is unrelated to the pattern, the pattern must come through untouched.\n- Do not change the camera angle or the pose.`,
    engineTail(engine),
  ]);
}
