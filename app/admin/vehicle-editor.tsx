"use client";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileCheck2, ImagePlus, QrCode, Sparkles, X } from "lucide-react";
import type { Vehicle } from "../../lib/types";
import { availability, Modal, money, optimizedImageUrl } from "../components";
import type { Stored } from "./types";
import { uploadImage } from "./utils";

export function VehicleEditor({
  initial,
  cloudinary,
  onClose,
  onSave,
  onOpenFlyer,
  onOpenQr,
  onOpenContract
}: {
  initial: Stored<Vehicle>;
  cloudinary: boolean;
  onClose: () => void;
  onSave: (v: Stored<Vehicle>) => Promise<void>;
  onOpenFlyer: (v: Stored<Vehicle>) => void;
  onOpenQr: (v: Stored<Vehicle>) => void;
  onOpenContract?: (v: Stored<Vehicle>) => void;
}) {
  const [v, setV] = useState(initial);
  const [featuresText, setFeaturesText] = useState(() => initial.features.join("\n"));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [optimizeWebp, setOptimizeWebp] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [leavePrompt, setLeavePrompt] = useState(false);

  const requestClose = () => {
    if (busy || uploading) return;
    if (dirty) setLeavePrompt(true);
    else onClose();
  };
  const set = (key: keyof Vehicle, value: unknown) => {
    setDirty(true);
    setV(old => ({ ...old, [key]: value }));
  };
  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= v.images.length || from === to) return;
    const next = [...v.images];
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked);
    set("images", next);
  };

  const fields: [keyof Vehicle, string, string?][] = [
    ["brand", "Marca"],
    ["model", "Modelo"],
    ["version", "Versión"],
    ["year", "Año", "number"],
    ["mileage", "Kilometraje", "number"],
    ["price", "Precio (vacío = a consultar)", "number"],
    ["engine", "Motor"],
    ["transmission", "Transmisión"],
    ["fuel", "Combustible"],
    ["drive", "Tracción"],
    ["color", "Color"]
  ];

  return (
    <Modal title={initial.brand ? `Editar ${initial.brand} ${initial.model}` : "Una nueva leyenda."} wide onClose={requestClose}>
      <form
        className="vehicle-editor"
        onChange={() => setDirty(true)}
        onSubmit={async e => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const cleanFeatures = [
              ...new Set(
                featuresText
                  .split("\n")
                  .map(line => line.trim())
                  .filter(Boolean)
              )
            ];
            await onSave({ ...v, features: cleanFeatures });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-two">
          {fields.map(([key, label, type]) => (
            <label key={key}>
              <span>
                {label}
                {key === "price" && v.price !== null ? ` — ${money(v.price, v.currency)}` : ""}
              </span>
              <input
                type={type || "text"}
                required={key === "brand" || key === "model"}
                min={type === "number" ? (key === "year" ? 1900 : 0) : undefined}
                max={key === "year" ? 2100 : undefined}
                value={String(v[key] ?? "")}
                onChange={e =>
                  set(key, type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)
                }
              />
            </label>
          ))}
          <label>
            Moneda
            <select value={v.currency} onChange={e => set("currency", e.target.value)}>
              <option value="USD">Dólares (USD)</option>
              <option value="PYG">Guaraníes (PYG)</option>
            </select>
          </label>
          <label>
            Carrocería
            <select value={v.body} onChange={e => set("body", e.target.value)}>
              {["Sedán", "Coupé", "Roadster", "Hatchback", "SUV", "Pick-up", "Familiar", "Otro"].map(b => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <label>
            Publicación
            <select value={v.status} onChange={e => set("status", e.target.value)}>
              <option value="draft">Borrador</option>
              <option value="published">Publicado</option>
              <option value="archived">Archivado</option>
            </select>
          </label>
          <label>
            Disponibilidad
            <select value={v.availability} onChange={e => set("availability", e.target.value)}>
              {Object.entries(availability).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Enlace de publicación original (Instagram, etc.)
            <input
              type="url"
              value={v.sourceUrl}
              onChange={e => set("sourceUrl", e.target.value)}
              placeholder="https://www.instagram.com/dreamcars_py/p/..."
            />
          </label>
          <label>
            Video / Reel de Instagram, YouTube o MP4 (opcional)
            <input
              type="text"
              value={v.videoUrl || ""}
              onChange={e => set("videoUrl", e.target.value)}
              placeholder="https://www.instagram.com/reel/... o enlace .mp4"
            />
          </label>
        </div>

        <label>
          Descripción
          <textarea rows={5} value={v.description} maxLength={6000} onChange={e => set("description", e.target.value)} />
        </label>
        <label>
          Equipamiento (un detalle por línea)
          <textarea
            rows={3}
            value={featuresText}
            onChange={e => {
              setDirty(true);
              setFeaturesText(e.target.value);
            }}
          />
        </label>
        <label className="check-label">
          <input type="checkbox" checked={v.featured} onChange={e => set("featured", e.target.checked)} />
          Destacar en el catálogo
        </label>

        <div className="editor-gallery">
          <div className="admin-section-head">
            <h3>
              Galería <small>{v.images.length}/20</small>
            </h3>
            <div className="editor-gallery-actions">
              <label className="check-label webp-toggle">
                <input type="checkbox" checked={optimizeWebp} onChange={e => setOptimizeWebp(e.target.checked)} />
                <span>Optimizar a WebP al subir</span>
              </label>
              <label className="button small secondary file-button">
                <ImagePlus size={16} />
                {uploading ? "Subiendo…" : "Subir fotos"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                  multiple
                  disabled={uploading || busy}
                  onChange={async e => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length + v.images.length > 20) {
                      setError("Podés guardar hasta 20 fotos por vehículo.");
                      return;
                    }
                    setUploading(true);
                    setError("");
                    try {
                      for (const f of files) {
                        const image = await uploadImage(f, optimizeWebp, cloudinary);
                        setDirty(true);
                        setV(prev => ({ ...prev, images: [...prev.images, image] }));
                      }
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setUploading(false);
                      e.target.value = "";
                    }
                  }}
                />
              </label>
            </div>
          </div>
          {!cloudinary && (
            <p className="muted">
              Subida directa al almacenamiento activo. Si conectás Cloudinary en Integraciones, las nuevas fotos se alojarán en tu cuenta Cloudinary.
            </p>
          )}
          <div className="editor-images">
            {v.images.map((img, i) => (
              <div
                key={img.url + i}
                draggable={!uploading}
                onDragStart={() => setDragIdx(i)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (dragIdx !== null && dragIdx !== i) moveImage(dragIdx, i);
                  setDragIdx(null);
                }}
              >
                <img src={optimizedImageUrl(img.url, 320)} alt={`Foto ${i + 1}`} decoding="async" />
                <span>{i === 0 ? "PORTADA" : String(i + 1)}</span>
                <div className="editor-image-controls">
                  <button
                    type="button"
                    aria-label={`Mover foto ${i + 1} al inicio`}
                    onClick={() => moveImage(i, 0)}
                    disabled={uploading || i === 0}
                  >
                    Portada
                  </button>
                  <button
                    type="button"
                    aria-label={`Mover foto ${i + 1} a la izquierda`}
                    onClick={() => moveImage(i, i - 1)}
                    disabled={uploading || i === 0}
                  >
                    <ArrowLeft size={12} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Mover foto ${i + 1} a la derecha`}
                    onClick={() => moveImage(i, i + 1)}
                    disabled={uploading || i === v.images.length - 1}
                  >
                    <ArrowRight size={12} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Quitar foto ${i + 1}`}
                    onClick={() => set("images", v.images.filter((_, j) => j !== i))}
                    disabled={uploading}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="muted">
            Arrastrá las fotos o usá las flechas para ordenarlas. La primera imagen es la portada.
          </p>
        </div>

        {error && (
          <div className="feedback error" role="alert">
            {error}
          </div>
        )}
        {leavePrompt && (
          <div className="discard-prompt" role="alert">
            <div>
              <strong>Tenés cambios sin guardar.</strong>
              <p>Guardalos para conservarlos o descartalos para salir.</p>
            </div>
            <button type="button" className="text-button" onClick={() => setLeavePrompt(false)}>
              Seguir editando
            </button>
            <button type="button" className="button small danger-button" onClick={onClose}>
              Descartar cambios
            </button>
          </div>
        )}
        <div className="editor-footer">
          <span className="editor-save-status">{dirty ? "Cambios pendientes" : "Ficha sin cambios"}</span>
          {v.images.length > 0 && v.brand && v.model && (
            <>
              <button type="button" className="button secondary small" onClick={() => onOpenQr(v)}>
                <QrCode size={15} /> Ficha QR
              </button>
              {onOpenContract && (
                <button type="button" className="button secondary small" onClick={() => onOpenContract(v)}>
                  <FileCheck2 size={15} /> Acta / Reserva
                </button>
              )}
              <button type="button" className="button secondary small" onClick={() => onOpenFlyer(v)}>
                <Sparkles size={15} /> Story IG
              </button>
            </>
          )}
          <button type="button" className="button secondary" onClick={requestClose} disabled={busy || uploading}>
            Cancelar
          </button>
          <button className="button" disabled={busy || uploading}>
            {busy ? "Guardando…" : "Guardar vehículo"}
            <Check size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
