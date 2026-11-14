import * as accounts from '../dist/accounts.js';
import * as support from '../dist/support-reviews.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as model from '../dist/catalogue-model.js';
import { validateCheckout } from '../server.mjs';

const catalogue = JSON.parse(readFileSync(new URL('../dist/catalogue.json', import.meta.url), 'utf8'));
const suites = catalogue.filter(product => product.category === 'Jewellery Sets');
const selection = (product, option = model.defaultOption(catalogue, product)) => ({ id: product.id, option, quantity: 1 });

test('mixed sets include existing designs at their combined price with independent options', () => {
  assert.equal(suites.length, 6);
  assert.equal(new Set(catalogue.map(p => p.id)).size, catalogue.length);
  assert.equal(new Set(catalogue.map(p => p.sku)).size, catalogue.length);
  for (const suite of suites) {
    const components = model.componentProducts(catalogue, suite);
    assert(new Set(components.map(c => c.product.category)).size >= 2);
    assert(components.every(c => !c.product.hidden && !model.personalizationFields(c.product).length));
    assert.equal(suite.price, components.reduce((sum, c) => sum + c.product.price, 0));
    const option = components.map((c, i) => c.product.options[i % c.product.options.length]).join('|');
    assert(model.validOption(catalogue, suite, option));
    assert(!model.validOption(catalogue, suite, option.split('|').slice(1).join('|')));
    const items = model.expandBag(catalogue, [selection(suite, option)]);
    assert.equal(items.reduce((sum, item) => sum + item.quantity, 0), components.length);
    assert.equal(items.reduce((sum, item) => sum + item.quantity * catalogue.find(p => item.productId.startsWith(p.sku + '-')).price, 0), suite.price);
  }
});

test('earring pairs count as two physical pieces but one stock unit', () => {
  const suite = suites.find(p => p.id === 'pearl-poetry-suite');
  const item = selection(suite);
  const earrings = catalogue.find(p => p.id === 'pearl-poetry-drops');
  assert.equal(model.includedCount(suite), 4);
  const items = model.expandBag(catalogue, [item]);
  assert.equal(items.find(i => i.productId === `${earrings.sku}-Pair`).quantity, 1);
  const receipt = model.selectionSnapshot(catalogue, [item])[0];
  assert.equal(receipt.setSize, 4);
  assert.equal(receipt.setUnit, 'piece');
  assert.match(receipt.option, /Pearl earrings \(pair\): Pair/);
});

test('a shared set and standalone band draw from the same stock', () => {
  const suite = suites.find(p => p.id === 'solstice-promise-suite');
  const band = catalogue.find(p => p.id === 'quiet-promise-band');
  const items = model.expandBag(catalogue, [selection(suite, 'J|45cm|J|50cm'), selection(band, 'J')]);
  assert.equal(items.find(item => item.productId === `${band.sku}-J`).quantity, 3);
  assert.throws(() => model.expandBag(catalogue, [selection(suite, 'Pair|45cm|J|50cm')]));
});

test('the checkout gateway accepts a complete mixed set and keeps its receipt', () => {
  const suite = suites.find(p => p.id === 'first-light-diamond-suite');
  const checkout = validateCheckout({
    customer: { firstName:'Demo', lastName:'Customer', email:'demo@example.com', address:'12 Example Street', city:'Johannesburg', postalCode:'2000', province:'Gauteng', acknowledged:true },
    selections: [selection(suite, '45cm|Pair|N')]
  });
  assert.equal(checkout.items.length, 3);
  assert.equal(checkout.selections[0].name, suite.name);
  assert.equal(checkout.selections[0].price, suite.price);
  assert.equal(checkout.selections[0].setSize, 4);
  assert.match(checkout.selections[0].option, /Diamond ring: N/);
});

function storefront() {
  const source = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').split("main.addEventListener('click'")[0];
  const context = vm.createContext({
    ...model,...support,...accounts, catalogue, URLSearchParams, Intl, console,
    document: { querySelector: () => ({}) },
    localStorage: { getItem: () => null },
    campaignSection: () => '', initializeCampaign: () => () => {},
    location: { hash: '' }
  });
  vm.runInContext(source + '\nproducts = catalogue;', context);
  return expression => vm.runInContext(expression, context);
}

test('the new catalogue filters sets and offers sizes from their included components', () => {
  const render = storefront();
  const html = render("shopPage(new URLSearchParams({category:'Jewellery Sets'}))");
  assert.match(html, /Jewellery Sets\./);
  assert.equal((html.match(/class="product-card"/g) || []).length, 6);
  assert.match(html, /value="45cm"/);
  assert.match(html, /value="J"/);
  assert.match(html, /one pair of pearl drop earrings/i);
  assert.doesNotMatch(html, /id="sets-only"/);
  const shared = render("shopPage(new URLSearchParams({category:'Jewellery Sets',style:'Sets for two'}))");
  assert.equal((shared.match(/class="product-card"/g) || []).length, 2);
});

test('mixed product pages label chain, ring, bracelet and pair options correctly', () => {
  const render = storefront();
  const diamond = render("productPage('first-light-diamond-suite',new URLSearchParams())");
  assert.match(diamond, /All 4 pieces included/);
  assert.match(diamond, /Chain length<select/);
  assert.match(diamond, /Ring size<select/);
  assert.match(diamond, /set-fixed-option/);
  assert.doesNotMatch(diamond, /Ring 1 size/);
  assert.equal((diamond.match(/class="set-size-select"/g) || []).length, 2);
  const pearl = render("productPage('pearl-poetry-suite',new URLSearchParams())");
  assert.match(pearl, /Bracelet length<select/);
  const shared = render("productPage('solstice-promise-suite',new URLSearchParams())");
  assert.equal((shared.match(/class="set-size-select"/g) || []).length, 4);
  assert.match(render('homePage()'), /Discover jewellery sets/);
});
