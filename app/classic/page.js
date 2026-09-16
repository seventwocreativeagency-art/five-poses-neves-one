"use client";

import "./classic.css";

import { useState, useEffect } from "react";
import {
  MODELS,
  MODEL_PRESETS,
  QUALITIES,
  BACKGROUNDS,
  ASPECT_RATIOS,
  REF_GROUPS,
  GARMENT_TYPES,
  POSE_SETS,
  POSE_ORDER,
  FOCUS,
  pickPose,
  buildPrompt,
  buildReframePrompt,
  buildRefinePrompt,
} from "../../lib/classic-poses";

const G = Object.fromEntries(REF_GROUPS.map((g) => [g.id, g]));

function downscale(file, maxDim = 1024) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const s = maxDim / Math.max(width, height);
          width = Math.round(width * s);
          height = Math.round(height * s);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Re-encode a dataURL into a smaller box / quality. Used to keep the whole
// request under Vercel's hard 4.5 MB serverless body limit.
function shrinkDataUrl(dataUrl, maxDim, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const m = Math.max(width, height);
      if (m > maxDim) {
        const s = maxDim / m;
        width = Math.round(width * s);
        height = Math.round(height * s);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function approxBytes(dataUrls) {
  return dataUrls.reduce((n, d) => n + (d ? d.length : 0), 0) * 0.75;
}

// Shrink the whole image set step-by-step until it fits comfortably under the
// 4.5 MB serverless request-body limit. No-op when the set is already small.
async function fitPayload(images, capBytes = 4_000_000) {
  let imgs = images;
  const steps = [
    [1024, 0.82],
    [896, 0.8],
    [768, 0.76],
    [640, 0.72],
  ];
  for (const [dim, q] of steps) {
    if (approxBytes(imgs) <= capBytes) break;
    imgs = await Promise.all(imgs.map((d) => shrinkDataUrl(d, dim, q)));
  }
  return imgs;
}

function sizeFor(model, ratio) {
  if (model === "gpt-image-2") return `${ratio.w}x${ratio.h}`;
  if (ratio.w === ratio.h) return "1024x1024";
  return ratio.w < ratio.h ? "1024x1536" : "1536x1024";
}

const SEND = { product: 5, secondary: 3, model: 4, modelWithAnchor: 2, shoes: 2, composition: 1 };
// Lighter caps for the pose path (it also carries the pose photo), so the
// request stays well under Vercel's 4.5 MB body limit.
const SEND_POSE = { product: 4, secondary: 2, model: 3, shoes: 1, composition: 0 };
// Reframe path: the anchor (the finished Full Front) leads and carries the whole
// look, so we only add a few product refs + the face to reinforce fidelity.
const SEND_REFRAME = { product: 3, model: 3 };

function PersonIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="13" r="6" fill="none" stroke="#a59c8b" strokeWidth="1.6" />
      <path d="M9 33c0-7 5-11 11-11s11 4 11 11" fill="none" stroke="#cb8b5e" strokeWidth="1.6" />
    </svg>
  );
}

function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

/* ---- generic reference upload group (product / shoes / look) ---- */
function RefZone({ group, files, onAdd, onRemove }) {
  const [drag, setDrag] = useState(false);
  return (
    <div className={`zone${group.primary ? " zone-primary" : ""}`}>
      <div className="zone-label">
        {group.title}
        {group.optional ? <span className="zone-opt">optional</span> : <span className="zone-req">required</span>}
      </div>
      <div
        className={`dropzone compact${group.primary ? " primary" : ""}${drag ? " drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          onAdd(e.dataTransfer.files);
        }}
      >
        <div className="dropzone-sub">{group.hint}</div>
        <label>
          Choose files
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              onAdd(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {files.length > 0 && (
          <div className="thumbs">
            {files.map((r, i) => (
              <div className="thumb" key={i}>
                <img src={r.dataUrl} alt={r.name} />
                <button className="thumb-x" onClick={() => onRemove(i)} title="Remove">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- model picker: baked-in models (filtered by gender) + upload-your-own ---- */
function ModelPicker({ presets, selected, onSelect, uploadFiles, onAddUpload, onRemoveUpload }) {
  const current = presets.find((m) => m.key === selected);
  return (
    <div className="zone">
      <div className="zone-label">
        Model
        <span className="zone-req">required</span>
      </div>
      <div className="model-grid">
        {presets.map((m) => (
          <button
            key={m.key}
            className={`model-tile${selected === m.key ? " on" : ""}`}
            onClick={() => onSelect(m.key)}
            title={`${m.name} — ${m.hair}`}
          >
            <img src={`/models/${m.file}`} alt={m.name} />
            <span className="model-name">{m.name}</span>
          </button>
        ))}
        <button
          className={`model-tile upload${selected === "upload" ? " on" : ""}`}
          onClick={() => onSelect("upload")}
        >
          <span className="model-plus">+</span>
          <span className="model-name">Upload</span>
        </button>
      </div>

      {presets.length === 0 && selected === "upload" && (
        <div className="model-note">
          No saved faces here yet — upload your model's photos below. (Send the team a few male model
          shots and we'll add tap-to-pick faces here too.)
        </div>
      )}
      {selected === "upload" ? (
        <div className="dropzone compact" style={{ marginTop: 10 }}>
          <div className="dropzone-sub">Clear, evenly-lit, front-facing face shots of your model.</div>
          <label>
            Choose files
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                onAddUpload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {uploadFiles.length > 0 && (
            <div className="thumbs">
              {uploadFiles.map((r, i) => (
                <div className="thumb" key={i}>
                  <img src={r.dataUrl} alt={r.name} />
                  <button className="thumb-x" onClick={() => onRemoveUpload(i)} title="Remove">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="model-hint">
          Using <b>{current?.name}</b> — kept consistent across all five shots.
        </p>
      )}
    </div>
  );
}

export default function Page() {
  const [refs, setRefs] = useState({ garment: [], secondary: [], model: [], shoes: [], composition: [] });
  const [productDesc, setProductDesc] = useState("");
  const [secondaryDesc, setSecondaryDesc] = useState("");
  const [notes, setNotes] = useState("");
  const [model, setModel] = useState("gpt-image-2");
  const [aspect, setAspect] = useState("3:4");
  const [quality, setQuality] = useState("high");
  const [background, setBackground] = useState("opaque");

  const [selectedModel, setSelectedModel] = useState(MODEL_PRESETS[0].key);
  const [presetData, setPresetData] = useState({}); // key -> dataURL cache
  const [gender, setGender] = useState("women");

  const [garmentType, setGarmentType] = useState("upper");
  const [poses, setPoses] = useState(
    POSE_ORDER.map((key) => ({ key, enabled: true, poseRef: [] }))
  );
  const [results, setResults] = useState({});
  const [anchor, setAnchor] = useState(null);
  const [refineText, setRefineText] = useState({}); // slot -> instruction
  const [refineErr, setRefineErr] = useState({}); // slot -> error message

  // Load the selected preset model image and cache it as a dataURL.
  useEffect(() => {
    if (selectedModel === "upload" || presetData[selectedModel]) return;
    let cancelled = false;
    (async () => {
      try {
        const m = MODEL_PRESETS.find((x) => x.key === selectedModel);
        const fileList = m.files && m.files.length ? m.files : [m.file];
        const dataUrls = [];
        for (const fname of fileList) {
          const res = await fetch(`/models/${fname}`);
          const blob = await res.blob();
          dataUrls.push(await downscale(blob, 1024));
        }
        if (!cancelled) setPresetData((prev) => ({ ...prev, [selectedModel]: dataUrls }));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedModel, presetData]);

  const genderPresets = MODEL_PRESETS.filter((m) => m.gender === gender);

  // When gender changes, keep the selection valid: stay on a preset of this
  // gender if possible, otherwise fall back to "Upload your own".
  useEffect(() => {
    if (selectedModel === "upload") return;
    if (!genderPresets.some((m) => m.key === selectedModel)) {
      setSelectedModel(genderPresets[0]?.key || "upload");
    }
  }, [gender]); // eslint-disable-line react-hooks/exhaustive-deps

  const ratioObj = ASPECT_RATIOS.find((a) => a.id === aspect) || ASPECT_RATIOS[0];
  const enabledCount = poses.filter((p) => p.enabled).length;
  const anyDone = Object.values(results).some((r) => r?.status === "done");
  const busy = Object.values(results).some((r) => r?.status === "loading");
  const FRONT = POSE_ORDER[0];

  const modelRefDataUrls =
    selectedModel === "upload"
      ? refs.model.map((r) => r.dataUrl)
      : Array.isArray(presetData[selectedModel])
      ? presetData[selectedModel]
      : presetData[selectedModel]
      ? [presetData[selectedModel]]
      : [];
  const hasModel = modelRefDataUrls.length > 0;
  const hasRequired = refs.garment.length > 0 && hasModel;

  function adder(groupId, cap) {
    return async (fileList) => {
      const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
      const added = [];
      for (const f of files) {
        try {
          added.push({ dataUrl: await downscale(f), name: f.name });
        } catch {
          /* skip */
        }
      }
      setRefs((prev) => ({ ...prev, [groupId]: [...prev[groupId], ...added].slice(0, cap) }));
    };
  }
  function remover(groupId) {
    return (i) => setRefs((prev) => ({ ...prev, [groupId]: prev[groupId].filter((_, idx) => idx !== i) }));
  }

  function togglePose(key) {
    setPoses((prev) => prev.map((p) => (p.key === key ? { ...p, enabled: !p.enabled } : p)));
  }
  function addPoseRef(key) {
    return async (fileList) => {
      const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
      const added = [];
      for (const f of files) {
        try {
          added.push({ dataUrl: await downscale(f), name: f.name });
        } catch {
          /* skip */
        }
      }
      setPoses((prev) =>
        prev.map((p) => (p.key === key ? { ...p, poseRef: [...p.poseRef, ...added].slice(0, 2) } : p))
      );
    };
  }
  function removePoseRef(key, i) {
    setPoses((prev) =>
      prev.map((p) => (p.key === key ? { ...p, poseRef: p.poseRef.filter((_, idx) => idx !== i) } : p))
    );
  }

  async function generateSlot(slotObj, anchorImg) {
    if (!hasRequired) return null;
    const slot = slotObj.key;
    const poseRefs = slotObj.poseRef || [];
    const set = POSE_SETS[garmentType][slot];

    // Three modes:
    //  • pose    — a pose photo leads; anchor dropped (pose must dominate).
    //  • reframe — the Full Front anchor LEADS as the base image; the other four
    //              shots become reframings of that one person (identity lock).
    //  • base    — the Full Front itself (no anchor yet): build from references.
    let images;
    let mode;
    if (poseRefs.length) {
      mode = "pose";
      images = [
        ...poseRefs.slice(0, 1).map((r) => r.dataUrl), // POSE REFERENCE — first
        ...refs.garment.slice(0, SEND_POSE.product).map((r) => r.dataUrl),
        ...refs.secondary.slice(0, SEND_POSE.secondary).map((r) => r.dataUrl),
        ...modelRefDataUrls.slice(0, SEND_POSE.model),
        ...refs.shoes.slice(0, SEND_POSE.shoes).map((r) => r.dataUrl),
        ...refs.composition.slice(0, SEND_POSE.composition).map((r) => r.dataUrl),
      ];
    } else if (anchorImg) {
      mode = "reframe";
      images = [
        anchorImg, // ANCHOR FIRST — the definitive person + outfit, the base to keep
        ...refs.garment.slice(0, SEND_REFRAME.product).map((r) => r.dataUrl),
        ...modelRefDataUrls.slice(0, SEND_REFRAME.model),
      ];
    } else {
      mode = "base";
      images = [
        ...refs.garment.slice(0, SEND.product).map((r) => r.dataUrl),
        ...refs.secondary.slice(0, SEND.secondary).map((r) => r.dataUrl),
        ...modelRefDataUrls.slice(0, SEND.model),
        ...refs.shoes.slice(0, SEND.shoes).map((r) => r.dataUrl),
        ...refs.composition.slice(0, SEND.composition).map((r) => r.dataUrl),
      ];
    }

    const picked = pickPose(garmentType, slot);
    const posePrompt = mode === "pose" ? set.crop : picked.prompt;
    const poseLabel = mode === "pose" ? "from your pose photo" : picked.variation;

    setResults((prev) => {
      const old = prev[slot];
      if (old?.url) URL.revokeObjectURL(old.url);
      return { ...prev, [slot]: { status: "loading" } };
    });

    try {
      const size = sizeFor(model, ratioObj);
      const faceDesc = MODEL_PRESETS.find((m) => m.key === selectedModel)?.face || "";
      const prompt =
        mode === "reframe"
          ? buildReframePrompt({ posePrompt: picked.prompt, gender, faceDesc, productDesc, notes })
          : buildPrompt({
              posePrompt,
              focus: FOCUS[garmentType],
              gender,
              faceDesc,
              productDesc,
              secondaryDesc,
              hasSecondary: refs.secondary.length > 0,
              hasShoes: refs.shoes.length > 0,
              hasComposition: refs.composition.length > 0,
              hasPoseRef: mode === "pose",
              hasAnchor: false,
              notes,
            });
      const sendImages = await fitPayload(images);
      const res = await fetch("/api/generate-classic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: sendImages, prompt, model, quality, size, background }),
      });
      if (!res.ok) {
        let msg = "";
        try {
          const j = await res.json();
          msg = j.error || "";
        } catch {
          /* non-JSON body */
        }
        if (!msg) {
          if (res.status === 413) msg = "Too much image data for one request. Use fewer or smaller reference photos.";
          else if (res.status === 504 || res.status === 502)
            msg = "The image took too long (over 60s). Try Medium quality or fewer reference photos.";
          else msg = `Generation failed (HTTP ${res.status}).`;
        }
        setResults((prev) => ({ ...prev, [slot]: { status: "error", error: msg } }));
        return null;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setResults((prev) => ({ ...prev, [slot]: { status: "done", url, blob, pose: poseLabel } }));
      if (slot === FRONT) {
        const anchorData = await downscale(blob, 1100);
        setAnchor(anchorData);
        return anchorData;
      }
      return null;
    } catch (err) {
      setResults((prev) => ({ ...prev, [slot]: { status: "error", error: err?.message || "Network error." } }));
      return null;
    }
  }

  // Refine an existing result with a manual instruction. Feeds the current image
  // back in as the FIRST reference so the model keeps everything and only applies
  // the typed change. Keeps the existing image if the refine fails.
  async function refineSlot(slotObj, instruction) {
    const slot = slotObj.key;
    const current = results[slot];
    const text = (instruction || "").trim();
    if (!current?.blob || !text) return;

    setRefineErr((prev) => ({ ...prev, [slot]: null }));

    let baseDataUrl;
    try {
      baseDataUrl = await downscale(current.blob, 1536);
    } catch {
      setRefineErr((prev) => ({ ...prev, [slot]: "Could not read the current image." }));
      return;
    }

    const images = [
      baseDataUrl, // current result — the image to edit (first)
      ...refs.garment.slice(0, 3).map((r) => r.dataUrl),
      ...modelRefDataUrls.slice(0, 2),
    ];

    const oldUrl = current.url;
    // Keep blob/url during loading so the refine box stays and the image returns on error.
    setResults((prev) => ({ ...prev, [slot]: { ...prev[slot], status: "loading" } }));

    try {
      const size = sizeFor(model, ratioObj);
      const prompt = buildRefinePrompt(text);
      const sendImages = await fitPayload(images);
      const res = await fetch("/api/generate-classic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: sendImages, prompt, model, quality, size, background }),
      });
      if (!res.ok) {
        let msg = "";
        try {
          const j = await res.json();
          msg = j.error || "";
        } catch {
          /* non-JSON body */
        }
        if (!msg) {
          if (res.status === 413) msg = "Too much image data for one request. Use fewer or smaller reference photos.";
          else if (res.status === 504 || res.status === 502)
            msg = "The refine took too long (over 60s). Try Medium quality.";
          else msg = `Refine failed (HTTP ${res.status}).`;
        }
        setResults((prev) => ({ ...prev, [slot]: { ...prev[slot], status: "done" } })); // restore image
        setRefineErr((prev) => ({ ...prev, [slot]: msg }));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      setResults((prev) => ({
        ...prev,
        [slot]: { status: "done", url, blob, pose: prev[slot]?.pose, refined: true },
      }));
      setRefineText((prev) => ({ ...prev, [slot]: "" }));
    } catch (err) {
      setResults((prev) => ({ ...prev, [slot]: { ...prev[slot], status: "done" } })); // restore image
      setRefineErr((prev) => ({ ...prev, [slot]: err?.message || "Network error." }));
    }
  }

  async function generateAll() {
    if (!hasRequired || busy) return;
    const frontObj = poses.find((p) => p.key === FRONT);
    const others = poses.filter((p) => p.enabled && p.key !== FRONT);
    let anchorImg = anchor;
    if (frontObj?.enabled) {
      anchorImg = (await generateSlot(frontObj, null)) || anchor;
    }
    await Promise.all(others.map((p) => generateSlot(p, anchorImg)));
  }

  function download(p) {
    const r = results[p.key];
    if (!r || r.status !== "done") return;
    const a = document.createElement("a");
    a.href = r.url;
    a.download = `pose_${p.key}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  function downloadAll() {
    poses.filter((p) => results[p.key]?.status === "done").forEach((p, i) => setTimeout(() => download(p), i * 350));
  }

  const canGenerate = hasRequired && enabledCount > 0 && !busy;
  const previewStyle = { aspectRatio: `${ratioObj.w} / ${ratioObj.h}` };

  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <div className="wordmark">
            Five <em>Poses</em>
          </div>
          <div className="tagline">Pick a model, add your product — five consistent poses on white.</div>
        </div>
        <div className="masthead-meta">
          <a
            href="/"
            style={{
              display: "inline-block",
              marginBottom: 10,
              padding: "7px 12px",
              borderRadius: 8,
              background: "#f04c28",
              color: "#ffffff",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.6px",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            NEVES ONE v2 →
          </a>
          <br />
          Engine
          <br />
          <b>{model}</b>
        </div>
      </header>

      <div className="layout">
        <aside className="panel controls">
          <div>
            <p className="eyebrow">1 · The product</p>
            <div className="garment-type">
              <span className="garment-type-label">Garment type — sets the shots &amp; crops</span>
              <div className="seg">
                {GARMENT_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`seg-btn${garmentType === t.id ? " on" : ""}`}
                    onClick={() => setGarmentType(t.id)}
                    title={t.label}
                  >
                    {t.id === "upper" ? "Upper body" : t.id === "lower" ? "Lower body" : "Dress / full"}
                  </button>
                ))}
              </div>
              <span className="garment-type-hint">
                {garmentType === "upper"
                  ? "Shirts, tees, jackets, blazers — torso-focused framing."
                  : garmentType === "lower"
                  ? "Pants, jeans, trousers, skirts — full-body + waist-down framing."
                  : "Dresses & full outfits — full-length framing throughout."}
              </span>
            </div>
            <RefZone group={G.garment} files={refs.garment} onAdd={adder("garment", G.garment.cap)} onRemove={remover("garment")} />
            <textarea
              className="notes product-desc"
              placeholder="Which item is THE product? e.g. “the white polo shirt — the chinos are just styling”. The priority item is reproduced exactly; anything else stays secondary."
              value={productDesc}
              onChange={(e) => setProductDesc(e.target.value)}
            />
            <div className="sub-divider" />
            <RefZone group={G.secondary} files={refs.secondary} onAdd={adder("secondary", G.secondary.cap)} onRemove={remover("secondary")} />
            <textarea
              className="notes product-desc"
              placeholder="Describe the secondary item, e.g. “straight-leg jeans / pants” — worn together with the main product."
              value={secondaryDesc}
              onChange={(e) => setSecondaryDesc(e.target.value)}
            />
          </div>

          <div>
            <p className="eyebrow">2 · Model</p>
            <div className="gender-toggle">
              <button
                type="button"
                className={`seg-btn${gender === "women" ? " on" : ""}`}
                onClick={() => setGender("women")}
              >
                Women
              </button>
              <button
                type="button"
                className={`seg-btn${gender === "men" ? " on" : ""}`}
                onClick={() => setGender("men")}
              >
                Men
              </button>
            </div>
            <ModelPicker
              presets={genderPresets}
              selected={selectedModel}
              onSelect={setSelectedModel}
              uploadFiles={refs.model}
              onAddUpload={adder("model", 10)}
              onRemoveUpload={remover("model")}
            />
          </div>

          <div>
            <p className="eyebrow">3 · Shoes (optional)</p>
            <RefZone group={G.shoes} files={refs.shoes} onAdd={adder("shoes", G.shoes.cap)} onRemove={remover("shoes")} />
            {!hasRequired && (
              <p className="req-hint">Add at least one Product image and choose a Model to generate.</p>
            )}
          </div>

          <div>
            <p className="eyebrow">4 · Styling notes (optional)</p>
            <textarea
              className="notes"
              placeholder="e.g. tuck the shirt in, sleeves rolled, gold hoop earrings, hair down — kept consistent across all five"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div>
            <p className="eyebrow">5 · Settings</p>
            <div className="settings-grid">
              <div className="full">
                <label className="field-label">Engine</label>
                <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Aspect ratio</label>
                <select className="select" value={aspect} onChange={(e) => setAspect(e.target.value)}>
                  {ASPECT_RATIOS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Quality</label>
                <select className="select" value={quality} onChange={(e) => setQuality(e.target.value)}>
                  {QUALITIES.map((q) => (
                    <option key={q} value={q}>
                      {q[0].toUpperCase() + q.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Background</label>
                <select className="select" value={background} onChange={(e) => setBackground(e.target.value)}>
                  {BACKGROUNDS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <p className="eyebrow">6 · Reference look (optional)</p>
            <RefZone group={G.composition} files={refs.composition} onAdd={adder("composition", G.composition.cap)} onRemove={remover("composition")} />
          </div>

          <hr className="divider" />

          <button className="generate" disabled={!canGenerate} onClick={generateAll}>
            {busy ? "Generating…" : `Generate ${enabledCount} pose${enabledCount === 1 ? "" : "s"}`}
          </button>
          <button className="ghost-btn" disabled={!anyDone} onClick={downloadAll}>
            Download all
          </button>
        </aside>

        <main>
          <div className="sheet-head">
            <div className="sheet-title">Poses</div>
            <div className="sheet-note">
              {aspect} · white #FFFFFF · Full Front sets the model · others lock to it · untick to skip
            </div>
          </div>

          <div className="sheet">
            {poses.map((p) => {
              const r = results[p.key];
              const status = r?.status || "idle";
              const isFront = p.key === FRONT;
              const label = POSE_SETS[garmentType][p.key].label;
              return (
                <section key={p.key} className={`card${p.enabled ? "" : " off"}`}>
                  <div className="card-top">
                    <div className="card-icon">
                      <PersonIcon />
                    </div>
                    <div className="card-heading">
                      <div className="card-name">{label}</div>
                      <div className="card-hint">
                        {isFront ? "★ sets the model" : anchor ? "locks to the model" : "Pose"} · {aspect}
                      </div>
                    </div>
                    <div className="card-include">
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={() => togglePose(p.key)}
                        title="Include in generation"
                      />
                    </div>
                  </div>

                  <div className="preview" style={previewStyle}>
                    {status === "done" && <img src={r.url} alt={label} />}
                    {status === "loading" && <div className="spinner" />}
                    {status === "error" && <div className="preview-error">{r.error}</div>}
                    {status === "idle" && <div className="preview-empty">Not generated yet</div>}
                  </div>

                  {status === "done" && (r.pose || r.refined) && (
                    <div className="pose-used">
                      {r.pose ? `Pose: ${r.pose}` : "Pose"}
                      {r.refined ? " · refined" : ""}
                    </div>
                  )}

                  <div className="card-actions">
                    <button
                      className="mini-btn"
                      disabled={!hasRequired || status === "loading"}
                      onClick={() => generateSlot(p, isFront ? null : anchor)}
                    >
                      {status === "done" || status === "error"
                        ? "Regenerate"
                        : status === "loading"
                        ? "Working…"
                        : "Generate"}
                    </button>
                    <button className="mini-btn solid" disabled={status !== "done"} onClick={() => download(p)}>
                      Download
                    </button>
                  </div>

                  {r?.blob && (
                    <div className="refine">
                      <div className="refine-head">Not happy? Tweak it</div>
                      <textarea
                        className="refine-input"
                        rows={2}
                        placeholder="Describe what to change — e.g. “turn the head slightly left”, “brighten the lighting”, “fix the collar”, “less smiling”."
                        value={refineText[p.key] || ""}
                        disabled={status === "loading"}
                        onChange={(e) => setRefineText((prev) => ({ ...prev, [p.key]: e.target.value }))}
                      />
                      <button
                        className="mini-btn solid refine-btn"
                        disabled={status === "loading" || !(refineText[p.key] || "").trim()}
                        onClick={() => refineSlot(p, refineText[p.key] || "")}
                      >
                        {status === "loading" ? "Refining…" : "Refine this image"}
                      </button>
                      {refineErr[p.key] && <div className="refine-err">{refineErr[p.key]}</div>}
                    </div>
                  )}

                  <div className="pose-ref">
                    <div className="pose-ref-head">
                      <span>Pose photo (optional)</span>
                      <label className="pose-ref-btn">
                        + Add
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          hidden
                          onChange={(e) => {
                            addPoseRef(p.key)(e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    {p.poseRef.length > 0 && (
                      <div className="thumbs small">
                        {p.poseRef.map((r2, i) => (
                          <div className="thumb" key={i}>
                            <img src={r2.dataUrl} alt={r2.name} />
                            <button className="thumb-x" onClick={() => removePoseRef(p.key, i)} title="Remove">
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          <p className="footnote">
            <b>How it works:</b> pick one of the four built-in models (or upload your own) and it's reused on
            every run. Each card is a fixed framing with a fresh random pose, and the optional product box
            tells the engine which item is the hero. The <b>Full Front</b> generates first and sets the model;
            the other four lock to that exact face, skin, hair and features. Regenerate the Full Front to
            re-roll, then the rest to match. Identity holds far better this way, though the odd frame may
            still need a Regenerate — perfect lock needs a trained model.
          </p>
        </main>
      </div>
    </div>
  );
}
