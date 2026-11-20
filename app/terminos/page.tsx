import { Link } from "../../lib/nav-link";
import { whatsapp } from "../../lib/branding";
import { publicSettings, settings } from "../../lib/store";
import { Header, Footer } from "../components";

export const dynamic = "force-dynamic";

export default async function Page() {
  const config = await settings();
  const s = publicSettings(config.data);
  const waHref = whatsapp(s.whatsapp, "Hola Dream Cars PY, quiero hablar con el equipo.");

  return (
    <div className="site-shell">
      <Header settings={s} />
      <main className="legal-page">
        <Link className="back-link" href="/">← Volver a {s.name}</Link>
        <p className="eyebrow lime">{s.name}</p>
        <h1>Antes de tu próxima leyenda.</h1>
        <p>
          El catálogo permite conocer vehículos presentados por {s.name} y contactar al equipo. Un formulario o
          una consulta por WhatsApp no constituye una reserva ni una compra.
        </p>
        <h2>Datos del vehículo</h2>
        <p>
          Precio, disponibilidad, versión, año, kilometraje, equipamiento e historial se confirman directamente con el
          negocio. Los campos indicados como “a confirmar” no son especificaciones verificadas. Las fotos iniciales
          provienen del Instagram oficial y pueden mostrar vehículos ya vendidos.
        </p>
        <h2>Visitas y propuestas</h2>
        <p>
          Coordiná una visita antes de acercarte a {s.address}, {s.city}. Las propuestas de compra, venta, consignación,
          importación o exportación se evalúan individualmente con el equipo.
        </p>
        <h2>Operaciones</h2>
        <p>
          Las condiciones, documentación, inspección y forma de pago se acuerdan directamente con {s.name} antes
          de concretar una operación. Este sitio no recibe pagos ni procesa financiación.
        </p>
        <a className="button" href={waHref} target="_blank" rel="noreferrer">
          Hablar con el equipo ↗
        </a>
      </main>
      <Footer settings={s} />
    </div>
  );
}
