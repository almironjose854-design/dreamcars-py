import type { Inquiry, Vehicle } from "../../lib/types";
import { api } from "../components";
import type { Stored } from "./types";

export function slugifyVehicle(brand: string, model: string, version: string, existingIds: Set<string>): string {
  const base =
    `${brand}-${model}-${version}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 65) || `vehiculo-${Date.now().toString(36)}`;
  if (!existingIds.has(base)) return base;
  let counter = 2;
  while (existingIds.has(`${base}-${counter}`)) counter++;
  return `${base}-${counter}`;
}

export const emptyVehicle = (): Stored<Vehicle> => ({
  id: crypto.randomUUID(),
  brand: "",
  model: "",
  version: "",
  year: null,
  mileage: null,
  transmission: "A confirmar",
  fuel: "A confirmar",
  engine: "A confirmar",
  body: "Sedán",
  drive: "A confirmar",
  color: "",
  price: null,
  currency: "USD",
  description: "",
  features: [],
  images: [],
  status: "draft",
  availability: "consult",
  featured: false,
  sourceUrl: "",
  updatedAt: new Date().toISOString(),
  _etag: null
});

export async function optimizeImageToWebp(file: Blob): Promise<Blob> {
  if (typeof document === "undefined" || file.type === "image/gif") return file;
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 2048;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => {
          if (blob && blob.size < file.size) resolve(blob);
          else resolve(file);
        },
        "image/webp",
        0.86
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo de imagen."));
    reader.readAsDataURL(blob);
  });
}

export async function uploadImage(
  file: Blob,
  optimize = true,
  useCloudinary = true
): Promise<{ url: string; publicId: string }> {
  if (file.size > 10 * 1024 * 1024) throw new Error("Cada foto puede tener hasta 10 MB.");
  if (!["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"].includes(file.type)) {
    throw new Error("Usá imágenes JPG, PNG, WebP, AVIF o GIF.");
  }
  const processed = optimize ? await optimizeImageToWebp(file) : file;
  if (!useCloudinary) {
    const dataUrl = await blobToDataUrl(processed);
    return await api<{ url: string; publicId: string }>("admin/upload-local", {
      method: "POST",
      body: JSON.stringify({ dataUrl })
    });
  }
  const signed = await api<{
    apiKey: string;
    signature: string;
    cloudName: string;
    params: Record<string, string | number>;
  }>("admin/upload-signature", { method: "POST", body: "{}" });
  const form = new FormData();
  form.set("file", processed);
  form.set("api_key", signed.apiKey);
  form.set("signature", signed.signature);
  for (const [key, value] of Object.entries(signed.params)) form.set(key, String(value));
  const response = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`, {
    method: "POST",
    body: form
  });
  const image = (await response.json()) as { error?: { message?: string }; secure_url: string; public_id: string };
  if (!response.ok) throw new Error(image.error?.message || "Cloudinary no pudo subir la imagen.");
  return { url: image.secure_url, publicId: image.public_id };
}

export function exportInquiriesCsv(inquiries: Stored<Inquiry>[], vehicles: Stored<Vehicle>[]) {
  const escapeCsv = (val: string) => `"${String(val ?? "").replace(/"/g, '""')}"`;
  const headers = ["ID", "Fecha", "Nombre", "Teléfono", "Tipo", "Vehículo", "Estado", "Mensaje", "Notas internas"];
  const rows = inquiries.map(q => {
    const car = q.vehicleId ? vehicles.find(v => v.id === q.vehicleId) : undefined;
    const carName = car ? `${car.brand} ${car.model}` : q.vehicleId || "-";
    const typeLabel =
      q.type === "consignment"
        ? "Venta / Consignación"
        : q.type === "import"
          ? "Importación"
          : q.vehicleId
            ? "Consulta de vehículo"
            : "General";
    const statusLabel = q.status === "new" ? "Nueva" : q.status === "contacted" ? "Contactada" : "Cerrada";
    return [
      q.id,
      new Date(q.createdAt).toLocaleString("es-PY", { timeZone: "America/Asuncion" }),
      q.name,
      q.phone,
      typeLabel,
      carName,
      statusLabel,
      q.message,
      q.notes || ""
    ]
      .map(escapeCsv)
      .join(",");
  });
  const csvContent = "\uFEFF" + [headers.map(escapeCsv).join(","), ...rows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dreamcars-consultas-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
