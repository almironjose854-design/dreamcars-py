"use client";
import { useState } from "react";
import { FileCheck2, Printer } from "lucide-react";
import type { Settings, Vehicle } from "../../lib/types";
import { displayVehicleVersion, formatPhone, Modal, money } from "../components";

export function ContractSheetModal({
  vehicle,
  settings,
  onClose
}: {
  vehicle: Vehicle;
  settings: Settings;
  onClose: () => void;
}) {
  const [docType, setDocType] = useState<"reservation" | "consignment">("reservation");
  const [clientName, setClientName] = useState("");
  const [clientDoc, setClientDoc] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [agreedPrice, setAgreedPrice] = useState(
    vehicle.price !== null ? money(vehicle.price, vehicle.currency) : "USD "
  );
  const [depositAmount, setDepositAmount] = useState("USD 1.000");
  const [validityDays, setValidityDays] = useState("7");
  const [commissionTerms, setCommissionTerms] = useState("Consignación en showroom · Comisión a convenir");
  const [docsReceived, setDocsReceived] = useState("Cédula verde, Habilitación al día y 1 juego de llaves");
  const [notes, setNotes] = useState(
    "La unidad se recibe/reserva en el estado visto y verificado presencialmente en el showroom de Luque."
  );

  const today = new Date().toLocaleDateString("es-PY", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  const specs: [string, string][] = [
    ["Marca · Modelo", `${vehicle.brand} ${vehicle.model}`],
    ["Versión", displayVehicleVersion(vehicle)],
    ["Año", String(vehicle.year || "A confirmar")],
    ["Kilometraje", vehicle.mileage !== null ? `${vehicle.mileage.toLocaleString("es-PY")} km` : "A confirmar"],
    ["Carrocería / Color", `${vehicle.body || "—"} · ${vehicle.color || "—"}`],
    ["Motor / Transmisión", `${vehicle.engine || "A confirmar"} · ${vehicle.transmission || "A confirmar"}`]
  ];

  return (
    <Modal
      title={`Documento A4 · ${vehicle.brand} ${vehicle.model}`}
      wide
      onClose={onClose}
    >
      <div className="contract-controls-panel">
        <div className="contract-mode-tabs" role="tablist" aria-label="Tipo de documento">
          <button
            type="button"
            role="tab"
            aria-selected={docType === "reservation"}
            className={docType === "reservation" ? "button small" : "button small secondary"}
            onClick={() => setDocType("reservation")}
          >
            <FileCheck2 size={15} /> Comprobante de Reserva / Seña
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={docType === "consignment"}
            className={docType === "consignment" ? "button small" : "button small secondary"}
            onClick={() => setDocType("consignment")}
          >
            <FileCheck2 size={15} /> Acta de Recepción en Consignación
          </button>
          <button type="button" className="button small contract-print-btn" onClick={() => window.print()}>
            <Printer size={15} /> Imprimir A4 / Guardar PDF
          </button>
        </div>

        <div className="form-three contract-inputs-grid">
          <label>
            {docType === "reservation" ? "Nombre del comprador / cliente" : "Nombre del propietario / consignante"}
            <input
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="Nombre y apellido completo"
            />
          </label>
          <label>
            C.I. / RUC
            <input
              value={clientDoc}
              onChange={e => setClientDoc(e.target.value)}
              placeholder="Ej. 4.500.000-1"
            />
          </label>
          <label>
            Teléfono / WhatsApp
            <input
              value={clientPhone}
              onChange={e => setClientPhone(e.target.value)}
              placeholder="+595 981 000 000"
            />
          </label>
          <label>
            {docType === "reservation" ? "Precio total acordado" : "Valor de venta pactado"}
            <input value={agreedPrice} onChange={e => setAgreedPrice(e.target.value)} />
          </label>
          {docType === "reservation" ? (
            <>
              <label>
                Monto entregado en concepto de seña
                <input value={depositAmount} onChange={e => setDepositAmount(e.target.value)} />
              </label>
              <label>
                Validez de la reserva (días corridos)
                <input type="number" min={1} max={90} value={validityDays} onChange={e => setValidityDays(e.target.value)} />
              </label>
            </>
          ) : (
            <>
              <label>
                Modalidad y comisión
                <input value={commissionTerms} onChange={e => setCommissionTerms(e.target.value)} />
              </label>
              <label>
                Documentación y elementos recibidos
                <input value={docsReceived} onChange={e => setDocsReceived(e.target.value)} />
              </label>
            </>
          )}
        </div>
        <label className="contract-notes-label">
          Observaciones y condiciones particulares
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </label>
      </div>

      <div className="printable-spec-sheet contract-sheet" id="printable-spec-sheet">
        <div className="sheet-header">
          <div className="sheet-header-brand">
            <strong>DREAM CARS_PY · SINCE 2012</strong>
            <span>
              {settings.address} · {settings.city} · Tel. {formatPhone(settings.whatsapp)}
            </span>
          </div>
          <span className="sheet-badge">
            {docType === "reservation" ? "COMPROBANTE DE RESERVA" : "RECEPCIÓN EN CONSIGNACIÓN"}
          </span>
        </div>

        <div className="contract-meta-bar">
          <span>
            <strong>Lugar y fecha:</strong> {settings.city}, {today}
          </span>
          <span>
            <strong>Código de unidad:</strong> {vehicle.id.toUpperCase()}
          </span>
        </div>

        <div className="contract-party-box">
          <h4>
            {docType === "reservation" ? "1. Datos del Cliente / Reservante" : "1. Datos del Propietario / Consignante"}
          </h4>
          <div className="contract-party-grid">
            <div>
              <span>Nombre y Apellido / Razón Social</span>
              <strong>{clientName || "____________________________________"}</strong>
            </div>
            <div>
              <span>Documento C.I. / RUC</span>
              <strong>{clientDoc || "____________________"}</strong>
            </div>
            <div>
              <span>Teléfono / WhatsApp</span>
              <strong>{clientPhone || "____________________"}</strong>
            </div>
          </div>
        </div>

        <div className="contract-party-box">
          <h4>2. Identificación del Vehículo</h4>
          <div className="sheet-specs-grid">
            {specs.map(([label, val]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{val}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="contract-party-box">
          <h4>3. Condiciones de la Operación</h4>
          {docType === "reservation" ? (
            <div className="contract-terms-list">
              <p>
                • <strong>Precio total pactado de la unidad:</strong> {agreedPrice || "A definir"}
              </p>
              <p>
                • <strong>Importe recibido en concepto de seña / reserva:</strong> {depositAmount || "A definir"}
              </p>
              <p>
                • <strong>Plazo de mantenimiento de reserva:</strong> {validityDays || "7"} días corridos a partir de la fecha del presente comprobante para la integración del saldo y firma de documentación definitiva.
              </p>
              <p>
                • <strong>Observaciones:</strong> {notes}
              </p>
            </div>
          ) : (
            <div className="contract-terms-list">
              <p>
                • <strong>Valor de publicación / venta autorizado:</strong> {agreedPrice || "A definir"}
              </p>
              <p>
                • <strong>Modalidad y gestión comercial:</strong> {commissionTerms}
              </p>
              <p>
                • <strong>Elementos y documentación entregados en custodia:</strong> {docsReceived}
              </p>
              <p>
                • <strong>Estado e inspección de ingreso:</strong> {notes}
              </p>
            </div>
          )}
        </div>

        <div className="contract-signatures">
          <div>
            <div className="signature-line" />
            <strong>Por DREAM CARS PY</strong>
            <span>Showroom · {settings.city}</span>
          </div>
          <div>
            <div className="signature-line" />
            <strong>{clientName || (docType === "reservation" ? "Firma del Cliente" : "Firma del Propietario")}</strong>
            <span>C.I. / RUC: {clientDoc || "________________"}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
