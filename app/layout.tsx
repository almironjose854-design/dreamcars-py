import type { Metadata,Viewport } from "next";
import {SITE_URL} from "../lib/site-url";
import "./globals.css";
import "./brand.css";
import "./accessibility.css";

export const metadata: Metadata = {
  metadataBase:new URL(SITE_URL),
  title:{
    default:"Dream Cars PY — Preservamos leyendas",
    template:"%s — Dream Cars PY"
  },
  description: "Compra, venta, consignación e importación de vehículos con carácter. Conocé Dream Cars PY en Luque, Paraguay. Avda. Nanawa esquina Gabino Mendoza.",
  alternates:{canonical:"/"},
  openGraph:{
    type:"website",
    locale:"es_PY",
    siteName:"Dream Cars PY",
    title:"Dream Cars PY — Preservamos leyendas",
    description:"Vehículos con carácter, íconos japoneses y deportivos seleccionados en Luque, Paraguay.",
    url:"/",
    images:[{url:"/media/og-logo.jpg",width:1200,height:630,alt:"Dream Cars PY — Since 2012"}]
  },
  twitter:{
    card:"summary_large_image",
    title:"Dream Cars PY — Preservamos leyendas",
    description:"Compra, venta, consignación e importación de vehículos con carácter.",
    images:["/media/og-logo.jpg"]
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};
export const viewport:Viewport={themeColor:"#111111",colorScheme:"dark"};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-PY">
      <body className="antialiased">
        <a className="skip-link" href="#main-content">Saltar al contenido</a>
        <div id="main-content">{children}</div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{__html:JSON.stringify({
            "@context":"https://schema.org",
            "@type":"AutoDealer",
            name:"Dream Cars PY",
            url:SITE_URL,
            logo:`${SITE_URL}/media/dreamcars-logo-hd.png`,
            image:`${SITE_URL}/media/og-logo.jpg`,
            telephone:"+595981304731",
            slogan:"No solo vendemos autos, preservamos leyendas.",
            address:{
              "@type":"PostalAddress",
              streetAddress:"Avda. Nanawa esquina Gabino Mendoza",
              addressLocality:"Luque",
              addressCountry:"PY"
            },
            sameAs:["https://www.instagram.com/dreamcars_py/"]
          }).replace(/</g,"\\u003c")}}
        />
      </body>
    </html>
  );
}
