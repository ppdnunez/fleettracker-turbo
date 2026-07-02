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
        api.getTurboHiveDevices({ page: 1, size: 100 })
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
        api.getTurboHiveDevices({ page: 1, size: 100 })
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

// Built from TurboHive's GET /v3/obd (OBD telemetry, max 30-day range per query) — Fuel Used and
// Distance are the delta between the first and last point's cumulative totalFuelConsumption /
// odometer readings; Avg Consumption is derived from those two deltas. Only OBD-capable devices
// report these fields — a device without an OBD harness returns no data.
// See TurboHiveService::getObdData (shared with the External Battery report).
function FuelConsumption() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTurboHiveDevices({ page: 1, size: 100 })
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
                if (points.length === 0) {
                    setRows([]);
                } else {
                    const first = points[0], last = points[points.length - 1];
                    const distanceKm = (first.odometer != null && last.odometer != null) ? +(last.odometer - first.odometer).toFixed(2) : null;
                    const fuelUsed = (first.totalFuelConsumption != null && last.totalFuelConsumption != null) ? +(last.totalFuelConsumption - first.totalFuelConsumption).toFixed(2) : null;
                    const avgConsumption = (fuelUsed != null && distanceKm > 0) ? +((fuelUsed / distanceKm) * 100).toFixed(2) : null;
                    setRows([{
                        startTime: first.gateTime, endTime: last.gateTime,
                        distanceKm, fuelUsed, avgConsumption,
                        points: points.length,
                    }]);
                }
            }
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load fuel consumption report.');
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
    const COLS = ['No.', 'Device Name', 'IMEI', 'Start Time', 'End Time', 'Distance (km)', 'Fuel Used (L)', 'Avg Consumption (L/100km)', 'Data Points'];

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
            <Notice color="#dbeafe" icon="ℹ" text="Only OBD-capable devices report fuel data. Fuel Used / Distance are the delta between the first and last reading (max 30-day range per query)." />
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
                            <td style={TD}>{r.distanceKm ?? '—'}</td>
                            <td style={TD}>{r.fuelUsed ?? '—'}</td>
                            <td style={TD}>{r.avgConsumption ?? '—'}</td>
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
        api.getTurboHiveDevices({ page: 1, size: 100 })
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
        api.getTurboHiveDevices({ page: 1, size: 100 })
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

// TurboHive doesn't document a fixed alertType enum for hard-acceleration/braking/cornering the
// way it does for OVERSPEED (see the Overspeed report), so these are classified client-side by
// keyword-matching each alert's type/name/description. This works against both the live MQTT
// alert/{imei} feed and the historical GET /v3/alerts/page response since both are flattened to
// the same field names (type/name/description/latitude/longitude/time/speed) — see
// TurboHiveService::getAlerts and DeviceAlertReceived::broadcastWith. Anything that doesn't match
// one of these keyword groups is excluded from both feeds (e.g. it's an OVERSPEED or geofence alert).
const DRIVER_BEHAVIOR_TYPES = [
    ['harshAcceleration', 'Harsh Acceleration', ['accel']],
    ['harshBraking',      'Harsh Braking',      ['brak', 'decel']],
    ['harshCornering',    'Harsh Cornering',    ['corner', 'turn', 'swerv']],
    ['fatigueDriving',    'Fatigue Driving',     ['fatigue', 'drowsy', 'tired']],
];

function classifyDriverBehavior(r) {
    const text = `${r.type ?? ''} ${r.name ?? ''} ${r.description ?? ''}`.toLowerCase();
    return DRIVER_BEHAVIOR_TYPES.find(([, , keywords]) => keywords.some(k => text.includes(k))) ?? null;
}
function isDriverBehaviorRow(r) {
    return classifyDriverBehavior(r) !== null;
}
function driverBehaviorLabel(r) {
    return classifyDriverBehavior(r)?.[1] ?? r.name ?? r.description ?? 'Unknown';
}

function MqttBadge({ connected }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: '#fff', background: connected ? '#16a34a' : '#94a3b8' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
            MQTT {connected ? 'Live' : 'Connecting…'}
        </span>
    );
}

// Live half: TurboHive pushes driver-behavior alerts over MQTT ({userId}/alert/{imei}) the moment
// its device firmware detects them; mqtt:worker broadcasts every alert as sensor.updated's sibling
// event, alert.received, on the shared 'fleet' Reverb channel (see MqttWorker.php). Historical half:
// GET /v3/alerts/page (see TurboHiveService::getAlerts), same endpoint the Overspeed report uses,
// just without the alertType=OVERSPEED filter and classified client-side instead.
function DriverBehavior() {
    const [devices, setDevices]     = useState([]);
    const [deviceId, setDeviceId]   = useState('');
    const [eventType, setEventType] = useState('');

    const [liveEvents, setLiveEvents]       = useState([]); // newest-first, capped at 30
    const [mqttConnected, setMqttConnected] = useState(false);
    const liveKeyRef = useRef(0);

    const [from, setFrom]       = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]           = useState(() => toLocalInput(new Date()));
    const [rows, setRows]       = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState('');

    useEffect(() => {
        api.getTurboHiveDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    useEffect(() => {
        if (!window.Echo) return;
        const channel = window.Echo.channel('fleet');
        channel.listen('.alert.received', (data) => {
            setMqttConnected(true);
            if (isDriverBehaviorRow(data)) {
                liveKeyRef.current += 1;
                setLiveEvents(evts => [{ ...data, _key: liveKeyRef.current }, ...evts].slice(0, 30));
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
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { startTime: new Date(f).getTime(), endTime: new Date(t).getTime(), page: 1, size: 200 };
            if (dId) params.imeis = [dId];
            const res = await api.getTurboHiveAlerts(params);
            if (res.data?.error) {
                setError(res.data.error);
                setRows([]);
            } else {
                setRows((res.data?.list ?? []).filter(isDriverBehaviorRow));
            }
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

    const byEventType = r => !eventType || classifyDriverBehavior(r)?.[0] === eventType;
    const filteredLive = liveEvents.filter(r => (!deviceId || r.imei === deviceId) && byEventType(r));
    const filteredHistorical = rows.filter(byEventType);

    const deviceName = (imei) => devices.find(d => d.imei === imei)?.deviceName ?? imei;
    const COLS = ['No.', 'Device name', 'IMEI', 'Event Type', 'Speed (km/h)', 'Location', 'Time'];

    const filters = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                <option value="">All devices</option>
                {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
            </select>
            <select value={eventType} onChange={e => setEventType(e.target.value)}
                style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                <option value="">All event types</option>
                {DRIVER_BEHAVIOR_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
        </div>
    );

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h4 style={{ margin: 0, fontSize: 14, color: '#374151' }}>Live Feed</h4>
                <MqttBadge connected={mqttConnected} />
            </div>
            <Notice color="#dbeafe" icon="ℹ" text="Pushed live from TurboHive's MQTT alert topic as devices report them while this page is open — not a full history." />
            {filters}
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900, marginBottom: 28 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {filteredLive.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 32, color: '#94a3b8' }}>Waiting for live events…</td></tr>
                    ) : filteredLive.map((r, i) => (
                        <tr key={r._key}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{deviceName(r.imei)}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{driverBehaviorLabel(r)}</td>
                            <td style={TD}>{r.speed != null ? `${r.speed} km/h` : '—'}</td>
                            <td style={TD}><LocationLink lat={r.latitude} lon={r.longitude} /></td>
                            <td style={TD}>{fmtTime(r.timestamp)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#374151' }}>Historical</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
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
                    ) : filteredHistorical.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    ) : filteredHistorical.map((r, i) => (
                        <tr key={r.id ?? i}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{deviceName(r.imei)}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{driverBehaviorLabel(r)}</td>
                            <td style={TD}>{r.speed != null ? `${r.speed} km/h` : '—'}</td>
                            <td style={TD}><LocationLink lat={r.latitude} lon={r.longitude} /></td>
                            <td style={TD}>{fmtTime(r.time)}</td>
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
        api.getTurboHiveDevices({ page: 1, size: 100 })
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
        api.getTurboHiveDevices({ page: 1, size: 100 })
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
        api.getTurboHiveDevices({ page: 1, size: 100 }).then(res => setDevices(res.data?.data ?? [])).catch(() => {});
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
                api.getTurboHiveAlerts({ startTime, endTime, imeis: [deviceId], page: 1, size: 200 }),
            ]);
            if (trackRes.data?.error) {
                setError(trackRes.data.error);
                setPoints([]);
                setBehaviorEvents([]);
            } else {
                const pts = [...(trackRes.data?.list ?? [])].sort((a, b) => (a.deviceTime ?? 0) - (b.deviceTime ?? 0));
                setPoints(pts);
                setBehaviorEvents((eventsRes.data?.list ?? []).filter(isDriverBehaviorRow));
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
        ? behaviorEvents.filter(r => classifyDriverBehavior(r)?.[0] === alertType)
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
                                <Popup>{driverBehaviorLabel(r)}<br />{fmtTime(r.time)}</Popup>
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
        api.getTurboHiveDevices({ page: 1, size: 100 })
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
        api.getTurboHiveDevices({ page: 1, size: 100 })
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
        api.getTurboHiveDevices({ page: 1, size: 100 })
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
        api.getTurboHiveDevices({ page: 1, size: 100 })
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
        api.getTurboHiveDevices({ page: 1, size: 100 })
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
        api.getTurboHiveDevices({ page: 1, size: 100 })
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
