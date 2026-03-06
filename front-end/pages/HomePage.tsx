import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet'
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import L from 'leaflet';
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

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

interface BusinessLocation {
  location_id: string;
  latitude: number;
  longitude: number;
  original_latitude?: number | null;
  original_longitude?: number | null;
  location_privacy?: string;
  location_name: string | null;
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

interface PendingLocation {
  lat: number;
  lng: number;
}

async function snapToNearestIntersection(
  lat: number,
  lng: number
): Promise<{ lat: number; lng: number }> {
  try {
    const res = await fetch("/api/snap-to-intersection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: lat, longitude: lng }),
    });
    if (!res.ok) return { lat, lng };
    const data = await res.json();
    return { lat: data.latitude, lng: data.longitude };
  } catch {
    return { lat, lng };
  }
}

function MapBoundsTracker({
  locations,
  onCountChange,
}: {
  locations: BusinessLocation[];
  onCountChange: (count: number) => void;
}) {
  const map = useMapEvents({
    moveend() { update(); },
    zoomend() { update(); },
  });

  function update() {
    const bounds = map.getBounds();
    const count = locations.filter((loc) => {
      const showExact =
        loc.location_privacy === 'exact' &&
        loc.original_latitude != null &&
        loc.original_longitude != null;
      const lat = showExact ? loc.original_latitude! : loc.latitude;
      const lng = showExact ? loc.original_longitude! : loc.longitude;
      return bounds.contains(L.latLng(lat, lng));
    }).length;
    onCountChange(count);
  }

  useEffect(() => { update(); }, [locations]);

  return null;
}

function MapClickHandler({
  enabled,
  onSelect,
}: {
  enabled: boolean;
  onSelect: (location: PendingLocation) => void;
}) {
  useMapEvents({
    click(event) {
      if (!enabled) return;
      onSelect({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });

  return null;
}

function MapViewController({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], 17);
  }, []);
  return null;
}

function MapFlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], 14);
  }, [lat, lng]); 
  return null;
}

const DAY_OPTIONS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

const RADIUS_OPTIONS = [1, 5, 10, 25];

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string').map(s => s.trim()).filter(Boolean);
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return [];
    if (t.startsWith('[') && t.endsWith(']')) {
      try { const p = JSON.parse(t); if (Array.isArray(p)) return p.filter((v): v is string => typeof v === 'string').map(s => s.trim()).filter(Boolean); } catch {}
    }
    return t.split(/,|\||\//).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function isZipCode(value: string): boolean {
  return /^\d{5}$/.test(value.trim());
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function HomePage({
  defaultCenter = [33.978371, -118.225212],
  defaultZoom = 13,
}: {
  defaultCenter?: [number, number];
  defaultZoom?: number;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [businessDays, setBusinessDays] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddMode, setIsAddMode] = useState(searchParams.get('addMode') === '1');
  const [pendingLocation, setPendingLocation] = useState<PendingLocation | null>(null);
  const [isSnapping, setIsSnapping] = useState(false);
  const [locationOutsideUS, setLocationOutsideUS] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusMiles, setRadiusMiles] = useState(5);
  const [zipCenter, setZipCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [zipGeocoding, setZipGeocoding] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  const [businessKeywords, setBusinessKeywords] = useState<Map<string, string[]>>(new Map());
  const [businessAmenities, setBusinessAmenities] = useState<Map<string, string[]>>(new Map());

  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedAmenity, setSelectedAmenity] = useState('');

  const viewLat = searchParams.get('viewLat');
  const viewLng = searchParams.get('viewLng');
  const viewLocation = viewLat && viewLng ? { lat: Number(viewLat), lng: Number(viewLng) } : null;


  useEffect(() => {
    Promise.all([
      fetch("/api/locations"),
      fetch("/api/businesses"),
    ])
      .then(async ([locRes, bizRes]) => {
        if (!locRes.ok) throw new Error(`Server error: ${locRes.status}`);
        if (!bizRes.ok) throw new Error(`Server error: ${bizRes.status}`);
        const [locData, bizData] = await Promise.all([locRes.json(), bizRes.json()]);
        setLocations(locData);
        const daysMap = new Map<string, string[]>();
        const keywordsMap = new Map<string, string[]>();
        const amenitiesMap = new Map<string, string[]>();
        for (const biz of bizData) {
          daysMap.set(biz.id, toStringArray(biz.days_open));
          keywordsMap.set(biz.id, toStringArray(biz.keywords));
          amenitiesMap.set(biz.id, toStringArray(biz.amenities));
        }
        setBusinessDays(daysMap);
        setBusinessKeywords(keywordsMap);
        setBusinessAmenities(amenitiesMap);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load map locations:", err);
        setError(`Could not load locations: ${err.message}`);
        setLoading(false);
      });
  }, []);

  // Auto-geocode zip codes as user types
  useEffect(() => {
    const q = searchQuery.trim();
    if (!isZipCode(q)) {
      setZipCenter(null);
      setZipError(null);
      return;
    }
    let cancelled = false;
    setZipGeocoding(true);
    setZipError(null);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/location-search?q=${encodeURIComponent(q + ", USA")}`);
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
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchQuery]);

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

    return locations.filter((loc) => {
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
          const keywords = businessKeywords.get(loc.business_id) ?? [];
          const amenities = businessAmenities.get(loc.business_id) ?? [];
          const matches =
            normalize(loc.business_name).includes(query) ||
            normalize(loc.category_name).includes(query) ||
            normalize(loc.city).includes(query) ||
            normalize(loc.state).includes(query) ||
            keywords.some((k) => normalize(k).includes(query)) ||
            amenities.some((a) => normalize(a).includes(query));
          if (!matches) return false;
        }
      }

      return true;
    });
  }, [locations, businessDays, businessKeywords, businessAmenities, searchQuery, zipCenter, radiusMiles, selectedCategory, selectedDay, selectedAmenity]);

    const mapCenter: [number, number] = locations.length > 0
    ? [
        locations.reduce((sum, loc) => sum + loc.latitude, 0) / locations.length,
        locations.reduce((sum, loc) => sum + loc.longitude, 0) / locations.length,
      ]
    : defaultCenter;

    function startAddMode() {
      setIsAddMode(true);
      setPendingLocation(null);
    }

    function stopAddMode() {
      setIsAddMode(false);
      setPendingLocation(null);
      setLocationOutsideUS(false);
    }

    function handleMapPick(location: PendingLocation) {
      setLocationOutsideUS(false);
      setPendingLocation(location);
      setIsSnapping(true);
      snapToNearestIntersection(location.lat, location.lng).then((snapped) => {
        setPendingLocation(snapped);
        setIsSnapping(false);
        fetch(`/api/locations/validate-location?lat=${snapped.lat.toFixed(6)}&lng=${snapped.lng.toFixed(6)}`)
          .then((res) => res.json())
          .then((data) => { if (!data.valid) setLocationOutsideUS(true); })
          .catch(() => { /* Network error — don't block the user */ });
      });
    }

    function handleAddBusiness() {
      if (!pendingLocation) return;
      const params = new URLSearchParams({
        lat: pendingLocation.lat.toFixed(6),
        lng: pendingLocation.lng.toFixed(6),
      });
      navigate(`/add-business?${params.toString()}`);
    }

    async function handleLocationSearch(e: React.FormEvent) {
      e.preventDefault();
      const q = searchQuery.trim();
      if (!q) return;
      try {
        const res = await fetch(`/api/location-search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Search failed');
        if (!Array.isArray(data) || data.length === 0) {
          return;
        }
        setFlyTarget({ lat: data[0].latitude, lng: data[0].longitude });
      } catch (err) {
      } finally {
        setLocationSearchLoading(false);
      }
    }

    return (
      <>
        <div className="search-container">
          <form onSubmit={handleLocationSearch}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, keywords, amenities, city, state, or zip..."
            />
            <button type="submit" disabled={locationSearchLoading}>
              {locationSearchLoading ? 'Searching...' : 'Go'}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            className={`businesses-list-filter-button${showFilters ? ' active' : ''}`}
          >
            <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
              <path d="M1 2h12L8 7v4l-2 1V7L1 2z" fill="currentColor" />
            </svg>
            {(selectedCategory || selectedDay || selectedAmenity) ? ' •' : ''}
          </button>
        </div>

        {zipGeocoding && (
          <p className="businesses-list-geocoding-message">Looking up zip code...</p>
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
            {(selectedCategory || selectedDay || selectedAmenity) && (
              <button
                type="button"
                onClick={() => { setSelectedCategory(''); setSelectedDay(''); setSelectedAmenity(''); }}
                className="businesses-list-filter-button"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        <div className="map-wrapper">
        <MapContainer center={mapCenter} zoom={locations.length > 0 ? defaultZoom : defaultZoom - 1}
          scrollWheelZoom={true}>
            <MapClickHandler enabled={isAddMode} onSelect={handleMapPick} />
            <MapBoundsTracker locations={filteredLocations} onCountChange={setVisibleCount} />
            {flyTarget && <MapFlyTo lat={flyTarget.lat} lng={flyTarget.lng} />}
            {viewLocation && (
              <>
                <MapViewController key={`${viewLat}-${viewLng}`} lat={viewLocation.lat} lng={viewLocation.lng} />
              </>
            )}
            <TileLayer                
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url='https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
                subdomains = 'abcd'
            />  
                               
            {filteredLocations.map((loc) => {
              const showExact =
                loc.location_privacy === "exact" &&
                loc.original_latitude != null &&
                loc.original_longitude != null;
              const pinLat = showExact ? loc.original_latitude! : loc.latitude;
              const pinLng = showExact ? loc.original_longitude! : loc.longitude;
              const coordinates = `${loc.latitude},${loc.longitude}`;
              
              const address = `${loc.cross_street_1} & ${loc.cross_street_2}, ${loc.city}, ${loc.state} ${loc.zip_code}`;
              const businessQuery = `${loc.business_name}, ${address}`;
              
              const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(businessQuery)}`;
              
              const appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(loc.business_name)}&ll=${coordinates}&z=16`;
              
              return (
                <Marker
                key={loc.location_id}
                position={[pinLat, pinLng]}
                icon={createCustomIcon(loc.category_color, loc.category_icon)}>
                <Popup className="popup-container">
                  <div className="popup-header">
                    {loc.business_logo && (
                      <img src={loc.business_logo} alt={loc.business_name} className="popup-logo"/>
                    )}
                    <div>
                      <h3>{loc.business_name}</h3>
                      <p>{loc.location_name}</p>
                    </div>
                  </div>
                  
                  <div>
    
                  <p>
                    📍 {loc.cross_street_1} & {loc.cross_street_2}<br />
              
                  </p>
                  <Link to={`/locations/${loc.location_id}`}>View Details →</Link> <br />
                  <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">Open in Google Maps  →</a> <br />
                  <a href={appleMapsUrl} target="_blank" rel="noopener noreferrer">Open in Apple Maps  → </a>
                  
                  </div>
                </Popup>
              </Marker>
              );
            })}

            {pendingLocation && (
              <Marker position={[pendingLocation.lat, pendingLocation.lng]}>
                <Popup className="popup-container">
                  <div>
                    {locationOutsideUS ? (
                      <>
                        <strong>Outside US Boundaries</strong><br />
                        <small>VendorMap only supports businesses in the United States. Please select a different location.</small>
                      </>
                    ) : (
                      <>
                        <strong>Add Business Here?</strong><br />
                        <small>For owner's safety and privacy concerns, map pin will show the closest cross streets.</small>
                        <button type="button" onClick={handleAddBusiness}>
                          Add business here
                        </button>
                      </>
                    )}
                  </div>
                </Popup>
              </Marker>
            )}
        </MapContainer>

        </div>
        <div className="map-footer">
          {!loading && !error && locations.length > 0 && (
            <div>
              📍 {visibleCount} location{visibleCount !== 1 ? "s" : ""} in view
            </div>
          )}

          {error && (
              <div className="map-error">
                  <strong>Error:</strong> {error}
              </div>
          )}

          {!loading && !error && locations.length === 0 && (
              <div>
                  <p className="map-empty-text">
                  No locations to display yet
                  </p>
              </div>
          )}

          {!isAddMode ? (
          <>
            <button type="button" onClick={startAddMode}>
              Add a Business
            </button>
          </>
          ) : (
            <>
              <p>
                {isSnapping
                  ? "Snapping to nearest intersection..."
                  : "Click on the map to place a temporary marker."
                }
              </p>
              <button type="button" onClick={stopAddMode}>
                Exit Add a Business Mode
              </button>
            </>
          )}
        </div>
        </>
    );
}