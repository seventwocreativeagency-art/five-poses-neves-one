// lib/colour.js
// Hex handling for the garment colourway override.
//
// Image engines read a hex value far more reliably when it arrives alongside a
// plain-language description of the same colour. "#1B2A4A" alone gets
// approximated; "a deep navy blue, hex #1B2A4A" lands much closer. Everything
// here exists to produce that second half.

export function normaliseHex(input) {
  if (!input) return null;
  let value = String(input).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(value)) {
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-f]{6}$/i.test(value)) return null;
  return `#${value.toUpperCase()}`;
}

export function hexToRgb(hex) {
  const clean = normaliseHex(hex);
  if (!clean) return null;
  return {
    r: parseInt(clean.slice(1, 3), 16),
    g: parseInt(clean.slice(3, 5), 16),
    b: parseInt(clean.slice(5, 7), 16),
  };
}

function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: (h / 6) * 360, s, l };
}

const HUES = [
  [10, 'red'],
  [22, 'red-orange'],
  [38, 'orange'],
  [50, 'amber'],
  [66, 'yellow'],
  [82, 'yellow-green'],
  [100, 'lime green'],
  [145, 'green'],
  [168, 'green-teal'],
  [186, 'teal'],
  [200, 'cyan'],
  [225, 'blue'],
  [250, 'indigo blue'],
  [268, 'violet'],
  [290, 'purple'],
  [318, 'magenta'],
  [340, 'pink'],
  [360, 'red'],
];

function hueName(h) {
  for (const [ceiling, name] of HUES) {
    if (h <= ceiling) return name;
  }
  return 'red';
}

// Neutral names read better than "a zero-saturation grey" when saturation is
// effectively absent.
function neutralName(l) {
  if (l < 0.06) return 'pure black';
  if (l < 0.18) return 'near-black charcoal';
  if (l < 0.32) return 'dark charcoal grey';
  if (l < 0.46) return 'mid-dark grey';
  if (l < 0.6) return 'mid grey';
  if (l < 0.75) return 'light grey';
  if (l < 0.9) return 'pale grey';
  if (l < 0.97) return 'off-white';
  return 'pure white';
}

function lightnessWord(l) {
  if (l < 0.12) return 'near-black';
  if (l < 0.28) return 'very deep';
  if (l < 0.42) return 'deep';
  if (l < 0.58) return '';
  if (l < 0.72) return 'light';
  if (l < 0.86) return 'pale';
  return 'very pale';
}

function saturationWord(s) {
  if (s < 0.18) return 'greyed';
  if (s < 0.35) return 'muted';
  if (s < 0.6) return 'soft';
  if (s < 0.82) return 'rich';
  return 'vivid';
}

// A short plain-language name for a hex value, e.g. "a deep rich indigo blue".
export function describeHex(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return '';
  const { h, s, l } = rgbToHsl(rgb);

  if (s < 0.08) return neutralName(l);

  const words = [lightnessWord(l), saturationWord(s), hueName(h)].filter(Boolean);
  return words.join(' ');
}

// Full phrase used inside the prompt: name first, hex second.
export function colourPhrase(hex) {
  const clean = normaliseHex(hex);
  if (!clean) return '';
  const name = describeHex(clean);
  return name ? `${name}, hex ${clean}` : `hex ${clean}`;
}

// Whether black or white text sits better on the swatch, for the UI.
export function readableInk(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#000000';
  const lum = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  return lum > 150 ? '#000000' : '#FFFFFF';
}
