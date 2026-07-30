// lib/models.js
// The baked-in model library. Reference photographs live in public/models/
// as {key}.jpg (front), {key}-b.jpg and {key}-c.jpg (three-quarter turns),
// and {key}-d.jpg (full profile).
//
// Each pose pulls the reference angle that matches the camera it needs, which
// is a far stronger instruction than words alone. See ANGLE_FILES in poses.js.

export const GENDERS = [
  { id: 'women', label: 'Women' },
  { id: 'men', label: 'Men' },
  { id: 'kids', label: 'Kids' },
];

export const MODEL_PRESETS = [
  // ---- women ---------------------------------------------------------------
  {
    key: 'amara',
    name: 'Amara',
    gender: 'women',
    file: 'amara.jpg',
    face:
      'an adult woman in her mid twenties with deep, richly pigmented dark-brown skin with warm undertones that must be rendered at its full depth and never lightened, brightened, greyed down or washed out, a very short natural afro worn close to the head, high defined cheekbones, softly arched brows and full lips',
  },
  {
    key: 'lena',
    name: 'Lena',
    gender: 'women',
    file: 'lena.jpg',
    face:
      'an adult woman in her mid twenties with light skin with neutral-olive undertones, a short dark-brown pixie cut swept back off the face, strong straight brows, hazel-brown eyes and a defined jawline',
  },
  {
    key: 'sofia',
    name: 'Sofia',
    gender: 'women',
    file: 'sofia.jpg',
    face:
      'an adult woman in her mid twenties with warm medium-brown skin with golden undertones that must be held at its true depth and never lightened or washed out, long dark-brown wavy hair falling past the shoulders, full defined brows, dark brown eyes and small gold hoop earrings',
  },
  {
    key: 'naomi',
    name: 'Naomi',
    gender: 'women',
    file: 'naomi.jpg',
    face:
      'an adult woman in her mid twenties with deep, richly pigmented warm brown skin that must be rendered at its full depth and never lightened, brightened or washed out, a short tightly curled natural afro, softly arched brows, dark brown eyes and full lips',
  },

  // ---- men -----------------------------------------------------------------
  {
    key: 'luca',
    name: 'Luca',
    gender: 'men',
    file: 'luca.jpg',
    face:
      'an adult man in his mid twenties with fair, lightly tanned skin, very short cropped dark-brown hair with a blunt fringe, straight dark brows, hazel eyes and a completely clean-shaven face with no beard, moustache or stubble',
  },
  {
    key: 'malik',
    name: 'Malik',
    gender: 'men',
    file: 'malik.jpg',
    face:
      'an adult man in his mid twenties with very deep, rich dark-brown ebony skin that must be rendered at its full depth and never lightened, brightened, greyed down or washed out, a short buzz cut with a clean hairline, defined brows and a completely clean-shaven face with no beard, moustache or stubble',
  },
  {
    key: 'leo',
    name: 'Leo',
    gender: 'men',
    file: 'leo.jpg',
    face:
      'an adult man in his mid twenties with medium olive skin, dark-brown curly hair worn short on the sides and fuller on top, straight dark brows, green-hazel eyes and a completely clean-shaven face with no beard, moustache or stubble',
  },
  {
    key: 'andre',
    name: 'Andre',
    gender: 'men',
    file: 'andre.jpg',
    face:
      'an adult man in his mid twenties with deep dark-brown skin that must be rendered at its full depth and never lightened, brightened or washed out, a short afro with a clean tapered fade, defined brows, a strong jawline and a completely clean-shaven face with no beard, moustache or stubble',
  },
  {
    key: 'jaden',
    name: 'Jaden',
    gender: 'men',
    file: 'jaden.jpg',
    face:
      'an adult man in his mid twenties with rich medium-to-deep brown skin that must be rendered at its true depth and never lightened, brightened or washed out, a short fade with a defined hairline, straight brows and a completely clean-shaven face with no beard, moustache or stubble',
  },

  // ---- kids ----------------------------------------------------------------
  // Child presets carry an explicit age band and child body proportions.
  // Image engines drift child models older when they are put into adult
  // catalogue framing, so the age lock is stated in the descriptor itself.
  {
    key: 'caleb',
    name: 'Caleb',
    gender: 'kids',
    file: 'caleb.jpg',
    face:
      'a child, a boy of about seven years old, with warm deep-brown skin that must be rendered at its full depth and never lightened or brightened, short tightly curled black hair with a neat tapered fade, round soft child facial features, large dark brown eyes and a small child jawline',
  },
  {
    key: 'ivy',
    name: 'Ivy',
    gender: 'kids',
    file: 'ivy.jpg',
    face:
      'a child, a girl of about seven years old, with warm light-tan skin, dark-brown curly hair gathered into a high bun with loose curls framing the face, small gold stud earrings, round soft child facial features and large brown eyes',
  },
  {
    key: 'jordan',
    name: 'Jordan',
    gender: 'kids',
    file: 'jordan.jpg',
    face:
      'a child, a boy of about eight years old, with light skin with warm undertones, tousled light-brown curly hair, green-hazel eyes, round soft child facial features and a small child jawline',
  },
  {
    key: 'maya',
    name: 'Maya',
    gender: 'kids',
    file: 'maya.jpg',
    face:
      'a child, a girl of about eight years old, with warm medium-tan skin, long wavy brown hair with lighter caramel highlights falling past the shoulders, green-hazel eyes and round soft child facial features',
  },
  {
    key: 'zara',
    name: 'Zara',
    gender: 'kids',
    file: 'zara.jpg',
    face:
      'a child, a girl of about seven years old, with deep, richly pigmented dark-brown skin that must be rendered at its full depth and never lightened, brightened or washed out, a short natural tightly curled afro, small stud earrings, round soft child facial features and large dark brown eyes',
  },
];

export const UPLOAD_KEY = 'upload';

export function presetsFor(gender) {
  return MODEL_PRESETS.filter((m) => m.gender === gender);
}

export function presetByKey(key) {
  return MODEL_PRESETS.find((m) => m.key === key) || null;
}

export function isChildPreset(key) {
  const preset = presetByKey(key);
  return !!preset && preset.gender === 'kids';
}

// Extra constraints that apply whenever a child preset is selected. These keep
// the output squarely on children's retail catalogue work.
export const CHILD_RULE = `CHILD MODEL:
- The subject is a child and must read unmistakably as a child of the stated age in every frame: child body proportions, a larger head relative to the body, shorter limbs, a soft child face, and child height relative to the garment.
- Never age the child up. Do not lengthen the face or limbs, do not add adult musculature, adult jawlines, adult body shape or adult facial structure, and do not render the child as a teenager or a small adult.
- Posture and expression stay natural, relaxed and age-appropriate throughout: plain standing catalogue stances, a neutral or lightly pleasant expression, arms and hands in ordinary resting positions.
- No makeup beyond bare skin, no adult styling, no jewellery beyond what appears in the reference photograph.
- The garment fits properly and covers normally, exactly as a children's retail catalogue image would show it.`;
