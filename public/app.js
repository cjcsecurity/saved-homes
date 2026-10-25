/* A dependency-free, read-only snapshot of the saved collection. */
function normalizeSearch(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function selectHomes(homes, { query = '', city = '', sort = 'saved' } = {}) {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const selected = homes.filter(home => {
    const haystack = normalizeSearch([home.address, home.streetAddress, home.city, home.state, home.zipcode].join(' '));
    return (!city || home.city === city) && terms.every(term => haystack.includes(term));
  });
  const sorting = {
    'price-asc': ['price', 1],
    'price-desc': ['price', -1],
    'lot-desc': ['lotSqft', -1],
    'sqft-desc': ['sqft', -1],
  }[sort];
  if (sorting) {
    const [field, direction] = sorting;
    selected.sort((a, b) => {
      const aValid = Number.isFinite(a[field]);
      const bValid = Number.isFinite(b[field]);
      if (!aValid || !bValid) return Number(bValid) - Number(aValid);
      return (a[field] - b[field]) * direction;
    });
  }
  return selected;
}

function formatNumber(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value) : '—';
}

function formatPrice(value, compact = false) {
  if (!Number.isFinite(value)) return 'Price unavailable';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: compact ? 1 : 0,
    ...(compact ? { notation: 'compact' } : {}),
  }).format(value);
}

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(date);
}

function listingUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['zillow.com', 'www.zillow.com'].includes(url.hostname)
      && url.pathname.startsWith('/homedetails/') ? url.href : null;
  } catch { return null; }
}

function cardLabel(home) {
  return `${home.address}. ${formatPrice(home.price)}. ${formatNumber(home.beds)} bedrooms, ${formatNumber(home.baths)} bathrooms, ${formatNumber(home.sqft)} square feet. ${home.lotLabel ? `${home.lotLabel} lot.` : 'Lot size unavailable.'} View listing on Zillow (opens in a new tab).`;
}

function initialize(document) {
  const grid = document.querySelector('#homes');
  const search = document.querySelector('#search');
  const sort = document.querySelector('#sort');
  const message = document.querySelector('#message');
  const filters = document.querySelector('#city-filters');
  const resultCount = document.querySelector('#result-count');
  let homes = [];
  let selectedCity = '';

  function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function showMessage(title, detail, actionLabel, action) {
    message.replaceChildren(el('h3', '', title), el('p', '', detail));
    if (action) {
      const button = el('button', '', actionLabel);
      button.type = 'button';
      button.addEventListener('click', action);
      message.append(button);
    }
    message.hidden = false;
  }

  function createCard(home, index) {
    const card = el('article', 'home-card');
    const link = el('a', 'card-link');
    link.href = listingUrl(home.zillowUrl);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', cardLabel(home));
    const imageWrap = el('div', 'card-image');
    const image = el('img');
    image.src = home.image;
    image.alt = `Listing photo of ${home.streetAddress || home.address}`;
    image.width = 600;
    image.height = 400;
    image.loading = index < 3 ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => {
      image.replaceWith(el('span', 'image-placeholder', 'Photo available on Zillow'));
    }, { once: true });
    imageWrap.append(image, el('span', 'status', home.status || 'Saved home'));

    const content = el('div', 'card-content');
    const location = [home.city, [home.state, home.zipcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    content.append(
      el('p', 'card-price', formatPrice(home.price)),
      el('h3', 'card-address', home.streetAddress || home.address),
      el('p', 'card-location', location),
    );
    const facts = el('div', 'home-facts');
    for (const [value, label, accessible] of [[home.beds, ' bd', ' bedrooms'], [home.baths, ' ba', ' bathrooms'], [home.sqft, ' sq ft', ' square feet']]) {
      const fact = el('span');
      fact.setAttribute('aria-label', `${formatNumber(value)}${accessible}`);
      fact.append(el('b', '', formatNumber(value)), document.createTextNode(label));
      facts.append(fact);
    }
    const bottom = el('div', 'card-bottom');
    const lot = el('span', 'lot-size');
    lot.title = `${formatNumber(home.lotSqft)} square foot lot`;
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 20 20');
    icon.setAttribute('class', 'lot-icon');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M2 14 8 3l10 4-5 11Z M5 12l3-5 6 2');
    icon.append(path);
    lot.append(icon, document.createTextNode(`${home.lotLabel || 'Lot unavailable'} lot`));
    const open = el('span', 'zillow-link', 'View on Zillow');
    const arrow = el('span', 'external-arrow', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    open.append(arrow);
    bottom.append(lot, open);
    content.append(facts, bottom);
    if (home.attribution) content.append(el('p', 'attribution', home.attribution));
    link.append(imageWrap, content);
    card.append(link);
    return card;
  }

  function resetFilters() {
    search.value = '';
    selectedCity = '';
    for (const button of filters.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.city === ''));
    render();
    search.focus();
  }

  function render() {
    const selected = selectHomes(homes, { query: search.value, city: selectedCity, sort: sort.value });
    grid.replaceChildren(...selected.map(createCard));
    grid.setAttribute('aria-busy', 'false');
    resultCount.textContent = selected.length === homes.length
      ? `${homes.length} homes in your collection`
      : `${selected.length} of ${homes.length} homes`;
    message.hidden = selected.length > 0;
    if (!selected.length) showMessage('A little too specific?', 'No saved homes match these filters. Try another address or city.', 'Clear filters', resetFilters);
  }

  function buildCityFilters() {
    const counts = new Map();
    for (const home of homes) if (home.city) counts.set(home.city, (counts.get(home.city) || 0) + 1);
    const cities = [['', homes.length], ...[...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))];
    filters.replaceChildren(...cities.map(([city, count]) => {
      const button = el('button', 'city-filter', city || 'All homes');
      button.type = 'button';
      button.dataset.city = city;
      button.setAttribute('aria-pressed', String(!city));
      button.append(el('span', 'city-count', count));
      button.addEventListener('click', () => {
        selectedCity = city;
        for (const other of filters.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === button));
        render();
      });
      return button;
    }));
    filters.hidden = false;
  }

  async function load() {
    grid.setAttribute('aria-busy', 'true');
    resultCount.textContent = 'Gathering your homes…';
    try {
      const response = await fetch('./homes.json');
      if (!response.ok) throw new Error(`Collection response: ${response.status}`);
      const data = await response.json();
      const entries = Array.isArray(data) ? data : data.homes;
      if (!Array.isArray(entries) || !entries.length || entries.some(home => !home.address || !listingUrl(home.zillowUrl))) {
        throw new Error('The collection is incomplete.');
      }
      homes = entries;
      const prices = homes.map(home => home.price).filter(Number.isFinite);
      document.querySelector('#total-count').textContent = homes.length;
      document.querySelector('#price-range').textContent = prices.length
        ? `${formatPrice(Math.min(...prices), true)}–${formatPrice(Math.max(...prices), true)}` : '—';
      document.querySelector('.collection-summary').hidden = false;
      const date = formatDate(data.updatedAt);
      document.querySelector('#snapshot-label').textContent = date ? `Saved snapshot · ${date}` : 'Saved snapshot';
      document.querySelector('#footer-date').textContent = date ? `Captured ${date}.` : '';
      search.disabled = false;
      sort.disabled = false;
      buildCityFilters();
      render();
    } catch (error) {
      grid.setAttribute('aria-busy', 'false');
      resultCount.textContent = 'Collection unavailable';
      showMessage('The collection couldn’t load', 'Check your connection and try again.', 'Try again', load);
      console.error('Unable to load saved homes:', error);
    }
  }

  search.addEventListener('input', render);
  sort.addEventListener('change', render);
  load();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeSearch, selectHomes, formatNumber, formatPrice, formatDate, listingUrl, cardLabel };
}
if (typeof document !== 'undefined') initialize(document);
