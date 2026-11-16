"use client";
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import type { Settings, Vehicle } from "../../lib/types";
import { generateQrMatrix } from "../../lib/qr";
import { availability, Modal, money, optimizedImageUrl } from "../components";
import type { Stored } from "./types";

export function StoryFlyerModal({
  vehicle,
  settings,
  onClose
}: {
  vehicle: Stored<Vehicle>;
  settings: Stored<Settings>;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [badgeText, setBadgeText] = useState(vehicle.featured ? "SELECCIÓN DREAM CARS" : "EN EL GARAGE");
  const [showPrice, setShowPrice] = useState(true);
  const [showQr, setShowQr] = useState(true);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const draw = async () => {
      setRendering(true);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const W = 1080;
      const H = 1920;
      canvas.width = W;
      canvas.height = H;

      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#101010");
      grad.addColorStop(0.55, "#161616");
      grad.addColorStop(1, "#0c0c0c");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = "#2d2d2d";
      ctx.lineWidth = 2;
      ctx.strokeRect(48, 48, W - 96, H - 96);

      ctx.fillStyle = "#f0eee8";
      ctx.font = "700 32px 'Barlow Condensed', Arial, sans-serif";
      ctx.fillText("DREAM CARS_PY · SINCE 2012", 88, 122);

      ctx.fillStyle = "#9e9e9e";
      ctx.font = "600 18px 'Manrope', Arial, sans-serif";
      ctx.fillText("LUQUE · PARAGUAY · PRESERVAMOS LEYENDAS", 88, 156);

      const pillLabel = (badgeText || "COLECCIÓN").toUpperCase();
      ctx.font = "700 18px 'Manrope', Arial, sans-serif";
      const pillW = Math.max(200, ctx.measureText(pillLabel).width + 48);
      ctx.fillStyle = "#f0eee8";
      ctx.fillRect(W - 88 - pillW, 94, pillW, 48);
      ctx.fillStyle = "#111111";
      ctx.fillText(pillLabel, W - 88 - pillW + 24, 124);

      const rawPhotoUrl = vehicle.images[photoIdx]?.url || vehicle.images[0]?.url || "/media/showroom.jpg";
      const photoUrl = optimizedImageUrl(rawPhotoUrl, 1280);
      const img = await new Promise<HTMLImageElement | null>(resolve => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = photoUrl;
      });
      if (cancelled) return;

      const imgX = 88;
      const imgY = 205;
      const imgW = W - 176;
      const imgH = 840;

      ctx.fillStyle = "#1d1d1d";
      ctx.fillRect(imgX, imgY, imgW, imgH);

      if (img) {
        const scale = Math.max(imgW / img.width, imgH / img.height);
        const sw = imgW / scale;
        const sh = imgH / scale;
        const sx = (img.width - sw) / 2;
        const sy = (img.height - sh) / 2;
        ctx.drawImage(img, sx, sy, sw, sh, imgX, imgY, imgW, imgH);
      }

      const availLabel = availability[vehicle.availability].toUpperCase();
      ctx.fillStyle = "rgba(16,16,16,0.88)";
      ctx.fillRect(imgX + 28, imgY + imgH - 74, 340, 48);
      ctx.fillStyle = vehicle.availability === "available" ? "#b4d49b" : "#f0eee8";
      ctx.beginPath();
      ctx.arc(imgX + 52, imgY + imgH - 50, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f4f3ef";
      ctx.font = "700 18px 'Manrope', Arial, sans-serif";
      ctx.fillText(availLabel, imgX + 70, imgY + imgH - 43);

      ctx.fillStyle = "#b8b8b8";
      ctx.font = "700 24px 'Manrope', Arial, sans-serif";
      ctx.fillText(`${vehicle.brand.toUpperCase()}  /  ${(vehicle.body || "COLECCIÓN").toUpperCase()}`, 88, 1125);

      ctx.fillStyle = "#f4f3ef";
      ctx.font = "700 92px 'Barlow Condensed', Impact, sans-serif";
      ctx.fillText(vehicle.model.toUpperCase().slice(0, 22), 88, 1220);

      if (vehicle.version) {
        ctx.fillStyle = "#a8a8a8";
        ctx.font = "500 30px 'Manrope', Arial, sans-serif";
        ctx.fillText(vehicle.version.slice(0, 42), 88, 1270);
      }

      ctx.strokeStyle = "#323232";
      ctx.beginPath();
      ctx.moveTo(88, 1315);
      ctx.lineTo(W - 88, 1315);
      ctx.stroke();

      const specs: [string, string][] = [
        ["AÑO", String(vehicle.year || "A CONFIRMAR")],
        ["KILOMETRAJE", vehicle.mileage !== null ? `${vehicle.mileage.toLocaleString("es-PY")} KM` : "A CONFIRMAR"],
        ["MOTOR", (vehicle.engine && vehicle.engine !== "A confirmar" ? vehicle.engine : "ESPECIAL").toUpperCase().slice(0, 18)],
        ["TRANSMISIÓN", (vehicle.transmission && vehicle.transmission !== "A confirmar" ? vehicle.transmission : "A CONFIRMAR").toUpperCase().slice(0, 18)],
        ["TRACCIÓN", (vehicle.drive && vehicle.drive !== "A confirmar" ? vehicle.drive : "DEPORTIVA").toUpperCase().slice(0, 18)],
        ["COLOR", (vehicle.color || "ORIGINAL").toUpperCase().slice(0, 18)]
      ];

      const colW = (W - 176) / 3;
      specs.forEach(([label, val], idx) => {
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        const x = 88 + col * colW;
        const y = 1372 + row * 125;
        ctx.fillStyle = "#8a8a8a";
        ctx.font = "700 18px 'Manrope', Arial, sans-serif";
        ctx.fillText(label, x, y);
        ctx.fillStyle = "#f0eee8";
        ctx.font = "700 28px 'Manrope', Arial, sans-serif";
        ctx.fillText(val, x, y + 40);
      });

      ctx.strokeStyle = "#323232";
      ctx.beginPath();
      ctx.moveTo(88, 1615);
      ctx.lineTo(W - 88, 1615);
      ctx.stroke();

      const priceLabel =
        showPrice && vehicle.price !== null ? money(vehicle.price, vehicle.currency) : "CONSULTAR UNIDAD";

      ctx.fillStyle = "#8a8a8a";
      ctx.font = "700 19px 'Manrope', Arial, sans-serif";
      ctx.fillText(showPrice && vehicle.price !== null ? "PRECIO DE LISTA" : "ATENCIÓN PERSONALIZADA", 88, 1675);

      ctx.fillStyle = "#f4f3ef";
      ctx.font = "700 66px 'Barlow Condensed', Impact, sans-serif";
      ctx.fillText(priceLabel.toUpperCase(), 88, 1745);

      if (showQr) {
        const shareUrl =
          typeof window !== "undefined"
            ? `${window.location.origin}/vehiculos/${vehicle.id}`
            : `https://dreamcars-py.onrender.com/vehiculos/${vehicle.id}`;
        const matrix = generateQrMatrix(shareUrl);
        const qrSize = 128;
        const qrX = W - 88 - qrSize;
        const qrY = 1632;
        const quiet = 2;
        const modules = matrix.length + quiet * 2;
        const cell = qrSize / modules;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(qrX, qrY, qrSize, qrSize);
        ctx.fillStyle = "#111111";
        matrix.forEach((row, r) => {
          row.forEach((dark, c) => {
            if (dark) {
              ctx.fillRect(qrX + (c + quiet) * cell, qrY + (r + quiet) * cell, Math.ceil(cell), Math.ceil(cell));
            }
          });
        });
      }

      ctx.fillStyle = "#1f1f1f";
      ctx.fillRect(88, 1785, W - 176, 66);
      ctx.fillStyle = "#d8d8d8";
      ctx.font = "600 21px 'Manrope', Arial, sans-serif";
      ctx.fillText(`📍 ${settings.address}, ${settings.city}`, 114, 1826);
      ctx.fillStyle = "#f0eee8";
      ctx.font = "700 21px 'Manrope', Arial, sans-serif";
      ctx.fillText(`@${settings.instagram.split("/").filter(Boolean).pop() || "dreamcars_py"}`, W - 310, 1826);

      setRendering(false);
    };
    draw();
    return () => {
      cancelled = true;
    };
  }, [vehicle, settings, badgeText, showPrice, showQr, photoIdx]);

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dreamcars-story-${vehicle.id}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  return (
    <Modal title={`Flyer Instagram Story · ${vehicle.brand} ${vehicle.model}`} wide onClose={onClose}>
      <div className="flyer-generator-grid">
        <div className="flyer-preview-col">
          <canvas ref={canvasRef} className="flyer-canvas" />
        </div>
        <div className="flyer-controls-col">
          <p className="modal-description">
            Generá una placa vertical 1080×1920 px lista para publicar en las Historias de Instagram o Estado de WhatsApp de Dream Cars PY.
          </p>
          <label>
            Etiqueta superior
            <input
              value={badgeText}
              maxLength={28}
              onChange={e => setBadgeText(e.target.value)}
              placeholder="Ej. RECIÉN LLEGADO / SELECCIÓN JDM"
            />
          </label>
          {vehicle.images.length > 1 && (
            <label>
              Fotografía a utilizar
              <select value={photoIdx} onChange={e => setPhotoIdx(Number(e.target.value))}>
                {vehicle.images.map((_, i) => (
                  <option key={i} value={i}>
                    Foto #{i + 1} {i === 0 ? "(Portada)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="check-label">
            <input type="checkbox" checked={showPrice} onChange={e => setShowPrice(e.target.checked)} />
            <span>Mostrar precio en la imagen (si tiene precio cargado)</span>
          </label>
          <label className="check-label">
            <input type="checkbox" checked={showQr} onChange={e => setShowQr(e.target.checked)} />
            <span>Incluir código QR hacia la ficha web</span>
          </label>
          <button type="button" className="button" disabled={rendering} onClick={downloadPng}>
            <Download size={17} /> {rendering ? "Generando imagen…" : "Descargar Story PNG (1080×1920)"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
