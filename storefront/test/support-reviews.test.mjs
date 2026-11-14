import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { once } from 'node:events';
import { createStorefront } from '../server.mjs';
import { validateReview } from '../dist/reviews-model.js';
import { helpPage, reviewSection, reviewsPage, reviewResults } from '../dist/support-reviews.js';

async function open(dataDirectory) {
  const server=await createStorefront({dataDirectory});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  return {server,base:`http://127.0.0.1:${server.address().port}`};
}
async function close(server) {
  if(!server?.listening)return;
  const done=new Promise(resolve=>server.close(resolve));server.closeAllConnections();await done;
}
async function cleanup(directory) {
  const target=resolve(directory);
  if(dirname(target)!==resolve(tmpdir())||!basename(target).startsWith('shoplink-review'))throw new Error('Unexpected test directory');
  await rm(target,{recursive:true,force:true});
}
function visitor(base) {
  let cookie='';
  return async(path,method='GET',body,headers={})=>{
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    return {status:response.status,data:await response.json(),cookie};
  };
}

test('help shows the supplied email, fictional number and an order-reference draft',()=>{
  const html=helpPage(new URLSearchParams({order:'order-123'}));
  assert.match(html,/mailto:demo@gmail\.com\?subject=/);assert.match(html,/order-123/);
  assert.match(html,/\+27 00 000 0000/);assert.match(html,/Fictional number/);assert.doesNotMatch(html,/tel:/);
  assert.match(html,/href="#\/track"/);assert.match(html,/href="#\/reviews"/);
});
test('reviews validate rating, name and length and render text safely',()=>{
  assert.deepEqual(validateReview({name:' Visitor ',rating:4,comment:' A lovely design. '}),{name:'Visitor',rating:4,comment:'A lovely design.'});
  for(const rating of [0,6,2.5,'5',null])assert.throws(()=>validateReview({name:'Visitor',rating,comment:'A lovely design.'}));
  assert.throws(()=>validateReview({name:' ',rating:5,comment:'A lovely design.'}));
  assert.throws(()=>validateReview({name:'Visitor',rating:5,comment:'short'}));
  assert.throws(()=>validateReview({name:'Visitor',rating:5,comment:'x'.repeat(1001)}));
  const html=reviewResults({total:1,average:5,reviews:[{name:'<script>name</script>',rating:5,comment:'<img src=x onerror=alert(1)>',createdAt:new Date().toISOString(),productId:'sample',mine:true}]},[{id:'sample',name:'Sample'}]);
  assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/&lt;script&gt;/);assert.match(html,/Remove my review/);
  assert.match(reviewSection({id:'sample'}),/fieldset disabled/);assert.match(reviewsPage([{id:'sample',name:'Sample'}]),/not verified purchase reviews/);
});
test('review API creates, updates and removes own reviews while preserving other visitors',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'shoplink-reviews-'));
  const {server,base}=await open(directory);t.after(async()=>{await close(server);await cleanup(directory);});
  const alice=visitor(base),bob=visitor(base);const path='/api/reviews/dewdrop-ring';
  const empty=await alice(path);assert.equal(empty.data.total,0);assert.equal(empty.data.average,null);
  const first={name:'Demo visitor A',rating:5,comment:'A beautifully delicate design.'};
  assert.equal((await alice(path,'POST',first)).status,200);
  assert.equal((await bob(path,'POST',{name:'Demo visitor B',rating:3,comment:'I would choose a different setting.'})).status,200);
  let list=await alice(path);assert.equal(list.data.total,2);assert.equal(list.data.average,4);assert.equal(list.data.reviews.filter(r=>r.mine).length,1);
  assert.equal(list.data.ownReview.name,first.name);assert(!JSON.stringify(list.data).includes(list.cookie.split('=')[1]));
  assert.equal((await alice(path,'POST',{...first,rating:1})).status,200);
  list=await alice(path);assert.equal(list.data.total,2);assert.equal(list.data.average,2);
  assert.equal((await bob(path,'DELETE')).status,200);
  list=await alice(path);assert.equal(list.data.total,1);assert.equal(list.data.reviews[0].name,first.name);
  assert.equal((await bob(path,'DELETE')).status,200);assert.equal((await alice(path)).data.total,1);
  assert.equal((await alice(path,'DELETE')).status,200);assert.equal((await alice('/api/reviews')).data.total,0);
});
test('reviews persist after server restart and invalid or cross-origin writes are rejected',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'shoplink-review-persistence-'));let running;
  t.after(async()=>{await close(running?.server);await cleanup(directory);});
  running=await open(directory);let request=visitor(running.base);const path='/api/reviews/dewdrop-ring';
  const review={name:'Demo visitor',rating:4,comment:'A simple and elegant little ring.'};
  assert.equal((await request(path,'POST',review)).status,200);
  await close(running.server);running=await open(directory);request=visitor(running.base);
  const list=await request(path);assert.equal(list.data.total,1);assert.equal(list.data.reviews[0].comment,review.comment);assert.equal(list.data.ownReview,null);
  assert.equal((await request(path,'POST',{...review,rating:6})).status,400);
  assert.equal((await request('/api/reviews/missing-design','POST',review)).status,404);
  assert.equal((await request('/api/reviews','POST',review)).status,405);
  assert.equal((await request(path,'POST',review,{Origin:'https://untrusted.example'})).status,403);
  assert.equal((await request(path,'DELETE',undefined,{'sec-fetch-site':'cross-site'})).status,403);
  assert.equal((await request(path)).data.total,1);
});
