# Dream Cars PY

Web de catálogo y administración para Dream Cars PY, Luque, Paraguay. Construida en React + TypeScript sobre Vinext, con API en Cloudflare Workers. No requiere una base de datos relacional.

## Funciones

- Diseño adaptable a móvil y escritorio, logo y fotografías del Instagram original.
- Catálogo con búsqueda, filtros de marca y carrocería, orden, favoritos locales y comparación de hasta tres vehículos.
- Fichas, galería, WhatsApp comercial y formularios de consulta/consignación.
- Panel `/admin`: inventario, borradores, publicados, archivados, vendidos, destacados, consultas, datos del negocio y respaldos.
- JSON persistentes privados en R2 o en un bucket S3 compatible, control de conflictos por ETag, copias anteriores y restauración con reversión ante errores.
- Cloudinary: credenciales cifradas con AES-GCM, firma generada en servidor, subida directa desde el navegador y migración de fotos originales.
- Inicio de sesión propio con usuario y contraseña, sesiones revocables y gestión de credenciales desde Mi cuenta.

## Iniciar localmente

Node.js 22.13 o superior. Desde esta carpeta:

```powershell
npm ci
npm run dev
```

Abrir la dirección impresa por el servidor, normalmente `http://127.0.0.1:5173`.

Las claves locales ya se generaron en `.dev.vars`. El archivo ignorado `ADMIN-ACCESO.local.txt` contiene el usuario y la contraseña inicial de producción. No publicar ni compartir esos archivos. La identidad de prueba local `seedy@sites.test` pertenece únicamente al simulador del starter y no está incluida en producción.

## Primer acceso en producción

1. Abrir `/admin` e ingresar con el usuario y la contraseña inicial del archivo privado `ADMIN-ACCESO.local.txt`.
2. Elegir una contraseña personal de al menos 14 caracteres en el primer acceso. La clave inicial deja de funcionar después de ese cambio.
3. Administrar el usuario, el nombre para mostrar y la contraseña desde **Mi cuenta**. Cada cambio revoca las demás sesiones.
4. Revisar precios, año, kilometraje y disponibilidad de las fichas que siguen pendientes.
5. Conectar Cloudinary y migrar las imágenes originales si todavía no se hizo.

No se necesita cuenta de ChatGPT para ingresar. La implementación anterior queda reemplazada: sus cabeceras y registros de identidad no conceden acceso al nuevo panel. El catálogo, los vehículos y las consultas existentes se conservan.

### Protección del acceso

La contraseña se deriva mediante PBKDF2-HMAC-SHA256 con 100.000 iteraciones, sal aleatoria y una prederivación HMAC con un secreto independiente del servidor. El límite de iteraciones corresponde al máximo del WebCrypto de Cloudflare Workers. El JSON de la cuenta guarda solo el verificador; la contraseña inicial se entrega únicamente en el archivo local ignorado por Git. El secreto `ADMIN_AUTH_SECRET` debe conservarse: cambiarlo invalida los verificadores existentes.

La cookie es HttpOnly, SameSite=Strict y Secure en HTTPS, con prefijo __Host-. Las sesiones duran doce horas o siete días si se marca mantener sesión. Se guardan únicamente huellas de los tokens en R2, con vencimiento y versión de credenciales. Las escrituras requieren mismo origen y token CSRF. El servidor permite ocho intentos de acceso por conexión en una ventana de quince minutos. Cerrar sesión elimina su registro; **Cerrar todas las sesiones** revoca todas las versiones anteriores.

La cuenta inicial se configura con el secreto `ADMIN_BOOTSTRAP_ACCOUNT`. Se materializa en R2 después del primer ingreso correcto. Modificar esa variable no reemplaza una cuenta que ya esté guardada en R2. Si el administrador olvida su contraseña, la recuperación requiere acceso del propietario al hosting; no se simula un correo de recuperación que no está configurado.

## Conectar Cloudinary

En `/admin` → **Cloudinary**, ingresar Cloud name, API key y API secret desde Cloudinary → Settings → API Keys. El servidor valida la conexión mediante una solicitud con un archivo deliberadamente inválido, que no crea una imagen. Después guarda los datos cifrados; el secreto nunca se devuelve al navegador.

Usar **Migrar fotos originales** para copiar las imágenes iniciales a esa cuenta. Después, cada ficha admite hasta veinte fotos de hasta 10 MB cada una, con selección de portada. Quitar una foto de una ficha conserva el recurso en Cloudinary; la limpieza permanente se gestiona desde la cuenta Cloudinary. Si una migración se interrumpe, puede repetirse: se procesan solo las imágenes que todavía apuntan al sitio.

Las variables `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET` son una alternativa al formulario; si se configuran las tres, tienen prioridad. Los secretos de producción se configuran con las herramientas del hosting, nunca en el código o el manifiesto. Mantener `INTEGRATION_ENCRYPTION_KEY` para poder descifrar la integración guardada.

## Dónde están los JSON

Los archivos `data/settings.json` y `data/vehicles.json` son los datos iniciales versionados. El sitio usa estos valores hasta que se guardan modificaciones. Los registros editados viven en un bucket privado: R2 conectado directamente en Cloudflare, o un bucket S3 compatible cuando se ejecuta en Render.

```text
settings.json
vehicles/<id>.json
inquiries/<id>.json
backups/<ruta-original>/<fecha>-<uuid>.json
private/auth/account.json
private/auth/sessions/<huella>.json
private/auth/limits/<huella>/<ventana>-<cupo>.json
private/cloudinary.json
private/limits/<huella>/<ventana>-<cupo>.json
```

El bucket guarda archivos JSON reales y privados; no es localStorage ni el disco temporal de un servidor gratuito. Los cambios sobreviven a los despliegues. En desarrollo, Miniflare emula R2 dentro de `.wrangler/state`, que no se publica. Los datos de desarrollo y producción son independientes.

**Respaldos JSON** descarga un archivo con todos los vehículos, datos del negocio y consultas, sin credenciales. Importar combina por identificador: los registros ajenos al archivo se conservan. Se valida el archivo completo antes de escribir, genera una instantánea previa y revierte los cambios aplicados si ocurre un error. La importación admite hasta 2 MB, 500 vehículos y 2000 consultas.

Las consultas permiten seguimiento y eliminación de sus datos y copias internas. Los respaldos descargados deben gestionarse separadamente. El límite antispam persistente usa una huella del IP y cinco cupos por diez minutos; las huellas de ventanas anteriores se limpian en la siguiente consulta desde la misma conexión.

## Publicar en Render

El repositorio incluye `render.yaml` para crear el servicio gratuito **dreamcars-py**. Render ejecuta la web, pero su disco gratuito es temporal; por eso la aplicación se niega a iniciar si falta un bucket persistente. No guardar JSON en el disco de Render: se perderían al reiniciar o redesplegar.

En el panel de Render configurar, como secretos, estos valores del bucket S3 compatible (por ejemplo, Cloudflare R2):

```text
S3_ENDPOINT
S3_REGION=auto
S3_BUCKET
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
ADMIN_INITIAL_PASSWORD
```

`ADMIN_INITIAL_PASSWORD` debe tener al menos 14 caracteres. En el primer acceso se obliga a cambiarla. Render genera `ADMIN_AUTH_SECRET` e `INTEGRATION_ENCRYPTION_KEY`; no los reemplaces después de comenzar a usar el panel, porque invalidarías contraseñas o integraciones cifradas. `NEXT_PUBLIC_SITE_URL` debe cambiarse por la URL final de Render o por el dominio propio cuando se conecte.

Tras el despliegue, abrir `https://tu-dominio/api/health`: debe responder `ok: true` y `storage: "s3"`. Si responde un error, revisar las variables del bucket antes de usar el panel. Las credenciales no se incluyen en el repositorio ni se deben enviar por chat.

La autenticación propia no depende de la identidad de ningún proveedor de hosting. Nunca se deben confiar cabeceras de identidad recibidas de Internet.

Fuentes oficiales consultadas el 11/11/2026:

- [Render: límites del plan gratuito](https://render.com/docs/free)
- [Render: discos persistentes](https://render.com/docs/disks)
- [R2: almacenamiento y API S3](https://developers.cloudflare.com/r2/)
- [Cloudinary: plan Free](https://cloudinary.com/pricing)
- [Cloudinary: subidas autenticadas](https://cloudinary.com/documentation/upload_images)

## Verificación

```powershell
node node_modules/typescript/bin/tsc --noEmit
npm run build
# Con el servidor de desarrollo iniciado:
node tests/auth.mjs
node tests/integration.mjs
```

Las once pruebas de autenticación cubren el login real, errores uniformes, cookies privadas, origen, CSRF, clave personal obligatoria, longitud mínima, revocación, cierre de sesión, manipulación de cookies y límite persistente de intentos. Las pruebas de integración cubren catálogo, permisos, edición JSON, conflictos, visibilidad de estados, Cloudinary pendiente, consultas, eliminación y respaldos. Solo se permiten pruebas que escriben datos contra localhost.

La conexión/subida real a Cloudinary sigue requiriendo las credenciales del negocio. Se conserva la integración existente y no se cambian sus secretos.

La revisión visual incluye login, mensajes de error, mostrar/ocultar contraseña, panel, filtros, confirmación de cambios sin guardar, secciones de cuenta y adaptación a escritorio y móvil. También se mejoraron la carga del catálogo desde el servidor, los títulos de fichas actualizados, el vehículo destacado de portada y la legibilidad general.

Fuentes de implementación:

- [Cloudflare Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [Límite de PBKDF2 documentado por Cloudflare](https://github.com/cloudflare/workerd/issues/1346)
- [OWASP: almacenamiento de contraseñas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP: sesiones](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

## Origen del contenido

`data/sources.json` documenta lo recopilado del [Instagram oficial](https://www.instagram.com/dreamcars_py/) y el WhatsApp aportado por el usuario. Las etiquetas creativas no son especificaciones técnicas. El perfil confirma compra, venta, consignación, importación y exportación; no se prometen garantías, financiación o condiciones no verificadas.
