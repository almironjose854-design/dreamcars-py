import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw new Error('Solo se permiten pruebas de escritura contra localhost.');
const privateFile=await readFile('ADMIN-ACCESO.local.txt','utf8');
const initialPassword=privateFile.match(/Contrase.a inicial: ([^\r\n]+)/u)?.[1];
assert(initialPassword,'No se encontró la contraseña inicial local.');
export const initial={username:'admin',password:initialPassword};
export function client(){return {cookie:'',csrf:'',async request(path,{method='GET',value,origin=base,headers={},csrf=true}={}){
  const response=await fetch(base+'/api/'+path,{method,headers:{'Content-Type':'application/json',...(this.cookie?{Cookie:this.cookie}:{}),...(this.csrf&&csrf?{'X-CSRF-Token':this.csrf}:{}),...(method!=='GET'?{Origin:origin}:{}),...headers},body:value===undefined?undefined:JSON.stringify(value)});
  const setCookie=response.headers.getSetCookie();if(setCookie.length)this.cookie=setCookie.map(c=>c.split(';')[0]).join('; ');
  const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data={error:raw};}if('csrfToken'in data)this.csrf=data.csrfToken||'';
  return {status:response.status,data,cookies:setCookie,headers:response.headers};
}};}
if(import.meta.url===new URL(process.argv[1],'file:').href||process.argv[1]?.endsWith('auth.mjs')){
  let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
  const a=client(),b=client();let currentPassword=initialPassword;
  await check('API privada bloqueada y cabeceras antiguas sin autoridad',async()=>{assert.equal((await a.request('admin/data')).status,401);assert.equal((await a.request('admin/data',{headers:{'oai-authenticated-user-id':'local_seedy','oai-authenticated-user-email':'seedy@sites.test'}})).status,401);});
  await check('errores de acceso uniformes sin enumerar usuarios',async()=>{const one=await a.request('auth/login',{method:'POST',value:{username:'no-existe',password:'clave-incorrecta'}});const two=await a.request('auth/login',{method:'POST',value:{username:'admin',password:'clave-incorrecta'}});assert.equal(one.status,401);assert.equal(two.status,401);assert.equal(one.data.error,two.data.error);});
  await check('acceso real con contraseña y cookie privada',async()=>{const r=await a.request('auth/login',{method:'POST',value:initial});assert.equal(r.status,200,JSON.stringify(r.data));assert(r.cookies[0].includes('HttpOnly'));assert(r.cookies[0].includes('SameSite=Strict'));assert(r.cookies[0].includes('Max-Age=43200'));assert(r.data.csrfToken);assert.equal((await a.request('session')).data.isAdmin,true);});
  await check('primer acceso obliga a elegir una contraseña personal',async()=>{const s=(await a.request('session')).data;if(s.mustChangePassword)assert.equal((await a.request('admin/data')).status,403);});
  await check('escrituras requieren origen correcto y token CSRF',async()=>{assert.equal((await a.request('auth/account',{method:'PUT',value:{},csrf:false})).status,403);assert.equal((await a.request('auth/account',{method:'PUT',value:{},origin:'https://untrusted.test'})).status,403);});
  await check('contraseña actual y longitud mínima verificadas',async()=>{assert.equal((await a.request('auth/account',{method:'PUT',value:{currentPassword:'incorrecta',newPassword:'Nueva frase de prueba segura'}})).status,400);assert.equal((await a.request('auth/account',{method:'PUT',value:{currentPassword:initialPassword,newPassword:'corta'}})).status,400);});
  const nextPassword='Temporal-'+randomBytes(16).toString('base64url');
  await check('cambio de credenciales revoca las sesiones anteriores',async()=>{const oldCookie=a.cookie;const r=await a.request('auth/account',{method:'PUT',value:{currentPassword:initialPassword,newPassword:nextPassword,username:'admin',displayName:'Dream Cars'}});assert.equal(r.status,200,JSON.stringify(r.data));currentPassword=nextPassword;assert.equal(r.data.mustChangePassword,false);b.cookie=oldCookie;assert.equal((await b.request('session')).data.isAdmin,false);assert.equal((await a.request('admin/data')).status,200);assert.equal((await b.request('auth/login',{method:'POST',value:initial})).status,401);});
  await check('sesión persistente de siete días y logout efectivo',async()=>{const r=await b.request('auth/login',{method:'POST',value:{username:'admin',password:nextPassword,remember:true}});assert.equal(r.status,200);assert(r.cookies[0].includes('Max-Age=604800'));const stolen=b.cookie;assert.equal((await b.request('auth/logout',{method:'POST',value:{}})).status,200);b.cookie=stolen;assert.equal((await b.request('session')).data.isAdmin,false);});
  await check('cookie manipulada rechazada',async()=>{const invalid=client();invalid.cookie=a.cookie.slice(0,-4)+'abcd';assert.equal((await invalid.request('admin/data')).status,401);});
  await check('restauración de la contraseña local y cierre global',async()=>{const restored=await a.request('auth/account',{method:'PUT',value:{username:'admin',displayName:'Dream Cars',currentPassword,newPassword:initialPassword}});assert.equal(restored.status,200);assert.equal((await b.request('auth/login',{method:'POST',value:initial})).status,200);assert.equal((await a.request('auth/revoke',{method:'POST',value:{}})).status,200);assert.equal((await b.request('session')).data.isAdmin,false);assert.equal((await a.request('session')).data.isAdmin,false);});
  await check('límite persistente de intentos por conexión',async()=>{const blocked=client();const testIp=`2001:db8:${randomBytes(2).toString('hex')}:${randomBytes(2).toString('hex')}::1`;for(let i=0;i<8;i++){const r=await blocked.request('auth/login',{method:'POST',value:{username:'admin',password:'intento-incorrecto'},headers:{'cf-connecting-ip':testIp}});assert.equal(r.status,401);}assert.equal((await blocked.request('auth/login',{method:'POST',value:initial,headers:{'cf-connecting-ip':testIp}})).status,429);});
  console.log(`\n${passed} pruebas de autenticación completadas.`);
}
