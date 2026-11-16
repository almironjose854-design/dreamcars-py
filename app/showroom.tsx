"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Search,
  Heart,
  MapPin,
  MessageCircle,
  Plus,
  Check,
  X,
  Camera,
  Share2,
  Sparkles,
  Clock,
  SlidersHorizontal
} from "lucide-react";
import seedSettings from "../data/settings.json";
import type { Vehicle, Settings } from "../lib/types";
import {
  api,
  availability,
  buildVehicleChips,
  ContactForm,
  convertMoney,
  displayVehicleVersion,
  Footer,
  Header,
  FloatingContact,
  imageSrcSet,
  Instagram,
  Modal,
  normalizePriceUsd,
  optimizedImageUrl,
  REFERENCE_PYG_RATE,
  whatsapp
} from "./components";

function CarCard({
  vehicle: v,
  isFavorite,
  onToggleFavorite,
  isCompared,
  compareDisabled,
  onToggleCompare,
  onRequestSimilar,
  displayCurrency,
  exchangeRate
}: {
  vehicle: Vehicle;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  isCompared: boolean;
  compareDisabled: boolean;
  onToggleCompare: () => void;
  onRequestSimilar: () => void;
  displayCurrency: "ORIGINAL" | "USD" | "PYG";
  exchangeRate: number;
}) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const totalPhotos = v.images.length;
  const activeUrl = v.images[photoIdx]?.url || v.images[0]?.url;
  const specChips = useMemo(() => buildVehicleChips(v), [v]);
  const isSold = v.availability === "sold";

  return (
    <article
      className={isSold ? "car-card sold-card" : "car-card"}
      onMouseLeave={() => setPhotoIdx(0)}
      onMouseMove={e => {
        if (totalPhotos <= 1) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(0.999, (e.clientX - rect.left) / rect.width));
        setPhotoIdx(Math.floor(ratio * totalPhotos));
      }}
    >
      <div className="car-image">
        <Link href={`/vehiculos/${v.id}`}>
          <img
            src={optimizedImageUrl(activeUrl, 800)}
            srcSet={imageSrcSet(activeUrl, [480, 800, 1200])}
            sizes="(max-width: 640px) 92vw, (max-width: 900px) 46vw, 31vw"
            alt={`${v.brand} ${v.model} ${v.color}`}
            loading="lazy"
            decoding="async"
          />
        </Link>
        <span className={isSold ? "car-tag sold-tag" : v.featured ? "car-tag featured-tag" : "car-tag"}>
          {isSold ? "LEYENDA ENTREGADA" : v.featured ? "SELECCIÓN DREAM CARS" : v.body.toUpperCase()}
        </span>
        {totalPhotos > 1 && (
          <span className="car-photo-count" aria-label={`${totalPhotos} fotografías`}>
            <Camera size={12} /> {photoIdx + 1}/{totalPhotos}
          </span>
        )}
        <button
          className={isFavorite ? "heart-button selected" : "heart-button"}
          onClick={onToggleFavorite}
          aria-label={`${isFavorite ? "Quitar de" : "Agregar a"} guardados: ${v.brand} ${v.model}`}
          aria-pressed={isFavorite}
        >
          <Heart size={18} fill={isFavorite ? "currentColor" : "none"} />
        </button>
        <span className={`availability ${v.availability}`}>
          <span />
          {availability[v.availability]}
        </span>
        {totalPhotos > 1 && (
          <div className="car-scrub-dots" aria-hidden="true">
            {v.images.map((img, idx) => (
              <span key={img.url + idx} className={idx === photoIdx ? "active" : ""} />
            ))}
          </div>
        )}
      </div>
      <div className="car-info">
        <p className="car-brand">
          {v.brand}
          <span>{v.year ? `AÑO ${v.year}` : "COLECCIÓN JDM · PY"}</span>
        </p>
        <Link href={`/vehiculos/${v.id}`}>
          <h3>{v.model}</h3>
        </Link>
        <p className="car-version">{displayVehicleVersion(v)}</p>
        <div className="car-specs">
          {specChips.map(chip => (
            <span key={chip}>{chip}</span>
          ))}
        </div>
        <div className="car-bottom">
          {isSold ? (
            <button type="button" className="consult-price-pill sold-import-pill" onClick={onRequestSimilar}>
              <span className="consult-dot" /> ¿Buscás uno igual? Encargar
            </button>
          ) : v.price !== null ? (
            <strong>{convertMoney(v.price, v.currency, displayCurrency, exchangeRate)}</strong>
          ) : (
            <Link className="consult-price-pill" href={`/vehiculos/${v.id}`}>
              <span className="consult-dot" /> Consultar unidad
            </Link>
          )}
          <Link className="car-arrow-link" href={`/vehiculos/${v.id}`} aria-label={`Ver detalles de ${v.brand} ${v.model}`}>
            <span>Ver ficha</span> <ArrowUpRight size={19} />
          </Link>
        </div>
        <button
          className={isCompared ? "compare-button active" : "compare-button"}
          disabled={compareDisabled}
          onClick={onToggleCompare}
        >
          {isCompared ? <Check size={13} /> : <Plus size={13} />}{" "}
          {isCompared ? "Agregado para comparar" : "Comparar vehículo"}
        </button>
      </div>
    </article>
  );
}

export default function Showroom({ initialCatalog }: { initialCatalog?: { settings: Settings; vehicles: Vehicle[] } }) {
  const [settings, setSettings] = useState<Settings>(initialCatalog?.settings ?? seedSettings);
  const [cars, setCars] = useState<Vehicle[]>(initialCatalog?.vehicles ?? []);
  const [loading, setLoading] = useState(!initialCatalog);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [body, setBody] = useState("");
  const [availFilter, setAvailFilter] = useState("");
  const [transFilter, setTransFilter] = useState("");
  const [sort, setSort] = useState("featured");
  const [displayCurrency, setDisplayCurrency] = useState<"ORIGINAL" | "USD" | "PYG">("ORIGINAL");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [compare, setCompare] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [highlightDiff, setHighlightDiff] = useState(true);
  const [consignment, setConsignment] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [importTargetCar, setImportTargetCar] = useState("");
  const [copiedFilters, setCopiedFilters] = useState(false);
  const [urlHydrated, setUrlHydrated] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Interactive Hero Showcase
  const [heroIdx, setHeroIdx] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    api<{ settings: Settings; vehicles: Vehicle[] }>("catalog")
      .then(d => {
        setSettings(d.settings);
        setCars(d.vehicles);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (!initialCatalog) load();
      try {
        const saved = JSON.parse(localStorage.getItem("dreamcars-favorites") || "[]");
        if (Array.isArray(saved)) setFavorites(saved.filter((x): x is string => typeof x === "string"));
      } catch {}
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get("q")) setQuery(params.get("q")!);
        if (params.get("marca")) setBrand(params.get("marca")!);
        if (params.get("carroceria")) setBody(params.get("carroceria")!);
        if (params.get("disponibilidad")) setAvailFilter(params.get("disponibilidad")!);
        if (params.get("transmision")) setTransFilter(params.get("transmision")!);
        if (params.get("orden")) setSort(params.get("orden")!);
        if (params.get("favoritos") === "1") setFavoriteOnly(true);
        const mon = params.get("moneda");
        if (mon === "USD" || mon === "PYG") setDisplayCurrency(mon);
      } catch {}
      setUrlHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [initialCatalog]);

  useEffect(() => {
    if (!urlHydrated) return;
    try {
      const url = new URL(window.location.href);
      const entries: [string, string][] = [
        ["q", query],
        ["marca", brand],
        ["carroceria", body],
        ["disponibilidad", availFilter],
        ["transmision", transFilter],
        ["orden", sort === "featured" ? "" : sort],
        ["favoritos", favoriteOnly ? "1" : ""],
        ["moneda", displayCurrency === "ORIGINAL" ? "" : displayCurrency]
      ];
      for (const [k, val] of entries) {
        if (val) url.searchParams.set(k, val);
        else url.searchParams.delete(k);
      }
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch {}
  }, [urlHydrated, query, brand, body, availFilter, transFilter, sort, favoriteOnly, displayCurrency]);

  const heroVehicles = useMemo(() => {
    const featuredList = cars.filter(v => v.featured);
    return featuredList.length > 0 ? featuredList : cars.slice(0, 3);
  }, [cars]);

  useEffect(() => {
    if (heroPaused || heroVehicles.length <= 1) return;
    const timer = setInterval(() => {
      setHeroIdx(i => (i + 1) % heroVehicles.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [heroPaused, heroVehicles.length]);

  const favorite = (id: string) =>
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      try {
        localStorage.setItem("dreamcars-favorites", JSON.stringify(next));
      } catch {}
      return next;
    });

  const brandsWithCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cars) counts.set(c.brand, (counts.get(c.brand) || 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cars]);

  const transmissions = useMemo(
    () => [...new Set(cars.map(v => v.transmission).filter(t => t && t !== "A confirmar"))].sort(),
    [cars]
  );

  const secondaryFilterCount = [brand, body, availFilter, transFilter, favoriteOnly ? "1" : ""].filter(Boolean).length;
  const hasActiveFilters = Boolean(query || secondaryFilterCount > 0);

  const clearAllFilters = () => {
    setQuery("");
    setBrand("");
    setBody("");
    setAvailFilter("");
    setTransFilter("");
    setFavoriteOnly(false);
  };

  const rate = settings.exchangeRate || REFERENCE_PYG_RATE;

  const filtered = useMemo(
    () =>
      cars
        .filter(
          v =>
            (!query ||
              `${v.brand} ${v.model} ${v.version} ${v.color} ${v.year || ""}`
                .toLowerCase()
                .includes(query.toLowerCase())) &&
            (!brand || v.brand === brand) &&
            (!body || v.body === body) &&
            (!availFilter || v.availability === availFilter) &&
            (!transFilter || v.transmission === transFilter) &&
            (!favoriteOnly || favorites.includes(v.id))
        )
        .sort((a, b) => {
          const pa = normalizePriceUsd(a.price, a.currency, rate);
          const pb = normalizePriceUsd(b.price, b.currency, rate);
          return sort === "price-up"
            ? (pa ?? Infinity) - (pb ?? Infinity)
            : sort === "price-down"
              ? (pb ?? -1) - (pa ?? -1)
              : sort === "recent"
                ? b.updatedAt.localeCompare(a.updatedAt)
                : Number(b.featured) - Number(a.featured);
        }),
    [cars, query, brand, body, availFilter, transFilter, sort, favoriteOnly, favorites, rate]
  );

  const safeHeroIdx = heroVehicles.length > 0 ? heroIdx % heroVehicles.length : 0;
  const heroVehicle = heroVehicles[safeHeroIdx] || cars[0];
  const heroImageSrc = heroVehicle?.images[0]?.url || settings.heroImage;
  const comparedCars = useMemo(() => cars.filter(v => compare.includes(v.id)), [cars, compare]);

  const comparisonRows: [string, (v: Vehicle) => string][] = [
    ["Precio", v => convertMoney(v.price, v.currency, displayCurrency, rate)],
    ["Año", v => String(v.year || "A confirmar")],
    ["Kilometraje", v => (v.mileage !== null ? `${v.mileage.toLocaleString("es-PY")} km` : "A confirmar")],
    ["Carrocería", v => v.body || "A confirmar"],
    ["Motor", v => v.engine || "A confirmar"],
    ["Transmisión", v => v.transmission || "A confirmar"],
    ["Tracción", v => v.drive || "A confirmar"],
    ["Combustible", v => v.fuel || "A confirmar"],
    ["Color", v => v.color || "A confirmar"],
    ["Estado", v => availability[v.availability]]
  ];

  return (
    <>
      <Header settings={settings} />
      <main>
        <section className="garage-hero" aria-labelledby="hero-title">
          <div className="garage-intro">
            <p className="eyebrow">
              <span className="garage-mark" /> LUQUE, PARAGUAY <span className="intro-year">EST. 2012</span>
            </p>
            <p className="hero-pretitle">NO SOLO VENDEMOS AUTOS.</p>
            <h1 id="hero-title">
              PRESERVAMOS<br />
              <em>LEYENDAS.</em>
            </h1>
            <p className="garage-description">
              El carácter de un japonés. La emoción de un deportivo.<br />
              Ese auto que entendés sin decir una palabra.
            </p>
            <div className="garage-actions">
              <a className="button" href="#coleccion">
                Encontrá tu próxima leyenda <ArrowUpRight size={19} />
              </a>
              <a className="text-link" href="#nosotros">
                Entrá al garage <ArrowRight size={16} />
              </a>
            </div>
            <div className="garage-signature">
              <span className="signature-rule" />
              <span>
                AUTOS CON HISTORIA.<br />
                <strong>PASIÓN QUE SE COMPARTE.</strong>
              </span>
            </div>
          </div>
          <div
            className="garage-photo"
            onMouseEnter={() => setHeroPaused(true)}
            onMouseLeave={() => setHeroPaused(false)}
          >
            <img
              key={heroImageSrc}
              src={optimizedImageUrl(heroImageSrc, 1440)}
              srcSet={imageSrcSet(heroImageSrc, [640, 1080, 1600])}
              sizes="(max-width: 640px) 92vw, 56vw"
              alt={
                heroVehicle
                  ? `${heroVehicle.brand} ${heroVehicle.model} en el garage Dream Cars PY`
                  : "El garage Dream Cars PY en Luque"
              }
              fetchPriority="high"
              decoding="async"
            />
            <div className="garage-photo-shade" />
            <div className="garage-photo-top">
              <span>DESDE NUESTRO GARAGE</span>
              <span>LUQUE / PY</span>
            </div>
            <div className="garage-photo-label">
              <div>
                <span>
                  {heroVehicle
                    ? displayVehicleVersion(heroVehicle).toUpperCase()
                    : "CARÁCTER QUE SE RECONOCE."}
                </span>
                <h2>{heroVehicle ? `${heroVehicle.brand} ${heroVehicle.model}` : settings.name}</h2>
              </div>
              <Link
                href={heroVehicle ? `/vehiculos/${heroVehicle.id}` : "/#coleccion"}
                className="round-link"
                aria-label={heroVehicle ? `Ver ${heroVehicle.brand} ${heroVehicle.model}` : "Ver colección"}
              >
                <ArrowUpRight />
              </Link>
            </div>
            {heroVehicles.length > 1 && (
              <div className="hero-selector" role="tablist" aria-label="Vehículos destacados en portada">
                {heroVehicles.map((hv, idx) => (
                  <button
                    key={hv.id}
                    type="button"
                    role="tab"
                    aria-selected={idx === safeHeroIdx}
                    className={idx === safeHeroIdx ? "hero-tab active" : "hero-tab"}
                    onClick={() => setHeroIdx(idx)}
                  >
                    <small>0{idx + 1}</small>
                    <span>
                      {hv.brand} {hv.model}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <span className="garage-photo-credit">DREAM CARS PY · FOTOGRAFÍA ORIGINAL</span>
          </div>
        </section>

        <div className="garage-strip" aria-label="Cultura japonesa y pasión por los autos">
          <span className="strip-label">
            JAPÓN EN EL ADN.<br />
            <strong>LUQUE EN EL MAPA.</strong>
          </span>
          {brandsWithCount.map(([b]) => (
            <button
              key={b}
              type="button"
              className={brand === b ? "marque active" : "marque"}
              onClick={() => {
                setBrand(brand === b ? "" : b);
                document.getElementById("coleccion")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              {b.toUpperCase()}
            </button>
          ))}
          <a href="#coleccion" aria-label="Descubrir la colección">
            SEGUÍ EXPLORANDO <ArrowDown size={17} />
          </a>
        </div>

        <section className="collection section-pad" id="coleccion">
          <div className="section-top">
            <div>
              <p className="eyebrow">
                <span className="lime">01 /</span> LA COLECCIÓN
              </p>
              <h2>
                Elegidos por lo que<br />
                <em>te hacen sentir.</em>
              </h2>
            </div>
            <p>
              Deportivos japoneses y autos con carácter.<br />
              Explorá las historias que pasan por el garage.
            </p>
          </div>

          <div className="brand-pills-bar" role="group" aria-label="Filtro rápido por marca">
            <button
              type="button"
              className={!brand ? "brand-pill active" : "brand-pill"}
              onClick={() => setBrand("")}
            >
              <span>Todos</span>
              <small>{cars.length}</small>
            </button>
            {brandsWithCount.map(([b, count]) => (
              <button
                key={b}
                type="button"
                className={brand === b ? "brand-pill active" : "brand-pill"}
                onClick={() => setBrand(brand === b ? "" : b)}
              >
                <span>{b}</span>
                <small>{count}</small>
              </button>
            ))}
          </div>

          <div className={mobileFiltersOpen ? "catalog-tools filters-open" : "catalog-tools"}>
            <label className="search-box">
              <Search size={18} />
              <span className="sr-only">Buscar vehículo</span>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscá por marca, modelo, versión o color…"
              />
              {query && (
                <button
                  type="button"
                  className="clear-search"
                  aria-label="Limpiar búsqueda"
                  onClick={() => setQuery("")}
                >
                  <X size={15} />
                </button>
              )}
            </label>

            <button
              type="button"
              className={mobileFiltersOpen || secondaryFilterCount > 0 ? "mobile-filter-toggle active" : "mobile-filter-toggle"}
              aria-expanded={mobileFiltersOpen}
              onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
            >
              <SlidersHorizontal size={15} />
              <span>Filtros</span>
              {secondaryFilterCount > 0 && <small>{secondaryFilterCount}</small>}
            </button>

            <label className="filter-select">
              <span>Marca</span>
              <select aria-label="Filtrar por marca" value={brand} onChange={e => setBrand(e.target.value)}>
                <option value="">Todas las marcas</option>
                {brandsWithCount.map(([b]) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            <label className="filter-select">
              <span>Carrocería</span>
              <select aria-label="Filtrar por carrocería" value={body} onChange={e => setBody(e.target.value)}>
                <option value="">Todas las carrocerías</option>
                {[...new Set(cars.map(v => v.body))].sort().map(b => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            <label className="filter-select">
              <span>Disponibilidad</span>
              <select
                aria-label="Filtrar por disponibilidad"
                value={availFilter}
                onChange={e => setAvailFilter(e.target.value)}
              >
                <option value="">Todos los estados</option>
                {Object.entries(availability).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {transmissions.length > 0 && (
              <label className="filter-select">
                <span>Transmisión</span>
                <select
                  aria-label="Filtrar por transmisión"
                  value={transFilter}
                  onChange={e => setTransFilter(e.target.value)}
                >
                  <option value="">Todas</option>
                  {transmissions.map(t => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            )}
            <button
              className={favoriteOnly ? "favorite-filter active" : "favorite-filter"}
              aria-label="Ver vehículos guardados"
              aria-pressed={favoriteOnly}
              onClick={() => setFavoriteOnly(!favoriteOnly)}
            >
              <Heart size={17} fill={favoriteOnly ? "currentColor" : "none"} />
              <span>Guardados</span>
              <small>{favorites.length}</small>
            </button>
          </div>

          <div className="catalog-meta">
            <div className="catalog-meta-left">
              <p>
                {loading
                  ? "Cargando colección…"
                  : `${filtered.length} ${filtered.length === 1 ? "vehículo" : "vehículos"} para descubrir`}
              </p>
              {hasActiveFilters && (
                <>
                  <button type="button" className="text-button" onClick={clearAllFilters}>
                    <X size={13} /> Limpiar filtros
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(window.location.href);
                        setCopiedFilters(true);
                        setTimeout(() => setCopiedFilters(false), 2500);
                      } catch {}
                    }}
                  >
                    <Share2 size={13} /> {copiedFilters ? "Enlace copiado" : "Compartir búsqueda"}
                  </button>
                </>
              )}
            </div>
            <div className="catalog-meta-right">
              <label>
                Moneda
                <select
                  aria-label="Moneda de visualización"
                  value={displayCurrency}
                  onChange={e => setDisplayCurrency(e.target.value as "ORIGINAL" | "USD" | "PYG")}
                >
                  <option value="ORIGINAL">Original</option>
                  <option value="USD">USD ($)</option>
                  <option value="PYG">PYG (₲ ref.)</option>
                </select>
              </label>
              <label>
                Ordenar por{" "}
                <select aria-label="Ordenar vehículos" value={sort} onChange={e => setSort(e.target.value)}>
                  <option value="featured">Destacados</option>
                  <option value="recent">Más recientes</option>
                  <option value="price-up">Menor precio</option>
                  <option value="price-down">Mayor precio</option>
                </select>
              </label>
            </div>
          </div>

          {error ? (
            <div className="empty-state" role="alert">
              <h3>No pudimos cargar la colección.</h3>
              <p>{error}</p>
              <button className="button" onClick={load}>
                Volver a intentar
              </button>
            </div>
          ) : loading ? (
            <div className="car-grid">
              {[0, 1, 2].map(i => (
                <div className="car-skeleton" key={i}>
                  <div />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <Search size={32} />
              <h3>Tu próximo auto todavía no apareció.</h3>
              <p>Probá con otros filtros o contanos qué estás buscando.</p>
              <button className="button secondary" onClick={clearAllFilters}>
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div className="car-grid">
              {filtered.map(v => (
                <CarCard
                  key={v.id}
                  vehicle={v}
                  isFavorite={favorites.includes(v.id)}
                  onToggleFavorite={() => favorite(v.id)}
                  isCompared={compare.includes(v.id)}
                  compareDisabled={compare.length === 3 && !compare.includes(v.id)}
                  onToggleCompare={() =>
                    setCompare(prev => (prev.includes(v.id) ? prev.filter(id => id !== v.id) : [...prev, v.id]))
                  }
                  onRequestSimilar={() => {
                    setImportTargetCar(`${v.brand} ${v.model} (${displayVehicleVersion(v)})`);
                    setImportModal(true);
                  }}
                  displayCurrency={displayCurrency}
                  exchangeRate={rate}
                />
              ))}
            </div>
          )}

          <p className="catalog-notice">
            Fotografías de nuestro Instagram. Consultá precio, ficha técnica y disponibilidad actual con el equipo.
          </p>
          <div className="collection-help">
            <span>¿Tenés un modelo en mente?</span>
            <a
              className="text-link"
              href={whatsapp(
                settings.whatsapp,
                "¡Hola! Estoy buscando un vehículo en particular. ¿Me ayudan a encontrarlo?"
              )}
              target="_blank"
              rel="noreferrer"
            >
              Ayudamos a encontrarlo <ArrowUpRight size={17} />
            </a>
          </div>
        </section>

        <section className="garage-story section-pad" id="nosotros">
          <div className="garage-story-copy">
            <p className="eyebrow">
              <span className="lime">02 /</span> MUCHO MÁS QUE UN LOCAL
            </p>
            <h2>
              Acá se habla<br />
              el mismo<br /> <em>idioma.</em>
            </h2>
            <p>{settings.about}</p>
            <blockquote>“{settings.tagline}”</blockquote>
            <a className="text-link" href={settings.instagram} target="_blank" rel="noreferrer">
              Conocé el día a día del garage <Instagram size={17} />
              <ArrowUpRight size={17} />
            </a>
          </div>
          <div className="garage-story-gallery">
            <figure className="story-photo-main">
              <img
                src="/media/showroom.jpg"
                alt="Los Subaru de Dream Cars frente al garage, al atardecer en Luque"
                loading="lazy"
                decoding="async"
              />
              <figcaption>
                <span>01 / EL LUGAR</span>
                <strong>Luque, Paraguay.</strong>
              </figcaption>
            </figure>
            <figure className="story-photo-detail">
              <p className="story-note">
                PARA LOS QUE<br />
                SE DAN VUELTA<br />
                <em>A MIRAR.</em>
              </p>
              <img
                src="/media/collection.jpg"
                alt="Mitsubishi Lancer Evolution y deportivos de la colección en el patio del local"
                loading="lazy"
                decoding="async"
              />
              <figcaption>
                <span>02 / LA PASIÓN</span>
                <strong>Íconos que nos unen.</strong>
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="services section-pad" id="servicios">
          <div className="section-top">
            <div>
              <p className="eyebrow">
                <span className="lime">03 /</span> DE ENTUSIASTA A ENTUSIASTA
              </p>
              <h2>
                El próximo capítulo<br />
                <em>empieza acá.</em>
              </h2>
            </div>
            <p>
              Tu auto tiene una historia.<br />
              Nosotros te ayudamos a continuarla.
            </p>
          </div>
          <div className="service-grid">
            <article>
              <span className="service-number">01</span>
              <h3>Comprá tu leyenda.</h3>
              <p>Explorá la selección, conocé los detalles y coordiná una visita para ver ese auto que te mueve.</p>
              <a href="#coleccion">
                Ver la colección <ArrowUpRight size={18} />
              </a>
            </article>
            <article>
              <span className="service-number">02</span>
              <h3>Dale otra historia.</h3>
              <p>
                ¿Querés vender tu auto o entregarlo como parte de pago? Conversá con el equipo sobre compra directa o consignación.
              </p>
              <button onClick={() => setConsignment(true)}>
                Ofrecer mi vehículo <ArrowUpRight size={18} />
              </button>
            </article>
            <article>
              <span className="service-number">03</span>
              <h3>Sin fronteras.</h3>
              <p>Importación de unidades seleccionadas de Japón, EE.UU. o Europa y exportación para coleccionistas.</p>
              <button
                onClick={() => {
                  setImportTargetCar("");
                  setImportModal(true);
                }}
              >
                Encargar importación <ArrowUpRight size={18} />
              </button>
            </article>
          </div>
        </section>

        <section className="instagram-band">
          <div>
            <Instagram size={24} />
            <span>EL GARAGE NUNCA SE QUEDA QUIETO.</span>
          </div>
          <a href={settings.instagram} target="_blank" rel="noreferrer">
            @dreamcars_py <ArrowUpRight size={28} />
          </a>
        </section>

        <section className="contact-section section-pad" id="contacto">
          <div className="contact-copy">
            <p className="eyebrow">
              <span className="lime">04 /</span> NOS VEMOS EN EL GARAGE
            </p>
            <h2>
              Las buenas historias<br />
              empiezan con un<br />
              <em>“hola”.</em>
            </h2>

            <div className="showroom-location-card">
              <div className="location-card-photo">
                <img src="/media/showroom.jpg" alt="Showroom Dream Cars PY en Luque" loading="lazy" decoding="async" />
                <span className="location-badge">SHOWROOM · LUQUE</span>
              </div>
              <div className="location-card-body">
                <div className="contact-details">
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${settings.name} ${settings.address} ${settings.city}`
                    )}`}
                  >
                    <MapPin size={18} />
                    <div>
                      <strong>{settings.address}</strong>
                      <span>
                        {settings.city} · Abrir en Google Maps <ArrowUpRight size={12} />
                      </span>
                    </div>
                  </a>
                  <a href={whatsapp(settings.whatsapp)} target="_blank" rel="noreferrer">
                    <MessageCircle size={18} />
                    <div>
                      <strong>+{settings.whatsapp}</strong>
                      <span>
                        Atención directa por WhatsApp <ArrowUpRight size={12} />
                      </span>
                    </div>
                  </a>
                  <div className="location-hours">
                    <Clock size={18} />
                    <div>
                      <strong>Visitas al garage</strong>
                      <span>{settings.hours}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="contact-form-panel">
            <h3>Contanos tu próximo sueño.</h3>
            <p>Dejanos tus datos y conversemos.</p>
            <ContactForm />
          </div>
        </section>
      </main>
      <Footer settings={settings} />
      <FloatingContact settings={settings} />

      {compare.length > 0 && (
        <div className="compare-tray" role="region" aria-label="Comparador de vehículos">
          <div className="compare-tray-items">
            {comparedCars.map(v => (
              <div className="compare-pill" key={v.id}>
                <img src={optimizedImageUrl(v.images[0]?.url, 160)} alt="" decoding="async" />
                <span>
                  {v.brand} {v.model}
                </span>
                <button
                  type="button"
                  aria-label={`Quitar ${v.brand} ${v.model} de la comparación`}
                  onClick={() => setCompare(prev => prev.filter(id => id !== v.id))}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            {Array.from({ length: Math.max(0, 3 - comparedCars.length) }).map((_, idx) => (
              <div className="compare-pill empty" key={idx}>
                <span>Espacio libre</span>
              </div>
            ))}
          </div>
          <div className="compare-tray-actions">
            <span>
              <strong>{compare.length}/3</strong> seleccionados
            </span>
            <button className="button small" disabled={compare.length < 2} onClick={() => setShowCompare(true)}>
              Comparar <ArrowRight size={15} />
            </button>
            <button className="text-button" onClick={() => setCompare([])}>
              Limpiar
            </button>
          </div>
        </div>
      )}

      {showCompare && (
        <Modal title="Tus próximas leyendas, frente a frente." wide onClose={() => setShowCompare(false)}>
          <div className="compare-toolbar">
            <p className="modal-description">Comparando {comparedCars.length} vehículos de la colección.</p>
            <label className="check-label compare-diff-toggle">
              <input type="checkbox" checked={highlightDiff} onChange={e => setHighlightDiff(e.target.checked)} />
              <span>
                <Sparkles size={13} /> Resaltar diferencias
              </span>
            </label>
          </div>
          <div className="comparison-grid">
            {comparedCars.map(v => (
              <div key={v.id} className="comparison-col">
                <div className="comparison-photo-wrap">
                  <img src={optimizedImageUrl(v.images[0]?.url, 640)} alt={`${v.brand} ${v.model}`} decoding="async" />
                  {comparedCars.length > 2 && (
                    <button
                      type="button"
                      className="comparison-remove"
                      aria-label={`Quitar ${v.brand} ${v.model}`}
                      onClick={() => setCompare(prev => prev.filter(id => id !== v.id))}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <p className="eyebrow">{v.brand}</p>
                <h3>{v.model}</h3>
                <p className="comparison-version">{displayVehicleVersion(v)}</p>
                {comparisonRows.map(([label, getter]) => {
                  const value = getter(v);
                  const allValues = new Set(comparedCars.map(c => getter(c)));
                  const isDifferent = highlightDiff && comparedCars.length > 1 && allValues.size > 1;
                  return (
                    <p className={isDifferent ? "comparison-row diff" : "comparison-row"} key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </p>
                  );
                })}
                <Link className="button small" href={`/vehiculos/${v.id}`}>
                  Ver ficha <ArrowUpRight size={16} />
                </Link>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {consignment && (
        <Modal title="Tu auto merece su próximo capítulo." onClose={() => setConsignment(false)}>
          <p className="modal-description">
            Contanos marca, modelo, año y modalidad preferida (consignación, venta directa o entrega como parte de pago). El equipo te contactará para evaluar la unidad.
          </p>
          <ContactForm defaultType="consignment" />
        </Modal>
      )}

      {importModal && (
        <Modal
          title={importTargetCar ? `Importar unidad similar · ${importTargetCar}` : "Traemos tu próxima leyenda."}
          onClose={() => {
            setImportModal(false);
            setImportTargetCar("");
          }}
        >
          <p className="modal-description">
            Buscamos e importamos deportivos japoneses (JDM) y unidades especiales a pedido desde Japón, EE.UU. o Europa. Dejanos las especificaciones de tu proyecto o consultanos directamente por WhatsApp.
          </p>
          <ContactForm defaultType="import" vehicleName={importTargetCar || undefined} />
        </Modal>
      )}
    </>
  );
}
