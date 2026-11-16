"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CarFront,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileJson,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  MessageCircle,
  Pencil,
  Plus,
  QrCode,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  Archive,
  RotateCcw,
  RefreshCw,
  KeyRound,
  Star,
  FileSpreadsheet,
  FileCheck2,
  History
} from "lucide-react";
import type { Vehicle, Inquiry, AdminSessionInfo } from "../../lib/types";
import {
  api,
  availability,
  Instagram,
  Modal,
  money,
  normalizePriceUsd,
  optimizedImageUrl,
  QrSheetModal,
  REFERENCE_PYG_RATE,
  whatsapp
} from "../components";
import AdminLogin, { AccountForm } from "./login";
import { brandLogo } from "../../lib/branding";
import type { AdminData, BackupPayload, Stored } from "./types";
import { emptyVehicle, exportInquiriesCsv, slugifyVehicle, uploadImage } from "./utils";
import { SettingsForm } from "./settings-form";
import { VehicleEditor } from "./vehicle-editor";
import { StoryFlyerModal } from "./flyer-modal";
import { ContractSheetModal } from "./contract-modal";

const VEHICLE_PAGE_SIZE = 10;
const LEAD_PAGE_SIZE = 10;

export default function Admin() {
  const [session, setSession] = useState<AdminSessionInfo | null>(null);
  const [data, setData] = useState<AdminData | null>(null);
  const [tab, setTab] = useState("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Stored<Vehicle> | null>(null);
  const [flyerVehicle, setFlyerVehicle] = useState<Stored<Vehicle> | null>(null);
  const [qrVehicle, setQrVehicle] = useState<Stored<Vehicle> | null>(null);
  const [contractVehicle, setContractVehicle] = useState<Stored<Vehicle> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Stored<Vehicle> | null>(null);
  const [search, setSearch] = useState("");
  const [archiveFilter, setArchiveFilter] = useState(false);
  const [restore, setRestore] = useState<BackupPayload | null>(null);
  const [erase, setErase] = useState<Stored<Inquiry> | null>(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [vehicleSort, setVehicleSort] = useState("featured");
  const [vehiclePage, setVehiclePage] = useState(1);

  const [leadSearch, setLeadSearch] = useState("");
  const [leadStatus, setLeadStatus] = useState("all");
  const [leadType, setLeadType] = useState("all");
  const [leadPage, setLeadPage] = useState(1);

  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const load = async () => {
    const s = await api<AdminSessionInfo>("session");
    setSession(s);
    if (s.isAdmin && !s.mustChangePassword) {
      const fetched = await api<AdminData>("admin/data");
      setData(fetched);
      setLastSync(new Date());
    } else {
      setData(null);
    }
  };

  const signOut = async () => {
    await api("auth/logout", { method: "POST", body: "{}" });
    setData(null);
    setError("");
    setNotice("");
    await load();
  };

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      load().catch(e => {
        if (active) setError(e.message);
      });
      const requested = new URLSearchParams(location.search).get("tab");
      if (
        ["dashboard", "vehicles", "inquiries", "settings", "integrations", "backups", "account"].includes(
          requested || ""
        )
      ) {
        setTab(requested!);
      }
    });
    const expired = () => {
      setSession({ isAdmin: false, user: null, mustChangePassword: false, csrfToken: null, expiresAt: null });
      setData(null);
      setError("Tu sesión terminó. Ingresá nuevamente para continuar.");
    };
    window.addEventListener("admin-session-expired", expired);
    return () => {
      active = false;
      window.removeEventListener("admin-session-expired", expired);
    };
  }, []);

  useEffect(() => {
    const url = new URL(location.href);
    if (tab === "dashboard") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    history.replaceState(null, "", url.pathname + url.search);
  }, [tab]);

  const task = async (fn: () => Promise<void>, message = "Cambios guardados.") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const restoreDiff = useMemo(() => {
    if (!restore || !data) return null;
    const currentVehicleIds = new Set(data.vehicles.map(v => v.id));
    const newVehicles = restore.vehicles.filter(v => !currentVehicleIds.has(v.id)).length;
    const updatedVehicles = restore.vehicles.length - newVehicles;
    const preservedVehicles = data.vehicles.filter(v => !restore.vehicles.some(rv => rv.id === v.id)).length;

    const currentInquiryIds = new Set(data.inquiries.map(q => q.id));
    const newInquiries = restore.inquiries.filter(q => !currentInquiryIds.has(q.id)).length;
    const updatedInquiries = restore.inquiries.length - newInquiries;

    const changedSettings = (["name", "whatsapp", "address", "city", "exchangeRate"] as const).filter(
      k => String(restore.settings[k] ?? "") !== String(data.settings[k] ?? "")
    );

    return {
      newVehicles,
      updatedVehicles,
      preservedVehicles,
      newInquiries,
      updatedInquiries,
      changedSettings
    };
  }, [restore, data]);

  if (!session || !session.isAdmin) {
    return (
      <AdminLogin
        session={session}
        initialError={error}
        onAuthenticated={async () => {
          setError("");
          await load();
        }}
      />
    );
  }
  if (session.mustChangePassword) {
    return (
      <div className="admin-v2">
        <AccountForm session={session} initial onSaved={load} onLogout={signOut} />
      </div>
    );
  }
  if (!data) {
    return (
      <main className="admin-data-loading">
        <LoaderCircle className="spin" size={30} />
        <h1>Abriendo el garage…</h1>
        {error && <p role="alert">{error}</p>}
        <button className="button" onClick={() => load().catch(e => setError(e.message))}>
          Volver a intentar
        </button>
        <button className="text-button" onClick={signOut}>
          Cerrar sesión
        </button>
      </main>
    );
  }

  const tabs = [
    { id: "dashboard", label: "Resumen", icon: LayoutDashboard },
    { id: "vehicles", label: "Vehículos", icon: CarFront },
    { id: "inquiries", label: "Consultas", icon: MessageCircle },
    { id: "settings", label: "El negocio", icon: Settings2 },
    { id: "integrations", label: "Cloudinary", icon: Cloud },
    { id: "backups", label: "Respaldos y actividad", icon: FileJson },
    { id: "account", label: "Mi cuenta", icon: KeyRound }
  ];

  const vehicleMetrics = data.metrics || {};
  const auditLogs = data.auditLog || [];
  const rate = data.settings.exchangeRate || REFERENCE_PYG_RATE;
  const newLeads = data.inquiries.filter(q => q.status === "new").length;

  const totalViews = Object.values(vehicleMetrics).reduce((acc, m) => acc + (m?.views || 0), 0);
  const totalWaClicks = Object.values(vehicleMetrics).reduce((acc, m) => acc + (m?.whatsappClicks || 0), 0);
  const totalStockValueUsd = Math.round(
    data.vehicles
      .filter(v => v.status === "published" && v.availability !== "sold" && v.price !== null)
      .reduce((acc, v) => acc + (normalizePriceUsd(v.price, v.currency, rate) || 0), 0)
  );

  const visibleVehicles = [...data.vehicles]
    .filter(
      v =>
        (archiveFilter ? v.status === "archived" : v.status !== "archived") &&
        (statusFilter === "all" || v.status === statusFilter) &&
        (stockFilter === "all" || v.availability === stockFilter) &&
        `${v.brand} ${v.model} ${v.version}`.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (vehicleSort === "recent") return b.updatedAt.localeCompare(a.updatedAt);
      if (vehicleSort === "interest") {
        const scoreA = (vehicleMetrics[a.id]?.whatsappClicks || 0) * 3 + (vehicleMetrics[a.id]?.views || 0);
        const scoreB = (vehicleMetrics[b.id]?.whatsappClicks || 0) * 3 + (vehicleMetrics[b.id]?.views || 0);
        return scoreB - scoreA;
      }
      if (vehicleSort === "price-down" || vehicleSort === "price-up") {
        const pa = normalizePriceUsd(a.price, a.currency, rate);
        const pb = normalizePriceUsd(b.price, b.currency, rate);
        return vehicleSort === "price-up" ? (pa ?? Infinity) - (pb ?? Infinity) : (pb ?? -1) - (pa ?? -1);
      }
      if (vehicleSort === "incomplete") {
        const incA = [a.year, a.mileage, a.price].filter(x => x === null).length;
        const incB = [b.year, b.mileage, b.price].filter(x => x === null).length;
        return incB - incA;
      }
      return Number(b.featured) - Number(a.featured);
    });
  const totalVehiclePages = Math.max(1, Math.ceil(visibleVehicles.length / VEHICLE_PAGE_SIZE));
  const safeVehiclePage = Math.min(vehiclePage, totalVehiclePages);
  const pagedVehicles = visibleVehicles.slice(
    (safeVehiclePage - 1) * VEHICLE_PAGE_SIZE,
    safeVehiclePage * VEHICLE_PAGE_SIZE
  );

  const visibleInquiries = data.inquiries.filter(
    q =>
      (leadStatus === "all" || q.status === leadStatus) &&
      (leadType === "all" || (q.type || "general") === leadType) &&
      `${q.name} ${q.phone} ${q.message} ${q.notes || ""}`.toLowerCase().includes(leadSearch.toLowerCase())
  );
  const totalLeadPages = Math.max(1, Math.ceil(visibleInquiries.length / LEAD_PAGE_SIZE));
  const safeLeadPage = Math.min(leadPage, totalLeadPages);
  const pagedInquiries = visibleInquiries.slice(
    (safeLeadPage - 1) * LEAD_PAGE_SIZE,
    safeLeadPage * LEAD_PAGE_SIZE
  );

  const pendingVehicles = data.vehicles.filter(
    v => v.status !== "archived" && [v.year, v.mileage, v.price].some(x => x === null)
  ).length;

  const topVehiclesByInterest = [...data.vehicles]
    .filter(v => v.status === "published")
    .map(v => ({
      vehicle: v,
      views: vehicleMetrics[v.id]?.views || 0,
      wa: vehicleMetrics[v.id]?.whatsappClicks || 0
    }))
    .sort((a, b) => b.wa * 3 + b.views - (a.wa * 3 + a.views))
    .slice(0, 4);

  const selectTab = (nextTab: string) => {
    setTab(nextTab);
    setMobileMenuOpen(false);
    setError("");
    setNotice("");
  };

  return (
    <div className="admin-shell admin-v2">
      <aside className={mobileMenuOpen ? "admin-sidebar mobile-open" : "admin-sidebar"}>
        <div className="admin-sidebar-head">
          <Link href="/" className="admin-logo">
            <img src={brandLogo(data.settings.logo)} alt="Dream Cars PY" decoding="async" />
          </Link>
          <button
            type="button"
            className="icon-button mobile-drawer-close"
            aria-label="Cerrar menú de administración"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <span className="admin-label">ADMINISTRACIÓN</span>
        <nav aria-label="Secciones de administración">
          {tabs.map(t => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => selectTab(t.id)}
            >
              <t.icon size={18} />
              {t.label}
              {t.id === "inquiries" && newLeads > 0 && <small>{newLeads}</small>}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <Link href="/" target="_blank" rel="noreferrer">
            <ExternalLink size={16} /> Ver sitio web
          </Link>
          <button onClick={() => signOut().catch(e => setError(e.message))}>
            <LogOut size={16} /> Cerrar sesión
          </button>
          <span>@{session.user?.username}</span>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div
          className="admin-mobile-backdrop"
          aria-hidden="true"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              type="button"
              className="icon-button mobile-menu-trigger"
              aria-label="Abrir secciones del panel"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <Menu size={18} />
            </button>
            <span>
              DREAM CARS PY <span className="muted">/ {tabs.find(t => t.id === tab)?.label}</span>
            </span>
          </div>
          <div className="admin-top-actions">
            <button
              className="refresh-button"
              aria-label="Actualizar datos"
              title={lastSync ? `Última actualización: ${lastSync.toLocaleTimeString("es-PY")}` : "Actualizar datos"}
              disabled={busy}
              onClick={() => task(async () => {}, "Información actualizada.")}
            >
              <RefreshCw size={16} className={busy ? "spin" : ""} />
            </button>
            <button className="admin-profile" onClick={() => selectTab("account")}>
              <span className="profile-avatar">{session.user?.displayName.slice(0, 1).toUpperCase()}</span>
              <span>
                {session.user?.displayName}
                <small>Administrador</small>
              </span>
            </button>
            <button
              className="mobile-signout"
              aria-label="Cerrar sesión"
              onClick={() => signOut().catch(e => setError(e.message))}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <main className="admin-content">
          <div className="admin-heading">
            <div>
              <p className="eyebrow lime">TU GARAGE DIGITAL</p>
              <h1>
                {tab === "dashboard"
                  ? "Todo bajo control."
                  : tab === "vehicles"
                    ? "Tu colección."
                    : tab === "inquiries"
                      ? "Conversaciones que mueven."
                      : tab === "settings"
                        ? "La esencia del negocio."
                        : tab === "integrations"
                          ? "Las fotos, en la nube."
                          : tab === "account"
                            ? "Tu cuenta. Tu control."
                            : "Tus datos y actividad."}
              </h1>
            </div>
            {tab === "vehicles" && (
              <button className="button small" onClick={() => setEditor(emptyVehicle())}>
                <Plus size={17} /> Nuevo vehículo
              </button>
            )}
            {tab === "inquiries" && visibleInquiries.length > 0 && (
              <button
                type="button"
                className="button small secondary"
                onClick={() => exportInquiriesCsv(visibleInquiries, data.vehicles)}
              >
                <FileSpreadsheet size={16} /> Exportar CSV ({visibleInquiries.length})
              </button>
            )}
          </div>

          {error && (
            <div className="feedback error" role="alert">
              {error}
              <button aria-label="Cerrar error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {notice && (
            <div className="feedback success" role="status">
              <Check size={16} />
              {notice}
              <button aria-label="Cerrar mensaje" onClick={() => setNotice("")}>
                <X size={15} />
              </button>
            </div>
          )}

          {tab === "dashboard" && (
            <>
              <div className="stat-grid">
                {[
                  ["Vehículos publicados", data.vehicles.filter(v => v.status === "published").length, CarFront],
                  [
                    "Disponibles",
                    data.vehicles.filter(v => v.status === "published" && v.availability === "available").length,
                    Check
                  ],
                  ["Consultas nuevas", newLeads, MessageCircle],
                  ["Vendidos", data.vehicles.filter(v => v.availability === "sold" && v.status !== "archived").length, ShieldCheck]
                ].map(([label, value, Icon]) => {
                  const I = Icon as typeof CarFront;
                  return (
                    <article className="stat" key={String(label)}>
                      <I size={19} />
                      <strong>{String(value)}</strong>
                      <span>{String(label)}</span>
                    </article>
                  );
                })}
              </div>

              <div className="kpi-summary-bar" role="region" aria-label="Indicadores generales del garage">
                <div>
                  <span>Valor stock publicado (con precio)</span>
                  <strong>{totalStockValueUsd > 0 ? money(totalStockValueUsd, "USD") : "A consultar"}</strong>
                </div>
                <div>
                  <span>Vistas acumuladas en fichas</span>
                  <strong>{totalViews.toLocaleString("es-PY")}</strong>
                </div>
                <div>
                  <span>Clics directos a WhatsApp</span>
                  <strong>{totalWaClicks.toLocaleString("es-PY")}</strong>
                </div>
                <div>
                  <span>Consultas recibidas</span>
                  <strong>{data.inquiries.length}</strong>
                </div>
              </div>

              {!data.cloudinary.configured && (
                <div className="setup-callout">
                  <Cloud size={30} />
                  <div>
                    <h3>Almacenamiento de imágenes listo.</h3>
                    <p>
                      Podés subir fotos al almacenamiento persistente o conectar Cloudinary para optimizarlas y administrarlas desde tu cuenta.
                    </p>
                  </div>
                  <button className="button small" onClick={() => selectTab("integrations")}>
                    Configurar Cloudinary <ArrowUpRight size={16} />
                  </button>
                </div>
              )}

              {pendingVehicles > 0 && (
                <div className="inventory-insight">
                  <div>
                    <p className="eyebrow">EL PRÓXIMO PASO</p>
                    <h3>{pendingVehicles} fichas tienen datos por completar.</h3>
                    <p>Agregá precio, año y kilometraje para que tus clientes tengan más información.</p>
                  </div>
                  <button className="button small secondary" onClick={() => selectTab("vehicles")}>
                    Revisar colección <ArrowUpRight size={16} />
                  </button>
                </div>
              )}

              <div className="admin-section-head">
                <h2>Rendimiento de unidades (Vistas y clics a WhatsApp)</h2>
                <button className="text-link" onClick={() => selectTab("vehicles")}>
                  Ver inventario <ArrowUpRight size={16} />
                </button>
              </div>
              <div className="interest-grid">
                {topVehiclesByInterest.map(({ vehicle: v, views, wa }) => (
                  <article className="interest-card" key={v.id}>
                    <div className="interest-card-thumb">
                      <img src={optimizedImageUrl(v.images[0]?.url, 200)} alt={`${v.brand} ${v.model}`} decoding="async" />
                    </div>
                    <div className="interest-card-body">
                      <small>{v.brand}</small>
                      <strong>{v.model}</strong>
                      <div className="interest-metrics">
                        <span>
                          <Eye size={13} /> {views} vistas
                        </span>
                        <span>
                          <MessageCircle size={13} /> {wa} WA
                        </span>
                      </div>
                    </div>
                    <div className="interest-card-actions">
                      <button
                        type="button"
                        className="icon-button"
                        title={`Ficha QR de ${v.model}`}
                        aria-label={`Ficha QR de ${v.model}`}
                        onClick={() => setQrVehicle(v)}
                      >
                        <QrCode size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        title={`Acta de Reserva / Consignación A4 de ${v.model}`}
                        aria-label={`Acta de Reserva o Consignación de ${v.model}`}
                        onClick={() => setContractVehicle(v)}
                      >
                        <FileCheck2 size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        title={`Editar ${v.model}`}
                        aria-label={`Editar ${v.model}`}
                        onClick={() => setEditor(v)}
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="admin-section-head">
                <h2>Últimas consultas</h2>
                <button className="text-link" onClick={() => selectTab("inquiries")}>
                  Ver todas <ArrowUpRight size={16} />
                </button>
              </div>
              {data.inquiries.length === 0 ? (
                <div className="admin-empty">
                  <MessageCircle size={30} />
                  <h3>El próximo “hola” llega acá.</h3>
                  <p>Las consultas enviadas desde la web aparecerán en este panel.</p>
                </div>
              ) : (
                <div className="lead-list">
                  {data.inquiries.slice(0, 4).map(q => (
                    <div key={q.id}>
                      <div>
                        <div className="lead-preview-title">
                          <strong>{q.name}</strong>
                          <span className={`lead-status-dot status-${q.status}`}>
                            {q.status === "new" ? "Nueva" : q.status === "contacted" ? "Contactada" : "Cerrada"}
                          </span>
                        </div>
                        <p>{q.message}</p>
                      </div>
                      <span>{new Date(q.createdAt).toLocaleDateString("es-PY")}</span>
                    </div>
                  ))}
                </div>
              )}

              {auditLogs.length > 0 && (
                <>
                  <div className="admin-section-head">
                    <h2>Actividad reciente del equipo</h2>
                    <button className="text-link" onClick={() => selectTab("backups")}>
                      Ver historial completo <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <div className="lead-list audit-preview-list">
                    {auditLogs.slice(0, 5).map(entry => (
                      <div key={entry.id}>
                        <div>
                          <strong>@{entry.actor}</strong>
                          <p>{entry.summary}</p>
                        </div>
                        <span>{new Date(entry.at).toLocaleString("es-PY", { timeZone: "America/Asuncion" })}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="admin-section-head">
                <h2>Accesos rápidos</h2>
              </div>
              <div className="quick-actions">
                <button
                  onClick={() => {
                    selectTab("vehicles");
                    setEditor(emptyVehicle());
                  }}
                >
                  <Plus /> Cargar un vehículo <ArrowUpRight size={17} />
                </button>
                <button onClick={() => selectTab("settings")}>
                  <Settings2 /> Editar el negocio <ArrowUpRight size={17} />
                </button>
                <a href="/api/admin/backup" download>
                  <Download /> Descargar respaldo <ArrowUpRight size={17} />
                </a>
              </div>
            </>
          )}

          {tab === "vehicles" && (
            <>
              <div className="admin-tools">
                <label className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="Buscar vehículos en el panel"
                    placeholder="Buscar por marca, modelo o versión"
                    value={search}
                    onChange={e => {
                      setSearch(e.target.value);
                      setVehiclePage(1);
                    }}
                  />
                </label>
                <button
                  className={archiveFilter ? "button small" : "button small secondary"}
                  onClick={() => {
                    setArchiveFilter(!archiveFilter);
                    setStatusFilter("all");
                    setVehiclePage(1);
                  }}
                >
                  <Archive size={16} />
                  {archiveFilter ? "Ver activos" : "Ver archivados"}
                </button>
              </div>

              <div className="inventory-filters">
                <label>
                  Publicación
                  <select
                    aria-label="Filtrar por publicación"
                    value={statusFilter}
                    onChange={e => {
                      setStatusFilter(e.target.value);
                      setVehiclePage(1);
                    }}
                  >
                    <option value="all">Todos los estados</option>
                    <option value="published">Publicados</option>
                    <option value="draft">Borradores</option>
                  </select>
                </label>
                <label>
                  Disponibilidad
                  <select
                    aria-label="Filtrar por disponibilidad"
                    value={stockFilter}
                    onChange={e => {
                      setStockFilter(e.target.value);
                      setVehiclePage(1);
                    }}
                  >
                    <option value="all">Todas las disponibilidades</option>
                    {Object.entries(availability).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ordenar por
                  <select
                    aria-label="Ordenar inventario"
                    value={vehicleSort}
                    onChange={e => {
                      setVehicleSort(e.target.value);
                      setVehiclePage(1);
                    }}
                  >
                    <option value="featured">Destacados primero</option>
                    <option value="recent">Más recientes</option>
                    <option value="interest">Mayor interés (vistas + WA)</option>
                    <option value="price-down">Mayor precio</option>
                    <option value="price-up">Menor precio</option>
                    <option value="incomplete">Ficha incompleta primero</option>
                  </select>
                </label>
                <span>
                  {visibleVehicles.length} de {data.vehicles.length} vehículos
                </span>
                <button
                  className="text-button"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                    setStockFilter("all");
                    setVehicleSort("featured");
                    setArchiveFilter(false);
                    setVehiclePage(1);
                  }}
                >
                  Limpiar filtros
                </button>
              </div>

              <div className="admin-vehicles">
                {pagedVehicles.map(v => {
                  const m = vehicleMetrics[v.id];
                  return (
                    <article key={v.id}>
                      <img
                        src={optimizedImageUrl(v.images[0]?.url, 240)}
                        alt={`${v.brand} ${v.model}`}
                        decoding="async"
                      />
                      <div className="admin-vehicle-name">
                        <small>
                          {v.brand} {v.year ? `· ${v.year}` : ""}
                        </small>
                        <strong>{v.model}</strong>
                        <span>
                          {v.version}
                          {m?.views || m?.whatsappClicks ? ` · 👁 ${m?.views || 0} · 💬 ${m?.whatsappClicks || 0}` : ""}
                        </span>
                      </div>
                      <div className="admin-quick-selects">
                        <select
                          aria-label={`Estado de publicación de ${v.model}`}
                          className={`admin-inline-select status-${v.status}`}
                          value={v.status}
                          disabled={busy}
                          onChange={e => {
                            const nextStatus = e.target.value as Vehicle["status"];
                            task(async () => {
                              await api(`admin/vehicles/${v.id}`, {
                                method: "PUT",
                                body: JSON.stringify({ ...v, status: nextStatus })
                              });
                            }, `Estado de ${v.model} actualizado.`);
                          }}
                        >
                          <option value="published">Publicado</option>
                          <option value="draft">Borrador</option>
                          <option value="archived">Archivado</option>
                        </select>
                        <select
                          aria-label={`Disponibilidad de ${v.model}`}
                          className="admin-inline-select"
                          value={v.availability}
                          disabled={busy}
                          onChange={e => {
                            const nextAvail = e.target.value as Vehicle["availability"];
                            task(async () => {
                              await api(`admin/vehicles/${v.id}`, {
                                method: "PUT",
                                body: JSON.stringify({ ...v, availability: nextAvail })
                              });
                            }, `Disponibilidad de ${v.model} actualizada.`);
                          }}
                        >
                          {Object.entries(availability).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="admin-vehicle-price">{money(v.price, v.currency)}</div>
                      <div className="admin-row-actions">
                        <button
                          className={v.featured ? "icon-button featured-star active" : "icon-button featured-star"}
                          disabled={busy}
                          title={v.featured ? "Quitar de destacados" : "Destacar en el catálogo"}
                          aria-label={v.featured ? `Quitar ${v.model} de destacados` : `Destacar ${v.model}`}
                          aria-pressed={v.featured}
                          onClick={() =>
                            task(async () => {
                              await api(`admin/vehicles/${v.id}`, {
                                method: "PUT",
                                body: JSON.stringify({ ...v, featured: !v.featured })
                              });
                            }, v.featured ? `${v.model} ya no está destacado.` : `${v.model} marcado como destacado.`)
                          }
                        >
                          <Star size={16} fill={v.featured ? "currentColor" : "none"} />
                        </button>
                        <button
                          className="icon-button"
                          title="Ficha QR Imprimible (Parabrisas)"
                          aria-label={`Ficha QR Imprimible para ${v.model}`}
                          onClick={() => setQrVehicle(v)}
                        >
                          <QrCode size={16} />
                        </button>
                        <button
                          className="icon-button"
                          title="Generar Flyer para Instagram Story"
                          aria-label={`Generar Flyer de Instagram para ${v.model}`}
                          onClick={() => setFlyerVehicle(v)}
                        >
                          <Instagram size={16} />
                        </button>
                        <button
                          className="icon-button"
                          title="Duplicar vehículo"
                          aria-label={`Duplicar ${v.model}`}
                          onClick={() => {
                            const existingIds = new Set(data.vehicles.map(x => x.id));
                            const copyId = slugifyVehicle(v.brand, v.model, `${v.version}-copia`, existingIds);
                            setEditor({
                              ...v,
                              id: copyId,
                              version: v.version ? `${v.version} (Copia)` : "Copia",
                              status: "draft",
                              featured: false,
                              _etag: null
                            });
                          }}
                        >
                          <Copy size={15} />
                        </button>
                        <button className="icon-button" aria-label={`Editar ${v.model}`} onClick={() => setEditor(v)}>
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button"
                          disabled={busy}
                          title={v.status === "archived" ? "Restaurar como borrador" : "Archivar"}
                          aria-label={`${v.status === "archived" ? "Restaurar" : "Archivar"} ${v.model}`}
                          onClick={() =>
                            task(async () => {
                              await api(`admin/vehicles/${v.id}`, {
                                method: "PUT",
                                body: JSON.stringify({
                                  ...v,
                                  status: v.status === "archived" ? "draft" : "archived"
                                })
                              });
                            }, v.status === "archived" ? "Vehículo recuperado como borrador." : "Vehículo archivado. Podés recuperarlo desde Archivados.")
                          }
                        >
                          {v.status === "archived" ? <RotateCcw size={17} /> : <Archive size={17} />}
                        </button>
                        <button
                          className="icon-button danger"
                          disabled={busy}
                          title="Eliminar vehículo definitivamente"
                          aria-label={`Eliminar ${v.model}`}
                          onClick={() => setDeleteTarget(v)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {totalVehiclePages > 1 && (
                <div className="admin-pagination" role="navigation" aria-label="Paginación de vehículos">
                  <span>
                    Página {safeVehiclePage} de {totalVehiclePages} · Mostrando{" "}
                    {(safeVehiclePage - 1) * VEHICLE_PAGE_SIZE + 1}–
                    {Math.min(safeVehiclePage * VEHICLE_PAGE_SIZE, visibleVehicles.length)} de {visibleVehicles.length}
                  </span>
                  <div className="admin-pagination-buttons">
                    <button
                      type="button"
                      className="button small secondary"
                      disabled={safeVehiclePage <= 1}
                      onClick={() => setVehiclePage(p => Math.max(1, p - 1))}
                    >
                      <ChevronLeft size={15} /> Anterior
                    </button>
                    <button
                      type="button"
                      className="button small secondary"
                      disabled={safeVehiclePage >= totalVehiclePages}
                      onClick={() => setVehiclePage(p => Math.min(totalVehiclePages, p + 1))}
                    >
                      Siguiente <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              )}

              {visibleVehicles.length === 0 && (
                <div className="admin-empty">
                  <CarFront size={32} />
                  <h3>No hay vehículos en esta vista.</h3>
                  <p>Probá otros filtros o agregá un vehículo al garage.</p>
                  <button className="button small" onClick={() => setEditor(emptyVehicle())}>
                    <Plus size={16} /> Nuevo vehículo
                  </button>
                </div>
              )}
              <p className="muted admin-hint">
                Desde cada fila podés cambiar estado, disponibilidad, destacar (★), imprimir la hoja QR de parabrisas, crear una Story IG o duplicar la unidad.
              </p>
            </>
          )}

          {tab === "inquiries" && (
            <>
              <div className="lead-tools">
                <label className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="Buscar consultas"
                    placeholder="Buscar por nombre, teléfono, mensaje o notas internas"
                    value={leadSearch}
                    onChange={e => {
                      setLeadSearch(e.target.value);
                      setLeadPage(1);
                    }}
                  />
                </label>
                <div className="lead-filter-row">
                  <div className="lead-tabs">
                    {[
                      ["all", "Todas"],
                      ["new", "Nuevas"],
                      ["contacted", "Contactadas"],
                      ["closed", "Cerradas"]
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        aria-pressed={leadStatus === key}
                        className={leadStatus === key ? "active" : ""}
                        onClick={() => {
                          setLeadStatus(key);
                          setLeadPage(1);
                        }}
                      >
                        {label}
                        <span>
                          {key === "all" ? data.inquiries.length : data.inquiries.filter(q => q.status === key).length}
                        </span>
                      </button>
                    ))}
                  </div>
                  <select
                    aria-label="Filtrar por tipo de consulta"
                    className="lead-type-select"
                    value={leadType}
                    onChange={e => {
                      setLeadType(e.target.value);
                      setLeadPage(1);
                    }}
                  >
                    <option value="all">Todos los tipos</option>
                    <option value="vehicle">Vehículo en stock</option>
                    <option value="consignment">Consignación / Venta</option>
                    <option value="import">Importación a pedido</option>
                    <option value="general">Consulta general</option>
                  </select>
                </div>
              </div>

              <div className="inquiry-list">
                {visibleInquiries.length === 0 ? (
                  <div className="admin-empty">
                    <MessageCircle size={28} />
                    <h3>No hay consultas en esta vista.</h3>
                    <p>Las consultas de tus clientes aparecerán acá.</p>
                  </div>
                ) : (
                  pagedInquiries.map(q => {
                    const linkedCar = q.vehicleId ? data.vehicles.find(v => v.id === q.vehicleId) : undefined;
                    const draftNote = noteDrafts[q.id] !== undefined ? noteDrafts[q.id] : q.notes || "";
                    const noteChanged = draftNote !== (q.notes || "");
                    return (
                      <article className={`inquiry-card inquiry-${q.status}`} key={q.id}>
                        <div className="inquiry-header">
                          <div>
                            <h3>{q.name}</h3>
                            <span>
                              {q.phone} ·{" "}
                              {new Date(q.createdAt).toLocaleString("es-PY", { timeZone: "America/Asuncion" })}
                            </span>
                          </div>
                          <select
                            aria-label={`Estado de consulta de ${q.name}`}
                            value={q.status}
                            disabled={busy}
                            onChange={e =>
                              task(async () => {
                                await api(`admin/inquiries/${q.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ status: e.target.value, _etag: q._etag })
                                });
                              })
                            }
                          >
                            <option value="new">Nueva</option>
                            <option value="contacted">Contactada</option>
                            <option value="closed">Cerrada</option>
                          </select>
                        </div>

                        <div className="inquiry-badge-row">
                          <span className="inquiry-type">
                            {q.type === "consignment"
                              ? "VENTA / CONSIGNACIÓN"
                              : q.type === "import"
                                ? "IMPORTACIÓN A PEDIDO"
                                : linkedCar
                                  ? `VEHÍCULO: ${linkedCar.brand} ${linkedCar.model}`
                                  : "CONSULTA GENERAL"}
                          </span>
                          {linkedCar && (
                            <Link
                              className="inquiry-car-chip"
                              href={`/vehiculos/${linkedCar.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {linkedCar.images[0]?.url && (
                                <img src={optimizedImageUrl(linkedCar.images[0].url, 120)} alt="" decoding="async" />
                              )}
                              <span>
                                Ver {linkedCar.brand} {linkedCar.model}
                              </span>
                              <ArrowUpRight size={12} />
                            </Link>
                          )}
                        </div>

                        <p>{q.message}</p>

                        <div className="inquiry-notes-box">
                          <label>
                            Notas internas de seguimiento
                            <textarea
                              rows={2}
                              placeholder="Anotá acuerdos, tasación, horario de visita o próximos pasos con este cliente…"
                              value={draftNote}
                              onChange={e => setNoteDrafts(prev => ({ ...prev, [q.id]: e.target.value }))}
                            />
                          </label>
                          {noteChanged && (
                            <button
                              type="button"
                              className="button small secondary"
                              disabled={busy}
                              onClick={() =>
                                task(async () => {
                                  await api(`admin/inquiries/${q.id}`, {
                                    method: "PATCH",
                                    body: JSON.stringify({ notes: draftNote, _etag: q._etag })
                                  });
                                  setNoteDrafts(prev => {
                                    const copy = { ...prev };
                                    delete copy[q.id];
                                    return copy;
                                  });
                                }, "Nota interna guardada.")
                              }
                            >
                              <Check size={14} /> Guardar nota
                            </button>
                          )}
                        </div>

                        <div className="inquiry-actions">
                          <a
                            className="text-link"
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => {
                              if (q.status === "new") {
                                api(`admin/inquiries/${q.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ status: "contacted", _etag: q._etag })
                                })
                                  .then(() => load())
                                  .catch(() => {});
                              }
                            }}
                            href={whatsapp(
                              q.phone,
                              `Hola ${q.name}, te contactamos de Dream Cars PY por tu consulta${
                                linkedCar ? ` sobre el ${linkedCar.brand} ${linkedCar.model}` : ""
                              }. ¿Cómo estás?`
                            )}
                          >
                            <MessageCircle size={15} /> Responder por WhatsApp <ArrowUpRight size={15} />
                          </a>
                          <button className="text-button danger" onClick={() => setErase(q)}>
                            <Trash2 size={14} /> Eliminar datos
                          </button>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>

              {totalLeadPages > 1 && (
                <div className="admin-pagination" role="navigation" aria-label="Paginación de consultas">
                  <span>
                    Página {safeLeadPage} de {totalLeadPages} · Mostrando{" "}
                    {(safeLeadPage - 1) * LEAD_PAGE_SIZE + 1}–
                    {Math.min(safeLeadPage * LEAD_PAGE_SIZE, visibleInquiries.length)} de {visibleInquiries.length}
                  </span>
                  <div className="admin-pagination-buttons">
                    <button
                      type="button"
                      className="button small secondary"
                      disabled={safeLeadPage <= 1}
                      onClick={() => setLeadPage(p => Math.max(1, p - 1))}
                    >
                      <ChevronLeft size={15} /> Anterior
                    </button>
                    <button
                      type="button"
                      className="button small secondary"
                      disabled={safeLeadPage >= totalLeadPages}
                      onClick={() => setLeadPage(p => Math.min(totalLeadPages, p + 1))}
                    >
                      Siguiente <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "account" && <AccountForm session={session} onSaved={load} onLogout={signOut} />}

          {tab === "settings" && (
            <SettingsForm
              value={data.settings}
              busy={busy}
              cloudinary={data.cloudinary.configured}
              onSave={value =>
                task(async () => {
                  await api("admin/settings", { method: "PUT", body: JSON.stringify(value) });
                })
              }
            />
          )}

          {tab === "integrations" && (
            <>
              <div className="integration-status">
                <Cloud size={32} />
                <div>
                  <h2>Cloudinary</h2>
                  <p>
                    {data.cloudinary.configured
                      ? `Cuenta conectada: ${data.cloudinary.cloudName}`
                      : "Opcional — usando almacenamiento persistente del sitio"}
                  </p>
                </div>
                <span className={data.cloudinary.configured ? "connection-pill connected" : "connection-pill"}>
                  {data.cloudinary.configured ? "Conectado" : "Almacenamiento directo"}
                </span>
              </div>
              <div className="integration-layout">
                <form
                  className="admin-form"
                  onSubmit={e => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const fd = new FormData(form);
                    task(async () => {
                      await api("admin/cloudinary", { method: "POST", body: JSON.stringify(Object.fromEntries(fd)) });
                      form.reset();
                    }, "Cloudinary conectado. Ya podés subir fotos y migrar las originales.");
                  }}
                >
                  <h3>{data.cloudinary.configured ? "Actualizar conexión" : "Conectar tu cuenta"}</h3>
                  <p>Copiá estos datos desde Settings → API Keys de tu cuenta Cloudinary.</p>
                  <label>
                    Cloud name
                    <input name="cloudName" required autoComplete="off" defaultValue={data.cloudinary.cloudName} />
                  </label>
                  <label>
                    API key
                    <input name="apiKey" required autoComplete="off" />
                  </label>
                  <label>
                    API secret
                    <input name="apiSecret" type="password" required autoComplete="new-password" minLength={10} />
                  </label>
                  <button className="button" disabled={busy}>
                    {busy ? "Validando…" : "Guardar conexión"}
                    <ShieldCheck size={17} />
                  </button>
                  <p className="muted">
                    El secreto se cifra en el servidor y nunca se devuelve al navegador. Las fotos se suben directamente a Cloudinary con firma temporal.
                  </p>
                </form>

                <div className="integration-guide">
                  <p className="eyebrow lime">UN SOLO LUGAR PARA TUS FOTOS</p>
                  <h3>
                    Del garage<br />
                    a la nube.
                  </h3>
                  <ol>
                    <li>
                      Creá una cuenta en{" "}
                      <a href="https://cloudinary.com/users/register_free" target="_blank" rel="noreferrer">
                        Cloudinary ↗
                      </a>
                      .
                    </li>
                    <li>Ingresá las credenciales en este formulario.</li>
                    <li>Migrá las fotos originales del catálogo.</li>
                    <li>Subí nuevas imágenes desde cada vehículo.</li>
                  </ol>
                  <button
                    className="button secondary"
                    disabled={
                      busy ||
                      !data.cloudinary.configured ||
                      !data.vehicles.some(v => v.images.some(i => i.url.startsWith("/media/")))
                    }
                    onClick={() =>
                      task(async () => {
                        let currentSettings = data.settings;
                        let migrated = 0;
                        for (const v of data.vehicles) {
                          let changed = false;
                          const images = [];
                          for (const img of v.images) {
                            if (img.url.startsWith("/media/")) {
                              setNotice(`Migrando fotos… ${migrated + 1}`);
                              const response = await fetch(img.url);
                              if (!response.ok) throw new Error(`No se pudo leer ${img.url}`);
                              let blob = await response.blob();
                              if (!blob.type.startsWith("image/")) blob = new Blob([blob], { type: "image/jpeg" });
                              const next = await uploadImage(blob, true, true);
                              images.push(next);
                              changed = true;
                              migrated++;
                              if (currentSettings.heroImage === img.url) {
                                currentSettings = { ...currentSettings, heroImage: next.url };
                              }
                            } else images.push(img);
                          }
                          if (changed) {
                            await api(`admin/vehicles/${v.id}`, {
                              method: "PUT",
                              body: JSON.stringify({ ...v, images })
                            });
                          }
                        }
                        if (currentSettings.heroImage !== data.settings.heroImage) {
                          await api("admin/settings", { method: "PUT", body: JSON.stringify(currentSettings) });
                        }
                      }, "Fotos originales migradas a Cloudinary.")
                    }
                  >
                    <Upload size={17} /> Migrar fotos originales
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === "backups" && (
            <>
              <div className="backup-grid">
                <article className="admin-form">
                  <Download size={32} className="lime" />
                  <h2>Descargá tus JSON.</h2>
                  <p>
                    Un archivo con todos los vehículos, datos del negocio y consultas. Incluye borradores y archivados; las fotos permanecen en Cloudinary y se conserva su URL.
                  </p>
                  <a className="button" href="/api/admin/backup" download>
                    Descargar respaldo <Download size={17} />
                  </a>
                  <p className="muted">
                    No incluye credenciales privadas. Guardá el archivo en un lugar seguro: contiene datos de contacto de tus consultas.
                  </p>
                </article>
                <article className="admin-form">
                  <Upload size={32} className="lime" />
                  <h2>Recuperá un respaldo.</h2>
                  <p>
                    Importá un respaldo generado por este panel. Verás una vista previa de cambios antes de continuar y se creará una instantánea automática por si necesitás revertir.
                  </p>
                  <label className="button secondary file-button">
                    Elegir archivo JSON
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={async e => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.size > 2000000) {
                          setError("El respaldo supera los 2 MB.");
                          return;
                        }
                        try {
                          const parsed: unknown = JSON.parse(await f.text());
                          if (!parsed || typeof parsed !== "object") throw new Error("Formato de respaldo inválido.");
                          const value = parsed as Partial<BackupPayload>;
                          if (
                            value.schemaVersion !== 1 ||
                            !Array.isArray(value.vehicles) ||
                            !Array.isArray(value.inquiries) ||
                            !value.settings
                          ) {
                            throw new Error("Formato de respaldo inválido.");
                          }
                          setRestore(value as BackupPayload);
                        } catch (e) {
                          setError((e as Error).message);
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>
                </article>
                <article className="backup-explainer">
                  <FileJson size={26} />
                  <div>
                    <h3>
                      Archivos reales · Almacenamiento{" "}
                      {data.storage.mode === "s3"
                        ? "en la nube (S3 / R2)"
                        : data.storage.mode === "upstash"
                          ? "en la nube (Upstash Redis)"
                          : "persistente activo"}
                      .
                    </h3>
                    <p>
                      Cada vehículo y consulta se guarda como un archivo .json con control de concurrencia y hasta 10 copias históricas automáticas. Para desplegar en Render Free sin perder datos ante reinicios, podés conectar gratis Upstash Redis (<code>UPSTASH_REDIS_REST_URL</code> + <code>UPSTASH_REDIS_REST_TOKEN</code>) o un bucket S3/Cloudflare R2 en las variables de entorno.
                    </p>
                  </div>
                </article>
              </div>

              <div className="admin-section-head">
                <h2>
                  <History size={17} style={{ display: "inline", verticalAlign: "text-bottom", marginRight: 6 }} />
                  Registro de actividad del panel ({auditLogs.length})
                </h2>
              </div>
              {auditLogs.length === 0 ? (
                <div className="admin-empty">
                  <History size={28} />
                  <h3>Aún no hay movimientos registrados.</h3>
                  <p>Aquí verás quién creó, modificó o eliminó cada vehículo o configuración.</p>
                </div>
              ) : (
                <div className="lead-list">
                  {auditLogs.slice(0, 30).map(entry => (
                    <div key={entry.id}>
                      <div>
                        <strong>@{entry.actor}</strong>
                        <p>{entry.summary}</p>
                      </div>
                      <span>{new Date(entry.at).toLocaleString("es-PY", { timeZone: "America/Asuncion" })}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>

        <nav className="admin-mobile-bottombar" aria-label="Acceso rápido móvil">
          {[
            { id: "dashboard", label: "Resumen", icon: LayoutDashboard },
            { id: "vehicles", label: "Vehículos", icon: CarFront },
            { id: "inquiries", label: "Consultas", icon: MessageCircle, badge: newLeads },
            { id: "settings", label: "Negocio", icon: Settings2 }
          ].map(item => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "active" : ""}
              onClick={() => selectTab(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.badge ? <small>{item.badge}</small> : null}
            </button>
          ))}
          <button
            type="button"
            className={mobileMenuOpen ? "active" : ""}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Menu size={18} />
            <span>Más</span>
          </button>
        </nav>
      </div>

      {editor && (
        <VehicleEditor
          initial={editor}
          cloudinary={data.cloudinary.configured}
          onClose={() => setEditor(null)}
          onOpenFlyer={v => setFlyerVehicle(v)}
          onOpenQr={v => setQrVehicle(v)}
          onOpenContract={v => setContractVehicle(v)}
          onSave={async v => {
            const isBrandNew = editor._etag === null && !editor.brand;
            const existingIds = new Set(data.vehicles.map(x => x.id));
            const finalId = isBrandNew ? slugifyVehicle(v.brand, v.model, v.version, existingIds) : v.id;
            await api(`admin/vehicles/${finalId}`, { method: "PUT", body: JSON.stringify({ ...v, id: finalId }) });
            await load();
            setEditor(null);
            setNotice("Ficha guardada. Los cambios ya están en el catálogo.");
          }}
        />
      )}

      {flyerVehicle && (
        <StoryFlyerModal vehicle={flyerVehicle} settings={data.settings} onClose={() => setFlyerVehicle(null)} />
      )}

      {qrVehicle && (
        <QrSheetModal
          vehicle={qrVehicle}
          settings={data.settings}
          onClose={() => setQrVehicle(null)}
          onOpenContract={() => {
            const target = qrVehicle;
            setQrVehicle(null);
            setContractVehicle(target);
          }}
        />
      )}

      {contractVehicle && (
        <ContractSheetModal
          vehicle={contractVehicle}
          settings={data.settings}
          onClose={() => setContractVehicle(null)}
        />
      )}

      {deleteTarget && (
        <Modal title="Eliminar vehículo definitivamente" onClose={() => setDeleteTarget(null)}>
          <p className="modal-description">
            ¿Estás seguro de eliminar <strong>{deleteTarget.brand} {deleteTarget.model}</strong> ({deleteTarget.version}) de forma permanente? Si solo querés ocultarlo temporalmente del catálogo público, podés archivarlo.
          </p>
          <div style={{ display: "flex", gap: "12px" }}>
            <button type="button" className="button secondary" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="button danger-button"
              disabled={busy}
              onClick={() =>
                task(async () => {
                  await api(`admin/vehicles/${deleteTarget.id}`, {
                    method: "DELETE",
                    body: JSON.stringify({ _etag: deleteTarget._etag })
                  });
                  setDeleteTarget(null);
                }, "Vehículo eliminado permanentemente.")
              }
            >
              Eliminar vehículo <Trash2 size={16} />
            </button>
          </div>
        </Modal>
      )}

      {restore && (
        <Modal title="Vista previa de restauración" onClose={() => setRestore(null)}>
          <p className="modal-description">
            Respaldo de <strong>{restore.settings.name}</strong>
            {restore.exportedAt ? ` (${new Date(restore.exportedAt).toLocaleString("es-PY")})` : ""}.
          </p>
          {restoreDiff && (
            <div className="restore-preview-box">
              <div>
                <strong>Vehículos ({restore.vehicles.length} en el archivo):</strong>
                <p>
                  {restoreDiff.newVehicles} nuevos a agregar · {restoreDiff.updatedVehicles} existentes a actualizar ·{" "}
                  {restoreDiff.preservedVehicles} actuales que se conservarán sin cambios.
                </p>
              </div>
              <div>
                <strong>Consultas ({restore.inquiries.length} en el archivo):</strong>
                <p>
                  {restoreDiff.newInquiries} nuevas · {restoreDiff.updatedInquiries} existentes a actualizar.
                </p>
              </div>
              <div>
                <strong>Configuración del negocio:</strong>
                <p>
                  {restoreDiff.changedSettings.length > 0
                    ? `Se actualizarán: ${restoreDiff.changedSettings.join(", ")}.`
                    : "Sin diferencias en los datos principales del negocio."}
                </p>
              </div>
            </div>
          )}
          <p className="muted">
            Antes de aplicar el respaldo se guarda una instantánea completa. Si algún registro falla durante la escritura, se revierte toda la operación automáticamente.
          </p>
          <div style={{ display: "flex", gap: "12px", marginTop: "14px" }}>
            <button type="button" className="button secondary" onClick={() => setRestore(null)}>
              Cancelar
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                task(async () => {
                  await api("admin/restore", { method: "POST", body: JSON.stringify(restore) });
                  setRestore(null);
                }, "Respaldo combinado de forma atómica.")
              }
            >
              Confirmar y restaurar <Upload size={17} />
            </button>
          </div>
        </Modal>
      )}

      {erase && (
        <Modal title="Eliminar datos de la consulta" onClose={() => setErase(null)}>
          <p className="modal-description">
            Se eliminará la consulta de {erase.name} y sus copias internas. Los respaldos que descargaste se gestionan por separado.
          </p>
          <button
            className="button danger-button"
            disabled={busy}
            onClick={() =>
              task(async () => {
                await api(`admin/inquiries/${erase.id}`, {
                  method: "DELETE",
                  body: JSON.stringify({ _etag: erase._etag })
                });
                setErase(null);
              }, "Consulta y copias internas eliminadas.")
            }
          >
            Eliminar consulta <Trash2 size={16} />
          </button>
        </Modal>
      )}
    </div>
  );
}
