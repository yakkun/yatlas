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

// Add contour line toggle control
class ContourControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    
    this._button = document.createElement('button');
    this._button.type = 'button';
    this._button.title = '等高線の表示切り替え';
    this._button.style.cssText = `
      background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>');
      background-repeat: no-repeat;
      background-position: center;
      background-size: 16px;
    `;
    
    this._button.addEventListener('click', () => {
      const visibility = this._map.getLayoutProperty('contour-lines', 'visibility');
      const newVisibility = visibility === 'visible' ? 'none' : 'visible';
      this._map.setLayoutProperty('contour-lines', 'visibility', newVisibility);
      
      this._button.style.backgroundColor = newVisibility === 'visible' ? '#007cbf' : '';
      this._button.style.color = newVisibility === 'visible' ? 'white' : '';
    });
    
    this._container.appendChild(this._button);
    return this._container;
  }
  
  onRemove() {
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  }
}

map.addControl(new ContourControl(), 'top-right');

// Add terrain exaggeration control
class TerrainExaggerationControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    this._container.style.cssText = `
      background: white;
      border-radius: 4px;
      box-shadow: 0 0 0 2px rgba(0,0,0,0.1);
      padding: 8px;
      min-width: 200px;
    `;
    
    const label = document.createElement('div');
    label.textContent = '地形の高さ';
    label.style.cssText = `
      font-size: 12px;
      font-weight: bold;
      margin-bottom: 5px;
      color: #333;
    `;
    
    this._slider = document.createElement('input');
    this._slider.type = 'range';
    this._slider.min = '0';
    this._slider.max = '2';
    this._slider.step = '0.1';
    this._slider.value = '0.5';
    this._slider.style.cssText = `
      width: 100%;
      margin: 5px 0;
    `;
    
    this._valueLabel = document.createElement('div');
    this._valueLabel.textContent = '0.5x';
    this._valueLabel.style.cssText = `
      font-size: 11px;
      color: #666;
      text-align: center;
    `;
    
    this._slider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this._valueLabel.textContent = `${value}x`;
      
      // Update terrain exaggeration
      this._map.setTerrain({
        source: 'gsi-terrain',
        exaggeration: value
      });
      
      // Update hillshade exaggeration proportionally
      if (this._map.getLayer('hills')) {
        this._map.setPaintProperty('hills', 'hillshade-exaggeration', value * 0.6); // 0.3/0.5 = 0.6
      }
    });
    
    this._container.appendChild(label);
    this._container.appendChild(this._slider);
    this._container.appendChild(this._valueLabel);
    
    return this._container;
  }
  
  onRemove() {
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  }
}

map.addControl(new TerrainExaggerationControl(), 'top-right');

// Weather API configuration (using completely free Open-Meteo API)
const WEATHER_API_URL = 'https://api.open-meteo.com/v1';

// Create weather widget with responsive design
const weatherWidget = document.createElement('div');
weatherWidget.className = 'weather-widget';
weatherWidget.style.cssText = `
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(255, 255, 255, 0.95);
  padding: 12px;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  z-index: 1000;
  min-width: 240px;
  max-width: 300px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
`;

// Add mobile-specific styles dynamically
function applyMobileStyles() {
  if (window.innerWidth <= 768) {
    weatherWidget.style.position = 'fixed';
    weatherWidget.style.left = '10px';
    weatherWidget.style.right = '10px';
    weatherWidget.style.width = 'calc(100% - 20px)';
    weatherWidget.style.minWidth = 'auto';
    weatherWidget.style.maxWidth = 'none';
    weatherWidget.style.padding = '10px';
    weatherWidget.style.fontSize = '13px';
  }
  
  if (window.innerWidth <= 480) {
    weatherWidget.style.top = '5px';
    weatherWidget.style.left = '5px';
    weatherWidget.style.right = '5px';
    weatherWidget.style.width = 'calc(100% - 10px)';
    weatherWidget.style.padding = '8px';
    weatherWidget.style.fontSize = '12px';
  }
}

// Apply mobile styles on load and resize
applyMobileStyles();
window.addEventListener('resize', applyMobileStyles);
weatherWidget.innerHTML = `
  <div style="display: flex; align-items: center; margin-bottom: 8px;">
    <h3 style="margin: 0; color: #333; font-size: 1.1em;">天気情報</h3>
    <button id="refreshWeather" style="margin-left: auto; padding: 6px 12px; border: none; background: #007cbf; color: white; border-radius: 4px; cursor: pointer; font-size: 12px; min-height: 32px; min-width: 48px;">更新</button>
  </div>
  <div id="weatherContent">
    <div style="text-align: center; color: #666; padding: 15px;">
      読み込み中...
    </div>
  </div>
`;
document.getElementById('map').appendChild(weatherWidget);

// Get weather for current map center using Open-Meteo API (completely free, no API key required)
async function getWeatherData(lat, lon) {
  try {
    const response = await fetch(
      `${WEATHER_API_URL}/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Convert Open-Meteo data to our format
    const current = data.current;
    const weatherCode = current.weather_code;
    
    // Convert WMO weather codes to descriptions
    const weatherInfo = getWeatherFromCode(weatherCode);
    
    return {
      name: "現在地",
      main: {
        temp: Math.round(current.temperature_2m),
        feels_like: Math.round(current.apparent_temperature),
        humidity: current.relative_humidity_2m,
        pressure: Math.round(current.pressure_msl || current.surface_pressure)
      },
      weather: [{
        main: weatherInfo.main,
        description: weatherInfo.description,
        icon: weatherInfo.icon
      }],
      wind: {
        speed: Math.round(current.wind_speed_10m * 10) / 10,
        deg: current.wind_direction_10m
      },
      cloud_cover: current.cloud_cover,
      precipitation: current.precipitation || 0
    };
  } catch (error) {
    console.error('Weather API error:', error);
    return null;
  }
}

// Convert WMO weather codes to weather information
function getWeatherFromCode(code) {
  const weatherCodes = {
    0: { main: 'Clear', description: '晴れ', icon: '01d' },
    1: { main: 'Clear', description: 'ほぼ晴れ', icon: '02d' },
    2: { main: 'Clouds', description: '曇り', icon: '03d' },
    3: { main: 'Clouds', description: '曇り', icon: '04d' },
    45: { main: 'Fog', description: '霧', icon: '50d' },
    48: { main: 'Fog', description: '着氷霧', icon: '50d' },
    51: { main: 'Drizzle', description: '軽い霧雨', icon: '09d' },
    53: { main: 'Drizzle', description: '霧雨', icon: '09d' },
    55: { main: 'Drizzle', description: '強い霧雨', icon: '09d' },
    61: { main: 'Rain', description: '軽い雨', icon: '10d' },
    63: { main: 'Rain', description: '雨', icon: '10d' },
    65: { main: 'Rain', description: '強い雨', icon: '10d' },
    71: { main: 'Snow', description: '軽い雪', icon: '13d' },
    73: { main: 'Snow', description: '雪', icon: '13d' },
    75: { main: 'Snow', description: '大雪', icon: '13d' },
    95: { main: 'Thunderstorm', description: '雷雨', icon: '11d' },
    96: { main: 'Thunderstorm', description: '雹を伴う雷雨', icon: '11d' },
    99: { main: 'Thunderstorm', description: '大粒の雹を伴う雷雨', icon: '11d' }
  };
  
  return weatherCodes[code] || { main: 'Unknown', description: '不明', icon: '01d' };
}

// Get wind direction text
function getWindDirection(deg) {
  const directions = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
  return directions[Math.round(deg / 22.5) % 16];
}

// Get weather icon emoji
function getWeatherEmoji(weatherMain) {
  const emojiMap = {
    'Clear': '☀️',
    'Clouds': '☁️',
    'Rain': '🌧️',
    'Snow': '❄️',
    'Drizzle': '🌦️',
    'Thunderstorm': '⛈️',
    'Mist': '🌫️',
    'Fog': '🌫️'
  };
  return emojiMap[weatherMain] || '🌤️';
}

// Update weather display
async function updateWeather() {
  const center = map.getCenter();
  const weatherData = await getWeatherData(center.lat, center.lng);
  
  const weatherContent = document.getElementById('weatherContent');
  
  if (!weatherData) {
    weatherContent.innerHTML = `
      <div style="text-align: center; color: #f44336;">
        天気情報の取得に失敗しました
      </div>
    `;
    return;
  }
  
  const weather = weatherData.weather[0];
  const temp = weatherData.main.temp;
  const feelsLike = weatherData.main.feels_like;
  const humidity = weatherData.main.humidity;
  const windSpeed = weatherData.wind.speed;
  const windDir = getWindDirection(weatherData.wind.deg);
  const pressure = weatherData.main.pressure;
  const cloudCover = weatherData.cloud_cover || 0;
  const precipitation = weatherData.precipitation || 0;
  
  weatherContent.innerHTML = `
    <div style="display: flex; align-items: center; margin-bottom: 12px;">
      <span style="font-size: 28px; margin-right: 12px;">${getWeatherEmoji(weather.main)}</span>
      <div>
        <div style="font-size: 18px; font-weight: bold; color: #333;">${temp}°C</div>
        <div style="font-size: 12px; color: #666;">体感 ${feelsLike}°C</div>
      </div>
    </div>
    
    <div style="margin-bottom: 8px; color: #555;">
      <strong>${weather.description}</strong>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; color: #666;">
      <div>💨 風: ${windSpeed}m/s ${windDir}</div>
      <div>💧 湿度: ${humidity}%</div>
      <div>🌡️ 気圧: ${pressure}hPa</div>
      <div>☁️ 雲量: ${cloudCover}%</div>
      ${precipitation > 0 ? `<div>🌧️ 降水: ${precipitation}mm</div>` : ''}
    </div>
    
    <div style="margin-top: 10px; font-size: 11px; color: #4CAF50; text-align: center;">
      ✅ リアルタイム気象データ（Open-Meteo API）
    </div>
  `;
}

// Refresh weather when button is clicked
document.getElementById('refreshWeather').addEventListener('click', updateWeather);

// Initialize weather on map load

// Add terrain source and enable 3D terrain
map.on('load', () => {
  // Add GSI elevation tile source
  map.addSource('gsi-terrain', {
    type: 'raster-dem',
    tiles: ['https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxzoom: 15,
    encoding: 'mapbox',
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>'
  });

  // Enable 3D terrain with minimal default exaggeration
  map.setTerrain({
    source: 'gsi-terrain',
    exaggeration: 0.5 // Much smoother default terrain
  });

  // Add hillshade layer for smoother shading
  map.addSource('hillshade', {
    type: 'raster-dem',
    tiles: ['https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxzoom: 15,
    encoding: 'mapbox'
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
      'hillshade-exaggeration': 0.3,
      'hillshade-illumination-direction': 315,
      'hillshade-illumination-anchor': 'viewport'
    }
  });

  // Add contour lines from GSI
  map.addSource('contour', {
    type: 'raster',
    tiles: ['https://cyberjapandata.gsi.go.jp/xyz/contour/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxzoom: 16,
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>'
  });

  map.addLayer({
    id: 'contour-lines',
    type: 'raster',
    source: 'contour',
    paint: {
      'raster-opacity': 0.6
    }
  });

  // Load mountains and hiking data from OpenStreetMap
  loadMountains();
  loadHikingData();
  
  // Initialize weather data
  updateWeather();
});

// Update URL when map is moved
map.on('moveend', updateURL);

// Update mountains and hiking data when map is moved (with debounce)
let dataUpdateTimeout;
map.on('moveend', () => {
  clearTimeout(dataUpdateTimeout);
  dataUpdateTimeout = setTimeout(() => {
    // Only update if zoom level is appropriate (avoid too many API calls)
    if (map.getZoom() > 8) {
      loadMountains();
      loadHikingData();
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
let hutMarkers = [];
let waterMarkers = [];
let trailheadMarkers = [];
let parkingMarkers = [];

// Load hiking trails and huts from OpenStreetMap
async function loadHikingData() {
  try {
    const bounds = map.getBounds();
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    
    const query = `
      [out:json][timeout:25];
      (
        way["highway"="path"]["sac_scale"](${bbox});
        way["highway"="track"]["sac_scale"](${bbox});
        way["highway"="footway"]["sac_scale"](${bbox});
        node["tourism"="alpine_hut"](${bbox});
        node["amenity"="shelter"]["shelter_type"="basic_hut"](${bbox});
        node["tourism"="wilderness_hut"](${bbox});
        node["natural"="spring"](${bbox});
        node["amenity"="drinking_water"](${bbox});
        node["man_made"="water_well"](${bbox});
        node["highway"="trailhead"](${bbox});
        node["amenity"="parking"]["hiking"="yes"](${bbox});
        node["amenity"="parking"]["access"="permissive"](${bbox});
        way["amenity"="parking"]["hiking"="yes"](${bbox});
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
    
    // Clear existing trail data
    if (map.getSource('hiking-trails')) {
      map.removeLayer('hiking-trails');
      map.removeSource('hiking-trails');
    }
    
    // Clear existing markers
    hutMarkers.forEach(marker => marker.remove());
    hutMarkers = [];
    waterMarkers.forEach(marker => marker.remove());
    waterMarkers = [];
    trailheadMarkers.forEach(marker => marker.remove());
    trailheadMarkers = [];
    parkingMarkers.forEach(marker => marker.remove());
    parkingMarkers = [];
    
    // Process trails
    const trailFeatures = [];
    const hutNodes = [];
    const waterNodes = [];
    const trailheadNodes = [];
    const parkingNodes = [];
    const parkingWays = [];
    
    data.elements.forEach(element => {
      if (element.type === 'way' && element.geometry) {
        // Check if this is a trail or parking area
        if (element.tags?.highway && element.tags?.sac_scale) {
          // This is a trail
          const sacScale = element.tags.sac_scale || 'hiking';
          trailFeatures.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: element.geometry.map(coord => [coord.lon, coord.lat])
            },
            properties: {
              sac_scale: sacScale,
              name: element.tags?.name || ''
            }
          });
        } else if (element.tags?.amenity === 'parking') {
          // This is a parking area
          parkingWays.push(element);
        }
      } else if (element.type === 'node' && element.lat && element.lon) {
        // Check node type
        if (element.tags?.tourism === 'alpine_hut' || 
            element.tags?.tourism === 'wilderness_hut' || 
            element.tags?.amenity === 'shelter') {
          hutNodes.push(element);
        } else if (element.tags?.natural === 'spring' || 
                   element.tags?.amenity === 'drinking_water' || 
                   element.tags?.man_made === 'water_well') {
          waterNodes.push(element);
        } else if (element.tags?.highway === 'trailhead') {
          trailheadNodes.push(element);
        } else if (element.tags?.amenity === 'parking') {
          parkingNodes.push(element);
        }
      }
    });
    
    // Add trail layer
    if (trailFeatures.length > 0) {
      map.addSource('hiking-trails', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: trailFeatures
        }
      });
      
      map.addLayer({
        id: 'hiking-trails',
        type: 'line',
        source: 'hiking-trails',
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'sac_scale'], 'hiking'], '#4CAF50',
            ['==', ['get', 'sac_scale'], 'mountain_hiking'], '#FF9800',
            ['==', ['get', 'sac_scale'], 'demanding_mountain_hiking'], '#F44336',
            ['==', ['get', 'sac_scale'], 'alpine_hiking'], '#9C27B0',
            ['==', ['get', 'sac_scale'], 'demanding_alpine_hiking'], '#E91E63',
            ['==', ['get', 'sac_scale'], 'difficult_alpine_hiking'], '#000000',
            '#2196F3' // default color
          ],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 1,
            15, 3
          ],
          'line-opacity': 0.8
        }
      });
    }
    
    // Add hut markers
    hutNodes.forEach(hut => {
      const name = hut.tags?.name || '山小屋';
      const type = hut.tags?.tourism === 'alpine_hut' ? 'alpine_hut' : 
                   hut.tags?.tourism === 'wilderness_hut' ? 'wilderness_hut' : 'shelter';
      
      const marker = new maplibregl.Marker({
        color: type === 'alpine_hut' ? '#8B4513' : type === 'wilderness_hut' ? '#654321' : '#A0522D',
        scale: 0.9
      })
        .setLngLat([hut.lon, hut.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25 })
            .setHTML(`
              <div style="padding: 10px;">
                <strong>${name}</strong><br>
                <span style="color: #666;">
                  ${type === 'alpine_hut' ? '山小屋' : 
                    type === 'wilderness_hut' ? '避難小屋' : 'シェルター'}
                </span>
              </div>
            `)
        );
      
      hutMarkers.push(marker);
      marker.addTo(map);
    });
    
    // Add water source markers
    waterNodes.forEach(water => {
      const name = water.tags?.name || '';
      const type = water.tags?.natural === 'spring' ? 'spring' : 
                   water.tags?.amenity === 'drinking_water' ? 'drinking_water' : 'well';
      
      // Create custom water icon
      const waterIcon = document.createElement('div');
      waterIcon.style.cssText = `
        width: 20px;
        height: 20px;
        background-color: #2196F3;
        border: 2px solid #fff;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 12px;
        font-weight: bold;
      `;
      waterIcon.textContent = type === 'spring' ? '💧' : type === 'drinking_water' ? '🚰' : '🏗️';
      
      const marker = new maplibregl.Marker({
        element: waterIcon
      })
        .setLngLat([water.lon, water.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25 })
            .setHTML(`
              <div style="padding: 10px;">
                <strong>${name || '水場'}</strong><br>
                <span style="color: #666;">
                  ${type === 'spring' ? '湧き水' : 
                    type === 'drinking_water' ? '給水設備' : '井戸'}
                </span>
              </div>
            `)
        );
      
      waterMarkers.push(marker);
      marker.addTo(map);
    });
    
    // Add trailhead markers
    trailheadNodes.forEach(trailhead => {
      const name = trailhead.tags?.name || '登山口';
      
      // Create custom trailhead icon
      const trailheadIcon = document.createElement('div');
      trailheadIcon.style.cssText = `
        width: 24px;
        height: 24px;
        background-color: #4CAF50;
        border: 2px solid #fff;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 14px;
        font-weight: bold;
      `;
      trailheadIcon.textContent = '🚶';
      
      const marker = new maplibregl.Marker({
        element: trailheadIcon
      })
        .setLngLat([trailhead.lon, trailhead.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25 })
            .setHTML(`
              <div style="padding: 10px;">
                <strong>${name}</strong><br>
                <span style="color: #666;">登山口</span>
              </div>
            `)
        );
      
      trailheadMarkers.push(marker);
      marker.addTo(map);
    });
    
    // Add parking markers (both nodes and ways)
    [...parkingNodes, ...parkingWays].forEach(parking => {
      const name = parking.tags?.name || '駐車場';
      const capacity = parking.tags?.capacity || '';
      const fee = parking.tags?.fee || '';
      const access = parking.tags?.access || '';
      
      // Calculate center point for parking areas (ways)
      let lon, lat;
      if (parking.type === 'way' && parking.geometry) {
        // Calculate centroid of parking area
        const coords = parking.geometry;
        lon = coords.reduce((sum, coord) => sum + coord.lon, 0) / coords.length;
        lat = coords.reduce((sum, coord) => sum + coord.lat, 0) / coords.length;
      } else {
        lon = parking.lon;
        lat = parking.lat;
      }
      
      // Create custom parking icon
      const parkingIcon = document.createElement('div');
      parkingIcon.style.cssText = `
        width: 24px;
        height: 24px;
        background-color: #2196F3;
        border: 2px solid #fff;
        border-radius: 4px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 12px;
        font-weight: bold;
      `;
      parkingIcon.textContent = 'P';
      
      const marker = new maplibregl.Marker({
        element: parkingIcon
      })
        .setLngLat([lon, lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25 })
            .setHTML(`
              <div style="padding: 10px;">
                <strong>${name}</strong><br>
                <span style="color: #666;">駐車場</span>
                ${capacity ? `<br>収容台数: ${capacity}台` : ''}
                ${fee ? `<br>料金: ${fee === 'yes' ? '有料' : fee === 'no' ? '無料' : fee}` : ''}
                ${access ? `<br>アクセス: ${access === 'permissive' ? '一般開放' : access}` : ''}
              </div>
            `)
        );
      
      parkingMarkers.push(marker);
      marker.addTo(map);
    });
    
    console.log(`Loaded ${trailFeatures.length} trails, ${hutNodes.length} huts, ${waterNodes.length} water sources, ${trailheadNodes.length} trailheads, and ${parkingNodes.length + parkingWays.length} parking areas from OpenStreetMap`);
    
  } catch (error) {
    console.error('Error loading hiking data:', error);
  }
}

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

// Get elevation from GSI elevation API
async function getElevationFromAPI(lat, lng) {
  try {
    const response = await fetch(
      `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=${lng}&lat=${lat}&outtype=JSON`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Check if elevation data is valid
    if (data.elevation && data.elevation !== 'e' && !isNaN(parseFloat(data.elevation))) {
      return parseFloat(data.elevation);
    }
    
    return null;
  } catch (error) {
    console.error('Elevation API error:', error);
    return null;
  }
}

// Get elevation with fallback methods
async function getElevation(lng, lat) {
  // First try terrain elevation from map
  let elevation = map.queryTerrainElevation([lng, lat]);
  
  // Validate terrain elevation (check for unrealistic values)
  if (elevation !== null && elevation !== undefined && 
      elevation > -500 && elevation < 10000) {
    return Math.round(elevation);
  }
  
  // Fallback to GSI elevation API
  elevation = await getElevationFromAPI(lat, lng);
  if (elevation !== null) {
    return Math.round(elevation);
  }
  
  return null;
}

// Add click event to show elevation and weather
map.on('click', async (e) => {
  const { lng, lat } = e.lngLat;
  
  // Show loading popup first
  const loadingPopup = new maplibregl.Popup()
    .setLngLat([lng, lat])
    .setHTML(`
      <div style="padding: 10px; text-align: center;">
        <div>標高データを取得中...</div>
        <div style="margin-top: 5px; font-size: 0.9em; color: #666;">
          緯度: ${lat.toFixed(5)}<br>
          経度: ${lng.toFixed(5)}
        </div>
      </div>
    `)
    .addTo(map);
  
  // Get elevation and weather data
  const [elevation, weatherData] = await Promise.all([
    getElevation(lng, lat),
    getWeatherData(lat, lng)
  ]);
  
  let weatherInfo = '';
  if (weatherData) {
    const weather = weatherData.weather[0];
    const temp = weatherData.main.temp;
    const windSpeed = weatherData.wind.speed;
    const windDir = getWindDirection(weatherData.wind.deg);
    
    weatherInfo = `
      <hr style="margin: 10px 0; border: none; border-top: 1px solid #eee;">
      <strong>天気情報</strong><br>
      ${getWeatherEmoji(weather.main)} ${weather.description}<br>
      気温: ${temp}°C<br>
      風: ${windSpeed}m/s ${windDir}<br>
      <span style="font-size: 0.8em; color: #4CAF50;">✅ リアルタイムデータ</span>
    `;
  }
  
  // Update popup with elevation and weather info
  let elevationText = '';
  if (elevation !== null) {
    elevationText = `${elevation} m`;
  } else {
    elevationText = '取得できませんでした';
  }
  
  loadingPopup.setHTML(`
    <div style="padding: 10px;">
      <strong>標高</strong><br>
      ${elevationText}<br>
      <span style="font-size: 0.9em; color: #666;">
        緯度: ${lat.toFixed(5)}<br>
        経度: ${lng.toFixed(5)}
      </span>
      ${weatherInfo}
    </div>
  `);
});