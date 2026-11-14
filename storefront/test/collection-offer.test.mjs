import * as accounts from '../dist/accounts.js';
import * as support from '../dist/support-reviews.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as model from '../dist/catalogue-model.js';

const catalogue=JSON.parse(readFileSync(new URL('../dist/catalogue.json',import.meta.url),'utf8'));
const pick=(id,quantity=1,option)=>({id,quantity,option:option??model.defaultOption(catalogue,catalogue.find(p=>p.id===id))});

test('only the 13 approved standalone designs are eligible',()=>{
  assert.deepEqual(catalogue.filter(model.isOfferEligible).map(p=>p.id).sort(),[
    'dewdrop-ring','golden-thread-twist','harmony-silver-band','golden-thread','celestial-pearl-necklace',
    'solstice-sun-necklace','solstice-moon-necklace','everyday-circle-hoops','golden-bar-studs',
    'pearl-poetry-drops','pearl-whisper-bracelet','shared-black-silver','shared-white-silver'
  ].sort());
});
test('one eligible design plus regular items does not unlock the discount',()=>{
  const pricing=model.promotionTotals(catalogue,[pick('dewdrop-ring'),pick('evermore-band'),pick('still-light-ring')]);
  assert.equal(pricing.eligibleDesignCount,1);assert.equal(pricing.discount,0);assert.equal(pricing.total,pricing.subtotal);
});
test('two different designs qualify below R50,000 and only eligible items are discounted',()=>{
  const pricing=model.promotionTotals(catalogue,[pick('dewdrop-ring'),pick('golden-thread'),pick('evermore-band')]);
  assert.equal(pricing.subtotal,28600);assert.equal(pricing.discount,3160);assert.equal(pricing.total,25440);
});
test('quantities and different sizes of one design do not qualify',()=>{
  const pricing=model.promotionTotals(catalogue,[pick('dewdrop-ring',2,'J'),pick('dewdrop-ring',1,'L')]);
  assert.equal(pricing.eligibleDesignCount,1);assert.equal(pricing.discount,0);
});
test('complete sets neither unlock nor receive the promotion',()=>{
  const alone=model.promotionTotals(catalogue,[pick('pearl-poetry-suite')]);assert.equal(alone.discount,0);assert.equal(alone.eligibleDesignCount,0);
  const basket=[pick('pearl-poetry-suite'),pick('dewdrop-ring'),pick('golden-thread',2)];
  const pricing=model.promotionTotals(catalogue,basket);assert.equal(pricing.discount,(6900+8900*2)*0.2);
  assert.equal(model.promotionTotals(catalogue,basket.slice(0,2)).discount,0);
});
function render(expression,bag=[]){
  const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').split("main.addEventListener('click'")[0];
  const context=vm.createContext({...model,...support,...accounts,catalogue,basket:bag,URLSearchParams,Intl,console,document:{querySelector:()=>({})},localStorage:{getItem:()=>null},campaignSection:()=>'',initializeCampaign:()=>()=>{},location:{hash:''}});
  vm.runInContext(source+'\nproducts=catalogue;bag=basket;',context);
  return vm.runInContext(expression,context);
}
test('the basket and checkout prompt link to all eligible designs',()=>{
  const basket=[pick('dewdrop-ring'),pick('evermore-band'),pick('still-light-ring')];
  for(const expression of ['bagPage()','summary(true)']){
    const html=render(expression,basket);assert.match(html,/Add one more eligible design to get 20% off/);assert.match(html,/href="#\/shop\?offer=true">Explore eligible jewellery/);
  }
  const html=render("shopPage(new URLSearchParams({offer:'true'}))");
  assert.equal((html.match(/class="product-card"/g)||[]).length,13);assert.doesNotMatch(html,/href="#\/product\/evermore-band"/);
});
test('qualified baskets show savings and removing the second design restores regular pricing',()=>{
  const basket=[pick('dewdrop-ring'),pick('golden-thread')];
  assert.match(render('summary()',basket),/Your 20% collection offer is unlocked/);
  assert.match(render('summary()',basket),/promotion-saving/);
  assert.doesNotMatch(render('summary()',basket.slice(0,1)),/promotion-saving/);
});
