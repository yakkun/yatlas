"use strict";

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://gsi-cyberjapan.github.io/gsivectortile-mapbox-gl-js/std.json',
  center: [137.9643, 36.2308],
  zoom: 12,
});
map.addControl(new maplibregl.NavigationControl(), 'top-right');