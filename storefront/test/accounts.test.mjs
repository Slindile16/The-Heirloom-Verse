import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve,dirname,basename } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { randomUUID,createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import { createStorefront } from '../server.mjs';
import * as accounts from '../dist/accounts.js';
import * as model from '../dist/catalogue-model.js';
import * as support from '../dist/support-reviews.js';

const password='a fictional demo passphrase';
const signup=(email='visitor@example.com')=>({firstName:'Demo',lastName:'Visitor',email,password});
async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return `http://127.0.0.1:${server.address().port}`;}
async function close(server){if(!server?.listening)return;const done=new Promise(resolve=>server.close(resolve));server.closeAllConnections();await done;}
async function cleanup(directory){const path=resolve(directory);assert.equal(dirname(path),resolve(tmpdir()));assert(basename(path).startsWith('shoplink-auth-'));await rm(path,{recursive:true,force:true});}
function client(base){
  const cookies=new Map();
  return {cookies,async request(path,method='GET',body,headers={}){
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    for(const cookie of response.headers.getSetCookie()){const [name,...value]=cookie.split(';')[0].split('=');cookies.set(name,value.join('='));}
    return {status:response.status,data:await response.json(),headers:response.headers};
  }};
}
async function app(t,options={}){const dataDirectory=await mkdtemp(join(tmpdir(),'shoplink-auth-')),servers=[];t.after(async()=>{for(const server of servers)await close(server);await cleanup(dataDirectory);});const server=await createStorefront({dataDirectory,...options});servers.push(server);return {base:await listen(server),server,dataDirectory,trackServer:server=>servers.push(server)};}

test('registration signs in, stores hashes, rejects duplicate emails and logout revokes the session',async t=>{
  const {base,dataDirectory}=await app(t);const visitor=client(base);
  assert.equal((await visitor.request('/api/auth/me')).data.user,null);
  assert.equal((await visitor.request('/api/auth/register','POST',{...signup(),password:'short'})).status,400);
  const registered=await visitor.request('/api/auth/register','POST',signup(' Visitor@Example.com '));assert.equal(registered.status,201);
  assert.equal(registered.data.user.email,'visitor@example.com');assert(!JSON.stringify(registered.data).includes('password'));
  assert.match(registered.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  const token=visitor.cookies.get('hv_auth');assert.match(token,/^[a-f0-9]{64}$/);
  const db=new DatabaseSync(join(dataDirectory,'checkout.sqlite'));
  try{const row=db.prepare('SELECT * FROM users').get();assert(!row.password_hash.includes(password));assert.match(row.password_hash,/^[a-f0-9]{32}:[a-f0-9]{128}$/);assert.equal(db.prepare('SELECT token_hash FROM auth_sessions').get().token_hash,createHash('sha256').update(token).digest('hex'));}finally{db.close();}
  assert.equal((await visitor.request('/api/auth/me')).data.user.id,registered.data.user.id);
  assert.equal((await visitor.request('/api/auth/register','POST',signup('VISITOR@example.com'))).status,409);
  assert.equal((await visitor.request('/api/auth/logout','POST')).status,200);
  visitor.cookies.set('hv_auth',token);assert.equal((await visitor.request('/api/auth/me')).data.user,null);
  const unknown=await visitor.request('/api/auth/login','POST',{email:'missing@example.com',password:'wrong'});
  const wrong=await visitor.request('/api/auth/login','POST',{email:'visitor@example.com',password:'wrong'});
  assert.equal(wrong.status,401);assert.equal(wrong.data.message,unknown.data.message);
  assert.equal((await visitor.request('/api/auth/login','POST',{email:'visitor@example.com',password})).status,200);
  assert.notEqual(visitor.cookies.get('hv_auth'),token);
});

test('anonymous checkout is denied and accounts own orders across sessions',async t=>{
  const orders=new Map();let submitted;
  const upstream=createServer(async(request,response)=>{
    response.setHeader('Content-Type','application/json');
    if(request.url==='/actuator/health'){response.end('{"status":"UP"}');return;}
    if(request.method==='POST'&&request.url==='/orders'){
      let raw='';for await(const chunk of request)raw+=chunk;submitted=JSON.parse(raw);const order={id:randomUUID(),status:'PAYMENT_PENDING',...submitted};orders.set(order.id,order);response.statusCode=201;response.end(JSON.stringify(order));return;
    }
    const order=orders.get(request.url.slice('/orders/'.length));response.statusCode=order?200:404;response.end(JSON.stringify(order||{detail:'Missing'}));
  });
  const upstreamBase=await listen(upstream);t.after(()=>close(upstream));
  const {base,dataDirectory,server,trackServer}=await app(t,{services:Object.fromEntries(['product','order','inventory','payment','delivery'].map(key=>[key,upstreamBase]))});
  const alice=client(base),bob=client(base);const payload={customer:{firstName:'Demo',lastName:'Customer',email:'forged@example.com',address:'12 Example Street',city:'Johannesburg',postalCode:'2000',province:'Gauteng',acknowledged:true},selections:[{id:'dewdrop-ring',option:'J',quantity:1}]};
  assert.equal((await alice.request('/api/orders','POST',payload,{'Idempotency-Key':randomUUID()})).status,401);
  assert.equal((await alice.request('/api/account/orders')).status,401);
  const user=(await alice.request('/api/auth/register','POST',signup('alice@example.com'))).data.user;
  const key=randomUUID(),created=await alice.request('/api/orders','POST',payload,{'Idempotency-Key':key});assert.equal(created.status,201);const id=created.data.order.id;
  assert.equal(submitted.customerId,'USER-'+user.id);
  assert.equal((await alice.request('/api/account/orders')).data.orders[0].id,id);
  assert.equal((await alice.request('/api/orders/'+id)).status,200);
  await bob.request('/api/auth/register','POST',signup('bob@example.com'));
  assert.equal((await bob.request('/api/orders/'+id)).status,404);assert.equal((await bob.request('/api/account/orders')).data.orders.length,0);
  const secondBrowser=client(base);await secondBrowser.request('/api/auth/login','POST',{email:'alice@example.com',password});
  assert.equal((await secondBrowser.request('/api/orders/'+id)).status,200);
  assert.equal((await secondBrowser.request('/api/orders','POST',payload,{'Idempotency-Key':key})).data.order.id,id);assert.equal(orders.size,1);
  const db=new DatabaseSync(join(dataDirectory,'checkout.sqlite'));try{assert.equal(JSON.parse(db.prepare('SELECT customer FROM checkouts').get().customer).email,'alice@example.com');}finally{db.close();}
  await close(server);const restarted=await createStorefront({dataDirectory,services:Object.fromEntries(['product','order','inventory','payment','delivery'].map(k=>[k,upstreamBase]))});trackServer(restarted);
  const restartedClient=client(await listen(restarted));for(const [k,v]of secondBrowser.cookies)restartedClient.cookies.set(k,v);
  assert.equal((await restartedClient.request('/api/auth/me')).data.user.id,user.id);assert.equal((await restartedClient.request('/api/account/orders')).data.orders[0].id,id);
});

test('expiry, secure-cookie configuration, cross-origin protection and throttling are enforced',async t=>{
  const {base,dataDirectory}=await app(t,{secureCookies:true});const visitor=client(base);
  assert.equal((await visitor.request('/api/auth/register','POST',signup(),{Origin:'https://untrusted.example'})).status,403);
  const registered=await visitor.request('/api/auth/register','POST',signup());assert.match(registered.headers.get('set-cookie'),/; Secure/);
  assert.equal((await visitor.request('/api/auth/logout','POST',undefined,{'sec-fetch-site':'cross-site'})).status,403);
  const db=new DatabaseSync(join(dataDirectory,'checkout.sqlite'));try{db.prepare('UPDATE auth_sessions SET expires_at=0').run();}finally{db.close();}
  assert.equal((await visitor.request('/api/auth/me')).data.user,null);assert.equal((await visitor.request('/api/account/orders')).status,401);
  let last;for(let i=0;i<31;i++)last=await visitor.request('/api/auth/login','POST',{email:'bad',password:'wrong'});assert.equal(last.status,429);
});

test('account forms preserve the checkout destination and anonymous visitors cannot see checkout',()=>{
  assert.equal(accounts.authDestination(new URLSearchParams({next:'https://untrusted.example'})),'home');
  const signupHtml=accounts.accountForm('signup',new URLSearchParams({next:'checkout'}));assert.match(signupHtml,/data-next="checkout"/);assert.match(signupHtml,/autocomplete="new-password"/);assert.match(signupHtml,/minlength="12"/);
  assert.match(accounts.accountForm('signin'),/autocomplete="current-password"/);assert.doesNotMatch(accounts.accountPage({firstName:'<script>',email:'visitor@example.com'}),/<script>/);
  const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').split("main.addEventListener('click'")[0];
  const context=vm.createContext({...model,...accounts,...support,URLSearchParams,Intl,document:{querySelector:()=>({})},localStorage:{getItem:()=>null},campaignSection:()=>'',initializeCampaign:()=>()=>{},location:{hash:''}});
  vm.runInContext(source,context);const html=vm.runInContext('checkoutPage()',context);assert.match(html,/Sign in to continue/);assert.doesNotMatch(html,/id="checkout-form"/);
});

test('signed-out visitors see the account choice before the shop and signed-in visitors see the store',()=>{
  const catalogue=JSON.parse(readFileSync(new URL('../dist/catalogue.json',import.meta.url),'utf8'));
  const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').split("main.addEventListener('click'")[0];
  const classes=new Set(),main={innerHTML:''};
  const node={classList:{remove(){}},setAttribute(){}};
  const context=vm.createContext({...model,...accounts,...support,catalogue,URLSearchParams,Intl,clearTimeout(){},document:{body:{classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}}},querySelector:selector=>selector==='#main'?main:node},localStorage:{getItem:()=>null},campaignSection:()=>'',initializeCampaign:()=>()=>{},location:{hash:'#/'}});
  vm.runInContext(source+'\nproducts=catalogue;render();',context);
  assert.match(main.innerHTML,/class="welcome-entry"/);assert.match(main.innerHTML,/href="#\/signup\?next=home"/);assert.match(main.innerHTML,/href="#\/signin\?next=home"/);assert.doesNotMatch(main.innerHTML,/home-editorial/);assert(classes.has('account-entry-mode'));
  vm.runInContext("location.hash='#/shop';render();",context);assert.match(main.innerHTML,/class="welcome-entry"/);assert.doesNotMatch(main.innerHTML,/class="product-card"/);
  vm.runInContext("location.hash='#/signup?next=home';render();",context);assert.match(main.innerHTML,/Create your account\./);assert.match(main.innerHTML,/data-next="home"/);
  vm.runInContext("currentUser={id:'signed-in',firstName:'Demo',email:'demo@example.com'};location.hash='#/';render();",context);assert.match(main.innerHTML,/home-editorial/);assert(!classes.has('account-entry-mode'));
});
