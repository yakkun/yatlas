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

// Add geolocation control
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: {
    enableHighAccuracy: true
  },
  trackUserLocation: true,
  showUserHeading: true,
  showAccuracyCircle: true
}), 'top-right');


// Add vertical terrain exaggeration control
class TerrainExaggerationControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl';
    this._container.style.cssText = `
      background: rgba(255, 255, 255, 0.9);
      border-radius: 4px;
      box-shadow: 0 0 10px rgba(0,0,0,0.15);
      padding: 10px;
      height: 200px;
      width: 50px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    `;
    
    const label = document.createElement('div');
    label.innerHTML = '🏔️';
    label.style.cssText = `
      font-size: 20px;
      margin-bottom: 8px;
    `;
    
    const sliderContainer = document.createElement('div');
    sliderContainer.style.cssText = `
      flex: 1;
      position: relative;
      width: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    this._slider = document.createElement('input');
    this._slider.type = 'range';
    this._slider.min = '0';
    this._slider.max = '1';
    this._slider.step = '0.05';
    this._slider.value = '0.15';
    this._slider.style.cssText = `
      width: 150px;
      transform: rotate(-90deg);
      transform-origin: center;
      position: absolute;
      cursor: pointer;
    `;
    
    this._valueLabel = document.createElement('div');
    this._valueLabel.textContent = '0.15x';
    this._valueLabel.style.cssText = `
      font-size: 11px;
      color: #666;
      margin-top: 8px;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;
    
    this._slider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this._valueLabel.textContent = `${value.toFixed(2)}x`;
      
      // Update terrain exaggeration
      this._map.setTerrain({
        source: 'gsi-terrain',
        exaggeration: value
      });
      
      // Update hillshade exaggeration proportionally
      if (this._map.getLayer('hills')) {
        this._map.setPaintProperty('hills', 'hillshade-exaggeration', value * 1.0);
      }
    });
    
    // Show value label on hover
    sliderContainer.addEventListener('mouseenter', () => {
      this._valueLabel.style.opacity = '1';
    });
    
    sliderContainer.addEventListener('mouseleave', () => {
      this._valueLabel.style.opacity = '0';
    });
    
    sliderContainer.appendChild(this._slider);
    this._container.appendChild(label);
    this._container.appendChild(sliderContainer);
    this._container.appendChild(this._valueLabel);
    
    return this._container;
  }
  
  onRemove() {
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  }
}

map.addControl(new TerrainExaggerationControl(), 'bottom-right');

// Add river/stream emphasis control
class RiverControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    
    this._button = document.createElement('button');
    this._button.type = 'button';
    this._button.title = '川・沢筋の強調表示';
    this._button.style.cssText = `
      background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2c3 3 3 6 0 10s-3 7 0 10"/><path d="M12 2c3 3 3 6 0 10s-3 7 0 10"/><path d="M16 2c3 3 3 6 0 10s-3 7 0 10"/></svg>');
      background-repeat: no-repeat;
      background-position: center;
      background-size: 16px;
    `;
    
    this._isActive = false;
    
    this._button.addEventListener('click', () => {
      this._isActive = !this._isActive;
      this.toggleRiverEmphasis();
      
      this._button.style.backgroundColor = this._isActive ? '#007cbf' : '';
      this._button.style.color = this._isActive ? 'white' : '';
    });
    
    this._container.appendChild(this._button);
    return this._container;
  }
  
  toggleRiverEmphasis() {
    if (this._isActive) {
      // Load and emphasize rivers/streams
      this.loadRivers();
    } else {
      // Remove river emphasis layers
      if (this._map.getLayer('river-lines')) {
        this._map.removeLayer('river-lines');
      }
      if (this._map.getLayer('river-lines-highlight')) {
        this._map.removeLayer('river-lines-highlight');
      }
      if (this._map.getSource('rivers')) {
        this._map.removeSource('rivers');
      }
    }
  }
  
  async loadRivers() {
    try {
      const zoom = this._map.getZoom();
      
      // Only load rivers at higher zoom levels to avoid performance issues
      if (zoom < 11) {
        console.log('Zoom level too low for river display');
        return;
      }
      
      const bounds = this._map.getBounds();
      const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
      
      // Limit the query based on zoom level
      let query;
      if (zoom >= 13) {
        // At high zoom, show both rivers and streams
        query = `
          [out:json][timeout:15];
          (
            way["waterway"="river"](${bbox});
            way["waterway"="stream"](${bbox});
          );
          out geom;
        `;
      } else {
        // At medium zoom, show only streams (typically smaller)
        query = `
          [out:json][timeout:15];
          (
            way["waterway"="stream"](${bbox});
          );
          out geom;
        `;
      }
      
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
      
      // Process river data
      const riverFeatures = [];
      
      data.elements.forEach(element => {
        if (element.type === 'way' && element.geometry && element.geometry.length > 1) {
          const waterway = element.tags?.waterway;
          const name = element.tags?.name || '';
          
          // Filter out extremely long features that might be coastlines or major rivers
          const coordinates = element.geometry.map(coord => [coord.lon, coord.lat]);
          
          // Skip if too many points (likely a major river or coastline)
          if (coordinates.length > 500) {
            return;
          }
          
          // Calculate approximate length to filter out very long features
          let totalLength = 0;
          for (let i = 1; i < coordinates.length; i++) {
            const dx = coordinates[i][0] - coordinates[i-1][0];
            const dy = coordinates[i][1] - coordinates[i-1][1];
            totalLength += Math.sqrt(dx * dx + dy * dy);
          }
          
          // Skip extremely long features (likely coastlines or major rivers)
          // 0.1 degrees is roughly 11km, so skip anything longer than ~0.5 degrees
          if (totalLength > 0.5) {
            return;
          }
          
          // Skip features that span too large an area (likely not mountain streams)
          const bounds = coordinates.reduce((bounds, coord) => {
            return {
              minLon: Math.min(bounds.minLon, coord[0]),
              maxLon: Math.max(bounds.maxLon, coord[0]),
              minLat: Math.min(bounds.minLat, coord[1]),
              maxLat: Math.max(bounds.maxLat, coord[1])
            };
          }, {
            minLon: coordinates[0][0],
            maxLon: coordinates[0][0],
            minLat: coordinates[0][1],
            maxLat: coordinates[0][1]
          });
          
          const spanLon = bounds.maxLon - bounds.minLon;
          const spanLat = bounds.maxLat - bounds.minLat;
          
          // Skip if spans too large an area (likely major rivers or coastlines)
          if (spanLon > 0.3 || spanLat > 0.3) {
            return;
          }
          
          riverFeatures.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: coordinates
            },
            properties: {
              waterway: waterway,
              name: name,
              width: waterway === 'river' ? 3 : 2
            }
          });
        }
      });
      
      // Add river source and layers
      if (this._map.getSource('rivers')) {
        this._map.removeSource('rivers');
      }
      
      this._map.addSource('rivers', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: riverFeatures
        }
      });
      
      // Add highlight layer (outer glow)
      if (!this._map.getLayer('river-lines-highlight')) {
        this._map.addLayer({
          id: 'river-lines-highlight',
          type: 'line',
          source: 'rivers',
          paint: {
            'line-color': '#0099FF',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, ['*', ['get', 'width'], 2],
              15, ['*', ['get', 'width'], 3]
            ],
            'line-opacity': 0.3,
            'line-blur': 3
          }
        });
      }
      
      // Add main river lines
      if (!this._map.getLayer('river-lines')) {
        this._map.addLayer({
          id: 'river-lines',
          type: 'line',
          source: 'rivers',
          paint: {
            'line-color': '#0066CC',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, ['get', 'width'],
              15, ['*', ['get', 'width'], 1.5]
            ],
            'line-opacity': 0.8
          }
        });
      }
      
      console.log(`Loaded ${riverFeatures.length} river/stream segments`);
      
    } catch (error) {
      console.error('Error loading rivers:', error);
    }
  }
  
  onRemove() {
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  }
}

map.addControl(new RiverControl(), 'top-right');

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
    exaggeration: 0.15 // Very smooth default terrain
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
      
      // Update river data if active
      const riverControl = document.querySelector('.maplibregl-ctrl-group button[title="川・沢筋の強調表示"]');
      if (riverControl && riverControl.style.backgroundColor) {
        // River emphasis is active, reload rivers
        const bounds = map.getBounds();
        const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
        
        // Use the loadRivers method directly
        const riverControlInstance = map._controls.find(control => control.constructor.name === 'RiverControl');
        if (riverControlInstance) {
          riverControlInstance.loadRivers();
        }
      }
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

// Cache management for persistent data
class DataCache {
  constructor() {
    this.CACHE_VERSION = '1.0';
    this.CACHE_EXPIRY_DAYS = 7; // Cache expires after 7 days
  }
  
  generateCacheKey(bounds) {
    // Create a cache key based on geographic bounds (rounded to reduce key variations)
    const south = Math.floor(bounds.getSouth() * 100) / 100;
    const west = Math.floor(bounds.getWest() * 100) / 100;
    const north = Math.ceil(bounds.getNorth() * 100) / 100;
    const east = Math.ceil(bounds.getEast() * 100) / 100;
    return `mountains_${south}_${west}_${north}_${east}_v${this.CACHE_VERSION}`;
  }
  
  getCachedData(cacheKey) {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (!cached) return null;
      
      const data = JSON.parse(cached);
      const now = Date.now();
      const expiryTime = data.timestamp + (this.CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      
      if (now > expiryTime) {
        localStorage.removeItem(cacheKey);
        return null;
      }
      
      return data.mountains;
    } catch (error) {
      console.error('Error reading cache:', error);
      return null;
    }
  }
  
  setCachedData(cacheKey, mountains) {
    try {
      const data = {
        timestamp: Date.now(),
        mountains: mountains
      };
      localStorage.setItem(cacheKey, JSON.stringify(data));
      
      // Clean up old cache entries to prevent localStorage bloat
      this.cleanupOldCache();
    } catch (error) {
      console.error('Error writing cache:', error);
      // If localStorage is full, clear old entries and try again
      if (error.name === 'QuotaExceededError') {
        this.cleanupOldCache();
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (retryError) {
          console.error('Failed to cache data even after cleanup:', retryError);
        }
      }
    }
  }
  
  cleanupOldCache() {
    try {
      const keys = Object.keys(localStorage);
      const mountainKeys = keys.filter(key => key.startsWith('mountains_'));
      const now = Date.now();
      
      mountainKeys.forEach(key => {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          const expiryTime = data.timestamp + (this.CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
          
          if (now > expiryTime) {
            localStorage.removeItem(key);
          }
        } catch (error) {
          // Remove corrupted cache entries
          localStorage.removeItem(key);
        }
      });
      
      // If we still have too many cache entries, remove the oldest ones
      const remainingKeys = Object.keys(localStorage).filter(key => key.startsWith('mountains_'));
      if (remainingKeys.length > 20) {
        const keyTimestamps = remainingKeys.map(key => {
          try {
            const data = JSON.parse(localStorage.getItem(key));
            return { key, timestamp: data.timestamp };
          } catch {
            return { key, timestamp: 0 };
          }
        }).sort((a, b) => a.timestamp - b.timestamp);
        
        // Remove oldest entries, keep newest 15
        keyTimestamps.slice(0, -15).forEach(item => {
          localStorage.removeItem(item.key);
        });
      }
    } catch (error) {
      console.error('Error during cache cleanup:', error);
    }
  }
}

const dataCache = new DataCache();

// Load hiking trails from OpenStreetMap
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
    
    // Process trails
    const trailFeatures = [];
    
    data.elements.forEach(element => {
      if (element.type === 'way' && element.geometry && element.tags?.highway && element.tags?.sac_scale) {
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
    
    console.log(`Loaded ${trailFeatures.length} trails from OpenStreetMap`);
    
  } catch (error) {
    console.error('Error loading hiking data:', error);
  }
}

// Load mountains from OpenStreetMap Overpass API
async function loadMountains() {
  try {
    const bounds = map.getBounds();
    const cacheKey = dataCache.generateCacheKey(bounds);
    
    // Check cache first
    let data = dataCache.getCachedData(cacheKey);
    
    if (!data) {
      // Cache miss - fetch from API
      console.log('Loading mountains from API...');
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
      
      const apiData = await response.json();
      data = apiData.elements;
      
      // Cache the data
      dataCache.setCachedData(cacheKey, data);
      console.log(`Cached ${data.length} mountains for future use`);
    } else {
      console.log(`Loaded ${data.length} mountains from cache`);
    }
    
    // Clear existing mountain markers
    mountainMarkers.forEach(marker => marker.remove());
    mountainMarkers = [];
    
    // Add mountain markers
    data.forEach(mountain => {
      if (mountain.lat && mountain.lon) {
        const name = mountain.tags?.name || mountain.tags?.['name:ja'];
        const elevation = mountain.tags?.ele ? parseInt(mountain.tags.ele) : null;
        
        // Only show mountains with elevation > 500m and have a name
        if (elevation && elevation > 500 && name) {
          // Create container for mountain icon and label
          const container = document.createElement('div');
          container.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;
          `;
          
          
          // Create mountain icon (green triangle)
          const icon = document.createElement('div');
          icon.style.cssText = `
            width: 0;
            height: 0;
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-bottom: 14px solid #4CAF50;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
          `;
          
          // Create label for mountains > 1500m
          if (elevation > 1500) {
            const label = document.createElement('div');
            label.textContent = name;
            label.style.cssText = `
              background-color: rgba(255, 255, 255, 0.9);
              padding: 2px 6px;
              margin-top: 4px;
              border-radius: 3px;
              font-size: 11px;
              font-weight: bold;
              color: #2E7D32;
              box-shadow: 0 1px 3px rgba(0,0,0,0.3);
              white-space: nowrap;
              max-width: 100px;
              overflow: hidden;
              text-overflow: ellipsis;
            `;
            container.appendChild(icon);
            container.appendChild(label);
          } else {
            container.appendChild(icon);
          }
          
          // Store mountain data in container
          container.dataset.mountainName = name;
          container.dataset.mountainElevation = elevation;
          
          // Create marker with container (no popup)
          const marker = new maplibregl.Marker({
            element: container,
            anchor: 'bottom'
          })
            .setLngLat([mountain.lon, mountain.lat]);
          
          mountainMarkers.push(marker);
          marker.addTo(map);
        }
      }
    });
    
    console.log(`Displaying ${data.length} mountains on map`);
    
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
        // Create container for mountain icon and label
        const container = document.createElement('div');
        container.style.cssText = `
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
        `;
        
        
        // Create mountain icon (green triangle)
        const icon = document.createElement('div');
        icon.style.cssText = `
          width: 0;
          height: 0;
          border-left: 8px solid transparent;
          border-right: 8px solid transparent;
          border-bottom: 14px solid #4CAF50;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        `;
        
        // Create label
        const label = document.createElement('div');
        label.textContent = mountain.name;
        label.style.cssText = `
          background-color: rgba(255, 255, 255, 0.9);
          padding: 2px 6px;
          margin-top: 4px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: bold;
          color: #2E7D32;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          white-space: nowrap;
        `;
        
        container.appendChild(icon);
        container.appendChild(label);
        
        // Store mountain data in container
        container.dataset.mountainName = mountain.name;
        container.dataset.mountainElevation = mountain.elevation;
        
        const marker = new maplibregl.Marker({
          element: container,
          anchor: 'bottom'
        })
          .setLngLat(mountain.coords);
        
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
  // First try GSI elevation API for accurate data
  let elevation = await getElevationFromAPI(lat, lng);
  if (elevation !== null) {
    return Math.round(elevation);
  }
  
  // Fallback to terrain elevation from map
  elevation = map.queryTerrainElevation([lng, lat]);
  
  // Validate terrain elevation (check for unrealistic values)
  if (elevation !== null && elevation !== undefined && 
      elevation > -500 && elevation < 4000) { // Japan's highest is Mt. Fuji at 3776m
    // Account for terrain exaggeration
    const exaggeration = map.getTerrain()?.exaggeration || 1;
    if (exaggeration !== 1) {
      // Adjust for exaggeration
      elevation = elevation / exaggeration;
    }
    return Math.round(elevation);
  }
  
  return null;
}

// Add click event to show elevation and weather
map.on('click', async (e) => {
  const { lng, lat } = e.lngLat;
  
  // Check if click target is a mountain marker
  let mountainInfo = null;
  let target = e.originalEvent.target;
  while (target && target !== document.body) {
    if (target.dataset && target.dataset.mountainName) {
      mountainInfo = {
        name: target.dataset.mountainName,
        elevation: target.dataset.mountainElevation
      };
      break;
    }
    target = target.parentElement;
  }
  
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
  // If clicking on a mountain peak, use the mountain elevation
  let elevation;
  if (mountainInfo && mountainInfo.elevation) {
    elevation = parseInt(mountainInfo.elevation);
  } else {
    elevation = await getElevation(lng, lat);
  }
  
  const weatherData = await getWeatherData(lat, lng);
  
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
  
  // Add mountain info if clicking on a peak
  let mountainInfoHtml = '';
  if (mountainInfo) {
    mountainInfoHtml = `
      <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
        <strong style="color: #2E7D32;">🏔️ ${mountainInfo.name}</strong><br>
        <span style="color: #666;">山頂標高: ${mountainInfo.elevation} m</span>
      </div>
    `;
  }
  
  loadingPopup.setHTML(`
    <div style="padding: 10px;">
      ${mountainInfoHtml}
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