"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {ArrowUpRight,Menu,X,MessageCircle,ShieldCheck,Printer} from "lucide-react";
import type {Settings,Vehicle} from "../lib/types";
import {brandLogo} from "../lib/branding";
import {generateQrMatrix} from "../lib/qr";

export const REFERENCE_PYG_RATE = 7800;

export const whatsapp=(number:string,message="¡Hola, Dream Cars! Quiero conocer más sobre sus vehículos.")=>`https://wa.me/${number}?text=${encodeURIComponent(message)}`;

export const money=(price:number|null,currency="USD")=>
  price===null
    ?"Precio a consultar"
    :new Intl.NumberFormat("es-PY",{style:"currency",currency,maximumFractionDigits:0}).format(price);

export const convertMoney=(
  price:number|null,
  fromCurrency:"USD"|"PYG"="USD",
  displayCurrency:"ORIGINAL"|"USD"|"PYG"="ORIGINAL",
  rate:number=REFERENCE_PYG_RATE
)=>{
  if(price===null)return "Precio a consultar";
  const effectiveRate=rate>0?rate:REFERENCE_PYG_RATE;
  const target=displayCurrency==="ORIGINAL"?fromCurrency:displayCurrency;
  let value=price;
  if(fromCurrency==="USD"&&target==="PYG")value=Math.round(price*effectiveRate);
  else if(fromCurrency==="PYG"&&target==="USD")value=Math.round(price/effectiveRate);
  const formatted=new Intl.NumberFormat("es-PY",{style:"currency",currency:target,maximumFractionDigits:0}).format(value);
  return target!==fromCurrency?`${formatted} (ref.)`:formatted;
};

export const normalizePriceUsd=(price:number|null,currency:"USD"|"PYG"="USD",rate:number=REFERENCE_PYG_RATE):number|null=>{
  if(price===null)return null;
  const effectiveRate=rate>0?rate:REFERENCE_PYG_RATE;
  return currency==="PYG"?price/effectiveRate:price;
};

export const availability:Record<string,string>={
  consult:"Consultar disponibilidad",
  available:"Disponible",
  reserved:"Reservado",
  sold:"Vendido"
};

let csrfToken="";
export class ApiRequestError extends Error {
  constructor(message:string,public status:number){super(message);}
}

export async function api<T=any>(path:string,options:RequestInit={}):Promise<T>{
  const response=await fetch(`/api/${path}`,{
    credentials:"same-origin",
    cache:"no-store",
    ...options,
    headers:{
      "Content-Type":"application/json",
      ...(csrfToken?{"X-CSRF-Token":csrfToken}:{}),
      ...options.headers
    }
  });
  let result:any;
  try{result=await response.json();}catch{throw new ApiRequestError("El servidor no pudo responder. Volvé a intentar en unos instantes.",response.status);}
  if(!response.ok){
    if(response.status===401&&path!=="auth/login"&&typeof window!=="undefined")window.dispatchEvent(new Event("admin-session-expired"));
    throw new ApiRequestError(result.details?.length?`${result.error} ${result.details.join(" · ")}`:result.error||"No se pudo completar la operación.",response.status);
  }
  if("csrfToken" in result)csrfToken=result.csrfToken||"";
  if(path==="auth/logout"||path==="auth/revoke")csrfToken="";
  return result as T;
}

export function trackVehicleMetric(vehicleId:string,event:"view"|"whatsapp"){
  if(!vehicleId||typeof window==="undefined")return;
  fetch("/api/metrics",{
    method:"POST",
    credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({vehicleId,event})
  }).catch(()=>{});
}

export function Instagram({size=20}:{size?:number}){
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5"/>
      <circle cx="12" cy="12" r="4"/>
      <circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/>
    </svg>
  );
}

export function QrCodeSvg({value,size=148}:{value:string;size?:number}){
  const matrix=useMemo(()=>generateQrMatrix(value),[value]);
  const n=matrix.length;
  const quiet=2;
  const total=n+quiet*2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${total} ${total}`} role="img" aria-label="Código QR de la ficha">
      <rect width={total} height={total} fill="#ffffff"/>
      {matrix.map((row,r)=>
        row.map((dark,c)=>
          dark?<rect key={`${r}-${c}`} x={c+quiet} y={r+quiet} width={1} height={1} fill="#111111"/>:null
        )
      )}
    </svg>
  );
}

export function Brand({settings}:{settings:Settings}){
  return (
    <a className="brand" href="/" aria-label="Dream Cars PY, inicio">
      <img src={brandLogo(settings.logo)} alt={settings.name} width="2172" height="724"/>
    </a>
  );
}

export function Header({settings}:{settings:Settings}){
  const [open,setOpen]=useState(false);
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand settings={settings}/>
        <nav aria-label="Navegación principal" className={open?"nav open":"nav"}>
          <a onClick={()=>setOpen(false)} href="/#coleccion">La colección</a>
          <a onClick={()=>setOpen(false)} href="/#nosotros">Nuestra esencia</a>
          <a onClick={()=>setOpen(false)} href="/#servicios">Vendé o importá</a>
          <a onClick={()=>setOpen(false)} href="/#contacto">Contacto</a>
        </nav>
        <a className="button small header-cta" href={whatsapp(settings.whatsapp)} target="_blank" rel="noreferrer">
          Hablemos <ArrowUpRight size={15}/>
        </a>
        <button className="icon-button mobile-toggle" aria-label={open?"Cerrar menú":"Abrir menú"} aria-expanded={open} onClick={()=>setOpen(!open)}>
          {open?<X/>:<Menu/>}
        </button>
      </div>
    </header>
  );
}

export function Footer({settings}:{settings:Settings}){
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <Brand settings={settings}/>
        <p>No solo vendemos autos.<br/><strong>Preservamos leyendas.</strong></p>
        <a href={settings.instagram} target="_blank" rel="noreferrer"><Instagram size={20}/> @dreamcars_py <ArrowUpRight size={16}/></a>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} {settings.name}. Hecho para los que sienten.</span>
        <div>
          <a href="/privacidad">Privacidad</a>
          <a href="/terminos">Información de compra</a>
          <a href="/admin"><ShieldCheck size={12}/> Administración</a>
        </div>
      </div>
    </footer>
  );
}

export function ContactForm({
  vehicleId="",
  vehicleName="",
  defaultType="general",
  visitMode=false,
  onSuccess
}:{
  vehicleId?:string;
  vehicleName?:string;
  defaultType?:"general"|"vehicle"|"consignment"|"import";
  visitMode?:boolean;
  onSuccess?:()=>void;
}){
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState("");
  const [ok,setOk]=useState(false);

  return (
    <form
      className="contact-form"
      onSubmit={async e=>{
        e.preventDefault();
        setBusy(true);
        setFeedback("");
        const form=e.currentTarget;
        const fd=new FormData(form);
        const rawMessage=String(fd.get("message")||"").trim();
        let structuredPrefix="";
        if(visitMode){
          const visitDate=String(fd.get("visitDate")||"").trim();
          const visitSlot=String(fd.get("visitSlot")||"Mañana (09:00 a 12:00)").trim();
          const specs=[
            "SOLICITUD DE VISITA AL GARAGE",
            visitDate&&`Fecha preferida: ${visitDate}`,
            `Turno: ${visitSlot}`
          ].filter(Boolean);
          structuredPrefix=`[${specs.join(" · ")}]\n`;
        }else if(defaultType==="consignment"){
          const unit=String(fd.get("unitModel")||"").trim();
          const unitYear=String(fd.get("unitYear")||"").trim();
          const unitKm=String(fd.get("unitKm")||"").trim();
          const modality=String(fd.get("modality")||"Consignación").trim();
          const expectedPrice=String(fd.get("expectedPrice")||"").trim();
          const specs=[
            unit&&`Vehículo: ${unit}`,
            unitYear&&`Año: ${unitYear}`,
            unitKm&&`Kilometraje: ${unitKm} km`,
            `Modalidad: ${modality}`,
            expectedPrice&&`Valor estimado: USD ${expectedPrice}`
          ].filter(Boolean);
          if(specs.length)structuredPrefix=`[${specs.join(" · ")}]\n`;
        }else if(defaultType==="import"){
          const targetCar=String(fd.get("targetCar")||"").trim();
          const originMarket=String(fd.get("originMarket")||"Japón (JDM)").trim();
          const budget=String(fd.get("budget")||"").trim();
          const specs=[
            targetCar&&`Proyecto buscado: ${targetCar}`,
            `Origen preferido: ${originMarket}`,
            budget&&`Presupuesto ref.: USD ${budget}`
          ].filter(Boolean);
          if(specs.length)structuredPrefix=`[${specs.join(" · ")}]\n`;
        }
        const finalMessage=`${structuredPrefix}${rawMessage}`.slice(0,2000);
        try{
          await api("inquiries",{
            method:"POST",
            body:JSON.stringify({
              name:fd.get("name"),
              phone:fd.get("phone"),
              message:finalMessage,
              consent:fd.get("consent")==="on",
              website:fd.get("website"),
              vehicleId,
              type:defaultType
            })
          });
          setOk(true);
          setFeedback(visitMode?"Solicitud de visita registrada. El equipo te confirmará por WhatsApp.":"Recibimos tu consulta. El equipo se pondrá en contacto con vos.");
          form.reset();
          onSuccess?.();
        }catch(error){
          setOk(false);
          setFeedback((error as Error).message);
        }finally{
          setBusy(false);
        }
      }}
    >
      <div className="form-two">
        <label>
          Tu nombre
          <input name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="¿Cómo te llamás?"/>
        </label>
        <label>
          WhatsApp
          <input name="phone" type="tel" autoComplete="tel" required maxLength={30} placeholder="+595 981 000 000"/>
        </label>
      </div>

      {visitMode&&(
        <div className="structured-fields">
          <div className="form-two">
            <label>
              Día preferido para la visita
              <input name="visitDate" type="date" required min={new Date().toISOString().slice(0,10)}/>
            </label>
            <label>
              Franja horaria
              <select name="visitSlot" defaultValue="Mañana (09:00 a 12:00)">
                <option value="Mañana (09:00 a 12:00)">Mañana (09:00 a 12:00)</option>
                <option value="Siesta / Tarde (14:00 a 18:00)">Tarde (14:00 a 18:00)</option>
                <option value="Horario especial a coordinar">Horario especial a coordinar</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {defaultType==="consignment"&&!visitMode&&(
        <div className="structured-fields">
          <div className="form-two">
            <label>
              Marca y modelo de tu auto
              <input name="unitModel" required maxLength={120} placeholder="Ej. Subaru Impreza WRX STI"/>
            </label>
            <label>
              Modalidad preferida
              <select name="modality" defaultValue="Consignación">
                <option value="Consignación">Consignación en el showroom</option>
                <option value="Venta directa">Venta directa al garage</option>
                <option value="Parte de pago">Entregar como parte de pago</option>
              </select>
            </label>
          </div>
          <div className="form-three">
            <label>
              Año
              <input name="unitYear" type="number" min={1960} max={2100} placeholder="Ej. 2004"/>
            </label>
            <label>
              Kilometraje aprox.
              <input name="unitKm" type="number" min={0} max={2000000} placeholder="Ej. 78000"/>
            </label>
            <label>
              Valor pretendido (USD, opcional)
              <input name="expectedPrice" type="number" min={0} placeholder="Ej. 28000"/>
            </label>
          </div>
        </div>
      )}

      {defaultType==="import"&&!visitMode&&(
        <div className="structured-fields">
          <div className="form-three">
            <label>
              Vehículo o versión buscada
              <input name="targetCar" required maxLength={120} placeholder="Ej. Nissan Skyline GT-R R34 / Honda NSX"/>
            </label>
            <label>
              Mercado de origen
              <select name="originMarket" defaultValue="Japón (JDM)">
                <option value="Japón (JDM)">Japón (Subastas / JDM)</option>
                <option value="Estados Unidos">Estados Unidos</option>
                <option value="Europa">Europa</option>
                <option value="Corea del Sur">Corea del Sur</option>
                <option value="Indistinto">Indistinto / Asesoramiento</option>
              </select>
            </label>
            <label>
              Presupuesto estimado (USD)
              <input name="budget" type="number" min={0} placeholder="Opcional"/>
            </label>
          </div>
        </div>
      )}

      <label>
        {visitMode
          ?"Comentarios adicionales para tu visita"
          :defaultType==="consignment"
            ?"Historia, estado y equipamiento de tu unidad"
            :defaultType==="import"
              ?"Detalles del proyecto (año, color, estado o especificaciones)"
              :"Contanos qué estás buscando"}
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={1800}
          rows={visitMode?3:4}
          defaultValue={
            visitMode&&vehicleName
              ?`Hola, quiero coordinar una visita al garage en Luque para ver el ${vehicleName} en persona.`
              :vehicleName
                ?`Hola, me interesa el ${vehicleName}. Quisiera recibir más información.`
                :""
          }
          placeholder={
            defaultType==="consignment"
              ?"Contanos el estado mecánico, modificaciones, mantenimiento y si cuenta con despacho/documentación al día…"
              :defaultType==="import"
                ?"Contanos qué versión buscás, si preferís unidad original de colección o preparación específica…"
                :"Un auto, una historia, tu próxima leyenda…"
          }
        />
      </label>
      <div className="honeypot" aria-hidden="true">
        <label>Sitio web<input name="website" tabIndex={-1} autoComplete="off"/></label>
      </div>
      <label className="check-label">
        <input name="consent" type="checkbox" required/>
        <span>Acepto que Dream Cars me contacte por esta consulta y leí la <a href="/privacidad" target="_blank">política de privacidad</a>.</span>
      </label>
      <button className="button" disabled={busy}>
        {busy
          ?"Enviando…"
          :visitMode
            ?"Confirmar solicitud de visita"
            :defaultType==="consignment"
              ?"Enviar propuesta de vehículo"
              :defaultType==="import"
                ?"Solicitar búsqueda e importación"
                :"Enviar consulta"}
        <ArrowUpRight size={18}/>
      </button>
      {feedback&&<p className={ok?"feedback success":"feedback error"} role="status">{feedback}</p>}
    </form>
  );
}

export function QrSheetModal({
  vehicle,
  settings,
  onClose
}:{
  vehicle:Vehicle;
  settings:Settings;
  onClose:()=>void;
}){
  const shareUrl=typeof window!=="undefined"?`${window.location.origin}/vehiculos/${vehicle.id}`:`https://dreamcars-py.onrender.com/vehiculos/${vehicle.id}`;
  const specs:[string,string][]=[
    ["Marca",vehicle.brand],
    ["Modelo",vehicle.model],
    ["Versión",vehicle.version||"—"],
    ["Año",String(vehicle.year||"A confirmar")],
    ["Kilometraje",vehicle.mileage!==null?`${vehicle.mileage.toLocaleString("es-PY")} km`:"A confirmar"],
    ["Carrocería",vehicle.body||"—"],
    ["Motor",vehicle.engine||"A confirmar"],
    ["Transmisión",vehicle.transmission||"A confirmar"],
    ["Tracción",vehicle.drive||"A confirmar"],
    ["Color",vehicle.color||"—"]
  ];

  return (
    <Modal title={`Ficha de Exposición QR · ${vehicle.brand} ${vehicle.model}`} wide onClose={onClose}>
      <div className="qr-sheet-actions">
        <p className="modal-description">
          Hoja lista para imprimir en A4 y colocar en el parabrisas del vehículo en el showroom de Luque. El código QR abre la ficha digital directamente en el celular del visitante.
        </p>
        <button type="button" className="button small" onClick={()=>window.print()}>
          <Printer size={16}/> Imprimir hoja A4 / Guardar PDF
        </button>
      </div>

      <div className="printable-spec-sheet" id="printable-spec-sheet">
        <div className="sheet-header">
          <div>
            <strong>DREAM CARS_PY</strong>
            <span>{settings.address} · {settings.city}</span>
          </div>
          <span className="sheet-badge">{availability[vehicle.availability].toUpperCase()}</span>
        </div>

        <div className="sheet-hero">
          {vehicle.images[0]?.url&&<img src={vehicle.images[0].url} alt={`${vehicle.brand} ${vehicle.model}`}/>}
          <div className="sheet-title-box">
            <span className="sheet-eyebrow">{vehicle.brand.toUpperCase()} / {vehicle.body.toUpperCase()}</span>
            <h1>{vehicle.model}</h1>
            <p>{vehicle.version}</p>
            <strong className="sheet-price">{money(vehicle.price,vehicle.currency)}</strong>
          </div>
        </div>

        <div className="sheet-specs-grid">
          {specs.map(([label,val])=>(
            <div key={label}>
              <span>{label}</span>
              <strong>{val}</strong>
            </div>
          ))}
        </div>

        {vehicle.features.length>0&&(
          <div className="sheet-features">
            <strong>Equipamiento destacado:</strong> {vehicle.features.join(" · ")}
          </div>
        )}

        <div className="sheet-footer">
          <div className="sheet-qr-box">
            <QrCodeSvg value={shareUrl} size={118}/>
            <div>
              <strong>ESCANEÁ EL CÓDIGO QR</strong>
              <p>Abrí la galería completa de fotos, simulador de entrega y contacto directo por WhatsApp en tu celular.</p>
              <small>{shareUrl}</small>
            </div>
          </div>
          <div className="sheet-contact">
            <strong>+{settings.whatsapp}</strong>
            <span>@dreamcars_py</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function Modal({title,children,onClose,wide=false}:{title:string;children:React.ReactNode;onClose:()=>void;wide?:boolean}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const dialog=ref.current;
    const prev=document.body.style.overflow;
    document.body.style.overflow="hidden";
    dialog?.showModal();
    return()=>{document.body.style.overflow=prev;};
  },[]);
  return (
    <dialog
      ref={ref}
      className={wide?"modal wide":"modal"}
      aria-label={title}
      onCancel={e=>{e.preventDefault();onClose();}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Cerrar ventana"><X/></button>
      </div>
      {children}
    </dialog>
  );
}

export function FloatingContact({settings}:{settings:Settings}){
  return (
    <a className="floating-contact" href={whatsapp(settings.whatsapp)} aria-label="Consultar por WhatsApp" target="_blank" rel="noreferrer">
      <MessageCircle size={24}/>
    </a>
  );
}
