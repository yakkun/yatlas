"use strict";

// Parse URL parameters
function getMapStateFromURL() {
  const params = new URLSearchParams(window.location.search);
  const lng = parseFloat(params.get('lng')) || 137.9643;
  const lat = parseFloat(params.get('lat')) || 36.2308;
  const zoom = parseFloat(params.get('zoom')) || 12;
  const bearing = parseFloat(params.get('bearing')) || 0;
  const pitch = parseFloat(params.get('pitch')) || 0;
  
  return { lng, lat, zoom, bearing, pitch };
}

// Update URL with current map state
function updateURL() {
  const center = map.getCenter();
  const zoom = map.getZoom();
  const bearing = map.getBearing();
  const pitch = map.getPitch();
  
  const params = new URLSearchParams({
    lng: center.lng.toFixed(4),
    lat: center.lat.toFixed(4),
    zoom: zoom.toFixed(2),
    bearing: bearing.toFixed(0),
    pitch: pitch.toFixed(0)
  });
  
  const newURL = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, '', newURL);
}

// Initialize map with URL parameters or defaults
const initialState = getMapStateFromURL();

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://gsi-cyberjapan.github.io/gsivectortile-mapbox-gl-js/std.json',
  center: [initialState.lng, initialState.lat],
  zoom: initialState.zoom,
  bearing: initialState.bearing,
  pitch: initialState.pitch,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');

// Update URL when map is moved
map.on('moveend', updateURL);

// Update map when browser back/forward buttons are used
window.addEventListener('popstate', () => {
  const state = getMapStateFromURL();
  map.jumpTo({
    center: [state.lng, state.lat],
    zoom: state.zoom,
    bearing: state.bearing,
    pitch: state.pitch
  });
});