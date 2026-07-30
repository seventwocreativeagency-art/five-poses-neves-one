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
    maxLongEdge: 2048,
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
    maxLongEdge: 2048,
    envKey: 'FAL_KEY',
    note: 'Previous generation. Useful as a cross-check when 4.5 drifts.',
  },
  'nano-banana-pro': {
    id: 'nano-banana-pro',
    label: 'Nano Banana Pro',
    vendor: 'Google Gemini',
    provider: 'gemini',
    model: 'gemini-3-pro-image-preview',
    refStyle: 'ordinal',
    maxRefs: 6,
    maxLongEdge: 4096,
    supportsImageConfig: true,
    supportsImageSize: true,
    envKey: 'GEMINI_API_KEY',
    note: 'Highest fidelity on micro-prints and fine lettering. Slowest. Use for dense repeats.',
  },
  'nano-banana-2': {
    id: 'nano-banana-2',
    label: 'Nano Banana 2',
    vendor: 'Google Gemini',
    provider: 'gemini',
    model: 'gemini-3.1-flash-image-preview',
    refStyle: 'ordinal',
    maxRefs: 6,
    maxLongEdge: 2048,
    supportsImageConfig: true,
    supportsImageSize: true,
    envKey: 'GEMINI_API_KEY',
    note: 'Fast and very literal with instructions. Strong second opinion.',
  },
  'nano-banana': {
    id: 'nano-banana',
    label: 'Nano Banana (2.5)',
    vendor: 'Google Gemini',
    provider: 'gemini',
    model: 'gemini-2.5-flash-image',
    refStyle: 'ordinal',
    maxRefs: 4,
    maxLongEdge: 1024,
    supportsImageConfig: false,
    supportsImageSize: false,
    envKey: 'GEMINI_API_KEY',
    note: 'Cheapest, but caps at roughly 1K. Not suitable for fine repeats.',
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

// Aspect ratios offered in the UI, mapped to each provider's own vocabulary,
// plus the width/height ratio used to compute explicit pixel dimensions.
export const ASPECTS = {
  '3:4': { label: 'Portrait 3:4', fal: 'portrait_4_3', gemini: '3:4', w: 3, h: 4 },
  '4:5': { label: 'Portrait 4:5', fal: 'portrait_4_3', gemini: '4:5', w: 4, h: 5 },
  '9:16': { label: 'Tall 9:16', fal: 'portrait_16_9', gemini: '9:16', w: 9, h: 16 },
  '1:1': { label: 'Square 1:1', fal: 'square_hd', gemini: '1:1', w: 1, h: 1 },
};

// Output resolution. This is the single biggest lever on fine repeats: a
// micro-print rendered at 1K falls below the pixel budget its motifs need and
// collapses into banding, regardless of how the prompt is worded.
export const RESOLUTIONS = {
  '1K': { label: '1K — plain garments, fastest', longEdge: 1024, gemini: '1K' },
  '2K': { label: '2K — prints, checks, stripes', longEdge: 2048, gemini: '2K' },
  '4K': { label: '4K — micro-prints and dense repeats', longEdge: 4096, gemini: '4K' },
};

export const DEFAULT_RESOLUTION = '2K';

export function aspectRatioFor(engineId, aspectKey) {
  const aspect = ASPECTS[aspectKey] || ASPECTS['3:4'];
  return isFalEngine(engineId) ? aspect.fal : aspect.gemini;
}

// Backwards-compatible alias.
export const aspectFor = aspectRatioFor;

// Explicit pixel dimensions, clamped to what the chosen engine can actually
// deliver, so a 4K request on a 2K engine degrades instead of erroring.
export function dimensionsFor(engineId, aspectKey, resolutionKey) {
  const route = routeFor(engineId);
  const aspect = ASPECTS[aspectKey] || ASPECTS['3:4'];
  const res = RESOLUTIONS[resolutionKey] || RESOLUTIONS[DEFAULT_RESOLUTION];
  const longEdge = Math.min(res.longEdge, route.maxLongEdge || 2048);
  const isTall = aspect.h >= aspect.w;
  const height = isTall ? longEdge : Math.round((longEdge * aspect.h) / aspect.w);
  const width = isTall ? Math.round((longEdge * aspect.w) / aspect.h) : longEdge;
  // Keep both edges on a multiple of 16, which every engine here prefers.
  const round16 = (n) => Math.max(512, Math.round(n / 16) * 16);
  return { width: round16(width), height: round16(height) };
}

export function geminiImageSizeFor(engineId, resolutionKey) {
  const route = routeFor(engineId);
  if (!route.supportsImageSize) return null;
  const res = RESOLUTIONS[resolutionKey] || RESOLUTIONS[DEFAULT_RESOLUTION];
  const capped = Math.min(res.longEdge, route.maxLongEdge || 2048);
  if (capped >= 4096) return '4K';
  if (capped >= 2048) return '2K';
  return '1K';
}

// Reference labelling. Seedream responds to "Figure N"; Gemini to plain ordinals.
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

export function refLabel(engineId, index) {
  if (routeFor(engineId).refStyle === 'figure') return `Figure ${index + 1}`;
  return `the ${ORDINALS[index] || `image ${index + 1}`} reference image`;
}
