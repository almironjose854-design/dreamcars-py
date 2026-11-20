"use client";
import { useId, useState } from "react";
import { Link } from "../../lib/nav-link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  UserRound
} from "lucide-react";
import type { AdminSessionInfo } from "../../lib/types";
import { api } from "../components";
import { brandLogo, DEFAULT_LOGO } from "../../lib/branding";

export function PasswordInput({
  label,
  name = "password",
  autoComplete = "current-password",
  minLength,
  required = true,
  hint
}: {
  label: string;
  name?: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  hint?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [caps, setCaps] = useState(false);
  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-input">
        <LockKeyhole size={17} />
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required={required}
          minLength={minLength}
          maxLength={128}
          autoComplete={autoComplete}
          onKeyUp={e => setCaps(e.getModifierState("CapsLock"))}
          onKeyDown={e => setCaps(e.getModifierState("CapsLock"))}
          onBlur={() => setCaps(false)}
        />
        <button
          type="button"
          aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {caps && (
        <span className="input-hint caps-hint" role="status">
          Bloq Mayús está activado.
        </span>
      )}
      {hint && <span className="input-hint">{hint}</span>}
    </div>
  );
}

export default function AdminLogin({
  session,
  initialError,
  onAuthenticated
}: {
  session: AdminSessionInfo | null;
  initialError: string;
  onAuthenticated: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recoverMode, setRecoverMode] = useState(false);

  return (
    <main className="admin-login">
      <section className="login-story">
        <Link href="/" className="login-brand">
          <img src={brandLogo(DEFAULT_LOGO)} alt="Dream Cars PY" decoding="async" />
          <span>DESDE LUQUE. CON PASIÓN.</span>
        </Link>
        <img className="login-car" src="/media/honda-s2000.jpg" alt="Honda S2000 en el garage de Dream Cars" decoding="async" />
        <div className="login-shade" />
        <div className="login-story-copy">
          <p className="eyebrow">
            <span className="status-dot" /> EL OTRO LADO DEL GARAGE
          </p>
          <h1>
            LAS LEYENDAS.<br />
            <em>EN TUS MANOS.</em>
          </h1>
          <p>
            Tu colección, tus clientes y el próximo capítulo.<br />
            Todo empieza acá.
          </p>
        </div>
        <div className="login-story-footer">
          <span>COMPRA · VENTA · CONSIGNACIÓN</span>
          <span>
            LUQUE / PY <ArrowUpRight size={14} />
          </span>
        </div>
      </section>

      <section className="login-form-side">
        <div className="login-topline">
          <Link href="/">
            <ArrowLeft size={15} /> Volver al sitio
          </Link>
          <span>
            <ShieldCheck size={14} /> ACCESO PRIVADO
          </span>
        </div>

        <div className="login-form-wrap">
          <span className="login-key">
            <KeyRound size={24} />
          </span>
          <p className="eyebrow">ADMINISTRACIÓN DREAM CARS</p>
          <h2>
            {recoverMode ? (
              <>
                Recuperar<br />
                acceso.
              </>
            ) : (
              <>
                Bienvenido<br />
                al garage.
              </>
            )}
          </h2>
          <p className="login-intro">
            {recoverMode
              ? "Ingresá tu usuario, uno de tus códigos de respaldo y elegí tu nueva contraseña."
              : "Ingresá para darle movimiento a tu colección."}
          </p>

          {!recoverMode ? (
            <form
              onSubmit={async e => {
                e.preventDefault();
                const form = e.currentTarget;
                const fields = new FormData(form);
                setBusy(true);
                setError("");
                try {
                  await api("auth/login", {
                    method: "POST",
                    body: JSON.stringify({
                      username: fields.get("username"),
                      password: fields.get("password"),
                      remember: fields.get("remember") === "on"
                    })
                  });
                  form.reset();
                  await onAuthenticated();
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label htmlFor="admin-username">Usuario</label>
              <div className="username-input">
                <UserRound size={17} />
                <input
                  id="admin-username"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  maxLength={40}
                  placeholder="Tu usuario"
                />
              </div>
              <PasswordInput label="Contraseña" />
              <label className="remember-session">
                <input type="checkbox" name="remember" />
                <span>Mantener sesión durante 7 días</span>
              </label>
              {(error || initialError) && (
                <div className="login-error" role="alert">
                  {error || initialError}
                </div>
              )}
              <button className="button login-submit" disabled={busy || !session}>
                {busy ? (
                  <>
                    <LoaderCircle size={18} className="spin" /> Ingresando…
                  </>
                ) : (
                  <>
                    Ingresar al panel <ArrowRight size={18} />
                  </>
                )}
              </button>
              {!session && !initialError && (
                <p className="login-loading" role="status">
                  Comprobando conexión…
                </p>
              )}
            </form>
          ) : (
            <form
              onSubmit={async e => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                setBusy(true);
                setError("");
                try {
                  await api("auth/recover", {
                    method: "POST",
                    body: JSON.stringify({
                      username: fd.get("username"),
                      recoveryCode: fd.get("recoveryCode"),
                      newPassword: fd.get("newPassword")
                    })
                  });
                  form.reset();
                  await onAuthenticated();
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label htmlFor="recover-username">Usuario</label>
              <div className="username-input">
                <UserRound size={17} />
                <input
                  id="recover-username"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  maxLength={40}
                  placeholder="Tu usuario"
                />
              </div>
              <label htmlFor="recover-code">Código de recuperación</label>
              <div className="username-input">
                <KeyRound size={17} />
                <input
                  id="recover-code"
                  name="recoveryCode"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                  maxLength={24}
                  placeholder="DC-XXXX-XXXX"
                />
              </div>
              <PasswordInput
                label="Nueva contraseña"
                name="newPassword"
                autoComplete="new-password"
                minLength={14}
                hint="Mínimo 14 caracteres."
              />
              {error && (
                <div className="login-error" role="alert">
                  {error}
                </div>
              )}
              <button className="button login-submit" disabled={busy || !session}>
                {busy ? (
                  <>
                    <LoaderCircle size={18} className="spin" /> Recuperando…
                  </>
                ) : (
                  <>
                    Restablecer y entrar <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          )}

          <div className="login-help">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setRecoverMode(!recoverMode);
                setError("");
              }}
            >
              <KeyRound size={14} />{" "}
              {recoverMode ? "← Volver al ingreso con contraseña" : "Usar código de recuperación de respaldo"}
            </button>
          </div>

          <div className="login-trust">
            <ShieldCheck size={16} />
            <span>Una sesión privada para cuidar tu negocio.</span>
          </div>
        </div>

        <div className="login-bottomline">
          <span>Dream Cars PY © {new Date().getFullYear()}</span>
          <span>NO SOLO VENDEMOS AUTOS. PRESERVAMOS LEYENDAS.</span>
        </div>
      </section>
    </main>
  );
}

export function AccountForm({
  session,
  onSaved,
  initial = false,
  onLogout
}: {
  session: AdminSessionInfo;
  onSaved: () => Promise<void>;
  initial?: boolean;
  onLogout: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [codesBusy, setCodesBusy] = useState(false);
  const [codesError, setCodesError] = useState("");
  const [generatedCodes, setGeneratedCodes] = useState<string[] | null>(null);
  const [copiedCodes, setCopiedCodes] = useState(false);

  return (
    <div className={initial ? "account-first-access" : "account-settings"}>
      {initial && (
        <Link className="back-link" href="/">
          <ArrowLeft size={16} /> Volver al sitio
        </Link>
      )}
      <div className="account-form-card">
        <span className="account-icon">
          <ShieldCheck size={27} />
        </span>
        <p className="eyebrow">{initial ? "PRIMER ACCESO" : "MI CUENTA"}</p>
        <h2>{initial ? "Hacé tuyo el garage." : "Tus datos de acceso."}</h2>
        <p>
          {initial
            ? "Elegí una contraseña personal para activar tu panel. La clave inicial dejará de funcionar."
            : "Actualizá tu usuario y contraseña. Al guardar, las demás sesiones se cerrarán."}
        </p>
        <form
          onSubmit={async e => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            if (fd.get("newPassword") !== fd.get("confirmPassword")) {
              setError("Las contraseñas nuevas no coinciden.");
              return;
            }
            setBusy(true);
            setError("");
            setSuccess(false);
            try {
              await api("auth/account", {
                method: "PUT",
                body: JSON.stringify({
                  username: fd.get("username"),
                  displayName: fd.get("displayName"),
                  currentPassword: fd.get("currentPassword"),
                  newPassword: fd.get("newPassword")
                })
              });
              form.reset();
              await onSaved();
              setSuccess(true);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-two">
            <label>
              Usuario
              <input
                name="username"
                defaultValue={session.user?.username}
                autoComplete="username"
                required
                minLength={3}
                maxLength={40}
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <label>
              Nombre para mostrar
              <input
                name="displayName"
                defaultValue={session.user?.displayName}
                required
                maxLength={80}
                autoComplete="name"
              />
            </label>
          </div>
          <PasswordInput label={initial ? "Contraseña inicial" : "Contraseña actual"} name="currentPassword" />
          <PasswordInput
            label="Nueva contraseña"
            name="newPassword"
            autoComplete="new-password"
            minLength={14}
            hint="Usá al menos 14 caracteres. Una frase larga es fácil de recordar."
          />
          <PasswordInput
            label="Repetir nueva contraseña"
            name="confirmPassword"
            autoComplete="new-password"
            minLength={14}
          />
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="account-success" role="status">
              <Check size={16} /> Tus datos de acceso se actualizaron.
            </p>
          )}
          <button className="button" disabled={busy}>
            {busy ? (
              <>
                <LoaderCircle size={17} className="spin" /> Guardando…
              </>
            ) : (
              <>
                {initial ? "Activar mi panel" : "Actualizar acceso"}
                <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>
        {initial && (
          <button className="text-button" onClick={onLogout} disabled={busy}>
            Cerrar sesión
          </button>
        )}
      </div>

      {!initial && (
        <>
          <div className="account-form-card">
            <p className="eyebrow">RECUPERACIÓN DE ACCESO</p>
            <h2>Códigos de respaldo.</h2>
            <p>
              Generá 8 códigos de un solo uso para recuperar tu cuenta si olvidás la contraseña. Actualmente tenés{" "}
              <strong>{session.recoveryCodesCount ?? 0}</strong> códigos disponibles. Al generar nuevos códigos, los anteriores se invalidan.
            </p>
            <form
              onSubmit={async e => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                setCodesBusy(true);
                setCodesError("");
                try {
                  const res = await api<{ codes: string[] }>("admin/recovery-codes", {
                    method: "POST",
                    body: JSON.stringify({ currentPassword: fd.get("currentPassword") })
                  });
                  setGeneratedCodes(res.codes);
                  form.reset();
                  await onSaved();
                } catch (err) {
                  setCodesError((err as Error).message);
                } finally {
                  setCodesBusy(false);
                }
              }}
            >
              <PasswordInput label="Confirmá tu contraseña actual" name="currentPassword" />
              {codesError && (
                <p className="login-error" role="alert">
                  {codesError}
                </p>
              )}
              <button className="button secondary" disabled={codesBusy}>
                <KeyRound size={16} />{" "}
                {codesBusy
                  ? "Generando códigos…"
                  : (session.recoveryCodesCount ?? 0) > 0
                    ? "Regenerar 8 códigos de respaldo"
                    : "Generar 8 códigos de respaldo"}
              </button>
            </form>

            {generatedCodes && (
              <div className="recovery-codes-box" role="region" aria-label="Nuevos códigos de recuperación">
                <div className="recovery-codes-head">
                  <strong>Guardá estos códigos en un lugar seguro (solo se muestran una vez):</strong>
                  <button
                    type="button"
                    className="button small secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(generatedCodes.join("\n"));
                        setCopiedCodes(true);
                        setTimeout(() => setCopiedCodes(false), 2500);
                      } catch {}
                    }}
                  >
                    <Copy size={14} /> {copiedCodes ? "Copiados" : "Copiar códigos"}
                  </button>
                </div>
                <div className="recovery-codes-grid">
                  {generatedCodes.map(c => (
                    <code key={c}>{c}</code>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="account-session-card">
            <LockKeyhole size={24} />
            <div>
              <h3>Cerrar todas las sesiones</h3>
              <p>Vas a salir de este dispositivo y de cualquier otro que tenga una sesión abierta.</p>
            </div>
            <button
              className="button secondary small"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await api("auth/revoke", { method: "POST", body: "{}" });
                  await onLogout();
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Cerrar todas
            </button>
          </div>
        </>
      )}
    </div>
  );
}
