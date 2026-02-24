const NOMINATIM_BASE = process.env.NOMINATIM_URL
const SEARCH_PATH = "/search";
const USER_AGENT = process.env.NOMINATIM_USER_AGENT 

/**
 * Check if coordinates are within US boundaries (same logic as businesses.routes).
 */
function isWithinUSBoundaries(latitude, longitude) {
  if (latitude >= 54.0 && latitude <= 71.5 && longitude >= -179.9 && longitude <= -129.0) {
    if (latitude > 70.0 && longitude < -145.0) return false;
    if (latitude < 56.0 && longitude < -160.0) return false;
    return true;
  }
  if (latitude >= 24.4 && latitude <= 49.0 && longitude >= -125.0 && longitude <= -66.9) {
    if (latitude < 25.8 && longitude > -97.0) return false;
    if (latitude < 31.0 && longitude > -106.0 && longitude < -93.0) return false;
    if (latitude < 32.5 && longitude > -117.0 && longitude < -106.0) return false;
    if (longitude > -70.0 && latitude < 42.0) return false;
    if (longitude < -123.0 && latitude > 46.0) return false;
    if (longitude < -120.0 && latitude < 34.0) return false;
    if (latitude < 26.0 && longitude > -97.0 && longitude < -80.0) return false;
    if (latitude > 41.0 && latitude < 49.0 && longitude > -93.0 && longitude < -76.0) {
      if (latitude > 45.0 && longitude > -90.0 && longitude < -84.0) return false;
      if (latitude > 44.0 && latitude < 47.0 && longitude > -88.0 && longitude < -84.0) return false;
    }
    return true;
  }
  if (latitude >= 18.9 && latitude <= 22.3 && longitude >= -160.5 && longitude <= -154.7) return true;
  if (latitude >= 17.9 && latitude <= 18.5 && longitude >= -67.3 && longitude <= -65.2) return true;
  if (latitude >= 17.6 && latitude <= 18.4 && longitude >= -65.1 && longitude <= -64.5) return true;
  return false;
}

/**
 * Geocode an intersection (cross streets + city + state) to lat/lon using Nominatim.
 * @param {string} crossStreet1
 * @param {string} crossStreet2
 * @param {string} city
 * @param {string} state
 * @returns {Promise<{ lat: number, lon: number } | null>}
 */
async function geocodeIntersection(crossStreet1, crossStreet2, city, state) {
  const parts = [crossStreet1?.trim(), crossStreet2?.trim(), city?.trim(), state?.trim()].filter(Boolean);
  if (parts.length < 4) return null;

  const query = `${parts[0]} & ${parts[1]}, ${parts[2]}, ${parts[3]}, USA`;
  const url = `${NOMINATIM_BASE}${SEARCH_PATH}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const place = data[0];
    const lat = parseFloat(place.lat);
    const lon = parseFloat(place.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    if (!isWithinUSBoundaries(lat, lon)) return null;
    return { lat, lon };
  } catch (err) {
    console.error("Geocoding error:", err.message);
    return null;
  }
}

const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const USER_AGENT_OVERPASS = process.env.NOMINATIM_USER_AGENT 

/**
 * Haversine distance in meters between two points.
 */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find the nearest intersection (node shared by 2+ highway ways) to the given point using Overpass.
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} radiusMeters - Search radius (default 300)
 * @returns {Promise<{ lat: number, lon: number, snap_distance_meters: number } | null>}
 */
async function snapToNearestIntersection(lat, lon, radiusMeters = 300) {
  const query = `[out:json][timeout:15];
node(around:${radiusMeters},${lat},${lon});
way(bn)[highway~"^(primary|secondary|tertiary|unclassified|residential|trunk|link|service|living_street)$"];
node(w);
out body;`;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT_OVERPASS },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const nodesById = new Map();
    const nodeWayCount = new Map();
    for (const el of data.elements || []) {
      if (el.type === "node" && el.lat != null && el.lon != null) {
        nodesById.set(el.id, { lat: el.lat, lon: el.lon });
      }
      if (el.type === "way" && Array.isArray(el.nodes)) {
        for (const nodeId of el.nodes) {
          nodeWayCount.set(nodeId, (nodeWayCount.get(nodeId) || 0) + 1);
        }
      }
    }
    const intersectionNodeIds = [...nodeWayCount.entries()].filter(([, count]) => count >= 2).map(([id]) => id);
    if (intersectionNodeIds.length === 0) return null;
    const withDistance = intersectionNodeIds
      .map((id) => {
        const n = nodesById.get(id);
        if (!n) return null;
        return { ...n, id, dist: haversineMeters(lat, lon, n.lat, n.lon) };
      })
      .filter(Boolean)
      .sort((a, b) => a.dist - b.dist);
    const best = withDistance[0];
    if (!best || !isWithinUSBoundaries(best.lat, best.lon)) return null;
    return { lat: best.lat, lon: best.lon, snap_distance_meters: Math.round(best.dist) };
  } catch (err) {
    console.error("Snap to intersection error:", err.message);
    return null;
  }
}

export {
  geocodeIntersection,
  isWithinUSBoundaries,
  NOMINATIM_BASE,
  snapToNearestIntersection,
};
