"use client";
import {useEffect,useRef,useState} from "react";
import {
  ArrowLeft,ArrowRight,ArrowUpRight,CarFront,Check,Cloud,Copy,Download,Eye,ExternalLink,FileJson,
  ImagePlus,LayoutDashboard,LoaderCircle,LogOut,MessageCircle,Pencil,Plus,QrCode,Search,Settings2,
  ShieldCheck,Trash2,Upload,X,Archive,RotateCcw,RefreshCw,KeyRound,Star,Sparkles,FileSpreadsheet
} from "lucide-react";
import type {Vehicle,Settings,Inquiry,AdminSessionInfo,VehicleMetrics} from "../../lib/types";
import {api,availability,Instagram,Modal,money,QrSheetModal,REFERENCE_PYG_RATE,whatsapp} from "../components";
import AdminLogin,{AccountForm} from "./login";
import {brandLogo} from "../../lib/branding";

type Stored<T>=T&{_etag:string|null};
type AdminData={
  vehicles:Stored<Vehicle>[];
  settings:Stored<Settings>;
  inquiries:Stored<Inquiry>[];
  metrics?:VehicleMetrics;
  cloudinary:{configured:boolean;cloudName:string};
};

function slugifyVehicle(brand:string,model:string,version:string,existingIds:Set<string>):string{
  const base=`${brand}-${model}-${version}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .slice(0,65)||`vehiculo-${Date.now().toString(36)}`;
  if(!existingIds.has(base))return base;
  let counter=2;
  while(existingIds.has(`${base}-${counter}`))counter++;
  return `${base}-${counter}`;
}

const emptyVehicle=():Stored<Vehicle>=>({
  id:crypto.randomUUID(),
  brand:"",
  model:"",
  version:"",
  year:null,
  mileage:null,
  transmission:"A confirmar",
  fuel:"A confirmar",
  engine:"A confirmar",
  body:"Sedán",
  drive:"A confirmar",
  color:"",
  price:null,
  currency:"USD",
  description:"",
  features:[],
  images:[],
  status:"draft",
  availability:"consult",
  featured:false,
  sourceUrl:"",
  updatedAt:new Date().toISOString(),
  _etag:null
});

async function optimizeImageToWebp(file:Blob):Promise<Blob>{
  if(typeof document==="undefined"||file.type==="image/gif")return file;
  return new Promise(resolve=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      URL.revokeObjectURL(url);
      const maxDim=2048;
      let {width,height}=img;
      if(width>maxDim||height>maxDim){
        const scale=maxDim/Math.max(width,height);
        width=Math.round(width*scale);
        height=Math.round(height*scale);
      }
      const canvas=document.createElement("canvas");
      canvas.width=width;
      canvas.height=height;
      const ctx=canvas.getContext("2d");
      if(!ctx){resolve(file);return;}
      ctx.drawImage(img,0,0,width,height);
      canvas.toBlob(
        blob=>{
          if(blob&&blob.size<file.size)resolve(blob);
          else resolve(file);
        },
        "image/webp",
        0.86
      );
    };
    img.onerror=()=>{
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src=url;
  });
}

function blobToDataUrl(blob:Blob):Promise<string>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result));
    reader.onerror=()=>reject(new Error("No se pudo leer el archivo de imagen."));
    reader.readAsDataURL(blob);
  });
}

async function uploadImage(file:Blob,optimize=true,useCloudinary=true):Promise<{url:string;publicId:string}>{
  if(file.size>10*1024*1024)throw new Error("Cada foto puede tener hasta 10 MB.");
  if(!["image/jpeg","image/png","image/webp","image/avif","image/gif"].includes(file.type))
    throw new Error("Usá imágenes JPG, PNG, WebP, AVIF o GIF.");
  const processed=optimize?await optimizeImageToWebp(file):file;
  if(!useCloudinary){
    const dataUrl=await blobToDataUrl(processed);
    return await api("admin/upload-local",{
      method:"POST",
      body:JSON.stringify({dataUrl})
    });
  }
  const signed=await api("admin/upload-signature",{method:"POST",body:"{}"});
  const form=new FormData();
  form.set("file",processed);
  form.set("api_key",signed.apiKey);
  form.set("signature",signed.signature);
  for(const [key,value] of Object.entries(signed.params))form.set(key,String(value));
  const response=await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`,{method:"POST",body:form});
  const image=(await response.json()) as {error?:{message?:string};secure_url:string;public_id:string};
  if(!response.ok)throw new Error(image.error?.message||"Cloudinary no pudo subir la imagen.");
  return {url:image.secure_url,publicId:image.public_id};
}

function exportInquiriesCsv(inquiries:Stored<Inquiry>[],vehicles:Stored<Vehicle>[]){
  const escapeCsv=(val:string)=>`"${String(val??"").replace(/"/g,'""')}"`;
  const headers=["ID","Fecha","Nombre","Teléfono","Tipo","Vehículo","Estado","Mensaje","Notas internas"];
  const rows=inquiries.map(q=>{
    const car=q.vehicleId?vehicles.find(v=>v.id===q.vehicleId):undefined;
    const carName=car?`${car.brand} ${car.model}`:q.vehicleId||"-";
    const typeLabel=q.type==="consignment"?"Venta / Consignación":q.type==="import"?"Importación":q.vehicleId?"Consulta de vehículo":"General";
    const statusLabel=q.status==="new"?"Nueva":q.status==="contacted"?"Contactada":"Cerrada";
    return [
      q.id,
      new Date(q.createdAt).toLocaleString("es-PY",{timeZone:"America/Asuncion"}),
      q.name,
      q.phone,
      typeLabel,
      carName,
      statusLabel,
      q.message,
      q.notes||""
    ].map(escapeCsv).join(",");
  });
  const csvContent="\uFEFF"+[headers.map(escapeCsv).join(","),...rows].join("\r\n");
  const blob=new Blob([csvContent],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=`dreamcars-consultas-${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Admin(){
  const [session,setSession]=useState<AdminSessionInfo|null>(null);
  const [data,setData]=useState<AdminData|null>(null);
  const [tab,setTab]=useState("dashboard");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [editor,setEditor]=useState<Stored<Vehicle>|null>(null);
  const [flyerVehicle,setFlyerVehicle]=useState<Stored<Vehicle>|null>(null);
  const [qrVehicle,setQrVehicle]=useState<Stored<Vehicle>|null>(null);
  const [deleteTarget,setDeleteTarget]=useState<Stored<Vehicle>|null>(null);
  const [search,setSearch]=useState("");
  const [archiveFilter,setArchiveFilter]=useState(false);
  const [restore,setRestore]=useState<any>(null);
  const [erase,setErase]=useState<Stored<Inquiry>|null>(null);

  const [statusFilter,setStatusFilter]=useState("all");
  const [stockFilter,setStockFilter]=useState("all");
  const [leadSearch,setLeadSearch]=useState("");
  const [leadStatus,setLeadStatus]=useState("all");
  const [lastSync,setLastSync]=useState<Date|null>(null);
  const [noteDrafts,setNoteDrafts]=useState<Record<string,string>>({});

  const load=async()=>{
    const s=await api<AdminSessionInfo>("session");
    setSession(s);
    if(s.isAdmin&&!s.mustChangePassword){
      const fetched=await api<AdminData>("admin/data");
      setData(fetched);
      setLastSync(new Date());
    }else{
      setData(null);
    }
  };

  const signOut=async()=>{
    await api("auth/logout",{method:"POST",body:"{}"});
    setData(null);
    setError("");
    setNotice("");
    await load();
  };

  useEffect(()=>{
    load().catch(e=>setError(e.message));
    const expired=()=>{
      setSession({isAdmin:false,user:null,mustChangePassword:false,csrfToken:null,expiresAt:null});
      setData(null);
      setError("Tu sesión terminó. Ingresá nuevamente para continuar.");
    };
    window.addEventListener("admin-session-expired",expired);
    const requested=new URLSearchParams(location.search).get("tab");
    if(["dashboard","vehicles","inquiries","settings","integrations","backups","account"].includes(requested||""))
      setTab(requested!);
    return()=>window.removeEventListener("admin-session-expired",expired);
  },[]);

  useEffect(()=>{
    const url=new URL(location.href);
    if(tab==="dashboard")url.searchParams.delete("tab");
    else url.searchParams.set("tab",tab);
    history.replaceState(null,"",url.pathname+url.search);
  },[tab]);

  const task=async(fn:()=>Promise<void>,message="Cambios guardados.")=>{
    setBusy(true);
    setError("");
    setNotice("");
    try{
      await fn();
      await load();
      setNotice(message);
    }catch(e){
      setError((e as Error).message);
    }finally{
      setBusy(false);
    }
  };

  if(!session||!session.isAdmin)
    return <AdminLogin session={session} initialError={error} onAuthenticated={async()=>{setError("");await load();}}/>;
  if(session.mustChangePassword)
    return <div className="admin-v2"><AccountForm session={session} initial onSaved={load} onLogout={signOut}/></div>;
  if(!data)
    return (
      <main className="admin-data-loading">
        <LoaderCircle className="spin" size={30}/>
        <h1>Abriendo el garage…</h1>
        {error&&<p role="alert">{error}</p>}
        <button className="button" onClick={()=>load().catch(e=>setError(e.message))}>Volver a intentar</button>
        <button className="text-button" onClick={signOut}>Cerrar sesión</button>
      </main>
    );

  const tabs=[
    {id:"dashboard",label:"Resumen",icon:LayoutDashboard},
    {id:"vehicles",label:"Vehículos",icon:CarFront},
    {id:"inquiries",label:"Consultas",icon:MessageCircle},
    {id:"settings",label:"El negocio",icon:Settings2},
    {id:"integrations",label:"Cloudinary",icon:Cloud},
    {id:"backups",label:"Respaldos JSON",icon:FileJson},
    {id:"account",label:"Mi cuenta",icon:KeyRound}
  ];

  const vehicleMetrics=data.metrics||{};
  const newLeads=data.inquiries.filter(q=>q.status==="new").length;
  const visibleVehicles=data.vehicles.filter(
    v=>
      (archiveFilter?v.status==="archived":v.status!=="archived")&&
      (statusFilter==="all"||v.status===statusFilter)&&
      (stockFilter==="all"||v.availability===stockFilter)&&
      `${v.brand} ${v.model} ${v.version}`.toLowerCase().includes(search.toLowerCase())
  );
  const visibleInquiries=data.inquiries.filter(
    q=>
      (leadStatus==="all"||q.status===leadStatus)&&
      `${q.name} ${q.phone} ${q.message} ${q.notes||""}`.toLowerCase().includes(leadSearch.toLowerCase())
  );
  const pendingVehicles=data.vehicles.filter(
    v=>v.status!=="archived"&&[v.year,v.mileage,v.price].some(x=>x===null)
  ).length;

  const topVehiclesByInterest=[...data.vehicles]
    .filter(v=>v.status==="published")
    .map(v=>({
      vehicle:v,
      views:vehicleMetrics[v.id]?.views||0,
      wa:vehicleMetrics[v.id]?.whatsappClicks||0
    }))
    .sort((a,b)=>b.wa*3+b.views-(a.wa*3+a.views))
    .slice(0,4);

  return (
    <div className="admin-shell admin-v2">
      <aside className="admin-sidebar">
        <a href="/" className="admin-logo"><img src={brandLogo(data.settings.logo)} alt="Dream Cars PY"/></a>
        <span className="admin-label">ADMINISTRACIÓN</span>
        <nav aria-label="Secciones de administración">
          {tabs.map(t=>(
            <button
              key={t.id}
              className={tab===t.id?"active":""}
              onClick={()=>{setTab(t.id);setError("");setNotice("");}}
            >
              <t.icon size={18}/>
              {t.label}
              {t.id==="inquiries"&&newLeads>0&&<small>{newLeads}</small>}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <a href="/" target="_blank" rel="noreferrer"><ExternalLink size={16}/> Ver sitio web</a>
          <button onClick={()=>signOut().catch(e=>setError(e.message))}><LogOut size={16}/> Cerrar sesión</button>
          <span>@{session.user?.username}</span>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <span>DREAM CARS PY <span className="muted">/ {tabs.find(t=>t.id===tab)?.label}</span></span>
          <div className="admin-top-actions">
            <button
              className="refresh-button"
              aria-label="Actualizar datos"
              title={lastSync?`Última actualización: ${lastSync.toLocaleTimeString("es-PY")}`:"Actualizar datos"}
              disabled={busy}
              onClick={()=>task(async()=>{},"Información actualizada.")}
            >
              <RefreshCw size={16} className={busy?"spin":""}/>
            </button>
            <button className="admin-profile" onClick={()=>setTab("account")}>
              <span className="profile-avatar">{session.user?.displayName.slice(0,1).toUpperCase()}</span>
              <span>{session.user?.displayName}<small>Administrador</small></span>
            </button>
            <button className="mobile-signout" aria-label="Cerrar sesión" onClick={()=>signOut().catch(e=>setError(e.message))}>
              <LogOut size={17}/>
            </button>
          </div>
        </header>

        <main className="admin-content">
          <div className="admin-heading">
            <div>
              <p className="eyebrow lime">TU GARAGE DIGITAL</p>
              <h1>
                {tab==="dashboard"
                  ?"Todo bajo control."
                  :tab==="vehicles"
                    ?"Tu colección."
                    :tab==="inquiries"
                      ?"Conversaciones que mueven."
                      :tab==="settings"
                        ?"La esencia del negocio."
                        :tab==="integrations"
                          ?"Las fotos, en la nube."
                          :tab==="account"
                            ?"Tu cuenta. Tu control."
                            :"Tus datos, en tus manos."}
              </h1>
            </div>
            {tab==="vehicles"&&(
              <button className="button small" onClick={()=>setEditor(emptyVehicle())}>
                <Plus size={17}/> Nuevo vehículo
              </button>
            )}
            {tab==="inquiries"&&visibleInquiries.length>0&&(
              <button
                type="button"
                className="button small secondary"
                onClick={()=>exportInquiriesCsv(visibleInquiries,data.vehicles)}
              >
                <FileSpreadsheet size={16}/> Exportar CSV ({visibleInquiries.length})
              </button>
            )}
          </div>

          {error&&(
            <div className="feedback error" role="alert">
              {error}
              <button aria-label="Cerrar error" onClick={()=>setError("")}><X size={15}/></button>
            </div>
          )}
          {notice&&(
            <div className="feedback success" role="status">
              <Check size={16}/>
              {notice}
              <button aria-label="Cerrar mensaje" onClick={()=>setNotice("")}><X size={15}/></button>
            </div>
          )}

          {tab==="dashboard"&&(
            <>
              <div className="stat-grid">
                {[
                  ["Vehículos publicados",data.vehicles.filter(v=>v.status==="published").length,CarFront],
                  ["Disponibles",data.vehicles.filter(v=>v.status==="published"&&v.availability==="available").length,Check],
                  ["Consultas nuevas",newLeads,MessageCircle],
                  ["Vendidos",data.vehicles.filter(v=>v.availability==="sold"&&v.status!=="archived").length,ShieldCheck]
                ].map(([label,value,Icon])=>{
                  const I=Icon as typeof CarFront;
                  return (
                    <article className="stat" key={String(label)}>
                      <I size={19}/>
                      <strong>{String(value)}</strong>
                      <span>{String(label)}</span>
                    </article>
                  );
                })}
              </div>

              {!data.cloudinary.configured&&(
                <div className="setup-callout">
                  <Cloud size={30}/>
                  <div>
                    <h3>Almacenamiento local activo (Cloudinary opcional).</h3>
                    <p>Podés subir fotos directamente al servidor o conectar tu cuenta de Cloudinary para alojarlas en la nube.</p>
                  </div>
                  <button className="button small" onClick={()=>setTab("integrations")}>
                    Configurar Cloudinary <ArrowUpRight size={16}/>
                  </button>
                </div>
              )}

              {pendingVehicles>0&&(
                <div className="inventory-insight">
                  <div>
                    <p className="eyebrow">EL PRÓXIMO PASO</p>
                    <h3>{pendingVehicles} fichas tienen datos por completar.</h3>
                    <p>Agregá precio, año y kilometraje para que tus clientes tengan más información.</p>
                  </div>
                  <button className="button small secondary" onClick={()=>setTab("vehicles")}>
                    Revisar colección <ArrowUpRight size={16}/>
                  </button>
                </div>
              )}

              <div className="admin-section-head">
                <h2>Rendimiento de unidades (Vistas y clics a WhatsApp)</h2>
                <button className="text-link" onClick={()=>setTab("vehicles")}>
                  Ver inventario <ArrowUpRight size={16}/>
                </button>
              </div>
              <div className="interest-grid">
                {topVehiclesByInterest.map(({vehicle:v,views,wa})=>(
                  <article className="interest-card" key={v.id}>
                    <img src={v.images[0]?.url||"/media/logo.jpg"} alt=""/>
                    <div>
                      <small>{v.brand}</small>
                      <strong>{v.model}</strong>
                      <div className="interest-metrics">
                        <span><Eye size={13}/> {views} vistas</span>
                        <span><MessageCircle size={13}/> {wa} clics WA</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="admin-section-head">
                <h2>Últimas consultas</h2>
                <button className="text-link" onClick={()=>setTab("inquiries")}>
                  Ver todas <ArrowUpRight size={16}/>
                </button>
              </div>
              {data.inquiries.length===0?(
                <div className="admin-empty">
                  <MessageCircle size={30}/>
                  <h3>El próximo “hola” llega acá.</h3>
                  <p>Las consultas enviadas desde la web aparecerán en este panel.</p>
                </div>
              ):(
                <div className="lead-list">
                  {data.inquiries.slice(0,4).map(q=>(
                    <div key={q.id}>
                      <div>
                        <strong>{q.name}</strong>
                        <p>{q.message}</p>
                      </div>
                      <span>{new Date(q.createdAt).toLocaleDateString("es-PY")}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="admin-section-head">
                <h2>Accesos rápidos</h2>
              </div>
              <div className="quick-actions">
                <button onClick={()=>{setTab("vehicles");setEditor(emptyVehicle());}}>
                  <Plus/> Cargar un vehículo <ArrowUpRight size={17}/>
                </button>
                <button onClick={()=>setTab("settings")}>
                  <Settings2/> Editar el negocio <ArrowUpRight size={17}/>
                </button>
                <a href="/api/admin/backup" download>
                  <Download/> Descargar respaldo <ArrowUpRight size={17}/>
                </a>
              </div>
            </>
          )}

          {tab==="vehicles"&&(
            <>
              <div className="admin-tools">
                <label className="search-box">
                  <Search size={17}/>
                  <input
                    aria-label="Buscar vehículos en el panel"
                    placeholder="Buscar por marca, modelo o versión"
                    value={search}
                    onChange={e=>setSearch(e.target.value)}
                  />
                </label>
                <button
                  className={archiveFilter?"button small":"button small secondary"}
                  onClick={()=>{setArchiveFilter(!archiveFilter);setStatusFilter("all");}}
                >
                  <Archive size={16}/>
                  {archiveFilter?"Ver activos":"Ver archivados"}
                </button>
              </div>

              <div className="inventory-filters">
                <label>
                  Publicación
                  <select aria-label="Filtrar por publicación" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
                    <option value="all">Todos los estados</option>
                    <option value="published">Publicados</option>
                    <option value="draft">Borradores</option>
                  </select>
                </label>
                <label>
                  Disponibilidad
                  <select aria-label="Filtrar por disponibilidad" value={stockFilter} onChange={e=>setStockFilter(e.target.value)}>
                    <option value="all">Todas las disponibilidades</option>
                    {Object.entries(availability).map(([key,label])=><option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
                <span>{visibleVehicles.length} de {data.vehicles.length} vehículos</span>
                <button
                  className="text-button"
                  onClick={()=>{setSearch("");setStatusFilter("all");setStockFilter("all");setArchiveFilter(false);}}
                >
                  Limpiar filtros
                </button>
              </div>

              <div className="admin-vehicles">
                {visibleVehicles.map(v=>{
                  const m=vehicleMetrics[v.id];
                  return (
                    <article key={v.id}>
                      <img src={v.images[0]?.url||"/media/logo.jpg"} alt={`${v.brand} ${v.model}`}/>
                      <div className="admin-vehicle-name">
                        <small>{v.brand} {v.year?`· ${v.year}`:""}</small>
                        <strong>{v.model}</strong>
                        <span>
                          {v.version}
                          {(m?.views||m?.whatsappClicks)?` · 👁 ${m?.views||0} · 💬 ${m?.whatsappClicks||0}`:""}
                        </span>
                      </div>
                      <div className="admin-quick-selects">
                        <select
                          aria-label={`Estado de publicación de ${v.model}`}
                          className={`admin-inline-select status-${v.status}`}
                          value={v.status}
                          disabled={busy}
                          onChange={e=>{
                            const nextStatus=e.target.value as Vehicle["status"];
                            task(async()=>{
                              await api(`admin/vehicles/${v.id}`,{
                                method:"PUT",
                                body:JSON.stringify({...v,status:nextStatus})
                              });
                            },`Estado de ${v.model} actualizado.`);
                          }}
                        >
                          <option value="published">Publicado</option>
                          <option value="draft">Borrador</option>
                          <option value="archived">Archivado</option>
                        </select>
                        <select
                          aria-label={`Disponibilidad de ${v.model}`}
                          className="admin-inline-select"
                          value={v.availability}
                          disabled={busy}
                          onChange={e=>{
                            const nextAvail=e.target.value as Vehicle["availability"];
                            task(async()=>{
                              await api(`admin/vehicles/${v.id}`,{
                                method:"PUT",
                                body:JSON.stringify({...v,availability:nextAvail})
                              });
                            },`Disponibilidad de ${v.model} actualizada.`);
                          }}
                        >
                          {Object.entries(availability).map(([key,label])=>(
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="admin-vehicle-price">{money(v.price,v.currency)}</div>
                      <div className="admin-row-actions">
                        <button
                          className={v.featured?"icon-button featured-star active":"icon-button featured-star"}
                          disabled={busy}
                          title={v.featured?"Quitar de destacados":"Destacar en el catálogo"}
                          aria-label={v.featured?`Quitar ${v.model} de destacados`:`Destacar ${v.model}`}
                          aria-pressed={v.featured}
                          onClick={()=>
                            task(async()=>{
                              await api(`admin/vehicles/${v.id}`,{
                                method:"PUT",
                                body:JSON.stringify({...v,featured:!v.featured})
                              });
                            },v.featured?`${v.model} ya no está destacado.`:`${v.model} marcado como destacado.`)
                          }
                        >
                          <Star size={16} fill={v.featured?"currentColor":"none"}/>
                        </button>
                        <button
                          className="icon-button"
                          title="Ficha QR Imprimible (Parabrisas)"
                          aria-label={`Ficha QR Imprimible para ${v.model}`}
                          onClick={()=>setQrVehicle(v)}
                        >
                          <QrCode size={16}/>
                        </button>
                        <button
                          className="icon-button"
                          title="Generar Flyer para Instagram Story"
                          aria-label={`Generar Flyer de Instagram para ${v.model}`}
                          onClick={()=>setFlyerVehicle(v)}
                        >
                          <Instagram size={16}/>
                        </button>
                        <button
                          className="icon-button"
                          title="Duplicar vehículo"
                          aria-label={`Duplicar ${v.model}`}
                          onClick={()=>{
                            const existingIds=new Set(data.vehicles.map(x=>x.id));
                            const copyId=slugifyVehicle(v.brand,v.model,`${v.version}-copia`,existingIds);
                            setEditor({
                              ...v,
                              id:copyId,
                              version:v.version?`${v.version} (Copia)`:"Copia",
                              status:"draft",
                              featured:false,
                              _etag:null
                            });
                          }}
                        >
                          <Copy size={15}/>
                        </button>
                        <button className="icon-button" aria-label={`Editar ${v.model}`} onClick={()=>setEditor(v)}>
                          <Pencil size={16}/>
                        </button>
                        <button
                          className="icon-button"
                          disabled={busy}
                          title={v.status==="archived"?"Restaurar como borrador":"Archivar"}
                          aria-label={`${v.status==="archived"?"Restaurar":"Archivar"} ${v.model}`}
                          onClick={()=>
                            task(async()=>{
                              await api(`admin/vehicles/${v.id}`,{
                                method:"PUT",
                                body:JSON.stringify({...v,status:v.status==="archived"?"draft":"archived"})
                              });
                            },v.status==="archived"?"Vehículo recuperado como borrador.":"Vehículo archivado. Podés recuperarlo desde Archivados.")
                          }
                        >
                          {v.status==="archived"?<RotateCcw size={17}/>:<Archive size={17}/>}
                        </button>
                        <button
                          className="icon-button danger"
                          disabled={busy}
                          title="Eliminar vehículo definitivamente"
                          aria-label={`Eliminar ${v.model}`}
                          onClick={()=>setDeleteTarget(v)}
                        >
                          <Trash2 size={15}/>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {visibleVehicles.length===0&&(
                <div className="admin-empty">
                  <CarFront size={32}/>
                  <h3>No hay vehículos en esta vista.</h3>
                  <p>Probá otros filtros o agregá un vehículo al garage.</p>
                  <button className="button small" onClick={()=>setEditor(emptyVehicle())}>
                    <Plus size={16}/> Nuevo vehículo
                  </button>
                </div>
              )}
              <p className="muted admin-hint">
                Desde cada fila podés cambiar estado, disponibilidad, destacar (★), imprimir la hoja QR de parabrisas, crear una Story IG o duplicar la unidad.
              </p>
            </>
          )}

          {tab==="inquiries"&&(
            <>
              <div className="lead-tools">
                <label className="search-box">
                  <Search size={17}/>
                  <input
                    aria-label="Buscar consultas"
                    placeholder="Buscar por nombre, teléfono, mensaje o notas internas"
                    value={leadSearch}
                    onChange={e=>setLeadSearch(e.target.value)}
                  />
                </label>
                <div className="lead-tabs">
                  {[
                    ["all","Todas"],
                    ["new","Nuevas"],
                    ["contacted","Contactadas"],
                    ["closed","Cerradas"]
                  ].map(([key,label])=>(
                    <button
                      key={key}
                      aria-pressed={leadStatus===key}
                      className={leadStatus===key?"active":""}
                      onClick={()=>setLeadStatus(key)}
                    >
                      {label}
                      <span>{key==="all"?data.inquiries.length:data.inquiries.filter(q=>q.status===key).length}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="inquiry-list">
                {visibleInquiries.length===0?(
                  <div className="admin-empty">
                    <MessageCircle size={28}/>
                    <h3>No hay consultas en esta vista.</h3>
                    <p>Las consultas de tus clientes aparecerán acá.</p>
                  </div>
                ):(
                  visibleInquiries.map(q=>{
                    const linkedCar=q.vehicleId?data.vehicles.find(v=>v.id===q.vehicleId):undefined;
                    const draftNote=noteDrafts[q.id]!==undefined?noteDrafts[q.id]:(q.notes||"");
                    const noteChanged=draftNote!==(q.notes||"");
                    return (
                      <article className={`inquiry-card inquiry-${q.status}`} key={q.id}>
                        <div className="inquiry-header">
                          <div>
                            <h3>{q.name}</h3>
                            <span>
                              {q.phone} · {new Date(q.createdAt).toLocaleString("es-PY",{timeZone:"America/Asuncion"})}
                            </span>
                          </div>
                          <select
                            aria-label={`Estado de consulta de ${q.name}`}
                            value={q.status}
                            disabled={busy}
                            onChange={e=>
                              task(async()=>{
                                await api(`admin/inquiries/${q.id}`,{
                                  method:"PATCH",
                                  body:JSON.stringify({status:e.target.value,_etag:q._etag})
                                });
                              })
                            }
                          >
                            <option value="new">Nueva</option>
                            <option value="contacted">Contactada</option>
                            <option value="closed">Cerrada</option>
                          </select>
                        </div>

                        <div className="inquiry-badge-row">
                          <span className="inquiry-type">
                            {q.type==="consignment"
                              ?"VENTA / CONSIGNACIÓN"
                              :q.type==="import"
                                ?"IMPORTACIÓN A PEDIDO"
                                :linkedCar
                                  ?`VEHÍCULO: ${linkedCar.brand} ${linkedCar.model}`
                                  :"CONSULTA GENERAL"}
                          </span>
                          {linkedCar&&(
                            <a className="inquiry-car-chip" href={`/vehiculos/${linkedCar.id}`} target="_blank" rel="noreferrer">
                              {linkedCar.images[0]?.url&&<img src={linkedCar.images[0].url} alt=""/>}
                              <span>Ver {linkedCar.brand} {linkedCar.model}</span>
                              <ArrowUpRight size={12}/>
                            </a>
                          )}
                        </div>

                        <p>{q.message}</p>

                        <div className="inquiry-notes-box">
                          <label>
                            Notas internas de seguimiento
                            <textarea
                              rows={2}
                              placeholder="Anotá acuerdos, tasación, horario de visita o próximos pasos con este cliente…"
                              value={draftNote}
                              onChange={e=>setNoteDrafts(prev=>({...prev,[q.id]:e.target.value}))}
                            />
                          </label>
                          {noteChanged&&(
                            <button
                              type="button"
                              className="button small secondary"
                              disabled={busy}
                              onClick={()=>
                                task(async()=>{
                                  await api(`admin/inquiries/${q.id}`,{
                                    method:"PATCH",
                                    body:JSON.stringify({notes:draftNote,_etag:q._etag})
                                  });
                                },"Nota interna guardada.")
                              }
                            >
                              <Check size={14}/> Guardar nota
                            </button>
                          )}
                        </div>

                        <div className="inquiry-actions">
                          <a
                            className="text-link"
                            target="_blank"
                            rel="noreferrer"
                            href={whatsapp(
                              q.phone.replace(/\D/g,""),
                              `Hola ${q.name}, te contactamos de Dream Cars PY por tu consulta${linkedCar?` sobre el ${linkedCar.brand} ${linkedCar.model}`:""}. ¿Cómo estás?`
                            )}
                          >
                            <MessageCircle size={15}/> Responder por WhatsApp <ArrowUpRight size={15}/>
                          </a>
                          <button className="text-button danger" onClick={()=>setErase(q)}>
                            <Trash2 size={14}/> Eliminar datos
                          </button>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </>
          )}

          {tab==="account"&&<AccountForm session={session} onSaved={load} onLogout={signOut}/>}

          {tab==="settings"&&(
            <SettingsForm
              value={data.settings}
              busy={busy}
              onSave={value=>
                task(async()=>{
                  await api("admin/settings",{method:"PUT",body:JSON.stringify(value)});
                })
              }
            />
          )}

          {tab==="integrations"&&(
            <>
              <div className="integration-status">
                <Cloud size={32}/>
                <div>
                  <h2>Cloudinary</h2>
                  <p>{data.cloudinary.configured?`Cuenta conectada: ${data.cloudinary.cloudName}`:"Opcional — usando almacenamiento directo del servidor"}</p>
                </div>
                <span className={data.cloudinary.configured?"connection-pill connected":"connection-pill"}>
                  {data.cloudinary.configured?"Conectado":"Modo local activo"}
                </span>
              </div>
              <div className="integration-layout">
                <form
                  className="admin-form"
                  onSubmit={e=>{
                    e.preventDefault();
                    const form=e.currentTarget;
                    const fd=new FormData(form);
                    task(async()=>{
                      await api("admin/cloudinary",{method:"POST",body:JSON.stringify(Object.fromEntries(fd))});
                      form.reset();
                    },"Cloudinary conectado. Ya podés subir fotos y migrar las originales.");
                  }}
                >
                  <h3>{data.cloudinary.configured?"Actualizar conexión":"Conectar tu cuenta"}</h3>
                  <p>Copiá estos datos desde Settings → API Keys de tu cuenta Cloudinary.</p>
                  <label>
                    Cloud name
                    <input name="cloudName" required autoComplete="off" defaultValue={data.cloudinary.cloudName}/>
                  </label>
                  <label>
                    API key
                    <input name="apiKey" required autoComplete="off"/>
                  </label>
                  <label>
                    API secret
                    <input name="apiSecret" type="password" required autoComplete="new-password" minLength={10}/>
                  </label>
                  <button className="button" disabled={busy}>
                    {busy?"Validando…":"Guardar conexión"}
                    <ShieldCheck size={17}/>
                  </button>
                  <p className="muted">
                    El secreto se cifra en el servidor y nunca se devuelve al navegador. Las fotos se suben directamente a Cloudinary con firma temporal.
                  </p>
                </form>

                <div className="integration-guide">
                  <p className="eyebrow lime">UN SOLO LUGAR PARA TUS FOTOS</p>
                  <h3>Del garage<br/>a la nube.</h3>
                  <ol>
                    <li>Creá una cuenta en <a href="https://cloudinary.com/users/register_free" target="_blank" rel="noreferrer">Cloudinary ↗</a>.</li>
                    <li>Ingresá las credenciales en este formulario.</li>
                    <li>Migrá las fotos originales del catálogo.</li>
                    <li>Subí nuevas imágenes desde cada vehículo.</li>
                  </ol>
                  <button
                    className="button secondary"
                    disabled={busy||!data.cloudinary.configured||!data.vehicles.some(v=>v.images.some(i=>i.url.startsWith("/media/")))}
                    onClick={()=>
                      task(async()=>{
                        let currentSettings=data.settings;
                        let migrated=0;
                        for(const v of data.vehicles){
                          let changed=false;
                          const images=[];
                          for(const img of v.images){
                            if(img.url.startsWith("/media/")){
                              setNotice(`Migrando fotos… ${migrated+1}`);
                              const response=await fetch(img.url);
                              if(!response.ok)throw new Error(`No se pudo leer ${img.url}`);
                              let blob=await response.blob();
                              if(!blob.type.startsWith("image/"))blob=new Blob([blob],{type:"image/jpeg"});
                              const next=await uploadImage(blob,true,true);
                              images.push(next);
                              changed=true;
                              migrated++;
                              if(currentSettings.heroImage===img.url)currentSettings={...currentSettings,heroImage:next.url};
                            }else images.push(img);
                          }
                          if(changed)await api(`admin/vehicles/${v.id}`,{method:"PUT",body:JSON.stringify({...v,images})});
                        }
                        if(currentSettings.heroImage!==data.settings.heroImage)
                          await api("admin/settings",{method:"PUT",body:JSON.stringify(currentSettings)});
                      },"Fotos originales migradas a Cloudinary.")
                    }
                  >
                    <Upload size={17}/> Migrar fotos originales
                  </button>
                </div>
              </div>
            </>
          )}

          {tab==="backups"&&(
            <div className="backup-grid">
              <article className="admin-form">
                <Download size={32} className="lime"/>
                <h2>Descargá tus JSON.</h2>
                <p>
                  Un archivo con todos los vehículos, datos del negocio y consultas. Incluye borradores y archivados; las fotos permanecen en Cloudinary y se conserva su URL.
                </p>
                <a className="button" href="/api/admin/backup" download>
                  Descargar respaldo <Download size={17}/>
                </a>
                <p className="muted">
                  No incluye credenciales privadas. Guardá el archivo en un lugar seguro: contiene datos de contacto de tus consultas.
                </p>
              </article>
              <article className="admin-form">
                <Upload size={32} className="lime"/>
                <h2>Recuperá un respaldo.</h2>
                <p>
                  Importá un respaldo generado por este panel. Verás su contenido antes de continuar. Los registros del archivo se combinan por identificador y los demás se conservan.
                </p>
                <label className="button secondary file-button">
                  Elegir archivo JSON
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={async e=>{
                      const f=e.target.files?.[0];
                      if(!f)return;
                      if(f.size>2000000){setError("El respaldo supera los 2 MB.");return;}
                      try{
                        const value=JSON.parse(await f.text());
                        if(value.schemaVersion!==1||!Array.isArray(value.vehicles)||!Array.isArray(value.inquiries)||!value.settings)
                          throw new Error("Formato de respaldo inválido.");
                        setRestore(value);
                      }catch(e){
                        setError((e as Error).message);
                      }
                      e.target.value="";
                    }}
                  />
                </label>
              </article>
              <article className="backup-explainer">
                <FileJson size={26}/>
                <div>
                  <h3>Archivos reales. Almacenamiento persistente.</h3>
                  <p>
                    Cada vehículo y consulta se guarda como un archivo .json en almacenamiento privado R2. Cada edición conserva hasta 10 copias anteriores. El catálogo usa los JSON iniciales del proyecto hasta que guardás cambios.
                  </p>
                </div>
              </article>
            </div>
          )}
        </main>
      </div>

      {editor&&(
        <VehicleEditor
          initial={editor}
          cloudinary={data.cloudinary.configured}
          onClose={()=>setEditor(null)}
          onOpenFlyer={v=>setFlyerVehicle(v)}
          onOpenQr={v=>setQrVehicle(v)}
          onSave={async v=>{
            const isBrandNew=editor._etag===null&&!editor.brand;
            const existingIds=new Set(data.vehicles.map(x=>x.id));
            const finalId=isBrandNew?slugifyVehicle(v.brand,v.model,v.version,existingIds):v.id;
            await api(`admin/vehicles/${finalId}`,{method:"PUT",body:JSON.stringify({...v,id:finalId})});
            await load();
            setEditor(null);
            setNotice("Ficha guardada. Los cambios ya están en el catálogo.");
          }}
        />
      )}

      {flyerVehicle&&(
        <StoryFlyerModal
          vehicle={flyerVehicle}
          settings={data.settings}
          onClose={()=>setFlyerVehicle(null)}
        />
      )}

      {qrVehicle&&(
        <QrSheetModal
          vehicle={qrVehicle}
          settings={data.settings}
          onClose={()=>setQrVehicle(null)}
        />
      )}

      {deleteTarget&&(
        <Modal title="Eliminar vehículo definitivamente" onClose={()=>setDeleteTarget(null)}>
          <p className="modal-description">
            ¿Estás seguro de eliminar <strong>{deleteTarget.brand} {deleteTarget.model}</strong> ({deleteTarget.version}) de forma permanente? Si solo querés ocultarlo temporalmente del catálogo público, podés archivarlo.
          </p>
          <div style={{display:"flex",gap:"12px"}}>
            <button type="button" className="button secondary" onClick={()=>setDeleteTarget(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="button danger-button"
              disabled={busy}
              onClick={()=>
                task(async()=>{
                  await api(`admin/vehicles/${deleteTarget.id}`,{
                    method:"DELETE",
                    body:JSON.stringify({_etag:deleteTarget._etag})
                  });
                  setDeleteTarget(null);
                },"Vehículo eliminado permanentemente.")
              }
            >
              Eliminar vehículo <Trash2 size={16}/>
            </button>
          </div>
        </Modal>
      )}

      {restore&&(
        <Modal title="Revisá el respaldo" onClose={()=>setRestore(null)}>
          <p className="modal-description">
            {restore.vehicles.length} vehículos · {restore.inquiries.length} consultas · datos de {restore.settings.name}
          </p>
          <p className="muted">
            Se actualizarán los registros que compartan identificador. Antes de cada cambio se guarda una copia del archivo anterior. Una interrupción puede completar solo parte de la importación; podés repetirla.
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={()=>
              task(async()=>{
                await api("admin/restore",{method:"POST",body:JSON.stringify(restore)});
                setRestore(null);
              },"Respaldo combinado correctamente.")
            }
          >
            Importar y combinar <Upload size={17}/>
          </button>
        </Modal>
      )}

      {erase&&(
        <Modal title="Eliminar datos de la consulta" onClose={()=>setErase(null)}>
          <p className="modal-description">
            Se eliminará la consulta de {erase.name} y sus copias internas. Los respaldos que descargaste se gestionan por separado.
          </p>
          <button
            className="button danger-button"
            disabled={busy}
            onClick={()=>
              task(async()=>{
                await api(`admin/inquiries/${erase.id}`,{method:"DELETE",body:JSON.stringify({_etag:erase._etag})});
                setErase(null);
              },"Consulta y copias internas eliminadas.")
            }
          >
            Eliminar consulta <Trash2 size={16}/>
          </button>
        </Modal>
      )}
    </div>
  );
}

function SettingsForm({value,busy,onSave}:{value:Stored<Settings>;busy:boolean;onSave:(v:Stored<Settings>)=>void}){
  const fields:[keyof Settings,string,string?][]=[
    ["name","Nombre del negocio"],
    ["tagline","Lema"],
    ["address","Dirección"],
    ["city","Ciudad y país"],
    ["whatsapp","WhatsApp (solo números, con código de país)"],
    ["instagram","Enlace de Instagram"],
    ["email","Correo comercial (opcional)","email"],
    ["hours","Horarios / coordinación de visitas"],
    ["exchangeRate","Cotización referencial 1 USD en PYG (Gs.)","number"],
    ["logo","URL del logo"],
    ["heroImage","URL de la imagen principal"]
  ];
  return (
    <form
      className="admin-form settings-form"
      key={value._etag}
      onSubmit={e=>{
        e.preventDefault();
        const fd=new FormData(e.currentTarget);
        const raw=Object.fromEntries(fd);
        onSave({
          ...value,
          ...raw,
          exchangeRate:raw.exchangeRate?Number(raw.exchangeRate):REFERENCE_PYG_RATE
        } as Stored<Settings>);
      }}
    >
      <div className="form-two">
        {fields.map(([key,label,type])=>(
          <label key={key}>
            {label}
            <input
              name={key}
              type={type||"text"}
              defaultValue={key==="exchangeRate"?(value.exchangeRate??REFERENCE_PYG_RATE):String(value[key]??"")}
              required={key!=="email"&&key!=="exchangeRate"}
            />
          </label>
        ))}
      </div>
      <label>
        La historia del negocio
        <textarea name="about" rows={5} defaultValue={value.about}/>
      </label>
      <button className="button" disabled={busy}>
        {busy?"Guardando…":"Guardar datos del negocio"}
        <Check size={17}/>
      </button>
    </form>
  );
}

function VehicleEditor({
  initial,
  cloudinary,
  onClose,
  onSave,
  onOpenFlyer,
  onOpenQr
}:{
  initial:Stored<Vehicle>;
  cloudinary:boolean;
  onClose:()=>void;
  onSave:(v:Stored<Vehicle>)=>Promise<void>;
  onOpenFlyer:(v:Stored<Vehicle>)=>void;
  onOpenQr:(v:Stored<Vehicle>)=>void;
}){
  const [v,setV]=useState(initial);
  const [busy,setBusy]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [optimizeWebp,setOptimizeWebp]=useState(true);
  const [dragIdx,setDragIdx]=useState<number|null>(null);
  const [error,setError]=useState("");
  const [dirty,setDirty]=useState(false);
  const [leavePrompt,setLeavePrompt]=useState(false);

  const requestClose=()=>{
    if(busy||uploading)return;
    if(dirty)setLeavePrompt(true);
    else onClose();
  };
  const set=(key:keyof Vehicle,value:unknown)=>{
    setDirty(true);
    setV(old=>({...old,[key]:value}));
  };
  const moveImage=(from:number,to:number)=>{
    if(to<0||to>=v.images.length||from===to)return;
    const next=[...v.images];
    const [picked]=next.splice(from,1);
    next.splice(to,0,picked);
    set("images",next);
  };

  const fields:[keyof Vehicle,string,string?][]=[
    ["brand","Marca"],
    ["model","Modelo"],
    ["version","Versión"],
    ["year","Año","number"],
    ["mileage","Kilometraje","number"],
    ["price","Precio (vacío = a consultar)","number"],
    ["engine","Motor"],
    ["transmission","Transmisión"],
    ["fuel","Combustible"],
    ["drive","Tracción"],
    ["color","Color"]
  ];

  return (
    <Modal title={initial.brand?`Editar ${initial.brand} ${initial.model}`:"Una nueva leyenda."} wide onClose={requestClose}>
      <form
        className="vehicle-editor"
        onChange={()=>setDirty(true)}
        onSubmit={async e=>{
          e.preventDefault();
          setBusy(true);
          setError("");
          try{
            await onSave(v);
          }catch(e){
            setError((e as Error).message);
          }finally{
            setBusy(false);
          }
        }}
      >
        <div className="form-two">
          {fields.map(([key,label,type])=>(
            <label key={key}>
              {label}
              <input
                type={type||"text"}
                required={key==="brand"||key==="model"}
                min={type==="number"?(key==="year"?1900:0):undefined}
                max={key==="year"?2100:undefined}
                value={String(v[key]??"")}
                onChange={e=>
                  set(key,type==="number"?(e.target.value===""?null:Number(e.target.value)):e.target.value)
                }
              />
            </label>
          ))}
          <label>
            Moneda
            <select value={v.currency} onChange={e=>set("currency",e.target.value)}>
              <option value="USD">Dólares (USD)</option>
              <option value="PYG">Guaraníes (PYG)</option>
            </select>
          </label>
          <label>
            Carrocería
            <select value={v.body} onChange={e=>set("body",e.target.value)}>
              {["Sedán","Coupé","Roadster","Hatchback","SUV","Pick-up","Familiar","Otro"].map(b=>(
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <label>
            Publicación
            <select value={v.status} onChange={e=>set("status",e.target.value)}>
              <option value="draft">Borrador</option>
              <option value="published">Publicado</option>
              <option value="archived">Archivado</option>
            </select>
          </label>
          <label>
            Disponibilidad
            <select value={v.availability} onChange={e=>set("availability",e.target.value)}>
              {Object.entries(availability).map(([key,label])=>(
                <option value={key} key={key}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Enlace de publicación / Video (Instagram, YouTube, TikTok)
            <input type="url" value={v.sourceUrl} onChange={e=>set("sourceUrl",e.target.value)} placeholder="https://..."/>
          </label>
        </div>

        <label>
          Descripción
          <textarea rows={5} value={v.description} maxLength={6000} onChange={e=>set("description",e.target.value)}/>
        </label>
        <label>
          Equipamiento (un detalle por línea)
          <textarea
            rows={3}
            defaultValue={v.features.join("\n")}
            onChange={e=>set("features",e.target.value.split("\n").filter(Boolean))}
          />
        </label>
        <label className="check-label">
          <input type="checkbox" checked={v.featured} onChange={e=>set("featured",e.target.checked)}/>
          Destacar en el catálogo
        </label>

        <div className="editor-gallery">
          <div className="admin-section-head">
            <h3>Galería <small>{v.images.length}/20</small></h3>
            <div className="editor-gallery-actions">
              <label className="check-label webp-toggle">
                <input type="checkbox" checked={optimizeWebp} onChange={e=>setOptimizeWebp(e.target.checked)}/>
                <span>Optimizar a WebP al subir</span>
              </label>
              <label className="button small secondary file-button">
                <ImagePlus size={16}/>
                {uploading?"Subiendo…":"Subir fotos"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                  multiple
                  disabled={uploading||busy}
                  onChange={async e=>{
                    const files=Array.from(e.target.files??[]);
                    if(files.length+v.images.length>20){
                      setError("Podés guardar hasta 20 fotos por vehículo.");
                      return;
                    }
                    setUploading(true);
                    setError("");
                    try{
                      for(const f of files){
                        const image=await uploadImage(f,optimizeWebp,cloudinary);
                        setDirty(true);
                        setV(prev=>({...prev,images:[...prev.images,image]}));
                      }
                    }catch(e){
                      setError((e as Error).message);
                    }finally{
                      setUploading(false);
                      e.target.value="";
                    }
                  }}
                />
              </label>
            </div>
          </div>
          {!cloudinary&&(
            <p className="muted">
              Subida directa al servidor habilitada. Si conectás Cloudinary en Integraciones, las nuevas fotos se alojarán en tu cuenta Cloudinary.
            </p>
          )}
          <div className="editor-images">
            {v.images.map((img,i)=>(
              <div
                key={img.url+i}
                draggable={!uploading}
                onDragStart={()=>setDragIdx(i)}
                onDragOver={e=>e.preventDefault()}
                onDrop={()=>{
                  if(dragIdx!==null&&dragIdx!==i)moveImage(dragIdx,i);
                  setDragIdx(null);
                }}
              >
                <img src={img.url} alt={`Foto ${i+1}`}/>
                <span>{i===0?"PORTADA":String(i+1)}</span>
                <div className="editor-image-controls">
                  <button
                    type="button"
                    aria-label={`Mover foto ${i+1} al inicio`}
                    onClick={()=>moveImage(i,0)}
                    disabled={uploading||i===0}
                  >
                    Portada
                  </button>
                  <button
                    type="button"
                    aria-label={`Mover foto ${i+1} a la izquierda`}
                    onClick={()=>moveImage(i,i-1)}
                    disabled={uploading||i===0}
                  >
                    <ArrowLeft size={12}/>
                  </button>
                  <button
                    type="button"
                    aria-label={`Mover foto ${i+1} a la derecha`}
                    onClick={()=>moveImage(i,i+1)}
                    disabled={uploading||i===v.images.length-1}
                  >
                    <ArrowRight size={12}/>
                  </button>
                  <button
                    type="button"
                    aria-label={`Quitar foto ${i+1}`}
                    onClick={()=>set("images",v.images.filter((_,j)=>j!==i))}
                    disabled={uploading}
                  >
                    <X size={14}/>
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="muted">
            Arrastrá las fotos o usá las flechas para ordenarlas. La primera imagen es la portada.
          </p>
        </div>

        {error&&<div className="feedback error" role="alert">{error}</div>}
        {leavePrompt&&(
          <div className="discard-prompt" role="alert">
            <div>
              <strong>Tenés cambios sin guardar.</strong>
              <p>Guardalos para conservarlos o descartalos para salir.</p>
            </div>
            <button type="button" className="text-button" onClick={()=>setLeavePrompt(false)}>
              Seguir editando
            </button>
            <button type="button" className="button small danger-button" onClick={onClose}>
              Descartar cambios
            </button>
          </div>
        )}
        <div className="editor-footer">
          <span className="editor-save-status">{dirty?"Cambios pendientes":"Ficha sin cambios"}</span>
          {v.images.length>0&&v.brand&&v.model&&(
            <>
              <button type="button" className="button secondary small" onClick={()=>onOpenQr(v)}>
                <QrCode size={15}/> Ficha QR
              </button>
              <button type="button" className="button secondary small" onClick={()=>onOpenFlyer(v)}>
                <Sparkles size={15}/> Story IG
              </button>
            </>
          )}
          <button type="button" className="button secondary" onClick={requestClose} disabled={busy||uploading}>
            Cancelar
          </button>
          <button className="button" disabled={busy||uploading}>
            {busy?"Guardando…":"Guardar vehículo"}
            <Check size={17}/>
          </button>
        </div>
      </form>
    </Modal>
  );
}

function StoryFlyerModal({
  vehicle,
  settings,
  onClose
}:{
  vehicle:Stored<Vehicle>;
  settings:Stored<Settings>;
  onClose:()=>void;
}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [badgeText,setBadgeText]=useState(vehicle.featured?"SELECCIÓN DREAM CARS":"EN EL GARAGE");
  const [showPrice,setShowPrice]=useState(true);
  const [photoIdx,setPhotoIdx]=useState(0);
  const [rendering,setRendering]=useState(true);

  useEffect(()=>{
    let cancelled=false;
    const draw=async()=>{
      setRendering(true);
      const canvas=canvasRef.current;
      if(!canvas)return;
      const ctx=canvas.getContext("2d");
      if(!ctx)return;

      const W=1080;
      const H=1920;
      canvas.width=W;
      canvas.height=H;

      // Dark editorial background
      const grad=ctx.createLinearGradient(0,0,0,H);
      grad.addColorStop(0,"#101010");
      grad.addColorStop(0.55,"#161616");
      grad.addColorStop(1,"#0c0c0c");
      ctx.fillStyle=grad;
      ctx.fillRect(0,0,W,H);

      // Subtle frame border
      ctx.strokeStyle="#2d2d2d";
      ctx.lineWidth=2;
      ctx.strokeRect(48,48,W-96,H-96);

      // Header bar
      ctx.fillStyle="#f0eee8";
      ctx.font="700 32px 'Barlow Condensed', Arial, sans-serif";
      ctx.fillText("DREAM CARS_PY",88,122);

      ctx.fillStyle="#9e9e9e";
      ctx.font="600 18px 'Manrope', Arial, sans-serif";
      ctx.fillText("LUQUE · PARAGUAY · PRESERVAMOS LEYENDAS",88,156);

      // Badge pill on top right
      const pillLabel=(badgeText||"COLECCIÓN").toUpperCase();
      ctx.font="700 18px 'Manrope', Arial, sans-serif";
      const pillW=Math.max(200,ctx.measureText(pillLabel).width+48);
      ctx.fillStyle="#f0eee8";
      ctx.fillRect(W-88-pillW,94,pillW,48);
      ctx.fillStyle="#111111";
      ctx.fillText(pillLabel,W-88-pillW+24,124);

      // Load car image
      const photoUrl=vehicle.images[photoIdx]?.url||vehicle.images[0]?.url||"/media/showroom.jpg";
      const img=await new Promise<HTMLImageElement|null>(resolve=>{
        const image=new Image();
        image.crossOrigin="anonymous";
        image.onload=()=>resolve(image);
        image.onerror=()=>resolve(null);
        image.src=photoUrl;
      });
      if(cancelled)return;

      const imgX=88;
      const imgY=205;
      const imgW=W-176;
      const imgH=840;

      ctx.fillStyle="#1d1d1d";
      ctx.fillRect(imgX,imgY,imgW,imgH);

      if(img){
        const scale=Math.max(imgW/img.width,imgH/img.height);
        const sw=imgW/scale;
        const sh=imgH/scale;
        const sx=(img.width-sw)/2;
        const sy=(img.height-sh)/2;
        ctx.drawImage(img,sx,sy,sw,sh,imgX,imgY,imgW,imgH);
      }

      // Availability tag over photo bottom-left
      const availLabel=availability[vehicle.availability].toUpperCase();
      ctx.fillStyle="rgba(16,16,16,0.88)";
      ctx.fillRect(imgX+28,imgY+imgH-74,340,48);
      ctx.fillStyle=vehicle.availability==="available"?"#b4d49b":"#f0eee8";
      ctx.beginPath();
      ctx.arc(imgX+52,imgY+imgH-50,6,0,Math.PI*2);
      ctx.fill();
      ctx.fillStyle="#f4f3ef";
      ctx.font="700 18px 'Manrope', Arial, sans-serif";
      ctx.fillText(availLabel,imgX+70,imgY+imgH-43);

      // Brand & Model typography
      ctx.fillStyle="#b8b8b8";
      ctx.font="700 24px 'Manrope', Arial, sans-serif";
      ctx.fillText(`${vehicle.brand.toUpperCase()}  /  ${(vehicle.body||"COLECCIÓN").toUpperCase()}`,88,1125);

      ctx.fillStyle="#f4f3ef";
      ctx.font="700 92px 'Barlow Condensed', Impact, sans-serif";
      ctx.fillText(vehicle.model.toUpperCase().slice(0,22),88,1220);

      if(vehicle.version){
        ctx.fillStyle="#a8a8a8";
        ctx.font="500 30px 'Manrope', Arial, sans-serif";
        ctx.fillText(vehicle.version.slice(0,42),88,1270);
      }

      // Specs divider & 6-cell grid
      ctx.strokeStyle="#333333";
      ctx.beginPath();
      ctx.moveTo(88,1315);
      ctx.lineTo(W-88,1315);
      ctx.stroke();

      const specs:[string,string][]=[
        ["AÑO",String(vehicle.year||"A confirmar")],
        ["KILOMETRAJE",vehicle.mileage!==null?`${vehicle.mileage.toLocaleString("es-PY")} km`:"A confirmar"],
        ["MOTOR",vehicle.engine||"A confirmar"],
        ["TRANSMISIÓN",vehicle.transmission||"A confirmar"],
        ["TRACCIÓN",vehicle.drive||"A confirmar"],
        ["COLOR",vehicle.color||"A confirmar"]
      ];

      const colW=(W-176)/3;
      specs.forEach(([label,val],idx)=>{
        const col=idx%3;
        const row=Math.floor(idx/3);
        const x=88+col*colW;
        const y=1365+row*125;
        ctx.fillStyle="#8a8a8a";
        ctx.font="700 17px 'Manrope', Arial, sans-serif";
        ctx.fillText(label,x,y);
        ctx.fillStyle="#f0eee8";
        ctx.font="600 26px 'Manrope', Arial, sans-serif";
        ctx.fillText(String(val).slice(0,18),x,y+40);
      });

      // Bottom price & CTA band
      ctx.fillStyle="#1c1c1c";
      ctx.fillRect(88,1640,W-176,175);
      ctx.strokeStyle="#3b3b3b";
      ctx.strokeRect(88,1640,W-176,175);

      ctx.fillStyle="#9a9a9a";
      ctx.font="700 18px 'Manrope', Arial, sans-serif";
      ctx.fillText(showPrice?"VALOR DE REFERENCIA":"ATENCIÓN PERSONALIZADA",128,1695);

      ctx.fillStyle="#f4f3ef";
      ctx.font="700 54px 'Barlow Condensed', Arial, sans-serif";
      ctx.fillText(showPrice?money(vehicle.price,vehicle.currency):"CONSULTAR CON EL EQUIPO",128,1765);

      ctx.fillStyle="#b8b8b8";
      ctx.font="600 22px 'Manrope', Arial, sans-serif";
      ctx.textAlign="right";
      ctx.fillText("@dreamcars_py",W-128,1715);
      ctx.fillStyle="#888888";
      ctx.font="500 19px 'Manrope', Arial, sans-serif";
      ctx.fillText(`+${settings.whatsapp}`,W-128,1755);
      ctx.textAlign="left";

      setRendering(false);
    };
    draw();
    return()=>{cancelled=true;};
  },[vehicle,settings,badgeText,showPrice,photoIdx]);

  return (
    <Modal title={`Story IG · ${vehicle.brand} ${vehicle.model}`} wide onClose={onClose}>
      <div className="flyer-generator-grid">
        <div className="flyer-preview-col">
          <canvas ref={canvasRef} className="flyer-canvas"/>
        </div>
        <div className="flyer-controls-col">
          <p className="modal-description">
            Generá una placa vertical de <strong>1080 × 1920 px</strong> con la identidad de Dream Cars PY lista para publicar en Instagram Stories o enviar por WhatsApp.
          </p>
          <label>
            Etiqueta superior
            <input
              value={badgeText}
              maxLength={28}
              onChange={e=>setBadgeText(e.target.value)}
              placeholder="Ej. RECIÉN LLEGADO / SELECCIÓN JDM"
            />
          </label>
          {vehicle.images.length>1&&(
            <label>
              Fotografía a mostrar
              <select value={photoIdx} onChange={e=>setPhotoIdx(Number(e.target.value))}>
                {vehicle.images.map((_,idx)=>(
                  <option key={idx} value={idx}>Foto {idx+1}{idx===0?" (Portada)":""}</option>
                ))}
              </select>
            </label>
          )}
          <label className="check-label">
            <input type="checkbox" checked={showPrice} onChange={e=>setShowPrice(e.target.checked)}/>
            <span>Mostrar precio ({money(vehicle.price,vehicle.currency)}) en el flyer</span>
          </label>
          <button
            type="button"
            className="button"
            disabled={rendering}
            onClick={()=>{
              const canvas=canvasRef.current;
              if(!canvas)return;
              const url=canvas.toDataURL("image/png");
              const a=document.createElement("a");
              a.href=url;
              a.download=`dreamcars-story-${vehicle.id}.png`;
              a.click();
            }}
          >
            <Download size={17}/> Descargar Story PNG (1080×1920)
          </button>
        </div>
      </div>
    </Modal>
  );
}
