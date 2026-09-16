'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ENGINE_LIST,
  DEFAULT_ENGINE,
  routeFor,
  ASPECTS,
  RESOLUTIONS,
  DEFAULT_RESOLUTION,
  resolutionCapLabel,
} from '../lib/engines';
import { normaliseHex, colourPhrase, describeHex, readableInk } from '../lib/colour';
import {
  GENDERS,
  MODEL_PRESETS,
  UPLOAD_KEY,
  presetsFor,
  presetByKey,
} from '../lib/models';
import {
  POSES,
  buildPrompt,
  buildRefinePrompt,
  FIDELITY_RULES,
} from '../lib/poses';
import { qcChecklist, DEFECT_GROUPS } from '../lib/qa';

// ---------------------------------------------------------------------------
// Tunable constants
// ---------------------------------------------------------------------------

const DESAT = 0.1;            // 10% HSL saturation reduction, display copy only
// Grain strength on skin midtones, display copy only. The client's defect
// register lists artificial texture buildup as a rejection reason, and this
// pass is capable of causing exactly that, so it is operator-controlled and
// defaults low rather than being baked in.
const SKIN_TEXTURE_LEVELS = {
  off: { label: 'Off — engine texture only', value: 0 },
  light: { label: 'Light', value: 0.3 },
  standard: { label: 'Standard', value: 0.55 },
};
const DEFAULT_SKIN_TEXTURE = 'light';
const REF_MAX_DIM = 1400;     // garment references
const PATTERN_MAX_DIM = 2048; // pattern close-ups keep every motif edge
const MODEL_MAX_DIM = 900;    // model head references
const ANCHOR_MAX_DIM = 900;   // anchor frame when re-sent
const SHEET_MAX_DIM = 2048;   // contact sheet of extra garment / footwear views
const PAYLOAD_BUDGET = 3_400_000; // stay under Vercel's 4.5 MB request limit

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That image could not be read.'));
    img.src = src;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsDataURL(file);
  });
}

async function resizeDataUrl(dataUrl, maxDim, quality = 0.9) {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

async function urlToDataUrl(url, maxDim = MODEL_MAX_DIM) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  const blob = await res.blob();
  const raw = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Read failed'));
    reader.readAsDataURL(blob);
  });
  return resizeDataUrl(raw, maxDim, 0.92);
}

// Both engines cap at six reference images per call, so a large reference set
// cannot be sent one image per slot. Compositing them into a single high
// resolution contact sheet gets every view in front of the engine using one
// slot, and cuts the upload size at the same time.
async function buildContactSheet(dataUrls, maxDim = SHEET_MAX_DIM) {
  if (!dataUrls.length) return null;
  if (dataUrls.length === 1) return dataUrls[0];

  const imgs = await Promise.all(dataUrls.map(loadImage));
  const cols = Math.ceil(Math.sqrt(imgs.length));
  const rows = Math.ceil(imgs.length / cols);
  const cell = Math.floor(maxDim / Math.max(cols, rows));

  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  imgs.forEach((img, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const scale = Math.min(cell / img.width, cell / img.height);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    ctx.drawImage(img, c * cell + (cell - w) / 2, r * cell + (cell - h) / 2, w, h);
  });

  return canvas.toDataURL('image/jpeg', 0.92);
}

// Progressively re-encode until the whole request fits inside Vercel's limit.
async function fitPayload(images) {
  const steps = [
    { dim: REF_MAX_DIM, q: 0.9 },
    { dim: 1152, q: 0.88 },
    { dim: 1024, q: 0.85 },
    { dim: 896, q: 0.82 },
    { dim: 768, q: 0.8 },
    { dim: 640, q: 0.75 },
  ];
  let current = images;
  for (const step of steps) {
    const total = current.reduce((sum, u) => sum + u.length, 0);
    if (total < PAYLOAD_BUDGET) return current;
    current = await Promise.all(images.map((u) => resizeDataUrl(u, step.dim, step.q)));
  }
  return current;
}

// --- colour maths -----------------------------------------------------------

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// Monochromatic zero-mean grain, luminance-masked so the white backdrop stays
// clean and only skin midtones receive texture.
function addSkinTexture(data, amount) {
  const strength = amount * 7;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (!(r > g && g >= b)) continue;
    if (lum <= 36 || lum >= 236) continue;
    const rise = Math.min(1, (lum - 36) / 40);
    const fall = Math.min(1, (236 - lum) / 40);
    const warmth = Math.min(1, (r - b) / 40);
    const mask = rise * fall * warmth;
    if (mask <= 0) continue;
    const n = (Math.random() * 2 - 1) * strength * mask;
    data[i] = clamp255(r + n);
    data[i + 1] = clamp255(g + n);
    data[i + 2] = clamp255(b + n);
  }
}

// Applied to the display and download copy only. The raw frame is never
// touched: it stays the identity anchor and the base for any refine pass.
async function postProcess(dataUrl, skinTexture = 0) {
  try {
    const img = await loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;

    if (DESAT > 0) {
      const factor = 1 - DESAT;
      for (let i = 0; i < d.length; i += 4) {
        const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
        if (s === 0) continue;
        const [r, g, b] = hslToRgb(h, s * factor, l);
        d[i] = clamp255(r);
        d[i + 1] = clamp255(g);
        d[i + 2] = clamp255(b);
      }
    }
    if (skinTexture > 0) addSkinTexture(d, skinTexture);

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (e) {
    return dataUrl;
  }
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const stamp = () =>
  new Date().toLocaleTimeString('en-GB', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

// ---------------------------------------------------------------------------
// Reference slot
// ---------------------------------------------------------------------------

function RefSlot({ title, role, note, limit, items, onAdd, onRemove }) {
  const inputRef = useRef(null);

  async function handleFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const maxDim = role === 'pattern' || role === 'logo' ? PATTERN_MAX_DIM : REF_MAX_DIM;
    const next = [];
    for (const file of files.slice(0, limit - items.length)) {
      const raw = await fileToDataUrl(file);
      next.push(await resizeDataUrl(raw, maxDim, 0.92));
    }
    onAdd(next);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="slot">
      <div className="slot-head">
        <strong>{title}</strong>
        <span>
          {items.length}/{limit}
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={limit > 1}
        onChange={handleFiles}
        disabled={items.length >= limit}
      />
      {note ? <div className="hint">{note}</div> : null}
      {items.length ? (
        <div className="thumbs">
          {items.map((src, i) => (
            <div className="thumb" key={`${role}-${i}`}>
              <img src={src} alt={`${title} ${i + 1}`} />
              <button type="button" onClick={() => onRemove(i)} aria-label="Remove image">
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model picker
// ---------------------------------------------------------------------------

function ModelPicker({ gender, setGender, selected, setSelected, custom, setCustom }) {
  const presets = presetsFor(gender);
  const inputRef = useRef(null);

  useEffect(() => {
    if (selected !== UPLOAD_KEY && !presets.some((p) => p.key === selected)) {
      setSelected(presets[0]?.key || UPLOAD_KEY);
    }
  }, [gender]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpload(event) {
    const files = Array.from(event.target.files || []).slice(0, 4);
    if (!files.length) return;
    const next = [];
    for (const file of files) {
      const raw = await fileToDataUrl(file);
      next.push(await resizeDataUrl(raw, MODEL_MAX_DIM, 0.92));
    }
    setCustom(next);
    setSelected(UPLOAD_KEY);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div>
      <div className="gender-toggle">
        {GENDERS.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`seg-btn${gender === g.id ? ' on' : ''}`}
            onClick={() => setGender(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="model-grid">
        {presets.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`model-card${selected === m.key ? ' on' : ''}`}
            onClick={() => setSelected(m.key)}
            title={m.name}
          >
            <span className="model-thumb">
              <img src={`/models/${m.file}`} alt={m.name} loading="lazy" />
            </span>
            <span className="model-name">{m.name}</span>
          </button>
        ))}

        <button
          type="button"
          className={`model-card upload${selected === UPLOAD_KEY ? ' on' : ''}`}
          onClick={() => inputRef.current?.click()}
        >
          <span className="model-thumb">
            {custom.length ? <img src={custom[0]} alt="Your model" /> : <span className="plus">+</span>}
          </span>
          <span className="model-name">{custom.length ? 'Yours' : 'Upload'}</span>
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleUpload}
        style={{ display: 'none' }}
      />
      <div className="hint">
        Each preset ships four reference angles. The shot you ask for is sent the angle that matches it.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Page() {
  const [engine, setEngine] = useState(DEFAULT_ENGINE);
  const [aspect, setAspect] = useState('3:4');
  const [resolution, setResolution] = useState(DEFAULT_RESOLUTION);
  const [notes, setNotes] = useState('');
  const [skinTexture, setSkinTexture] = useState(DEFAULT_SKIN_TEXTURE);
  const [qcDone, setQcDone] = useState({});

  const [gender, setGender] = useState('men');
  const [selectedModel, setSelectedModel] = useState('andre');
  const [customModel, setCustomModel] = useState([]);

  const [garment, setGarment] = useState([]);
  const [pattern, setPattern] = useState([]);
  const [logo, setLogo] = useState([]);
  const [footwear, setFootwear] = useState([]);
  const [bottoms, setBottoms] = useState([]);

  const [recolour, setRecolour] = useState(false);
  const [hex, setHex] = useState('#1B2A4A');
  const [colourScope, setColourScope] = useState('the whole garment');

  const [selected, setSelected] = useState(POSES.map((p) => p.id));
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [log, setLog] = useState([]);
  const [refineText, setRefineText] = useState({});
  const [poseText, setPoseText] = useState(() =>
    Object.fromEntries(POSES.map((p) => [p.id, p.description]))
  );

  const cleanHex = useMemo(() => normaliseHex(hex), [hex]);
  const colourSpec = useMemo(() => {
    if (!recolour || !cleanHex) return null;
    return { phrase: colourPhrase(cleanHex), scope: colourScope };
  }, [recolour, cleanHex, colourScope]);

  const pairingSpec = useMemo(
    () => ({ hasBottoms: bottoms.length > 0, hasFootwear: footwear.length > 0 }),
    [bottoms.length, footwear.length]
  );

  const route = useMemo(() => routeFor(engine), [engine]);
  const preset = useMemo(() => presetByKey(selectedModel), [selectedModel]);
  const isChild = preset?.gender === 'kids';
  const anchorPose = useMemo(
    () =>
      POSES.find((p) => p.anchor && selected.includes(p.id)) ||
      POSES.find((p) => selected.includes(p.id)),
    [selected]
  );

  function note(line) {
    setLog((prev) => [...prev.slice(-40), `${stamp()}  ${line}`]);
  }

  function togglePose(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Model reference images for a given pose: the preset's matching angle files,
  // or the operator's own uploads when no preset is selected.
  async function modelRefsFor(pose) {
    if (!preset) return customModel.slice(0, 3);
    const base = preset.file.replace(/\.jpg$/i, '');
    const files = pose.angles.map((suffix) => `/models/${base}${suffix}.jpg`);
    const out = [];
    for (const f of files) {
      try {
        out.push(await urlToDataUrl(f));
      } catch (e) {
        // A missing angle file should not kill the shot.
      }
    }
    return out;
  }

  const modelDescriptor = preset
    ? preset.face
    : 'The model is the exact person shown in the supplied model reference photographs. Match their face, complexion, hair and build precisely, and preserve their skin tone exactly as photographed with no lightening or brightening whatsoever.';

  async function callEngine(prompt, images) {
    const fitted = await fitPayload(images);
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine, prompt, images: fitted, aspect, resolution }),
    });
    if (!res.ok) {
      const data = await res
        .json()
        .catch(() => ({ error: `The engine returned ${res.status} with no readable message.` }));
      throw new Error([data.error, data.detail].filter(Boolean).join(' — '));
    }
    // Success comes back as raw image bytes, not JSON. Base64 inside JSON
    // overflowed the response limit at 2K and broke the parse.
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('The generated image could not be read.'));
      reader.readAsDataURL(blob);
    });
  }

  async function runSet(poseIds) {
    setError('');
    if (!garment.length) {
      setError('Add at least one garment reference before generating.');
      return;
    }
    if (!poseIds.length) {
      setError('Select at least one shot.');
      return;
    }
    if (!preset && !customModel.length) {
      setError('Pick a model, or upload your own reference photographs.');
      return;
    }

    setBusy(true);
    setResults(
      poseIds.map((id) => {
        const pose = POSES.find((p) => p.id === id);
        return { poseId: id, name: pose.name, status: 'queued', raw: null, display: null, error: null };
      })
    );

    const update = (id, patch) =>
      setResults((prev) => prev.map((r) => (r.poseId === id ? { ...r, ...patch } : r)));

    // Anchor first: generated alone, then handed to every other shot as a
    // master reference for identity, garment and print — but explicitly not
    // for camera angle.
    const ordered = [...poseIds].sort((a, b) => {
      if (a === anchorPose?.id) return -1;
      if (b === anchorPose?.id) return 1;
      return 0;
    });

    let anchorImage = null;

    for (const id of ordered) {
      const pose = POSES.find((p) => p.id === id);
      const isAnchor = anchorImage === null;
      update(id, { status: isAnchor ? 'generating anchor' : 'generating' });
      note(`${pose.name} — ${route.label}${isAnchor ? ' (anchor)' : ''}`);

      const modelImages = await modelRefsFor(pose);

      // Priority order. Everything the engine needs to hold identity and print
      // must survive the cap, so budget is allocated deliberately rather than
      // letting a trailing slice decide what gets dropped.
      // Slot budget. Both engines cap at six references per call, so slots are
      // filled by priority and the least load-bearing are the ones that miss
      // out. Identity, the garment and the emblem are never what gets dropped.
      const garmentSheet =
        garment.length > 1 ? await buildContactSheet(garment.slice(1)) : null;
      const logoImage = logo.length > 1 ? await buildContactSheet(logo) : logo[0] || null;
      const footwearImage =
        footwear.length > 1 ? await buildContactSheet(footwear) : footwear[0] || null;
      const bottomsImage =
        bottoms.length > 1 ? await buildContactSheet(bottoms) : bottoms[0] || null;

      const candidates = [
        { role: 'garment', src: garment[0], priority: 1 },
        { role: 'modelAngle', src: modelImages[0], priority: 2 },
        { role: 'anchor', src: !isAnchor ? anchorImage : null, priority: 3 },
        { role: 'logo', src: logoImage, priority: 4 },
        { role: 'pattern', src: pattern[0], priority: 5 },
        { role: 'garmentSheet', src: garmentSheet, priority: 6 },
        // Bottoms sit above footwear because they occupy far more of the frame,
        // so a wrong pair of trousers is the more expensive miss.
        {
          role: bottoms.length > 1 ? 'bottomsSheet' : 'bottoms',
          src: bottomsImage,
          priority: 7,
        },
        {
          role: footwear.length > 1 ? 'footwearSheet' : 'footwear',
          src: footwearImage,
          priority: 8,
        },
        { role: 'model', src: modelImages[1], priority: 9 },
      ].filter((c) => !!c.src);

      // Presentation order for the reference map, independent of priority.
      const displayOrder = [
        'garment',
        'garmentSheet',
        'pattern',
        'logo',
        'modelAngle',
        'model',
        'bottoms',
        'bottomsSheet',
        'footwear',
        'footwearSheet',
        'anchor',
      ];

      const chosen = [...candidates]
        .sort((a, b) => a.priority - b.priority)
        .slice(0, route.maxRefs)
        .sort((a, b) => displayOrder.indexOf(a.role) - displayOrder.indexOf(b.role));

      const trimmed = chosen.map((c) => ({ role: c.role }));
      const trimmedImages = chosen.map((c) => c.src);

      const prompt = buildPrompt({
        engine,
        pose,
        refs: trimmed,
        modelDescriptor,
        isChild,
        hasAnchor: !isAnchor && !!anchorImage,
        notes,
        colour: colourSpec,
        pairing: pairingSpec,
        overrideDescription:
          poseText[pose.id] !== pose.description ? poseText[pose.id] : '',
      });

      try {
        const raw = await callEngine(prompt, trimmedImages);
        const display = await postProcess(raw, SKIN_TEXTURE_LEVELS[skinTexture].value);
        update(id, { status: 'done', raw, display, error: null });
        note(`${pose.name} — done`);
        if (isAnchor) anchorImage = await resizeDataUrl(raw, ANCHOR_MAX_DIM, 0.88);
      } catch (err) {
        update(id, { status: 'failed', error: String(err.message || err) });
        note(`${pose.name} — failed`);
        if (isAnchor) {
          setError('The anchor frame failed, so the rest of the set was not attempted.');
          break;
        }
      }
    }

    setBusy(false);
  }

  async function runRefine(poseId) {
    const target = results.find((r) => r.poseId === poseId);
    const instruction = (refineText[poseId] || '').trim();
    if (!target?.raw || !instruction) return;

    setBusy(true);
    setError('');

    const refs = [{ role: 'anchor' }];
    const images = [target.raw];
    garment.forEach((src) => {
      refs.push({ role: 'garment' });
      images.push(src);
    });
    pattern.forEach((src) => {
      refs.push({ role: 'pattern' });
      images.push(src);
    });
    logo.slice(0, 1).forEach((src) => {
      refs.push({ role: 'logo' });
      images.push(src);
    });

    setResults((prev) => prev.map((r) => (r.poseId === poseId ? { ...r, status: 'refining' } : r)));
    note(`${target.name} — refine: ${instruction.slice(0, 60)}`);

    try {
      const prompt = buildRefinePrompt({
        engine,
        refs: refs.slice(0, route.maxRefs),
        instruction,
        isChild,
        colour: colourSpec,
      });
      const raw = await callEngine(prompt, images.slice(0, route.maxRefs));
      const display = await postProcess(raw, SKIN_TEXTURE_LEVELS[skinTexture].value);
      setResults((prev) =>
        prev.map((r) =>
          r.poseId === poseId ? { ...r, raw, display, status: 'done', error: null } : r
        )
      );
      setRefineText((prev) => ({ ...prev, [poseId]: '' }));
      note(`${target.name} — refined`);
    } catch (err) {
      setResults((prev) =>
        prev.map((r) =>
          r.poseId === poseId ? { ...r, status: 'failed', error: String(err.message || err) } : r
        )
      );
      note(`${target.name} — refine failed`);
    }

    setBusy(false);
  }

  function downloadAll() {
    results
      .filter((r) => r.display)
      .forEach((r, i) => {
        setTimeout(() => downloadDataUrl(r.display, `${r.poseId}.png`), i * 350);
      });
  }

  const doneCount = results.filter((r) => r.status === 'done').length;
  const qcItems = useMemo(() => qcChecklist(), []);
  const qcPassed = qcItems.filter((q) => qcDone[q.id]).length;

  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <h1>Five Poses v2</h1>
          <div className="sub">
            Pattern-locked · Angle-locked · GPT Image 2.5 + Seedream + Nano Banana
          </div>
        </div>
        <div className="sub">
          {route.label} · {route.vendor}
        </div>
      </header>

      {error ? <div className="banner">{error}</div> : null}

      <div className="columns">
        {/* ---------------- controls ---------------- */}
        <div>
          <div className="panel">
            <h2>Model</h2>
            <ModelPicker
              gender={gender}
              setGender={setGender}
              selected={selectedModel}
              setSelected={setSelectedModel}
              custom={customModel}
              setCustom={setCustomModel}
            />
          </div>

          <div className="panel">
            <h2>References</h2>
            <div className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
              Every reference must be a photograph of the real garment. Feeding a generated frame
              back in re-teaches the engine the distortion you are trying to remove.
            </div>
            <RefSlot
              title="Garment"
              role="garment"
              limit={6}
              items={garment}
              note="Up to 6 views of the same garment: front, back, side, collar, cuff, hem. The first is sent at full resolution; the rest are composited into one contact sheet."
              onAdd={(next) => setGarment((prev) => [...prev, ...next].slice(0, 6))}
              onRemove={(i) => setGarment((prev) => prev.filter((_, x) => x !== i))}
            />
            <RefSlot
              title="Pattern close-up"
              role="pattern"
              limit={2}
              items={pattern}
              note="A macro photograph of the real fabric, cropped tight on the repeat at full camera resolution."
              onAdd={(next) => setPattern((prev) => [...prev, ...next].slice(0, 2))}
              onRemove={(i) => setPattern((prev) => prev.filter((_, x) => x !== i))}
            />
            <RefSlot
              title="Logo / emblem"
              role="logo"
              limit={2}
              items={logo}
              note="A macro of the brand mark on this garment, shot square on and sharp. Highest-value reference you can give — logo distortion is the client's most-cited defect."
              onAdd={(next) => setLogo((prev) => [...prev, ...next].slice(0, 2))}
              onRemove={(i) => setLogo((prev) => prev.filter((_, x) => x !== i))}
            />
            <RefSlot
              title="Trousers / bottoms"
              role="bottoms"
              limit={5}
              items={bottoms}
              note="Optional. The lower garment to pair with this piece: trousers, jeans, shorts or a skirt. Up to 5 views of the same item, composited into one contact sheet."
              onAdd={(next) => setBottoms((prev) => [...prev, ...next].slice(0, 5))}
              onRemove={(i) => setBottoms((prev) => prev.filter((_, x) => x !== i))}
            />
            <RefSlot
              title="Footwear"
              role="footwear"
              limit={5}
              items={footwear}
              note="Optional. Up to 5 views of the same pair, composited into one contact sheet."
              onAdd={(next) => setFootwear((prev) => [...prev, ...next].slice(0, 5))}
              onRemove={(i) => setFootwear((prev) => prev.filter((_, x) => x !== i))}
            />
          </div>

          <div className="panel">
            <h2>Colourway</h2>
            <div className="pose-row" style={{ marginBottom: 10 }}>
              <input
                id="recolour"
                type="checkbox"
                checked={recolour}
                onChange={(e) => setRecolour(e.target.checked)}
              />
              <label htmlFor="recolour" className="nm">
                Change the garment colour
              </label>
            </div>

            {recolour ? (
              <>
                <div className="field">
                  <label className="lbl" htmlFor="hex">
                    Target colour
                  </label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="color"
                      aria-label="Colour picker"
                      value={cleanHex || '#000000'}
                      onChange={(e) => setHex(e.target.value.toUpperCase())}
                      style={{
                        width: 46,
                        height: 38,
                        padding: 2,
                        flex: '0 0 auto',
                        cursor: 'pointer',
                      }}
                    />
                    <input
                      id="hex"
                      type="text"
                      value={hex}
                      spellCheck={false}
                      onChange={(e) => setHex(e.target.value)}
                      placeholder="#1B2A4A"
                      style={{ flex: 1, minWidth: 0 }}
                    />
                  </div>
                  {cleanHex ? (
                    <div
                      style={{
                        marginTop: 8,
                        padding: '8px 10px',
                        borderRadius: 6,
                        background: cleanHex,
                        color: readableInk(cleanHex),
                        fontSize: 13,
                      }}
                    >
                      {describeHex(cleanHex)} · {cleanHex}
                    </div>
                  ) : (
                    <div className="hint" style={{ color: '#c2410c' }}>
                      That is not a readable hex code. Use a 3 or 6 character value such as #1B2A4A.
                    </div>
                  )}
                </div>

                <div className="field">
                  <label className="lbl" htmlFor="colour-scope">
                    Apply to
                  </label>
                  <select
                    id="colour-scope"
                    value={colourScope}
                    onChange={(e) => setColourScope(e.target.value)}
                  >
                    <option value="the whole garment">The whole garment</option>
                    <option value="the body of the garment only, leaving the collar, cuffs and any contrast trim exactly as referenced">
                      Body only, keep trims as referenced
                    </option>
                    <option value="the collar, cuffs and contrast trim only, leaving the body of the garment exactly as referenced">
                      Trims only, keep body as referenced
                    </option>
                    <option value="the background colour of the pattern only, leaving every motif in its referenced colour">
                      Pattern background only
                    </option>
                  </select>
                  <div className="hint">
                    The emblem always keeps its own colours. Pattern geometry never changes, only
                    the colours sitting inside it.
                  </div>
                </div>
              </>
            ) : (
              <div className="hint" style={{ marginTop: -4 }}>
                Off by default. Leave it off and the garment colour is matched to the reference
                exactly, which is what a standard catalogue run wants.
              </div>
            )}
          </div>

          <div className="panel">
            <h2>Shots</h2>
            {POSES.map((pose) => (
              <div className="pose-block" key={pose.id}>
                <div className="pose-row">
                  <input
                    id={`pose-${pose.id}`}
                    type="checkbox"
                    checked={selected.includes(pose.id)}
                    onChange={() => togglePose(pose.id)}
                  />
                  <label htmlFor={`pose-${pose.id}`} className="nm">
                    {pose.name}
                    {pose.anchor ? <span className="tag">ANCHOR</span> : null}
                  </label>
                  {poseText[pose.id] !== pose.description ? (
                    <button
                      className="ghost tiny"
                      onClick={() =>
                        setPoseText((prev) => ({ ...prev, [pose.id]: pose.description }))
                      }
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
                {selected.includes(pose.id) ? (
                  <textarea
                    className="pose-text"
                    value={poseText[pose.id]}
                    onChange={(e) =>
                      setPoseText((prev) => ({ ...prev, [pose.id]: e.target.value }))
                    }
                    rows={4}
                  />
                ) : null}
              </div>
            ))}
            <div className="hint">
              The anchor is generated first and passed to the others for identity, garment and print
              only — never for camera angle.
            </div>
          </div>

          <div className="panel">
            <h2>Output</h2>
            <div className="field">
              <label className="lbl" htmlFor="engine">
                Image engine
              </label>
              <select id="engine" value={engine} onChange={(e) => setEngine(e.target.value)}>
                {ENGINE_LIST.map((en) => (
                  <option key={en.id} value={en.id}>
                    {en.label} — {en.vendor}
                  </option>
                ))}
              </select>
              <div className="engine-note">{route.note}</div>
            </div>

            <div className="field">
              <label className="lbl" htmlFor="resolution">
                Resolution
              </label>
              <select
                id="resolution"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              >
                {Object.entries(RESOLUTIONS).map(([key, val]) => (
                  <option key={key} value={key}>
                    {val.label}
                  </option>
                ))}
              </select>
              <div className="hint">
                Fine repeats break up below 2K. This engine caps at{' '}
                {resolutionCapLabel(engine)}. On GPT Image 2.5 this also sets the quality tier,
                which is the main thing driving what a shot costs.
              </div>
            </div>

            <div className="field">
              <label className="lbl" htmlFor="aspect">
                Frame
              </label>
              <select id="aspect" value={aspect} onChange={(e) => setAspect(e.target.value)}>
                {Object.entries(ASPECTS).map(([key, val]) => (
                  <option key={key} value={key}>
                    {val.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="lbl" htmlFor="skin-texture">
                Skin grain pass
              </label>
              <select
                id="skin-texture"
                value={skinTexture}
                onChange={(e) => setSkinTexture(e.target.value)}
              >
                {Object.entries(SKIN_TEXTURE_LEVELS).map(([key, val]) => (
                  <option key={key} value={key}>
                    {val.label}
                  </option>
                ))}
              </select>
              <div className="hint">
                Applied to the display copy only. Turn it off if the engine is already
                producing good skin — stacking grain on top reads as artificial texture
                buildup, which is a documented rejection reason.
              </div>
            </div>

            <div className="field">
              <label className="lbl" htmlFor="notes">
                Additional direction
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything specific to this set. Leave blank for standard catalogue treatment."
              />
            </div>
          </div>

          <div className="panel">
            <button className="primary" onClick={() => runSet(selected)} disabled={busy}>
              {busy ? 'Working…' : `Generate ${selected.length} shot${selected.length === 1 ? '' : 's'}`}
            </button>
            <div style={{ height: 8 }} />
            <button
              style={{ width: '100%' }}
              onClick={() => runSet(anchorPose ? [anchorPose.id] : [])}
              disabled={busy || !anchorPose}
            >
              Pattern test — anchor shot only
            </button>
            <div className="hint">
              Use the pattern test to check a print in one call before spending a full set.
            </div>
          </div>

          <div className="panel">
            <details>
              <summary>Rules in force on every shot</summary>
              <ul className="rules" style={{ marginTop: 10 }}>
                {FIDELITY_RULES.map((rule, i) => (
                  <li key={i}>{rule}</li>
                ))}
              </ul>
            </details>
          </div>
        </div>

        {/* ---------------- results ---------------- */}
        <div>
          {log.length ? <div className="log">{log.join('\n')}</div> : null}

          {results.length ? (
            <div className="toolbar">
              <span className="status">
                {doneCount} of {results.length} complete
              </span>
              <button className="ghost" onClick={downloadAll} disabled={!doneCount}>
                Download all
              </button>
            </div>
          ) : null}

          {doneCount > 0 ? (
            <div className="panel qc">
              <h2>
                Delivery QC — {qcPassed} of {qcItems.length} checked
              </h2>
              <div className="hint" style={{ marginTop: -6, marginBottom: 10 }}>
                Every item below is a fault the client has documented in delivered imagery.
                Work through the set at 100 percent zoom before sending anything out.
              </div>
              {DEFECT_GROUPS.map((group) => (
                <div key={group} className="qc-group">
                  <div className="qc-group-name">{group}</div>
                  {qcItems
                    .filter((q) => q.group === group)
                    .map((q) => (
                      <label className="qc-row" key={q.id}>
                        <input
                          type="checkbox"
                          checked={!!qcDone[q.id]}
                          onChange={() =>
                            setQcDone((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                          }
                        />
                        <span>
                          <strong>{q.name}</strong>
                          <em>{q.check}</em>
                        </span>
                      </label>
                    ))}
                </div>
              ))}
              <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
                <button className="ghost" onClick={() => setQcDone({})}>
                  Reset checklist
                </button>
                <span className="status">
                  {qcPassed === qcItems.length ? 'Cleared for delivery' : 'Not yet cleared'}
                </span>
              </div>
            </div>
          ) : null}

          {results.length === 0 ? (
            <div className="empty">
              Pick a model, add a garment reference and a tight crop of the pattern, then run the
              pattern test.
              <br />
              Results appear here on a neutral grey mat so colour and print read true.
            </div>
          ) : (
            <div className="grid">
              {results.map((r) => (
                <div className="card" key={r.poseId}>
                  <div className="card-mat">
                    {r.display ? (
                      <img src={r.display} alt={r.name} />
                    ) : (
                      <div className="pending">{r.status}</div>
                    )}
                  </div>
                  <div className="card-body">
                    <div className="card-title">
                      <strong>{r.name}</strong>
                      <span>{r.status}</span>
                    </div>

                    {r.error ? <div className="status err">{r.error}</div> : null}

                    {r.display ? (
                      <>
                        <div className="card-actions" style={{ marginBottom: 8 }}>
                          <button
                            className="ghost"
                            onClick={() => downloadDataUrl(r.display, `${r.poseId}.png`)}
                          >
                            Download
                          </button>
                          <button
                            className="ghost"
                            onClick={() => downloadDataUrl(r.raw, `${r.poseId}-raw.png`)}
                          >
                            Raw
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Fix one thing, e.g. shorten the nails"
                          value={refineText[r.poseId] || ''}
                          onChange={(e) =>
                            setRefineText((prev) => ({ ...prev, [r.poseId]: e.target.value }))
                          }
                        />
                        <div style={{ height: 6 }} />
                        <button
                          className="ghost"
                          onClick={() => runRefine(r.poseId)}
                          disabled={busy || !(refineText[r.poseId] || '').trim()}
                        >
                          Refine this shot
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
