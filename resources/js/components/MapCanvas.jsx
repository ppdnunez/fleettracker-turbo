import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, Circle, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { vehicleGlyphSvg } from '../vehicleIcons.js';
import { api } from '../api.js';

// Fix default marker icon paths broken by bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const CENTER = [14.5995, 120.9842];

// Pin color per state — 3 fixed states, so a shared gradient id per state (e.g. "pinGrad-on")
// is safe to reuse across every marker in that state without an SVG id collision, rather than
// needing a globally-unique id per marker instance.
const PIN_COLORS = {
    sel: { top: '#334155', bottom: '#0f172a', border: '#0f172a' },
    on:  { top: '#60a5fa', bottom: '#1d4ed8', border: '#1d4ed8' },
    off: { top: '#cbd5e1', bottom: '#64748b', border: '#64748b' },
};

function makeIcon(selected, online, heading, vehicleType) {
    const state = selected ? 'sel' : online ? 'on' : 'off';
    const c = PIN_COLORS[state];
    const gradId = `pinGrad-${state}`;

    // Vehicle-type emoji when set (not rotated — an emoji glyph tilting with heading reads as
    // broken rather than directional); otherwise the original fallback — arrow rotated to
    // heading, plain dot when no heading data.
    const inner = vehicleGlyphSvg(vehicleType) ?? (heading != null
        ? `<polygon points="12,7 14.5,16 12,14 9.5,16" fill="white" opacity="0.95" transform="rotate(${heading},12,12)"/>`
        : `<circle cx="12" cy="12" r="4" fill="white" opacity="0.9"/>`);

    // 3D look built from three cheap SVG tricks rather than a raster image: a top-to-bottom
    // gradient on the pin body for shaded depth, a translucent highlight ellipse for a glossy
    // sheen, and a flat ground-shadow ellipse under the tip to read as "lifted" off the map.
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="34" viewBox="0 0 24 34">
            <defs>
                <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${c.top}"/>
                    <stop offset="100%" stop-color="${c.bottom}"/>
                </linearGradient>
            </defs>
            <ellipse cx="12" cy="33" rx="5" ry="1.6" fill="#000" opacity="0.25"/>
            <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 22 12 22s12-13 12-22C24 5.37 18.63 0 12 0z"
                  fill="url(#${gradId})" stroke="${c.border}" stroke-width="1.5"/>
            <ellipse cx="8.5" cy="6.5" rx="3.6" ry="2.6" fill="#ffffff" opacity="0.22"/>
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

// `!= null` alone lets NaN through (NaN != null is true in JS) — TurboHive's live position feed
// can carry a non-finite/garbage lat or lng (unconfirmed exact cause upstream), and Leaflet throws
// "Invalid LatLng object" rather than ignoring it, which previously crashed the whole map tree.
function isValidLatLng(lat, lng) {
    if (lat == null || lng == null) return false;
    const nlat = Number(lat), nlng = Number(lng);
    return Number.isFinite(nlat) && Number.isFinite(nlng);
}

// Close enough to read street names/building outlines (~30m/100ft scale bar) — picking a device
// should zoom in on it, not just re-center at whatever zoom the map happened to be left at.
const DEVICE_SELECT_ZOOM = 18;

function FlyToSelected({ device }) {
    const map = useMap();
    useEffect(() => {
        if (isValidLatLng(device?.lat, device?.lng)) {
            map.flyTo([Number(device.lat), Number(device.lng)], DEVICE_SELECT_ZOOM, { duration: 1 });
        }
    }, [device, map]);
    return null;
}

// Leaflet caches its container's pixel size and only recomputes it on an explicit
// invalidateSize() call — it doesn't detect CSS-driven layout changes on its own. Opening the
// right-side DeviceDetailPanel (or collapsing/expanding the left device list) shrinks this map's
// flex container, and without this the map keeps rendering against the old (larger) size, which
// made flyTo's zoom look like it silently did nothing.
function InvalidateOnResize() {
    const map = useMap();
    useEffect(() => {
        const container = map.getContainer();
        const ro = new ResizeObserver(() => map.invalidateSize());
        ro.observe(container);
        return () => ro.disconnect();
    }, [map]);
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

// Same WKT subset GeofencePage.jsx draws/GeofenceMonitorService checks — CIRCLE/POLYGON only
// (no LINESTRING, since that isn't a containment shape the backend evaluates either).
function parseGeofenceArea(area) {
    if (!area) return null;
    let m = area.match(/^CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/i);
    if (m) return { type: 'circle', center: [Number(m[1]), Number(m[2])], radius: Number(m[3]) };

    m = area.match(/^POLYGON\s*\(\(([^)]+)\)\)$/i);
    if (m) return { type: 'polygon', points: m[1].split(',').map(p => p.trim().split(/\s+/).map(Number)) };

    return null;
}

// Same fallback field-name guessing as ReportPage.jsx's obdFuelLevel — TurboHive's OBD payload
// field name for fuel level isn't confirmed to be stable across device models.
function obdFuelLevel(row) {
    return row?.fuelLevel ?? row?.fuel_level ?? row?.fuelPercent ?? row?.fuel ?? null;
}

function GeofenceToggleIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
            <path d="M7.5 1 13.5 4.5 13.5 11 7.5 14 1.5 11 1.5 4.5Z" />
        </svg>
    );
}

export default function MapCanvas({ devices, selected, onSelect, selectedDevice, mqttConnected, nextRefreshIn }) {
    const [geofences, setGeofences] = useState([]);
    const [showGeofences, setShowGeofences] = useState(false);
    const [drivers, setDrivers] = useState([]);
    const [fuelByImei, setFuelByImei] = useState({}); // imei -> percent (or null once fetched-but-unavailable)

    useEffect(() => {
        api.getGeofences().then(res => setGeofences(res.data ?? [])).catch(() => setGeofences([]));
        api.getFleetDrivers().then(res => setDrivers(res.data ?? [])).catch(() => setDrivers([]));
    }, []);

    const driversByImei = {};
    drivers.forEach(d => (d.imeis || []).forEach(imei => {
        (driversByImei[imei] ||= []).push(d);
    }));

    // Fetched lazily per popup open rather than for every marker up front — OBD is a per-device
    // TurboHive call (see TurboHiveService::getObdData), too expensive to fire for the whole fleet
    // just to populate a value most popups will never be opened to see.
    const loadFuel = (imei) => {
        if (imei in fuelByImei) return;
        api.getTurboHiveObdData(imei)
            .then(res => {
                const rows = [...(res.data?.obdData ?? [])].sort((a, b) => (a.gateTime ?? 0) - (b.gateTime ?? 0));
                const latest = rows[rows.length - 1];
                setFuelByImei(f => ({ ...f, [imei]: obdFuelLevel(latest) }));
            })
            .catch(() => setFuelByImei(f => ({ ...f, [imei]: null })));
    };

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
                <InvalidateOnResize />

                {showGeofences && geofences.map(g => {
                    const shape = parseGeofenceArea(g.area);
                    if (!shape) return null;
                    const pathOptions = { color: '#3b82f6', weight: 2, fillOpacity: 0.12 };
                    return shape.type === 'circle'
                        ? <Circle key={g.id} center={shape.center} radius={shape.radius} pathOptions={pathOptions} />
                        : <Polygon key={g.id} positions={shape.points} pathOptions={pathOptions} />;
                })}

                {devices.map(d => (
                    isValidLatLng(d.lat, d.lng) && (
                        <Marker
                            key={d.id}
                            position={[Number(d.lat), Number(d.lng)]}
                            icon={makeIcon(selected === d.id, d.status === 'ONLINE', d.heading ?? null, d.vehicleType ?? null)}
                            eventHandlers={{ click: () => onSelect(d.id), popupopen: () => d.imei && loadFuel(d.imei) }}
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
                                            <tr>
                                                <td style={{ color: '#64748b', paddingRight: 8 }}>Driver</td>
                                                <td>{(driversByImei[d.imei] || []).map(dr => dr.name).join(', ') || '—'}</td>
                                            </tr>
                                            <tr>
                                                <td style={{ color: '#64748b', paddingRight: 8 }}>Fuel</td>
                                                <td>{d.imei in fuelByImei ? (fmt(fuelByImei[d.imei]) != null ? `${fmt(fuelByImei[d.imei])}%` : '—') : 'Loading…'}</td>
                                            </tr>
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

            {/* Show Geofences toggle — sits just under Leaflet's top-right zoom control */}
            <button
                onClick={() => setShowGeofences(v => !v)}
                title={showGeofences ? 'Hide geofences' : 'Show geofences'}
                style={{
                    position: 'absolute', top: 78, right: 10, zIndex: 1000,
                    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: showGeofences ? '#3b82f6' : '#fff',
                    color: showGeofences ? '#fff' : '#374151',
                    border: '2px solid rgba(0,0,0,0.2)', borderRadius: 4,
                    cursor: 'pointer', boxShadow: '0 1px 5px rgba(0,0,0,0.4)', padding: 0,
                }}
            >
                <GeofenceToggleIcon />
            </button>

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
