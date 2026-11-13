import type { Metadata } from "next";
import "./globals.css";
import "./refinements.css";
import "./brand.css";

export const metadata: Metadata = {
  title: "Dream Cars PY — Preservamos leyendas",
  description: "Compra, venta, consignación e importación de vehículos con carácter. Conocé Dream Cars PY en Luque, Paraguay. Avda. Nanawa esquina Gabino Mendoza.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-PY">
      <body className="antialiased">{children}</body>
    </html>
  );
}
