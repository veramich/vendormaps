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
  category_name: string;
  category_icon: string;
  category_color: string;
}

interface PendingLocation {
  lat: number;
  lng: number;
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
  const pendingMarkerRef = useRef<L.Marker | null>(null);

  const viewLat = searchParams.get('viewLat');
  const viewLng = searchParams.get('viewLng');
  const viewLocation = viewLat && viewLng ? { lat: Number(viewLat), lng: Number(viewLng) } : null;
  const isSelectMode = searchParams.get('addMode') === '1';

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
    }

    function handleMapPick(location: PendingLocation) {
      setPendingLocation(location);
    }

    function handleConfirmAddBusiness() {
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
                {isSelectMode
                  ? "Click on the map to confirm a location, then return to the form."
                  : "Click on the map to place a temporary marker."
                }
              </p>
              <button type="button" onClick={isSelectMode ? () => navigate('/add-business') : stopAddMode}>
                {isSelectMode ? "Cancel — return to form" : "Exit add mode"}
              </button>
            </>
          )}

        <div style={{ height: "72vh", width: "100%" }}>
        <MapContainer center={mapCenter} zoom={locations.length > 0 ? defaultZoom : defaultZoom - 1}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}>
            <MapClickHandler enabled={isAddMode} onSelect={handleMapPick} />
            {viewLocation && (
              <>
                <MapViewController lat={viewLocation.lat} lng={viewLocation.lng} />
                <Marker position={[viewLocation.lat, viewLocation.lng]}>
                  <Popup>
                    <div style={{ minWidth: "210px" }}>
                      <h3 style={{ marginBottom: "8px" }}>Confirm this location?</h3>
                      <p style={{ marginBottom: "8px", fontSize: "14px" }}>
                        Lat: {viewLocation.lat.toFixed(6)}<br />
                        Lng: {viewLocation.lng.toFixed(6)}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const params = new URLSearchParams({
                            lat: viewLocation.lat.toFixed(6),
                            lng: viewLocation.lng.toFixed(6),
                          });
                          navigate(`/add-business?${params.toString()}`);
                        }}
                      >
                        Confirm location
                      </button>
                    </div>
                  </Popup>
                </Marker>
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
                >
                <Popup>
                    <div style={{ padding: "12px 14px" }}>
                    <h3>{loc.business_name}</h3>
                    <p>{loc.location_name}</p>
                    <p>
                      📍 {loc.cross_street_1} & {loc.cross_street_2}<br />
                      {loc.city}, {loc.state}, {loc.zip_code}
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
                <Popup>
                  <div style={{ minWidth: "210px" }}>
                    <h3 style={{ marginBottom: "8px" }}>
                      {isSelectMode ? "Confirm this location?" : "Add business here?"}
                    </h3>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <button type="button" onClick={handleConfirmAddBusiness}>
                        {isSelectMode ? "Confirm location" : "Add business here"}
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}
            
        </MapContainer>

        </div>
        {!loading && !error && locations.length > 0 && (
          <div>
            📍 {locations.length} location{locations.length !== 1 ? "s" : ""}
          </div>
        )}

        {error && (
            <div style={{ padding: "16px", background: "#fee", color: "#c33", borderRadius: "8px", margin: "16px" }}>
                <strong>Error:</strong> {error}
            </div>
        )}

        {!loading && !error && locations.length === 0 && (
            <div>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🗺️</div>
                <p style={{ margin: 0, fontSize: 14, color: "#64748b" }}>
                No locations to display yet
                </p>
            </div>
        )}
        </>
    );
}