/* Local Leaflet assets; OpenStreetMap tiles load only in Map view. */
(function (root) {
  'use strict';
  let libraryPromise;

  function mappableHomes(homes) {
    return homes.filter(home => Number.isFinite(home.latitude) && Number.isFinite(home.longitude)
      && Math.abs(home.latitude) <= 90 && Math.abs(home.longitude) <= 180);
  }

  function loadLeaflet(document) {
    if (libraryPromise) return libraryPromise;
    const assets = [];
    function resource(tag, url) {
      return new Promise((resolve, reject) => {
        const element = document.createElement(tag);
        if (tag === 'link') { element.rel = 'stylesheet'; element.href = url; }
        else element.src = url;
        assets.push(element);
        const timeout = setTimeout(() => reject(new Error('Map asset timed out.')), 15000);
        element.onload = () => { clearTimeout(timeout); resolve(); };
        element.onerror = () => { clearTimeout(timeout); reject(new Error('Map asset could not load.')); };
        document.head.append(element);
      });
    }
    libraryPromise = Promise.all([
      resource('link', './vendor/leaflet/leaflet.css'),
      resource('link', './vendor/leaflet-markercluster/MarkerCluster.css'),
      resource('script', './vendor/leaflet/leaflet.js'),
    ]).then(() => resource('script', './vendor/leaflet-markercluster/leaflet.markercluster.js'))
      .then(() => {
        const L = document.defaultView.L;
        if (!L?.markerClusterGroup) throw new Error('Map library unavailable.');
        return L;
      }).catch(error => {
        assets.forEach(element => element.remove());
        libraryPromise = undefined;
        throw error;
      });
    return libraryPromise;
  }

  function buildPopup(document, home, { formatPrice, formatNumber, listingUrl }) {
    const popup = document.createElement('article');
    popup.className = 'map-popup';
    function text(tag, className, value) {
      const element = document.createElement(tag);
      element.className = className;
      element.textContent = value;
      popup.append(element);
      return element;
    }
    const image = document.createElement('img');
    image.src = home.image;
    image.alt = `Listing photo of ${home.streetAddress || home.address}`;
    image.width = 240;
    image.height = 140;
    image.addEventListener('error', () => { image.hidden = true; }, { once: true });
    popup.append(image);
    text('p', 'map-popup-price', formatPrice(home.price));
    text('h3', 'map-popup-address', home.streetAddress || home.address);
    text('p', 'map-popup-city', [home.city, home.state, home.zipcode].filter(Boolean).join(' '));
    text('p', 'map-popup-facts', `${formatNumber(home.beds)} bd · ${formatNumber(home.baths)} ba · ${formatNumber(home.sqft)} sq ft`);
    text('p', 'map-popup-lot', `${home.lotLabel || 'Lot size unavailable'}${home.lotLabel ? ' lot' : ''}`);
    const url = listingUrl(home.zillowUrl);
    if (url) {
      const link = text('a', 'map-popup-link', 'View on Zillow ↗');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `View ${home.streetAddress || home.address} on Zillow (opens in a new tab)`);
    }
    return popup;
  }

  function createMapView({ document, container, notice, count, fitButton, formatPrice, formatNumber, listingUrl, getLibrary = () => loadLeaflet(document) }) {
    let map, markers, tiles, L, loading;
    let visible = false;
    let selected = [];
    let selectionKey = null;
    let failures = 0;

    function showNotice(text, retry) {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      notice.replaceChildren(paragraph);
      if (retry) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Try again';
        button.addEventListener('click', retry);
        notice.append(button);
      }
      notice.hidden = false;
    }

    function fit() {
      const homes = mappableHomes(selected);
      if (map && homes.length) {
        map.fitBounds(homes.map(home => [home.latitude, home.longitude]), { padding: [46, 46], maxZoom: 14, animate: false });
      }
    }

    function render() {
      if (!visible || !map) return;
      map.invalidateSize({ pan: false, animate: false });
      const homes = mappableHomes(selected);
      const key = homes.map(home => home.id).sort().join(',');
      const missing = selected.length - homes.length;
      count.textContent = `${homes.length} ${homes.length === 1 ? 'home' : 'homes'} on map${missing ? ` · ${missing} without a location` : ''} · Select a price or group to explore.`;
      fitButton.disabled = !homes.length;
      if (selectionKey === key) return;
      selectionKey = key;
      markers.clearLayers();
      for (const home of homes) {
        const price = document.createElement('span');
        price.className = 'map-price-label';
        price.textContent = formatPrice(home.price, true);
        const title = `${home.streetAddress || home.address} — ${formatPrice(home.price)}`;
        const marker = L.marker([home.latitude, home.longitude], {
          icon: L.divIcon({ className: 'home-price-marker', html: price, iconSize: [66, 30], iconAnchor: [33, 15] }),
          title, keyboard: true, riseOnHover: true,
        });
        marker.on('add', () => marker.getElement()?.setAttribute('aria-label', title));
        marker.bindPopup(buildPopup(document, home, { formatPrice, formatNumber, listingUrl }), {
          className: 'home-map-popup', maxWidth: 240, minWidth: 200, autoPanPadding: [20, 20],
        });
        marker.addTo(markers);
      }
      if (homes.length) fit();
      else map.closePopup();
    }

    async function show(homes) {
      selected = homes;
      visible = true;
      if (map) { render(); fit(); return; }
      showNotice('Opening the map…');
      try {
        loading ||= getLibrary();
        L = await loading;
        if (!visible) return;
        if (!map) {
          map = L.map(container, { scrollWheelZoom: false, attributionControl: true, maxZoom: 19 }).setView([39.05, -104.85], 10);
          markers = L.markerClusterGroup({
            maxClusterRadius: 45, showCoverageOnHover: false,
            spiderfyOnMaxZoom: true, zoomToBoundsOnClick: true,
            spiderfyDistanceMultiplier: 1.6, animate: false,
            iconCreateFunction(cluster) {
              const label = document.createElement('span');
              label.textContent = cluster.getChildCount();
              label.setAttribute('aria-label', `${cluster.getChildCount()} homes. Select to explore this group.`);
              return L.divIcon({ html: label, className: 'home-cluster', iconSize: [44, 44], iconAnchor: [22, 22] });
            },
          }).addTo(map);
          tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          });
          tiles.on('loading', () => { failures = 0; });
          tiles.on('tileerror', () => {
            failures++;
            showNotice('Some map tiles couldn’t load. Your home markers are still available.', () => tiles.redraw());
          });
          tiles.on('load', () => { if (!failures) notice.hidden = true; });
          tiles.addTo(map);
        }
        notice.hidden = true;
        render();
      } catch (error) {
        loading = undefined;
        if (map) map.remove();
        map = markers = tiles = undefined;
        selectionKey = null;
        showNotice('The map couldn’t load. You can still browse every home in List view.', () => show(selected));
      }
    }

    fitButton.addEventListener('click', fit);
    return {
      show,
      hide() { visible = false; },
      update(homes) { selected = homes; if (visible) render(); },
    };
  }

  const api = { mappableHomes, loadLeaflet, buildPopup, createMapView };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HomeMap = api;
})(typeof window !== 'undefined' ? window : globalThis);
