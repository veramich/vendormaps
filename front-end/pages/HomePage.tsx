import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { useEffect, useState } from 'react';
import "leaflet/dist/leaflet.css";

interface Vendor {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
}

function HomePage() {
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchVendors = async () => {
            try {
                const response = await fetch('http://localhost:8000/api/vendors');
                const data = await response.json();
                setVendors(data);
            } catch (error) {
                console.error('Failed to fetch vendors:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchVendors();
    }, []);

    if (loading) {
        return <div>Loading map...</div>;
    }

    return (
        <MapContainer center={[33.978371, -118.225212]} zoom={13} scrollWheelZoom={false}>
            <TileLayer                
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url='https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
                subdomains = 'abcd'
            />
            {vendors.map((vendor) => (
                <Marker key={vendor.id} position={[vendor.latitude, vendor.longitude]}>
                    <Popup>
                        <div>
                            <h3>{vendor.name}</h3>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </MapContainer>
        
    )
}

export default HomePage;

