import { useEffect, useState } from 'react';
import { api } from '../api.js';

function fmtDateTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d)) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// "2 day+" once it's been offline/unheard-from for a day or more, otherwise a coarse "Nh"/"Nm" —
// matches TurboHive's own status-card wording, which only needs to be roughly right at a glance.
function formatElapsed(ts) {
    if (!ts) return '—';
    const diffMs = Date.now() - new Date(ts).getTime();
    if (!Number.isFinite(diffMs)) return '—';
    if (diffMs < 60000) return 'Just now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days} day+`;
}

function toDMS(deg, axis) {
    if (deg == null || !Number.isFinite(Number(deg))) return '—';
    const value = Number(deg);
    const dir = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
    const abs = Math.abs(value);
    const d = Math.floor(abs);
    const minFloat = (abs - d) * 60;
    const m = Math.floor(minFloat);
    const s = ((minFloat - m) * 60).toFixed(2);
    return `${d}°${m}'${s}"${dir}`;
}

// TurboHive's status# command returns free text like "...LTE Signal Level:Strong;..." — see
// TurboHiveService::getBatteryStatus, which parses out just the `signalLevel` word. The exact
// vocabulary from the device firmware isn't documented beyond that one example, so an unrecognized
// value still displays as text — it just renders with an empty/neutral bar icon instead of guessing.
const SIGNAL_LEVELS = { 'No signal': 0, 'Weak': 1, 'Fair': 2, 'Good': 3, 'Strong': 4 };

function CellSignalBars({ level, dark }) {
    const n = SIGNAL_LEVELS[level] ?? 0;
    const color = n === 0 ? '#cbd5e1' : n === 1 ? '#ef4444' : n === 2 ? '#f59e0b' : '#22c55e';
    return (
        <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 13 }}>
            {[1, 2, 3, 4].map(i => (
                <span key={i} style={{ width: 3, height: 3 + i * 2.5, borderRadius: 1, background: i <= n ? color : (dark ? '#334155' : '#e2e8f0'), display: 'block' }} />
            ))}
        </span>
    );
}

function Toggle({ on, onChange }) {
    return (
        <button onClick={onChange} title="Switch coordinate format" style={{
            width: 34, height: 18, borderRadius: 10, border: 'none', cursor: 'pointer', padding: 2,
            background: on ? '#3b82f6' : '#cbd5e1', display: 'flex', alignItems: 'center',
            justifyContent: on ? 'flex-end' : 'flex-start', transition: 'background 0.15s',
        }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', display: 'block', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }} />
        </button>
    );
}

const cardStyle = (dark) => ({ border: `1px solid ${dark ? '#1e293b' : '#e2e8f0'}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12, background: dark ? '#111827' : 'transparent' });
const labelStyle = { fontSize: 11.5, color: '#94a3b8', fontWeight: 600, marginBottom: 6 };
const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' };

export default function DeviceDetailPanel({ device, onClose, dark }) {
    const [address, setAddress] = useState(null);       // null = not loaded, '' = load failed
    const [addressLoading, setAddressLoading] = useState(false);
    const [signalLevel, setSignalLevel] = useState(null); // null = not loaded, '' = load failed
    const [useDecimal, setUseDecimal] = useState(false);

    const imei = device?.imei;
    const lat = device?.lat != null ? Number(device.lat) : null;
    const lng = device?.lng != null ? Number(device.lng) : null;

    // Reverse-geocode and cellular-signal-level are both fetched once per device selection, not
    // on every live position tick — same "fetch lazily, cache per imei" pattern MapCanvas.jsx uses
    // for OBD fuel level, since both calls hit external/slow services (Nominatim, and a live
    // status# command round-trip to the device itself).
    useEffect(() => {
        setAddress(null);
        setSignalLevel(null);
        if (!imei) return;

        api.getTurboHiveBatteryStatus(imei)
            .then(res => setSignalLevel(res.data?.signalLevel || ''))
            .catch(() => setSignalLevel(''));
    }, [imei]);

    useEffect(() => {
        if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
        setAddressLoading(true);
        const controller = new AbortController();
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=0`, { signal: controller.signal })
            .then(res => res.json())
            .then(data => setAddress(data?.display_name || ''))
            .catch(() => setAddress(''))
            .finally(() => setAddressLoading(false));
        return () => controller.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imei]);

    if (!device) return null;

    const online = device.status === 'ONLINE';
    const coordText = useDecimal
        ? (lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : '—')
        : `${toDMS(lat, 'lat')}, ${toDMS(lng, 'lng')}`;

    const card = cardStyle(dark);
    const valueColor = dark ? '#e2e8f0' : '#0f172a';
    const strongValueColor = dark ? '#f1f5f9' : '#1e293b';

    return (
        <div style={{
            width: 300, flexShrink: 0, background: dark ? '#0f172a' : '#fff', borderLeft: `1px solid ${dark ? '#1e293b' : '#e2e8f0'}`,
            overflowY: 'auto', padding: 16,
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: dark ? '#f1f5f9' : '#0f172a' }}>{device.name}</h3>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#94a3b8' }}>{device.imei}</p>
                </div>
                <button onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#64748b' : '#94a3af', fontSize: 16, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CellSignalBars level={online ? (signalLevel || '') : ''} dark={dark} />
                    <span style={{ fontSize: 14, fontWeight: 800, color: online ? '#16a34a' : '#64748b' }}>{online ? 'Online' : 'Offline'}</span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>(ACC: {device.acc ? 'ON' : 'OFF'})</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: valueColor }}>{formatElapsed(device.lastUpdate)}</span>
            </div>

            <div style={card}>
                <div style={labelStyle}>Address</div>
                <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: strongValueColor, lineHeight: 1.4 }}>
                    {addressLoading ? 'Looking up address…' : (address || 'Address unavailable')}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={labelStyle}>Coordinates</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10.5, color: '#94a3b8' }}>Unit switching</span>
                        <Toggle on={useDecimal} onChange={() => setUseDecimal(v => !v)} />
                    </div>
                </div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: strongValueColor }}>{coordText}</p>
            </div>

            <div style={card}>
                <div style={{ fontSize: 13, fontWeight: 800, color: dark ? '#f1f5f9' : '#0f172a', marginBottom: 8 }}>Device</div>
                <div style={rowStyle}>
                    <span style={{ fontSize: 12.5, color: '#64748b' }}>GNSS</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: valueColor }}>GPS</span>
                </div>
                <div style={rowStyle}>
                    <span style={{ fontSize: 12.5, color: '#64748b' }}>Visible satellites</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: valueColor }}>{device.satellites ?? '—'}</span>
                </div>
                <div style={rowStyle}>
                    <span style={{ fontSize: 12.5, color: '#64748b' }}>Cellular signal strength</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: valueColor, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {signalLevel === null ? 'Loading…' : (signalLevel || '—')}
                        {signalLevel && <CellSignalBars level={signalLevel} dark={dark} />}
                    </span>
                </div>
                <div style={rowStyle}>
                    <span style={{ fontSize: 12.5, color: '#64748b' }}>Last online</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: valueColor }}>{fmtDateTime(device.lastUpdate)}</span>
                </div>
                <div style={rowStyle}>
                    <span style={{ fontSize: 12.5, color: '#64748b' }}>Last fix</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: valueColor }}>{fmtDateTime(device.fixTime)}</span>
                </div>
            </div>
        </div>
    );
}
