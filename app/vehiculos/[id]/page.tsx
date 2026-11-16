import type { Metadata } from "next";
import VehicleDetail from "../../vehicle-detail";
import { publicSettings, settings, vehicles } from "../../../lib/store";
import { stripEtag } from "../../../lib/api/http";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const v = (await vehicles()).find(v => v.id === id && v.status === "published");
  const priceTag = v
    ? v.price !== null
      ? `${v.currency === "PYG" ? "₲" : "USD"} ${v.price.toLocaleString("es-PY")}`
      : v.availability === "sold"
        ? "Leyenda Entregada"
        : "Consultar unidad"
    : "";
  const title = v
    ? `${v.brand} ${v.model}${v.version ? ` (${v.version})` : ""}${v.year ? ` · ${v.year}` : ""} — ${priceTag} | Dream Cars PY`
    : "Vehículo — Dream Cars PY";
  const specsLine = v
    ? [
        v.engine && v.engine !== "A confirmar" ? v.engine : "",
        v.transmission && v.transmission !== "A confirmar" ? v.transmission : "",
        v.drive && v.drive !== "A confirmar" ? v.drive : "",
        v.color ? `Color ${v.color}` : ""
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const description = v
    ? `${specsLine ? `${specsLine}. ` : ""}${v.description || "Conocé este vehículo en Dream Cars PY y consultá todos sus detalles."}`
    : "Conocé este vehículo en Dream Cars PY y consultá todos sus detalles.";
  const cover = v?.images[0]?.url;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "es_PY",
      siteName: "Dream Cars PY · Since 2012",
      ...(cover
        ? {
            images: [
              {
                url: cover,
                width: 1200,
                height: 630,
                alt: `${v.brand} ${v.model} en Dream Cars PY`
              }
            ]
          }
        : {})
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(cover ? { images: [cover] } : {})
    }
  };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [config, inventory] = await Promise.all([settings(), vehicles()]);
  const pubConfig = publicSettings(config.data);
  const published = inventory.filter(v => v.status === "published").map(stripEtag);
  const current = published.find(v => v.id === id) || null;
  const related = current
    ? published
        .filter(v => v.id !== current.id)
        .sort((a, b) => {
          const scoreA =
            (a.brand === current.brand ? 2 : 0) +
            (a.body === current.body ? 1 : 0) +
            (a.featured ? 0.5 : 0);
          const scoreB =
            (b.brand === current.brand ? 2 : 0) +
            (b.body === current.body ? 1 : 0) +
            (b.featured ? 0.5 : 0);
          return scoreB - scoreA;
        })
        .slice(0, 3)
    : published.slice(0, 3);

  const jsonLd = current
    ? {
        "@context": "https://schema.org",
        "@type": "Car",
        name: `${current.brand} ${current.model} ${current.version}`.trim(),
        brand: { "@type": "Brand", name: current.brand },
        model: current.model,
        vehicleConfiguration: current.version,
        bodyType: current.body,
        color: current.color,
        vehicleTransmission: current.transmission,
        fuelType: current.fuel,
        driveWheelConfiguration: current.drive,
        ...(current.year ? { vehicleModelDate: String(current.year) } : {}),
        ...(current.mileage !== null
          ? {
              mileageFromOdometer: {
                "@type": "QuantitativeValue",
                value: current.mileage,
                unitCode: "KMT"
              }
            }
          : {}),
        description: current.description,
        image: current.images.map(i => i.url),
        ...(current.price !== null
          ? {
              offers: {
                "@type": "Offer",
                price: current.price,
                priceCurrency: current.currency,
                availability:
                  current.availability === "sold"
                    ? "https://schema.org/SoldOut"
                    : "https://schema.org/InStock",
                seller: {
                  "@type": "AutoDealer",
                  name: config.data.name
                }
              }
            }
          : {})
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <VehicleDetail
        id={id}
        initialSettings={pubConfig}
        initialVehicle={current}
        initialRelated={related}
      />
    </>
  );
}
