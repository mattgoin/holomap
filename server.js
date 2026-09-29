/**
 * 🛰️ HOLOMAP - Real-Time 3D Planetary Stream Visualizer for Plex Media Server
 * =========================================================================
 * Connects directly to Plex Media Server to project live streams and recent
 * playback arcs onto an interactive 3D globe.
 *
 * Direct Plex API integration with lightweight, self-contained architecture.
 */

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();

// ==========================================
// Configuration & Environment Variables
// ==========================================
const PORT = parseInt(process.env.PORT || '3005', 10);
const PLEX_URL = (process.env.PLEX_URL || 'http://localhost:32400').replace(/\/+$/, '');
const PLEX_TOKEN = process.env.PLEX_TOKEN || '';
const HOME_LAT = parseFloat(process.env.HOME_LAT || '0.0');
const HOME_LON = parseFloat(process.env.HOME_LON || '0.0');
const HOME_NAME = process.env.HOME_NAME || 'Base Station';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '10000', 10);
const HISTORY_RETENTION_HOURS = parseInt(process.env.HISTORY_RETENTION_HOURS || '24', 10);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const GEOCACHE_FILE = path.join(DATA_DIR, 'geocache.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// In-Memory Caches
let geoCache = new Map();
let streamHistory = [];
let activeSessionsMap = new Map();

// Load persistent caches on startup
try {
  if (fs.existsSync(GEOCACHE_FILE)) {
    const raw = JSON.parse(fs.readFileSync(GEOCACHE_FILE, 'utf8'));
    geoCache = new Map(Object.entries(raw));
    console.log(`[GeoIP] Loaded ${geoCache.size} cached geolocation records.`);
  }
} catch (err) {
  console.warn('[GeoIP] Could not load geocache.json:', err.message);
}

try {
  if (fs.existsSync(HISTORY_FILE)) {
    streamHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    // Prune entries older than retention window
    const cutoff = Math.floor(Date.now() / 1000) - (HISTORY_RETENTION_HOURS * 3600);
    streamHistory = streamHistory.filter(item => item.timestamp >= cutoff);
    console.log(`[History] Loaded ${streamHistory.length} historical stream events.`);
  }
} catch (err) {
  console.warn('[History] Could not load history.json:', err.message);
}

function saveGeoCache() {
  try {
    const obj = Object.fromEntries(geoCache);
    fs.writeFileSync(GEOCACHE_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    console.error('[GeoIP] Error saving geocache.json:', err.message);
  }
}

function saveHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(streamHistory, null, 2), 'utf8');
  } catch (err) {
    console.error('[History] Error saving history.json:', err.message);
  }
}

// ==========================================
// Geolocation Resolver
// ==========================================
function isPrivateIP(ip) {
  if (!ip) return true;
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === 'localhost' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('172.16.') ||
    ip.startsWith('172.17.') ||
    ip.startsWith('172.18.') ||
    ip.startsWith('172.19.') ||
    ip.startsWith('172.20.') ||
    ip.startsWith('172.21.') ||
    ip.startsWith('172.22.') ||
    ip.startsWith('172.23.') ||
    ip.startsWith('172.24.') ||
    ip.startsWith('172.25.') ||
    ip.startsWith('172.26.') ||
    ip.startsWith('172.27.') ||
    ip.startsWith('172.28.') ||
    ip.startsWith('172.29.') ||
    ip.startsWith('172.30.') ||
    ip.startsWith('172.31.') ||
    ip.startsWith('169.254.') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd')
  );
}

async function resolveGeolocation(ip) {
  if (isPrivateIP(ip)) return null;

  if (geoCache.has(ip)) {
    return geoCache.get(ip);
  }

  try {
    const resp = await axios.get(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,regionName,city,lat,lon`,
      {
        headers: { 'User-Agent': 'Holomap-Plex-Visualizer/1.0' },
        timeout: 4000
      }
    );

    if (resp.data && resp.data.status === 'success' && resp.data.lat !== undefined) {
      const geoInfo = {
        coords: [parseFloat(resp.data.lon), parseFloat(resp.data.lat)],
        city: resp.data.city || 'Unknown City',
        region: resp.data.regionName || '',
        country: resp.data.country || ''
      };
      geoCache.set(ip, geoInfo);
      saveGeoCache();
      return geoInfo;
    }
  } catch (err) {
    console.error(`[GeoIP] Failed lookup for ${ip}:`, err.message);
  }

  return null;
}

// ==========================================
// Plex Polling Engine
// ==========================================
async function pollPlexSessions() {
  if (!PLEX_TOKEN) {
    return;
  }

  try {
    const url = `${PLEX_URL}/status/sessions`;
    const resp = await axios.get(url, {
      headers: {
        'X-Plex-Token': PLEX_TOKEN,
        'Accept': 'application/json'
      },
      timeout: 5000
    });

    const mediaContainer = resp.data?.MediaContainer || {};
    const metadata = mediaContainer.Metadata || [];
    const now = Math.floor(Date.now() / 1000);
    const currentSessionIds = new Set();

    for (const item of metadata) {
      const sessionId = item.Session?.id || item.ratingKey || `${item.title}-${now}`;
      currentSessionIds.add(sessionId);

      const user = item.User?.title || item.User?.name || 'Anonymous';
      const player = item.Player || {};
      const ip = player.remotePublicAddress || player.address;
      
      const fullTitle = item.grandparentTitle
        ? `${item.grandparentTitle} - ${item.title}`
        : item.title;

      const geo = await resolveGeolocation(ip);
      if (!geo) {
        continue;
      }

      const sessionObj = {
        id: sessionId,
        user,
        title: fullTitle,
        ip,
        coords: geo.coords,
        city: geo.city,
        region: geo.region,
        country: geo.country,
        device: player.device || player.title || 'Plex Client',
        active: true,
        timestamp: now
      };

      activeSessionsMap.set(sessionId, sessionObj);

      // Check if this stream exists in history to update or append
      const existingIdx = streamHistory.findIndex(h => h.ip === ip && h.user === user && h.title === fullTitle);
      if (existingIdx >= 0) {
        streamHistory[existingIdx].timestamp = now;
        streamHistory[existingIdx].active = true;
      } else {
        streamHistory.unshift({ ...sessionObj, active: true });
      }
    }

    // Mark sessions that ended as inactive
    for (const [id, session] of activeSessionsMap.entries()) {
      if (!currentSessionIds.has(id)) {
        session.active = false;
        activeSessionsMap.delete(id);
      }
    }

    // Prune history older than retention window
    const cutoff = now - (HISTORY_RETENTION_HOURS * 3600);
    streamHistory = streamHistory.filter(item => item.timestamp >= cutoff);

    // Sync active flags in history
    for (const h of streamHistory) {
      h.active = Array.from(activeSessionsMap.values()).some(
        a => a.ip === h.ip && a.user === h.user && a.title === h.title
      );
    }

    saveHistory();
  } catch (err) {
    console.error('[Plex] Error polling sessions:', err.message);
  }
}

// Start Background Poller
setInterval(pollPlexSessions, POLL_INTERVAL_MS);
setTimeout(pollPlexSessions, 1000);

// ==========================================
// HTTP Routes & Static Assets
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));

// Primary API for 3D Globe Visualizer
app.get('/api/map-data', (req, res) => {
  const points = [];
  const seen = new Set();

  // Active points first
  for (const s of activeSessionsMap.values()) {
    points.push({
      ip: s.ip,
      coords: s.coords,
      user: s.user,
      title: s.title,
      city: s.city,
      country: s.country,
      device: s.device,
      active: true,
      timestamp: s.timestamp
    });
    seen.add(`${s.ip}-${s.user}`);
  }

  // Then historical streams
  for (const h of streamHistory) {
    const key = `${h.ip}-${h.user}`;
    if (seen.has(key)) continue;

    points.push({
      ip: h.ip,
      coords: h.coords,
      user: h.user,
      title: h.title,
      city: h.city,
      country: h.country,
      device: h.device,
      active: false,
      timestamp: h.timestamp
    });
    seen.add(key);
  }

  res.json({
    userLocation: [HOME_LON, HOME_LAT],
    homeName: HOME_NAME,
    points
  });
});

// Telemetry & Health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Holomap',
    version: '1.0.0',
    plexUrl: PLEX_URL,
    activeStreams: activeSessionsMap.size,
    historyEvents: streamHistory.length,
    cachedLocations: geoCache.size
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================================`);
  console.log(`  🛰️ HOLOMAP - 3D Planetary Stream Visualizer    `);
  console.log(`  Plex Target : ${PLEX_URL}                     `);
  console.log(`  Origin      : [${HOME_LON}, ${HOME_LAT}] (${HOME_NAME}) `);
  console.log(`  Listening on: http://0.0.0.0:${PORT}          `);
  console.log(`=================================================`);
});
