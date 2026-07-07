import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon paths broken by bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const CENTER = [14.5995, 120.9842];

function makeIcon(selected, online, heading) {
    const bg     = selected ? '#1e293b' : online ? '#3b82f6' : '#94a3b8';
    const border = selected ? '#0f172a' : online ? '#1d4ed8' : '#64748b';

    // Arrow rotated to heading (points north = 0°), plain dot when no heading data
    const inner = heading != null
        ? `<polygon points="12,7 14.5,16 12,14 9.5,16" fill="white" opacity="0.95" transform="rotate(${heading},12,12)"/>`
        : `<circle cx="12" cy="12" r="4" fill="white" opacity="0.9"/>`;

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="34" viewBox="0 0 24 34">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 22 12 22s12-13 12-22C24 5.37 18.63 0 12 0z"
                  fill="${bg}" stroke="${border}" stroke-width="1.5"/>
            ${inner}
        </svg>`;

    return L.divIcon({
        html:        svg,
        className:   '',
        iconSize:    [24, 34],
        iconAnchor:  [12, 34],
        popupAnchor: [0, -36],
    });
}

function FlyToSelected({ device }) {
    const map = useMap();
    useEffect(() => {
        if (device?.lat != null && device?.lng != null) {
            map.flyTo([device.lat, device.lng], map.getZoom(), { duration: 1 });
        }
    }, [device, map]);
    return null;
}

function fmt(val, decimals = 0) {
    return val != null ? Number(val).toFixed(decimals) : null;
}

function fmtTime(ts) {
    if (!ts) return null;
    try {
        const d = new Date(ts);
        return isNaN(d) ? ts : d.toLocaleTimeString();
    } catch {
        return ts;
    }
}

export default function MapCanvas({ devices, selected, onSelect, selectedDevice, mqttConnected, nextRefreshIn }) {
    return (
        <div style={{ flex: 1, position: 'relative' }}>
            <MapContainer
                center={CENTER}
                zoom={13}
                style={{ width: '100%', height: '100%' }}
                scrollWheelZoom
                zoomControl={false}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <ZoomControl position="topright" />
                <FlyToSelected device={selectedDevice} />

                {devices.map(d => (
                    d.lat != null && d.lng != null && (
                        <Marker
                            key={d.id}
                            position={[d.lat, d.lng]}
                            icon={makeIcon(selected === d.id, d.status === 'ONLINE', d.heading ?? null)}
                            eventHandlers={{ click: () => onSelect(d.id) }}
                        >
                            <Popup>
                                <div style={{ minWidth: 170, fontSize: 12, lineHeight: 1.6 }}>
                                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{d.name}</div>
                                    {d.tracker && (
                                        <div style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{d.tracker}</div>
                                    )}
                                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                                        <tbody>
                                            <tr><td style={{ color: '#64748b', paddingRight: 8 }}>Lat</td><td>{d.lat.toFixed(5)}</td></tr>
                                            <tr><td style={{ color: '#64748b', paddingRight: 8 }}>Lng</td><td>{d.lng.toFixed(5)}</td></tr>
                                            {fmt(d.speed) != null && (
                                                <tr><td style={{ color: '#64748b', paddingRight: 8 }}>Speed</td><td>{fmt(d.speed)} km/h</td></tr>
                                            )}
                                            {fmt(d.heading) != null && (
                                                <tr><td style={{ color: '#64748b', paddingRight: 8 }}>Heading</td><td>{fmt(d.heading)}°</td></tr>
                                            )}
                                            {fmt(d.altitude) != null && (
                                                <tr><td style={{ color: '#64748b', paddingRight: 8 }}>Altitude</td><td>{fmt(d.altitude)} m</td></tr>
                                            )}
                                            {d.acc != null && (
                                                <tr><td style={{ color: '#64748b', paddingRight: 8 }}>ACC</td><td style={{ color: d.acc ? '#16a34a' : '#94a3b8' }}>{d.acc ? 'ON' : 'OFF'}</td></tr>
                                            )}
                                            {d.signal != null && (
                                                <tr><td style={{ color: '#64748b', paddingRight: 8 }}>Signal</td><td>{d.signal}%</td></tr>
                                            )}
                                            {fmtTime(d.lastUpdate) && (
                                                <tr><td style={{ color: '#64748b', paddingRight: 8 }}>Updated</td><td style={{ color: '#64748b' }}>{fmtTime(d.lastUpdate)}</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                    <div style={{ marginTop: 6, color: d.status === 'ONLINE' ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>
                                        ● {d.status}
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    )
                ))}
            </MapContainer>

            {/* MQTT live status badge — only shown when TurboHive provider is active */}
            {mqttConnected !== undefined && (
                <div style={{
                    position: 'absolute', bottom: 16, right: 48, zIndex: 1000,
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 20,
                    background: mqttConnected ? 'rgba(22,163,74,0.9)' : 'rgba(148,163,184,0.9)',
                    color: '#fff', fontSize: 11, fontWeight: 600,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                    pointerEvents: 'none',
                }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
                    MQTT {mqttConnected ? 'Live' : 'Connecting…'}
                </div>
            )}

            {/* Device/location list re-poll countdown — catches devices going offline, which MQTT
                alone can't express (see Dashboard.jsx's fetchLiveDevices polling effect). */}
            {nextRefreshIn !== undefined && (
                <div style={{
                    position: 'absolute', bottom: 46, right: 48, zIndex: 1000,
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 20,
                    background: 'rgba(51,65,85,0.85)',
                    color: '#fff', fontSize: 11, fontWeight: 600,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                    pointerEvents: 'none',
                }}>
                    ⟳ Refresh in {nextRefreshIn}s
                </div>
            )}
        </div>
    );
}
