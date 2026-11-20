import { Link } from "../../lib/nav-link";
import { formatPhone, whatsapp } from "../../lib/branding";
import { publicSettings, settings } from "../../lib/store";
import { Header, Footer } from "../components";

export const dynamic = "force-dynamic";

export default async function Page() {
  const config = await settings();
  const s = publicSettings(config.data);
  const waHref = whatsapp(s.whatsapp, "Hola Dream Cars PY, tengo una consulta sobre mis datos personales.");

  return (
    <div className="site-shell">
      <Header settings={s} />
      <main className="legal-page">
        <Link className="back-link" href="/">← Volver a {s.name}</Link>
        <p className="eyebrow lime">{s.name}</p>
        <h1>Tu privacidad.</h1>
        <p>
          Cuando completás un formulario, {s.name} recibe tu nombre, teléfono, mensaje y el vehículo de interés.
          Se utilizan para responder tu consulta y dar seguimiento comercial a esa solicitud.
        </p>
        <h2>Cómo se guardan los datos</h2>
        <p>
          Las consultas se almacenan en archivos JSON dentro del almacenamiento privado del sitio. El acceso al panel
          está reservado a la cuenta administradora. Las fotografías de vehículos que sube el equipo se alojan en
          almacenamiento propio o en Cloudinary. La configuración privada de esa integración se guarda cifrada.
        </p>
        <h2>Sesiones y protección del acceso</h2>
        <p>
          El panel usa usuario y contraseña. La contraseña se almacena mediante una derivación criptográfica con sal y
          secreto del servidor, nunca como texto. La sesión utiliza una cookie privada que dura doce horas o, si elegís
          mantener la sesión, siete días. Se guardan huellas técnicas para limitar intentos de acceso y consultas
          repetidas; no se usan para publicidad.
        </p>
        <h2>Servicios externos</h2>
        <p>
          Los enlaces de WhatsApp, Instagram y Google Maps abren servicios externos con sus propias políticas. Solo se
          envía un mensaje de WhatsApp si vos lo confirmás dentro de esa aplicación.
        </p>
        <h2>Guardados y contacto</h2>
        <p>
          Los favoritos se guardan únicamente en el almacenamiento local de tu navegador. Podés eliminarlos desde el
          catálogo o borrando los datos del sitio. Para solicitar acceso, corrección o eliminación de una consulta,
          escribí al WhatsApp comercial <a href={waHref} target="_blank" rel="noreferrer">{formatPhone(s.whatsapp)}</a>. El equipo
          gestiona los datos y sus respaldos según corresponda a tu solicitud.
        </p>
        <p className="muted">Actualizado: 13 de noviembre de 2026.</p>
      </main>
      <Footer settings={s} />
    </div>
  );
}
