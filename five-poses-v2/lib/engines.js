// lib/engines.js
// Engine routing for Five Poses v2.
// OpenAI has been removed entirely. Every route below is either fal (Seedream)
// or Google Gemini (Nano Banana family).
//
// refStyle controls how reference images are named inside the prompt:
//   "figure"  -> "Figure 1", "Figure 2"      (Seedream indexes inputs this way)
//   "ordinal" -> "the first reference image" (Gemini reads natural language)

export const ENGINE_ROUTES = {
  'seedream-4.5': {
    id: 'seedream-4.5',
    label: 'Seedream 4.5',
    vendor: 'ByteDance via fal',
    provider: 'fal',
    path: 'fal-ai/bytedance/seedream/v4.5/edit',
    refStyle: 'figure',
    maxRefs: 6,
    envKey: 'FAL_KEY',
    note: 'Best print, weave and check retention. Default for patterned garments.',
  },
  'seedream-4': {
    id: 'seedream-4',
    label: 'Seedream 4.0',
    vendor: 'ByteDance via fal',
    provider: 'fal',
    path: 'fal-ai/bytedance/seedream/v4/edit',
    refStyle: 'figure',
    maxRefs: 6,
    envKey: 'FAL_KEY',
    note: 'Previous generation. Useful as a cross-check when 4.5 drifts.',
  },
  'nano-banana-2': {
    id: 'nano-banana-2',
    label: 'Nano Banana 2',
    vendor: 'Google Gemini',
    provider: 'gemini',
    model: 'gemini-3.1-flash-image-preview',
    refStyle: 'ordinal',
    maxRefs: 6,
    supportsImageConfig: true,
    envKey: 'GEMINI_API_KEY',
    note: 'Fast and very literal with instructions. Strong second opinion.',
  },
  'nano-banana-pro': {
    id: 'nano-banana-pro',
    label: 'Nano Banana Pro',
    vendor: 'Google Gemini',
    provider: 'gemini',
    model: 'gemini-3-pro-image-preview',
    refStyle: 'ordinal',
    maxRefs: 6,
    supportsImageConfig: true,
    envKey: 'GEMINI_API_KEY',
    note: 'Highest fidelity on fine lettering and small embroidered marks. Slower.',
  },
  'nano-banana': {
    id: 'nano-banana',
    label: 'Nano Banana (2.5)',
    vendor: 'Google Gemini',
    provider: 'gemini',
    model: 'gemini-2.5-flash-image',
    refStyle: 'ordinal',
    maxRefs: 4,
    supportsImageConfig: false,
    envKey: 'GEMINI_API_KEY',
    note: 'Cheapest. Keep as a fallback if the newer models are unavailable.',
  },
};

export const DEFAULT_ENGINE = 'seedream-4.5';

export const ENGINE_LIST = Object.values(ENGINE_ROUTES);

export function routeFor(engineId) {
  return ENGINE_ROUTES[engineId] || ENGINE_ROUTES[DEFAULT_ENGINE];
}

export function isFalEngine(engineId) {
  return routeFor(engineId).provider === 'fal';
}

export function isGeminiEngine(engineId) {
  return routeFor(engineId).provider === 'gemini';
}

// Aspect ratios offered in the UI, mapped to each provider's own vocabulary.
export const ASPECTS = {
  '3:4': { label: 'Portrait 3:4', fal: 'portrait_4_3', gemini: '3:4' },
  '4:5': { label: 'Portrait 4:5', fal: 'portrait_4_3', gemini: '4:5' },
  '9:16': { label: 'Tall 9:16', fal: 'portrait_16_9', gemini: '9:16' },
  '1:1': { label: 'Square 1:1', fal: 'square_hd', gemini: '1:1' },
};

export function aspectFor(engineId, aspectKey) {
  const aspect = ASPECTS[aspectKey] || ASPECTS['3:4'];
  return isFalEngine(engineId) ? aspect.fal : aspect.gemini;
}

// Reference labelling. Seedream responds to "Figure N"; Gemini to plain ordinals.
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

export function refLabel(engineId, index) {
  if (routeFor(engineId).refStyle === 'figure') return `Figure ${index + 1}`;
  return `the ${ORDINALS[index] || `image ${index + 1}`} reference image`;
}
