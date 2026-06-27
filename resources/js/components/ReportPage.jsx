/* ── ReportPage.jsx ─────────────────────────────────────────── */
import { useState, useEffect, Fragment } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Circle, Polygon, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../api.js';

// Fix default marker icon paths broken by bundlers (same fix as MapCanvas.jsx; idempotent).
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/* ── shared sub-components ──────────────────────────────────── */
const TH = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', background: '#f9fafb' };
const TD = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#374151' };

const humanize = (raw) => raw ? raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase()) : '';
const fmtTime = (iso) => iso ? new Date(iso).toLocaleString() : '—';
const toLocalInput = (d) => {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function Notice({ color = '#fef3c7', icon = '⚠', text }) {
    return (
        <div style={{ background: color, border: `1px solid ${color === '#fef3c7' ? '#f59e0b' : '#3b82f6'}`, borderRadius: 8, padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
            <span>{icon}</span><span>{text}</span>
        </div>
    );
}

function EmptyTable({ cols, rows }) {
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
                <tr>{cols.map(c => <th key={c} style={TH}>{c}</th>)}</tr>
            </thead>
            <tbody>
                {rows && rows.length ? rows.map((r, i) => (
                    <tr key={i}>{r.map((cell, j) => <td key={j} style={TD}>{cell}</td>)}</tr>
                )) : (
                    <tr><td colSpan={cols.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                )}
            </tbody>
        </table>
    );
}

function SelInput({ label, type = 'select', options = [], placeholder }) {
    const [v, setV] = useState('');
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{label}</label>
            {type === 'select' ? (
                <select value={v} onChange={e => setV(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', minWidth: 150 }}>
                    <option value="">{placeholder || 'Please select'}</option>
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            ) : (
                <input type={type} value={v} onChange={e => setV(e.target.value)} placeholder={placeholder}
                    style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }} />
            )}
        </div>
    );
}

function FilterBar({ children, onSearch }) {
    return (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            {children}
            <button onClick={onSearch} style={{ padding: '7px 22px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
            <button style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            <button style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Export</button>
        </div>
    );
}

function ChartPlaceholder({ label }) {
    return (
        <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14, marginBottom: 18 }}>
            📈 {label} chart — no data
        </div>
    );
}

/* ── date range preset ────────────────────────────────────────── */
function DateDeviceFilter({ showModel, showSub }) {
    return (
        <>
            <SelInput label="Device" type="select" placeholder="Select device" />
            <SelInput label="Start date" type="date" />
            <SelInput label="End date" type="date" />
            {showModel && <SelInput label="Device Model" type="select" placeholder="All models" />}
            {showSub   && <SelInput label="Sub-account" type="select" placeholder="All accounts" />}
        </>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  DEVICE STATISTICS PAGES                                       */
/* ══════════════════════════════════════════════════════════════ */

function formatMinutesDuration(minutes) {
    if (minutes == null) return '—';
    const total = Math.round(minutes);
    const h = Math.floor(total / 60), m = total % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const BATTERY_STATUS_COLOR = { Normal: '#16a34a', Low: '#f59e0b', Critical: '#ef4444' };

// Built from Traccar's GET /api/reports/route — each position's attributes.batteryLevel is bucketed
// into Normal/Low/Critical and consecutive same-status readings are collapsed into one row spanning
// from the first to the last reading at that status (see TraccarController::internalBatteryReport).
function InternalBattery() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [status, setStatus]     = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            const res = await api.getBatteryReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load battery report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setStatus(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const filtered = status ? rows.filter(r => r.status === status) : rows;
    const COLS = ['No.','Device name','IMEI','Battery Level (%)','Status','Time','Duration'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select value={status} onChange={e => setStatus(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                    <option value="">All statuses</option>
                    <option>Normal</option><option>Low</option><option>Critical</option>
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : filtered.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    ) : filtered.map((r, i) => (
                        <tr key={i}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{r.level ?? '—'}</td>
                            <td style={{ ...TD, color: BATTERY_STATUS_COLOR[r.status] || '#374151', fontWeight: 600 }}>{r.status ?? '—'}</td>
                            <td style={TD}>{fmtTime(r.startTime)}</td>
                            <td style={TD}>{formatMinutesDuration(r.durationMinutes)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// Built from Traccar's GET /api/reports/route — reads attributes.power (falling back to
// attributes.battery), the vehicle/external power-supply voltage, as opposed to the internal-battery
// percentage used by the Internal Battery report. See TraccarController::externalBatteryReport.
function ExternalBattery() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [status, setStatus]     = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            const res = await api.getExternalBatteryReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load external battery report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setStatus(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const filtered = status ? rows.filter(r => r.status === status) : rows;
    const COLS = ['No.','Device name','IMEI','Voltage (V)','Status','Record Time'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select value={status} onChange={e => setStatus(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                    <option value="">All statuses</option>
                    <option>Normal</option><option>Low</option>
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : filtered.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    ) : filtered.map((r, i) => (
                        <tr key={i}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{r.voltage ?? '—'}</td>
                            <td style={{ ...TD, color: BATTERY_STATUS_COLOR[r.status] || '#374151', fontWeight: 600 }}>{r.status ?? '—'}</td>
                            <td style={TD}>{fmtTime(r.recordTime)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

const FUEL_METHODS = [
    ['none',   'No Sensor (Estimated)'],
    ['sensor', 'Fuel Sensor'],
    ['obd',    'OBD-II / CAN Bus'],
];
const FUEL_METHOD_LABELS = Object.fromEntries(FUEL_METHODS);
const FUEL_METHOD_NOTICE = {
    none:   'No sensor available: fuel used is estimated from distance traveled x the device’s configured average consumption (Attributes → fuelEfficiency, L/100km; defaults to 9.0 if not set).',
    sensor: 'Computed from drops in the fuel-level sensor reading (attributes.fuel); refuels are excluded. Converted from % to liters using the device’s fuelCapacity attribute when available.',
    obd:    'Computed from the vehicle’s OBD-II/CAN data: cumulative fuel used (attributes.fuelUsed) over the period, or the instantaneous consumption rate (attributes.fuelConsumption) integrated over time.',
};

// Built from Traccar's GET /api/reports/route — see TraccarController::fuelConsumptionReport for
// how each of the three methods (none/sensor/obd) derives Fuel Used from the raw position history.
function FuelConsumption() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [method, setMethod]     = useState('none');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        const m   = overrides.method ?? method;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString(), method: m };
            if (dId) params.deviceId = dId;
            const res = await api.getFuelConsumptionReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load fuel consumption report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setMethod('none'); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const COLS = ['No.','Device name','IMEI','Start Time','End Time','Distance (km)','Fuel Used (L)','Avg Consumption (L/100km)'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select value={method} onChange={e => setMethod(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 180 }}>
                    {FUEL_METHODS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <Notice text={FUEL_METHOD_NOTICE[method]} />
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : rows.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data for {FUEL_METHOD_LABELS[method]}</td></tr>
                    ) : rows.map((r, i) => (
                        <tr key={r.deviceId}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{fmtTime(r.startTime)}</td>
                            <td style={TD}>{fmtTime(r.endTime)}</td>
                            <td style={TD}>{r.distanceKm}</td>
                            <td style={TD}>{r.fuelUsed}</td>
                            <td style={TD}>{r.avgConsumption ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// Live snapshot built from Traccar's GET /api/positions (latest position per device) — see
// TraccarController::currentFuel for how attributes.fuel is cross-derived into liters/percent.
function CurrentFuelValue() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = {};
            if (dId) params.deviceId = dId;
            const res = await api.getCurrentFuel(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load current fuel values.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        setDeviceId('');
        search({ deviceId: '' });
    };

    const COLS = ['No.','Device name','IMEI','Current Fuel Level (L)','Fuel (%)','Last Updated'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Refresh</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : rows.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    ) : rows.map((r, i) => (
                        <tr key={r.deviceId}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{r.liters ?? '—'}</td>
                            <td style={TD}>{r.percent != null ? `${r.percent}%` : '—'}</td>
                            <td style={TD}>{fmtTime(r.lastUpdated)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  FUEL MANAGEMENT (Fleet) — Fuel Curve / Refuelling / Idle / Abnormal Loss / Ranking */
/* ══════════════════════════════════════════════════════════════ */
// Single-line sparkline, same hand-rolled approach as TempHumidityChart below (no chart dependency
// in this project), plotted from the same rows the table renders.
function FuelCurveChart({ rows }) {
    const ordered = [...rows]; // already chronological from the backend
    const pts = ordered.filter(r => r.percent != null);
    if (pts.length < 2) {
        return (
            <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, marginBottom: 14 }}>
                ⛽ Fuel Curve — not enough data
            </div>
        );
    }
    const W = 760, H = 160, P = 20;
    const min = Math.min(...pts.map(r => r.percent)), max = Math.max(...pts.map(r => r.percent));
    const xStep = (W - P * 2) / (pts.length - 1);
    let d = '';
    pts.forEach((r, i) => {
        const x = P + i * xStep;
        const y = H - P - ((r.percent - min) / (max - min || 1)) * (H - P * 2);
        d += `${d ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)} `;
    });

    return (
        <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ marginBottom: 6, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>● Fuel level (%)</div>
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                <path d={d} fill="none" stroke="#16a34a" strokeWidth="2" />
            </svg>
        </div>
    );
}

// Built from Traccar's GET /api/reports/route — reads attributes.fuel per reading, plotted
// chronologically. See TraccarController::fuelCurveReport. Distinct from the existing Fuel
// Consumption report, which only returns one summary total per device for the period.
function FuelCurve() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            const res = await api.getFuelCurveReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load fuel curve.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const COLS = ['No.','Device name','IMEI','Fuel (%)','Fuel (L)','Coordinates','Record Time'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <FuelCurveChart rows={rows} />
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : rows.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    ) : [...rows].reverse().map((r, i) => (
                        <tr key={i}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{r.percent != null ? `${r.percent}%` : '—'}</td>
                            <td style={TD}>{r.liters ?? '—'}</td>
                            <td style={TD}>{fmtCoords(r.latitude, r.longitude)}</td>
                            <td style={TD}>{fmtTime(r.fixTime)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// Shared by Refuelling and Abnormal Loss — both read GET /api/traccar/reports/fuel-refuelling or
// fuel-abnormal-loss (TraccarController::fuelLevelEvents), differing only in event type/labels.
function FuelEventReport({ apiFn, eventLabel, noticeText }) {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            const res = await apiFn(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || `Failed to load ${eventLabel.toLowerCase()} report.`);
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const COLS = ['No.','Device name','IMEI','Model','From (%)','To (%)','Amount (L)','Time','Coordinates','Address'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            {noticeText && <Notice text={noticeText} />}
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : rows.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    ) : rows.map((r, i) => (
                        <tr key={i}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{r.model ?? '—'}</td>
                            <td style={TD}>{r.fromPercent}%</td>
                            <td style={TD}>{r.toPercent}%</td>
                            <td style={TD}>{r.amountLiters ?? '—'}</td>
                            <td style={TD}>{fmtTime(r.time)}</td>
                            <td style={TD}>{fmtCoords(r.latitude, r.longitude)}</td>
                            <td style={TD}>{r.address ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

function Refuelling() {
    return <FuelEventReport apiFn={api.getRefuellingReport} eventLabel="Refuelling"
        noticeText="A level rise of at least 5% of tank capacity between two readings is treated as a refuel." />;
}

function AbnormalFuelLoss() {
    return <FuelEventReport apiFn={api.getAbnormalFuelLossReport} eventLabel="Abnormal Loss"
        noticeText="A level drop of at least 8% with almost no distance travelled is flagged as an abnormal loss (leak/siphon), distinct from normal consumption while driving." />;
}

// Built from classifiedStops()'s existing Idling classification, with fuel burned during each idle
// window summed from the same /reports/route data. See TraccarController::idleFuelReport.
function IdleFuel() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            const res = await api.getIdleFuelReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load idle fuel report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const COLS = ['No.','Device name','IMEI','Model','Start time','End Time','Idle Duration','Fuel Used (L)','Coordinates','Address'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : rows.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    ) : rows.map((r, i) => (
                        <tr key={i}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{r.model ?? '—'}</td>
                            <td style={TD}>{fmtTime(r.startTime)}</td>
                            <td style={TD}>{fmtTime(r.endTime)}</td>
                            <td style={TD}>{formatHMS(r.idleDurationMs)}</td>
                            <td style={TD}>{r.fuelUsed}</td>
                            <td style={TD}>{fmtCoords(r.latitude, r.longitude)}</td>
                            <td style={TD}>{r.address ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// Ranks by vehicle (overall L/100km + tonne-km via attributes.cargoTonnes), driver, or route (each
// individual trip) — see TraccarController::fuelRankingReport.
function FuelRanking() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [by, setBy]             = useState('vehicle');
    const [method, setMethod]     = useState('none');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        const b   = overrides.by ?? by;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString(), by: b, method };
            if (dId) params.deviceId = dId;
            const res = await api.getFuelRankingReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load fuel ranking.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setBy('vehicle'); setMethod('none'); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const COLS = by === 'vehicle'
        ? ['No.','Device name','IMEI','Model','Distance (km)','Fuel Used (L)','L/100km','Tonne-km','L/Tonne-km']
        : by === 'route'
        ? ['No.','Device name','Driver','Start Time','Start location','End location','Distance (km)','Fuel Used (L)','L/100km']
        : ['No.','Driver','Trips','Distance (km)','Fuel Used (L)','L/100km'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={by} onChange={e => { setBy(e.target.value); search({ by: e.target.value }); }}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                    <option value="vehicle">By Vehicle</option>
                    <option value="driver">By Driver</option>
                    <option value="route">By Route</option>
                </select>
                {by === 'vehicle' && (
                    <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                        style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                        <option value="">All devices</option>
                        {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                )}
                {by === 'vehicle' && (
                    <select value={method} onChange={e => setMethod(e.target.value)}
                        style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                        {FUEL_METHODS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                )}
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <Notice text="Ranked best (lowest L/100km) to worst. Tonne-km uses each device's attributes.cargoTonnes custom attribute, defaulting to 1 tonne when unset." />
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : rows.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    ) : rows.map((r, i) => (
                        <tr key={i}>
                            <td style={TD}>{i + 1}</td>
                            {by === 'vehicle' && (
                                <>
                                    <td style={TD}>{r.deviceName ?? '—'}</td>
                                    <td style={TD}>{r.imei ?? '—'}</td>
                                    <td style={TD}>{r.model ?? '—'}</td>
                                    <td style={TD}>{r.distanceKm}</td>
                                    <td style={TD}>{r.fuelUsed}</td>
                                    <td style={TD}>{r.fuelPer100km}</td>
                                    <td style={TD}>{r.tonneKm}</td>
                                    <td style={TD}>{r.fuelPerTonneKm}</td>
                                </>
                            )}
                            {by === 'route' && (
                                <>
                                    <td style={TD}>{r.deviceName ?? '—'}</td>
                                    <td style={TD}>{r.driverName ?? '—'}</td>
                                    <td style={TD}>{fmtTime(r.startTime)}</td>
                                    <td style={TD}>{r.startLocation ?? '—'}</td>
                                    <td style={TD}>{r.endLocation ?? '—'}</td>
                                    <td style={TD}>{r.distanceKm}</td>
                                    <td style={TD}>{r.fuelUsed}</td>
                                    <td style={TD}>{r.fuelPer100km}</td>
                                </>
                            )}
                            {by === 'driver' && (
                                <>
                                    <td style={TD}>{r.driverName ?? '—'}</td>
                                    <td style={TD}>{r.trips}</td>
                                    <td style={TD}>{r.distanceKm}</td>
                                    <td style={TD}>{r.fuelUsed}</td>
                                    <td style={TD}>{r.fuelPer100km ?? '—'}</td>
                                </>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// Lightweight hand-rolled dual-line sparkline (no chart dependency in this project) replacing the
// old static placeholder, plotted from the same rows the table below renders.
function TempHumidityChart({ rows }) {
    const ordered = [...rows].reverse(); // table is newest-first; chart reads chronologically
    if (ordered.length < 2) {
        return (
            <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, marginBottom: 14 }}>
                📈 Temperature & Humidity (dual axis) — not enough data
            </div>
        );
    }
    const W = 760, H = 160, P = 20;
    const temps = ordered.map(r => r.temperature).filter(v => v != null);
    const hums  = ordered.map(r => r.humidity).filter(v => v != null);
    const tMin = temps.length ? Math.min(...temps) : 0, tMax = temps.length ? Math.max(...temps) : 1;
    const hMin = hums.length  ? Math.min(...hums)  : 0, hMax = hums.length  ? Math.max(...hums)  : 1;
    const xStep = (W - P * 2) / (ordered.length - 1);

    const pathFor = (key, min, max) => {
        let d = '';
        ordered.forEach((r, i) => {
            if (r[key] == null) return;
            const x = P + i * xStep;
            const y = H - P - ((r[key] - min) / (max - min || 1)) * (H - P * 2);
            d += `${d ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)} `;
        });
        return d;
    };

    return (
        <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 16, marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: '#ef4444', fontWeight: 600 }}>● Temperature (°C)</span>
                <span style={{ color: '#3b82f6', fontWeight: 600 }}>● Humidity (%)</span>
            </div>
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                <path d={pathFor('temperature', tMin, tMax)} fill="none" stroke="#ef4444" strokeWidth="2" />
                <path d={pathFor('humidity', hMin, hMax)} fill="none" stroke="#3b82f6" strokeWidth="2" />
            </svg>
        </div>
    );
}

// Built from Traccar's GET /api/reports/route — reads attributes.temp1 (first temperature-probe
// channel) and attributes.humidity per reading. See TraccarController::temperatureHumidityReport.
function TemperatureHumidity() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            const res = await api.getTemperatureHumidityReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load temperature & humidity report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const COLS = ['No.','Device name','IMEI','Temperature (°C)','Humidity (%)','Record Time'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <TempHumidityChart rows={rows} />
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : rows.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    ) : rows.map((r, i) => (
                        <tr key={i}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{r.temperature ?? '—'}</td>
                            <td style={TD}>{r.humidity ?? '—'}</td>
                            <td style={TD}>{fmtTime(r.recordTime)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

const DRIVER_BEHAVIOR_TYPES = [
    ['hardAcceleration', 'Hard Acceleration'],
    ['hardBraking', 'Hard Braking'],
    ['hardCornering', 'Hard Cornering'],
    ['deviceOverspeed', 'Overspeed'],
];
const DRIVER_BEHAVIOR_ALARMS = ['hardAcceleration', 'hardBraking', 'hardCornering'];

function isDriverBehaviorRow(r) {
    return (r.type === 'alarm' && DRIVER_BEHAVIOR_ALARMS.includes(r.data)) || r.type === 'deviceOverspeed';
}
function driverBehaviorLabel(r) {
    return r.type === 'deviceOverspeed' ? 'Overspeed' : alarmDataLabel(r.data);
}

// Reuses Traccar's GET /api/reports/events (same data as Alert Details) filtered to the driving-
// behavior alarm sub-types (hardAcceleration/hardBraking/hardCornering) plus deviceOverspeed events.
// Driver comes from attributes.driverUniqueId on the linked position, when the device reports one —
// see TraccarController::alertEvents.
function DriverBehavior() {
    const [devices, setDevices]     = useState([]);
    const [deviceId, setDeviceId]   = useState('');
    const [eventType, setEventType] = useState('');
    const [from, setFrom]           = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]               = useState(() => toLocalInput(new Date()));
    const [rows, setRows]           = useState([]);
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            const res = await api.getAlertEvents(params);
            setRows(res.data.filter(isDriverBehaviorRow));
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load driver behavior events.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setEventType(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const filtered = eventType
        ? rows.filter(r => (r.type === 'deviceOverspeed' ? r.type : r.data) === eventType)
        : rows;
    const COLS = ['No.','Device name','Driver','Event Type','Value','Location','Time'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select value={eventType} onChange={e => setEventType(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                    <option value="">All event types</option>
                    {DRIVER_BEHAVIOR_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <Notice text="Driver behavior events are Traccar alarm sub-types (hard acceleration / braking / cornering) plus speed-limit-exceeded events; Driver is read from the device's reported driverUniqueId, when available." />
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : filtered.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    ) : filtered.map((r, i) => (
                        <tr key={r.id}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.driverName ?? '—'}</td>
                            <td style={TD}>{driverBehaviorLabel(r)}</td>
                            <td style={TD}>{r.speed != null ? `${r.speed} km/h` : '—'}</td>
                            <td style={TD}>{r.address ?? fmtCoords(r.latitude, r.longitude)}</td>
                            <td style={TD}>{fmtTime(r.eventTime)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// Built from Traccar's GET /api/reports/route — attributes.rssi (raw signal-quality value, unit
// varies by protocol), the position's own top-level accuracy field (GPS accuracy in meters), and
// attributes.batteryLevel, one row per reading that reports at least one of the three.
function PositioningBattery() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            const res = await api.getPositioningBatteryReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load positioning & battery report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const COLS = ['No.','Device name','IMEI','Signal Strength','GPS Accuracy (m)','Battery (%)','Time'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : rows.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    ) : rows.map((r, i) => (
                        <tr key={i}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{r.signal ?? '—'}</td>
                            <td style={TD}>{r.accuracy ?? '—'}</td>
                            <td style={TD}>{r.battery ?? '—'}</td>
                            <td style={TD}>{fmtTime(r.recordTime)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// Built from Traccar's GET /api/reports/trips, grouped per device per calendar day — see
// TraccarController::travelStatisticsReport. Works off motion-detected trips (any device), not
// strictly OBD-only, but reported the same way an OBD travel summary would be.
function TravelStatisticsOBD() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setDate(d.getDate() - 6); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            const res = await api.getTravelStatisticsReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load travel statistics report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setDate(d.getDate() - 6); d.setHours(0,0,0,0);
        setDeviceId(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const COLS = ['No.','Device name','IMEI','Total Distance (km)','Total Duration','Avg Speed (km/h)','Max Speed (km/h)','Trips','Date'];

    return (
        <>
            <Notice color="#dbeafe" icon="ℹ" text="Built from Traccar's motion-detected trips, grouped per device per day — works for any device, not strictly OBD-only." />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : rows.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    ) : rows.map((r, i) => (
                        <tr key={`${r.deviceId}-${r.date}`}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{r.distanceKm}</td>
                            <td style={TD}>{formatMinutesDuration(r.durationMinutes)}</td>
                            <td style={TD}>{r.avgSpeedKmh}</td>
                            <td style={TD}>{r.maxSpeedKmh}</td>
                            <td style={TD}>{r.trips}</td>
                            <td style={TD}>{r.date}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  MOTION STATISTICS PAGES                                       */
/* ══════════════════════════════════════════════════════════════ */

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function formatDuration(ms) {
    if (!ms) return '—';
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const knotsToKmh = (knots) => (knots == null ? null : knots * 1.852);

const COMPASS_DIRS = ['Due North', 'Northeast', 'Due East', 'Southeast', 'Due South', 'Southwest', 'Due West', 'Northwest'];
function azimuthLabel(course) {
    if (course == null) return '—';
    const idx = Math.round(course / 45) % 8;
    return `${COMPASS_DIRS[idx]}(Direction number: ${Math.round(course)})`;
}

function exportTrackDetailsCsv(rows) {
    const header = ['No.', 'Position Time', 'Speed (km/h)', 'Azimuth', 'Position type', 'No. of satellites', 'Data Type', 'Coordinates', 'Address'];
    const lines = [header.join(',')];
    rows.forEach((r, i) => {
        const cells = [
            i + 1, fmtTime(r.fixTime), r.speedKmh, r.azimuth, r.positionType,
            r.satellites ?? '—', r.dataType, `${r.latitude},${r.longitude}`, r.address,
        ];
        lines.push(cells.map(c => `"${String(c ?? '—').replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'track-details.csv'; a.click();
    URL.revokeObjectURL(url);
}

// Built from Traccar's GET /api/reports/route (per-device GPS track) — one row per position,
// matching Traccar's native Track Details layout: speed, heading/azimuth, satellite count, whether
// the point was reported live or replayed from device-side storage (attributes.archive), and address.
function TrackDetails() {
    const [devices,  setDevices]  = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from,      setFrom]    = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to,        setTo]      = useState(() => toLocalInput(new Date()));
    const [rows,      setRows]    = useState([]);
    const [loading,   setLoading] = useState(false);
    const [error,     setError]   = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async () => {
        if (!deviceId) { setError('Select a device.'); return; }
        setError('');
        setLoading(true);
        try {
            const res = await api.getRouteHistory(deviceId, new Date(from).toISOString(), new Date(to).toISOString());
            const points = res.data.map(p => ({
                fixTime:      p.fixTime,
                speedKmh:     Math.round((p.speed || 0) * 1.852),
                azimuth:      azimuthLabel(p.course),
                positionType: p.valid === false ? 'Network' : 'GPS',
                satellites:   p.attributes?.sat ?? null,
                dataType:     p.attributes?.archive ? 'History' : 'Real',
                latitude:     p.latitude,
                longitude:    p.longitude,
                address:      p.address,
            })).sort((a, b) => new Date(b.fixTime) - new Date(a.fixTime));
            setRows(points);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load track details.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const COLS = ['No.', 'Position Time', 'Speed (km/h)', 'Azimuth', 'Position type', 'No. of satellites', 'Data Type', 'Coordinates', 'Address'];

    return (
        <>
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Device</label>
                    <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                        style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', minWidth: 180 }}>
                        <option value="">Select device</option>
                        {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>From</label>
                    <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                        style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>To</label>
                    <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                        style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }} />
                </div>
                <button onClick={search} disabled={loading} style={{ padding: '7px 22px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                    {loading ? 'Loading…' : 'Search'}
                </button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
                <button onClick={() => exportTrackDetailsCsv(rows)} disabled={!rows.length}
                    style={{ padding: '7px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: rows.length ? '#374151' : '#cbd5e1', fontSize: 13, cursor: rows.length ? 'pointer' : 'not-allowed' }}>Export</button>
            </div>

            <Notice color="#dbeafe" icon="ℹ" text="Track precision depends on GPS signal quality and reporting interval settings." />
            {error && <Notice text={error} />}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                    <thead>
                        <tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                        ) : rows.map((r, i) => (
                            <tr key={i}>
                                <td style={TD}>{i + 1}</td>
                                <td style={TD}>{fmtTime(r.fixTime)}</td>
                                <td style={TD}>{r.speedKmh}</td>
                                <td style={TD}>{r.azimuth}</td>
                                <td style={TD}>{r.positionType}</td>
                                <td style={TD}>{r.satellites ?? '—'}</td>
                                <td style={TD}>{r.dataType}</td>
                                <td style={TD}>
                                    <a href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>
                                        {r.latitude},{r.longitude}
                                    </a>
                                </td>
                                <td style={TD}>{r.address ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  REPLAY                                                        */
/* ══════════════════════════════════════════════════════════════ */
const REPLAY_DEFAULT_CENTER = [14.5995, 120.9842];
const PLAYBACK_RATES = [
    { label: '1x', ms: 1000 },
    { label: '2x', ms: 500 },
    { label: '4x', ms: 250 },
    { label: '8x', ms: 125 },
];
const PARKING_TIME_OPTIONS = [0, 1, 3, 5, 10, 15, 30];

function replayIcon(course) {
    const rot = course || 0;
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" style="transform: rotate(${rot}deg)">
            <circle cx="14" cy="14" r="12" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2"/>
            <path d="M14 6 L19 18 L14 15 L9 18 Z" fill="#fff"/>
        </svg>`;
    return L.divIcon({ html: svg, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
}

const behaviorIcon = L.divIcon({
    html: '<div style="width:14px;height:14px;border-radius:50%;background:#ef4444;border:2px solid #fff;box-shadow:0 0 0 1px #ef4444;"></div>',
    className: '', iconSize: [14, 14], iconAnchor: [7, 7],
});

// Minimal subset of Traccar's WKT geofence area parsing (same formats as GeofencePage.jsx) needed
// to render saved geofences as static overlays here.
// Some saved geofences have an out-of-range longitude (e.g. dragged past the antimeridian in the
// draw tool), which Leaflet projects a full world-width away from wherever the map is actually
// looking — normalizing into [-180, 180] keeps the shape lined up with real device coordinates.
function normalizeLon(lon) {
    let x = (lon + 180) % 360;
    if (x < 0) x += 360;
    return x - 180;
}

function geofenceAreaToShape(area) {
    if (!area) return null;
    let m = area.match(/^CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/i);
    if (m) return { type: 'circle', center: [Number(m[1]), normalizeLon(Number(m[2]))], radius: Number(m[3]) };
    m = area.match(/^POLYGON\s*\(\(([^)]+)\)\)$/i);
    if (m) return { type: 'polygon', points: m[1].split(',').map(p => { const [lat, lon] = p.trim().split(/\s+/).map(Number); return [lat, normalizeLon(lon)]; }) };
    return null;
}

function FitToTrack({ points }) {
    const map = useMap();
    useEffect(() => {
        if (points.length) {
            map.fitBounds(points.map(p => [p.latitude, p.longitude]), { padding: [40, 40] });
        }
    }, [points, map]);
    return null;
}

// Built from Traccar's GET /api/reports/route (same per-device GPS track as Track Details), played
// back as a marker animated along the loaded points. "Driving behavior" overlay reuses the same
// alarm classification as the Driver Behavior report (GET /api/reports/events); "Geofence" overlay
// reuses the account's saved geofences; "Parking time" marks runs of near-zero speed lasting at
// least the chosen threshold, computed locally from the already-loaded track (no extra API call).
function Replay() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [points, setPoints]     = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    const [index, setIndex]     = useState(0);
    const [playing, setPlaying] = useState(false);
    const [rateMs, setRateMs]   = useState(PLAYBACK_RATES[2].ms);
    const [parkingTime, setParkingTime] = useState(0);
    const [alertType, setAlertType]     = useState('');

    const [showTrack, setShowTrack]       = useState(true);
    const [showByFix, setShowByFix]       = useState(false);
    const [showBehavior, setShowBehavior] = useState(false);
    const [showGeofence, setShowGeofence] = useState(false);

    const [behaviorEvents, setBehaviorEvents] = useState([]);
    const [geofences, setGeofences]            = useState([]);

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
        api.getGeofences().then(res => setGeofences(res.data)).catch(() => {});
    }, []);

    const search = async () => {
        if (!deviceId) { setError('Select a device.'); return; }
        setError('');
        setLoading(true);
        setPlaying(false);
        try {
            const fromIso = new Date(from).toISOString();
            const toIso = new Date(to).toISOString();
            const [routeRes, eventsRes] = await Promise.all([
                api.getRouteHistory(deviceId, fromIso, toIso),
                api.getAlertEvents({ from: fromIso, to: toIso, deviceId }),
            ]);
            const pts = (routeRes.data || [])
                .map(p => ({
                    fixTime: p.fixTime,
                    latitude: p.latitude,
                    longitude: p.longitude,
                    speedKmh: Math.round((p.speed || 0) * 1.852),
                    course: p.course,
                }))
                .sort((a, b) => new Date(a.fixTime) - new Date(b.fixTime));
            setPoints(pts);
            setBehaviorEvents((eventsRes.data || []).filter(isDriverBehaviorRow));
            setIndex(0);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load track.');
            setPoints([]);
            setBehaviorEvents([]);
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setPoints([]); setBehaviorEvents([]); setIndex(0); setPlaying(false); setError('');
        setParkingTime(0); setAlertType('');
    };

    useEffect(() => {
        if (!playing || points.length === 0) return;
        if (index >= points.length - 1) { setPlaying(false); return; }
        const t = setTimeout(() => setIndex(i => Math.min(i + 1, points.length - 1)), rateMs);
        return () => clearTimeout(t);
    }, [playing, index, rateMs, points.length]);

    const replay = () => { setIndex(0); setPlaying(true); };

    const current = points[index] || null;

    const stops = [];
    if (parkingTime > 0 && points.length > 1) {
        let runStart = null;
        for (let i = 0; i < points.length; i++) {
            const stationary = points[i].speedKmh < 2;
            if (stationary && runStart === null) runStart = i;
            if ((!stationary || i === points.length - 1) && runStart !== null) {
                const runEnd = stationary ? i : i - 1;
                const minutes = (new Date(points[runEnd].fixTime) - new Date(points[runStart].fixTime)) / 60000;
                if (minutes >= parkingTime) stops.push(points[runStart]);
                runStart = null;
            }
        }
    }

    const filteredBehavior = alertType
        ? behaviorEvents.filter(r => (r.type === 'deviceOverspeed' ? r.type : r.data) === alertType)
        : behaviorEvents;

    const center = points.length ? [points[0].latitude, points[0].longitude] : REPLAY_DEFAULT_CENTER;

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 180 }}>
                    <option value="">Select device</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <button onClick={search} disabled={loading} style={{ padding: '7px 22px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                    {loading ? 'Loading…' : 'Search'}
                </button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>

            {error && <Notice text={error} />}

            <div style={{ position: 'relative', height: 560, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                <MapContainer center={center} zoom={14} style={{ width: '100%', height: '100%' }} scrollWheelZoom>
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <FitToTrack points={points} />

                    {showTrack && points.length > 1 && (
                        <Polyline positions={points.map(p => [p.latitude, p.longitude])} pathOptions={{ color: '#3b82f6', weight: 4 }} />
                    )}

                    {showByFix && points.map((p, i) => (
                        <CircleMarker key={i} center={[p.latitude, p.longitude]} radius={3} pathOptions={{ color: '#1d4ed8', fillOpacity: 0.8 }} />
                    ))}

                    {showBehavior && filteredBehavior.map(r => (
                        r.latitude != null && (
                            <Marker key={r.id} position={[r.latitude, r.longitude]} icon={behaviorIcon}>
                                <Popup>{driverBehaviorLabel(r)}<br />{fmtTime(r.eventTime)}</Popup>
                            </Marker>
                        )
                    ))}

                    {showGeofence && geofences.map(g => {
                        const shape = geofenceAreaToShape(g.area);
                        if (!shape) return null;
                        return shape.type === 'circle' ? (
                            <Circle key={g.id} center={shape.center} radius={shape.radius} pathOptions={{ color: '#f59e0b', fillOpacity: 0.1 }} />
                        ) : (
                            <Polygon key={g.id} positions={shape.points} pathOptions={{ color: '#f59e0b', fillOpacity: 0.1 }} />
                        );
                    })}

                    {parkingTime > 0 && stops.map((s, i) => (
                        <CircleMarker key={i} center={[s.latitude, s.longitude]} radius={6} pathOptions={{ color: '#16a34a', fillOpacity: 0.9 }}>
                            <Popup>Parked since {fmtTime(s.fixTime)}</Popup>
                        </CircleMarker>
                    ))}

                    {current && <Marker position={[current.latitude, current.longitude]} icon={replayIcon(current.course)} />}
                </MapContainer>

                <div style={{ position: 'absolute', top: 12, left: 12, width: 300, background: '#fff', borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,0.15)', padding: 14, fontSize: 13, zIndex: 1000 }}>
                    {points.length === 0 ? (
                        <div style={{ color: '#94a3b8', textAlign: 'center', padding: 8 }}>Select a device and search to load a track.</div>
                    ) : (
                        <>
                            <div style={{ textAlign: 'right', marginBottom: 6, color: '#374151', fontWeight: 600 }}>
                                Speed: {current?.speedKmh ?? 0} km/h
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button onClick={() => setPlaying(p => !p)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    {playing ? '❙❙' : '▶'}
                                </button>
                                <input type="range" min={0} max={Math.max(points.length - 1, 0)} value={index}
                                    onChange={e => { setPlaying(false); setIndex(Number(e.target.value)); }}
                                    style={{ flex: 1 }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, color: '#6b7280', fontSize: 12 }}>
                                <button onClick={replay} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 4, padding: 0, fontSize: 12 }}>↻ Replay</button>
                                <select value={rateMs} onChange={e => setRateMs(Number(e.target.value))}
                                    style={{ border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, padding: '2px 6px' }}>
                                    {PLAYBACK_RATES.map(r => <option key={r.label} value={r.ms}>{r.label}</option>)}
                                </select>
                            </div>
                            <div style={{ textAlign: 'center', marginTop: 4, color: '#374151', fontSize: 12 }}>{fmtTime(current?.fixTime)}</div>

                            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <label style={{ color: '#6b7280', fontSize: 12, whiteSpace: 'nowrap' }}>Parking time</label>
                                <select value={parkingTime} onChange={e => setParkingTime(Number(e.target.value))}
                                    style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, padding: '4px 6px' }}>
                                    {PARKING_TIME_OPTIONS.map(m => <option key={m} value={m}>{m}Minute{m === 1 ? '' : 's'}</option>)}
                                </select>
                            </div>

                            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <label style={{ color: '#6b7280', fontSize: 12, whiteSpace: 'nowrap' }}>Alert Type</label>
                                <select value={alertType} onChange={e => setAlertType(e.target.value)}
                                    style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, padding: '4px 6px' }}>
                                    <option value="">Select Alert Type</option>
                                    {DRIVER_BEHAVIOR_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                                </select>
                            </div>

                            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={showTrack} onChange={e => setShowTrack(e.target.checked)} /> Display track
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={showByFix} onChange={e => setShowByFix(e.target.checked)} /> Display by fix
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={showBehavior} onChange={e => setShowBehavior(e.target.checked)} /> Driving behavior
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={showGeofence} onChange={e => setShowGeofence(e.target.checked)} /> Geofence
                                </label>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

// Built from Traccar's GET /api/reports/summary (whole-range, no daily breakdown) — one row per
// device with its total distance for the selected period. See TraccarController::mileageReport.
function Mileage() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [sortAsc, setSortAsc]   = useState(true);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            const res = await api.getMileageReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load mileage report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const sorted = [...rows].sort((a, b) => {
        const cmp = (a.deviceName ?? '').localeCompare(b.deviceName ?? '');
        return sortAsc ? cmp : -cmp;
    });
    const totalMileage = rows.reduce((sum, r) => sum + (r.mileageKm || 0), 0);
    const COLS = ['No.', 'Device Name', 'IMEI', 'Model', 'Total Mileage(km)', 'Start time', 'End Time'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <p style={{ fontSize: 13, color: '#374151', margin: '0 0 10px' }}>
                <strong>Total:</strong> Total Mileage {totalMileage.toFixed(2)} km
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                    <tr>
                        {COLS.map(c => (
                            <th key={c} style={TH}>
                                {c === 'Device Name' ? (
                                    <button onClick={() => setSortAsc(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, font: 'inherit', color: 'inherit' }}>
                                        {c}<span style={{ fontSize: 11, color: '#94a3b8' }}>{sortAsc ? '▲' : '▼'}</span>
                                    </button>
                                ) : c === 'Start time' ? (
                                    <span title="Time of the first GPS position used to calculate mileage within the selected range" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        {c}<span style={{ fontSize: 11, color: '#94a3b8', cursor: 'help' }}>ⓘ</span>
                                    </span>
                                ) : c}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : sorted.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    ) : sorted.map((r, i) => (
                        <tr key={r.deviceId}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{r.model ?? '—'}</td>
                            <td style={TD}>{r.mileageKm}</td>
                            <td style={TD}>{fmtTime(r.startTime)}</td>
                            <td style={TD}>{fmtTime(r.endTime)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

function formatHMS(ms) {
    if (!ms) return '00:00:00';
    const totalSec = Math.round(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = n => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function LocationLink({ address, lat, lon }) {
    if (lat == null || lon == null) return address ?? '—';
    return (
        <a href={`https://www.google.com/maps?q=${lat},${lon}`} target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>
            {address || `${lat},${lon}`}
        </a>
    );
}

// Built from Traccar's GET /api/reports/trips (start/end address + distance/duration), with
// Average/Max Speed recomputed from /api/reports/route positions and fuel figures from the device's
// configured average-consumption rate — see TraccarController::tripsReport for why.
function Trips() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            const res = await api.getTripsDetailReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load trips report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const COLS = ['Start time', 'Start location', 'End time', 'End location', 'Duration', 'Total Mileage(km)', 'Total Fuel Consumption (L)', 'Fuel/100KM(L)', 'Average Speed (km/h)', 'Max. speed(km/h)'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <Notice color="#dbeafe" icon="ℹ" text="A trip is movement detected between two stop/ignition-off events. Fuel figures use the device's configured average consumption rate." />
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1300 }}>
                    <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : error ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                        ) : rows.map((r, i) => (
                            <tr key={i}>
                                <td style={TD}>{fmtTime(r.startTime)}</td>
                                <td style={TD}><LocationLink address={r.startLocation} lat={r.startLat} lon={r.startLon} /></td>
                                <td style={TD}>{fmtTime(r.endTime)}</td>
                                <td style={TD}><LocationLink address={r.endLocation} lat={r.endLat} lon={r.endLon} /></td>
                                <td style={TD}>{formatHMS(r.durationMs)}</td>
                                <td style={TD}>{r.mileageKm}</td>
                                <td style={TD}>{r.fuelUsed}</td>
                                <td style={TD}>{r.fuelPer100km}</td>
                                <td style={TD}>{r.avgSpeedKmh}</td>
                                <td style={TD}>{r.maxSpeedKmh}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// Built from Traccar's GET /api/reports/route — positions above the speed limit (the device's
// attributes.speedLimit, or the override typed below; default 80 km/h) are grouped into continuous
// runs, each becoming one overspeed period. See TraccarController::overspeedReport.
function Overspeed() {
    const [devices, setDevices]     = useState([]);
    const [deviceId, setDeviceId]   = useState('');
    const [speedLimit, setSpeedLimit] = useState('');
    const [from, setFrom]           = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]               = useState(() => toLocalInput(new Date()));
    const [rows, setRows]           = useState([]);
    const [sortAsc, setSortAsc]     = useState(true);
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        const limit = 'speedLimit' in overrides ? overrides.speedLimit : speedLimit;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            if (limit) params.speedLimit = limit;
            const res = await api.getOverspeedReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load overspeed report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setSpeedLimit(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const sorted = [...rows].sort((a, b) => {
        const cmp = (a.deviceName ?? '').localeCompare(b.deviceName ?? '');
        return sortAsc ? cmp : -cmp;
    });
    const COLS = ['No.', 'Alert Type', 'Device Name', 'IMEI', 'Model', 'Speed (km/h)', 'Start time', 'End Time', 'Duration', 'Start location', 'End position', 'Start coordinates', 'End coordinates'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <input type="number" value={speedLimit} onChange={e => setSpeedLimit(e.target.value)} placeholder="Speed limit (km/h)"
                    style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', width: 150 }} />
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <Notice color="#dbeafe" icon="ℹ" text="Defaults to each device's configured speed limit (Attributes → speedLimit, km/h; 80 if unset), or the override above." />
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1500 }}>
                    <thead>
                        <tr>
                            {COLS.map(c => (
                                <th key={c} style={TH}>
                                    {c === 'Device Name' ? (
                                        <button onClick={() => setSortAsc(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, font: 'inherit', color: 'inherit' }}>
                                            {c}<span style={{ fontSize: 11, color: '#94a3b8' }}>{sortAsc ? '▲' : '▼'}</span>
                                        </button>
                                    ) : c}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : error ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                        ) : sorted.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                        ) : sorted.map((r, i) => (
                            <tr key={i}>
                                <td style={TD}>{i + 1}</td>
                                <td style={TD}>Overspeed alert</td>
                                <td style={TD}>{r.deviceName ?? '—'}</td>
                                <td style={TD}>{r.imei ?? '—'}</td>
                                <td style={TD}>{r.model ?? '—'}</td>
                                <td style={TD}>{r.speedKmh}</td>
                                <td style={TD}>{fmtTime(r.startTime)}</td>
                                <td style={TD}>{fmtTime(r.endTime)}</td>
                                <td style={TD}>{formatHMS(r.durationMs)}</td>
                                <td style={TD}>{r.startLocation ?? fmtCoords(r.startLat, r.startLon)}</td>
                                <td style={TD}>{r.endLocation ?? fmtCoords(r.endLat, r.endLon)}</td>
                                <td style={TD}>
                                    <a href={`https://www.google.com/maps?q=${r.startLat},${r.startLon}`} target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>
                                        {r.startLat},{r.startLon}
                                    </a>
                                </td>
                                <td style={TD}>
                                    <a href={`https://www.google.com/maps?q=${r.endLat},${r.endLon}`} target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>
                                        {r.endLat},{r.endLon}
                                    </a>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// Built from Traccar's GET /api/reports/stops, classified Parking vs Idling by looking up each
// stop's starting position attributes.ignition — see TraccarController::parkingReport.
function Parking() {
    const [devices, setDevices]     = useState([]);
    const [deviceId, setDeviceId]   = useState('');
    const [minDuration, setMinDuration] = useState('');
    const [from, setFrom]           = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]               = useState(() => toLocalInput(new Date()));
    const [rows, setRows]           = useState([]);
    const [sortAsc, setSortAsc]     = useState(true);
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            const res = await api.getParkingReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load parking report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setMinDuration(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const filtered = (minDuration ? rows.filter(r => r.stayTimeMs >= Number(minDuration) * 60000) : rows)
        .sort((a, b) => {
            const cmp = (a.deviceName ?? '').localeCompare(b.deviceName ?? '');
            return sortAsc ? cmp : -cmp;
        });
    const COLS = ['No.', 'Device Name', 'IMEI', 'Model', 'State', 'Start time', 'End Time', 'Coordinates', 'Address', 'Stay time'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <input type="number" value={minDuration} onChange={e => setMinDuration(e.target.value)} placeholder="Min. duration (min)"
                    style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', width: 150 }} />
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                    <thead>
                        <tr>
                            {COLS.map(c => (
                                <th key={c} style={TH}>
                                    {c === 'Device Name' ? (
                                        <button onClick={() => setSortAsc(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, font: 'inherit', color: 'inherit' }}>
                                            {c}<span style={{ fontSize: 11, color: '#94a3b8' }}>{sortAsc ? '▲' : '▼'}</span>
                                        </button>
                                    ) : c}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : error ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                        ) : filtered.map((r, i) => (
                            <tr key={i}>
                                <td style={TD}>{i + 1}</td>
                                <td style={TD}>{r.deviceName ?? '—'}</td>
                                <td style={TD}>{r.imei ?? '—'}</td>
                                <td style={TD}>{r.model ?? '—'}</td>
                                <td style={TD}>{r.state}</td>
                                <td style={TD}>{fmtTime(r.startTime)}</td>
                                <td style={TD}>{fmtTime(r.endTime)}</td>
                                <td style={TD}>
                                    <a href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>
                                        {r.latitude},{r.longitude}
                                    </a>
                                </td>
                                <td style={TD}>{r.address ?? '—'}</td>
                                <td style={TD}>{formatHMS(r.stayTimeMs)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// Built from Traccar's GET /api/reports/stops, classified Idling vs Parking by looking up each
// stop's starting position attributes.ignition — see TraccarController::classifiedStops.
function Idling() {
    const [devices, setDevices]     = useState([]);
    const [deviceId, setDeviceId]   = useState('');
    const [minDuration, setMinDuration] = useState('');
    const [from, setFrom]           = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]               = useState(() => toLocalInput(new Date()));
    const [rows, setRows]           = useState([]);
    const [sortAsc, setSortAsc]     = useState(true);
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            const res = await api.getIdlingReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load idling report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setMinDuration(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const filtered = (minDuration ? rows.filter(r => r.stayTimeMs >= Number(minDuration) * 60000) : rows)
        .sort((a, b) => {
            const cmp = (a.deviceName ?? '').localeCompare(b.deviceName ?? '');
            return sortAsc ? cmp : -cmp;
        });
    const COLS = ['No.', 'Device Name', 'IMEI', 'Account', 'Model', 'State', 'Start time', 'End Time', 'Coordinates', 'Address', 'Stay time'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <input type="number" value={minDuration} onChange={e => setMinDuration(e.target.value)} placeholder="Min. idle (min)"
                    style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', width: 140 }} />
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
                    <thead>
                        <tr>
                            {COLS.map(c => (
                                <th key={c} style={TH}>
                                    {c === 'Device Name' ? (
                                        <button onClick={() => setSortAsc(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, font: 'inherit', color: 'inherit' }}>
                                            {c}<span style={{ fontSize: 11, color: '#94a3b8' }}>{sortAsc ? '▲' : '▼'}</span>
                                        </button>
                                    ) : c}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : error ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                        ) : filtered.map((r, i) => (
                            <tr key={i}>
                                <td style={TD}>{i + 1}</td>
                                <td style={TD}>{r.deviceName ?? '—'}</td>
                                <td style={TD}>{r.imei ?? '—'}</td>
                                <td style={TD}>{r.account ?? '—'}</td>
                                <td style={TD}>{r.model ?? '—'}</td>
                                <td style={TD}>{r.state}</td>
                                <td style={TD}>{fmtTime(r.startTime)}</td>
                                <td style={TD}>{fmtTime(r.endTime)}</td>
                                <td style={TD}>
                                    <a href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>
                                        {r.latitude},{r.longitude}
                                    </a>
                                </td>
                                <td style={TD}>{r.address ?? '—'}</td>
                                <td style={TD}>{formatHMS(r.stayTimeMs)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// Built from Traccar's ignitionOn/ignitionOff events (GET /api/reports/events), paired into ON/OFF
// periods per device — see TraccarController::ignitionReport. Coordinates/Address are intentionally
// blank, matching the reference UI.
function Ignition() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [sortAsc, setSortAsc]   = useState(true);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            const res = await api.getIgnitionReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load ignition report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const sorted = [...rows].sort((a, b) => {
        const cmp = (a.deviceName ?? '').localeCompare(b.deviceName ?? '');
        return sortAsc ? cmp : -cmp;
    });
    const COLS = ['No.', 'Device Name', 'IMEI', 'Model', 'State', 'Start time', 'End Time', 'Total time', 'Coordinates', 'Address'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                    <thead>
                        <tr>
                            {COLS.map(c => (
                                <th key={c} style={TH}>
                                    {c === 'Device Name' ? (
                                        <button onClick={() => setSortAsc(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, font: 'inherit', color: 'inherit' }}>
                                            {c}<span style={{ fontSize: 11, color: '#94a3b8' }}>{sortAsc ? '▲' : '▼'}</span>
                                        </button>
                                    ) : c}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : error ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                        ) : sorted.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                        ) : sorted.map((r, i) => (
                            <tr key={i}>
                                <td style={TD}>{i + 1}</td>
                                <td style={TD}>{r.deviceName ?? '—'}</td>
                                <td style={TD}>{r.imei ?? '—'}</td>
                                <td style={TD}>{r.model ?? '—'}</td>
                                <td style={TD}>{r.state}</td>
                                <td style={TD}>{fmtTime(r.startTime)}</td>
                                <td style={TD}>{fmtTime(r.endTime)}</td>
                                <td style={TD}>{formatHMS(r.totalTimeMs)}</td>
                                <td style={TD}>-</td>
                                <td style={TD}>-</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// Built from Traccar's geofenceEnter/geofenceExit events (GET /api/reports/events), paired per
// device+geofence into enter/exit periods with a stay duration — see
// TraccarController::geofenceReport.
function GeoFence() {
    const [devices, setDevices]     = useState([]);
    const [geofences, setGeofences] = useState([]);
    const [deviceId, setDeviceId]   = useState('');
    const [geofenceId, setGeofenceId] = useState('');
    const [from, setFrom]           = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]               = useState(() => toLocalInput(new Date()));
    const [rows, setRows]           = useState([]);
    const [sortAsc, setSortAsc]     = useState(true);
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
        api.getGeofences().then(res => setGeofences(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        const gId = 'geofenceId' in overrides ? overrides.geofenceId : geofenceId;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            if (gId) params.geofenceId = gId;
            const res = await api.getGeofenceReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load geofence report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setGeofenceId(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const sorted = [...rows].sort((a, b) => {
        const cmp = (a.deviceName ?? '').localeCompare(b.deviceName ?? '');
        return sortAsc ? cmp : -cmp;
    });
    const COLS = ['No.', 'Device Name', 'IMEI', 'Model', 'Fence Name', 'Enter Time', 'Outer Time', 'Stay Time'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select value={geofenceId} onChange={e => setGeofenceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All geofences</option>
                    {geofences.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                    <thead>
                        <tr>
                            {COLS.map(c => (
                                <th key={c} style={TH}>
                                    {c === 'Device Name' ? (
                                        <button onClick={() => setSortAsc(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, font: 'inherit', color: 'inherit' }}>
                                            {c}<span style={{ fontSize: 11, color: '#94a3b8' }}>{sortAsc ? '▲' : '▼'}</span>
                                        </button>
                                    ) : c}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : error ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                        ) : sorted.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                        ) : sorted.map((r, i) => (
                            <tr key={i}>
                                <td style={TD}>{i + 1}</td>
                                <td style={TD}>{r.deviceName ?? '—'}</td>
                                <td style={TD}>{r.imei ?? '—'}</td>
                                <td style={TD}>{r.model ?? '—'}</td>
                                <td style={TD}>{r.fenceName ?? '—'}</td>
                                <td style={TD}>{fmtTime(r.enterTime)}</td>
                                <td style={TD}>{fmtTime(r.exitTime)}</td>
                                <td style={TD}>{formatHMS(r.stayTimeMs)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  STATE STATISTICS                                              */
/* ══════════════════════════════════════════════════════════════ */
function StateStatistics() {
    return (
        <>
            <FilterBar>
                <DateDeviceFilter showModel showSub />
                <SelInput label="State" type="select" options={['Online','Offline','Moving','Parked','No GPS']} />
            </FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','State','Duration','Start Time','End Time','Location']} rows={[
                [1,'Device 001','123456789012001','Moving','3h 30m','2026-06-18 06:00','2026-06-18 09:30','Makati City'],
                [2,'Device 002','123456789012002','Parked','5h 12m','2026-06-18 02:10','2026-06-18 07:22','Quezon City'],
                [3,'Device 004','123456789012004','Offline','12h 04m','2026-06-17 21:00','2026-06-18 09:04','Pasig City'],
                [4,'Device 008','123456789012008','No GPS','1h 15m','2026-06-18 08:00','2026-06-18 09:15','Caloocan City'],
            ]} />
        </>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  STATE STATISTICS — Offline / Online                           */
/* ══════════════════════════════════════════════════════════════ */
// Built from Traccar's /devices (status, model, phone, lastUpdate) joined with each device's
// latest /positions row (coordinates/address) — see TraccarController::deviceStatusRows(). Online
// and Offline share this same shape, differing only in which status bucket the backend returns and
// whether "Offline Time" is shown.
function DeviceStatusPage({ online }) {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [rows, setRows]         = useState([]);
    const [sortAsc, setSortAsc]   = useState(true);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    const search = async () => {
        setLoading(true);
        setError('');
        try {
            const res = online ? await api.getOnlineDevicesReport() : await api.getOfflineDevicesReport();
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || `Failed to load ${online ? 'online' : 'offline'} devices.`);
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
        search();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => { setDeviceId(''); search(); };

    const filtered = rows.filter(r => !deviceId || String(r.deviceId) === String(deviceId));
    const sorted = [...filtered].sort((a, b) => {
        const cmp = (a.deviceName ?? '').localeCompare(b.deviceName ?? '');
        return sortAsc ? cmp : -cmp;
    });

    const COLS = online
        ? ['No.', 'Device Name', 'IMEI', 'Model', 'SIM', 'Phone', 'Coordinates', 'Alert address']
        : ['No.', 'Device Name', 'IMEI', 'Model', 'SIM', 'Phone', 'Offline Time', 'Coordinates', 'Alert address'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 200 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={search} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                    <thead>
                        <tr>
                            {COLS.map(c => (
                                <th key={c} style={TH}>
                                    {c === 'Device Name' ? (
                                        <button onClick={() => setSortAsc(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, font: 'inherit', color: 'inherit' }}>
                                            {c}<span style={{ fontSize: 11, color: '#94a3b8' }}>{sortAsc ? '▲' : '▼'}</span>
                                        </button>
                                    ) : c}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : error ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                        ) : sorted.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                        ) : sorted.map((r, i) => (
                            <tr key={r.deviceId}>
                                <td style={TD}>{i + 1}</td>
                                <td style={TD}>{r.deviceName ?? '—'}</td>
                                <td style={TD}>{r.imei ?? '—'}</td>
                                <td style={TD}>{r.model ?? '—'}</td>
                                <td style={TD}>{r.sim ?? '—'}</td>
                                <td style={TD}>{r.phone ?? '—'}</td>
                                {!online && <td style={TD}>{fmtTime(r.lastUpdate)}</td>}
                                <td style={TD}>
                                    {r.latitude != null && r.longitude != null ? (
                                        <a href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>
                                            {fmtCoords(r.latitude, r.longitude)}
                                        </a>
                                    ) : '—'}
                                </td>
                                <td style={TD}>{r.address ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

function OfflinePage() {
    return <DeviceStatusPage online={false} />;
}

function OnlinePage() {
    return <DeviceStatusPage online={true} />;
}

/* ══════════════════════════════════════════════════════════════ */
/*  ALERT STATISTICS                                              */
/* ══════════════════════════════════════════════════════════════ */
// Traccar's real event types (GET /api/notifications/types) — events of type "alarm" carry a
// sub-type in their Data column (Position.ALARM_* constants), shown alongside the base type.
const ALERT_TYPE_OPTIONS = [
    ['commandResult', 'Command result'], ['deviceOnline', 'Status online'],
    ['deviceUnknown', 'Status unknown'], ['deviceOffline', 'Status offline'],
    ['deviceInactive', 'Device inactive'], ['queuedCommandSent', 'Queued command sent'],
    ['deviceMoving', 'Device moving'], ['deviceStopped', 'Device stopped'],
    ['deviceOverspeed', 'Speed limit exceeded'], ['deviceFuelDrop', 'Fuel drop'],
    ['deviceFuelIncrease', 'Fuel increase'], ['geofenceEnter', 'Geofence entered'],
    ['geofenceExit', 'Geofence exited'], ['proximityEnter', 'Linked device nearby'],
    ['proximityExit', 'Linked device away'], ['unaccompaniedMotion', 'Unaccompanied motion'],
    ['alarm', 'Alarm'], ['ignitionOn', 'Ignition on'], ['ignitionOff', 'Ignition off'],
    ['maintenance', 'Maintenance required'], ['driverChanged', 'Driver changed'], ['media', 'Media'],
];
const ALERT_TYPE_LABELS = Object.fromEntries(ALERT_TYPE_OPTIONS);
const ALARM_DATA_LABELS = {
    general: 'General', sos: 'SOS', vibration: 'Vibration', movement: 'Movement',
    lowspeed: 'Low Speed', overspeed: 'Overspeed', fallDown: 'Fall Down', lowPower: 'Low Power',
    lowBattery: 'Low Battery', fault: 'Fault', powerOff: 'Power Off', powerOn: 'Power On',
    door: 'Door', lock: 'Lock', unlock: 'Unlock', geofence: 'Geofence', geofenceEnter: 'Geofence Enter',
    geofenceExit: 'Geofence Exit', gpsAntennaCut: 'GPS Antenna Cut', accident: 'Accident', tow: 'Tow',
    idle: 'Idle', hardAcceleration: 'Hard Acceleration', hardBraking: 'Hard Braking',
    hardCornering: 'Hard Cornering', jamming: 'Jamming', temperature: 'Temperature', parking: 'Parking',
    bonnet: 'Bonnet', footBrake: 'Foot Brake', fuelLeak: 'Fuel Leak', tampering: 'Tampering',
    removing: 'Removing',
};
const alertTypeLabel = (type) => ALERT_TYPE_LABELS[type] || humanize(type);
const alarmDataLabel  = (data) => data ? (ALARM_DATA_LABELS[data] || humanize(data)) : '—';
const fmtCoords = (lat, lng) => (lat != null && lng != null) ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : '—';

function exportAlertsCsv(rows) {
    const header = ['No.','Device Name','IMEI','Model','Account','Alert Type','Data','Alert Time','Position Time','Speed (km/h)','Coordinates','Alert address'];
    const lines = [header.join(',')];
    rows.forEach((r, i) => {
        const cells = [
            i + 1, r.deviceName, r.imei, r.model, r.account,
            alertTypeLabel(r.type), alarmDataLabel(r.data), fmtTime(r.eventTime), fmtTime(r.positionTime),
            r.speed, fmtCoords(r.latitude, r.longitude), r.address,
        ];
        lines.push(cells.map(c => `"${String(c ?? '—').replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'alert-details.csv'; a.click();
    URL.revokeObjectURL(url);
}

function AlertDetails() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [type, setType]         = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        const ty  = 'type' in overrides ? overrides.type : type;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            if (ty)  params.type = ty;
            const res = await api.getAlertEvents(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load alert events.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setType(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const COLS = ['No.','Device Name','IMEI','Model','Account','Alert Type','Data','Alert Time','Position Time','Speed (km/h)','Coordinates','Alert address'];

    return (
        <div>
            {/* Filter row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>Alert Time :</span>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select value={type} onChange={e => setType(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                    <option value="">All alert types</option>
                    {ALERT_TYPE_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="5.5" cy="5.5" r="4"/><line x1="9" y1="9" x2="12" y2="12"/></svg>Search
                </button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            {/* Action row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button onClick={() => exportAlertsCsv(rows)} disabled={!rows.length}
                        style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: rows.length ? '#374151' : '#cbd5e1', fontSize: 13, cursor: rows.length ? 'pointer' : 'not-allowed' }}>Export</button>
                </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
                    <thead>
                        <tr>
                            {COLS.map(c => <th key={c} style={TH}>{c}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : error ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                        ) : rows.map((r, i) => (
                            <tr key={r.id}>
                                <td style={TD}>{i + 1}</td>
                                <td style={TD}>{r.deviceName ?? '—'}</td>
                                <td style={TD}>{r.imei ?? '—'}</td>
                                <td style={TD}>{r.model ?? '—'}</td>
                                <td style={TD}>{r.account ?? '—'}</td>
                                <td style={TD}>{alertTypeLabel(r.type)}</td>
                                <td style={TD}>{alarmDataLabel(r.data)}</td>
                                <td style={TD}>{fmtTime(r.eventTime)}</td>
                                <td style={TD}>{fmtTime(r.positionTime)}</td>
                                <td style={TD}>{r.speed ?? '—'}</td>
                                <td style={TD}>{fmtCoords(r.latitude, r.longitude)}</td>
                                <td style={TD}>{r.address ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  PAGE MAP                                                      */
/* ══════════════════════════════════════════════════════════════ */
const PAGES = {
    'Internal Battery':              InternalBattery,
    'External Battery':              ExternalBattery,
    'Fuel Consumption':              FuelConsumption,
    'Current fuel Value':            CurrentFuelValue,
    'Fuel Curve':                    FuelCurve,
    'Refuelling':                    Refuelling,
    'Abnormal Fuel Loss':            AbnormalFuelLoss,
    'Idle Fuel':                     IdleFuel,
    'Fuel Ranking':                  FuelRanking,
    'Temperature & Humidity':        TemperatureHumidity,
    'Driver Behavior':               DriverBehavior,
    'Positioning & Battery':         PositioningBattery,
    'Travel statistics (OBD)':       TravelStatisticsOBD,
    'Track Details':                 TrackDetails,
    'Replay':                        Replay,
    'Mileage':                       Mileage,
    'Trips':                         Trips,
    'Overspeed':                     Overspeed,
    'Parking':                       Parking,
    'Idling':                        Idling,
    'Ignition':                      Ignition,
    'Geo Fence':                     GeoFence,
    'State Statistics':              StateStatistics,
    'Offline':                       OfflinePage,
    'Online':                        OnlinePage,
    'Alert Details':                 AlertDetails,
};

/* ══════════════════════════════════════════════════════════════ */
/*  ROOT EXPORT                                                   */
/* ══════════════════════════════════════════════════════════════ */
export default function ReportPage({ reportSection }) {
    const Content = PAGES[reportSection] || (() => (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 14 }}>Select a report from the sidebar.</div>
    ));

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
            {/* Header */}
            <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>{reportSection || 'Report'}</h2>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                <Content />
            </div>
        </div>
    );
}
