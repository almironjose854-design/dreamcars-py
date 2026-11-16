"use client";
import { useState } from "react";
import { BellRing, Check, ImagePlus, RotateCcw } from "lucide-react";
import type { Settings } from "../../lib/types";
import { brandLogo, DEFAULT_LOGO } from "../../lib/branding";
import { api, optimizedImageUrl, REFERENCE_PYG_RATE } from "../components";
import type { Stored } from "./types";
import { uploadImage } from "./utils";

export function SettingsForm({
  value,
  busy,
  cloudinary = false,
  onSave
}: {
  value: Stored<Settings>;
  busy: boolean;
  cloudinary?: boolean;
  onSave: (v: Stored<Settings>) => void;
}) {
  const [logoUrl, setLogoUrl] = useState(value.logo || DEFAULT_LOGO);
  const [heroUrl, setHeroUrl] = useState(value.heroImage || "/media/showroom.jpg");
  const [telegramBotToken, setTelegramBotToken] = useState(value.telegramBotToken || "");
  const [telegramChatId, setTelegramChatId] = useState(value.telegramChatId || "");
  const [webhookUrl, setWebhookUrl] = useState(value.webhookUrl || "");
  const [testingNotify, setTestingNotify] = useState(false);
  const [notifyFeedback, setNotifyFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [uploadingField, setUploadingField] = useState<"logo" | "heroImage" | null>(null);
  const [uploadError, setUploadError] = useState("");

  const fields: [keyof Settings, string, string?][] = [
    ["name", "Nombre del negocio"],
    ["tagline", "Lema"],
    ["address", "Dirección"],
    ["city", "Ciudad y país"],
    ["whatsapp", "WhatsApp (solo números, con código de país)"],
    ["instagram", "Enlace de Instagram"],
    ["email", "Correo comercial (opcional)", "email"],
    ["hours", "Horarios / coordinación de visitas"],
    ["exchangeRate", "Cotización referencial 1 USD en PYG (Gs.)", "number"]
  ];

  const handleFileUpload = async (field: "logo" | "heroImage", file: File) => {
    setUploadingField(field);
    setUploadError("");
    try {
      // Keep PNG transparency untouched for logo; optimize heroImage to WebP
      const uploaded = await uploadImage(file, field === "heroImage", cloudinary);
      if (field === "logo") setLogoUrl(uploaded.url);
      else setHeroUrl(uploaded.url);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploadingField(null);
    }
  };

  return (
    <form
      className="admin-form settings-form"
      key={value._etag}
      onSubmit={e => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const raw = Object.fromEntries(fd);
        onSave({
          ...value,
          ...raw,
          logo: logoUrl.trim() || DEFAULT_LOGO,
          heroImage: heroUrl.trim() || "/media/showroom.jpg",
          exchangeRate: raw.exchangeRate ? Number(raw.exchangeRate) : REFERENCE_PYG_RATE,
          telegramBotToken: telegramBotToken.trim(),
          telegramChatId: telegramChatId.trim(),
          webhookUrl: webhookUrl.trim()
        } as Stored<Settings>);
      }}
    >
      <div className="form-two">
        {fields.map(([key, label, type]) => (
          <label key={key}>
            {label}
            <input
              name={key}
              type={type || "text"}
              defaultValue={
                key === "exchangeRate" ? (value.exchangeRate ?? REFERENCE_PYG_RATE) : String(value[key] ?? "")
              }
              required={key !== "email" && key !== "exchangeRate"}
            />
          </label>
        ))}
      </div>

      <div className="form-two settings-media-grid">
        <div className="settings-media-card">
          <label>
            URL del logo
            <input
              name="logo"
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              required
            />
          </label>
          <div className="settings-media-preview logo-preview">
            <img src={brandLogo(logoUrl)} alt="Vista previa del logo" decoding="async" />
          </div>
          <div className="settings-media-actions">
            <label className="button small secondary file-button">
              <ImagePlus size={15} />
              {uploadingField === "logo" ? "Subiendo…" : "Subir logo"}
              <input
                type="file"
                accept="image/png,image/webp,image/jpeg"
                disabled={busy || uploadingField !== null}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload("logo", file);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              className="text-button"
              onClick={() => setLogoUrl("/media/dreamcars-logo.svg")}
            >
              <RotateCcw size={13} /> Usar SVG oficial
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setLogoUrl(DEFAULT_LOGO)}
            >
              PNG HD
            </button>
          </div>
        </div>

        <div className="settings-media-card">
          <label>
            URL de la imagen principal de portada
            <input
              name="heroImage"
              value={heroUrl}
              onChange={e => setHeroUrl(e.target.value)}
              required
            />
          </label>
          <div className="settings-media-preview hero-preview">
            <img src={optimizedImageUrl(heroUrl, 480)} alt="Vista previa de portada" decoding="async" />
          </div>
          <div className="settings-media-actions">
            <label className="button small secondary file-button">
              <ImagePlus size={15} />
              {uploadingField === "heroImage" ? "Subiendo…" : "Subir portada"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                disabled={busy || uploadingField !== null}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload("heroImage", file);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              className="text-button"
              onClick={() => setHeroUrl("/media/showroom.jpg")}
            >
              <RotateCcw size={13} /> Restaurar original
            </button>
          </div>
        </div>
      </div>

      {uploadError && (
        <div className="feedback error" role="alert">
          {uploadError}
        </div>
      )}

      <label>
        La historia del negocio
        <textarea name="about" rows={5} defaultValue={value.about} />
      </label>

      <div className="settings-notifications-box">
        <div className="settings-notifications-head">
          <div>
            <h3>
              <BellRing size={17} /> Alertas instantáneas al celular (Telegram / Webhook)
            </h3>
            <p className="muted">
              Recibí un aviso inmediato con botón de 1 clic a WhatsApp cada vez que un cliente agende una visita, ofrezca un auto en consignación o encargue una importación.
            </p>
          </div>
          <button
            type="button"
            className="button small secondary"
            disabled={busy || testingNotify}
            onClick={async () => {
              setTestingNotify(true);
              setNotifyFeedback(null);
              try {
                await api("admin/test-notification", {
                  method: "POST",
                  body: JSON.stringify({
                    telegramBotToken: telegramBotToken.trim(),
                    telegramChatId: telegramChatId.trim(),
                    webhookUrl: webhookUrl.trim()
                  })
                });
                setNotifyFeedback({
                  ok: true,
                  msg: "Alerta de prueba enviada correctamente. Revisá tu Telegram o Webhook."
                });
              } catch (err) {
                setNotifyFeedback({ ok: false, msg: (err as Error).message });
              } finally {
                setTestingNotify(false);
              }
            }}
          >
            <BellRing size={14} /> {testingNotify ? "Enviando prueba…" : "Enviar alerta de prueba"}
          </button>
        </div>

        <div className="form-three">
          <label>
            Telegram Bot Token (opcional, gratis con @BotFather)
            <input
              name="telegramBotToken"
              type="password"
              autoComplete="off"
              value={telegramBotToken}
              onChange={e => setTelegramBotToken(e.target.value)}
              placeholder="Ej. 123456789:ABCdefGHIjklMNO..."
            />
          </label>
          <label>
            Telegram Chat ID (tu ID o grupo del equipo)
            <input
              name="telegramChatId"
              value={telegramChatId}
              onChange={e => setTelegramChatId(e.target.value)}
              placeholder="Ej. 987654321 o -100123456"
            />
          </label>
          <label>
            Webhook HTTPS (Make, Zapier, Discord, Slack)
            <input
              name="webhookUrl"
              type="url"
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              placeholder="https://..."
            />
          </label>
        </div>

        {notifyFeedback && (
          <div className={notifyFeedback.ok ? "feedback success" : "feedback error"} role="status">
            {notifyFeedback.msg}
          </div>
        )}
      </div>

      <button className="button" disabled={busy || uploadingField !== null}>
        {busy ? "Guardando…" : "Guardar datos del negocio"}
        <Check size={17} />
      </button>
    </form>
  );
}
