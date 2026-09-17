"use client";

import "./globals.css";

import { useState, useEffect } from "react";
import { normaliseHex, colourPhrase, describeHex, readableInk } from "../lib/colour";
import {
  MODELS,
  MODEL_PRESETS,
  QUALITIES,
  QUALITY_LABELS,
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
  buildRoleLines,
  KIDS_AGE_BANDS,
  KIDS_PRESENTATIONS,
  KIDS_POSE_SETS,
  buildKidsPrompt,
  buildKidsRefinePrompt,
} from "../lib/poses";
import {
  ENGINES,
  ENGINE_GROUPS,
  DEFAULT_ENGINE,
  getEngine,
  isNewGeneration,
  routeFor,
  isOpenAI,
} from "../lib/engines";
import { decodeMeta } from "../lib/meta";

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
  if (getEngine(model).customSize) return `${ratio.w}x${ratio.h}`;
  if (ratio.w === ratio.h) return "1024x1024";
  return ratio.w < ratio.h ? "1024x1536" : "1536x1024";
}

// Reference detail. "standard" is the original 1024px behaviour and stays the
// default. "high" re-derives references from the untouched original file at
// 1536px, so less real product detail is thrown away before it reaches the API.
export const DETAIL_LEVELS = [
  { id: "standard", label: "Standard — 1024px references", dim: 1024 },
  { id: "high", label: "High — 1536px references (more print detail)", dim: 1536 },
];

// Re-derive uploaded references at the requested size, falling back to the
// stored 1024px version whenever the original file is no longer around.
async function refUrls(list, cap, maxDim) {
  const picked = list.slice(0, cap);
  if (maxDim <= 1024) return picked.map((r) => r.dataUrl);
  const out = [];
  for (const r of picked) {
    if (r.file) {
      try {
        out.push(await downscale(r.file, maxDim));
        continue;
      } catch {
        /* fall through */
      }
    }
    out.push(r.dataUrl);
  }
  return out;
}

// Baked-in model photos at an arbitrary size, cached across renders.
const presetCache = new Map();
async function presetUrls(presetKey, maxDim) {
  const cacheKey = `${presetKey}@${maxDim}`;
  if (presetCache.has(cacheKey)) return presetCache.get(cacheKey);
  const m = MODEL_PRESETS.find((x) => x.key === presetKey);
  if (!m) return [];
  const files = m.files && m.files.length ? m.files : [m.file];
  const out = [];
  for (const fname of files) {
    try {
      const res = await fetch(`/models/${fname}`);
      out.push(await downscale(await res.blob(), maxDim));
    } catch {
      /* skip */
    }
  }
  presetCache.set(cacheKey, out);
  return out;
}

const SEND = { product: 5, logo: 2, secondary: 3, model: 4, modelWithAnchor: 2, shoes: 2, composition: 1 };
// Lighter caps for the pose path (it also carries the pose photo), so the
// request stays well under Vercel's 4.5 MB body limit.
const SEND_POSE = { product: 4, logo: 1, secondary: 2, model: 3, shoes: 1, composition: 0 };
// Reframe path: the anchor (the finished Full Front) leads and carries the whole
// look, so we only add a few product refs + the face to reinforce fidelity.
const SEND_REFRAME = { product: 3, logo: 2, model: 3 };
// The emblem is a macro detail, so it is always sent at a higher resolution than
// the other references regardless of the Detail setting. Sending a 1024px logo
// crop is the main reason marks come back as soft approximations. The close-up
// shot is where a mangled emblem is most visible, so it gets an extra crop.
const LOGO_MIN_DIM = 1536;
const LOGO_CLOSEUP_BONUS = 1;

function PersonIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="13" r="6" fill="none" stroke="var(--muted)" strokeWidth="1.6" />
      <path d="M9 33c0-7 5-11 11-11s11 4 11 11" fill="none" stroke="var(--brand)" strokeWidth="1.6" />
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
  const [refs, setRefs] = useState({ garment: [], logo: [], secondary: [], model: [], shoes: [], composition: [] });
  const [productDesc, setProductDesc] = useState("");
  const [secondaryDesc, setSecondaryDesc] = useState("");
  const [notes, setNotes] = useState("");
  const [productHex, setProductHex] = useState("");
  const [logoNote, setLogoNote] = useState("");
  const [model, setModel] = useState(DEFAULT_ENGINE);
  const [aspect, setAspect] = useState("3:4");
  const [quality, setQuality] = useState("high");
  const [background, setBackground] = useState("opaque");
  // --- added by the GPT Image 2.5 layer. All default to current behaviour. ---
  const [strict, setStrict] = useState(false);
  // An unreadable or empty hex means no override at all, so a half-typed value
  // can never silently recolour a run.
  const cleanHex = normaliseHex(productHex);
  const colour = cleanHex ? colourPhrase(cleanHex) : null;
  const [detail, setDetail] = useState("standard");
  const [outputFormat, setOutputFormat] = useState("png");
  const [openDiag, setOpenDiag] = useState({}); // slot -> bool

  const [selectedModel, setSelectedModel] = useState(MODEL_PRESETS[0].key);
  const [presetData, setPresetData] = useState({}); // key -> dataURL cache
  const [gender, setGender] = useState("women");
  // Kidswear runs garment-only: ghost mannequin, flat lay or hanging. No person
  // is generated, so there is no model picker in this category.
  const [category, setCategory] = useState("adult"); // "adult" | "kids"
  const [ageBand, setAgeBand] = useState("6-7");
  const [presentation, setPresentation] = useState("ghost");
  const isKids = category === "kids";

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

  const engine = getEngine(model);
  const detailDim = (DETAIL_LEVELS.find((d) => d.id === detail) || DETAIL_LEVELS[0]).dim;

  // Switching engine must never leave an unsupported setting selected.
  useEffect(() => {
    if (!isOpenAI(model)) return; // other providers ignore these settings entirely
    if (!engine.qualities.includes(quality)) setQuality(engine.defaultQuality);
    if (background === "transparent" && !engine.transparent) setBackground("opaque");
  }, [model]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const hasRequired = isKids ? refs.garment.length > 0 : refs.garment.length > 0 && hasModel;

  function adder(groupId, cap) {
    return async (fileList) => {
      const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
      const added = [];
      for (const f of files) {
        try {
          added.push({ dataUrl: await downscale(f), name: f.name, file: f });
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
          added.push({ dataUrl: await downscale(f), name: f.name, file: f });
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

  // ---- request plumbing shared by generate + refine ----
  // One route, one request shape, whichever engine is selected.
  function requestBody(sendImages, prompt, size) {
    return {
      images: sendImages,
      prompt,
      model,
      quality,
      size,
      background,
      outputFormat,
      action: sendImages.length ? "edit" : "generate",
    };
  }

  async function readError(res, what = "Generation") {
    let msg = "";
    try {
      const j = await res.json();
      msg = j.error || "";
    } catch {
      /* non-JSON body */
    }
    if (!msg) {
      if (res.status === 413) msg = "Too much image data for one request. Use fewer or smaller reference photos, or drop reference detail to Standard.";
      else if (res.status === 504 || res.status === 502)
        msg = `The request timed out. ${engine.id.includes("2.5") ? "Sunburst at Maximum can take up to two minutes — try Extra high, or Flare." : "Try Medium quality or fewer reference photos."}`;
      else msg = `${what} failed (HTTP ${res.status}).`;
    }
    return msg;
  }

  async function generateSlot(slotObj, anchorImg) {
    if (!hasRequired) return null;
    const slot = slotObj.key;
    const poseRefs = slotObj.poseRef || [];
    const set = isKids ? KIDS_POSE_SETS[presentation][slot] : POSE_SETS[garmentType][slot];

    // Three modes:
    //  • pose    — a pose photo leads; anchor dropped (pose must dominate).
    //  • reframe — the Full Front anchor LEADS as the base image; the other four
    //              shots become reframings of that one person (identity lock).
    //  • base    — the Full Front itself (no anchor yet): build from references.
    // Reference sets are built in a fixed order, and the SAME order is turned
    // into numbered role labels for the prompt, so the engine is never left to
    // guess which image controls the garment, the face, the pose or the mood.
    const faces = async (cap) =>
      selectedModel === "upload"
        ? await refUrls(refs.model, cap, detailDim)
        : (await presetUrls(selectedModel, detailDim)).slice(0, cap);

    // Macro crops always at LOGO_MIN_DIM or better, plus an extra crop on the
    // close-up, which is the shot where a mangled emblem actually shows.
    const logoCap = (base) => base + (slot === "closeUp" ? LOGO_CLOSEUP_BONUS : 0);
    const logoUrls = (cap) =>
      refUrls(refs.logo, logoCap(cap), Math.max(detailDim, LOGO_MIN_DIM));

    let images;
    let mode;
    let roleOrder;
    if (isKids) {
      // Garment-only. No model, no pose reference, no identity anchor.
      mode = "kids";
      const garment = await refUrls(refs.garment, SEND.product, detailDim);
      const logo = await logoUrls(SEND.logo);
      const secondary = await refUrls(refs.secondary, SEND.secondary, detailDim);
      const shoes = await refUrls(refs.shoes, SEND.shoes, detailDim);
      const comp = await refUrls(refs.composition, SEND.composition, detailDim);
      images = [...garment, ...logo, ...secondary, ...shoes, ...comp];
      roleOrder = [
        { group: "garment", count: garment.length },
        { group: "logo", count: logo.length },
        { group: "secondary", count: secondary.length },
        { group: "shoes", count: shoes.length },
        { group: "composition", count: comp.length },
      ];
    } else if (poseRefs.length) {
      mode = "pose";
      const pose = await refUrls(poseRefs, 1, detailDim);
      const garment = await refUrls(refs.garment, SEND_POSE.product, detailDim);
      const logo = await logoUrls(SEND_POSE.logo);
      const secondary = await refUrls(refs.secondary, SEND_POSE.secondary, detailDim);
      const model_ = await faces(SEND_POSE.model);
      const shoes = await refUrls(refs.shoes, SEND_POSE.shoes, detailDim);
      const comp = await refUrls(refs.composition, SEND_POSE.composition, detailDim);
      images = [...pose, ...garment, ...logo, ...secondary, ...model_, ...shoes, ...comp];
      roleOrder = [
        { group: "poseRef", count: pose.length },
        { group: "garment", count: garment.length },
        { group: "logo", count: logo.length },
        { group: "secondary", count: secondary.length },
        { group: "model", count: model_.length },
        { group: "shoes", count: shoes.length },
        { group: "composition", count: comp.length },
      ];
    } else if (anchorImg) {
      mode = "reframe";
      const garment = await refUrls(refs.garment, SEND_REFRAME.product, detailDim);
      const logo = await logoUrls(SEND_REFRAME.logo);
      const model_ = await faces(SEND_REFRAME.model);
      images = [anchorImg, ...garment, ...logo, ...model_];
      roleOrder = [
        { group: "anchor", count: 1 },
        { group: "garment", count: garment.length },
        { group: "logo", count: logo.length },
        { group: "model", count: model_.length },
      ];
    } else {
      mode = "base";
      const garment = await refUrls(refs.garment, SEND.product, detailDim);
      const logo = await logoUrls(SEND.logo);
      const secondary = await refUrls(refs.secondary, SEND.secondary, detailDim);
      const model_ = await faces(SEND.model);
      const shoes = await refUrls(refs.shoes, SEND.shoes, detailDim);
      const comp = await refUrls(refs.composition, SEND.composition, detailDim);
      images = [...garment, ...logo, ...secondary, ...model_, ...shoes, ...comp];
      roleOrder = [
        { group: "garment", count: garment.length },
        { group: "logo", count: logo.length },
        { group: "secondary", count: secondary.length },
        { group: "model", count: model_.length },
        { group: "shoes", count: shoes.length },
        { group: "composition", count: comp.length },
      ];
    }
    const roleLines = buildRoleLines(roleOrder);

    const picked = isKids ? null : pickPose(garmentType, slot);
    const posePrompt = isKids ? set.framing : mode === "pose" ? set.crop : picked.prompt;
    const poseLabel = isKids
      ? KIDS_PRESENTATIONS.find((x) => x.id === presentation)?.label.split(" — ")[0]
      : mode === "pose"
      ? "from your pose photo"
      : picked.variation;

    setResults((prev) => {
      const old = prev[slot];
      if (old?.url) URL.revokeObjectURL(old.url);
      return { ...prev, [slot]: { status: "loading" } };
    });

    try {
      const size = sizeFor(model, ratioObj);
      const faceDesc = MODEL_PRESETS.find((m) => m.key === selectedModel)?.face || "";
      const prompt = isKids
        ? buildKidsPrompt({
            presentation,
            slotFraming: set.framing,
            ageBand,
            productDesc,
            secondaryDesc,
            hasSecondary: refs.secondary.length > 0,
            hasShoes: refs.shoes.length > 0,
            notes,
            strict,
            roleLines,
            colour,
            hasLogo: refs.logo.length > 0,
            logoNote,
          })
        : mode === "reframe"
          ? buildReframePrompt({ posePrompt: picked.prompt, gender, faceDesc, productDesc, notes, strict, roleLines, colour, hasLogo: refs.logo.length > 0, logoNote })
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
              hasLogo: refs.logo.length > 0,
              logoNote,
              strict,
              roleLines,
              colour,
            });
      const sendImages = await fitPayload(images);
      const res = await fetch(routeFor(model), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody(sendImages, prompt, size)),
      });
      if (!res.ok) {
        const msg = await readError(res);
        setResults((prev) => ({ ...prev, [slot]: { status: "error", error: msg } }));
        return null;
      }
      const meta = decodeMeta(res.headers.get("x-neves-meta"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setResults((prev) => ({ ...prev, [slot]: { status: "done", url, blob, pose: poseLabel, meta } }));
      if (slot === FRONT && !isKids) {
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

    const garmentRefs = await refUrls(refs.garment, 3, detailDim);
    const faceRefs = isKids
      ? []
      : selectedModel === "upload"
      ? await refUrls(refs.model, 2, detailDim)
      : (await presetUrls(selectedModel, detailDim)).slice(0, 2);
    const images = [
      baseDataUrl, // current result — the image to edit (first)
      ...garmentRefs,
      ...faceRefs,
    ];
    const roleLines = buildRoleLines([
      { group: "current", count: 1 },
      { group: "garment", count: garmentRefs.length },
      { group: "model", count: faceRefs.length },
    ]);

    const oldUrl = current.url;
    // Keep blob/url during loading so the refine box stays and the image returns on error.
    setResults((prev) => ({ ...prev, [slot]: { ...prev[slot], status: "loading" } }));

    try {
      const size = sizeFor(model, ratioObj);
      const prompt = isKids
        ? buildKidsRefinePrompt(text, { strict, roleLines, productDesc })
        : buildRefinePrompt(text, { strict, roleLines, productDesc, colour, hasLogo: refs.logo.length > 0, logoNote });
      const sendImages = await fitPayload(images);
      const res = await fetch(routeFor(model), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody(sendImages, prompt, size)),
      });
      if (!res.ok) {
        const msg = await readError(res, "Refine");
        setResults((prev) => ({ ...prev, [slot]: { ...prev[slot], status: "done" } })); // restore image
        setRefineErr((prev) => ({ ...prev, [slot]: msg }));
        return;
      }
      const meta = decodeMeta(res.headers.get("x-neves-meta"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      setResults((prev) => ({
        ...prev,
        [slot]: { status: "done", url, blob, pose: prev[slot]?.pose, refined: true, meta },
      }));
      setRefineText((prev) => ({ ...prev, [slot]: "" }));
    } catch (err) {
      setResults((prev) => ({ ...prev, [slot]: { ...prev[slot], status: "done" } })); // restore image
      setRefineErr((prev) => ({ ...prev, [slot]: err?.message || "Network error." }));
    }
  }

  async function generateAll() {
    if (!hasRequired || busy) return;
    if (isKids) {
      await Promise.all(poses.filter((p) => p.enabled).map((p) => generateSlot(p, null)));
      return;
    }
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
    a.download = `neves_${p.key}.${outputFormat === "jpeg" ? "jpg" : outputFormat}`;
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
        <div className="masthead-brand">
          <img className="brandmark" src="/brand/neves-white.png" alt="NEVES" />
          <div className="wordmark">
            <span className="wordmark-one">ONE</span>
            <span className="wordmark-dot" />
            <span className="wordmark-app">{isKids ? "Kidswear" : "Five Poses"}</span>
          </div>
          <div className="tagline">Pick a model, add your product — five consistent poses on white.</div>
        </div>
        <div className="masthead-meta">
          <span className="meta-label">Engine</span>
          <b>{engine.label.split(" — ")[0]}</b>
          <span className="meta-sub">
            {isOpenAI(model) ? QUALITY_LABELS[quality] || quality : "engine defaults"}
            {strict ? " · strict" : ""}
          </span>
          {isNewGeneration(model) && <span className="pill">2.5</span>}
          <a className="version-btn" href="/classic">
            ← Classic (v1)
          </a>
          <a className="version-link" href="/classic">
            ← Classic v1
          </a>
        </div>
      </header>

      <div className="layout">
        <aside className="panel controls">
          <div>
            <p className="eyebrow">1 · The product</p>
            <div className="garment-type">
              <span className="garment-type-label">Category</span>
              <div className="seg">
                <button
                  type="button"
                  className={`seg-btn${!isKids ? " on" : ""}`}
                  onClick={() => setCategory("adult")}
                >
                  Womens / Mens
                </button>
                <button
                  type="button"
                  className={`seg-btn${isKids ? " on" : ""}`}
                  onClick={() => setCategory("kids")}
                >
                  Kids
                </button>
              </div>
              <span className="garment-type-hint">
                {isKids
                  ? "Kidswear is shot garment-only, the way most children's catalogues are: ghost mannequin, flat lay or on a hanger, cut to true child proportions. No child is generated."
                  : "Adult womenswear and menswear, generated on a model."}
              </span>
            </div>

            {isKids && (
              <div className="garment-type">
                <span className="garment-type-label">Age band — sets the garment scale</span>
                <select className="select" value={ageBand} onChange={(e) => setAgeBand(e.target.value)}>
                  {KIDS_AGE_BANDS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label} · {b.height}
                    </option>
                  ))}
                </select>
                <span className="garment-type-hint">
                  This is what stops a size 4 tee rendering as a shrunken adult tee. Body length, sleeves,
                  neck opening, armholes and trims all scale to this band.
                </span>

                <span className="garment-type-label" style={{ marginTop: 12 }}>
                  Presentation
                </span>
                <select
                  className="select"
                  value={presentation}
                  onChange={(e) => setPresentation(e.target.value)}
                >
                  {KIDS_PRESENTATIONS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
                <span className="garment-type-hint">
                  {KIDS_PRESENTATIONS.find((x) => x.id === presentation)?.hint}
                </span>
              </div>
            )}

            {!isKids && (
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
            )}
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

            <div className="sub-divider" />
            <div className="hex-block">
              <div className="hex-head">
                <span className="hex-title">Garment colour code</span>
                <span className="zone-opt">optional</span>
              </div>
              <div className="hex-row">
                <input
                  type="color"
                  className="hex-swatch"
                  aria-label="Pick the product colour"
                  value={cleanHex || "#000000"}
                  onChange={(e) => setProductHex(e.target.value.toUpperCase())}
                />
                <input
                  type="text"
                  className="hex-input"
                  spellCheck={false}
                  placeholder="#RRGGBB — leave blank to keep original"
                  value={productHex}
                  onChange={(e) => setProductHex(e.target.value)}
                />
                {productHex ? (
                  <button type="button" className="hex-clear" onClick={() => setProductHex("")}>
                    Clear
                  </button>
                ) : null}
              </div>
              {cleanHex ? (
                <div className="hex-preview" style={{ background: cleanHex, color: readableInk(cleanHex) }}>
                  {describeHex(cleanHex)} · {cleanHex}
                </div>
              ) : productHex ? (
                <p className="hex-note hex-warn">
                  That is not a readable hex code yet, so it is being ignored. Use three or six
                  characters, for example #1B2A4A.
                </p>
              ) : null}
              <p className="hex-note">
                Recolours the MAIN fabric of the primary product only — logos, prints, text and trims
                stay as-is. Matched as closely as studio lighting allows, so expect a close match
                rather than a pixel-exact one (a final eyedropper tweak may still help).
              </p>
            </div>

            <div className="sub-divider" />
            <RefZone group={G.logo} files={refs.logo} onAdd={adder("logo", G.logo.cap)} onRemove={remover("logo")} />
            <textarea
              className="notes product-desc"
              placeholder="Logo placement & size (optional) — e.g. “left chest, about 5 cm wide, pony faces right”."
              value={logoNote}
              onChange={(e) => setLogoNote(e.target.value)}
            />
            {refs.logo.length > 0 ? (
              <p className="hex-note">
                The emblem is sent at higher resolution than the other references and is treated as
                the final word on the mark, ahead of the product photos. The close-up shot gets an
                extra crop.
              </p>
            ) : (
              <p className="hex-note">
                Without this, the engine redraws the mark from the product photos and usually softens
                or mirrors it. One sharp square-on macro is the biggest single fix for logo defects.
              </p>
            )}
          </div>

          {!isKids && (
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
          )}

          <div>
            <p className="eyebrow">3 · Shoes (optional)</p>
            <RefZone group={G.shoes} files={refs.shoes} onAdd={adder("shoes", G.shoes.cap)} onRemove={remover("shoes")} />
            {!hasRequired && (
              <p className="req-hint">
                {isKids
                  ? "Add at least one Product image to generate."
                  : "Add at least one Product image and choose a Model to generate."}
              </p>
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
                  {ENGINE_GROUPS.map((g) => (
                    <optgroup key={g} label={g}>
                      {MODELS.filter((m) => ENGINES[m.id].group === g).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <p className="field-note">{engine.blurb}</p>
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
              {isOpenAI(model) && (
              <div>
                <label className="field-label">Render quality</label>
                <select className="select" value={quality} onChange={(e) => setQuality(e.target.value)}>
                  {engine.qualities.map((q) => (
                    <option key={q} value={q}>
                      {QUALITY_LABELS[q] || q}
                    </option>
                  ))}
                </select>
              </div>
              )}
              {isOpenAI(model) && (
              <div>
                <label className="field-label">Background</label>
                <select className="select" value={background} onChange={(e) => setBackground(e.target.value)}>
                  {BACKGROUNDS.map((b) => (
                    <option key={b.id} value={b.id} disabled={b.id === "transparent" && !engine.transparent}>
                      {b.label}
                      {b.id === "transparent" && !engine.transparent ? " — not on this engine" : ""}
                    </option>
                  ))}
                </select>
              </div>
              )}
              {isOpenAI(model) && (
              <div>
                <label className="field-label">Output format</label>
                <select
                  className="select"
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value)}
                >
                  <option value="png">PNG — master file</option>
                  <option value="webp">WebP — smaller delivery</option>
                  <option value="jpeg" disabled={background === "transparent"}>
                    JPEG — smallest{background === "transparent" ? " — no transparency" : ""}
                  </option>
                </select>
              </div>
              )}
              {!isOpenAI(model) && (
                <div className="full">
                  <p className="field-note">
                    This engine sets its own quality, background and file format. Aspect ratio, references
                    and styling notes all still apply.
                  </p>
                </div>
              )}
              <div className="full">
                <label className="field-label">Reference detail</label>
                <select className="select" value={detail} onChange={(e) => setDetail(e.target.value)}>
                  {DETAIL_LEVELS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <p className="field-note">
                  High keeps more of the real print and weave in the references. Very large sets may still be
                  reduced to fit the 4.5 MB request limit.
                </p>
              </div>

              <div className="full toggle-block">
                <label className="switch">
                  <input type="checkbox" checked={strict} onChange={() => setStrict((v) => !v)} />
                  <span>
                    <b>Strict product fidelity</b>
                    <em>
                      Labels every reference by role and adds the full preservation ruleset. Recommended for
                      catalogue work.
                    </em>
                  </span>
                </label>
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
            <div className="sheet-title">{isKids ? "Garment views" : "Poses"}</div>
            <div className="sheet-note">
              {aspect} · {background === "transparent" ? "transparent" : "white #FFFFFF"} ·{" "}
              {engine.label.split(" — ")[0]} ·{" "}
              {isKids
                ? `${KIDS_AGE_BANDS.find((b) => b.id === ageBand)?.label.split(" (")[0]} scale · garment only`
                : "Full Front sets the model · others lock to it"}{" "}
              · untick to skip
            </div>
          </div>

          <div className="sheet">
            {poses.map((p) => {
              const r = results[p.key];
              const status = r?.status || "idle";
              const isFront = p.key === FRONT;
              const label = isKids
                ? KIDS_POSE_SETS[presentation][p.key].label
                : POSE_SETS[garmentType][p.key].label;
              return (
                <section key={p.key} className={`card${p.enabled ? "" : " off"}`}>
                  <div className="card-top">
                    <div className="card-icon">
                      <PersonIcon />
                    </div>
                    <div className="card-heading">
                      <div className="card-name">{label}</div>
                      <div className="card-hint">
                        {isKids
                          ? "garment only"
                          : isFront
                          ? "★ sets the model"
                          : anchor
                          ? "locks to the model"
                          : "Pose"}{" "}
                        · {aspect}
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

                  {status === "done" && r.meta && (
                    <div className="diag">
                      <button
                        type="button"
                        className="diag-toggle"
                        onClick={() => setOpenDiag((prev) => ({ ...prev, [p.key]: !prev[p.key] }))}
                      >
                        {r.meta.imageModelAlias} · {QUALITY_LABELS[r.meta.quality] || r.meta.quality} ·{" "}
                        {(r.meta.latencyMs / 1000).toFixed(1)}s
                        <span className="diag-caret">{openDiag[p.key] ? "\u2212" : "+"}</span>
                      </button>
                      {openDiag[p.key] && (
                        <dl className="diag-body">
                          <div>
                            <dt>Image model</dt>
                            <dd className="mono">{r.meta.imageModel}</dd>
                          </div>
                          <div>
                            <dt>Size / action</dt>
                            <dd>
                              {r.meta.size} · {r.meta.action} · {r.meta.background} · {r.meta.outputFormat}
                            </dd>
                          </div>
                          <div>
                            <dt>References</dt>
                            <dd>
                              {r.meta.referenceCount} sent · {r.meta.attempts} attempt
                              {r.meta.attempts === 1 ? "" : "s"}
                            </dd>
                          </div>
                          {r.meta.requestId && (
                            <div>
                              <dt>Request ID</dt>
                              <dd className="mono">{r.meta.requestId}</dd>
                            </div>
                          )}
                          {r.meta.revisedPrompt && (
                            <div className="diag-wide">
                              <dt>Revised prompt</dt>
                              <dd className="revised">{r.meta.revisedPrompt}</dd>
                            </div>
                          )}
                        </dl>
                      )}
                    </div>
                  )}

                  <div className="card-actions">
                    <button
                      className="mini-btn"
                      disabled={!hasRequired || status === "loading"}
                      onClick={() => generateSlot(p, isKids || isFront ? null : anchor)}
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

          <p className="footnote caution">
            <b>Before it goes to a client:</b> these are generative renders, not composites of your original
            files. GPT Image 2.5 preserves prints, logos and product geometry far better than GPT Image 2, but
            no generative engine reproduces every motif, label or brand mark exactly, and results can vary
            between runs on the same product. Check the print repeat, any text or logo, the colour and the
            hands on every frame before delivery. Where a garment, bottle or label has to be pixel-exact,
            shoot or cut out the real product and composite it.
          </p>
        </main>
      </div>
    </div>
  );
}
