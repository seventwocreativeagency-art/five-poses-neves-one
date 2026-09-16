// lib/engines.js
// Engine routing for Five Poses v2.
// Three providers: OpenAI (GPT Image 2.5), fal (Seedream) and Google Gemini
// (Nano Banana family).
//
// refStyle controls how reference images are named inside the prompt:
//   "figure"  -> "Figure 1", "Figure 2"      (Seedream indexes inputs this way)
//   "ordinal" -> "the first reference image" (OpenAI and Gemini read natural language)

export const ENGINE_ROUTES = {
  'gpt-image-2.5-sunburst': {
    id: 'gpt-image-2.5-sunburst',
    label: 'GPT Image 2.5 Sunburst',
    vendor: 'OpenAI',
    provider: 'openai',
    model: 'gpt-image-2.5-sunburst',
    refStyle: 'ordinal',
    maxRefs: 6,
    maxLongEdge: 3840,
    envKey: 'OPENAI_API_KEY',
    note: 'Default. OpenAI\u2019s most capable editing model. Best subject preservation and the most reliable at changing one thing while leaving the rest of the frame alone.',
  },
  'gpt-image-2.5-flare': {
    id: 'gpt-image-2.5-flare',
    label: 'GPT Image 2.5 Flare',
    vendor: 'OpenAI',
    provider: 'openai',
    model: 'gpt-image-2.5-flare',
    refStyle: 'ordinal',
    maxRefs: 6,
    maxLongEdge: 3840,
    envKey: 'OPENAI_API_KEY',
    note: 'Same family, roughly half the latency of Sunburst. Use for volume runs and quick tests, then re-shoot the keepers on Sunburst.',
  },
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

export const DEFAULT_ENGINE = 'gpt-image-2.5-sunburst';

export const ENGINE_LIST = Object.values(ENGINE_ROUTES);

export function routeFor(engineId) {
  return ENGINE_ROUTES[engineId] || ENGINE_ROUTES[DEFAULT_ENGINE];
}

export function isOpenAiEngine(engineId) {
  return routeFor(engineId).provider === 'openai';
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
// openaiQuality rides along with the resolution choice so there is no second
// dial to get wrong. It is a real cost lever on GPT Image 2.5: output is billed
// per token, and xhigh on a 4K frame is several times the price of medium at 1K.
export const RESOLUTIONS = {
  '1K': { label: '1K — plain garments, fastest', longEdge: 1024, gemini: '1K', openaiQuality: 'medium' },
  '2K': { label: '2K — prints, checks, stripes', longEdge: 2048, gemini: '2K', openaiQuality: 'high' },
  '4K': { label: '4K — micro-prints and dense repeats', longEdge: 4096, gemini: '4K', openaiQuality: 'xhigh' },
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

// GPT Image 2.5 has hard rules on custom sizes: each edge no more than 3840px,
// both edges a multiple of 16, long-to-short ratio no more than 3:1, and total
// pixels between 655,360 and 8,294,400. A naive 4K portrait request breaks the
// pixel ceiling, so the frame is scaled to fit rather than being rejected.
const OPENAI_MAX_EDGE = 3840;
const OPENAI_MIN_PIXELS = 655_360;
const OPENAI_MAX_PIXELS = 8_294_400;

export function openaiSizeFor(engineId, aspectKey, resolutionKey) {
  const route = routeFor(engineId);
  const aspect = ASPECTS[aspectKey] || ASPECTS['3:4'];
  const res = RESOLUTIONS[resolutionKey] || RESOLUTIONS[DEFAULT_RESOLUTION];

  const longEdge = Math.min(res.longEdge, route.maxLongEdge || OPENAI_MAX_EDGE, OPENAI_MAX_EDGE);
  const isTall = aspect.h >= aspect.w;
  let width = isTall ? (longEdge * aspect.w) / aspect.h : longEdge;
  let height = isTall ? longEdge : (longEdge * aspect.h) / aspect.w;

  const pixels = width * height;
  if (pixels > OPENAI_MAX_PIXELS) {
    const k = Math.sqrt(OPENAI_MAX_PIXELS / pixels);
    width *= k;
    height *= k;
  } else if (pixels < OPENAI_MIN_PIXELS) {
    // 3% headroom so rounding down to a multiple of 16 cannot push us back
    // under the floor.
    const k = Math.sqrt((OPENAI_MIN_PIXELS * 1.03) / pixels);
    width *= k;
    height *= k;
  }

  const down16 = (n) => Math.max(256, Math.floor(n / 16) * 16);
  return `${Math.min(down16(width), OPENAI_MAX_EDGE)}x${Math.min(down16(height), OPENAI_MAX_EDGE)}`;
}

export function openaiQualityFor(resolutionKey) {
  const res = RESOLUTIONS[resolutionKey] || RESOLUTIONS[DEFAULT_RESOLUTION];
  return res.openaiQuality || 'high';
}

// What the resolution dropdown should honestly claim this engine can deliver.
export function resolutionCapLabel(engineId) {
  const max = routeFor(engineId).maxLongEdge || 2048;
  if (max >= 3840) return '4K';
  if (max >= 2048) return '2K';
  return '1K';
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
