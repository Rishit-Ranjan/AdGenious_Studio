import React, { useRef, useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const uid = () => Math.random().toString(36).slice(2, 10);

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

export default function App() {
  const canvasRef = useRef(null);
  const [canvasSize] = useState({ w: 1200, h: 628 });

  const [elements, setElements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [loadingBg, setLoadingBg] = useState(false);
  const [arrangeSuggestions, setArrangeSuggestions] = useState([]);

  // ---------------------------------------
  //  DRAGGING LOGIC
  // ---------------------------------------
  useEffect(() => {
    const root = canvasRef.current;
    if (!root) return;

    let drag = null;
    let offset = { x: 0, y: 0 };

    function down(e) {
      let node = e.target;
      while (node && node !== root && !node.dataset?.id)
        node = node.parentNode;

      const id = node?.dataset?.id;
      const item = id ? elements.find((x) => x.id === id) : null;
      if (!item) return;

      drag = item;
      setSelected(item.id);

      const rect = node.getBoundingClientRect();
      offset = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      if (node.setPointerCapture) node.setPointerCapture(e.pointerId);
    }

    function move(e) {
      if (!drag) return;

      const r = root.getBoundingClientRect();
      const x = Math.max(
        0,
        Math.min(canvasSize.w - (drag.w || 0), e.clientX - r.left - offset.x)
      );
      const y = Math.max(
        0,
        Math.min(canvasSize.h - (drag.h || 0), e.clientY - r.top - offset.y)
      );

      setElements((prev) =>
        prev.map((el) => (el.id === drag.id ? { ...el, x, y } : el))
      );
    }

    function up() {
      drag = null;
    }

    root.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);

    return () => {
      root.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [elements, canvasSize]);

  // ---------------------------------------
  //  BACKGROUND REMOVAL API
  // ---------------------------------------
  async function removeBgAI(file) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/background/remove`, {
      method: "POST",
      body: form,
    });
    return await res.json();
  }

  // ---------------------------------------
  //  SERVER AI ARRANGE
  // ---------------------------------------
  async function aiArrangeServer() {
    try {
      const res = await fetch(`${API_URL}/ai/arrange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elements, canvas: canvasSize }),
      });

      const data = await res.json();

      if (Array.isArray(data.suggestions)) {
        setArrangeSuggestions(data.suggestions);
        if (data.suggestions[0]?.elements)
          setElements(data.suggestions[0].elements);
      }
    } catch (err) {
      console.error("AI Arrange Error:", err);
    }
  }

  // ---------------------------------------
  //  COMPLIANCE CHECK (text)
  // ---------------------------------------
  async function complianceCheck(text) {
    try {
      const res = await fetch(`${API_URL}/compliance/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      return await res.json();
    } catch (e) {
      return { ok: true, issues: [] };
    }
  }

  async function updateText(id, newText) {
    setElements((prev) =>
      prev.map((e) => (e.id === id ? { ...e, text: newText } : e))
    );

    const r = await complianceCheck(newText);
    if (r?.issues) setFeedback(r.issues.map((i) => ({ msg: i })));
    else setFeedback([]);
  }

  // ---------------------------------------
  //  ADD ELEMENTS
  // ---------------------------------------
  function addText() {
    setElements((prev) => [
      ...prev,
      {
        id: uid(),
        type: "text",
        text: "Your headline",
        x: 60,
        y: 60,
        w: 400,
        h: 80,
        z: prev.length + 1,
        size: 36,
      },
    ]);
  }

  async function handleAddImage(file, type = "image") {
    if (!file) return;

    setLoadingBg(true);

    try {
      const data = await removeBgAI(file);
      const src =
        data && data.url ? data.url : URL.createObjectURL(file);

      setElements((prev) => [
        ...prev,
        {
          id: uid(),
          type,
          src,
          x: 60,
          y: 60,
          w: 320,
          h: 320,
          z: prev.length + 1,
        },
      ]);
    } catch (err) {
      const local = URL.createObjectURL(file);

      setElements((prev) => [
        ...prev,
        {
          id: uid(),
          type,
          src: local,
          x: 60,
          y: 60,
          w: 320,
          h: 320,
          z: prev.length + 1,
        },
      ]);
    } finally {
      setLoadingBg(false);
    }
  }

  // ---------------------------------------
  //  EXPORT CANVAS TO PNG
  // ---------------------------------------
  async function exportAd(w, h, name) {
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);

    const sx = w / canvasSize.w;
    const sy = h / canvasSize.h;

    for (const el of elements) {
      const x = (el.x || 0) * sx;
      const y = (el.y || 0) * sy;
      const ew = (el.w || 0) * sx;
      const eh = (el.h || 0) * sy;

      if (el.type === "image" || el.type === "logo") {
        try {
          const img = await loadImage(el.src);
          ctx.drawImage(img, x, y, ew, eh);
        } catch {}
      } else if (el.type === "text") {
        ctx.fillStyle = el.color || "#111";
        ctx.font = `${(el.size || 28) * sy}px sans-serif`;
        ctx.fillText(el.text || "", x, y + (el.size || 28) * sy);
      }
    }

    off.toBlob((b) => {
      if (!b) return;

      const url = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ---------------------------------------
  //  UI: LAYOUT + EDITOR + PANELS
  // ---------------------------------------
  return (
    <div className="min-h-screen bg-gray-100 p-8" style={{ fontFamily: "Inter, sans-serif" }}>
      <h1 className="text-3xl font-bold mb-8">
        AdGenius Studio — Full Prototype (remove.bg + AI Arrange)
      </h1>

      <div className="grid grid-cols-[260px_1fr_260px] gap-6">

        {/* LEFT SIDEBAR */}
        <aside className="bg-white p-5 rounded-lg shadow-md w-64">
          <h2 className="font-semibold mb-3">Controls</h2>

          {/* Upload Product */}
          <label className="text-xs text-gray-500">Upload product</label>
          <input
            type="file"
            accept="image/*"
            className="mt-2 mb-4"
            onChange={(e) =>
              handleAddImage(e.target.files && e.target.files[0], "image")
            }
          />

          {loadingBg && (
            <p className="text-xs text-blue-600 mb-4">
              Removing background...
            </p>
          )}

          {/* Upload Logo */}
          <label className="text-xs text-gray-500">Upload logo</label>
          <input
            type="file"
            accept="image/*"
            className="mt-2 mb-4"
            onChange={(e) =>
              handleAddImage(e.target.files && e.target.files[0], "logo")
            }
          />

          {/* Buttons */}
          <div className="flex gap-2 mb-3">
            <button className="bg-indigo-600 text-white px-3 py-2 rounded text-sm"
              onClick={addText}>
              Add Text
            </button>

            <button className="border px-3 py-2 rounded text-sm"
              onClick={aiArrangeServer}>
              AI Arrange
            </button>
          </div>

          <button
            onClick={() => alert("Inspiration generated!")}
            className="w-full bg-amber-500 text-white py-2 rounded text-sm"
          >
            Inspire Me
          </button>

          <h3 className="font-semibold mt-6 mb-1">Compliance</h3>
          <ul className="text-xs text-red-600">
            {feedback.length === 0 ? (
              <li className="text-green-600">No issues</li>
            ) : (
              feedback.map((f, i) => <li key={i}>• {f.msg}</li>)
            )}
          </ul>
        </aside>

        {/* MAIN CANVAS AREA */}
        <main className="flex justify-center items-start overflow-auto">
          <div
            ref={canvasRef}
            className="relative bg-white shadow-xl border rounded-lg"
            style={{
              width: canvasSize.w,
              height: canvasSize.h,
            }}
          >
            {elements.map((el) => (
              <div
                key={el.id}
                data-id={el.id}
                className={`absolute ${
                  selected === el.id ? "ring-2 ring-blue-300" : ""
                }`}
                style={{
                  left: el.x,
                  top: el.y,
                  width: el.w,
                  height: el.h,
                  zIndex: el.z,
                }}
              >
                {el.type === "text" && (
                  <textarea
                    className="w-full h-full bg-transparent resize-none outline-none p-1"
                    value={el.text}
                    onChange={(e) =>
                      updateText(el.id, e.target.value)
                    }
                  />
                )}

                {(el.type === "image" || el.type === "logo") && (
                  <img
                    src={el.src}
                    className="w-full h-full object-cover"
                    alt=""
                  />
                )}
              </div>
            ))}
          </div>

          {/* Export Buttons */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
            <button
              onClick={() => exportAd(1200, 628, "export_1200x628")}
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              Export 1200×628
            </button>

            <button
              onClick={() => exportAd(1080, 1080, "export_1080x1080")}
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              Export 1080×1080
            </button>
          </div>
        </main>

        {/* RIGHT SIDEBAR */}
        <aside className="bg-white p-5 rounded-lg shadow-md w-64">
          <h2 className="font-semibold mb-3">AI Arrange Suggestions</h2>

          {arrangeSuggestions.length === 0 && (
            <p className="text-xs text-gray-500">
              Click "AI Arrange" to generate layouts
            </p>
          )}

          {arrangeSuggestions.map((s, idx) => (
            <div key={idx} className="mb-3 border rounded p-2">
              <div className="text-xs text-gray-600 mb-2">
                Suggestion {idx + 1} — {s.type}
              </div>
              <button
                className="w-full border px-2 py-1 text-xs rounded"
                onClick={() => setElements(s.elements)}
              >
                Apply
              </button>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
