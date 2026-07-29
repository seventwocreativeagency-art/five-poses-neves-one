'use client';

import { useMemo, useRef, useState } from 'react';
import {
  ENGINE_LIST,
  DEFAULT_ENGINE,
  routeFor,
  ASPECTS,
} from '../lib/engines';
import {
  POSES,
  MODEL_PRESETS,
  modelPresetById,
  buildPrompt,
  buildRefinePrompt,
  FIDELITY_RULES,
} from '../lib/poses';

// ---------------------------------------------------------------------------
// Tunable constants
// ---------------------------------------------------------------------------

const DESAT = 0.1;            // 10% HSL saturation reduction, display copy only
const SKIN_TEXTURE = 0.55;    // grain strength on skin midtones, display copy only
const REF_MAX_DIM = 1400;     // reference images are resized to this before upload
const PATTERN_MAX_DIM = 1600; // pattern close-ups keep more detail
const ANCHOR_MAX_DIM = 900;   // anchor frame is downscaled before being re-sent
const PAYLOAD_BUDGET = 3_400_000; // stay well under Vercel's 4.5 MB request limit

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
  return [
    hue2rgb(p, q, h + 1 / 3) * 255,
    hue2rgb(p, q, h) * 255,
    hue2rgb(p, q, h - 1 / 3) * 255,
  ];
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

    // Skin sits warm: red above green above blue. Backdrop and garment do not.
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

// Applied to the display and download copy only. The raw blob is never touched:
// it stays the identity anchor and the base for any refine pass.
async function postProcess(dataUrl) {
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

    if (SKIN_TEXTURE > 0) addSkinTexture(d, SKIN_TEXTURE);

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
  new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

// ---------------------------------------------------------------------------
// Reference slot
// ---------------------------------------------------------------------------

function RefSlot({ title, role, note, limit, items, onAdd, onRemove }) {
  const inputRef = useRef(null);

  async function handleFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const maxDim = role === 'pattern' ? PATTERN_MAX_DIM : REF_MAX_DIM;
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
// Page
// ---------------------------------------------------------------------------

export default function Page() {
  const [engine, setEngine] = useState(DEFAULT_ENGINE);
  const [aspect, setAspect] = useState('3:4');
  const [patternLevel, setPatternLevel] = useState('strict');
  const [modelPreset, setModelPreset] = useState('male-deep');
  const [notes, setNotes] = useState('');

  const [garment, setGarment] = useState([]);
  const [pattern, setPattern] = useState([]);
  const [modelRef, setModelRef] = useState([]);
  const [footwear, setFootwear] = useState([]);

  const [selected, setSelected] = useState(POSES.map((p) => p.id));
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [log, setLog] = useState([]);
  const [refineText, setRefineText] = useState({});

  const route = useMemo(() => routeFor(engine), [engine]);
  const anchorPose = useMemo(
    () => POSES.find((p) => p.anchor && selected.includes(p.id)) || POSES.find((p) => selected.includes(p.id)),
    [selected]
  );

  function note(line) {
    setLog((prev) => [...prev.slice(-40), `${stamp()}  ${line}`]);
  }

  function togglePose(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Reference images in the exact order they are sent to the engine, so the
  // reference map in the prompt lines up with Figure 1, Figure 2, and so on.
  function collectRefs() {
    const refs = [];
    garment.forEach((src) => refs.push({ role: 'garment', src }));
    pattern.forEach((src) => refs.push({ role: 'pattern', src }));
    modelRef.forEach((src) => refs.push({ role: 'model', src }));
    footwear.forEach((src) => refs.push({ role: 'footwear', src }));
    return refs.slice(0, route.maxRefs);
  }

  async function callEngine(prompt, images) {
    const fitted = await fitPayload(images);
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine, prompt, images: fitted, aspect }),
    });
    const data = await res.json().catch(() => ({ error: 'The server sent back an unreadable response.' }));
    if (!res.ok || data.error) {
      throw new Error([data.error, data.detail].filter(Boolean).join(' — '));
    }
    return data.image;
  }

  async function runSet(poseIds) {
    setError('');
    const refs = collectRefs();
    if (!refs.length) {
      setError('Add at least one garment reference before generating.');
      return;
    }
    if (!poseIds.length) {
      setError('Select at least one shot.');
      return;
    }

    const preset = modelPresetById(modelPreset);
    if (modelPreset === 'from-reference' && !modelRef.length) {
      setError('That model preset needs a model reference image, or pick a described model instead.');
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

    // Anchor first: the anchor frame is generated alone, then handed to every
    // other shot as a master reference so identity and pattern stay locked.
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

      const promptRefs = isAnchor ? refs : [...refs, { role: 'anchor' }];
      const images = isAnchor ? refs.map((r) => r.src) : [...refs.map((r) => r.src), anchorImage];

      const prompt = buildPrompt({
        engine,
        pose,
        refs: promptRefs,
        modelDescriptor: preset.descriptor,
        patternLevel,
        hasAnchor: !isAnchor,
        notes,
      });

      try {
        const raw = await callEngine(prompt, images);
        const display = await postProcess(raw);
        update(id, { status: 'done', raw, display, error: null });
        note(`${pose.name} — done`);
        if (isAnchor) anchorImage = await resizeDataUrl(raw, ANCHOR_MAX_DIM, 0.88);
      } catch (err) {
        update(id, { status: 'failed', error: String(err.message || err) });
        note(`${pose.name} — failed`);
        if (isAnchor) {
          setError(
            'The anchor frame failed, so the rest of the set was not attempted. Fix the error above and run again.'
          );
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
    const refs = collectRefs().filter((r) => r.role === 'garment' || r.role === 'pattern');
    const promptRefs = [{ role: 'anchor' }, ...refs];
    const images = [target.raw, ...refs.map((r) => r.src)];

    setResults((prev) => prev.map((r) => (r.poseId === poseId ? { ...r, status: 'refining' } : r)));
    note(`${target.name} — refine: ${instruction.slice(0, 60)}`);

    try {
      const prompt = buildRefinePrompt({ engine, refs: promptRefs, instruction });
      const raw = await callEngine(prompt, images);
      const display = await postProcess(raw);
      setResults((prev) =>
        prev.map((r) => (r.poseId === poseId ? { ...r, raw, display, status: 'done', error: null } : r))
      );
      setRefineText((prev) => ({ ...prev, [poseId]: '' }));
      note(`${target.name} — refined`);
    } catch (err) {
      setResults((prev) =>
        prev.map((r) => (r.poseId === poseId ? { ...r, status: 'failed', error: String(err.message || err) } : r))
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

  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <h1>Five Poses v2</h1>
          <div className="sub">Pattern-locked · Seedream + Nano Banana</div>
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
            <h2>Engine</h2>
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
              <label className="lbl" htmlFor="pattern-level">
                Pattern lock
              </label>
              <select
                id="pattern-level"
                value={patternLevel}
                onChange={(e) => setPatternLevel(e.target.value)}
              >
                <option value="standard">Standard — plain or simple garments</option>
                <option value="strict">Strict — prints, checks, stripes</option>
                <option value="forensic">Forensic — fine repeats and lettering</option>
              </select>
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
          </div>

          <div className="panel">
            <h2>References</h2>
            <RefSlot
              title="Garment"
              role="garment"
              limit={3}
              items={garment}
              note="Flat lay or ghost mannequin, shot square on."
              onAdd={(next) => setGarment((prev) => [...prev, ...next].slice(0, 3))}
              onRemove={(i) => setGarment((prev) => prev.filter((_, x) => x !== i))}
            />
            <RefSlot
              title="Pattern close-up"
              role="pattern"
              limit={2}
              items={pattern}
              note="The single biggest fix for print distortion. Crop tight on the repeat, in focus, filling the frame."
              onAdd={(next) => setPattern((prev) => [...prev, ...next].slice(0, 2))}
              onRemove={(i) => setPattern((prev) => prev.filter((_, x) => x !== i))}
            />
            <RefSlot
              title="Model"
              role="model"
              limit={1}
              items={modelRef}
              note="Optional. Required only for the uploaded-model preset."
              onAdd={(next) => setModelRef(next.slice(0, 1))}
              onRemove={() => setModelRef([])}
            />
            <RefSlot
              title="Footwear"
              role="footwear"
              limit={1}
              items={footwear}
              note="Optional."
              onAdd={(next) => setFootwear(next.slice(0, 1))}
              onRemove={() => setFootwear([])}
            />
          </div>

          <div className="panel">
            <h2>Model</h2>
            <div className="field">
              <select value={modelPreset} onChange={(e) => setModelPreset(e.target.value)}>
                {MODEL_PRESETS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
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
            <h2>Shots</h2>
            {POSES.map((pose) => (
              <div className="pose-row" key={pose.id}>
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
              </div>
            ))}
            <div className="hint">
              The anchor is generated first and passed to every other shot as the master reference.
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
              <summary>Fidelity rules in force</summary>
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

          {results.length === 0 ? (
            <div className="empty">
              Add a garment reference and a tight crop of the pattern, then run the pattern test.
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
                          <button className="ghost" onClick={() => downloadDataUrl(r.display, `${r.poseId}.png`)}>
                            Download
                          </button>
                          <button className="ghost" onClick={() => downloadDataUrl(r.raw, `${r.poseId}-raw.png`)}>
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
