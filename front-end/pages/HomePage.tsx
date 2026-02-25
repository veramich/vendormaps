import { useState, useEffect, useRef } from 'react';
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
    className: "c",
    html: `
      <div style="
        width: 36px;
        height: 36px;
        background: ${color};
        border: 3px solid white;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 3px 8px rgba(0,0,0,0.25);
      ">
        <span style="
          transform: rotate(45deg);
          font-size: 16px;
        ">${icon}</span>
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

function distSq(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return (lat1 - lat2) ** 2 + (lng1 - lng2) ** 2;
}

function closestPoint(
  lat: number,
  lng: number,
  points: { lat: number; lng: number }[]
): { lat: number; lng: number } | null {
  if (points.length === 0) return null;
  let closest = points[0];
  let minDist = distSq(lat, lng, closest.lat, closest.lng);
  for (const p of points.slice(1)) {
    const d = distSq(lat, lng, p.lat, p.lng);
    if (d < minDist) {
      minDist = d;
      closest = p;
    }
  }
  return closest;
}

async function snapToNearestIntersection(
  lat: number,
  lng: number
): Promise<{ lat: number; lng: number }> {
  const query = `
    [out:json][timeout:10];
    way(around:150,${lat},${lng})[highway][highway!~"^(footway|path|cycleway|steps|pedestrian|track|service)$"];
    out geom;
  `;
  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) return { lat, lng };
    const data = await response.json();
    const ways: { geometry?: { lat: number; lon: number }[] }[] = data.elements ?? [];
    if (ways.length === 0) return { lat, lng };

    // Count how many ways each node coordinate appears in — nodes shared by 2+ ways are intersections
    const nodeCount = new Map<string, { lat: number; lng: number; count: number }>();
    for (const way of ways) {
      if (!way.geometry) continue;
      for (const node of way.geometry) {
        const key = `${node.lat},${node.lon}`;
        const existing = nodeCount.get(key);
        if (existing) {
          existing.count++;
        } else {
          nodeCount.set(key, { lat: node.lat, lng: node.lon, count: 1 });
        }
      }
    }

    const intersections = Array.from(nodeCount.values()).filter((n) => n.count >= 2);
    const candidates = intersections.length > 0 ? intersections : Array.from(nodeCount.values());
    return closestPoint(lat, lng, candidates) ?? { lat, lng };
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
  }, [lat, lng]);
  return null;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddMode, setIsAddMode] = useState(searchParams.get('addMode') === '1');
  const [pendingLocation, setPendingLocation] = useState<PendingLocation | null>(null);
  const [isSnapping, setIsSnapping] = useState(false);
  const [locationOutsideUS, setLocationOutsideUS] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const pendingMarkerRef = useRef<L.Marker | null>(null);

  const viewLat = searchParams.get('viewLat');
  const viewLng = searchParams.get('viewLng');
  const viewLocationId = searchParams.get('locationId');
  const viewLocation = viewLat && viewLng ? { lat: Number(viewLat), lng: Number(viewLng) } : null;

  useEffect(() => {
  fetch("/api/locations")
    .then((r) => {
      if (!r.ok) throw new Error(`Server error: ${r.status}`);
      return r.json();
    })
    .then((data) => {
      console.log("Loaded locations:", data);
      setLocations(data);
      setLoading(false);
    })
    .catch((err) => {
      console.error("Failed to load map locations:", err);
      setError(`Could not load locations: ${err.message}`);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!pendingLocation || !pendingMarkerRef.current) return;
    pendingMarkerRef.current.openPopup();
  }, [pendingLocation]);

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
        fetch(`/api/locations/validate-location?lat=${snapped.lat}&lng=${snapped.lng}`)
          .then(r => r.json())
          .then(data => { if (!data.valid) setLocationOutsideUS(true); })
          .catch(() => setLocationOutsideUS(true));
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

    return (
      <>
        {!isAddMode ? (
          <>
            <button type="button" onClick={startAddMode}>
              Add Business
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
                Exit Add Business Mode
              </button>
            </>
          )}

        <div className="map-wrapper">
        <MapContainer center={mapCenter} zoom={locations.length > 0 ? defaultZoom : defaultZoom - 1}
          scrollWheelZoom={true}>
            <MapClickHandler enabled={isAddMode} onSelect={handleMapPick} />
            <MapBoundsTracker locations={locations} onCountChange={setVisibleCount} />
            {viewLocation && (
              <>
                <MapViewController lat={viewLocation.lat} lng={viewLocation.lng} />
              </>
            )}
            <TileLayer                
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url='https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
                subdomains = 'abcd'
            />                     
            {locations.map((loc) => {
              const showExact =
                loc.location_privacy === "exact" &&
                loc.original_latitude != null &&
                loc.original_longitude != null;
              const pinLat = showExact ? loc.original_latitude! : loc.latitude;
              const pinLng = showExact ? loc.original_longitude! : loc.longitude;
              return (
                <Marker
                key={loc.location_id}
                position={[pinLat, pinLng]}
                icon={createCustomIcon(loc.category_color, loc.category_icon)}
                ref={viewLocationId === loc.location_id ? (marker) => {
                  if (marker && viewLocation) {
                    setTimeout(() => marker.openPopup(), 100);
                  }
                } : undefined}
                >
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
                  <Link to={`/locations/${loc.location_id}`}>View Details →</Link>
                  </div>
                </Popup>
              </Marker>
              );
            })}

            {pendingLocation && (
              <Marker
                ref={pendingMarkerRef}
                position={[pendingLocation.lat, pendingLocation.lng]}
              >
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
                  <div className="map-empty-icon">🗺️</div>
                  <p className="map-empty-text">
                  No locations to display yet
                  </p>
              </div>
          )}
        </div>
        </>
    );
}