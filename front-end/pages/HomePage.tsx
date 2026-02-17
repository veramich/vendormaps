import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
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
  location_name: string | null;
  cross_street_1: string;
  cross_street_2: string;
  city: string;
  state: string;
  zip_code: number;
  phone: string | null;
  business_id: string;
  business_name: string;
  category_name: string;
  category_icon: string;
  category_color: string;
}


export default function HomePage({
    defaultCenter = [33.978371, -118.225212],
    defaultZoom = 13,
    onBusinessClick,
}: {
    defaultCenter?: [number, number];
    defaultZoom?: number;
    onBusinessClick?: (businessId: string) => void;
}) {
    const [locations, setLocations] = useState<BusinessLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    const mapCenter: [number, number] = locations.length > 0
    ? [
        locations.reduce((sum, loc) => sum + loc.latitude, 0) / locations.length,
        locations.reduce((sum, loc) => sum + loc.longitude, 0) / locations.length,
      ]
    : defaultCenter;

    return (
        <>
        <MapContainer center={mapCenter} zoom={locations.length > 0 ? defaultZoom : defaultZoom - 1}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}>
            <TileLayer                
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url='https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
                subdomains = 'abcd'
            />                     
            <Marker position={[33.94242805157514, -118.21347281355553]}>
                <Popup>
                    <h3>Headquarters</h3>
                </Popup>
            </Marker>
            {locations.map((loc) => (
                <Marker
                key={loc.location_id}
                position={[loc.latitude, loc.longitude]}
                icon={createCustomIcon(loc.category_color, loc.category_icon)}
                >
                <Popup>
                    <div style={{ padding: "12px 14px" }}>
                    {/* Business name */}
                    <h3>
                        {loc.business_name}
                    </h3>

                    {/* Location name if multi-location */}
                    {loc.location_name && (
                        <p>
                        {loc.location_name}
                        </p>
                    )}

                    {/* Address */}
                    <p>
                        📍 {loc.cross_street_1} & {loc.cross_street_2}<br />
                        {loc.city}, {loc.state}, {loc.zip_code}
                    </p>

                    {/* Phone */}
                    {loc.phone && (
                        <p>
                        📞 {loc.phone}
                        </p>
                    )}

                    {/* View Details button */}
                    {onBusinessClick && (
                        <button
                        onClick={() => onBusinessClick(loc.business_id)}
                        >
                        View Details →
                        </button>
                    )}
                    </div>
                </Popup>
                </Marker>
            ))}
            
        </MapContainer>
        {!loading && !error && locations.length > 0 && (
          <div>
            📍 {locations.length} location{locations.length !== 1 ? "s" : ""}
          </div>
        )}

        {/* Error state */}
        {error && (
            <div style={{ padding: "16px", background: "#fee", color: "#c33", borderRadius: "8px", margin: "16px" }}>
                <strong>Error:</strong> {error}
            </div>
        )}

        {/* Empty state */}
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