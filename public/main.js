"use strict";

// Parse URL parameters
function getMapStateFromURL() {
  const params = new URLSearchParams(window.location.search);
  const lng = parseFloat(params.get('lng')) || 137.9643;
  const lat = parseFloat(params.get('lat')) || 36.2308;
  const zoom = parseFloat(params.get('zoom')) || 12;
  const bearing = parseFloat(params.get('bearing')) || 0;
  const pitch = parseFloat(params.get('pitch')) || 45;
  
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
map.addControl(new maplibregl.TerrainControl({
  source: 'gsi-terrain',
  exaggeration: 1.3
}), 'top-right');

// Add terrain source and enable 3D terrain
map.on('load', () => {
  // Add GSI elevation tile source
  map.addSource('gsi-terrain', {
    type: 'raster-dem',
    tiles: ['https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxzoom: 15,
    encoding: 'terrarium',
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>'
  });

  // Enable 3D terrain
  map.setTerrain({
    source: 'gsi-terrain',
    exaggeration: 1.3 // Moderate exaggeration for better terrain visibility
  });

  // Add hillshade layer for smoother shading
  map.addSource('hillshade', {
    type: 'raster-dem',
    tiles: ['https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxzoom: 15,
    encoding: 'terrarium'
  });

  map.addLayer({
    id: 'hills',
    type: 'hillshade',
    source: 'hillshade',
    layout: { visibility: 'visible' },
    paint: {
      'hillshade-shadow-color': '#473B24',
      'hillshade-highlight-color': '#FAFAFF',
      'hillshade-accent-color': '#595959',
      'hillshade-exaggeration': 0.5,
      'hillshade-illumination-direction': 315,
      'hillshade-illumination-anchor': 'viewport'
    }
  });

  // Load mountains from OpenStreetMap
  loadMountains();
});

// Update URL when map is moved
map.on('moveend', updateURL);

// Update mountains when map is moved (with debounce)
let mountainUpdateTimeout;
map.on('moveend', () => {
  clearTimeout(mountainUpdateTimeout);
  mountainUpdateTimeout = setTimeout(() => {
    // Only update if zoom level is appropriate (avoid too many API calls)
    if (map.getZoom() > 8) {
      loadMountains();
    }
  }, 1000); // Wait 1 second after map stops moving
});

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

let mountainMarkers = [];

// Load mountains from OpenStreetMap Overpass API
async function loadMountains() {
  try {
    const bounds = map.getBounds();
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    
    const query = `
      [out:json][timeout:25];
      (
        node["natural"="peak"](${bbox});
      );
      out geom;
    `;
    
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `data=${encodeURIComponent(query)}`
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Clear existing mountain markers
    mountainMarkers.forEach(marker => marker.remove());
    mountainMarkers = [];
    
    // Add mountain markers
    data.elements.forEach(mountain => {
      if (mountain.lat && mountain.lon) {
        const name = mountain.tags?.name || mountain.tags?.['name:ja'];
        const elevation = mountain.tags?.ele ? parseInt(mountain.tags.ele) : null;
        
        // Only show mountains with elevation > 500m and have a name
        if (elevation && elevation > 500 && name) {
          // Create marker
          const marker = new maplibregl.Marker({
            color: '#8B4513',
            scale: 0.8
          })
            .setLngLat([mountain.lon, mountain.lat])
            .setPopup(
              new maplibregl.Popup({ offset: 25 })
                .setHTML(`
                  <div style="padding: 10px;">
                    <strong>${name}</strong><br>
                    標高: ${elevation} m
                  </div>
                `)
            );
          
          mountainMarkers.push(marker);
          marker.addTo(map);
          
          // Add mountain name label for high peaks
          if (elevation > 1500) {
            const el = document.createElement('div');
            el.className = 'mountain-label';
            el.textContent = name;
            el.style.cssText = `
              background-color: rgba(255, 255, 255, 0.9);
              padding: 2px 6px;
              border-radius: 3px;
              font-size: 11px;
              font-weight: bold;
              color: #8B4513;
              box-shadow: 0 1px 3px rgba(0,0,0,0.3);
              pointer-events: none;
              white-space: nowrap;
              max-width: 100px;
              overflow: hidden;
              text-overflow: ellipsis;
            `;

            const labelMarker = new maplibregl.Marker({
              element: el,
              anchor: 'bottom',
              offset: [0, -30]
            })
              .setLngLat([mountain.lon, mountain.lat]);
            
            mountainMarkers.push(labelMarker);
            labelMarker.addTo(map);
          }
        }
      }
    });
    
    console.log(`Loaded ${data.elements.length} mountains from OpenStreetMap`);
    
  } catch (error) {
    console.error('Error loading mountains:', error);
    
    // Fallback to static data if API fails
    const fallbackMountains = [
      { name: '富士山', elevation: 3776, coords: [138.7274, 35.3608] },
      { name: '北岳', elevation: 3193, coords: [138.2379, 35.6745] },
      { name: '穂高岳', elevation: 3190, coords: [137.6476, 36.2893] },
      { name: '槍ヶ岳', elevation: 3180, coords: [137.6474, 36.3419] }
    ];
    
    fallbackMountains.forEach(mountain => {
      const bounds = map.getBounds();
      if (bounds.contains(mountain.coords)) {
        const marker = new maplibregl.Marker({
          color: '#8B4513'
        })
          .setLngLat(mountain.coords)
          .setPopup(
            new maplibregl.Popup({ offset: 25 })
              .setHTML(`
                <div style="padding: 10px;">
                  <strong>${mountain.name}</strong><br>
                  標高: ${mountain.elevation} m
                </div>
              `)
          );
        
        mountainMarkers.push(marker);
        marker.addTo(map);
      }
    });
  }
}

// Add click event to show elevation
map.on('click', async (e) => {
  const { lng, lat } = e.lngLat;
  
  // Get elevation from terrain
  const elevation = map.queryTerrainElevation([lng, lat]);
  
  if (elevation !== null) {
    // Create popup with elevation info
    new maplibregl.Popup()
      .setLngLat([lng, lat])
      .setHTML(`
        <div style="padding: 10px;">
          <strong>標高</strong><br>
          ${Math.round(elevation)} m<br>
          <span style="font-size: 0.9em; color: #666;">
            緯度: ${lat.toFixed(5)}<br>
            経度: ${lng.toFixed(5)}
          </span>
        </div>
      `)
      .addTo(map);
  }
});