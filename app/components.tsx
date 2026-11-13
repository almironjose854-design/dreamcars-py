"use client";
import {useEffect,useRef} from "react";
import {ArrowUpRight,Menu,X,MapPin,MessageCircle,ShieldCheck} from "lucide-react";
import type {Settings} from "../lib/types";
import {brandLogo} from "../lib/branding";
import {useState} from "react";
export const whatsapp=(number:string,message="¡Hola, Dream Cars! Quiero conocer más sobre sus vehículos.")=>`https://wa.me/${number}?text=${encodeURIComponent(message)}`;
export const money=(price:number|null,currency="USD")=>price===null?"Precio a consultar":new Intl.NumberFormat("es-PY",{style:"currency",currency,maximumFractionDigits:0}).format(price);
export const availability:Record<string,string>={consult:"Consultar disponibilidad",available:"Disponible",reserved:"Reservado",sold:"Vendido"};
let csrfToken="";
export class ApiRequestError extends Error { constructor(message:string,public status:number){super(message);} }
export async function api<T=any>(path:string,options:RequestInit={}):Promise<T>{
  const response=await fetch(`/api/${path}`,{credentials:"same-origin",cache:"no-store",...options,headers:{"Content-Type":"application/json",...(csrfToken?{"X-CSRF-Token":csrfToken}:{}),...options.headers}});
  let result:any;try{result=await response.json();}catch{throw new ApiRequestError("El servidor no pudo responder. Volvé a intentar en unos instantes.",response.status);}
  if(!response.ok){if(response.status===401&&path!=="auth/login"&&typeof window!=="undefined")window.dispatchEvent(new Event("admin-session-expired"));throw new ApiRequestError(result.details?.length?`${result.error} ${result.details.join(" · ")}`:result.error||"No se pudo completar la operación.",response.status);}
  if("csrfToken" in result)csrfToken=result.csrfToken||"";if(path==="auth/logout"||path==="auth/revoke")csrfToken="";
  return result as T;
}
export function Instagram({size=20}:{size?:number}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/></svg>;}
export function Brand({settings}:{settings:Settings}) {return <a className="brand" href="/" aria-label="Dream Cars PY, inicio"><img src={brandLogo(settings.logo)} alt={settings.name} width="2172" height="724"/></a>;}
export function Header({settings}:{settings:Settings}){
  const [open,setOpen]=useState(false);
  return <header className="site-header"><div className="header-inner"><Brand settings={settings}/><nav aria-label="Navegación principal" className={open?"nav open":"nav"}><a onClick={()=>setOpen(false)} href="/#coleccion">La colección</a><a onClick={()=>setOpen(false)} href="/#nosotros">Nuestra esencia</a><a onClick={()=>setOpen(false)} href="/#servicios">Vendé tu auto</a><a onClick={()=>setOpen(false)} href="/#contacto">Contacto</a></nav><a className="button small header-cta" href={whatsapp(settings.whatsapp)} target="_blank" rel="noreferrer">Hablemos <ArrowUpRight size={15}/></a><button className="icon-button mobile-toggle" aria-label={open?"Cerrar menú":"Abrir menú"} aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button></div></header>;
}
export function Footer({settings}:{settings:Settings}){return <footer className="site-footer"><div className="footer-top"><Brand settings={settings}/><p>No solo vendemos autos.<br/><strong>Preservamos leyendas.</strong></p><a href={settings.instagram} target="_blank" rel="noreferrer"><Instagram size={20}/> @dreamcars_py <ArrowUpRight size={16}/></a></div><div className="footer-bottom"><span>© {new Date().getFullYear()} {settings.name}. Hecho para los que sienten.</span><div><a href="/privacidad">Privacidad</a><a href="/terminos">Información de compra</a><a href="/admin"><ShieldCheck size={12}/> Administración</a></div></div></footer>;}
export function ContactForm({vehicleId="",vehicleName="",defaultType="general",onSuccess}:{vehicleId?:string;vehicleName?:string;defaultType?:string;onSuccess?:()=>void}){
  const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState(""),[ok,setOk]=useState(false);
  return <form className="contact-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setFeedback("");const form=e.currentTarget;const fd=new FormData(form);try{await api("inquiries",{method:"POST",body:JSON.stringify({name:fd.get("name"),phone:fd.get("phone"),message:fd.get("message"),consent:fd.get("consent")==="on",website:fd.get("website"),vehicleId,type:defaultType})});setOk(true);setFeedback("Recibimos tu consulta. El equipo se pondrá en contacto con vos.");form.reset();onSuccess?.();}catch(error){setOk(false);setFeedback((error as Error).message);}finally{setBusy(false);}}}>
    <div className="form-two"><label>Tu nombre<input name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="¿Cómo te llamás?"/></label><label>WhatsApp<input name="phone" type="tel" autoComplete="tel" required maxLength={30} placeholder="+595 981 000 000"/></label></div>
    <label>Contanos qué estás buscando<textarea name="message" required minLength={10} maxLength={2000} rows={4} defaultValue={vehicleName?`Hola, me interesa el ${vehicleName}. Quisiera recibir más información.`:""} placeholder="Un auto, una historia, tu próxima leyenda…"/></label>
    <div className="honeypot" aria-hidden="true"><label>Sitio web<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
    <label className="check-label"><input name="consent" type="checkbox" required/> <span>Acepto que Dream Cars me contacte por esta consulta y leí la <a href="/privacidad" target="_blank">política de privacidad</a>.</span></label>
    <button className="button" disabled={busy}>{busy?"Enviando…":"Enviar consulta"}<ArrowUpRight size={18}/></button>
    {feedback&&<p className={ok?"feedback success":"feedback error"} role="status">{feedback}</p>}
  </form>;
}
export function Modal({title,children,onClose,wide=false}:{title:string;children:React.ReactNode;onClose:()=>void;wide?:boolean}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;const prev=document.body.style.overflow;document.body.style.overflow="hidden";dialog?.showModal();return()=>{document.body.style.overflow=prev;};},[]);
  return <dialog ref={ref} className={wide?"modal wide":"modal"} aria-label={title} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Cerrar ventana"><X/></button></div>{children}</dialog>;
}
export function FloatingContact({settings}:{settings:Settings}){return <a className="floating-contact" href={whatsapp(settings.whatsapp)} aria-label="Consultar por WhatsApp" target="_blank" rel="noreferrer"><MessageCircle size={24}/></a>;}
