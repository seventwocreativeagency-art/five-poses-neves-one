// lib/qa.js
// The client's AI Output Quality Risks register, encoded as data.
//
// Each entry carries two things:
//   rule  - the instruction injected into every generation prompt
//   check - the question a human answers before the image is delivered
//
// Keeping them in one place means the thing the engine is told and the thing
// the operator inspects can never drift apart. Add a defect here and it lands
// in both the prompt and the QC checklist automatically.

export const DEFECT_REGISTER = [
  // ---- product: colour and construction -----------------------------------
  {
    id: 'colour-sequence',
    group: 'Product',
    name: 'Inconsistent colour rendering across sequence',
    rule: 'Garment colour is identical in every frame of the set. Match hue, saturation and value to the reference exactly and hold them constant from shot to shot. No warming, cooling, deepening or fading between frames. Contrast trims, tipping and panels each hold their own exact colour across the whole sequence.',
    check: 'Place all frames side by side: is the garment colour identical in every one, including trims and panels?',
  },
  {
    id: 'seam-construction',
    group: 'Product',
    name: 'Incorrect garment construction (seams)',
    rule: 'Reproduce the garment\'s actual construction. Every seam sits where the reference puts it: shoulder seams on the shoulder line, side seams running true down the body, armhole seams following the arm join, yoke seams straight and level. Do not invent, move, delete, duplicate or re-route a seam, and do not add topstitching, panels or darts that are not in the reference.',
    check: 'Do all seams sit where the real garment has them, with none added, moved or missing?',
  },
  {
    id: 'button-duplication',
    group: 'Product',
    name: 'Button misplacement and duplication',
    rule: 'Buttons are counted objects. Reproduce the exact number in the reference, evenly spaced down the placket at the reference spacing, each one a separate raised disc with its own edge, thickness, thread holes and small contact shadow. Never duplicate a button, never place two buttons adjacent or overlapping, never add a button to a collar point that has none, never leave a buttonhole without its button or a button without its buttonhole, and never let a button blur into the fabric.',
    check: 'Count the buttons against the reference: same number, same spacing, none doubled, overlapping or hallucinated on the collar?',
  },
  {
    id: 'waistband-duplication',
    group: 'Product',
    name: 'Waistband distortion and duplication',
    rule: 'A waistband is a single continuous band of one consistent depth running once around the body. Never render two waistbands, a doubled or stacked band, a band that changes depth along its length, a band that splits or forks, or a second ghost band above or below the real one. Elastic gathering, if present in the reference, is even and regular all the way round with the same ruche frequency, and the band edge stays a clean unbroken line.',
    check: 'Is there exactly one waistband, one depth all the way round, with no doubling, stacking, forking or ghost band?',
  },
  {
    id: 'drawstring-duplication',
    group: 'Product',
    name: 'Drawstring distortion and duplication',
    rule: 'If the reference garment has a drawstring, reproduce exactly one: two symmetrical cords of equal thickness and length emerging from two eyelets set symmetrically either side of the centre front, tied in a single bow if the reference is tied, with correctly formed loops and tails and visible cord braiding. Never render a melted, fused, frayed, floating, doubled or looping-back drawstring, never more than two cord ends, never a cord that passes through the fabric or disappears into it, and never eyelets without cords or cords without eyelets. If the reference garment has no drawstring, do not add one.',
    check: 'One drawstring, two symmetrical cords, correct eyelets, a properly formed bow, no melted or duplicated cord?',
  },
  {
    id: 'collar-cuff',
    group: 'Product',
    name: 'Collar and cuff distortion',
    rule: 'Collar and cuffs keep the reference shape, depth, roll and finish. Collar points are the same length as each other and the same length as the reference, symmetrical either side of the centre, with a clean edge and correct stand. Cuffs are the same depth on both arms with the same closure. Contrast tipping and banding keep their exact width and colour order. Never warp, curl, thicken, thin, asymmetrise or soften a collar point or cuff edge.',
    check: 'Are the collar points symmetrical and the correct length, and are both cuffs the same depth with tipping in the right order?',
  },

  // ---- product: texture and branding --------------------------------------
  {
    id: 'fabric-oversmoothing',
    group: 'Product',
    name: 'Fabric texture artefact — over-smoothing',
    rule: 'Fabric must show its real structure at full resolution. Pique reads as pique with its visible waffle grid, jersey as fine knit courses and wales, twill as diagonal wale lines, oxford as a basketweave, fleece as pile. Never render a garment as a flat matte colour fill, a smooth plastic shell, a vinyl surface or a soft airbrushed gradient with no weave.',
    check: 'Zoom to 100%: is the actual weave or knit structure visible across the garment, not a flat colour fill?',
  },
  {
    id: 'fabric-buildup',
    group: 'Product',
    name: 'Fabric texture artefact — artificial texture buildup',
    rule: 'Texture must be the fabric\'s own structure, not applied noise. Never overlay grain, speckle, crosshatch, embossing, sandpaper stipple or a repeating synthetic texture on top of the cloth. Never let texture accumulate into crunchy edges, halos around folds, or a scratchy pattern unrelated to the weave. Fabric texture stays consistent in scale across the whole garment and does not intensify in flat areas or near seams.',
    check: 'Is the texture the fabric\'s own weave, with no applied grain, crosshatch, stipple, crunchy edges or halos around folds?',
  },
  {
    id: 'logo-distortion',
    group: 'Product',
    name: 'Logo distortion and misalignment',
    rule: 'Any embroidered or printed brand mark is reproduced exactly as photographed: the same silhouette, the same internal shapes, the same limb and detail count, the same proportions, the same size relative to the garment, the same position, the same colour, and the same facing direction. It must remain instantly recognisable at 100 percent zoom. Never melt, smear, blur, stretch, rotate, mirror, recolour, simplify, duplicate, or lose the internal detail of a brand mark, and never let it drift off its correct placement or tilt off its correct axis. Where the mark repeats across the garment as an all-over motif, every single instance is the same complete mark at the same scale and orientation — no half marks, no deformed instances, no smeared instances.',
    check: 'Is every brand mark instantly recognisable, correctly placed, correctly oriented, and identical to the reference — including every instance in an all-over print?',
  },
  {
    id: 'logo-vs-fabric',
    group: 'Product',
    name: 'Logo texture must differ from garment texture',
    rule: 'An embroidered mark is a raised object made of stitched thread and must read as such: visible individual stitch direction, thread sheen, a slightly raised edge, and a small shadow where it sits proud of the cloth. It must be clearly distinguishable from the fabric beneath it and must not share the fabric\'s weave. A printed mark sits flat in the cloth and follows the weave. Do not render an embroidered mark as flat print, and do not render a printed mark as embroidery.',
    check: 'Does the embroidered mark read as raised stitched thread, distinct from the fabric weave beneath it?',
  },

  // ---- model: features -----------------------------------------------------
  {
    id: 'digits',
    group: 'Model',
    name: 'Digit distortion (fingers and nails)',
    rule: 'Hands are anatomically correct: five digits per hand, one thumb correctly opposed, correct relative finger lengths, natural knuckle and joint structure, no fused, missing, extra, bent-backwards or rubbery fingers. Fingernails are present on every finger, correctly shaped, the same short neat length as each other, with a natural nail bed and no painted colour unless the reference shows it.',
    check: 'Five correct digits per hand, natural joints, and a correctly shaped nail on every finger?',
  },
  {
    id: 'nails-sequence',
    group: 'Model',
    name: 'Nail inconsistency across sequence',
    rule: 'Nail length, shape and finish are identical in every frame of the set. Nails do not lengthen, shorten, change shape, gain a French tip or change colour between shots.',
    check: 'Compare hands across all frames: are nail length, shape and finish identical in every one?',
  },
  {
    id: 'teeth',
    group: 'Model',
    name: 'Teeth distortion',
    rule: 'If teeth are visible, render a correct human dental arch: the right number of teeth at the right relative sizes, a normal midline, natural slight irregularity, matte enamel with subtle translucency at the edges, and a correct gum line. Never render fused, doubled, oversized, undersized, misaligned or extra teeth, a uniform white bar, or a glossy plastic finish. If the expression is closed-mouth, keep it closed rather than producing an uncertain part-open mouth.',
    check: 'If teeth show, is the dental arch correct with natural irregularity and matte enamel — no fused, doubled or plastic teeth?',
  },

  // ---- model: texture ------------------------------------------------------
  {
    id: 'skin-oversmoothing',
    group: 'Model',
    name: 'Skin texture artefact — over-smoothing',
    rule: 'Skin keeps visible pores, fine surface grain, natural lines and peach fuzz across the face, neck, chest, arms and hands. Never render an airbrushed, blurred, poreless, uniformly smooth or beautified complexion, and never wipe texture from the arms, shoulders or legs while keeping it on the face.',
    check: 'Zoom to 100% on the face AND the arms: are pores and fine texture visible in both, or has the skin been smoothed flat?',
  },
  {
    id: 'skin-buildup',
    group: 'Model',
    name: 'Skin texture artefact — artificial texture buildup',
    rule: 'Skin texture must be real skin structure, not applied noise. Never overlay grain, speckle, stipple, crosshatch or a repeating synthetic pattern on skin. Never let texture accumulate into crunchy edges, halos around the jaw and hairline, gritty patches on the cheeks or forehead, or a sandpaper finish. Texture scale stays consistent and anatomically correct across every region of the body.',
    check: 'Is the skin texture real anatomical structure, with no applied grain, gritty patches, halos or sandpaper finish?',
  },
  {
    id: 'hair-merging',
    group: 'Model',
    name: 'Hair merging into clothing or background',
    rule: 'Hair is a separate object with a clean, readable boundary everywhere it meets something else. Individual strands and the hairline stay distinct against the white background, and the hair must not bleed into, fuse with, dissolve into or borrow the texture of the backdrop. Where hair falls over the collar, shoulder or garment, the boundary between hair and cloth stays sharp and the two never share edges, colour or texture. Do not let dark hair merge into a dark garment.',
    check: 'Does the hair have a clean edge against both the background and the garment, with no bleeding or fusing?',
  },

  // ---- model: pose and lighting -------------------------------------------
  {
    id: 'pose-proportions',
    group: 'Model',
    name: 'Unnatural poses and proportions',
    rule: 'Body proportions are anatomically correct and consistent across the set: correct head-to-body ratio, correct limb lengths relative to the torso, correct shoulder width, correct hand and foot size. Joints bend only in directions real joints bend, the spine and neck sit naturally, weight distribution is believable, and the stance is a pose a real model could physically hold. Never elongate, compress, twist or bend the body to fit the frame.',
    check: 'Are the proportions and joint angles anatomically correct, and is the stance one a real person could hold?',
  },
  {
    id: 'lighting-mismatch',
    group: 'Model',
    name: 'Lighting mismatch between model and product',
    rule: 'The model and the garment are lit by the same lights in the same room. Key direction, fill ratio, colour temperature, contrast and shadow softness must be identical on skin and on cloth. Shadows on the garment fall in the same direction as shadows on the face and arms. The garment must not look composited, pasted on, separately lit, or brighter, cooler, warmer or flatter than the person wearing it.',
    check: 'Do the light direction, softness and colour temperature match on skin and garment, with shadows falling the same way?',
  },
  {
    id: 'lighting-sequence',
    group: 'Model',
    name: 'Inconsistent lighting across sequence, skin tone impacted',
    rule: 'Lighting is identical in every frame of the set: same key position, same fill ratio, same exposure, same white balance, same contrast. Because exposure shifts read as skin tone shifts, the complexion must measure the same in every frame — never lighter, brighter, darker, warmer, cooler or more washed out in one shot than another. Expose for the subject and never lift the subject to separate them from the white background.',
    check: 'Across all frames, does the skin tone measure identical, with no frame lighter, warmer or more washed out than the rest?',
  },
];

export const DEFECT_GROUPS = ['Product', 'Model'];

export function defectsByGroup(group) {
  return DEFECT_REGISTER.filter((d) => d.group === group);
}

// Assembled into the prompt. Grouped and numbered so the instruction reads as a
// checklist rather than an undifferentiated wall.
export function buildDefectRules() {
  const sections = DEFECT_GROUPS.map((group) => {
    const lines = defectsByGroup(group).map((d) => `${d.name.toUpperCase()}: ${d.rule}`);
    return `${group.toUpperCase()} DEFECTS:\n${lines.map((l) => `- ${l}`).join('\n')}`;
  });

  return `CLIENT DEFECT REGISTER — EVERY ITEM BELOW IS A REJECTION REASON.
These are the specific faults the client has documented in previously delivered imagery. Each one has caused an image to be rejected. Treat this list as acceptance criteria: an output containing any of these faults is a failed image, regardless of how good the rest of it looks.

${sections.join('\n\n')}`;
}

// The delivery checklist rendered in the interface.
export function qcChecklist() {
  return DEFECT_REGISTER.map((d) => ({ id: d.id, group: d.group, name: d.name, check: d.check }));
}
