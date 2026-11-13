"use client";
import {useEffect,useRef,useState} from "react";
import {ArrowLeft,ArrowUpRight,Calculator,Calendar,Check,ChevronLeft,ChevronRight,Maximize2,MessageCircle,QrCode,Share2,X,ZoomIn,ZoomOut} from "lucide-react";
import type {Vehicle,Settings} from "../lib/types";
import seedSettings from "../data/settings.json";
import {api,availability,ContactForm,convertMoney,Footer,Header,Modal,money,QrSheetModal,REFERENCE_PYG_RATE,trackVehicleMetric,whatsapp} from "./components";

export default function VehicleDetail({
  id,
  initialSettings,
  initialVehicle,
  initialRelated
}:{
  id:string;
  initialSettings?:Settings;
  initialVehicle?:Vehicle|null;
  initialRelated?:Vehicle[];
}){
  const hasSSR=initialVehicle!==undefined;
  const [settings,setSettings]=useState<Settings>(initialSettings??seedSettings);
  const [vehicle,setVehicle]=useState<Vehicle|null>(initialVehicle??null);
  const [related,setRelated]=useState<Vehicle[]>(initialRelated??[]);
  const [loading,setLoading]=useState(!hasSSR);
  const [error,setError]=useState("");

  const [index,setIndex]=useState(0);
  const [lightbox,setLightbox]=useState(false);
  const [zoomed,setZoomed]=useState(false);
  const [contact,setContact]=useState(false);
  const [visitModal,setVisitModal]=useState(false);
  const [qrModal,setQrModal]=useState(false);
  const [shared,setShared]=useState(false);
  const [shareNotice,setShareNotice]=useState("");

  // Simulator state
  const [showSimulator,setShowSimulator]=useState(false);
  const [simPriceUsd,setSimPriceUsd]=useState<number>(25000);
  const [downPaymentPercent,setDownPaymentPercent]=useState<number>(40);
  const [months,setMonths]=useState<number>(24);
  const [hasTradeIn,setHasTradeIn]=useState<boolean>(false);

  const touchStartX=useRef<number|null>(null);
  const exchangeRate=settings.exchangeRate||REFERENCE_PYG_RATE;

  useEffect(()=>{
    if(hasSSR)return;
    api("catalog")
      .then(d=>{
        setSettings(d.settings);
        const found=d.vehicles.find((v:Vehicle)=>v.id===id)||null;
        setVehicle(found);
        const others=d.vehicles
          .filter((v:Vehicle)=>v.id!==id)
          .sort((a:Vehicle,b:Vehicle)=>{
            const sA=(found&&a.brand===found.brand?2:0)+(found&&a.body===found.body?1:0)+(a.featured?0.5:0);
            const sB=(found&&b.brand===found.brand?2:0)+(found&&b.body===found.body?1:0)+(b.featured?0.5:0);
            return sB-sA;
          })
          .slice(0,3);
        setRelated(others);
      })
      .catch(e=>setError(e.message))
      .finally(()=>setLoading(false));
  },[id,hasSSR]);

  useEffect(()=>{
    if(vehicle?.id){
      trackVehicleMetric(vehicle.id,"view");
    }
    if(vehicle?.price){
      const usdVal=vehicle.currency==="PYG"?Math.round(vehicle.price/exchangeRate):vehicle.price;
      setSimPriceUsd(usdVal);
    }
  },[vehicle?.id,vehicle?.price,vehicle?.currency,exchangeRate]);

  const totalImages=vehicle?.images.length??0;
  const prevPhoto=()=>{
    if(totalImages<=1)return;
    setZoomed(false);
    setIndex(i=>(i-1+totalImages)%totalImages);
  };
  const nextPhoto=()=>{
    if(totalImages<=1)return;
    setZoomed(false);
    setIndex(i=>(i+1)%totalImages);
  };

  useEffect(()=>{
    if(!lightbox)return;
    const onKey=(e:KeyboardEvent)=>{
      if(e.key==="Escape"){setLightbox(false);setZoomed(false);}
      else if(e.key==="ArrowLeft")prevPhoto();
      else if(e.key==="ArrowRight")nextPhoto();
    };
    window.addEventListener("keydown",onKey);
    const prevOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return()=>{
      window.removeEventListener("keydown",onKey);
      document.body.style.overflow=prevOverflow;
    };
  },[lightbox,totalImages]);

  const handleTouchStart=(e:React.TouchEvent)=>{
    touchStartX.current=e.touches[0]?.clientX??null;
  };
  const handleTouchEnd=(e:React.TouchEvent)=>{
    if(touchStartX.current===null||totalImages<=1)return;
    const delta=(e.changedTouches[0]?.clientX??touchStartX.current)-touchStartX.current;
    if(Math.abs(delta)>42){
      if(delta<0)nextPhoto();
      else prevPhoto();
    }
    touchStartX.current=null;
  };

  const downPaymentUsd=Math.round((simPriceUsd*downPaymentPercent)/100);
  const balanceUsd=Math.max(0,simPriceUsd-downPaymentUsd);
  const monthlyRefUsd=months>0?Math.round(balanceUsd/months):0;

  return (
    <>
      <Header settings={settings}/>
      <main className="detail-page section-pad">
        <a className="back-link" href="/#coleccion">
          <ArrowLeft size={16}/> Volver a la colección
        </a>
        {loading?(
          <div className="empty-state">Cargando ficha…</div>
        ):error?(
          <div className="empty-state" role="alert">
            {error}
            <button onClick={()=>location.reload()} className="button">Volver a intentar</button>
          </div>
        ):!vehicle?(
          <div className="empty-state">
            <h1>Esta leyenda no está publicada.</h1>
            <p>Explorá la colección o consultanos por WhatsApp.</p>
            <a className="button" href="/#coleccion">Ver colección</a>
          </div>
        ):(
          <>
            <div className="detail-grid">
              <div>
                <div
                  className="detail-photo"
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                >
                  <img
                    src={vehicle.images[index]?.url}
                    alt={`${vehicle.brand} ${vehicle.model}, foto ${index+1}`}
                    onClick={()=>setLightbox(true)}
                  />
                  {vehicle.images.length>1&&(
                    <>
                      <button className="gallery-prev" aria-label="Foto anterior" onClick={prevPhoto}>
                        <ChevronLeft/>
                      </button>
                      <button className="gallery-next" aria-label="Foto siguiente" onClick={nextPhoto}>
                        <ChevronRight/>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="gallery-fullscreen"
                    aria-label="Abrir galería en pantalla completa"
                    onClick={()=>setLightbox(true)}
                  >
                    <Maximize2 size={15}/> Ampliar
                  </button>
                  <span className="gallery-counter">{index+1} / {vehicle.images.length}</span>
                </div>
                {vehicle.images.length>1&&(
                  <div className="gallery-thumbs">
                    {vehicle.images.map((img,i)=>(
                      <button key={img.url+i} aria-label={`Ver foto ${i+1}`} aria-pressed={index===i} onClick={()=>setIndex(i)}>
                        <img src={img.url} alt=""/>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="detail-info">
                <p className="eyebrow lime">{vehicle.brand} / {vehicle.body}</p>
                <h1>{vehicle.model}</h1>
                <p className="detail-version">{vehicle.version}</p>
                <span className={`availability inline ${vehicle.availability}`}>
                  <span/>{availability[vehicle.availability]}
                </span>
                <div className="detail-price-block">
                  <p className="detail-price">{money(vehicle.price,vehicle.currency)}</p>
                  {vehicle.price!==null&&(
                    <span className="detail-price-alt">
                      Equivalente aprox.: {convertMoney(vehicle.price,vehicle.currency,vehicle.currency==="USD"?"PYG":"USD",exchangeRate)}
                    </span>
                  )}
                </div>
                <p className="detail-description">{vehicle.description}</p>

                <a
                  className="button"
                  target="_blank"
                  rel="noreferrer"
                  onClick={()=>trackVehicleMetric(vehicle.id,"whatsapp")}
                  href={whatsapp(
                    settings.whatsapp,
                    `¡Hola, Dream Cars! Me interesa el ${vehicle.brand} ${vehicle.model} ${vehicle.version}. Quisiera confirmar precio, ficha técnica y disponibilidad. ${typeof window!=="undefined"?window.location.href:""}`
                  )}
                >
                  <MessageCircle size={19}/> Consultar por WhatsApp <ArrowUpRight size={18}/>
                </a>
                <div className="detail-secondary-actions">
                  <button type="button" className="button secondary" onClick={()=>setVisitModal(true)}>
                    <Calendar size={17}/> Agendar visita
                  </button>
                  <button type="button" className="button secondary" onClick={()=>setContact(true)}>
                    Dejar mis datos <ArrowUpRight size={17}/>
                  </button>
                </div>
                <button
                  type="button"
                  className="button secondary simulator-trigger"
                  onClick={()=>setShowSimulator(!showSimulator)}
                  aria-expanded={showSimulator}
                >
                  <Calculator size={17}/> {showSimulator?"Ocultar simulador de entrega":"Simular entrega / parte de pago"}
                </button>

                {showSimulator&&(
                  <div className="delivery-simulator" role="region" aria-label="Simulador referencial de entrega">
                    <div className="simulator-head">
                      <strong>Simulador referencial de operación</strong>
                      <span>1 USD ≈ {exchangeRate.toLocaleString("es-PY")} ₲</span>
                    </div>
                    {vehicle.price===null&&(
                      <label>
                        Valor estimado a simular (USD)
                        <input
                          type="number"
                          min={3000}
                          max={500000}
                          step={500}
                          value={simPriceUsd}
                          onChange={e=>setSimPriceUsd(Math.max(1000,Number(e.target.value)||0))}
                        />
                      </label>
                    )}
                    <label>
                      <span>Entrega inicial ({downPaymentPercent}%): <strong>{money(downPaymentUsd,"USD")}</strong> <small>({money(downPaymentUsd*exchangeRate,"PYG")})</small></span>
                      <input
                        type="range"
                        min={10}
                        max={90}
                        step={5}
                        value={downPaymentPercent}
                        onChange={e=>setDownPaymentPercent(Number(e.target.value))}
                      />
                    </label>
                    <div className="simulator-row">
                      <span>Plazo referencial</span>
                      <div className="simulator-pills">
                        {[12,24,36,48].map(m=>(
                          <button
                            key={m}
                            type="button"
                            className={months===m?"active":""}
                            onClick={()=>setMonths(m)}
                          >
                            {m} meses
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="check-label">
                      <input type="checkbox" checked={hasTradeIn} onChange={e=>setHasTradeIn(e.target.checked)}/>
                      <span>Quiero entregar mi vehículo actual como parte de pago</span>
                    </label>
                    <div className="simulator-summary">
                      <div>
                        <span>Saldo a coordinar</span>
                        <strong>{money(balanceUsd,"USD")}</strong>
                      </div>
                      <div>
                        <span>Base mensual ({months}m s/interés)</span>
                        <strong>{money(monthlyRefUsd,"USD")}/mes</strong>
                      </div>
                    </div>
                    <p className="muted">
                      Cálculo orientativo. Las condiciones finales de compra, consignación o parte de pago se acuerdan directamente con el equipo.
                    </p>
                    <a
                      className="text-link"
                      target="_blank"
                      rel="noreferrer"
                      onClick={()=>trackVehicleMetric(vehicle.id,"whatsapp")}
                      href={whatsapp(
                        settings.whatsapp,
                        `¡Hola, Dream Cars! Estuve viendo el ${vehicle.brand} ${vehicle.model} (${vehicle.version}) y armé esta propuesta referencial: entrega inicial de USD ${downPaymentUsd.toLocaleString("es-PY")} (${downPaymentPercent}%)${hasTradeIn?" + mi vehículo como parte de pago":""} y saldo en ${months} meses. ¿Podemos conversarlo?`
                      )}
                    >
                      Consultar esta propuesta por WhatsApp <ArrowUpRight size={15}/>
                    </a>
                  </div>
                )}

                <div className="detail-utility-links">
                  <button
                    className="share-link"
                    onClick={async()=>{
                      try{
                        await navigator.clipboard.writeText(location.href);
                        setShared(true);
                      }catch{
                        setShared(false);
                        setShareNotice("Copiá el enlace desde la barra de direcciones para compartirlo.");
                      }
                    }}
                  >
                    <Share2 size={15}/>
                    {shared?"Enlace copiado":"Compartir esta leyenda"}
                  </button>
                  <button
                    type="button"
                    className="share-link"
                    onClick={()=>setQrModal(true)}
                  >
                    <QrCode size={15}/> Ficha QR / Imprimir
                  </button>
                </div>
                {shareNotice&&<p className="muted" role="status">{shareNotice}</p>}
              </div>
            </div>

            <section className="technical-sheet">
              <p className="eyebrow lime">CADA DETALLE CUENTA</p>
              <h2>La ficha.</h2>
              <dl>
                {[
                  ["Marca",vehicle.brand],
                  ["Modelo",vehicle.model],
                  ["Versión",vehicle.version],
                  ["Año",vehicle.year||"A confirmar"],
                  ["Kilometraje",vehicle.mileage!==null?`${vehicle.mileage.toLocaleString("es-PY")} km`:"A confirmar"],
                  ["Motor",vehicle.engine],
                  ["Transmisión",vehicle.transmission],
                  ["Combustible",vehicle.fuel],
                  ["Tracción",vehicle.drive],
                  ["Color",vehicle.color]
                ].map(([label,value])=>(
                  <div key={String(label)}>
                    <dt>{label}</dt>
                    <dd>{value||"A confirmar"}</dd>
                  </div>
                ))}
              </dl>
              {vehicle.features.length>0&&(
                <div className="equipment">
                  <h3>Equipamiento y detalles</h3>
                  {vehicle.features.map(f=>(
                    <span key={f}><Check size={15}/>{f}</span>
                  ))}
                </div>
              )}
              <p className="muted">
                Los datos pendientes se confirman con el equipo antes de la compra. Las imágenes corresponden a publicaciones del negocio; la disponibilidad puede cambiar.
              </p>
              {vehicle.sourceUrl&&(
                <a className="text-link" href={vehicle.sourceUrl} target="_blank" rel="noreferrer">
                  Ver publicación original <ArrowUpRight size={16}/>
                </a>
              )}
            </section>

            {related.length>0&&(
              <section className="related-section">
                <div className="section-top">
                  <div>
                    <p className="eyebrow"><span className="lime">MÁS EN EL GARAGE /</span> SEGUÍ EXPLORANDO</p>
                    <h2>Otras leyendas de<br/><em>la colección.</em></h2>
                  </div>
                  <a className="text-link" href="/#coleccion">Ver catálogo completo <ArrowUpRight size={17}/></a>
                </div>
                <div className="car-grid">
                  {related.map(r=>{
                    const rChips=[
                      r.body,
                      r.color?`Color ${r.color}`:null,
                      r.mileage!==null?`${r.mileage.toLocaleString("es-PY")} km`:null
                    ].filter((x):x is string=>Boolean(x));
                    if(rChips.length<3)rChips.push("Showroom Luque");
                    return (
                      <article className="car-card" key={r.id}>
                        <div className="car-image">
                          <a href={`/vehiculos/${r.id}`}>
                            <img src={r.images[0]?.url} alt={`${r.brand} ${r.model}`} loading="lazy"/>
                          </a>
                          <span className={r.featured?"car-tag featured-tag":"car-tag"}>
                            {r.featured?"SELECCIÓN DREAM CARS":r.body.toUpperCase()}
                          </span>
                          <span className={`availability ${r.availability}`}>
                            <span/>{availability[r.availability]}
                          </span>
                        </div>
                        <div className="car-info">
                          <p className="car-brand">{r.brand}<span>{r.year?`AÑO ${r.year}`:"COLECCIÓN JDM · PY"}</span></p>
                          <a href={`/vehiculos/${r.id}`}><h3>{r.model}</h3></a>
                          <p className="car-version">{r.version}</p>
                          <div className="car-specs">
                            {rChips.slice(0,3).map(c=><span key={c}>{c}</span>)}
                          </div>
                          <div className="car-bottom">
                            {r.price!==null?(
                              <strong>{money(r.price,r.currency)}</strong>
                            ):(
                              <a className="consult-price-pill" href={`/vehiculos/${r.id}`}>
                                <span className="consult-dot"/> Consultar unidad
                              </a>
                            )}
                            <a className="car-arrow-link" href={`/vehiculos/${r.id}`} aria-label={`Ver detalles de ${r.brand} ${r.model}`}>
                              <span>Ver ficha</span> <ArrowUpRight size={19}/>
                            </a>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>
      <Footer settings={settings}/>

      {lightbox&&vehicle&&(
        <div
          className="lightbox-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Galería de ${vehicle.brand} ${vehicle.model}`}
          onClick={e=>{if(e.target===e.currentTarget){setLightbox(false);setZoomed(false);}}}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="lightbox-topbar">
            <span>{vehicle.brand} {vehicle.model} · Foto {index+1} de {vehicle.images.length}</span>
            <div className="lightbox-actions">
              <button
                type="button"
                className="icon-button"
                aria-label={zoomed?"Alejar imagen":"Acercar imagen"}
                onClick={()=>setZoomed(!zoomed)}
              >
                {zoomed?<ZoomOut size={18}/>:<ZoomIn size={18}/>}
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Cerrar pantalla completa"
                onClick={()=>{setLightbox(false);setZoomed(false);}}
              >
                <X size={18}/>
              </button>
            </div>
          </div>
          <div className={zoomed?"lightbox-stage zoomed":"lightbox-stage"}>
            <img
              src={vehicle.images[index]?.url}
              alt={`${vehicle.brand} ${vehicle.model}, foto ${index+1}`}
              onClick={()=>setZoomed(!zoomed)}
            />
          </div>
          {vehicle.images.length>1&&(
            <>
              <button type="button" className="lightbox-nav prev" aria-label="Foto anterior" onClick={prevPhoto}>
                <ChevronLeft size={26}/>
              </button>
              <button type="button" className="lightbox-nav next" aria-label="Foto siguiente" onClick={nextPhoto}>
                <ChevronRight size={26}/>
              </button>
              <div className="lightbox-thumbs">
                {vehicle.images.map((img,i)=>(
                  <button
                    key={img.url+i}
                    type="button"
                    aria-label={`Ir a foto ${i+1}`}
                    aria-pressed={index===i}
                    onClick={()=>{setZoomed(false);setIndex(i);}}
                  >
                    <img src={img.url} alt=""/>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {contact&&vehicle&&(
        <Modal title={`Hablemos del ${vehicle.brand} ${vehicle.model}`} onClose={()=>setContact(false)}>
          <ContactForm vehicleId={vehicle.id} vehicleName={`${vehicle.brand} ${vehicle.model}`} defaultType="vehicle"/>
        </Modal>
      )}

      {visitModal&&vehicle&&(
        <Modal title={`Agendar visita · ${vehicle.brand} ${vehicle.model}`} onClose={()=>setVisitModal(false)}>
          <p className="modal-description">
            Elegí el día y horario en que te gustaría acercarte al showroom en {settings.address} ({settings.city}) para conocer esta unidad en persona.
          </p>
          <ContactForm
            vehicleId={vehicle.id}
            vehicleName={`${vehicle.brand} ${vehicle.model}`}
            defaultType="vehicle"
            visitMode
          />
        </Modal>
      )}

      {qrModal&&vehicle&&(
        <QrSheetModal vehicle={vehicle} settings={settings} onClose={()=>setQrModal(false)}/>
      )}
    </>
  );
}
