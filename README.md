# Dream Cars PY

Web de catálogo y administración para Dream Cars PY, Luque, Paraguay. Construida en React + TypeScript sobre Vinext, con API en Cloudflare Workers. No requiere una base de datos relacional.

## Funciones

- Diseño adaptable a móvil y escritorio, logo y fotografías del Instagram original.
- Catálogo con búsqueda, filtros de marca y carrocería, orden, favoritos locales y comparación de hasta tres vehículos.
- Fichas, galería, WhatsApp comercial y formularios de consulta/consignación.
- Panel `/admin`: inventario, borradores, publicados, archivados, vendidos, destacados, consultas, datos del negocio y respaldos.
- JSON persistentes privados en R2, control de conflictos por ETag y copia anterior en cada edición.
- Cloudinary: credenciales cifradas con AES-GCM, firma generada en servidor, subida directa desde el navegador y migración de fotos originales.
- Inicio de sesión con ChatGPT y activación de una sola cuenta administradora mediante código privado.

## Iniciar localmente

Node.js 22.13 o superior. Desde esta carpeta:

```powershell
npm ci
npm run dev
```

Abrir la dirección impresa por el servidor, normalmente `http://127.0.0.1:5173`.

Las claves locales ya se generaron en `.dev.vars`. El archivo ignorado `ADMIN-ACCESO.local.txt` contiene el código de activación de producción. No publicar ni compartir esos archivos. La identidad de prueba local `seedy@sites.test` pertenece únicamente al simulador del starter y no está incluida en producción.

## Primer acceso en producción

1. Abrir la URL publicada y agregar `/admin`.
2. Elegir “Ingresar con ChatGPT”.
3. Ingresar el código de `ADMIN-ACCESO.local.txt` una sola vez. Esa cuenta queda autorizada.
4. Revisar los vehículos: las fotos iniciales son reales, pero años, kilometrajes, precios, ciertas versiones y disponibilidad no pudieron verificarse. No se inventaron esos valores.
5. Conectar Cloudinary y migrar fotos originales.

El inicio público no necesita cuenta. Todas las rutas de escritura administrativa verifican la identidad en el servidor. Si cambia la cuenta administradora, el propietario del hosting debe gestionar el registro privado `private/admin.json`; no existe una recuperación pública que permita apropiarse del panel.

## Conectar Cloudinary

En `/admin` → **Cloudinary**, ingresar Cloud name, API key y API secret desde Cloudinary → Settings → API Keys. El servidor valida la conexión mediante una solicitud con un archivo deliberadamente inválido, que no crea una imagen. Después guarda los datos cifrados; el secreto nunca se devuelve al navegador.

Usar **Migrar fotos originales** para copiar las imágenes iniciales a esa cuenta. Después, cada ficha admite hasta veinte fotos de hasta 10 MB cada una, con selección de portada. Quitar una foto de una ficha conserva el recurso en Cloudinary; la limpieza permanente se gestiona desde la cuenta Cloudinary. Si una migración se interrumpe, puede repetirse: se procesan solo las imágenes que todavía apuntan al sitio.

Las variables `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET` son una alternativa al formulario; si se configuran las tres, tienen prioridad. Los secretos de producción se configuran con las herramientas del hosting, nunca en el código o el manifiesto. Mantener `INTEGRATION_ENCRYPTION_KEY` para poder descifrar la integración guardada.

## Dónde están los JSON

Los archivos `data/settings.json` y `data/vehicles.json` son los datos iniciales versionados. El sitio usa estos valores hasta que se guardan modificaciones. Los registros editados viven en almacenamiento persistente R2:

```text
settings.json
vehicles/<id>.json
inquiries/<id>.json
backups/<ruta-original>/<fecha>-<uuid>.json
private/admin.json
private/cloudinary.json
private/limits/<huella>/<ventana>-<cupo>.json
```

R2 guarda archivos JSON reales y privados; no es localStorage ni el disco temporal de un servidor gratuito. Los cambios sobreviven a los despliegues. En desarrollo, Miniflare emula R2 dentro de `.wrangler/state`, que no se publica. Los datos de desarrollo y producción son independientes.

**Respaldos JSON** descarga un archivo con todos los vehículos, datos del negocio y consultas, sin credenciales. Importar combina por identificador: los registros ajenos al archivo se conservan. Se valida el archivo completo antes de escribir; no es una transacción entre múltiples archivos. Si se interrumpe, puede repetirse. La importación admite hasta 2 MB, 500 vehículos y 2000 consultas.

Las consultas permiten seguimiento y eliminación de sus datos y copias internas. Los respaldos descargados deben gestionarse separadamente. El límite antispam persistente usa una huella del IP y cinco cupos por diez minutos; las huellas de ventanas anteriores se limpian en la siguiente consulta desde la misma conexión.

## Hosting y costo

La publicación preparada utiliza **Sites**, que ejecuta el proyecto sobre Cloudflare Workers y conecta R2 desde `.openai/hosting.json`. La URL de despliegue se informa al completar la publicación. No se contrató ningún plan pago ni dominio.

Alternativa gratuita investigada: **Cloudflare Workers Free**, con 100.000 solicitudes diarias dentro de sus límites. R2 Standard incluye 10 GB-mes, un millón de operaciones de clase A y diez millones de clase B al mes. Cloudinary Free ofrece 25 créditos mensuales y no requiere tarjeta. Fuera de las cuotas aplican las condiciones del proveedor; no equivale a alojamiento ilimitado. Activar R2 directamente en una cuenta Cloudflare requiere completar su proceso de suscripción y puede pedir datos de facturación.

Importante para una migración independiente de Sites: este proyecto usa la autenticación proporcionada por Sites. Un despliegue directo con Wrangler requiere configurar un proveedor de identidad confiable y adaptar el guard de autenticación; no se deben confiar cabeceras de identidad recibidas directamente de Internet. La publicación mediante Sites ya incluye ese servicio.

Fuentes oficiales consultadas el 11/11/2026:

- [Cloudflare Workers: precios y cuotas](https://developers.cloudflare.com/workers/platform/pricing/)
- [R2: almacenamiento gratuito y operaciones](https://developers.cloudflare.com/r2/pricing/)
- [R2: alta del servicio](https://developers.cloudflare.com/r2/get-started/)
- [Cloudinary: plan Free](https://cloudinary.com/pricing)
- [Cloudinary: subidas autenticadas](https://cloudinary.com/documentation/upload_images)

## Verificación

```powershell
node node_modules/typescript/bin/tsc --noEmit
npm run build
# Con el servidor de desarrollo iniciado:
node tests/integration.mjs
```

Las diez pruebas de integración comprueban permisos, activación, validación, bloqueo de origen ajeno, escritura de JSON, conflictos, visibilidad de estados, exigencia de Cloudinary, consultas, eliminación y respaldos. Solo se ejecutan contra localhost. La conexión/subida real a Cloudinary requiere las credenciales del negocio y no puede validarse antes de conectarlas.

Se verificaron en navegador el catálogo, búsqueda por marca, favoritos, comparación, panel, editor, formulario real local, ficha, menú móvil, imágenes y ausencia de desbordamiento a 390 y 1440 píxeles.

## Origen del contenido

`data/sources.json` documenta lo recopilado del [Instagram oficial](https://www.instagram.com/dreamcars_py/) y el WhatsApp aportado por el usuario. Las etiquetas creativas no son especificaciones técnicas. El perfil confirma compra, venta, consignación, importación y exportación; no se prometen garantías, financiación o condiciones no verificadas.
