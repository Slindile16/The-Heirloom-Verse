import { welcomeEntry, accountForm, accountPage, signInGate, authDestination, orderHistory } from './accounts.js';
import { helpPage, reviewsPage, reviewSection, reviewResults } from './support-reviews.js';
import { validateReview } from './reviews-model.js';
import { campaignSection, initializeCampaign } from './home-campaign.js';
import { isSet, isOfferEligible, promotionTotals, includedCount, componentProducts, defaultOption, validOption, describeOption, expandBag, pieceName, personalizationFields, normalizedPersonalization, personalizationDescription, selectionKey, birthstones, selectedBirthstone, personalizedImage } from './catalogue-model.js';
const main = document.querySelector('#main');
const money = value => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value).replace('ZAR', 'R');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const categories = ['Rings', 'Necklaces', 'Earrings', 'Bracelets', 'Jewellery Sets'];
const readStorage = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const saveStorage = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Shopping remains available when storage is disabled. */ } };
let currentUser = null;
let selectedPersonalization = {};
let disposeCampaign = () => {};
let products = [], bag = [], activeView = 0, pollTimer, stockSequence = 0, toastTimer, selectedOption, currentProduct, checkoutSubmitting = false;
let checkoutKey = readStorage('hv-checkout-key', null);
let recentOrders = readStorage('hv-orders', []);
if (!Array.isArray(recentOrders)) recentOrders = [];
recentOrders = recentOrders.filter(x => typeof x === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(x)).slice(0, 10);

const sku = (product, option) => `${product.sku}-${option}`;
const productImage = (product,custom) => personalizedImage(product,custom);
const productPhoto = (product, alt, width, height, custom) => `<img src="${productImage(product,custom)}" alt="${escape(selectedBirthstone(product,custom)?`${alt} — ${personalizationDescription(product,custom)}`:alt)}" loading="lazy" width="${width}" height="${height}">`;
const productLink = product => `#/product/${product.id}`;
const bagQuantity = () => bag.reduce((sum, item) => sum + item.quantity, 0);
const bagPricing = () => promotionTotals(products, bag);
const bagTotal = () => bagPricing().total;
const optionDescription = (product,option,custom) => [describeOption(products,product,option),personalizationDescription(product,custom)].filter(Boolean).join(' · ');
const audienceMatches = (product,audience) => audience==='Everyone'||product.audience.includes(audience)||(audience!=='Unisex'&&product.audience.includes('Unisex'));
function updateBag(persist = true) {
  if (persist) saveStorage('hv-bag', bag);
  document.querySelector('#bag-count').textContent = bagQuantity();
  document.querySelector('.bag-link').setAttribute('aria-label', `Shopping bag, ${bagQuantity()} items`);
}
function invalidateCheckout() { checkoutKey = null; saveStorage('hv-checkout-key', null); }
function toast(message, link = false) {
  const el = document.querySelector('#toast');
  el.innerHTML = `${escape(message)}${link ? '<a href="#/bag">View bag ↗</a>' : ''}`;
  el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 5000);
}
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(15000) });
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error('Checkout is available in the integrated local version. This hosted preview lets you explore the collection and shopping bag.');
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || 'We could not complete that request. Please try again.'), { code: data.code, status: response.status });
  return data;
}
function card(product) {
  if (product.hidden) return '';
  return `<article class="product-card"><a href="${productLink(product)}"><div class="product-photo">${productPhoto(product, `${product.name} illustrative ${product.category.toLowerCase()} photograph`,600,600)}${product.tag ? `<span class="product-tag">${escape(product.tag)}</span>` : ''}</div><h3>${escape(product.name)}</h3>${isOfferEligible(product)?'<span class="offer-label">20% offer · choose 2 eligible designs</span>':''}<p class="product-material">${escape(product.metal)} · ${escape(product.style)}</p>${product.contentsSummary?`<p class="set-contents-summary">${escape(product.contentsSummary)}</p>`:''}<p class="product-price">${money(product.price)}${isSet(product)?` <span class="set-price-caption">/ complete ${includedCount(product)}-${pieceName(product)} set</span>`:''}</p></a></article>`;
}
function breadcrumb(label, middle = '') { return `<div class="container breadcrumb"><a href="#/">Home</a> &nbsp; / &nbsp; ${middle}${escape(label)}</div>`; }
function pageHeading(eyebrow, title, description = '') { return `<div class="page-heading"><div class="eyebrow">${escape(eyebrow)}</div><h1>${escape(title)}</h1>${description ? `<p>${escape(description)}</p>` : ''}</div>`; }
function homePage() {
  const categoryDesigns = ['promise-solitaire', 'kept-lock-key-pair', 'liquid-petal-drops', 'written-promise-bracelet'];
  const subtitles = ['Promises, beautifully kept.', 'Stories close to the heart.', 'A little everyday poetry.', 'Treasures that stay with you.'];
  return `<div class="home-editorial">
    <section class="hero"><div class="hero-copy"><span class="eyebrow">THE FIRST VERSE COLLECTION</span><h1>Some stories<br>are worn <em>forever.</em></h1><p>Fine jewellery for the moments<br>that become part of you.</p><a class="button button-primary" href="#/shop">Discover the collection <span aria-hidden="true">↗</span></a></div><div class="hero-image"><img src="/assets/hero.webp" alt="Gold diamond rings resting on ivory stone, framed by deep burgundy silk" fetchpriority="high" width="1536" height="1024"></div></section>
    ${campaignSection()}
    <section class="section container home-categories" aria-labelledby="home-categories-title"><div class="home-section-heading"><span aria-hidden="true"></span><h2 id="home-categories-title">Shop by category</h2><span aria-hidden="true"></span></div><div class="collections-grid">${categories.filter(c=>c!=='Jewellery Sets').map((category, i) => { const p = products.find(p => p.id === categoryDesigns[i]) || products.find(p => p.category === category && !p.hidden && p.image); return `<a class="collection-tile" href="#/shop?category=${category}"><div class="collection-photo">${productPhoto(p, `${category} collection`,600,600)}</div><h3>${category}<span aria-hidden="true">↗</span></h3><p>${subtitles[i]}</p></a>`; }).join('')}</div></section>
    <section class="jewellery-set-feature container" aria-labelledby="jewellery-set-heading"><a class="jewellery-set-feature-photo" href="#/shop?category=Jewellery%20Sets"><img src="/assets/pearl-poetry-suite.png" alt="Pearl necklace, a pair of pearl drop earrings and a pearl bracelet, available as one complete set" loading="lazy" width="1254" height="1254"></a><div><p class="eyebrow">BEAUTIFUL TOGETHER</p><h2 id="jewellery-set-heading">One look.<br>A shared story.</h2><p>Necklaces, earrings, bracelets and rings, thoughtfully brought together. Find a complete look for yourself or something to share.</p><a class="button button-primary" href="#/shop?category=Jewellery%20Sets">Discover jewellery sets <span aria-hidden="true">↗</span></a></div></section>
    <section class="connection-feature" aria-labelledby="connection-title"><div class="connection-photo"><img src="/assets/campaign-lock-key-women.png" alt="Two women wearing the matching gold lock and key necklaces, one in ivory silk and one in burgundy" loading="lazy" width="1536" height="1024"></div><div class="connection-copy"><p class="eyebrow">EVERY KIND OF CONNECTION</p><h2 id="connection-title">A little<br>piece of us.</h2><p>For your person. Your sister. Your closest friend. Two pieces, one shared story.</p><a class="button button-primary" href="#/shop?category=Necklaces&amp;sets=true">Discover matching necklaces <span aria-hidden="true">↗</span></a><a class="text-link" href="#/product/kept-lock-key-pair">Shop the Lock &amp; Key Pair <span aria-hidden="true">↗</span></a></div></section>
    <section class="section container home-favourites"><div class="section-heading"><div><p class="eyebrow">THE PIECES YOU’LL COME BACK TO</p><h2>Your next heirloom.</h2></div><a href="#/shop" class="text-link">View the collection <span aria-hidden="true">↗</span></a></div><div class="product-grid">${products.filter(p => p.featured && !p.hidden).slice(0,4).map(card).join('')}</div></section>
    <section class="gifting-feature" aria-labelledby="gifting-title"><div class="gifting-photo"><img src="/assets/signature-gift-packaging.png" alt="Ivory HV gift box with burgundy ribbon, a burgundy jewellery case and ivory lining" loading="lazy" width="1536" height="1024"></div><div class="gifting-copy"><p class="eyebrow">THE ART OF GIVING</p><h2 id="gifting-title">The anticipation.<br>The reveal.<br>The memory.</h2><p>A ribbon untied. A little burgundy box. Something chosen just for them.</p><a class="text-link" href="#/shop">Find their next heirloom <span aria-hidden="true">↗</span></a></div></section>
    <section class="container collection-entry"><div><p class="eyebrow">YOUR STYLE, YOUR STORY</p><h2>Jewellery for every chapter.</h2></div><div class="collection-entry-links"><a href="#/shop?audience=Women">For women ↗</a><a href="#/shop?audience=Men">For men ↗</a><a href="#/shop?category=Jewellery%20Sets">Jewellery sets ↗</a><a href="#/shop?category=Rings&amp;sets=true">Matching rings ↗</a><a href="#/shop?category=Bracelets&amp;sets=true">Matching bracelets ↗</a></div></section>
    <section class="quote-section"><span class="quote-mark" aria-hidden="true">✧</span><blockquote>“Not every story is written.<br>Some are held in gold.”</blockquote><a class="text-link" href="#/story">The story behind the verse <span aria-hidden="true">↗</span></a></section>
  </div>`;
}
function shopPage(params) {
  const category = categories.includes(params.get('category')) ? params.get('category') : 'All jewellery';
  const audience = ['Women','Men','Unisex'].includes(params.get('audience')) ? params.get('audience') : 'Everyone';
  const query = (params.get('q') || '').slice(0,100), jewellerySets=category==='Jewellery Sets', offerOnly=params.get('offer')==='true', setsOnly=params.get('sets')==='true';
  const singlesOnly=category==='Necklaces'&&params.get('singles')==='true'&&!setsOnly;
  const sort = ['price-low','price-high','name'].includes(params.get('sort')) ? params.get('sort') : 'featured';
  const material=params.get('material')||'',gemstone=params.get('gemstone')||'',style=params.get('style')||'',size=params.get('size')||'';
  const maxPrice=[10000,20000,30000,50000].includes(Number(params.get('maxPrice')))?Number(params.get('maxPrice')):Infinity;
  const select=(label,key,values,selected,all='All')=>`<label class="refinement-field">${label}<select data-refinement="${key}"><option value="">${all}</option>${values.map(v=>`<option value="${escape(v)}" ${String(v)===String(selected)?'selected':''}>${escape(v)}</option>`).join('')}</select></label>`;
  const sizes=[...new Set(products.filter(p=>!p.hidden&&(category==='All jewellery'||p.category===category)).flatMap(p=>componentProducts(products,p).flatMap(c=>c.product.options)))];
  let visible=products.filter(p=>!p.hidden&&(category==='All jewellery'||p.category===category)&&(!offerOnly||isOfferEligible(p))&&audienceMatches(p,audience)&&(!setsOnly||isSet(p))&&(!singlesOnly||!isSet(p))&&(!material||p.metal===material)&&(!gemstone||p.gemstone===gemstone)&&(!style||p.style===style)&&(!size||componentProducts(products,p).some(c=>c.product.options.includes(size)))&&p.price<=maxPrice&&`${p.name} ${p.category} ${p.style} ${p.metal} ${p.gemstone} ${p.description} ${(p.relationships||[]).join(' ')} ${(p.keywords||[]).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  visible=[...visible].sort((a,b)=>sort==='price-low'?a.price-b.price:sort==='price-high'?b.price-a.price:sort==='name'?a.name.localeCompare(b.name):(((singlesOnly||category==='Earrings'||category==='Rings')?Number(!!b.newArrival)-Number(!!a.newArrival):0)||Number(!!b.featured)-Number(!!a.featured)));
  const braceletSets=setsOnly&&category==='Bracelets',ringSets=setsOnly&&category==='Rings',necklaceSets=setsOnly&&category==='Necklaces',earringSets=setsOnly&&category==='Earrings';
  const title=offerOnly?'Build Your Collection.':jewellerySets?'Jewellery Sets.':style==='Bracelet stacks'?'Made to layer. Worn together.':setsOnly?(braceletSets?'Different colours. Shared stories.':ringSets?'Made to stack. Made to share.':necklaceSets?'Two pieces. One connection.':earringSets?'Your own little constellation.':'Made to belong together.'):singlesOnly?'Single necklaces.':category!=='All jewellery'?category:audience==='Everyone'?'Find your next heirloom.':audience==='Unisex'?'Made for you. Worn your way.':`Jewellery for ${audience.toLowerCase()}.`;
  const setEyebrow=braceletSets?'MATCHING BRACELET SETS':ringSets?'MATCHING RING SETS':necklaceSets?'MATCHING NECKLACE SETS':earringSets?'COMPLETE EAR STACKS':'MATCHING SETS';
  const setDescription=braceletSets?'Matching pairs and layered wrist stacks. Choose black-and-white companions or complete three- and five-bracelet stacks, with a size for every piece.':ringSets?'Everyday stacks, matching pairs and bridal sets. Every ring pictured is included; choose a size for each piece.':necklaceSets?'Hearts, lock and key, flowers, stars, botanical shapes and more. Each pair includes two necklaces, with a separate chain length for each person.':earringSets?'Coordinated three-component sets for one ear. Every pictured piece is included; each listing explains the piercings required.':'Coordinating rings, bracelets and necklaces for your shared stories. Choose an option for every piece.';
  const stylesByCategory = {
    'Jewellery Sets': ['Pearl sets','Diamond sets','Gemstone sets','Everyday sets','Sets for two'],
    Earrings: ['Ear stacks','Hoops','Studs','Drop earrings','Statement drops','Ear climbers','Birthstone studs','Personal pieces','Ear jackets','Ear cuffs'],
    Bracelets: ['Bracelet stacks','Tennis','Pearl bracelet','Personal pieces','Charm','Sculptural bangle','Statement cuff'],
    Rings: ['Stacking set','Stacking','Diamond band','Couples’ set','Wedding band','Solitaire','Halo','Three-stone','Eternity bands','Signet','Sculptural','Nature-inspired','Gemstone'],
    Necklaces: ['Solitaire pendants','Chains','Tennis necklaces','Nature-inspired','Gemstone pendants','Pearls','Personal pieces','Layered necklaces','Statement pieces','Matching necklaces']
  };
  const styleUnit = jewellerySets?'set':category==='Necklaces'?'necklace':category==='Bracelets'?'bracelet':category==='Earrings'?'earring':'ring';
  const styleBrowse = stylesByCategory[category]&&!setsOnly ? `<nav class="style-browse" aria-label="Browse ${styleUnit} styles"><p class="eyebrow">FIND YOUR ${styleUnit.toUpperCase()} STYLE</p><div>${['All styles',...stylesByCategory[category]].map(label=>{const value=label==='All styles'?'':label,next=new URLSearchParams(params);next.set('category',category);if(value)next.set('style',value);else next.delete('style');return `<a href="#/shop?${escape(next.toString())}" ${style===value?'aria-current="true"':''}>${escape(label)}</a>`;}).join('')}</div></nav>` : '';
  const necklaceModes = category==='Necklaces' ? `<nav class="necklace-modes" aria-label="Necklace collections">${[['all','All necklaces'],['single','Single necklaces'],['pairs','Matching pairs']].map(([mode,label])=>{const next=new URLSearchParams(params);next.delete('sets');next.delete('singles');next.delete('style');next.delete('size');if(mode==='single')next.set('singles','true');if(mode==='pairs')next.set('sets','true');const active=setsOnly?'pairs':singlesOnly?'single':'all';return `<a href="#/shop?${escape(next.toString())}" ${active===mode?'aria-current="page"':''}>${label}</a>`;}).join('')}</nav>` : '';
  return `${pageHeading(offerOnly?'SAVE 20% ON SELECTED DESIGNS':jewellerySets?'THE COMPLETE LOOK':setsOnly?setEyebrow:singlesOnly?'SINGLE NECKLACES':'THE COLLECTION',title,offerOnly?'Choose two different eligible designs to save 20% on all eligible items in your bag. No minimum spend. Different sizes of one design count as one design. Complete sets are excluded.':jewellerySets?'Coordinated necklaces, earrings, bracelets and rings. Choose a complete look for yourself, or a matching set to share. Every piece pictured is included.':style==='Bracelet stacks'?'Coordinated three- and five-piece stacks for one wrist. Every bracelet pictured is included in the set price.':setsOnly?setDescription:singlesOnly?'Individual pendants, chains and statement pieces. Each listing includes one necklace.':'Explore designs for women, men and everyone in between. Choose what feels like you.')}<section class="container shop-results">${!offerOnly?'<div class="collection-offer-banner"><p><strong>Build Your Collection</strong> · Save 20% when you choose two different eligible designs. No minimum spend.</p><a class="text-link" href="#/shop?offer=true">Explore eligible jewellery ↗</a></div>':''}${necklaceModes}${styleBrowse}<div class="shop-tools"><div class="category-filters" role="group" aria-label="Filter by category">${['All jewellery',...categories].map(c=>`<button class="filter-button" data-category="${c}" aria-pressed="${c===category}">${c}</button>`).join('')}</div><label class="sort-control">Sort by <select id="shop-sort">${[['featured','Featured'],['price-low','Price: low to high'],['price-high','Price: high to low'],['name','Name: A–Z']].map(([v,l])=>`<option value="${v}" ${sort===v?'selected':''}>${l}</option>`).join('')}</select></label></div><div class="audience-filters" role="group" aria-label="Shop by collection">${['Everyone','Women','Men','Unisex'].map(a=>`<button class="filter-button" data-audience="${a}" aria-pressed="${a===audience}">${a}</button>`).join('')}${jewellerySets?'':`<label class="set-filter"><input type="checkbox" id="sets-only" ${setsOnly?'checked':''}> Matching ${category==='Rings'?'ring ':category==='Bracelets'?'bracelet ':category==='Necklaces'?'necklace ':category==='Earrings'?'earring ':''}sets</label>`}</div><details class="refinements" ${(material||gemstone||style||size||maxPrice!==Infinity)?'open':''}><summary>Refine your collection <span>Material, gemstone, style, size & price +</span></summary><div class="refinement-grid">${select('Material','material',[...new Set(products.map(p=>p.metal))],material)}${select('Gemstone','gemstone',[...new Set(products.map(p=>p.gemstone))],gemstone)}${select('Style','style',[...new Set(products.filter(p=>!p.hidden&&(category==='All jewellery'||p.category===category)).map(p=>p.style))],style)}${select('Size / length','size',sizes,size)}<label class="refinement-field">Maximum price<select data-refinement="maxPrice"><option value="">Any price</option>${[10000,20000,30000,50000].map(v=>`<option value="${v}" ${maxPrice===v?'selected':''}>${money(v)}</option>`).join('')}</select></label></div></details><div class="shop-meta"><span aria-live="polite">${visible.length} ${visible.length===1?'design':'designs'}${query?` matching “${escape(query)}”`:''}</span><form id="shop-search-form" class="shop-search"><label class="sr-only" for="shop-query">Search jewellery</label><input id="shop-query" type="search" value="${escape(query)}" placeholder="Search designs, sets, materials…"><button class="icon-button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button></form></div>${visible.length?`<div class="product-grid ${necklaceSets?'necklace-pair-grid':''}">${visible.map(card).join('')}</div>`:`<div class="empty-state"><h2>A different kind of treasure?</h2><p>No designs matched these filters. Try another selection or explore the full collection.</p><a class="button" href="#/shop">Clear filters</a></div>`}</section>`;
}
function finishControls(product) {
  if(!product.finishFamily)return '';
  const finishes=products.filter(p=>p.finishFamily===product.finishFamily);
  const designs=products.filter(p=>isSet(p)&&p.category===product.category&&p.finish===product.finish);
  return `<div class="design-selector"><p>Design: <span>${escape(product.designLabel)}</span></p><div role="group" aria-label="Choose bracelet design">${designs.map(p=>`<a class="design-option ${p.id===product.id?'is-selected':''}" href="${productLink(p)}?sizes=${encodeURIComponent(selectedOption)}" ${p.id===product.id?'aria-current="page"':''}><img src="${productImage(p)}" alt="" width="88" height="88"><span>${escape(p.designLabel)}</span></a>`).join('')}</div></div><div class="finish-selector"><p>Metal details: <span>${escape(product.finish)}</span></p><div role="group" aria-label="Choose metal details">${finishes.map(p=>`<a class="finish-option ${p.id===product.id?'is-selected':''}" href="${productLink(p)}?sizes=${encodeURIComponent(selectedOption)}" ${p.id===product.id?'aria-current="page"':''}><span class="finish-dot finish-${p.finish.toLowerCase()}" aria-hidden="true"></span>${escape(p.finish)} details</a>`).join('')}</div></div>`;
}
function optionControls(product) {
  if(product.earStack)return `<div class="set-includes"><div class="option-heading"><span>All ${includedCount(product)} pieces included · one ear</span></div>${componentProducts(products,product).map((c,i)=>`<div class="set-component"><span class="component-number">0${i+1}</span><span>${escape(c.label)}</span></div>`).join('')}<p class="set-stock-caption">${escape(product.inclusionNote)} The complete set is reserved together.</p></div>`;
  if(!isSet(product))return `<div class="option-heading"><span>${escape(product.optionLabel)}: <span id="option-value">${escape(selectedOption)}</span></span>${product.category==='Rings'?'<a href="#/sizes">Size guide ↗</a>':''}</div><div class="size-options" role="group" aria-label="${escape(product.optionLabel)}">${product.options.map(o=>`<button class="size-option" data-option="${escape(o)}" aria-pressed="${o===selectedOption}">${escape(o)}</button>`).join('')}</div>`;
  const choices=selectedOption.split('|'),unit=pieceName(product);
  return `<div class="set-includes"><div class="option-heading"><span>All ${includedCount(product)} ${unit}s included</span><a href="#/sizes">Size guide ↗</a></div>${componentProducts(products,product).map((component,i)=>{
    const piece=component.product,label=piece.optionLabel||'Option';
    const control=piece.options.length===1?`<div class="set-fixed-option"><span>${escape(label)}</span><strong>${escape(piece.options[0])}</strong></div>`:`<label for="component-size-${i}">${escape(label)}<select id="component-size-${i}" class="set-size-select" data-component-index="${i}" aria-label="${escape(component.label)} ${escape(label.toLowerCase())}">${piece.options.map(o=>`<option ${o===choices[i]?'selected':''}>${escape(o)}</option>`).join('')}</select></label>`;
    return `<div class="set-component"><div><span class="component-number">0${i+1}</span><div><span class="component-label">${piece.hidden?`Included ${pieceName(piece)}`:escape(component.label)}</span>${piece.hidden?`<span class="component-piece-name">${escape(component.label)}</span>`:`<a href="${productLink(piece)}">${escape(piece.name)} ↗</a>`}</div></div>${control}</div>`;
  }).join('')}<p class="set-stock-caption">Choose each fit separately. Every included design is reserved together at checkout.</p></div>`;
}
function gemstoneGuideContent() {
  return `<p>Find the birthstone chosen for each month in The Birthstone Story collection.</p><div class="gemstone-guide-scroll"><table class="gemstone-guide-table"><caption>Birthstones by month</caption><thead><tr><th scope="col">Month</th><th scope="col">Gemstone</th><th scope="col">Colour</th></tr></thead><tbody>${birthstones.map(b=>`<tr><th scope="row">${escape(b.month)}</th><td>${escape(b.stone)}</td><td>${escape(b.colour)}</td></tr>`).join('')}</tbody></table></div><p class="gemstone-guide-note">Some months have more than one accepted birthstone. This collection uses alexandrite for June, pink tourmaline for October and tanzanite for December. Gemstone colours can vary; our images are illustrative.</p><p class="gemstone-guide-note">Learn more from the <a class="text-link" href="https://www.gia.edu/birthstones" target="_blank" rel="noopener noreferrer">GIA birthstone guide ↗</a>.</p>`;
}
function gemstoneGuidePage() {
  return `${pageHeading('A LITTLE GUIDANCE','The gemstone guide.','A colour for every chapter. Discover the birthstones in our collection.')}<section class="container gemstone-guide-page">${gemstoneGuideContent()}<a class="button button-primary" href="#/product/birthstone-story-necklace">Explore The Birthstone Story ↗</a></section>`;
}
function personalizationControls(product) {
 const fields=personalizationFields(product);
 if(!fields.length)return '';
 return `<div class="refinements" style="padding:15px 0"><p class="eyebrow">MAKE IT YOURS</p>${fields.map(f=>`<label class="refinement-field" data-personalization-field="${f.key}" ${f.when?'hidden':''} style="margin:12px 0;max-width:330px">${escape(f.label)}${f.choices?`<select data-personalization="${f.key}" required><option value="">Choose one</option>${f.choices.map(x=>`<option value="${escape(x)}">${escape(f.choiceLabels?.[x]||x)}</option>`).join('')}</select>`:`<input data-personalization="${f.key}" type="text" maxlength="${f.max}" placeholder="${product.id==='written-promise-bar'?'Your own meaningful message':'Initials, name or meaningful date'}" style="padding:12px;border:1px solid var(--line);background:var(--pearl);width:100%" required><span>Maximum ${f.max} characters</span>`}</label>`).join('')}${product.id==='birthstone-story-necklace'?`<details class="gemstone-guide"><summary>Gemstone guide · find your birthstone</summary>${gemstoneGuideContent()}</details>`:''}</div>`;
}
function productPage(id, params) {
  currentProduct=products.find(p=>p.id===id&&!p.hidden);if(!currentProduct)return notFound();
  const p=currentProduct;selectedOption=validOption(products,p,params?.get('sizes'))?params.get('sizes'):defaultOption(products,p);selectedPersonalization={};
  return `${breadcrumb(p.name,`<a href="#/shop?category=${p.category}">${p.category}</a> &nbsp; / &nbsp; `)}<section class="container product-layout"><div class="product-gallery ${p.category==='Necklaces'?'necklace-gallery':''}">${productPhoto(p,`${p.name}${isSet(p)?` — all ${includedCount(p)} ${pieceName(p)}s shown`:''} illustrative product photograph`,900,900)}<span class="gallery-label">${isSet(p)?`${includedCount(p)} ${pieceName(p).toUpperCase()}S INCLUDED · `:''}ILLUSTRATIVE COLLECTION IMAGERY</span></div><div class="product-details"><div class="eyebrow">${escape(p.style)} · ${escape(p.audience.join(' / '))}</div><h1>${escape(p.name)}</h1><p class="price">${money(p.price)}</p>${isSet(p)?`<p class="set-total-caption">Total for all ${includedCount(p)} ${pieceName(p)}s · ${p.earStack?'complete one-ear stack':p.category==='Rings'?'sizes chosen separately':p.category==='Jewellery Sets'?'options chosen separately':'lengths chosen separately'}</p>`:''}<p class="product-description">${escape(p.description)}</p>${isOfferEligible(p)?'<div class="promotion-notice"><strong>Eligible for the 20% collection offer</strong><p>Choose this and one other eligible design to save 20% on your eligible items. No minimum spend.</p><a class="text-link" href="#/shop?offer=true">Explore eligible jewellery ↗</a></div>':''}<div class="product-specs"><span>${escape(p.metal)}</span><span>${escape(p.stone)}</span></div>${p.id==='birthstone-story-necklace'?'<p id="birthstone-preview" class="demo-caption" aria-live="polite">January — Garnet shown. Choose your month to see its gemstone.</p>':''}${p.id!=='birthstone-story-necklace'&&p.gemstone&&p.gemstone!=='None'?'<a class="text-link gemstone-guide-link" href="#/gemstones">Gemstone guide ↗</a>':''}${['Earrings','Jewellery Sets'].includes(p.category)&&p.inclusionNote?`<p class="stack-inclusion-note">${escape(p.inclusionNote)}</p>`:''}${p.stack?'<p class="stack-inclusion-note">One wrist, a complete stack. Every bracelet pictured is included; choose the fit for each piece below.</p>':''}${finishControls(p)}${optionControls(p)}${personalizationControls(p)}${p.category==='Earrings'&&personalizationFields(p).length?'<p id="earring-preview" class="demo-caption" aria-live="polite">Choose your options to see an illustrated pair preview.</p>':''}${p.category==='Bracelets'&&personalizationFields(p).length?'<p id="bracelet-preview" class="demo-caption" aria-live="polite">Choose your details to see an illustrated preview.</p>':''}${p.id==='initial-verse-necklace'?'<p id="initial-preview" class="demo-caption" aria-live="polite">Choose your initial to preview your pendant.</p>':''}${personalizationFields(p).length&&!['Bracelets','Earrings'].includes(p.category)&&!['birthstone-story-necklace','initial-verse-necklace'].includes(p.id)?'<p class="demo-caption">Image shows example personalisation; it does not change with your selection.</p>':''}<button type="button" class="text-link reviews-jump" data-scroll-reviews>Read &amp; write reviews ↗</button><p class="stock-note" id="stock-note" aria-live="polite">Checking availability…</p><button class="button button-primary" id="add-to-bag">${isSet(p)?'Add complete set':'Add to bag'} <span>↗</span></button><p class="demo-caption">Portfolio collection · illustrative products · no real payment</p><details><summary>Materials & details</summary><p>Concept specification: ${escape(p.metal)}, <span data-stone-detail>${escape(p.stone.toLowerCase())}</span>. ${isSet(p)?`The price includes all ${includedCount(p)} ${pieceName(p)}s listed above. ${componentProducts(products,p).every(c=>!c.product.hidden)?'Each is also available individually.':'This design is sold as a complete set.'}`:'The price includes the selected product option.'} ${p.options.includes('Single')?'This earring is sold individually, not as a pair.':''} These are fictional products with AI-generated illustrative photography.</p></details><details><summary>Delivery & presentation</summary><p>Complimentary simulated delivery within South Africa. A delivery record is created after payment approval; no physical item is shipped.</p></details><details><summary>Caring for your piece</summary><p>Store separately in a soft pouch and avoid harsh chemicals. <a class="text-link" href="#/care">Read the care guide ↗</a></p></details></div></section><div class="container product-story">${escape(p.story)}</div>${reviewSection(p)}<section class="container section section-selected"><div class="section-heading"><div><p class="eyebrow">ANOTHER CHAPTER</p><h2>Beautiful together.</h2></div></div><div class="product-grid">${products.filter(x=>!x.hidden&&x.id!==p.id&&(isSet(p)?x.category===p.category:x.featured)).slice(0,4).map(card).join('')}</div></section>`;
}
function updateEarringPreview() {
  if(currentProduct?.category!=='Earrings'||!personalizationFields(currentProduct).length)return;
  const img=main.querySelector('.product-gallery img');
  img.src=productImage(currentProduct,selectedPersonalization);
  const stone=currentProduct.id==='birthstone-story-studs'?birthstones.find(b=>b.month===selectedPersonalization.birthMonth):null;
  if(currentProduct.id==='birthstone-story-studs'){main.querySelector('.product-specs span:last-child').textContent=stone?`${stone.stone} bezel studs · pair`:currentProduct.stone;main.querySelector('[data-stone-detail]').textContent=stone?`${stone.stone.toLowerCase()} bezel studs`:currentProduct.stone.toLowerCase();}
  try{
    const description=personalizationDescription(currentProduct,selectedPersonalization);
    img.alt=`${currentProduct.name} — ${description} illustrated pair preview`;
    main.querySelector('#earring-preview').textContent=`${description} · Illustrated pair preview.${currentProduct.id==='pearl-halo-jackets'?' Both studs and both pearl jackets are included.':''}`;
  }catch{
    img.alt=`${currentProduct.name} — illustrative pair preview`;
    main.querySelector('#earring-preview').textContent='Choose all your options to complete your illustrated pair preview.';
  }
}
function updateBraceletPreview() {
  if(currentProduct?.category!=='Bracelets'||!personalizationFields(currentProduct).length)return;
  for(const field of personalizationFields(currentProduct)){
    const label=main.querySelector(`[data-personalization-field="${field.key}"]`);
    if(field.when&&label)label.hidden=selectedPersonalization[field.when.key]!==field.when.value;
  }
  const img=main.querySelector('.product-gallery img');
  img.src=productImage(currentProduct,selectedPersonalization);
  try{
    const description=personalizationDescription(currentProduct,selectedPersonalization);
    img.alt=`${currentProduct.name} — ${description} illustrated preview`;
    main.querySelector('#bracelet-preview').textContent=`${description} · Illustrated personalisation preview.`;
  }catch{
    img.alt=`${currentProduct.name} — example product photograph`;
    main.querySelector('#bracelet-preview').textContent='Choose your details to see an illustrated preview.';
  }
}
function updateBirthstonePreview() {
  if(currentProduct?.id!=='birthstone-story-necklace')return;
  const stone=selectedBirthstone(currentProduct,selectedPersonalization);
  const img=main.querySelector('.product-gallery img');
  img.src=productImage(currentProduct,selectedPersonalization);
  img.alt=stone?`${currentProduct.name} — ${stone.month} ${stone.stone} pendant`:`${currentProduct.name} — January Garnet example`;
  main.querySelector('.product-specs span:last-child').textContent=stone?`Round ${stone.stone} pendant`:currentProduct.stone;
  main.querySelector('[data-stone-detail]').textContent=stone?`round ${stone.stone} pendant`:currentProduct.stone.toLowerCase();
  main.querySelector('#birthstone-preview').textContent=stone?`${stone.month} — ${stone.stone} · ${stone.colour}. Your selected gemstone is shown.`:'January — Garnet shown. Choose your month to see its gemstone.';
}
async function checkStock() {
  if(!currentProduct||!document.querySelector('#stock-note'))return;
  const sequence=++stockSequence,view=activeView,p=currentProduct,option=selectedOption;
  const note=document.querySelector('#stock-note'),button=document.querySelector('#add-to-bag');
  note.textContent=isSet(p)?`Checking every ${pieceName(p)} in your set…`:'Checking availability…';note.classList.remove('available');button.disabled=true;
  try{
    const needed=componentProducts(products,p).map((c,i)=>({productId:sku(c.product,option.split('|')[i]),quantity:1}));
    const demand=bag.length?expandBag(products,bag):[];
    const stocks=await Promise.all(needed.map(item=>api(`/inventory/${encodeURIComponent(item.productId)}`)));
    if(sequence!==stockSequence||view!==activeView)return;
    const available=Math.max(0,Math.min(...needed.map((item,i)=>Math.floor((stocks[i].availableQuantity-(demand.find(d=>d.productId===item.productId)?.quantity||0))/item.quantity))));
    note.textContent=available>0?(isSet(p)?`Complete set available · ${available}${p.earStack?' one-ear stacks':` with these ${p.category==='Jewellery Sets'?'':pieceName(p)+' '}${p.category==='Rings'?'sizes':p.category==='Jewellery Sets'?'options':'lengths'}`}`:`${available} available in this option, after your current bag`):(isSet(p)?'The complete set is unavailable in these sizes. Try another size or check your bag.':'This option is unavailable or already allocated to your bag.');
    note.classList.toggle('available',available>0);button.disabled=available<=0;
  }catch{
    if(sequence!==stockSequence||view!==activeView)return;
    note.textContent=isSet(p)?`Availability of every ${pieceName(p)} will be confirmed at integrated checkout.`:'Availability will be confirmed by the integrated checkout.';button.disabled=false;
  }
}
function promotionNotice() {
  const pricing=bagPricing();
  if(pricing.qualified)return `<div class="promotion-notice promotion-active" role="status"><strong>Your 20% collection offer is unlocked.</strong><p>You save ${money(pricing.discount)} on eligible items. Other pieces stay at their regular price.</p><a class="text-link" href="#/shop?offer=true">Explore eligible jewellery ↗</a></div>`;
  return `<div class="promotion-notice" role="status"><strong>${pricing.eligibleDesignCount===1?'Add one more eligible design to get 20% off.':'Build Your Collection — save 20%.'}</strong><p>${pricing.eligibleDesignCount===1?'You have one eligible design in your bag. Choose a different eligible design to unlock 20% off all eligible items.':'Choose two different eligible designs to unlock 20% off those items.'} No minimum spend. Complete sets are excluded.</p><a class="text-link" href="#/shop?offer=true">Explore eligible jewellery ↗</a></div>`;
}
function summary(checkout = false) {
  const pricing=bagPricing();
  return `<aside class="order-summary"><h2>Your ${checkout?'order':'bag'}, considered.</h2>${promotionNotice()}${checkout?bag.map(item=>{const p=products.find(p=>p.id===item.id);return `<div class="checkout-line"><div>${escape(p.name)} × ${item.quantity}<span>${escape(p.optionLabel)}: ${escape(optionDescription(p,item.option,item.personalization))}</span></div><div>${money(p.price*item.quantity)}</div></div>`;}).join(''):''}<div class="summary-row"><span>Subtotal</span><span>${money(pricing.subtotal)}</span></div>${pricing.discount?`<div class="summary-row promotion-saving"><span>Collection offer · 20% off eligible items</span><span>−${money(pricing.discount)}</span></div>`:''}<div class="summary-row"><span>Demo delivery</span><span>Complimentary</span></div><div class="summary-row total"><span>Total</span><span>${money(pricing.total)}</span></div>${!checkout?'<a class="button button-primary" href="#/checkout">Continue to checkout <span>↗</span></a>':''}<p class="small-note">All prices in South African rand. This is a portfolio demonstration. No real payment is taken.</p></aside>`;
}
function emptyBag() { return `<div class="container empty-state"><div class="empty-symbol">✧</div><h2>Your story is still unfolding.</h2><p>Your bag is empty. Find a piece that feels like you.</p><a class="button button-primary" href="#/shop">Explore the collection ↗</a></div>`; }
function bagPage() {
  if (!bag.length) return pageHeading('YOUR COLLECTION','The shopping bag.') + emptyBag();
  return `${pageHeading('A FEW THINGS TO TREASURE','The shopping bag.')}<div class="container commerce-layout"><div>${bag.map((item,index)=>{const p=products.find(p=>p.id===item.id);return `<article class="bag-item"><a class="bag-item-image" href="${productLink(p)}">${productPhoto(p,p.name,160,160,item.personalization)}</a><div><a href="${productLink(p)}"><h2>${escape(p.name)}</h2></a><p>${escape(p.metal)}${isSet(p)?` · ${includedCount(p)}-${pieceName(p)} set`:""}</p><p>${escape(optionDescription(p,item.option,item.personalization))}</p><div class="item-controls"><div class="quantity-control"><button data-quantity="${index}" data-delta="-1" aria-label="Decrease quantity of ${escape(p.name)}" ${item.quantity===1?'disabled':''}>−</button><span>${item.quantity}</span><button data-quantity="${index}" data-delta="1" aria-label="Increase quantity of ${escape(p.name)}" ${item.quantity>=10?'disabled':''}>+</button></div><button class="remove-button" data-remove="${index}" aria-label="Remove ${escape(p.name)} in ${escape(optionDescription(p,item.option,item.personalization))}">Remove</button></div></div><div class="item-price">${money(p.price*item.quantity)}</div></article>`;}).join('')}<a class="text-link continue-link" href="#/shop">← Continue exploring</a></div>${summary()}</div>`;
}
function checkoutPage() {
  if (!currentUser) return signInGate('checkout');
  if (!bag.length) return emptyBag();
  return `${pageHeading('THE NEXT CHAPTER','Make it yours.')}<div class="container commerce-layout"><form id="checkout-form" class="checkout-form"><div class="demo-notice">This is a simulated checkout. Use fictional contact and delivery details. No card information or real payment is required.</div><div id="checkout-availability" class="demo-notice" aria-live="polite">Checking demo checkout availability…</div><h2>Your details</h2><div class="field-grid"><div class="field"><label for="first-name">First name</label><input id="first-name" name="firstName" autocomplete="given-name" required maxlength="60" placeholder="Demo" value="${escape(currentUser.firstName)}"></div><div class="field"><label for="last-name">Last name</label><input id="last-name" name="lastName" autocomplete="family-name" required maxlength="60" placeholder="Customer" value="${escape(currentUser.lastName)}"></div></div><div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" required maxlength="120" placeholder="demo@example.com" value="${escape(currentUser.email)}" readonly></div><hr class="section-divider"><h2>Your delivery</h2><div class="field"><label for="address">Street address</label><input id="address" name="address" autocomplete="street-address" required maxlength="200" placeholder="12 Example Street"></div><div class="field-grid"><div class="field"><label for="city">City</label><input id="city" name="city" autocomplete="address-level2" required maxlength="80" placeholder="Johannesburg"></div><div class="field"><label for="postal-code">Postal code</label><input id="postal-code" name="postalCode" autocomplete="postal-code" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required placeholder="2000"></div></div><div class="field"><label for="province">Province</label><select id="province" name="province" required><option value="">Select a province</option>${['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','North West','Northern Cape','Western Cape'].map(p=>`<option>${p}</option>`).join('')}</select></div><hr class="section-divider"><h2>Payment</h2><p class="section-intro">Payment is simulated for this portfolio demonstration. No card details are collected and no money is charged.</p><label class="check-label"><input type="checkbox" name="acknowledged" required><span>I understand this is a portfolio demo and I am using fictional details.</span></label><p id="checkout-error" class="form-error" role="alert" hidden></p><button class="button button-primary" id="place-order" disabled>Place demo order <span>↗</span></button><p class="small-note" id="checkout-submit-status" aria-live="polite"></p></form>${summary(true)}</div>`;
}
async function checkoutAvailability(view) {
  try {
    const auth=await api('/auth/me');if(view!==activeView)return;if(!auth.user){currentUser=null;updateAccountLink();location.hash='#/signin?next=checkout';return;}if(auth.user.id!==currentUser?.id){currentUser=auth.user;updateAccountLink();invalidateCheckout();render();return;}currentUser=auth.user;
    const health=await api('/health'); if (view!==activeView) return;
    document.querySelector('#checkout-availability').textContent=health.mode==='demo'
      ? 'Online demo checkout is ready. No real payment or delivery will take place.'
      : 'Integrated checkout is ready. Stock and prices will be confirmed by ShopLink.';
    document.querySelector('#place-order').disabled=false;
  } catch {
    if (view!==activeView) return;
    document.querySelector('#checkout-availability').innerHTML='Demo checkout is temporarily unavailable. Your bag is saved; please refresh or try again. <a href="#/about">Project details ↗</a>';
  }
}
async function submitCheckout(form) {
  if(!currentUser){location.hash='#/signin?next=checkout';return;}
  if (checkoutSubmitting) return;
  const error = document.querySelector('#checkout-error'), button=document.querySelector('#place-order'), status=document.querySelector('#checkout-submit-status');
  error.hidden=true; checkoutSubmitting=true;button.disabled=true;button.textContent='Placing your demo order…';status.textContent='Saving your simulated order securely. Please wait.';
  if (!checkoutKey) { checkoutKey=crypto.randomUUID();saveStorage('hv-checkout-key',checkoutKey); }
  const view=activeView, submittedBag=bag.map(item=>({...item})), requestKey=checkoutKey;
  try {
    const data=Object.fromEntries(new FormData(form));
    const receipt=await api('/orders',{method:'POST',headers:{'Idempotency-Key':requestKey},body:JSON.stringify({customer:data,selections:submittedBag})});
    recentOrders=[receipt.order.id,...recentOrders.filter(id=>id!==receipt.order.id)].slice(0,10);saveStorage('hv-orders',recentOrders);
    bag=bag.map(item=>({...item,quantity:item.quantity-(submittedBag.find(i=>selectionKey(products.find(p=>p.id===i.id),i)===selectionKey(products.find(p=>p.id===item.id),item))?.quantity||0)})).filter(item=>item.quantity>0);updateBag();if(checkoutKey===requestKey)invalidateCheckout();location.hash=`#/order/${receipt.order.id}`;
  } catch (err) {
    if(view!==activeView) return;
    if(err.code==='AUTH_REQUIRED'){currentUser=null;updateAccountLink();location.hash='#/signin?next=checkout';toast('Please sign in again. Your bag has been kept.');return;}
    error.textContent=err.name==='TimeoutError'?'The request timed out. Retry with the same bag to recover the existing request safely.':err.message;error.hidden=false;status.textContent='Your bag has been kept.';
  } finally {checkoutSubmitting=false;if(view===activeView&&button.isConnected){button.disabled=false;button.innerHTML='Place demo order <span>↗</span>';}}
}
function trackPage() {
  if(!currentUser)return signInGate('track');
  return `${pageHeading('FOLLOW YOUR STORY','Track your order.','Sign in and enter an order reference from your account.')}<div class="container"><form class="track-form" id="track-form"><div class="field"><label for="order-reference">Order reference</label><input id="order-reference" name="reference" required maxlength="100" pattern="[a-zA-Z0-9-]+" placeholder="Your order reference"></div><button class="button button-primary">Find my order ↗</button>${recentOrders.length?`<h2 style="margin:35px 0 20px;font-size:28px">Your recent demo orders</h2>${recentOrders.map(id=>`<p><a class="text-link" href="#/order/${encodeURIComponent(id)}">${escape(id.slice(0,18))}… ↗</a></p>`).join('')}`:''}</form><p class="track-help"><a class="text-link" href="#/help">Need help with an order? ↗</a></p></div>`;
}
function orderShell(id) { if(!currentUser)return signInGate('account');return `<div class="container"><section class="order-result" id="order-result"><div class="loading-state" role="status">Finding your order…</div></section></div>`; }
async function refreshOrder(id, view, attempt = 0) {
  try {
    const {order,delivery,receipt}=await api(`/orders/${encodeURIComponent(id)}`);
    if(view!==activeView)return;
    const failed=['PAYMENT_FAILED','STOCK_RELEASE_PENDING'].includes(order.status), paid=order.status==='PAID', ready=paid&&!!delivery;
    const title=failed?'A little pause in your story.':ready?'A new chapter begins.':'Your story is taking shape.';
    const description=failed?'The simulated payment was declined. No money was taken.':ready?(delivery?.status==='SIMULATED'?'Your demo order was saved. No money was taken and no product will be shipped.':'Your simulated payment is approved and a delivery record has been created.'):'Your order is reserved. We’re waiting for the simulated payment and delivery services.';
    document.querySelector('#order-result').innerHTML=`<div class="order-heading"><span class="eyebrow">${failed?'PAYMENT UPDATE':ready?'THANK YOU FOR EXPLORING':'ORDER RECEIVED'}</span><h1>${title}</h1><p>${description}</p><div class="order-id">${escape(order.id)}</div></div><ol class="timeline" aria-label="Order progress"><li class="complete"><span>01 · Order reserved</span><p>Your selected pieces</p></li><li class="${paid?'complete':''}"><span>02 · Payment ${failed?'declined':'approved'}</span><p>${failed?'Simulated decline':paid?'Simulation complete':'Awaiting payment'}</p></li><li class="${ready?'complete':''}"><span>03 · Delivery created</span><p>${ready?'Demo delivery ready':'Awaiting approval'}</p></li></ol><div class="tracking-detail"><h2>Your order</h2>${receipt?.selections?receipt.selections.map(item=>`<div class="summary-row"><div>${escape(item.name)} × ${item.quantity}<p>${escape(item.option)}${item.setSize>1?` · ${item.setSize} ${escape(item.setUnit||'ring')}s per set`:''}</p></div><span>${money(item.price*item.quantity)}</span></div>`).join(''):order.items.map(item=>`<div class="summary-row"><span>${escape(item.productName)} × ${item.quantity}</span><span>${money(item.unitPrice*item.quantity)}</span></div>`).join('')}<div class="summary-row"><span>Subtotal</span><span>${money(order.subtotal??order.items.reduce((s,i)=>s+i.unitPrice*i.quantity,0))}</span></div>${order.discount>0?`<div class="summary-row promotion-saving"><span>Collection offer · 20% off eligible items</span><span>−${money(order.discount)}</span></div>`:''}<div class="summary-row total"><span>Total</span><span>${money(order.total??order.items.reduce((s,i)=>s+i.unitPrice*i.quantity,0))}</span></div><p>Status: ${escape(order.status.replaceAll('_',' '))}</p>${delivery?`<p>Delivery reference: ${escape(delivery.deliveryId)} · ${escape(delivery.status)}</p>`:''}${receipt?`<p>Demo delivery to ${escape(receipt.city)}, ${escape(receipt.province)}.</p>`:''}</div>${failed?`<div class="demo-notice" style="margin-top:25px">${order.status==='STOCK_RELEASE_PENDING'?'The inventory service is still restoring your stock reservation.':'The reserved stock has been restored.'}</div>`:''}<p class="demo-caption" style="margin-top:20px">No physical goods will be shipped. This is a portfolio demonstration.</p><p id="poll-status" class="demo-caption" aria-live="polite">${!ready&&!failed?'Checking for updates…':''}</p><div class="tracking-actions"><a class="button" href="#/help?order=${encodeURIComponent(id)}">Help with this order ↗</a><button class="button" id="refresh-order" data-order="${escape(id)}">Refresh status</button><a class="button button-primary" href="#/shop">Continue exploring ↗</a></div>`;
    if((!ready&&!failed||order.status==='STOCK_RELEASE_PENDING')&&attempt<30) pollTimer=setTimeout(()=>refreshOrder(id,view,attempt+1),2000);
    else if(!ready&&!failed)document.querySelector('#poll-status').textContent='Processing is taking longer than expected. Use Refresh status to check again.';
  } catch(error) {
    if(view!==activeView)return;
    document.querySelector('#order-result').innerHTML=`<div class="empty-state"><h2>We couldn’t find that chapter.</h2><p>${escape(error.message)}</p><a class="button" href="#/track">Try another reference</a></div>`;
  }
}
const editorialPages = {
  story: ['OUR STORY','Every piece holds a verse.',`<p class="lead">An heirloom is more than something precious. It’s a story someone chose to keep.</p><p>The Heirloom Verse is a fictional fine jewellery house imagined in South Africa. Its first collection explores the moments that make a life: a beginning, a promise, an achievement, a memory.</p><h2>A quieter kind of luxury.</h2><p>Our design language is warm and considered: yellow gold, luminous diamonds and simple silhouettes. Pieces are imagined to feel personal, with beauty in the detail rather than the noise.</p><h2>A store with a story behind it.</h2><p>This website is also a full-stack portfolio project. Behind the collection sits ShopLink: a system connecting products, inventory, orders, simulated payments, deliveries and notifications.</p><p>All products, specifications and brand stories are fictional. Collection photography is AI-generated and illustrative.</p><a class="button button-primary" href="#/shop">Discover the first verse ↗</a>`],
  care: ['A LITTLE EVERYDAY CARE','Keep your treasures beautiful.',`<p class="lead">The things you love deserve a little care.</p><h2>Wear thoughtfully.</h2><p>Remove jewellery before swimming, exercise, cleaning or using harsh chemicals. Put jewellery on after lotions and fragrance have settled.</p><h2>Clean gently.</h2><p>For solid gold and diamonds, use a soft cloth and gentle cleaning appropriate to the setting. Avoid abrasive products. A professional jeweller can advise on delicate stones and settings.</p><h2>Store separately.</h2><p>Keep each piece in its own soft pouch to prevent scratches and tangled chains. Check clasps and settings regularly with a professional jeweller.</p><p>This is general care information accompanying a fictional collection.</p>`],
  sizes: ['THE RIGHT FIT','Find your fit.',`<p>Our concept collection uses UK letter sizes. The measurements below are approximate internal circumferences.</p><table><thead><tr><th scope="col">UK size</th><th scope="col">Circumference</th></tr></thead><tbody><tr><td>J</td><td>48.7 mm</td></tr><tr><td>L</td><td>51.2 mm</td></tr><tr><td>N</td><td>53.8 mm</td></tr><tr><td>P</td><td>56.3 mm</td></tr><tr><td>R</td><td>58.9 mm</td></tr></tbody></table><h2>Necklace lengths</h2><p>New chains and matching necklaces offer 40cm, 45cm, 50cm, 55cm and 60cm lengths. Choose each necklace length separately in a matching pair. Layered designs share one clasp: select the inner chain length; the Duet adds 5cm for the outer layer, while the Threefold adds 5cm and 10cm. The Arc collar uses inner circumference.</p><h2>Bracelet lengths</h2><p>Measure around your wrist with a soft tape, then choose your preferred bracelet length. The Shared Verse pairs offer 15cm, 17cm, 19cm, 21cm and 23cm options. Each black and white bracelet can have a different length.</p><p>For a real purchase, have a jeweller measure your finger with a professional ring sizer. Fit varies with band width and temperature.</p><p>The collection also offers ring sizes T, V, X and Z. Chain lengths range from 40cm to 60cm, and bracelets offer product-specific lengths or S/M/L cuff sizes. For a matching set, choose each ring size, bracelet length or necklace length separately. Each physical option has its own stock reference.</p>`],
  delivery: ['HERE TO HELP','Delivery & returns.',`<p class="lead">A considered experience, from selection to arrival.</p><div class="demo-notice">This is a portfolio demonstration. No physical products are sold or delivered, and no real returns are processed.</div><h2>Simulated delivery.</h2><p>In the hosted demo, checkout records a simulated delivery reference in your Supabase-backed order. No courier is booked. When running the complete ShopLink project locally, its delivery service creates the delivery record.</p><h2>In the full local integration.</h2><p>The local Java payment service can simulate a declined payment; the order service then restores reserved stock. Hosted demo orders are always simulated as approved.</p><h2>Contact & support.</h2><p>No customer support inbox or commercial returns service is operated for this fictional store. Use the project documentation for technical setup and troubleshooting.</p>`],
  about: ['BEHIND THE COLLECTION','A full-stack story.',`<p class="lead">A luxury storefront, powered by systems integration.</p><p>The Heirloom Verse brings a customer experience to ShopLink’s Java and Spring Boot services. The hosted version supports collection browsing, accounts, reviews and Supabase-backed simulated checkout and order history.</p><h2>The integrated local experience.</h2><p>Run the project with Docker Compose, then visit the storefront on port 3000. Checkout connects to the order service, confirms backend prices, reserves stock for the selected variant, simulates payment and creates a delivery.</p><ul><li>Product and inventory services own prices and availability.</li><li>Orders use REST to validate products and reserve stock.</li><li>ActiveMQ carries payment, order-status and delivery events.</li><li>A same-origin storefront gateway keeps service addresses out of the browser.</li><li>A Supabase PostgreSQL checkout journal records order references, selected designs and customer-provided fictional delivery details.</li></ul><h2>Portfolio boundaries.</h2><p>Products are fictional and imagery is AI-generated. The Java services currently keep their business state in memory, so restarting those services resets stock and orders. The checkout journal does not make the underlying services durable. Sign in or create an account to place a demo order and view your order history. The administration dashboard belongs to a future release.</p><p>Do not enter real personal details. The hosted demo can place simulated orders directly in Supabase; it does not run the five Java microservices or process actual payments.</p>`]
};
function editorialPage(key) { const [eyebrow,title,body]=editorialPages[key];return `<article class="container"><div class="editorial"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${body}</div></article>`; }
function notFound() {return `<div class="empty-state"><h1>A page still unwritten.</h1><p>We couldn’t find that page.</p><a class="button button-primary" href="#/">Return home</a></div>`;}
function updateShopParam(key,value) {
  const [,query='']=location.hash.split('?'),params=new URLSearchParams(query);
  if(value&&value!=='All jewellery')params.set(key,value);else params.delete(key);
  if(key==='category'){if(value!=='Necklaces')params.delete('singles');params.delete('style');params.delete('size');if(!categories.includes(value)||value==='Jewellery Sets')params.delete('sets');}
  if(key==='sets'&&value==='true'){params.delete('singles');if(!categories.includes(params.get('category')))params.delete('category');params.delete('style');params.delete('size');}
  location.hash=`#/shop${params.size?'?'+params:''}`;
}
function render() {
  clearTimeout(pollTimer);stockSequence++;activeView++;const view=activeView;
  const [rawPath,query='']=(location.hash.slice(1)||'/').split('?');const parts=rawPath.split('/').filter(Boolean);const page=parts[0]||'home';const params=new URLSearchParams(query);
  currentProduct=null;
  const entryMode=!currentUser&&page!=='help';
  document.body.classList.toggle('account-entry-mode',entryMode);
  if(!currentUser&&!['signin','signup','help'].includes(page)){
    disposeCampaign();
    const next=['checkout','account','track','shop'].includes(page)?page:'home';
    main.innerHTML=welcomeEntry(next);document.title='Welcome · The Heirloom Verse';
    return;
  }
  let html;
  if(page==='home')html=homePage();else if(page==='signin'||page==='signup')html=currentUser?accountPage(currentUser):accountForm(page,params);else if(page==='account')html=accountPage(currentUser);else if(page==='help')html=helpPage(params);else if(page==='reviews')html=reviewsPage(products);else if(page==='shop')html=shopPage(params);else if(page==='gemstones')html=gemstoneGuidePage();else if(page==='product')html=productPage(parts[1],params);else if(page==='bag')html=bagPage();else if(page==='checkout')html=checkoutPage();else if(page==='track')html=trackPage();else if(page==='order'&&/^[a-zA-Z0-9-]{1,100}$/.test(parts[1]||''))html=orderShell(parts[1]);else if(editorialPages[page])html=editorialPage(page);else html=notFound();
  disposeCampaign();
  main.innerHTML=`<div class="page-enter">${html}</div>`;
  disposeCampaign=initializeCampaign(main);
  document.title=page==='home'?'The Heirloom Verse · Fine Jewellery':`${page==='product'&&currentProduct?currentProduct.name:page==='shop'?'The collection':page==='gemstones'?'Gemstone guide':page.charAt(0).toUpperCase()+page.slice(1)} · The Heirloom Verse`;
  document.querySelector('#main-nav').classList.remove('is-open');document.querySelector('#menu-button').setAttribute('aria-expanded','false');
  if((page==='account'||page==='signin'||page==='signup')&&currentUser)loadAccountOrders(view);
  if(page==='product'&&currentProduct){loadReviews(currentProduct.id,view).then(()=>{if(view===activeView&&params.get('review')==='true')main.querySelector('#product-reviews')?.scrollIntoView({block:'start'});});}if(page==='reviews')loadReviews(null,view);
  if(page==='product'&&currentProduct)checkStock();if(page==='checkout'&&bag.length&&currentUser)checkoutAvailability(view);if(page==='order'&&currentUser&&document.querySelector('#order-result'))refreshOrder(parts[1],view);
}
async function loadReviews(productId,view) {
  try {
    const data=await api('/reviews'+(productId?'/'+encodeURIComponent(productId):''));
    if(view!==activeView)return;
    const results=main.querySelector('#review-results');if(!results)return;
    results.innerHTML=reviewResults(data,products);
    const form=main.querySelector('#review-form');
    if(form){
      form.querySelector('fieldset').disabled=false;
      if(data.ownReview){for(const key of ['name','rating','comment'])form.elements.namedItem(key).value=data.ownReview[key];}
      form.querySelector('button[type="submit"]').textContent=data.ownReview?'Update your review ↗':'Save review ↗';
      form.querySelector('[data-delete-review]').hidden=!data.ownReview;
    }
  }catch(error){
    if(view!==activeView)return;
    const results=main.querySelector('#review-results');
    if(results)results.innerHTML='<p class="form-error">Reviews could not be loaded. Refresh to try again. Reviews require the local demo server.</p>';
  }
}
async function saveReview(form) {
  if(form.dataset.submitting)return;
  const status=form.querySelector('#review-status'),fieldset=form.querySelector('fieldset'),view=activeView;
  try {
    const values=Object.fromEntries(new FormData(form));
    const review=validateReview({...values,rating:Number(values.rating)});
    form.dataset.submitting='true';fieldset.disabled=true;status.textContent='Saving your review…';
    const result=await api('/reviews/'+encodeURIComponent(form.dataset.product),{method:'POST',body:JSON.stringify(review)});
    if(view!==activeView)return;
    status.textContent=result.message;
    await loadReviews(form.dataset.product,view);
  }catch(error){if(view===activeView)status.textContent=error.message;}
  finally{delete form.dataset.submitting;if(view===activeView&&form.isConnected)fieldset.disabled=false;}
}
async function deleteReview(productId,button) {
  if(button.disabled)return;
  const view=activeView;button.disabled=true;
  try {
    await api('/reviews/'+encodeURIComponent(productId),{method:'DELETE'});
    if(view!==activeView)return;
    const form=main.querySelector('#review-form');if(form)form.reset();
    await loadReviews(currentProduct?.id||null,view);toast('Your review has been removed.');
  }catch(error){if(view===activeView)toast(error.message);}
  finally{if(button.isConnected)button.disabled=false;}
}
function updateAccountLink() {
  const link=document.querySelector('#account-link');
  if(link){link.textContent=currentUser?'My account':'Sign in';link.href=currentUser?'#/account':'#/signin';}
  const create=document.querySelector('#account-create');if(create)create.hidden=!!currentUser;
}
async function refreshAccount() {
  try{currentUser=(await api('/auth/me')).user;}catch{currentUser=null;}
  updateAccountLink();
}
async function submitAccount(form) {
  if(form.dataset.submitting)return;
  const values=Object.fromEntries(new FormData(form)),error=form.querySelector('#account-error'),button=form.querySelector('button[type="submit"]');
  error.hidden=true;
  if(form.dataset.mode==='register'&&values.password!==values.confirmPassword){error.textContent='Your passwords do not match.';error.hidden=false;return;}
  const view=activeView;
  form.dataset.submitting='true';button.disabled=true;
  try {
    const data=await api('/auth/'+form.dataset.mode,{method:'POST',body:JSON.stringify(values)});
    if(view!==activeView){await refreshAccount();return;}
    currentUser=data.user;updateAccountLink();invalidateCheckout();recentOrders=[];saveStorage('hv-orders',recentOrders);
    form.reset();const destination=authDestination(new URLSearchParams({next:form.dataset.next}));location.hash=destination==='home'?'#/':'#/'+destination;
  }catch(err){if(view===activeView){error.textContent=err.message;error.hidden=false;}}
  finally{delete form.dataset.submitting;if(button.isConnected)button.disabled=false;}
}
async function signOut(button) {
  if(checkoutSubmitting){toast('Please wait for checkout to finish before signing out.');return;}
  if(button.disabled)return;button.disabled=true;
  try{await api('/auth/logout',{method:'POST'});currentUser=null;updateAccountLink();invalidateCheckout();recentOrders=[];saveStorage('hv-orders',recentOrders);location.hash='#/';toast('You have signed out.');}
  catch(error){toast(error.message);}finally{if(button.isConnected)button.disabled=false;}
}
async function loadAccountOrders(view) {
  try{const data=await api('/account/orders');if(view!==activeView)return;const list=main.querySelector('#account-orders');if(list)list.innerHTML=orderHistory(data);}
  catch(error){if(view!==activeView)return;if(error.code==='AUTH_REQUIRED'){currentUser=null;updateAccountLink();location.hash='#/signin';return;}const list=main.querySelector('#account-orders');if(list)list.innerHTML='<p class="form-error">Your orders could not be loaded. Please refresh to try again.</p>';}
}
main.addEventListener('click',event=>{
  if(event.target.closest('#sign-out')){signOut(event.target.closest('#sign-out'));return;}
  if(event.target.closest('[data-scroll-reviews]')){main.querySelector('#product-reviews')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  const removeReview=event.target.closest('[data-delete-review]');if(removeReview){deleteReview(removeReview.dataset.deleteReview,removeReview);return;}
  const audience=event.target.closest('[data-audience]');if(audience){updateShopParam('audience',audience.dataset.audience==='Everyone'?'':audience.dataset.audience);return;}
  const category=event.target.closest('[data-category]');if(category){updateShopParam('category',category.dataset.category);return;}
  const option=event.target.closest('[data-option]');if(option){selectedOption=option.dataset.option;document.querySelector('#option-value').textContent=selectedOption;main.querySelectorAll('[data-option]').forEach(b=>b.setAttribute('aria-pressed',String(b===option)));checkStock();return;}
  if(event.target.closest('#add-to-bag')&&currentProduct){
    let personalization;
    try{personalization=normalizedPersonalization(currentProduct,selectedPersonalization);}catch(error){toast(error.message);return;}
    const item={id:currentProduct.id,option:selectedOption,personalization,quantity:1};
    const key=selectionKey(currentProduct,item);
    const existing=bag.find(i=>i.id===item.id&&selectionKey(currentProduct,i)===key);
    if(existing&&existing.quantity>=10){toast('A maximum of 10 of each option can be added.');return;}
    if(existing)existing.quantity++;else bag.push(item);
    invalidateCheckout();updateBag();toast(`${currentProduct.name} added to your bag.`,true);checkStock();return;
  }
  const quantity=event.target.closest('[data-quantity]');if(quantity){const item=bag[Number(quantity.dataset.quantity)];if(item){item.quantity=Math.max(1,Math.min(10,item.quantity+Number(quantity.dataset.delta)));invalidateCheckout();updateBag();render();}return;}
  const remove=event.target.closest('[data-remove]');if(remove){bag.splice(Number(remove.dataset.remove),1);invalidateCheckout();updateBag();render();return;}
  const refresh=event.target.closest('#refresh-order');if(refresh){clearTimeout(pollTimer);refresh.disabled=true;refreshOrder(refresh.dataset.order,activeView);}
});
main.addEventListener('change',event=>{
  if(event.target.dataset.personalization)selectedPersonalization[event.target.dataset.personalization]=event.target.value;
  if(event.target.dataset.personalization){updateBraceletPreview();updateEarringPreview();}
  if(event.target.dataset.personalization==='birthMonth')updateBirthstonePreview();
  if(event.target.dataset.personalization==='initial'&&currentProduct?.id==='initial-verse-necklace'){
    const initial=selectedPersonalization.initial;
    const img=main.querySelector('.product-gallery img');
    img.src=productImage(currentProduct,selectedPersonalization);
    img.alt=initial?`${currentProduct.name} — ${initial} initial pendant preview`:`${currentProduct.name} — A example pendant`;
    main.querySelector('#initial-preview').textContent=initial?`${initial} — your selected initial pendant preview.`:'Choose your initial to preview your pendant.';
  }
  if(event.target.id==='shop-sort')updateShopParam('sort',event.target.value);
  if(event.target.dataset.refinement)updateShopParam(event.target.dataset.refinement,event.target.value);
  if(event.target.id==='sets-only')updateShopParam('sets',event.target.checked?'true':'');
  if(event.target.dataset.componentIndex!==undefined){const choices=selectedOption.split('|');choices[Number(event.target.dataset.componentIndex)]=event.target.value;selectedOption=choices.join('|');main.querySelectorAll('.finish-option, .design-option').forEach(link=>{link.href=link.getAttribute('href').split('?')[0]+'?sizes='+encodeURIComponent(selectedOption);});checkStock();}
});
main.addEventListener('input',event=>{if(event.target.dataset.personalization){selectedPersonalization[event.target.dataset.personalization]=event.target.value;updateBraceletPreview();updateEarringPreview();}});
main.addEventListener('submit',event=>{event.preventDefault();if(event.target.id==='account-form'){submitAccount(event.target);return;}if(event.target.id==='review-form'){saveReview(event.target);return;}if(event.target.id==='choose-review-product'){location.hash=`#/product/${encodeURIComponent(new FormData(event.target).get('product'))}?review=true`;return;}if(event.target.id==='shop-search-form')updateShopParam('q',document.querySelector('#shop-query').value.trim());if(event.target.id==='checkout-form')submitCheckout(event.target);if(event.target.id==='track-form')location.hash=`#/order/${encodeURIComponent(new FormData(event.target).get('reference').trim())}`;});
document.querySelector('#menu-button').addEventListener('click',()=>{const open=document.querySelector('#main-nav').classList.toggle('is-open');document.querySelector('#menu-button').setAttribute('aria-expanded',String(open));});
document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();main.focus();main.scrollIntoView();});
document.querySelector('#search-button').addEventListener('click',()=>{document.querySelector('#search-dialog').showModal();document.querySelector('#global-search').focus();});
document.querySelector('#search-form').addEventListener('submit',event=>{event.preventDefault();document.querySelector('#search-dialog').close();location.hash=`#/shop?q=${encodeURIComponent(document.querySelector('#global-search').value.trim())}`;});
document.querySelector('#year').textContent=new Date().getFullYear();
window.addEventListener('hashchange',()=>{render();window.scrollTo({top:0,behavior:'instant'});main.focus({preventScroll:true});});
window.addEventListener('storage',event=>{if(event.key==='hv-bag')loadBag();});
function loadBag(){const stored=readStorage('hv-bag',[]);bag=Array.isArray(stored)?stored.filter(i=>i&&products.some(p=>!p.hidden&&p.id===i.id&&validOption(products,p,i.option)&&(()=>{try{normalizedPersonalization(p,i.personalization);return true;}catch{return false;}})())&&Number.isInteger(i.quantity)&&i.quantity>=1&&i.quantity<=10):[];bag=bag.filter((i,index)=>bag.findIndex(x=>selectionKey(products.find(p=>p.id===x.id),x)===selectionKey(products.find(p=>p.id===i.id),i))===index);updateBag(false);if(location.hash==='#/bag')render();}
try {const response=await fetch('/catalogue.json');if(!response.ok)throw new Error();products=await response.json();await refreshAccount();loadBag();render();}catch{main.innerHTML='<div class="empty-state"><h1>A brief interlude.</h1><p>The collection could not load. Please refresh the page.</p><button class="button" id="reload-collection">Try again</button></div>';document.querySelector('#reload-collection').addEventListener('click',()=>location.reload());}
