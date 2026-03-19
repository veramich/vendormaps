import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { useSearchParams, Link } from 'react-router-dom';
import L from 'leaflet';
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { toStringArray, normalize, isZipCode, haversineMiles, configureLeafletDefaultIcon, MapsChooser, getOpenDaysFromHours, isBusinessOpenNow, API_BASE } from '../src/utils';
import { DAY_OPTIONS, RADIUS_OPTIONS } from '../src/constants';

configureLeafletDefaultIcon();

interface BusinessLocation {
  location_id: string;
  latitude: number;
  longitude: number;
  cross_street_1: string;
  cross_street_2: string;
  city: string;
  state: string;
  zip_code: number;
  phones: string[] | null;
  business_id: string;
  business_name: string;
  business_logo: string | null;
  category_name: string;
  category_icon: string;
  category_color: string;
}

interface StarDisplayProps {
  rating: number;
  size?: number;
}

function createCustomIcon(color: string, icon: string) {
  return L.divIcon({
    className: "marker-icon",
    html: `
      <div class="marker-icon-container" style="background: ${color};">
        <img src="/${icon}" class="marker-icon-image" />
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
}


function MapNavigator({ flyTarget }: { flyTarget: { lat: number; lng: number } | null }) {
  const map = useMap();

  useEffect(() => {
    if (flyTarget) {
      const currentCenter = map.getCenter();
      const dist = map.distance(
        [currentCenter.lat, currentCenter.lng],
        [flyTarget.lat, flyTarget.lng]
      );
      if (dist < 300) {
        map.setView([flyTarget.lat, flyTarget.lng], 16);
      } else {
        map.flyTo([flyTarget.lat, flyTarget.lng], 16, { duration: 1.5 });
      }
    }
  }, [flyTarget, map]);

  return null;
}

function StarDisplay({ rating, size = 16 }: StarDisplayProps) {
  return (
    <div className="star-display" style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={star <= rating ? 'star-filled' : 'star-empty'}
          style={{
            fontSize: `${size}px`,
            lineHeight: 1,
          }}
        >
          {star <= rating ? '★' : '☆'}
        </span>
      ))}
      <span style={{ marginLeft: '4px', fontSize: `${size - 2}px`, color: '#666' }}>
        ({rating}/5)
      </span>
    </div>
  );
}


export default function HomePage({
  defaultCenter = [33.978371, -118.225212],
  defaultZoom = 10,
}: {
  defaultCenter?: [number, number];
  defaultZoom?: number;
}) {
  const [searchParams] = useSearchParams();



  // Data state
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [businessDays, setBusinessDays] = useState<Map<string, string[]>>(new Map());
  const [businessDescriptions, setBusinessDescriptions] = useState<Map<string, string>>(new Map());
  const [businessAmenities, setBusinessAmenities] = useState<Map<string, string[]>>(new Map());
  const [businessRatings, setBusinessRatings] = useState<Map<string, number>>(new Map());
  const [businessHoursRaw, setBusinessHoursRaw] = useState<Map<string, unknown>>(new Map());
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  
  // Loading and error state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and filtering state
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedAmenity, setSelectedAmenity] = useState('');
  const [openNowFilter, setOpenNowFilter] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  // Map state
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusMiles, setRadiusMiles] = useState(5);
  const [zipCenter, setZipCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [zipGeocoding, setZipGeocoding] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  

  // URL params for view navigation
  const viewLat = searchParams.get('viewLat');
  const viewLng = searchParams.get('viewLng');
  const viewLocation = viewLat && viewLng ? { lat: Number(viewLat), lng: Number(viewLng) } : null;


  // Load initial data
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`${API_BASE}/api/locations`),
      fetch(`${API_BASE}/api/businesses`),
      fetch(`${API_BASE}/api/ratings`),
    ])
      .then(async ([locRes, bizRes, ratingsRes]) => {
        if (!locRes.ok) throw new Error(`Server error: ${locRes.status}`);
        if (!bizRes.ok) throw new Error(`Server error: ${bizRes.status}`);
        const [locData, bizData] = await Promise.all([locRes.json(), bizRes.json()]);
        const daysMap = new Map<string, string[]>();
        const descriptionsMap = new Map<string, string>();
        const amenitiesMap = new Map<string, string[]>();
        const ratingsMap = new Map<string, number>();
        const hoursRawMap = new Map<string, unknown>();
        for (const biz of bizData) {
          daysMap.set(biz.id, getOpenDaysFromHours(biz.business_hours));
          descriptionsMap.set(biz.id, biz.description ?? "");
          amenitiesMap.set(biz.id, toStringArray(biz.amenities));
          hoursRawMap.set(biz.id, biz.business_hours ?? null);
        }
        if (ratingsRes.ok) {
          const ratingsData = await ratingsRes.json();
          for (const rating of ratingsData) {
            ratingsMap.set(rating.business_id, rating.average_rating || 0);
          }
        }
        if (!mounted) return;
        setLocations(locData);
        setBusinessDays(daysMap);
        setBusinessDescriptions(descriptionsMap);
        setBusinessAmenities(amenitiesMap);
        setBusinessRatings(ratingsMap);
        setBusinessHoursRaw(hoursRawMap);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(`Could not load locations: ${err.message}`);
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [lastRefresh]);

  
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setLastRefresh(Date.now());
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setZipCenter(null);
      setZipError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (isZipCode(q)) {
        setZipGeocoding(true);
        setZipError(null);
        try {
          const res = await fetch(`${API_BASE}/api/location-search?q=${encodeURIComponent(q + ", USA")}`);
          const data = await res.json();
          if (cancelled) return;
          if (!res.ok || !Array.isArray(data) || data.length === 0) {
            setZipError("Zip code not found.");
            setZipCenter(null);
          } else {
            setZipCenter({ lat: data[0].latitude, lng: data[0].longitude });
            setFlyTarget({ lat: data[0].latitude, lng: data[0].longitude });
          }
        } catch {
          if (!cancelled) { setZipError("Could not look up zip code."); setZipCenter(null); }
        } finally {
          if (!cancelled) setZipGeocoding(false);
        }
      } else {
        setZipCenter(null);
        setZipError(null);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchQuery]);

  // Handle URL-based navigation to specific coordinates
  useEffect(() => {
    if (viewLat && viewLng) {
      setFlyTarget({ lat: Number(viewLat), lng: Number(viewLng) });
    }
  }, [viewLat, viewLng]);

  // Center map on user's location on first load
  useEffect(() => {
    if (viewLat && viewLng) return; // don't override URL-based navigation
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setFlyTarget(coords);
        setUserLocation(coords);
      },
      () => {} // silently ignore denial or errors
    );
  }, []);

  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    locations.forEach((loc) => { if (loc.category_name) seen.add(loc.category_name); });
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [locations]);

  const amenityOptions = useMemo(() => {
    const seen = new Set<string>();
    businessAmenities.forEach((amenities) => amenities.forEach((a) => { if (a) seen.add(a); }));
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [businessAmenities]);

  const filteredLocations = useMemo(() => {
    const query = normalize(searchQuery);
    const category = normalize(selectedCategory);
    const day = normalize(selectedDay);
    const amenity = normalize(selectedAmenity);

    const results = locations.filter((loc) => {
      if (category && normalize(loc.category_name) !== category) return false;

      if (day) {
        const days = businessDays.get(loc.business_id) ?? [];
        if (!days.some((d) => normalize(d) === day || normalize(d).startsWith(day.slice(0, 3)))) return false;
      }

      if (amenity) {
        const amenities = businessAmenities.get(loc.business_id) ?? [];
        if (!amenities.some((a) => normalize(a) === amenity)) return false;
      }

      if (query) {
        if (isZipCode(query) && zipCenter) {
          if (loc.latitude != null && loc.longitude != null) {
            const dist = haversineMiles(zipCenter.lat, zipCenter.lng, loc.latitude, loc.longitude);
            if (dist > radiusMiles) return false;
          } else {
            if (!normalize(String(loc.zip_code)).includes(query)) return false;
          }
        } else {
          const description = businessDescriptions.get(loc.business_id) ?? "";
          const amenities = businessAmenities.get(loc.business_id) ?? [];
          const queryWords = query.split(/\s+/).filter(Boolean);
          const matches = queryWords.some((word) =>
            normalize(loc.business_name).includes(word) ||
            normalize(loc.category_name).includes(word) ||
            normalize(loc.city).includes(word) ||
            normalize(loc.state).includes(word) ||
            amenities.some((a) => normalize(a).includes(word)) ||
            normalize(description).includes(word)
          );
          if (!matches) return false;
        }
      }

      if (openNowFilter && !isBusinessOpenNow(businessHoursRaw.get(loc.business_id))) return false;

      return true;
    });

    // Group by exact lat/lng and spread duplicates in a small circle (~8m radius)
    const coordCount = new Map<string, number>();
    const coordIndex = new Map<string, number>();
    for (const loc of results) {
      const key = `${loc.latitude},${loc.longitude}`;
      coordCount.set(key, (coordCount.get(key) ?? 0) + 1);
    }

    const OFFSET_RADIUS = 0.00008;
    return results.map((loc) => {
      const key = `${loc.latitude},${loc.longitude}`;
      const total = coordCount.get(key)!;
      if (total === 1) return loc;
      const idx = coordIndex.get(key) ?? 0;
      coordIndex.set(key, idx + 1);
      const angle = (2 * Math.PI * idx) / total;
      return {
        ...loc,
        latitude: Number(loc.latitude) + OFFSET_RADIUS * Math.cos(angle),
        longitude: Number(loc.longitude) + OFFSET_RADIUS * Math.sin(angle),
      };
    });
  }, [locations, businessDays, businessDescriptions, businessAmenities, businessHoursRaw, searchQuery, zipCenter, radiusMiles, selectedCategory, selectedDay, selectedAmenity, openNowFilter]);

  {/* Render logic */}
  if (loading) {
    return (
      <div>
        <div>Loading locations...</div>
        <div></div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div>Error loading map data</div>
        <div>{error}</div>
        <button onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  return (
      <>
        <div className="search-container">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, description, amenities, city, state, or zip..."
          />
          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            aria-label="Toggle filters"
          >
            <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
              <path d="M1 2h12L8 7v4l-2 1V7L1 2z" fill="currentColor" />
            </svg>
            {(selectedCategory || selectedDay || selectedAmenity || openNowFilter) ? ' •' : ''}
          </button>
        </div>

        {zipGeocoding && (
          <p className="businesses-list-geocoding-message">Looking up zip code...</p>
        )}
        {loading && locations.length > 0 && (
          <p className="businesses-list-geocoding-message">Refreshing map data...</p>
        )}
        {zipError && (
          <p className="businesses-list-error-message">{zipError}</p>
        )}
        {isZipCode(searchQuery.trim()) && zipCenter && (
          <div className="businesses-list-radius-container">
            <span>Radius:</span>
            {RADIUS_OPTIONS.map((miles) => (
              <button
                key={miles}
                type="button"
                onClick={() => setRadiusMiles(miles)}
                className={`businesses-list-radius-button ${radiusMiles === miles ? 'active' : ''}`}
              >
                {miles} mi
              </button>
            ))}
          </div>
        )}

        {showFilters && (
          <div className="businesses-list-filters-section" style={{ marginBottom: '8px' }}>
            <label className="businesses-list-filter-label">
              Category
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="businesses-list-filter-select"
              >
                <option value="">All categories</option>
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </label>
            <label className="businesses-list-filter-label">
              Days Open
              <select
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="businesses-list-filter-select"
              >
                <option value="">Any day</option>
                {DAY_OPTIONS.map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </label>
            <label className="businesses-list-filter-label">
              Amenities
              <select
                value={selectedAmenity}
                onChange={(e) => setSelectedAmenity(e.target.value)}
                className="businesses-list-filter-select"
              >
                <option value="">Any amenity</option>
                {amenityOptions.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setOpenNowFilter((prev) => !prev)}
              className={`businesses-list-filter-button ${openNowFilter ? 'active' : ''}`}
            >
              Open Now
            </button>
            {(selectedCategory || selectedDay || selectedAmenity || openNowFilter) && (
              <button
                type="button"
                onClick={() => { setSelectedCategory(''); setSelectedDay(''); setSelectedAmenity(''); setOpenNowFilter(false); }}
                className="businesses-list-filter-button"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        <div className="map-wrapper">
          <MapContainer attributionControl={false} center={viewLocation ? [viewLocation.lat, viewLocation.lng] : defaultCenter} zoom={locations.length > 0 ? defaultZoom : defaultZoom - 1}
          scrollWheelZoom={true}>
            <TileLayer
              url='https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
              subdomains = 'abcd'
            />
            <MapNavigator flyTarget={flyTarget} />
            {userLocation && (
              <Marker
                position={[userLocation.lat, userLocation.lng]}
                icon={L.divIcon({
                  className: '',
                  html: '<div style="width:14px;height:14px;background:#4285F4;border:2px solid #fff;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,0.4)"></div>',
                  iconSize: [14, 14],
                  iconAnchor: [7, 7],
                })}
                zIndexOffset={1000}
              >
                <Popup>You are here</Popup>
              </Marker>
            )}
                               
            <MarkerClusterGroup chunkedLoading disableClusteringAtZoom={14}>
            {filteredLocations.map((loc) => {
              const address = `${loc.cross_street_1} & ${loc.cross_street_2}, ${loc.city}, ${loc.state}`;
              const businessQuery = `${loc.business_name}, ${address}`;

              return (
                <Marker
                key={loc.location_id}
                position={[loc.latitude, loc.longitude]}
                icon={createCustomIcon(loc.category_color, loc.category_icon)}>
                <Popup className="popup-container">
                  <div className="popup-header">
                    {loc.business_logo && (
                      <img src={loc.business_logo} alt={loc.business_name} className="popup-logo"/>
                    )}
                    <h3 className="popup-title">{loc.business_name}</h3>
                  </div>
                  <p className="popup-address">📍 {loc.cross_street_1} & {loc.cross_street_2}</p>
                  {businessRatings.has(loc.business_id) && businessRatings.get(loc.business_id)! > 0 && (
                    <StarDisplay rating={businessRatings.get(loc.business_id)!} size={14} />
                  )}
                  <div className="popup-links">
                    <Link to={`/locations/${loc.location_id}`}>View Details →</Link>
                    <MapsChooser lat={loc.latitude} lng={loc.longitude} query={businessQuery}>
                      Open in Maps &rarr;
                    </MapsChooser>
                  </div>
                </Popup>
              </Marker>
              );
            })}
            </MarkerClusterGroup>
        </MapContainer>

        </div>
        
        <div className="map-footer">          
          <div className="map-attribution">
            &copy;<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy;<a href="https://carto.com/attributions">CARTO</a>
            Powered by 🇺🇦<a href="https://leafletjs.com/">Leaflet</a> 
          </div>
        </div>
        </>
    );
}