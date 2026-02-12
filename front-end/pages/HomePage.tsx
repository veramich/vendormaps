import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import "leaflet/dist/leaflet.css";

function HomePage() {
    return (
        <MapContainer center={[33.978371, -118.225212]} zoom={13} scrollWheelZoom={false}>
            <TileLayer                
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url='https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
                subdomains = 'abcd'

            />
            <Marker position={[33.94242805157514, -118.21347281355553]}>
                <Popup>
                    <h3>Headquaters</h3>
                </Popup>
            </Marker>
        </MapContainer>
        
    )
}

export default HomePage;

