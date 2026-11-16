import Showroom from "./showroom";
import { publicSettings, settings, vehicles } from "../lib/store";
import { stripEtag } from "../lib/api/http";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [config, inventory] = await Promise.all([settings(), vehicles()]);
  const pubConfig = publicSettings(config.data);
  const published = inventory.filter(v => v.status === "published").map(stripEtag);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    name: pubConfig.name,
    description: pubConfig.about,
    slogan: pubConfig.tagline,
    foundingDate: "2012",
    telephone: `+${pubConfig.whatsapp}`,
    address: {
      "@type": "PostalAddress",
      streetAddress: pubConfig.address,
      addressLocality: pubConfig.city,
      addressCountry: "PY"
    },
    sameAs: [pubConfig.instagram].filter(Boolean)
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Showroom
        initialCatalog={{
          settings: pubConfig,
          vehicles: published
        }}
      />
    </>
  );
}
