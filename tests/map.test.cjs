const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { mappableHomes, createMapView, buildPopup } = require('../public/map.js');
const { initialize, formatPrice, formatNumber, listingUrl } = require('../public/app.js');
const data = JSON.parse(readFileSync(new URL('../public/homes.json', `file://${__filename}`)));
const helpers = { formatPrice, formatNumber, listingUrl };

// A small DOM test double: all map behavior is exercised without network tiles.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.attrs = {}; this.events = {}; this.dataset = {};
    this.hidden = false; this.value = ''; this.disabled = false; this.textContent = '';
    const classes = new Set();
    this.classList = { toggle: (name, on) => on ? classes.add(name) : classes.delete(name), contains: name => classes.has(name) };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attrs[name] = value; }
  getAttribute(name) { return this.attrs[name]; }
  addEventListener(name, handler) { this.events[name] = handler; }
  click() { return this.events.click?.(); }
  querySelectorAll(tag) { return this.children.flatMap(c => [c, ...(c.querySelectorAll?.(tag) || [])]).filter(c => c.tagName === tag); }
  focus() { this.focused = true; }
  remove() { this.removed = true; }
}
function createDocument() {
  const nodes = new Map();
  return {
    defaultView: {},
    createElement: tag => new Element(tag),
    createElementNS: (_, tag) => new Element(tag),
    createTextNode: text => ({ textContent: text }),
    querySelector: selector => { if (!nodes.has(selector)) nodes.set(selector, new Element()); return nodes.get(selector); },
  };
}
function textOf(element) { return element.textContent + element.children.map(c => c.children ? textOf(c) : c.textContent).join(' '); }
function fakeLeaflet() {
  const events = {};
  const layer = { members: [], addTo() { return this; }, clearLayers() { this.members = []; } };
  const map = {
    invalidations: 0, fits: [], removed: false,
    setView() { return this; }, invalidateSize() { this.invalidations++; },
    fitBounds(points, options) { assert.ok(points.length); this.fits.push({ points, options }); },
    closePopup() { this.closed = true; }, remove() { this.removed = true; },
  };
  const tiles = { redraws: 0, on(name, handler) { events[name] = handler; return this; }, addTo() { return this; }, redraw() { this.redraws++; } };
  let creations = 0;
  const L = {
    map() { creations++; return map; }, markerClusterGroup(options) { layer.options = options; return layer; },
    tileLayer(url, options) { tiles.url = url; tiles.options = options; return tiles; },
    divIcon: options => options,
    marker(point, options) {
      const element = new Element();
      return {
        point, options, element, handlers: {},
        on(name, fn) { this.handlers[name] = fn; return this; },
        getElement() { return element; },
        bindPopup(content) { this.popup = content; return this; },
        addTo(group) { group.members.push(this); this.handlers.add?.(); return this; },
      };
    },
  };
  return { L, layer, map, tiles, events, creations: () => creations };
}
function setup(getLibrary) {
  const document = createDocument();
  const fake = fakeLeaflet();
  const notice = new Element(); const count = new Element(); const fitButton = new Element('button');
  notice.hidden = true;
  const view = createMapView({ document, container: new Element(), notice, count, fitButton, ...helpers, getLibrary: getLibrary || (() => Promise.resolve(fake.L)) });
  return { view, document, notice, count, fitButton, ...fake };
}

test('map accepts finite coordinates only and does not mistake missing values for zero', () => {
  const valid = { latitude: 39, longitude: -105 };
  const invalid = [{}, { latitude: null, longitude: 0 }, { latitude: '39', longitude: -105 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 }, { latitude: NaN, longitude: 1 }];
  assert.deepEqual(mappableHomes([valid, ...invalid]), [valid]);
  assert.equal(mappableHomes(data.homes).length, 26);
});

test('map is lazy, renders 26 correctly bound markers, and resizes/refits on return', async () => {
  const s = setup();
  s.view.update(data.homes);
  assert.equal(s.creations(), 0);
  await s.view.show(data.homes);
  assert.equal(s.layer.members.length, 26);
  assert.equal(s.layer.options.maxClusterRadius, 45);
  assert.equal(s.layer.options.spiderfyOnMaxZoom, true);
  assert.equal(s.layer.options.zoomToBoundsOnClick, true);
  assert.equal(s.layer.options.iconCreateFunction({ getChildCount: () => 7 }).html.textContent, 7);
  assert.deepEqual(s.layer.members[0].point, [data.homes[0].latitude, data.homes[0].longitude]);
  assert.equal(s.tiles.url, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.match(s.tiles.options.attribution, /OpenStreetMap/);
  assert.match(s.layer.members[0].element.getAttribute('aria-label'), /Leprechaun/);
  assert.equal(s.map.fits.length, 1);
  s.view.hide();
  await s.view.show(data.homes);
  assert.equal(s.creations(), 1);
  assert.equal(s.map.invalidations, 2);
  assert.equal(s.map.fits.length, 2, 'returning refits all homes after a viewport resize');
  const filtered = data.homes.filter(home => home.city === 'Woodland Park');
  s.view.update(filtered);
  s.view.hide();
  await s.view.show(filtered);
  assert.equal(s.map.fits.at(-1).points.length, 2, 'both filtered homes remain in bounds after returning at phone width');
  assert.equal(s.map.fits.length, 4);
});

test('filter updates replace markers and fit results; empty selection never fits invalid bounds', async () => {
  const s = setup(); await s.view.show(data.homes);
  const selected = data.homes.filter(home => home.city === 'Woodland Park');
  s.view.update(selected);
  assert.equal(s.layer.members.length, 2);
  assert.equal(s.map.fits.at(-1).points.length, 2);
  s.view.update([]);
  assert.equal(s.layer.members.length, 0);
  assert.equal(s.map.fits.length, 2);
  assert.equal(s.fitButton.disabled, true);
  assert.match(s.count.textContent, /0 homes on map/);
  s.view.update(selected);
  s.fitButton.click();
  assert.equal(s.map.fits.length, 4);
});

test('popup contains actual home details, photo and a safe Zillow destination', () => {
  const document = createDocument();
  const home = data.homes[0];
  const popup = buildPopup(document, home, helpers);
  assert.equal(popup.children[0].src, home.image);
  for (const text of ['$665,000', '4465 Leprechaun Ln', '4 bd', '3 ba', '2,576 sq ft', '5 acres lot']) assert.ok(textOf(popup).includes(text), text);
  const link = popup.querySelectorAll('a')[0];
  assert.equal(link.href, home.zillowUrl);
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
  assert.equal(buildPopup(document, { ...home, zillowUrl: 'javascript:alert(1)' }, helpers).querySelectorAll('a').length, 0);
});

test('tile failures offer retry while keeping home markers and list available', async () => {
  const s = setup(); await s.view.show(data.homes);
  s.events.loading(); s.events.tileerror(); s.events.load();
  assert.equal(s.notice.hidden, false);
  assert.equal(s.layer.members.length, 26);
  s.notice.querySelectorAll('button')[0].click();
  assert.equal(s.tiles.redraws, 1);
  s.events.loading(); s.events.load();
  assert.equal(s.notice.hidden, true);
});

test('map asset failure can be retried and never removes the collection', async () => {
  const fake = fakeLeaflet(); let attempts = 0;
  const s = setup(async () => { if (++attempts === 1) throw new Error('offline'); return fake.L; });
  await s.view.show(data.homes);
  assert.match(textOf(s.notice), /List view/);
  await s.notice.querySelectorAll('button')[0].click();
  assert.equal(fake.layer.members.length, 26);
  assert.equal(s.notice.hidden, true);
});

test('switching to list during loading does not initialize an invisible map', async () => {
  let release;
  const fake = fakeLeaflet();
  const s = setup(() => new Promise(resolve => { release = resolve; }));
  const loading = s.view.show(data.homes);
  s.view.hide(); release(fake.L); await loading;
  assert.equal(fake.creations(), 0);
  await s.view.show(data.homes);
  assert.equal(fake.creations(), 1);
});

test('page defaults to list; toggle and both views keep the same search filters', async () => {
  const html = readFileSync(new URL('../public/index.html', `file://${__filename}`), 'utf8');
  assert.match(html, /id="view-list"[^>]*aria-pressed="true"/);
  assert.match(html, /id="view-map"[^>]*aria-pressed="false"/);
  assert.match(html, /id="map-panel"[^>]*hidden/);
  const document = createDocument();
  document.querySelector('#sort').value = 'saved';
  document.querySelector('#map-panel').hidden = true;
  const calls = { shows: [], updates: [], hidden: 0 };
  await initialize(document, {
    fetch: async () => ({ ok: true, json: async () => data }),
    mapFactory: () => ({ show: homes => calls.shows.push(homes), update: homes => calls.updates.push(homes), hide: () => calls.hidden++ }),
  });
  assert.equal(calls.shows.length, 0);
  assert.equal(document.querySelector('#homes').children.length, 26);
  document.querySelector('#search').value = 'Evergreen';
  document.querySelector('#search').events.input();
  document.querySelector('#view-map').click();
  assert.equal(document.querySelector('#homes').hidden, true);
  assert.equal(document.querySelector('#map-panel').hidden, false);
  assert.equal(calls.shows[0].length, 1);
  assert.equal(calls.shows[0][0].streetAddress, '464 Evergreen Ct');
  document.querySelector('#view-list').click();
  assert.equal(document.querySelector('#homes').hidden, false);
  assert.equal(document.querySelector('#homes').children.length, 1);
  assert.equal(document.querySelector('#search').value, 'Evergreen');
  assert.equal(document.querySelector('#view-list').getAttribute('aria-pressed'), 'true');
  assert.equal(calls.hidden, 1);
});
