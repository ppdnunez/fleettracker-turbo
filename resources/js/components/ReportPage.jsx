/* ── ReportPage.jsx ─────────────────────────────────────────── */
import { useState, useEffect, useRef, Fragment } from 'react';
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

const BATTERY_STATUS_COLOR = { NORMAL: '#16a34a', LOW: '#f59e0b', CRITICAL: '#ef4444' };

// TurboHive has no historical battery-report endpoint. Battery is only available live, by
// sending the "status#" query command to a device (see TurboHiveService::getBatteryStatus,
// GET /api/turbohive/device/{imei}/battery). This queries devices on demand rather than
// showing a date-range history.
function InternalBattery() {
    const [devices, setDevices]     = useState([]);
    const [readings, setReadings]   = useState({}); // imei -> { voltage, status, raw, checkedAt, loading, error }
    const [loadingList, setLoadingList] = useState(false);
    const [checkingAll, setCheckingAll] = useState(false);

    const loadDevices = () => {
        setLoadingList(true);
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]))
            .finally(() => setLoadingList(false));
    };

    useEffect(() => { loadDevices(); }, []);

    const checkDevice = async (imei) => {
        setReadings(prev => ({ ...prev, [imei]: { ...prev[imei], loading: true, error: null } }));
        try {
            const res = await api.getTurboHiveBatteryStatus(imei);
            setReadings(prev => ({ ...prev, [imei]: { ...res.data, loading: false } }));
        } catch (e) {
            setReadings(prev => ({ ...prev, [imei]: { loading: false, error: e.response?.data?.message || 'Failed to query battery.' } }));
        }
    };

    const checkAll = async () => {
        setCheckingAll(true);
        for (const d of devices) {
            await checkDevice(d.imei); // sequential — each is a live round-trip to the device
        }
        setCheckingAll(false);
    };

    const COLS = ['No.', 'Device name', 'IMEI', 'Battery', 'Status', 'Last checked', 'Action'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <button onClick={checkAll} disabled={checkingAll || devices.length === 0}
                    style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: checkingAll ? 'default' : 'pointer', opacity: checkingAll ? 0.6 : 1 }}>
                    {checkingAll ? 'Checking…' : 'Check All'}
                </button>
                <button onClick={loadDevices} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Refresh devices</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loadingList ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : devices.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No devices</td></tr>
                    ) : devices.map((d, i) => {
                        const r = readings[d.imei] || {};
                        return (
                            <tr key={d.imei}>
                                <td style={TD}>{i + 1}</td>
                                <td style={TD}>{d.deviceName ?? '—'}</td>
                                <td style={TD}>{d.imei}</td>
                                <td style={TD}>{r.voltage != null ? `${r.voltage}V` : '—'}</td>
                                <td style={{ ...TD, color: BATTERY_STATUS_COLOR[r.status] || '#374151', fontWeight: 600 }}>
                                    {r.error ? <span style={{ color: '#ef4444', fontWeight: 400 }}>{r.error}</span> : (r.status ?? '—')}
                                </td>
                                <td style={TD}>{fmtTime(r.checkedAt)}</td>
                                <td style={TD}>
                                    <button onClick={() => checkDevice(d.imei)} disabled={r.loading}
                                        style={{ padding: '5px 12px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, cursor: r.loading ? 'default' : 'pointer', opacity: r.loading ? 0.6 : 1 }}>
                                        {r.loading ? 'Checking…' : 'Check'}
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </>
    );
}

// Built from TurboHive's GET /v3/obd — device time-series OBD telemetry (max 30-day range per
// query). `batteryVoltage` (mV) is the vehicle's external power-supply voltage, as opposed to the
// internal device battery reported via the Internal Battery report (status# command).
// See TurboHiveService::getObdData.
function ExternalBattery() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => {
                const list = res.data?.data ?? [];
                setDevices(list);
                if (list.length) setDeviceId(list[0].imei);
            })
            .catch(() => setDevices([]));
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const imei = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        if (!imei) { setRows([]); return; }
        setLoading(true);
        setError('');
        try {
            const startTime = new Date(f).getTime();
            const endTime   = new Date(t).getTime();
            const res = await api.getTurboHiveObdData(imei, startTime, endTime, 100);
            if (res.data?.error) {
                setError(res.data.error);
                setRows([]);
            } else {
                setRows(res.data?.obdData ?? []);
            }
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load OBD data.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (deviceId) search(); }, [deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const COLS = ['No.', 'Time', 'External Battery (V)', 'Vehicle Speed (km/h)', 'ACC', 'Odometer (km)'];

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
                    {devices.length === 0 && <option value="">No devices</option>}
                    {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <Notice color="#dbeafe" icon="ℹ" text="External battery is the vehicle's power-supply voltage, read from the OBD port (max 30-day range per query)." />
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
                            <td style={TD}>{fmtTime(r.gateTime ?? r.deviceTime)}</td>
                            <td style={TD}>{r.batteryVoltage != null ? (r.batteryVoltage / 1000).toFixed(2) : '—'}</td>
                            <td style={TD}>{r.vehicleSpeed ?? '—'}</td>
                            <td style={TD}>{r.accStatus === 1 ? 'ON' : r.accStatus === 0 ? 'OFF' : '—'}</td>
                            <td style={TD}>{r.odometer ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// Built from TurboHive's GET /v3/obd (OBD telemetry, max 30-day range per query), same first/last
// point delta over the range for all three methods below — only what's derived from the delta
// differs:
//  - "OBD Totalizer" (original method): Fuel Used is the delta of the device's own cumulative
//    totalFuelConsumption reading. Most accurate when the device reports it, but not every
//    OBD harness does.
//  - "Fuel Rate": Fuel Used = distance × a per-vehicle L/100km rate (VehicleSetting.fuel_rate_l_per_100km,
//    set via Vehicle > Vehicle Settings) — an estimate for vehicles whose OBD doesn't report a
//    totalizer, using only the (near-universal) odometer field.
//  - "Fuel Sensor": Fuel Used = the drop in OBD/sensor fuel-level percentage (obdFuelLevel, same
//    best-effort field names as Fuel Curve/Refuelling) converted to liters via a per-vehicle tank
//    capacity (VehicleSetting.fuel_tank_capacity_liters). A rise (refuel) or missing tank capacity
//    shows as "—" rather than a negative/nonsensical number.
// See TurboHiveService::getObdData (shared with the External Battery report) and
// VehicleSettingController for the per-vehicle inputs.
const FUEL_CONSUMPTION_METHODS = [
    { id: 'totalizer', label: 'OBD Totalizer' },
    { id: 'rate',      label: 'Fuel Rate' },
    { id: 'sensor',    label: 'Fuel Sensor' },
];

function FuelConsumption() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [method, setMethod]     = useState('totalizer');
    const [vehicleSetting, setVehicleSetting] = useState(null);
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    useEffect(() => {
        if (!deviceId) { setVehicleSetting(null); return; }
        api.getVehicleSetting(deviceId).then(res => setVehicleSetting(res.data)).catch(() => setVehicleSetting(null));
    }, [deviceId]);

    const search = async () => {
        if (!deviceId) { setError('Select a device.'); return; }
        setError('');
        setLoading(true);
        try {
            const points = await loadObdPoints(deviceId, from, to, 100);
            if (points.length === 0) {
                setRows([]);
            } else {
                const first = points[0], last = points[points.length - 1];
                const distanceKm = (first.odometer != null && last.odometer != null) ? +(last.odometer - first.odometer).toFixed(2) : null;
                const row = { startTime: first.gateTime, endTime: last.gateTime, distanceKm, points: points.length };

                if (method === 'totalizer') {
                    row.fuelUsed = (first.totalFuelConsumption != null && last.totalFuelConsumption != null)
                        ? +(last.totalFuelConsumption - first.totalFuelConsumption).toFixed(2) : null;
                    row.avgConsumption = (row.fuelUsed != null && distanceKm > 0) ? +((row.fuelUsed / distanceKm) * 100).toFixed(2) : null;
                } else if (method === 'rate') {
                    row.fuelRate = vehicleSetting?.fuel_rate_l_per_100km ?? null;
                    row.fuelUsed = (row.fuelRate != null && distanceKm != null) ? +((distanceKm * row.fuelRate) / 100).toFixed(2) : null;
                } else {
                    const startPct = obdFuelLevel(first);
                    const endPct = obdFuelLevel(last);
                    row.startPct = startPct;
                    row.endPct = endPct;
                    const usedPct = (startPct != null && endPct != null) ? +(startPct - endPct).toFixed(2) : null;
                    row.usedPct = usedPct != null && usedPct > 0 ? usedPct : null;
                    row.tankCapacity = vehicleSetting?.fuel_tank_capacity_liters ?? null;
                    row.fuelUsed = (row.usedPct != null && row.tankCapacity != null) ? +((row.usedPct / 100) * row.tankCapacity).toFixed(2) : null;
                }

                setRows([row]);
            }
        } catch (e) {
            setError(e.message || e.response?.data?.message || 'Failed to load fuel consumption report.');
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

    const selectedDevice = devices.find(d => d.imei === deviceId);

    const COLS = method === 'totalizer'
        ? ['No.', 'Device Name', 'IMEI', 'Start Time', 'End Time', 'Distance (km)', 'Fuel Used (L)', 'Avg Consumption (L/100km)', 'Data Points']
        : method === 'rate'
        ? ['No.', 'Device Name', 'IMEI', 'Start Time', 'End Time', 'Distance (km)', 'Fuel Rate (L/100km)', 'Est. Fuel Used (L)', 'Data Points']
        : ['No.', 'Device Name', 'IMEI', 'Start Time', 'End Time', 'Start Level (%)', 'End Level (%)', 'Tank Capacity (L)', 'Est. Fuel Used (L)', 'Data Points'];

    const notice = method === 'totalizer'
        ? 'Only OBD-capable devices report a fuel totalizer. Fuel Used / Distance are the delta between the first and last reading (max 30-day range per query).'
        : method === 'rate'
        ? 'Estimated from distance travelled (OBD odometer) × this vehicle\'s configured Fuel Rate — set it under Vehicle > Vehicle Settings. Useful when a device reports odometer but not a fuel totalizer.'
        : 'Estimated from the drop in OBD/sensor fuel-level percentage × this vehicle\'s Tank Capacity — set it under Vehicle > Vehicle Settings. A refuel (level rose) or missing tank capacity shows as "—".';

    const missingSetting = method === 'rate' && deviceId && vehicleSetting && vehicleSetting.fuel_rate_l_per_100km == null;
    const missingTank = method === 'sensor' && deviceId && vehicleSetting && vehicleSetting.fuel_tank_capacity_liters == null;

    return (
        <>
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                {FUEL_CONSUMPTION_METHODS.map(m => (
                    <button key={m.id} onClick={() => { setMethod(m.id); setRows([]); }}
                        style={{
                            padding: '6px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                            border: method === m.id ? '1.5px solid #3b82f6' : '1px solid #d1d5db',
                            background: method === m.id ? '#eff6ff' : '#fff',
                            color: method === m.id ? '#1d4ed8' : '#374151',
                        }}>
                        {m.label}
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">Select device</option>
                    {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
                </select>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <button onClick={search} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <Notice color="#dbeafe" icon="ℹ" text={notice} />
            {missingSetting && <Notice color="#fef3c7" icon="⚠" text="This vehicle has no Fuel Rate configured yet — Est. Fuel Used will show as “—” until one is set." />}
            {missingTank && <Notice color="#fef3c7" icon="⚠" text="This vehicle has no Tank Capacity configured yet — Est. Fuel Used will show as “—” until one is set." />}
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
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
                            <td style={TD}>{selectedDevice?.deviceName ?? deviceId}</td>
                            <td style={TD}>{deviceId}</td>
                            <td style={TD}>{fmtTime(r.startTime)}</td>
                            <td style={TD}>{fmtTime(r.endTime)}</td>
                            {method === 'totalizer' && <>
                                <td style={TD}>{r.distanceKm ?? '—'}</td>
                                <td style={TD}>{r.fuelUsed ?? '—'}</td>
                                <td style={TD}>{r.avgConsumption ?? '—'}</td>
                            </>}
                            {method === 'rate' && <>
                                <td style={TD}>{r.distanceKm ?? '—'}</td>
                                <td style={TD}>{r.fuelRate ?? '—'}</td>
                                <td style={TD}>{r.fuelUsed ?? '—'}</td>
                            </>}
                            {method === 'sensor' && <>
                                <td style={TD}>{r.startPct ?? '—'}</td>
                                <td style={TD}>{r.endPct ?? '—'}</td>
                                <td style={TD}>{r.tankCapacity ?? '—'}</td>
                                <td style={TD}>{r.fuelUsed ?? '—'}</td>
                            </>}
                            <td style={TD}>{r.points}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// Purely live — TurboHive pushes OBD/sensor readings (fuel level, etc.) over a dedicated MQTT
// topic ({userId}/sensor/{imei}), separate from the location/gnss topic. mqtt:worker subscribes
// to it and broadcasts DeviceSensorUpdated on the same 'fleet' Reverb channel used for positions
// (see app/Console/Commands/MqttWorker.php, app/Events/DeviceSensorUpdated.php). Field names
// aren't documented by TurboHive, so extraction is best-effort (fuelLevel/fuel_level/fuel and a
// couple of nested/dotted variants) — a device shows "Waiting for live reading…" until its first
// sensor.updated message arrives after this page loads; there's no historical/REST fallback here.
function CurrentFuelValue() {
    const [devices, setDevices]   = useState([]);
    const [readings, setReadings] = useState({}); // imei -> { fuelLevel, voltage, timestamp, raw }
    const [loading, setLoading]   = useState(true);
    const [mqttConnected, setMqttConnected] = useState(false);

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!window.Echo) return;
        const channel = window.Echo.channel('fleet');
        channel.listen('.sensor.updated', (data) => {
            setMqttConnected(true);
            setReadings(r => ({ ...r, [data.imei]: data }));
        });
        channel.error(() => setMqttConnected(false));

        // The 'fleet' channel is shared with other pages (Dashboard, etc.), so it may already be
        // subscribed by the time this component mounts — channel.subscribed()'s callback binds to
        // the one-time "subscription_succeeded" event, which would already have fired and never
        // reach a listener attached this late. Read the underlying socket state directly instead.
        const pusher = window.Echo.connector?.pusher;
        if (pusher) {
            const syncState = () => setMqttConnected(pusher.connection.state === 'connected');
            syncState();
            pusher.connection.bind('state_change', syncState);
            return () => {
                pusher.connection.unbind('state_change', syncState);
                window.Echo.leaveChannel('fleet');
            };
        }
        return () => { window.Echo.leaveChannel('fleet'); setMqttConnected(false); };
    }, []);

    const COLS = ['No.', 'Device name', 'IMEI', 'Fuel Level', 'Voltage', 'Last Updated'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: '#fff', background: mqttConnected ? '#16a34a' : '#94a3b8' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                    MQTT {mqttConnected ? 'Live' : 'Connecting…'}
                </span>
            </div>
            <Notice color="#dbeafe" icon="ℹ" text="Live only — pushed from TurboHive's MQTT sensor topic. A device shows a reading only after it reports at least once while this page is open." />
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : devices.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No devices</td></tr>
                    ) : devices.map((d, i) => {
                        const r = readings[d.imei];
                        return (
                            <tr key={d.imei}>
                                <td style={TD}>{i + 1}</td>
                                <td style={TD}>{d.deviceName ?? '—'}</td>
                                <td style={TD}>{d.imei}</td>
                                <td style={TD}>{r?.fuelLevel != null ? `${r.fuelLevel}%` : <span style={{ color: '#94a3b8' }}>Waiting for live reading…</span>}</td>
                                <td style={TD}>{r?.voltage != null ? `${r.voltage}V` : '—'}</td>
                                <td style={TD}>{r ? fmtTime(r.timestamp) : '—'}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  FUEL MANAGEMENT (Fleet) — Fuel Curve / Refuelling / Idle / Abnormal Loss / Ranking */
/* ══════════════════════════════════════════════════════════════ */
// Shared by every report below: fetches a device's OBD telemetry for a date range (max 30 days,
// max 100 readings per query — same TurboHive limits Fuel Consumption/Travel Statistics (OBD) hit),
// sorted ascending by time. See TurboHiveService::getObdData.
async function loadObdPoints(imei, fromLocal, toLocal, pageSize = 100) {
    const startTime = new Date(fromLocal).getTime();
    const endTime   = new Date(toLocal).getTime();
    const res = await api.getTurboHiveObdData(imei, startTime, endTime, pageSize);
    if (res.data?.error) throw new Error(res.data.error);
    return [...(res.data?.obdData ?? [])].sort((a, b) => (a.gateTime ?? 0) - (b.gateTime ?? 0));
}

// TurboHive's /v3/obd response documents odometer/totalFuelConsumption/vehicleSpeed (confirmed via
// Fuel Consumption/Travel Statistics (OBD)) but not an instantaneous tank-level percentage field —
// Fuel Curve/Refuelling/Abnormal Loss below inherently need one (totalFuelConsumption is a
// monotonic totalizer that can't show a refuel or a level drop), so this tries the same best-effort
// fallback names DeviceSensorUpdated.php already guesses for the MQTT sensor feed.
function obdFuelLevel(p) {
    return p.fuelLevel ?? p.fuel_level ?? p.fuelPercent ?? p.fuel ?? null;
}

// Single-line sparkline, same hand-rolled approach as TempHumidityChart below (no chart dependency
// in this project), plotted from the same rows the table renders.
function FuelCurveChart({ rows }) {
    const pts = rows.filter(r => r.percent != null);
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

// Built from TurboHive's GET /v3/obd (see loadObdPoints above), plotting each reading's fuel-level
// percentage chronologically. Distinct from Fuel Consumption, which only returns one summary total
// per device for the whole period.
function FuelCurve() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    const search = async () => {
        if (!deviceId) { setError('Select a device.'); return; }
        setError('');
        setLoading(true);
        try {
            const points = await loadObdPoints(deviceId, from, to);
            setRows(points.map(p => ({ time: p.gateTime, percent: obdFuelLevel(p) })));
        } catch (e) {
            setError(e.message || e.response?.data?.message || 'Failed to load fuel curve.');
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

    const selectedDevice = devices.find(d => d.imei === deviceId);
    const COLS = ['No.','Device name','IMEI','Fuel Level (%)','Record Time'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">Select device</option>
                    {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
                </select>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <button onClick={search} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <Notice color="#dbeafe" icon="ℹ" text="Only OBD-capable devices reporting a fuel-level reading show data here (max 30-day range, up to 100 readings per query)." />
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
                            <td style={TD}>{selectedDevice?.deviceName ?? deviceId}</td>
                            <td style={TD}>{deviceId}</td>
                            <td style={TD}>{r.percent != null ? `${r.percent}%` : '—'}</td>
                            <td style={TD}>{fmtTime(r.time)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// Shared by Refuelling and Abnormal Loss — both scan consecutive OBD readings (see loadObdPoints)
// for a level jump past a threshold, differing only in direction/threshold/labels. Amount in liters
// can't be shown (TurboHive doesn't expose tank capacity), so only the percentage change is reported.
function FuelEventReport({ detect, eventLabel, noticeText }) {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    const search = async () => {
        if (!deviceId) { setError('Select a device.'); return; }
        setError('');
        setLoading(true);
        try {
            const points = await loadObdPoints(deviceId, from, to);
            const events = [];
            for (let i = 1; i < points.length; i++) {
                const event = detect(points[i - 1], points[i]);
                if (event) events.push(event);
            }
            setRows(events);
        } catch (e) {
            setError(e.message || e.response?.data?.message || `Failed to load ${eventLabel.toLowerCase()} report.`);
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

    const selectedDevice = devices.find(d => d.imei === deviceId);
    const COLS = ['No.','Device name','IMEI','From (%)','To (%)','Change (%)','Time'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">Select device</option>
                    {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
                </select>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <button onClick={search} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            {noticeText && <Notice color="#dbeafe" icon="ℹ" text={noticeText} />}
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
                            <td style={TD}>{selectedDevice?.deviceName ?? deviceId}</td>
                            <td style={TD}>{deviceId}</td>
                            <td style={TD}>{r.fromPercent}%</td>
                            <td style={TD}>{r.toPercent}%</td>
                            <td style={TD}>{r.changePercent > 0 ? '+' : ''}{r.changePercent}%</td>
                            <td style={TD}>{fmtTime(r.time)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

const REFUEL_RISE_THRESHOLD = 5;   // percentage points between two consecutive readings
const ABNORMAL_DROP_THRESHOLD = 8; // percentage points
const ABNORMAL_DROP_MAX_KM = 1;    // "almost no distance travelled" cutoff

function Refuelling() {
    const detect = (prev, curr) => {
        const from = obdFuelLevel(prev), to = obdFuelLevel(curr);
        if (from == null || to == null) return null;
        const change = +(to - from).toFixed(1);
        return change >= REFUEL_RISE_THRESHOLD
            ? { fromPercent: from, toPercent: to, changePercent: change, time: curr.gateTime }
            : null;
    };
    return <FuelEventReport detect={detect} eventLabel="Refuelling"
        noticeText={`A level rise of at least ${REFUEL_RISE_THRESHOLD}% between two consecutive OBD readings is treated as a refuel.`} />;
}

function AbnormalFuelLoss() {
    const detect = (prev, curr) => {
        const from = obdFuelLevel(prev), to = obdFuelLevel(curr);
        if (from == null || to == null) return null;
        const change = +(to - from).toFixed(1);
        const distanceKm = (prev.odometer != null && curr.odometer != null) ? curr.odometer - prev.odometer : null;
        return (change <= -ABNORMAL_DROP_THRESHOLD && distanceKm != null && distanceKm <= ABNORMAL_DROP_MAX_KM)
            ? { fromPercent: from, toPercent: to, changePercent: change, time: curr.gateTime }
            : null;
    };
    return <FuelEventReport detect={detect} eventLabel="Abnormal Loss"
        noticeText={`A level drop of at least ${ABNORMAL_DROP_THRESHOLD}% with under ${ABNORMAL_DROP_MAX_KM}km travelled between two consecutive OBD readings is flagged as an abnormal loss (leak/siphon), distinct from normal consumption while driving.`} />;
}

// Sums fuel burned (via the confirmed totalFuelConsumption totalizer) across contiguous runs of
// near-zero-speed OBD readings — same IDLE_SPEED_KMH threshold Parking/Idling/Ignition use on the
// GNSS track, applied here to OBD's vehicleSpeed field instead.
function IdleFuel() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    const search = async () => {
        if (!deviceId) { setError('Select a device.'); return; }
        setError('');
        setLoading(true);
        try {
            const points = await loadObdPoints(deviceId, from, to);
            const idleRuns = [];
            let run = [];
            const flush = () => {
                if (run.length >= 2) {
                    const first = run[0], last = run[run.length - 1];
                    const fuelUsed = (first.totalFuelConsumption != null && last.totalFuelConsumption != null)
                        ? +(last.totalFuelConsumption - first.totalFuelConsumption).toFixed(2) : null;
                    idleRuns.push({ startTime: first.gateTime, endTime: last.gateTime, idleDurationMs: last.gateTime - first.gateTime, fuelUsed });
                }
                run = [];
            };
            for (const p of points) {
                const speed = p.vehicleSpeed ?? p.speed ?? 0;
                if (speed <= IDLE_SPEED_KMH) run.push(p); else flush();
            }
            flush();
            setRows(idleRuns);
        } catch (e) {
            setError(e.message || e.response?.data?.message || 'Failed to load idle fuel report.');
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

    const selectedDevice = devices.find(d => d.imei === deviceId);
    const COLS = ['No.','Device name','IMEI','Start time','End Time','Idle Duration','Fuel Used (L)'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">Select device</option>
                    {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
                </select>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <button onClick={search} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
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
                            <td style={TD}>{selectedDevice?.deviceName ?? deviceId}</td>
                            <td style={TD}>{deviceId}</td>
                            <td style={TD}>{fmtTime(r.startTime)}</td>
                            <td style={TD}>{fmtTime(r.endTime)}</td>
                            <td style={TD}>{formatHMS(r.idleDurationMs)}</td>
                            <td style={TD}>{r.fuelUsed ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// Shared by Ranking and Tonne-Kilometre Fuel Analytics below — computes each device's fuel
// efficiency for the period from its first/last OBD reading (same delta approach as Fuel
// Consumption), run once per device since /v3/obd is per-imei only. Tonne-km assumes a uniform 1
// tonne per vehicle since TurboHive exposes no cargo-weight attribute the way Traccar's
// attributes.cargoTonnes did.
async function computeFuelEfficiencyRows(devices, from, to) {
    const results = await Promise.all(devices.map(async (d) => {
        try {
            const points = await loadObdPoints(d.imei, from, to);
            if (points.length < 2) return null;
            const first = points[0], last = points[points.length - 1];
            const distanceKm = (first.odometer != null && last.odometer != null) ? +(last.odometer - first.odometer).toFixed(2) : null;
            const fuelUsed = (first.totalFuelConsumption != null && last.totalFuelConsumption != null) ? +(last.totalFuelConsumption - first.totalFuelConsumption).toFixed(2) : null;
            if (distanceKm == null || fuelUsed == null || distanceKm <= 0) return null;
            const fuelPer100km = +((fuelUsed / distanceKm) * 100).toFixed(2);
            const tonneKm = distanceKm; // assumes 1 tonne per vehicle
            return { imei: d.imei, deviceName: d.deviceName, distanceKm, fuelUsed, fuelPer100km, tonneKm, fuelPerTonneKm: +(fuelUsed / tonneKm).toFixed(3) };
        } catch {
            return null;
        }
    }));
    return results.filter(Boolean);
}

// Ranks vehicles best (lowest L/100km) to worst. TurboHive has no driver/route assignment data
// (unlike Traccar, which this report used to also rank by), so this dimension is vehicle-only now
// — see Tonne-Kilometre Fuel Analytics below for the cargo-weighted efficiency view.
function FuelRanking() {
    const [devices, setDevices]   = useState([]);
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        setLoading(true);
        setError('');
        try {
            const results = await computeFuelEfficiencyRows(devices, f, t);
            setRows(results.sort((a, b) => a.fuelPer100km - b.fuelPer100km));
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load fuel ranking.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (devices.length) search(); }, [devices]); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        search({ from: toLocalInput(d), to: toLocalInput(new Date()) });
    };

    const COLS = ['No.','Device name','IMEI','Distance (km)','Fuel Used (L)','L/100km','Tonne-km','L/Tonne-km'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <Notice color="#dbeafe" icon="ℹ" text="Ranked best (lowest L/100km) to worst, across every OBD-capable device. TurboHive has no driver/route assignment data, so ranking is vehicle-only." />
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
                        <tr key={r.imei}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei}</td>
                            <td style={TD}>{r.distanceKm}</td>
                            <td style={TD}>{r.fuelUsed}</td>
                            <td style={TD}>{r.fuelPer100km}</td>
                            <td style={TD}>{r.tonneKm}</td>
                            <td style={TD}>{r.fuelPerTonneKm}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// New sub-module: tonne-kilometre fuel analytics, called out as its own item in the Fuel
// Management spec (alongside fuel curve/refuelling/idle fuel/abnormal loss/ranking) but previously
// only surfaced as extra columns on Ranking. Same underlying per-device computation, but ranked and
// framed around L/Tonne-km specifically — the fuel cost of moving a tonne of cargo one kilometre.
function TonneKmAnalytics() {
    const [devices, setDevices]   = useState([]);
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        setLoading(true);
        setError('');
        try {
            const results = await computeFuelEfficiencyRows(devices, f, t);
            setRows(results.sort((a, b) => a.fuelPerTonneKm - b.fuelPerTonneKm));
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load tonne-km fuel analytics.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (devices.length) search(); }, [devices]); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        search({ from: toLocalInput(d), to: toLocalInput(new Date()) });
    };

    const totalTonneKm = rows.reduce((sum, r) => sum + r.tonneKm, 0);
    const totalFuel = rows.reduce((sum, r) => sum + r.fuelUsed, 0);
    const COLS = ['No.','Device name','IMEI','Distance (km)','Tonne-km','Fuel Used (L)','L/Tonne-km'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <Notice color="#dbeafe" icon="ℹ" text="TurboHive exposes no cargo-weight attribute, so Tonne-km assumes a uniform 1 tonne per vehicle — treat L/Tonne-km as relative between vehicles here, not an absolute figure. Ranked best (lowest L/Tonne-km) to worst." />
            {rows.length > 0 && (
                <p style={{ fontSize: 13, color: '#374151', margin: '0 0 10px' }}>
                    <strong>Fleet total:</strong> {totalTonneKm.toFixed(2)} tonne-km &nbsp;·&nbsp; {totalFuel.toFixed(2)} L used
                    &nbsp;·&nbsp; {totalTonneKm > 0 ? (totalFuel / totalTonneKm).toFixed(3) : '—'} L/Tonne-km overall
                </p>
            )}
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
                        <tr key={r.imei}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei}</td>
                            <td style={TD}>{r.distanceKm}</td>
                            <td style={TD}>{r.tonneKm}</td>
                            <td style={TD}>{r.fuelUsed}</td>
                            <td style={TD}>{r.fuelPerTonneKm}</td>
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

// Purely live — TurboHive pushes temperature/humidity probe readings over the same MQTT
// sensor/OBD topics used for fuel level (see DeviceSensorUpdated::broadcastWith). mqtt:worker
// subscribes and broadcasts sensor.updated on the shared 'fleet' Reverb channel. TurboHive has no
// historical REST endpoint for this, so — same as Current Fuel Value — this is live-only; a
// device shows a reading only after it reports at least once while this page is open. Selecting
// a single device charts its readings as they arrive (rolling 50-point buffer, resets on switch).
function TemperatureHumidity() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [readings, setReadings] = useState({}); // imei -> { temperature, humidity, timestamp, raw }
    const [history, setHistory]   = useState([]); // newest-first rolling buffer for the selected device's chart
    const [loading, setLoading]   = useState(true);
    const [mqttConnected, setMqttConnected] = useState(false);

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { setHistory([]); }, [deviceId]);

    useEffect(() => {
        if (!window.Echo) return;
        const channel = window.Echo.channel('fleet');
        channel.listen('.sensor.updated', (data) => {
            setMqttConnected(true);
            setReadings(r => ({ ...r, [data.imei]: data }));
            if (data.imei === deviceId && (data.temperature != null || data.humidity != null)) {
                setHistory(h => [{ temperature: data.temperature, humidity: data.humidity, recordTime: data.timestamp }, ...h].slice(0, 50));
            }
        });
        channel.error(() => setMqttConnected(false));

        // The 'fleet' channel is shared with other pages, so it may already be subscribed by the
        // time this component mounts — read the underlying socket state directly rather than
        // relying on the one-time "subscription_succeeded" event (see Current Fuel Value).
        const pusher = window.Echo.connector?.pusher;
        if (pusher) {
            const syncState = () => setMqttConnected(pusher.connection.state === 'connected');
            syncState();
            pusher.connection.bind('state_change', syncState);
            return () => {
                pusher.connection.unbind('state_change', syncState);
                window.Echo.leaveChannel('fleet');
            };
        }
        return () => { window.Echo.leaveChannel('fleet'); setMqttConnected(false); };
    }, [deviceId]);

    const COLS = ['No.', 'Device name', 'IMEI', 'Temperature (°C)', 'Humidity (%)', 'Last Updated'];
    const rows = deviceId ? devices.filter(d => d.imei === deviceId) : devices;

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
                </select>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: '#fff', background: mqttConnected ? '#16a34a' : '#94a3b8' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                    MQTT {mqttConnected ? 'Live' : 'Connecting…'}
                </span>
            </div>
            <Notice color="#dbeafe" icon="ℹ" text="Live only — pushed from TurboHive's MQTT sensor topic. A device shows a reading only after it reports at least once while this page is open. Select a single device to see its live chart." />
            {deviceId && <TempHumidityChart rows={history} />}
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : rows.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No devices</td></tr>
                    ) : rows.map((d, i) => {
                        const r = readings[d.imei];
                        return (
                            <tr key={d.imei}>
                                <td style={TD}>{i + 1}</td>
                                <td style={TD}>{d.deviceName ?? '—'}</td>
                                <td style={TD}>{d.imei}</td>
                                <td style={TD}>{r?.temperature != null ? `${r.temperature}°C` : <span style={{ color: '#94a3b8' }}>Waiting for live reading…</span>}</td>
                                <td style={TD}>{r?.humidity != null ? `${r.humidity}%` : '—'}</td>
                                <td style={TD}>{r ? fmtTime(r.timestamp) : '—'}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </>
    );
}

// TurboHive's full alert.name catalog (every alert type the platform can fire, across GNSS/power/
// door/fuel/DMS/ADAS/security categories — not just driving-behavior ones). Used to populate the
// Alert Type filter with exact, authoritative names instead of guessing keywords, since alert.name
// is what TurboHiveService::getAlerts and DeviceAlertReceived::broadcastWith both expose as `name`.
const ALERT_TYPE_NAMES = [
    'SD Card Fault', 'DMS Camera Communication Abnormality', 'Driver Eyes Closed', 'Face Recognition Succeeded',
    'Face Recognition Failed', 'Face Data Uploaded', 'Geofence Entry', 'Geofence Exit', 'GNSS Dead Zone Entry',
    'GNSS Dead Zone Exit', 'First Fix', 'Route In/Out', 'Road Section Time Issue', 'Route Deviation',
    'External GNSS Antenna Disconnected', 'GNSS Module Failure', 'GNSS Antenna Disconnected', 'GNSS Antenna Short',
    'GNSS Module Error', 'UBI GNSS Chip Error', 'Geofence Speeding', 'Long Time To Fix', 'Device Normal',
    'External Power Off', 'Device Power On', 'External Power Undervoltage', 'Low Power Protection', 'Manual Shutdown',
    'Airplane Mode', 'Device Removed', 'Low Power Shutdown', 'Cover Opened', 'Internal Battery Undervoltage',
    'About To Sleep', 'Device Plugged Out', 'Device Plugged In', 'Land Transport Mode', 'Water Transport Mode',
    'Stationary Mode', 'Deep Sleep', 'Cover Or Collision', 'Light Detected', 'Active Offline', 'Device Locked',
    'Device Unlocked', 'Unexpected Unlock', 'Unlock Failed', 'Out Of Range', 'Stationary Too Long',
    'Battery Fully Charged', 'Battery Error', 'Battery Temperature High', 'Battery Charging Started',
    'Battery Charging Stopped', 'Battery Almost Full', 'Battery Charge Complete', 'External Voltage High',
    'Voltage Exception', 'Device Signed In', 'Device Signed Out', 'Device Installed', 'Temperature Rising',
    'Temperature Dropping', 'Device Restarted', 'Device Tilted', 'Device Muted', 'Fuel Power Reconnected',
    'Fuel Power Cut Off', 'Engine Failure', 'Vehicle Battery Undervoltage', 'Long Parking', 'High Water Temperature',
    'Ignition On', 'Ignition Off', 'VSS Failure', 'Illegal Ignition', 'Engine On', 'Speed Normal',
    'ADC1 Voltage High', 'ADC1 Voltage Low', 'ADC1 Voltage Rising', 'ADC1 Voltage Dropping', 'Live Wire Exception',
    'Door Status Abnormal', 'Door Opened', 'Door Closed', 'Low Fuel', 'Fuel Level Abnormal', 'Fuel Level Increased',
    'Fuel Level Dropped', 'Exit Transport Mode', 'Idling Too Long', 'Illegal Door Opening', 'Mirror Vibration',
    'Truck Opened', 'Emergency SOS', 'Fall Down', 'Body Temperature Abnormal', 'Danger Warning',
    'Unexpected Vibration', 'Unexpected Movement', 'Collision', 'Rollover', 'Stability Exception',
    'Attitude Exception', 'Airbag Deployed', 'Vehicle May Be Stolen', 'Unexpected Start', 'Unexpected Towing',
    'Suspected Fuel Theft', 'Vehicle Stolen', 'Vehicle Finding', 'SIM Changed', 'SD Card Inserted', 'SD Card Removed',
    'SD Card Corrupted', 'SD Card Mounted', 'No SD Card', 'Video Signal Lost', 'Video Blocked', 'Storage Failure',
    'LCD Failure', 'TTS Failure', 'Camera Failure', 'IC Card Failure', 'Charger Connected', 'DLT Card Login',
    'DLT Card Logout', 'DLT Unregistered Card', 'No USB Camera', 'Temp Or Humidity Abnormal', 'Temperature Recovered',
    'Environment Abnormal', 'Fuel Sensor Comm Error', 'Fuel Sensor Comm Resumed', 'Temp Sensor Comm Error',
    'Temp Sensor Error', 'Temp Sensor Timeout', 'RFID Sensor Error', 'Memory Card Space Low', 'RFID Card Swipe',
    '3D Acceleration Error', 'UBI Sensor Chip Error', 'UBI Encrypted IC Error', 'Flash Error', 'CAN Module Error',
    'Speeding', 'Harsh Acceleration', 'Sharp Left Turn', 'Sharp Right Turn', 'Hard Braking', 'Sharp Turn',
    'Fatigue Warning', 'Daily Driving Timeout', 'Over Driving', 'Forward Collision Warning', 'Lane Departure Warning',
    'Headway Monitor Warning', 'Pedestrian Collision Warning', 'Lane Change Warning', 'Road Sign Overrun',
    'Obstacle Warning', 'Road Sign Recognition', 'Active Capture', 'Fatigue Driving', 'Using Phone', 'Smoking',
    'Driver Distraction', 'No Face Detected', 'Camera Blocked', 'Seatbelt Unfastened', 'Sunglasses Detected',
    'Hands Off Wheel', 'Answering Phone', 'Auto Capture', 'Driver Change', 'DSM Calibration Anomaly',
    'Frequent Blinking', 'Yawning', 'Seatbelt Fastened', 'Capture Completed', 'Driver Info Changed',
    'Face Alignment Error', 'Head Lowered', 'Driver Drinking', 'Pseudo Base Station', 'Suspected Herd Departure',
    'Away From Beacon', 'Left Herd', 'Voice Control', 'Identification', 'Key Press Event', 'Exit Defense Mode',
    'Enter Defense Mode', 'Reserved 1', 'Reserved 2', 'Reserved 3', 'Pet Lost', 'Package Opened', 'Pulse Exception',
    'Near Bluetooth Beacon', 'Bluetooth MAC Found', 'No Bluetooth MAC', 'INPUT1 On', 'INPUT1 Off', 'INPUT2 On',
    'INPUT2 Off', 'Motion Start', 'Motion Stop', 'File Uploaded', 'Loud Ambient Sound', 'Data Usage Exception',
];

// The live MQTT alert feed carries no alert.name/description at all (only a numeric alert.type
// and alert.code) — DeviceAlertReceived::broadcastWith maps a few confirmed codes to names, but
// falls back to showing the raw code for anything unmapped rather than a meaningless "Unknown".
function alertLabel(r) {
    return r.name ?? r.description ?? (r.code ? `Alert Code ${r.code}` : 'Unknown');
}

// Lightweight searchable combobox (label above, click-to-open panel with a search box) — used for
// both the Alert Type and Devices filters so long option lists (200+ alert names) stay usable.
function SearchSelect({ label, placeholder, value, onChange, options }) {
    const [open, setOpen]   = useState(false);
    const [query, setQuery] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    const selected = options.find(o => o.value === value);
    const filtered = query ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase())) : options;

    return (
        <div ref={ref} style={{ position: 'relative', minWidth: 220 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 6 }}>{label}</label>
            <div onClick={() => setOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', border: `1px solid ${open ? '#6366f1' : '#d1d5db'}`, borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: selected ? '#111827' : '#9ca3af' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected ? selected.label : placeholder}</span>
                <span style={{ color: '#9ca3af', marginLeft: 8 }}>▾</span>
            </div>
            {open && (
                <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.15)', maxHeight: 320, display: 'flex', flexDirection: 'column' }}>
                    <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…"
                        style={{ margin: 8, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }} />
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        <div onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
                            style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: !value ? '#4f46e5' : '#374151', fontWeight: !value ? 600 : 400 }}>
                            {placeholder}
                        </div>
                        {filtered.map(o => (
                            <div key={o.value} onClick={() => { onChange(o.value); setOpen(false); setQuery(''); }}
                                style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: o.value === value ? '#4f46e5' : '#374151', fontWeight: o.value === value ? 600 : 400, background: o.value === value ? '#eef2ff' : 'transparent' }}>
                                {o.label}
                            </div>
                        ))}
                        {filtered.length === 0 && <div style={{ padding: '8px 12px', fontSize: 13, color: '#9ca3af' }}>No matches</div>}
                    </div>
                </div>
            )}
        </div>
    );
}

// TurboHive attaches dashcam/ADAS evidence (photos/videos, e.g. for Camera Fault or harsh-driving
// alerts) to some historical alerts via GET /v3/alerts/page's `attachment` array — see
// TurboHiveService::getAlerts. Not observed on the live MQTT alert feed, so historical-only.
function AttachmentLinks({ attachments }) {
    if (!attachments || attachments.length === 0) return <span style={{ color: '#94a3b8' }}>—</span>;
    return (
        <span style={{ display: 'inline-flex', gap: 6 }}>
            {attachments.map((m, i) => {
                const isVideo = /\.(mp4|mov|avi|mkv)$/i.test(m.fileName ?? m.url ?? '');
                return (
                    <a key={m.id ?? i} href={m.url} target="_blank" rel="noreferrer" title={m.fileName ?? 'Evidence'} style={{ textDecoration: 'none', fontSize: 16 }}>
                        {isVideo ? '🎬' : '📷'}
                    </a>
                );
            })}
        </span>
    );
}

function MqttBadge({ connected }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: '#fff', background: connected ? '#16a34a' : '#94a3b8' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
            MQTT {connected ? 'Live' : 'Connecting…'}
        </span>
    );
}

// Live-only sibling of this report — see DriverBehavior() below for the historical half. TurboHive
// pushes alerts over MQTT ({userId}/alert/{imei}) the moment its device firmware detects them;
// mqtt:worker broadcasts every alert as alert.received on the shared 'fleet' Reverb channel (see
// MqttWorker.php). No REST call and no time range — just a rolling buffer of whatever arrives
// while this page is open.
function DriverBehaviorLive() {
    const [devices, setDevices]     = useState([]);
    const [deviceId, setDeviceId]   = useState('');
    const [alertType, setAlertType] = useState('');

    const [liveEvents, setLiveEvents]       = useState([]); // newest-first, capped at 30
    const [mqttConnected, setMqttConnected] = useState(false);
    const liveKeyRef = useRef(0);

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    useEffect(() => {
        if (!window.Echo) return;
        const channel = window.Echo.channel('fleet');
        channel.listen('.alert.received', (data) => {
            setMqttConnected(true);
            liveKeyRef.current += 1;
            setLiveEvents(evts => [{ ...data, _key: liveKeyRef.current }, ...evts].slice(0, 30));
        });
        channel.error(() => setMqttConnected(false));

        // The 'fleet' channel is shared with other pages, so it may already be subscribed by the
        // time this component mounts — read the underlying socket state directly rather than
        // relying on the one-time "subscription_succeeded" event (see Current Fuel Value).
        const pusher = window.Echo.connector?.pusher;
        if (pusher) {
            const syncState = () => setMqttConnected(pusher.connection.state === 'connected');
            syncState();
            pusher.connection.bind('state_change', syncState);
            return () => {
                pusher.connection.unbind('state_change', syncState);
                window.Echo.leaveChannel('fleet');
            };
        }
        return () => { window.Echo.leaveChannel('fleet'); setMqttConnected(false); };
    }, []);

    const filteredLive = liveEvents.filter(r => (!deviceId || r.imei === deviceId) && (!alertType || r.name === alertType));
    const resolveDeviceName = (r) => r.deviceName || devices.find(d => d.imei === r.imei)?.deviceName || r.imei;
    const COLS = ['No.', 'Device name', 'IMEI', 'Event Type', 'Speed (km/h)', 'Location', 'Time'];
    const alertTypeOptions = ALERT_TYPE_NAMES.map(n => ({ value: n, label: n }));
    const deviceOptions = devices.map(d => ({ value: d.imei, label: d.deviceName ?? d.imei }));

    return (
        <>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
                    <SearchSelect label="Alert Type" placeholder="All Types" value={alertType} onChange={setAlertType} options={alertTypeOptions} />
                    <SearchSelect label="Devices" placeholder="Search and select devices" value={deviceId} onChange={setDeviceId} options={deviceOptions} />
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h4 style={{ margin: 0, fontSize: 14, color: '#374151' }}>Live Feed</h4>
                <MqttBadge connected={mqttConnected} />
            </div>
            <Notice color="#dbeafe" icon="ℹ" text="Pushed live from TurboHive's MQTT alert topic as devices report them while this page is open — not a full history." />
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {filteredLive.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 32, color: '#94a3b8' }}>Waiting for live events…</td></tr>
                    ) : filteredLive.map((r, i) => (
                        <tr key={r._key}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{resolveDeviceName(r)}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{alertLabel(r)}</td>
                            <td style={TD}>{r.speed != null ? `${r.speed} km/h` : '—'}</td>
                            <td style={TD}><LocationLink lat={r.latitude} lon={r.longitude} /></td>
                            <td style={TD}>{fmtTime(r.timestamp)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// Historical half of the Driver Behavior report — see DriverBehaviorLive() above for the MQTT-fed
// live sibling. Built from GET /v3/alerts/page (see TurboHiveService::getAlerts), same endpoint
// the Overspeed report uses, just without a server-side alertType filter — that param matches
// TurboHive's internal alert.type code (e.g. "256-6"), not the human alert.name, so the Alert Type
// filter here matches client-side against `name` instead, using the exact catalog of names
// TurboHive documents (ALERT_TYPE_NAMES).
function DriverBehavior() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [alertType, setAlertType] = useState('');

    const [from, setFrom]       = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]           = useState(() => toLocalInput(new Date()));
    const [rows, setRows]       = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState('');

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { startTime: new Date(f).getTime(), endTime: new Date(t).getTime(), page: 1, size: 100 };
            if (dId) params.imeis = [dId];
            const res = await api.getTurboHiveAlerts(params);
            if (res.data?.error) {
                setError(res.data.error);
                setRows([]);
            } else {
                setRows(res.data?.list ?? []);
            }
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load driver behavior events.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const clear = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        const defaults = { from: toLocalInput(d), to: toLocalInput(new Date()) };
        setDeviceId(''); setAlertType(''); setFrom(defaults.from); setTo(defaults.to);
        search({ deviceId: '', from: defaults.from, to: defaults.to });
    };

    const byAlertType = r => !alertType || r.name === alertType;
    const filteredHistorical = rows.filter(byAlertType);

    // Historical rows carry deviceName straight from TurboHive's response (device.name); the live
    // MQTT feed doesn't, so fall back to the locally loaded device list.
    const resolveDeviceName = (r) => r.deviceName || devices.find(d => d.imei === r.imei)?.deviceName || r.imei;
    const COLS = ['No.', 'Device name', 'IMEI', 'Event Type', 'Speed (km/h)', 'Location', 'Time'];
    const HIST_COLS = [...COLS, 'Evidence'];

    const alertTypeOptions = ALERT_TYPE_NAMES.map(n => ({ value: n, label: n }));
    const deviceOptions = devices.map(d => ({ value: d.imei, label: d.deviceName ?? d.imei }));

    return (
        <>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
                    <SearchSelect label="Alert Type" placeholder="All Types" value={alertType} onChange={setAlertType} options={alertTypeOptions} />
                    <SearchSelect label="Devices" placeholder="Search and select devices" value={deviceId} onChange={setDeviceId} options={deviceOptions} />
                    <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 6 }}>Time Range</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff' }}>
                            <span style={{ color: '#9ca3af' }}>🕐</span>
                            <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                                style={{ border: 'none', outline: 'none', fontSize: 13, color: '#374151' }} />
                            <span style={{ color: '#9ca3af' }}>-</span>
                            <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                                style={{ border: 'none', outline: 'none', fontSize: 13, color: '#374151' }} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={clear} style={{ padding: '9px 18px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Clear</button>
                        <button onClick={() => search()} style={{ padding: '9px 22px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
                    </div>
                </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                <thead><tr>{HIST_COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={HIST_COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={HIST_COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : filteredHistorical.length === 0 ? (
                        <tr><td colSpan={HIST_COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    ) : filteredHistorical.map((r, i) => (
                        <tr key={r.id ?? i}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{resolveDeviceName(r)}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{alertLabel(r)}</td>
                            <td style={TD}>{r.speed != null ? `${r.speed} km/h` : '—'}</td>
                            <td style={TD}><LocationLink lat={r.latitude} lon={r.longitude} /></td>
                            <td style={TD}>{fmtTime(r.time)}</td>
                            <td style={TD}><AttachmentLinks attachments={r.attachments} /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// Built from TurboHive's POST /v3/track/location (live position cache in Redis, no history) —
// one row per device with its latest coordinates, battery voltage, ACC state, course and GPS fix
// quality. See TurboHiveService::getPositioningBattery.
function PositioningBattery() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    const search = async (overrides = {}) => {
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const res = await api.getTurboHivePositioningBattery(dId ? [dId] : []);
            if (res.data?.error) {
                setError(res.data.error);
                setRows([]);
            } else {
                setRows(res.data?.list ?? []);
            }
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load positions.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        setDeviceId(''); setRows([]); setError('');
        search({ deviceId: '' });
    };

    const deviceName = (imei) => devices.find(d => d.imei === imei)?.deviceName ?? imei;
    const COLS = ['No.', 'Device name', 'IMEI', 'Coordinates', 'Battery (V)', 'ACC', 'Course', 'Satellites', 'Fix Type', 'Server Time'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Refresh</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <Notice color="#dbeafe" icon="ℹ" text="Live positions only (from TurboHive's Redis cache) — no historical range, always the latest reading per device." />
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                    <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : error ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                        ) : rows.map((r, i) => (
                            <tr key={r.imei}>
                                <td style={TD}>{i + 1}</td>
                                <td style={TD}>{deviceName(r.imei)}</td>
                                <td style={TD}>{r.imei ?? '—'}</td>
                                <td style={TD}>{fmtCoords(r.latitude, r.longitude)}</td>
                                <td style={TD}>{r.battery ?? '—'}</td>
                                <td style={TD}>{r.acc === 1 ? 'ON' : r.acc === 0 ? 'OFF' : '—'}</td>
                                <td style={TD}>{r.course ?? '—'}</td>
                                <td style={TD}>{r.satellites ?? '—'}</td>
                                <td style={TD}>{r.fixType ?? '—'}</td>
                                <td style={TD}>{fmtTime(r.serverTime)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// Built from TurboHive's GET /v3/obd (historical OBD telemetry, max 30-day range, single device
// per query — see TurboHiveService::getObdData), grouped client-side per calendar day since
// TurboHive has no dedicated day-summary endpoint. Distance comes from the OBD odometer field
// (a real vehicle-reported reading, unlike the haversine-summed distance the GNSS-based Trips
// report has to fall back to), so this only works for OBD-capable devices — same caveat as Fuel
// Consumption. "Trips" per day is a simple speed-threshold run count (same IDLE_SPEED_KMH used by
// Parking/Idling/Ignition — referenced inside the function body since IDLE_SPEED_KMH is declared
// further down this file and this runs at module-init time), not a dedicated TurboHive field.
function groupObdByDay(points) {
    const byDay = new Map();
    for (const p of points) {
        if (p.gateTime == null) continue;
        const day = new Date(p.gateTime).toISOString().slice(0, 10);
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day).push(p);
    }

    return [...byDay.entries()].map(([date, dayPoints]) => {
        const first = dayPoints[0], last = dayPoints[dayPoints.length - 1];
        const distanceKm = (first.odometer != null && last.odometer != null)
            ? +(last.odometer - first.odometer).toFixed(2) : null;
        const durationMinutes = Math.round((last.gateTime - first.gateTime) / 60000);
        const speeds = dayPoints.map(p => p.vehicleSpeed ?? p.speed).filter(v => v != null);
        const maxSpeedKmh = speeds.length ? Math.max(...speeds) : null;
        const avgSpeedKmh = (distanceKm != null && durationMinutes > 0)
            ? +(distanceKm / (durationMinutes / 60)).toFixed(1) : null;

        let trips = 0, moving = false;
        for (const p of dayPoints) {
            const isMoving = (p.vehicleSpeed ?? p.speed ?? 0) > IDLE_SPEED_KMH;
            if (isMoving && !moving) trips++;
            moving = isMoving;
        }

        return { date, distanceKm, durationMinutes, avgSpeedKmh, maxSpeedKmh, trips, points: dayPoints.length };
    }).sort((a, b) => b.date.localeCompare(a.date));
}

function TravelStatisticsOBD() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setDate(d.getDate() - 6); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    const search = async () => {
        if (!deviceId) { setError('Select a device.'); return; }
        setError('');
        setLoading(true);
        try {
            const startTime = new Date(from).getTime();
            const endTime   = new Date(to).getTime();
            const res = await api.getTurboHiveObdData(deviceId, startTime, endTime, 100);
            if (res.data?.error) {
                setError(res.data.error);
                setRows([]);
            } else {
                const points = [...(res.data?.obdData ?? [])].sort((a, b) => (a.gateTime ?? 0) - (b.gateTime ?? 0));
                setRows(groupObdByDay(points));
            }
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load travel statistics report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        const d = new Date(); d.setDate(d.getDate() - 6); d.setHours(0,0,0,0);
        setDeviceId(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const selectedDevice = devices.find(d => d.imei === deviceId);
    const COLS = ['No.','Device name','IMEI','Total Distance (km)','Total Duration','Avg Speed (km/h)','Max Speed (km/h)','Trips','Date'];

    return (
        <>
            <Notice color="#dbeafe" icon="ℹ" text="Built from TurboHive's OBD odometer readings, grouped per day — only OBD-capable devices report this data (max 30-day range per query)." />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">Select device</option>
                    {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
                </select>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <button onClick={search} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
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
                        <tr key={r.date}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{selectedDevice?.deviceName ?? deviceId}</td>
                            <td style={TD}>{deviceId}</td>
                            <td style={TD}>{r.distanceKm ?? '—'}</td>
                            <td style={TD}>{formatMinutesDuration(r.durationMinutes)}</td>
                            <td style={TD}>{r.avgSpeedKmh ?? '—'}</td>
                            <td style={TD}>{r.maxSpeedKmh ?? '—'}</td>
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
    const header = ['No.', 'Position Time', 'Speed (km/h)', 'Azimuth', 'Satellites', 'Fix Type', 'ACC', 'Coordinates'];
    const lines = [header.join(',')];
    rows.forEach((r, i) => {
        const cells = [
            i + 1, fmtTime(r.deviceTime), r.speed, azimuthLabel(r.course),
            r.satellites ?? '—', r.fixType ?? '—', r.acc === 1 ? 'ON' : r.acc === 0 ? 'OFF' : '—',
            `${r.latitude},${r.longitude}`,
        ];
        lines.push(cells.map(c => `"${String(c ?? '—').replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'track-details.csv'; a.click();
    URL.revokeObjectURL(url);
}

// Built from TurboHive's GET /v3/track (historical GNSS points, max 30-day range per query) —
// one row per reported position: speed, heading/azimuth, satellite count, GPS fix type, ACC state,
// and coordinates. See TurboHiveService::getTrack.
function TrackDetails() {
    const [devices,  setDevices]  = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from,      setFrom]    = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to,        setTo]      = useState(() => toLocalInput(new Date()));
    const [rows,      setRows]    = useState([]);
    const [loading,   setLoading] = useState(false);
    const [error,     setError]   = useState('');

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    const search = async () => {
        if (!deviceId) { setError('Select a device.'); return; }
        setError('');
        setLoading(true);
        try {
            const startTime = new Date(from).getTime();
            const endTime   = new Date(to).getTime();
            const res = await api.getTurboHiveTrack(deviceId, startTime, endTime);
            if (res.data?.error) {
                setError(res.data.error);
                setRows([]);
            } else {
                const points = [...(res.data?.list ?? [])].sort((a, b) => (b.deviceTime ?? 0) - (a.deviceTime ?? 0));
                setRows(points);
            }
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

    const COLS = ['No.', 'Position Time', 'Speed (km/h)', 'Azimuth', 'Satellites', 'Fix Type', 'ACC', 'Coordinates'];

    return (
        <>
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Device</label>
                    <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                        style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', minWidth: 180 }}>
                        <option value="">Select device</option>
                        {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
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

            <Notice color="#dbeafe" icon="ℹ" text="Track precision depends on GPS signal quality and reporting interval settings (max 30-day range per query)." />
            {error && <Notice text={error} />}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
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
                                <td style={TD}>{fmtTime(r.deviceTime)}</td>
                                <td style={TD}>{r.speed ?? '—'}</td>
                                <td style={TD}>{azimuthLabel(r.course)}</td>
                                <td style={TD}>{r.satellites ?? '—'}</td>
                                <td style={TD}>{r.fixType ?? '—'}</td>
                                <td style={TD}>{r.acc === 1 ? 'ON' : r.acc === 0 ? 'OFF' : '—'}</td>
                                <td style={TD}><LocationLink lat={r.latitude} lon={r.longitude} /></td>
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

// Standard ray-casting point-in-polygon test; good enough at city/geofence scale (points are
// [lat, lon] pairs, same shape geofenceAreaToShape() returns).
function pointInPolygon(lat, lon, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [yi, xi] = points[i];
        const [yj, xj] = points[j];
        const intersect = (yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

function pointInGeofenceShape(lat, lon, shape) {
    if (!shape) return false;
    if (shape.type === 'circle') return haversineKm(lat, lon, shape.center[0], shape.center[1]) * 1000 <= shape.radius;
    if (shape.type === 'polygon') return pointInPolygon(lat, lon, shape.points);
    return false;
}

// TurboHive has no geofence concept at all — this tests each already-loaded GNSS point (from
// /v3/track/list) against locally-saved geofence shapes (see GeofencePage.jsx / GeofenceController)
// and pairs inside/outside transitions per geofence into enter→exit visits. A geofence the device
// is still inside at the end of the queried range gets exitTime: null.
function segmentGeofenceVisits(points, geofences) {
    const visits = [];
    for (const g of geofences) {
        const shape = geofenceAreaToShape(g.area);
        if (!shape) continue;
        let inside = false, enterPoint = null;
        for (const p of points) {
            const isIn = pointInGeofenceShape(p.latitude, p.longitude, shape);
            if (isIn && !inside) { inside = true; enterPoint = p; }
            else if (!isIn && inside) {
                visits.push({
                    geofenceId: g.id, geofenceName: g.name,
                    enterTime: enterPoint.deviceTime, exitTime: p.deviceTime,
                    durationMs: p.deviceTime - enterPoint.deviceTime,
                    latitude: enterPoint.latitude, longitude: enterPoint.longitude,
                });
                inside = false; enterPoint = null;
            }
        }
        if (inside && enterPoint) {
            const last = points[points.length - 1];
            visits.push({
                geofenceId: g.id, geofenceName: g.name,
                enterTime: enterPoint.deviceTime, exitTime: null,
                durationMs: last.deviceTime - enterPoint.deviceTime,
                latitude: enterPoint.latitude, longitude: enterPoint.longitude,
            });
        }
    }
    return visits;
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

// Built from TurboHive's GET /v3/track/list (complete, unpaginated GNSS track — same source as
// Track Details but loaded all at once, since Replay needs the whole route up front to animate).
// "Driving behavior" overlay reuses the same GET /v3/alerts/page + keyword classification as the
// Driver Behavior report's historical feed; "Geofence" overlay reuses the account's saved
// geofences; "Parking time" marks runs of near-zero speed lasting at least the chosen threshold,
// computed locally from the already-loaded track (no extra API call). See TurboHiveService::getTrackList.
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
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 }).then(res => setDevices(res.data?.data ?? [])).catch(() => {});
        api.getGeofences().then(res => setGeofences(res.data)).catch(() => {});
    }, []);

    const search = async () => {
        if (!deviceId) { setError('Select a device.'); return; }
        setError('');
        setLoading(true);
        setPlaying(false);
        try {
            const startTime = new Date(from).getTime();
            const endTime   = new Date(to).getTime();
            const [trackRes, eventsRes] = await Promise.all([
                api.getTurboHiveTrackList(deviceId, startTime, endTime),
                api.getTurboHiveAlerts({ startTime, endTime, imeis: [deviceId], page: 1, size: 100 }),
            ]);
            if (trackRes.data?.error) {
                setError(trackRes.data.error);
                setPoints([]);
                setBehaviorEvents([]);
            } else {
                const pts = [...(trackRes.data?.list ?? [])].sort((a, b) => (a.deviceTime ?? 0) - (b.deviceTime ?? 0));
                setPoints(pts);
                setBehaviorEvents(eventsRes.data?.list ?? []);
            }
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
            const stationary = (points[i].speed ?? 0) < 2;
            if (stationary && runStart === null) runStart = i;
            if ((!stationary || i === points.length - 1) && runStart !== null) {
                const runEnd = stationary ? i : i - 1;
                const minutes = (points[runEnd].deviceTime - points[runStart].deviceTime) / 60000;
                if (minutes >= parkingTime) stops.push(points[runStart]);
                runStart = null;
            }
        }
    }

    const filteredBehavior = alertType
        ? behaviorEvents.filter(r => r.name === alertType)
        : behaviorEvents;

    const center = points.length ? [points[0].latitude, points[0].longitude] : REPLAY_DEFAULT_CENTER;

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 180 }}>
                    <option value="">Select device</option>
                    {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
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
                                <Popup>{alertLabel(r)}<br />{fmtTime(r.time)}</Popup>
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
                            <Popup>Parked since {fmtTime(s.deviceTime)}</Popup>
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
                                Speed: {current?.speed ?? 0} km/h
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
                            <div style={{ textAlign: 'center', marginTop: 4, color: '#374151', fontSize: 12 }}>{fmtTime(current?.deviceTime)}</div>

                            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <label style={{ color: '#6b7280', fontSize: 12, whiteSpace: 'nowrap' }}>Parking time</label>
                                <select value={parkingTime} onChange={e => setParkingTime(Number(e.target.value))}
                                    style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, padding: '4px 6px' }}>
                                    {PARKING_TIME_OPTIONS.map(m => <option key={m} value={m}>{m}Minute{m === 1 ? '' : 's'}</option>)}
                                </select>
                            </div>

                            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <label style={{ color: '#6b7280', fontSize: 12, whiteSpace: 'nowrap' }}>Alert Type</label>
                                {/* minWidth: 0 stops a flex item from refusing to shrink below its content's
                                    intrinsic width — without it, a <select> sizes itself to its widest <option>
                                    (some of the 200+ ALERT_TYPE_NAMES are long), overflowing this fixed-width panel. */}
                                <select value={alertType} onChange={e => setAlertType(e.target.value)}
                                    style={{ flex: 1, minWidth: 0, maxWidth: '100%', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, padding: '4px 6px' }}>
                                    <option value="">Select Alert Type</option>
                                    {ALERT_TYPE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
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

// Built from TurboHive's GET /v3/mileage/realtime — paginated, one row per device with its
// live total/today/subtotal mileage, current ACC and speed, and online status. Not a date-range
// report; only devices with mileage calculation enabled on TurboHive appear here.
// See TurboHiveService::getRealtimeMileage.
function Mileage() {
    const [keywordInput, setKeywordInput] = useState('');
    const [keyword, setKeyword]   = useState('');
    const [page, setPage]         = useState(1);
    const [size, setSize]         = useState(20);
    const [rows, setRows]         = useState([]);
    const [total, setTotal]       = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    const search = async () => {
        setLoading(true);
        setError('');
        try {
            const params = { page, size };
            if (keyword) params.keyword = keyword;
            const res = await api.getTurboHiveRealtimeMileage(params);
            if (res.data?.error) {
                setError(res.data.error);
                setRows([]); setTotal(0); setTotalPages(0);
            } else {
                setRows(res.data?.data ?? []);
                setTotal(res.data?.total ?? 0);
                setTotalPages(res.data?.totalPages ?? 0);
            }
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load mileage report.');
            setRows([]); setTotal(0); setTotalPages(0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, [page, size, keyword]); // eslint-disable-line react-hooks/exhaustive-deps

    const applyKeyword = () => { setPage(1); setKeyword(keywordInput.trim()); };

    const reset = () => {
        setKeywordInput(''); setKeyword(''); setPage(1); setSize(20);
        setRows([]); setError('');
    };

    const totalMileage = rows.reduce((sum, r) => sum + (r.totalMileage || 0), 0);
    const COLS = ['No.', 'Device Name', 'IMEI', 'Total Mileage (km)', 'Today Mileage (km)', 'Subtotal (km)', 'ACC', 'Speed (km/h)', 'Status'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input value={keywordInput} onChange={e => setKeywordInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && applyKeyword()}
                    placeholder="Search device name or IMEI"
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none', minWidth: 220 }} />
                <button onClick={applyKeyword} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <p style={{ fontSize: 13, color: '#374151', margin: '0 0 10px' }}>
                <strong>Page total:</strong> {totalMileage.toFixed(2)} km &nbsp;·&nbsp; {total} device{total !== 1 ? 's' : ''}
            </p>
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
                        <tr key={r.imei}>
                            <td style={TD}>{(page - 1) * size + i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{r.totalMileage ?? '—'}</td>
                            <td style={TD}>{r.todayMileage ?? '—'}</td>
                            <td style={TD}>{r.subtotal ?? '—'}</td>
                            <td style={TD}>{r.acc ?? '—'}</td>
                            <td style={TD}>{r.speed ?? '—'}</td>
                            <td style={TD}>{r.onlineStatus ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Page {page} of {totalPages || 1}</span>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                    style={{ padding: '5px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', fontSize: 12, cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}>‹ Prev</button>
                <button onClick={() => setPage(p => Math.min(totalPages || 1, p + 1))} disabled={page >= totalPages}
                    style={{ padding: '5px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', fontSize: 12, cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? 0.5 : 1 }}>Next ›</button>
                <select value={size} onChange={e => { setSize(+e.target.value); setPage(1); }}
                    style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }}>
                    {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
                </select>
            </div>
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

const EARTH_RADIUS_KM = 6371;
function haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Groups a chronologically-sorted track (TurboHive has no dedicated "trips" field on raw GNSS
// points) into trips: a maximal run of points with ACC on, falling back to speed > 2 km/h when
// ACC isn't reported. Distance is summed via haversine between consecutive points since the
// device.meter odometer field isn't reliably populated.
function segmentTrips(points) {
    const trips = [];
    let run = [];
    const flush = () => {
        if (run.length >= 2) {
            let distanceKm = 0, maxSpeed = 0, speedSum = 0;
            for (let i = 0; i < run.length; i++) {
                speedSum += run[i].speed ?? 0;
                maxSpeed = Math.max(maxSpeed, run[i].speed ?? 0);
                if (i > 0) distanceKm += haversineKm(run[i - 1].latitude, run[i - 1].longitude, run[i].latitude, run[i].longitude);
            }
            const first = run[0], last = run[run.length - 1];
            trips.push({
                startTime: first.deviceTime,
                endTime: last.deviceTime,
                startLat: first.latitude, startLon: first.longitude,
                endLat: last.latitude, endLon: last.longitude,
                durationMs: last.deviceTime - first.deviceTime,
                distanceKm,
                avgSpeedKmh: speedSum / run.length,
                maxSpeedKmh: maxSpeed,
            });
        }
        run = [];
    };
    for (const p of points) {
        if (p.acc === 1 || (p.acc == null && (p.speed ?? 0) > 2)) run.push(p);
        else flush();
    }
    flush();
    return trips;
}

const IDLE_SPEED_KMH = 5;

// Groups a chronologically-sorted track into contiguous ACC-state runs (falls back to inferring
// ACC from speed > 2 km/h when a device doesn't report status.acc). Shared base for the Ignition
// report (every run, labeled ON/OFF), the Parking report (ACC-off runs), and the Idling report
// (ACC-on runs that never really moved — avg speed under IDLE_SPEED_KMH) — TurboHive's raw track
// has none of these as a dedicated field.
function segmentByAcc(points) {
    const segments = [];
    let run = [];
    let runAcc = null;
    const flush = () => {
        if (run.length === 0) return;
        let maxSpeed = 0, speedSum = 0;
        for (const p of run) { speedSum += p.speed ?? 0; maxSpeed = Math.max(maxSpeed, p.speed ?? 0); }
        const first = run[0], last = run[run.length - 1];
        segments.push({
            acc: runAcc,
            startTime: first.deviceTime, endTime: last.deviceTime,
            startLat: first.latitude, startLon: first.longitude,
            endLat: last.latitude, endLon: last.longitude,
            durationMs: last.deviceTime - first.deviceTime,
            avgSpeedKmh: speedSum / run.length,
            maxSpeedKmh: maxSpeed,
        });
        run = [];
    };
    for (const p of points) {
        const acc = p.acc ?? ((p.speed ?? 0) > 2 ? 1 : 0);
        if (acc !== runAcc) { flush(); runAcc = acc; }
        run.push(p);
    }
    flush();
    return segments;
}

// Fetches a device's track for the given range and returns it sorted ascending by time, or throws
// with a friendly message — shared by Parking/Idling/Ignition (all built on segmentByAcc above).
async function loadSortedTrack(imei, fromLocal, toLocal) {
    const startTime = new Date(fromLocal).getTime();
    const endTime   = new Date(toLocal).getTime();
    const res = await api.getTurboHiveTrackList(imei, startTime, endTime);
    if (res.data?.error) throw new Error(res.data.error);
    return [...(res.data?.list ?? [])].sort((a, b) => (a.deviceTime ?? 0) - (b.deviceTime ?? 0));
}

// Built from TurboHive's GET /v3/track/list (raw GNSS points, max 30-day range per query) — trips
// are derived client-side via segmentTrips() rather than a dedicated trips field, since TurboHive's
// track data has no fuel-consumption figures, those columns from the old Traccar-based report are
// dropped. See TurboHiveService::getTrackList.
function Trips() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    const search = async () => {
        if (!deviceId) { setError('Select a device.'); return; }
        setError('');
        setLoading(true);
        try {
            const startTime = new Date(from).getTime();
            const endTime   = new Date(to).getTime();
            const res = await api.getTurboHiveTrackList(deviceId, startTime, endTime);
            if (res.data?.error) {
                setError(res.data.error);
                setRows([]);
            } else {
                const points = [...(res.data?.list ?? [])].sort((a, b) => (a.deviceTime ?? 0) - (b.deviceTime ?? 0));
                setRows(segmentTrips(points).sort((a, b) => b.startTime - a.startTime));
            }
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load trips.');
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

    const COLS = ['No.', 'Start time', 'Start location', 'End time', 'End location', 'Duration', 'Distance (km)', 'Average Speed (km/h)', 'Max Speed (km/h)'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 180 }}>
                    <option value="">Select device</option>
                    {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
                </select>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <button onClick={search} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <Notice color="#dbeafe" icon="ℹ" text="A trip is a run of ACC-on GNSS points (max 30-day range per query); distance is summed via haversine between consecutive points." />
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
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
                                <td style={TD}>{fmtTime(r.startTime)}</td>
                                <td style={TD}><LocationLink lat={r.startLat} lon={r.startLon} /></td>
                                <td style={TD}>{fmtTime(r.endTime)}</td>
                                <td style={TD}><LocationLink lat={r.endLat} lon={r.endLon} /></td>
                                <td style={TD}>{formatHMS(r.durationMs)}</td>
                                <td style={TD}>{r.distanceKm.toFixed(2)}</td>
                                <td style={TD}>{r.avgSpeedKmh.toFixed(1)}</td>
                                <td style={TD}>{r.maxSpeedKmh.toFixed(1)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// Built from TurboHive's GET /v3/alerts/page filtered to alertType=OVERSPEED — each row is a
// discrete overspeed alert the device itself fired (not a continuous over-limit period recomputed
// from raw positions, since that's what the old Traccar-based report did and TurboHive already
// does the detection device-side). See TurboHiveService::getAlerts.
function Overspeed() {
    const [devices, setDevices]     = useState([]);
    const [deviceId, setDeviceId]   = useState('');
    const [from, setFrom]           = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]               = useState(() => toLocalInput(new Date()));
    const [rows, setRows]           = useState([]);
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState('');

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = {
                startTime: new Date(f).getTime(),
                endTime:   new Date(t).getTime(),
                alertType: 'OVERSPEED',
                page: 1,
                size: 100,
            };
            if (dId) params.imeis = [dId];
            const res = await api.getTurboHiveAlerts(params);
            if (res.data?.error) {
                setError(res.data.error);
                setRows([]);
            } else {
                setRows(res.data?.list ?? []);
            }
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load overspeed alerts.');
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

    const deviceName = (imei) => devices.find(d => d.imei === imei)?.deviceName ?? imei;
    const COLS = ['No.', 'Device Name', 'IMEI', 'Description', 'Speed (km/h)', 'Alert Time', 'Coordinates'];

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
                    {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <Notice color="#dbeafe" icon="ℹ" text="Overspeed threshold is configured on TurboHive/device side — this lists alerts it already fired, not a recomputed period." />
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                    <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
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
                                <td style={TD}>{deviceName(r.imei)}</td>
                                <td style={TD}>{r.imei ?? '—'}</td>
                                <td style={TD}>{r.description ?? r.name ?? '—'}</td>
                                <td style={TD}>{r.speed ?? '—'}</td>
                                <td style={TD}>{fmtTime(r.time)}</td>
                                <td style={TD}><LocationLink lat={r.latitude} lon={r.longitude} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// Built from TurboHive's GET /v3/track/list — a "parking" period is an ACC-off run derived via
// segmentByAcc() (vehicle powered down; presumed stationary since it has no ignition to move).
// See loadSortedTrack()/segmentByAcc() above.
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
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    const search = async () => {
        if (!deviceId) { setError('Select a device.'); return; }
        setError('');
        setLoading(true);
        try {
            const points = await loadSortedTrack(deviceId, from, to);
            const stops = segmentByAcc(points).filter(s => s.acc === 0);
            setRows(stops);
        } catch (e) {
            setError(e.message || e.response?.data?.message || 'Failed to load parking report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setMinDuration(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const selectedDevice = devices.find(d => d.imei === deviceId);
    const filtered = (minDuration ? rows.filter(r => r.durationMs >= Number(minDuration) * 60000) : rows)
        .sort((a, b) => sortAsc ? a.startTime - b.startTime : b.startTime - a.startTime);
    const COLS = ['No.', 'Device Name', 'IMEI', 'Model', 'State', 'Start time', 'End Time', 'Coordinates', 'Stay time'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">Select device</option>
                    {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
                </select>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <input type="number" value={minDuration} onChange={e => setMinDuration(e.target.value)} placeholder="Min. duration (min)"
                    style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', width: 150 }} />
                <button onClick={search} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <Notice color="#dbeafe" icon="ℹ" text="A parking period is a run of ACC-off GNSS points (max 30-day range per query)." />
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                    <thead>
                        <tr>
                            {COLS.map(c => (
                                <th key={c} style={TH}>
                                    {c === 'Start time' ? (
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
                                <td style={TD}>{selectedDevice?.deviceName ?? deviceId}</td>
                                <td style={TD}>{deviceId}</td>
                                <td style={TD}>{selectedDevice?.model ?? '—'}</td>
                                <td style={TD}>Parking</td>
                                <td style={TD}>{fmtTime(r.startTime)}</td>
                                <td style={TD}>{fmtTime(r.endTime)}</td>
                                <td style={TD}><LocationLink lat={r.startLat} lon={r.startLon} /></td>
                                <td style={TD}>{formatHMS(r.durationMs)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// Built from TurboHive's GET /v3/track/list — an "idling" period is an ACC-on run (engine running)
// derived via segmentByAcc() whose average speed never exceeds IDLE_SPEED_KMH (vehicle not really
// moving). See loadSortedTrack()/segmentByAcc() above.
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
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    const search = async () => {
        if (!deviceId) { setError('Select a device.'); return; }
        setError('');
        setLoading(true);
        try {
            const points = await loadSortedTrack(deviceId, from, to);
            const idlePeriods = segmentByAcc(points).filter(s => s.acc === 1 && s.avgSpeedKmh < IDLE_SPEED_KMH);
            setRows(idlePeriods);
        } catch (e) {
            setError(e.message || e.response?.data?.message || 'Failed to load idling report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setMinDuration(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const selectedDevice = devices.find(d => d.imei === deviceId);
    const filtered = (minDuration ? rows.filter(r => r.durationMs >= Number(minDuration) * 60000) : rows)
        .sort((a, b) => sortAsc ? a.startTime - b.startTime : b.startTime - a.startTime);
    const COLS = ['No.', 'Device Name', 'IMEI', 'Model', 'State', 'Start time', 'End Time', 'Coordinates', 'Stay time'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">Select device</option>
                    {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
                </select>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <input type="number" value={minDuration} onChange={e => setMinDuration(e.target.value)} placeholder="Min. idle (min)"
                    style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', width: 140 }} />
                <button onClick={search} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <Notice color="#dbeafe" icon="ℹ" text={`An idling period is a run of ACC-on GNSS points averaging under ${IDLE_SPEED_KMH} km/h (max 30-day range per query).`} />
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                    <thead>
                        <tr>
                            {COLS.map(c => (
                                <th key={c} style={TH}>
                                    {c === 'Start time' ? (
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
                                <td style={TD}>{selectedDevice?.deviceName ?? deviceId}</td>
                                <td style={TD}>{deviceId}</td>
                                <td style={TD}>{selectedDevice?.model ?? '—'}</td>
                                <td style={TD}>Idling</td>
                                <td style={TD}>{fmtTime(r.startTime)}</td>
                                <td style={TD}>{fmtTime(r.endTime)}</td>
                                <td style={TD}><LocationLink lat={r.startLat} lon={r.startLon} /></td>
                                <td style={TD}>{formatHMS(r.durationMs)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// Built from TurboHive's GET /v3/track/list — every contiguous ACC-state run (segmentByAcc())
// becomes one ON or OFF period; unlike the old Traccar-based report this shows real coordinates
// for each transition, since we already have them from the track data.
// See loadSortedTrack()/segmentByAcc() above.
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
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    const search = async () => {
        if (!deviceId) { setError('Select a device.'); return; }
        setError('');
        setLoading(true);
        try {
            const points = await loadSortedTrack(deviceId, from, to);
            setRows(segmentByAcc(points));
        } catch (e) {
            setError(e.message || e.response?.data?.message || 'Failed to load ignition report.');
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

    const selectedDevice = devices.find(d => d.imei === deviceId);
    const sorted = [...rows].sort((a, b) => sortAsc ? a.startTime - b.startTime : b.startTime - a.startTime);
    const COLS = ['No.', 'Device Name', 'IMEI', 'Model', 'State', 'Start time', 'End Time', 'Total time', 'Coordinates'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">Select device</option>
                    {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
                </select>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <button onClick={search} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <Notice color="#dbeafe" icon="ℹ" text="Each row is a contiguous ACC-on or ACC-off run (max 30-day range per query)." />
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                    <thead>
                        <tr>
                            {COLS.map(c => (
                                <th key={c} style={TH}>
                                    {c === 'Start time' ? (
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
                                <td style={TD}>{selectedDevice?.deviceName ?? deviceId}</td>
                                <td style={TD}>{deviceId}</td>
                                <td style={TD}>{selectedDevice?.model ?? '—'}</td>
                                <td style={{ ...TD, color: r.acc === 1 ? '#16a34a' : '#6b7280', fontWeight: 600 }}>{r.acc === 1 ? 'ON' : 'OFF'}</td>
                                <td style={TD}>{fmtTime(r.startTime)}</td>
                                <td style={TD}>{fmtTime(r.endTime)}</td>
                                <td style={TD}>{formatHMS(r.durationMs)}</td>
                                <td style={TD}><LocationLink lat={r.startLat} lon={r.startLon} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// TurboHive has no geofence concept — geofences are drawn/saved locally (GeofencePage.jsx →
// GeofenceController, a real DB-backed CRUD) and this report tests each point of a TurboHive
// GET /v3/track/list track against those saved shapes via segmentGeofenceVisits() to derive
// enter/exit periods. See loadSortedTrack()/segmentGeofenceVisits() above.
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
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
        api.getGeofences().then(res => setGeofences(res.data)).catch(() => setGeofences([]));
    }, []);

    // Mirrors Traccar's separate /api/permissions step — a geofence is only checked against
    // devices it's explicitly linked to (see GeofencePage.jsx's "Linked Devices" panel /
    // GeofenceController::linkDevice), not just "all saved geofences".
    const linkedGeofences = deviceId ? geofences.filter(g => (g.imeis ?? []).includes(deviceId)) : [];

    const search = async () => {
        if (!deviceId) { setError('Select a device.'); return; }
        setError('');
        setLoading(true);
        try {
            const points = await loadSortedTrack(deviceId, from, to);
            const targets = geofenceId ? linkedGeofences.filter(g => String(g.id) === String(geofenceId)) : linkedGeofences;
            setRows(segmentGeofenceVisits(points, targets));
        } catch (e) {
            setError(e.message || e.response?.data?.message || 'Failed to load geofence report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setGeofenceId(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const selectedDevice = devices.find(d => d.imei === deviceId);
    const sorted = [...rows].sort((a, b) => sortAsc ? a.enterTime - b.enterTime : b.enterTime - a.enterTime);
    const COLS = ['No.', 'Device Name', 'IMEI', 'Model', 'Fence Name', 'Enter Time', 'Exit Time', 'Stay Time'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => { setDeviceId(e.target.value); setGeofenceId(''); }}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">Select device</option>
                    {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
                </select>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={geofenceId} onChange={e => setGeofenceId(e.target.value)} disabled={!deviceId}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: deviceId ? 'pointer' : 'not-allowed', minWidth: 170 }}>
                    <option value="">All linked geofences</option>
                    {linkedGeofences.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <button onClick={search} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            {deviceId && linkedGeofences.length === 0 && (
                <Notice text="This device has no geofences linked yet — link one from the Geofences page's Linked Devices panel." />
            )}
            <Notice color="#dbeafe" icon="ℹ" text="Enter/exit is computed by testing the device's GNSS track against its linked geofence shapes (max 30-day range per query)." />
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                    <thead>
                        <tr>
                            {COLS.map(c => (
                                <th key={c} style={TH}>
                                    {c === 'Enter Time' ? (
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
                                <td style={TD}>{selectedDevice?.deviceName ?? deviceId}</td>
                                <td style={TD}>{deviceId}</td>
                                <td style={TD}>{selectedDevice?.model ?? '—'}</td>
                                <td style={TD}>{r.geofenceName ?? '—'}</td>
                                <td style={TD}>{fmtTime(r.enterTime)}</td>
                                <td style={TD}>{r.exitTime ? fmtTime(r.exitTime) : 'Still inside'}</td>
                                <td style={TD}>{formatHMS(r.durationMs)}</td>
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
// Built from three TurboHive calls merged by imei: GET /v3/devices/page (deviceName/model — see
// TurboHiveService::getDevices), POST /v3/devices/status/bulk (onlineStatus/lastHeartTime/
// lastGpsTime/speed — see TurboHiveService::getDeviceStatus), and POST /v3/track/location
// (latitude/longitude — see TurboHiveService::getPositioningBattery). TurboHive has no SIM/phone/
// reverse-geocoded-address fields the old Traccar-based version showed, so those columns are
// dropped; onlineStatus (1 = online) is what buckets a device into Online vs Offline here since
// TurboHive has no separate per-bucket endpoint the way Traccar's report did.
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
            const devRes = await api.getTurboHiveTrackableDevices({ page: 1, size: 100 });
            const deviceList = devRes.data?.data ?? [];
            setDevices(deviceList);

            const imeis = deviceList.map(d => d.imei);
            const [statusRes, posRes] = await Promise.all([
                imeis.length ? api.getTurboHiveDeviceStatus(imeis) : Promise.resolve({ data: [] }),
                api.getTurboHivePositioningBattery([]).catch(() => ({ data: { list: [] } })),
            ]);
            const statusByImei = Object.fromEntries((statusRes.data ?? []).map(s => [s.imei, s]));
            const posByImei = Object.fromEntries((posRes.data?.list ?? []).map(p => [p.imei, p]));

            const merged = deviceList.map(d => {
                const s = statusByImei[d.imei] ?? {};
                const p = posByImei[d.imei] ?? {};
                return {
                    imei: d.imei,
                    deviceName: d.deviceName,
                    model: d.model,
                    onlineStatus: s.onlineStatus ?? d.onlineStatus ?? 0,
                    lastHeartTime: s.lastHeartTime ?? null,
                    speed: s.speed ?? null,
                    latitude: p.latitude ?? null,
                    longitude: p.longitude ?? null,
                };
            });

            setRows(merged.filter(r => (online ? r.onlineStatus === 1 : r.onlineStatus !== 1)));
        } catch (e) {
            setError(e.response?.data?.message || `Failed to load ${online ? 'online' : 'offline'} devices.`);
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => { setDeviceId(''); search(); };

    const filtered = rows.filter(r => !deviceId || r.imei === deviceId);
    const sorted = [...filtered].sort((a, b) => {
        const cmp = (a.deviceName ?? '').localeCompare(b.deviceName ?? '');
        return sortAsc ? cmp : -cmp;
    });

    const COLS = online
        ? ['No.', 'Device Name', 'IMEI', 'Model', 'Speed (km/h)', 'Coordinates', 'Last Heartbeat']
        : ['No.', 'Device Name', 'IMEI', 'Model', 'Offline Since', 'Coordinates', 'Last Heartbeat'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 200 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
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
                            <tr key={r.imei}>
                                <td style={TD}>{i + 1}</td>
                                <td style={TD}>{r.deviceName ?? '—'}</td>
                                <td style={TD}>{r.imei ?? '—'}</td>
                                <td style={TD}>{r.model ?? '—'}</td>
                                {online
                                    ? <td style={TD}>{r.speed ?? '—'}</td>
                                    : <td style={TD}>{r.lastHeartTime ? formatDuration(Date.now() - r.lastHeartTime) : '—'}</td>}
                                <td style={TD}>
                                    {r.latitude != null && r.longitude != null ? (
                                        <a href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>
                                            {fmtCoords(r.latitude, r.longitude)}
                                        </a>
                                    ) : '—'}
                                </td>
                                <td style={TD}>{fmtTime(r.lastHeartTime)}</td>
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
const fmtCoords = (lat, lng) => (lat != null && lng != null) ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : '—';

function exportAlertsCsv(rows) {
    const header = ['No.','Device Name','IMEI','Alert Type','Speed (km/h)','Alert Time','Coordinates'];
    const lines = [header.join(',')];
    rows.forEach((r, i) => {
        const cells = [i + 1, r.deviceName ?? r.imei, r.imei, alertLabel(r), r.speed, fmtTime(r.time), fmtCoords(r.latitude, r.longitude)];
        lines.push(cells.map(c => `"${String(c ?? '—').replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'alert-details.csv'; a.click();
    URL.revokeObjectURL(url);
}

// Built from TurboHive's GET /v3/alerts/page (see TurboHiveService::getAlerts) — the same endpoint
// Overspeed and Driver Behavior's historical feed use, but unfiltered by category: every alert type
// shows up here, using the full ALERT_TYPE_NAMES catalog for the filter (see Driver Behavior for
// why that's matched client-side against `name` rather than sent as a server-side alertType param).
// TurboHive has no Model/Account/reverse-geocoded-address fields the old Traccar-based report
// showed, so those columns are dropped; Evidence reuses the same AttachmentLinks as Driver Behavior.
function AlertDetails() {
    const [devices, setDevices]     = useState([]);
    const [deviceId, setDeviceId]   = useState('');
    const [alertType, setAlertType] = useState('');
    const [from, setFrom]           = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]               = useState(() => toLocalInput(new Date()));
    const [rows, setRows]           = useState([]);
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState('');

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    const search = async () => {
        setLoading(true);
        setError('');
        try {
            const params = { startTime: new Date(from).getTime(), endTime: new Date(to).getTime(), page: 1, size: 100 };
            if (deviceId) params.imeis = [deviceId];
            const res = await api.getTurboHiveAlerts(params);
            if (res.data?.error) {
                setError(res.data.error);
                setRows([]);
            } else {
                setRows(res.data?.list ?? []);
            }
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
        setDeviceId(''); setAlertType(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const resolveDeviceName = (r) => r.deviceName || devices.find(d => d.imei === r.imei)?.deviceName || r.imei;
    const filtered = alertType ? rows.filter(r => r.name === alertType) : rows;
    const alertTypeOptions = ALERT_TYPE_NAMES.map(n => ({ value: n, label: n }));
    const deviceOptions = devices.map(d => ({ value: d.imei, label: d.deviceName ?? d.imei }));
    const COLS = ['No.','Device Name','IMEI','Alert Type','Speed (km/h)','Alert Time','Coordinates','Evidence'];

    return (
        <div>
            {/* Filter row */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
                <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 6 }}>Alert Time</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff' }}>
                        <span style={{ color: '#9ca3af' }}>🕐</span>
                        <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                            style={{ border: 'none', outline: 'none', fontSize: 13, color: '#374151' }} />
                        <span style={{ color: '#9ca3af' }}>-</span>
                        <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                            style={{ border: 'none', outline: 'none', fontSize: 13, color: '#374151' }} />
                    </div>
                </div>
                <SearchSelect label="Devices" placeholder="All devices" value={deviceId} onChange={setDeviceId} options={deviceOptions} />
                <SearchSelect label="Alert Type" placeholder="All Types" value={alertType} onChange={setAlertType} options={alertTypeOptions} />
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={search} style={{ padding: '9px 22px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="5.5" cy="5.5" r="4"/><line x1="9" y1="9" x2="12" y2="12"/></svg>Search
                    </button>
                    <button onClick={reset} style={{ padding: '9px 18px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Reset</button>
                </div>
            </div>
            {/* Action row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button onClick={() => exportAlertsCsv(filtered)} disabled={!filtered.length}
                        style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: filtered.length ? '#374151' : '#cbd5e1', fontSize: 13, cursor: filtered.length ? 'pointer' : 'not-allowed' }}>Export</button>
                </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
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
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                        ) : filtered.map((r, i) => (
                            <tr key={r.id ?? i}>
                                <td style={TD}>{i + 1}</td>
                                <td style={TD}>{resolveDeviceName(r)}</td>
                                <td style={TD}>{r.imei ?? '—'}</td>
                                <td style={TD}>{alertLabel(r)}</td>
                                <td style={TD}>{r.speed ?? '—'}</td>
                                <td style={TD}>{fmtTime(r.time)}</td>
                                <td style={TD}><LocationLink lat={r.latitude} lon={r.longitude} /></td>
                                <td style={TD}><AttachmentLinks attachments={r.attachments} /></td>
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
    'Tonne-Km Fuel Analytics':       TonneKmAnalytics,
    'Temperature & Humidity':        TemperatureHumidity,
    'Driver Behavior':               DriverBehavior,
    'Driver Behavior (Live)':        DriverBehaviorLive,
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

    // Reports like Replay render a tall absolutely-positioned overlay on top of the map that grows
    // once track data loads; some browsers' scroll-anchoring then keeps the viewport pinned near
    // the bottom of that growth instead of where the user actually was. Force this container back
    // to the top whenever the selected report changes, so it always opens showing the top of the
    // page (the map) rather than wherever the previous report happened to leave the scroll.
    const scrollRef = useRef(null);
    useEffect(() => {
        const resetScroll = () => { if (scrollRef.current) scrollRef.current.scrollTop = 0; };
        resetScroll();
        // Leaflet adjusts its own layout shortly after mount (tile loading, invalidateSize), which
        // can re-trigger the scroll jump after the reset above already ran — catch that too.
        const t = setTimeout(resetScroll, 150);
        return () => clearTimeout(t);
    }, [reportSection]);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
            {/* Header */}
            <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>{reportSection || 'Report'}</h2>
            </div>

            {/* Content */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                <Content />
            </div>
        </div>
    );
}
