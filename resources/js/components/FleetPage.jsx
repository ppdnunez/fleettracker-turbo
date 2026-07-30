import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import MapCanvas from './MapCanvas.jsx';
import ReportPage from './ReportPage.jsx';
import GeofenceManagementPage from './GeofencePage.jsx';
import FaceRecognitionPage from './FaceRecognitionPage.jsx';
import FuelPricePage from './FuelPricePage.jsx';
import { turboHiveEnabled, connectTurboHiveMqtt, applyTurboHivePosition } from '../turbohive-mqtt.js';
import { VEHICLE_TYPES } from '../vehicleIcons.js';
import { FUEL_TYPES } from '../fuelTypes.js';

/* ── icons ───────────────────────────────────────────────────── */
const SearchSVG = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="5.5" cy="5.5" r="4"/><line x1="9" y1="9" x2="12" y2="12"/>
    </svg>
);
const DownloadSVG = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M6.5 1v7M4 6l2.5 2.5L9 6"/>
        <path d="M1 10v1.5A1.5 1.5 0 0 0 2.5 13h8A1.5 1.5 0 0 0 12 11.5V10"/>
    </svg>
);
const ColPickSVG = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="4" height="4" rx="1"/><rect x="6" y="1" width="4" height="4" rx="1"/><rect x="11" y="1" width="2" height="4" rx="0.5"/>
        <rect x="1" y="7" width="4" height="4" rx="1"/><rect x="6" y="7" width="4" height="4" rx="1"/><rect x="11" y="7" width="2" height="4" rx="0.5"/>
    </svg>
);
const PersonSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="#5b21b6" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="7.5" cy="5" r="3.2"/>
        <path d="M1 14.5 Q1.5 10 7.5 10 Q13.5 10 14 14.5"/>
    </svg>
);
const CollapseArrow = ({ open }) => (
    <svg width="7" height="11" viewBox="0 0 7 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {open ? <polyline points="5.5,1 1.5,5.5 5.5,10"/> : <polyline points="1.5,1 5.5,5.5 1.5,10"/>}
    </svg>
);

/* ── shared style primitives (match ReportPage) ─────────────── */
const TH = (dark) => ({ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: dark ? '#94a3b8' : '#374151', borderBottom: `2px solid ${dark ? '#1e293b' : '#e5e7eb'}`, whiteSpace: 'nowrap', background: dark ? '#0f172a' : '#f9fafb' });
const TD = (dark) => ({ padding: '11px 14px', fontSize: 13, borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, color: dark ? '#e2e8f0' : '#374151' });

/* ── shared sub-components (match ReportPage style) ─────────── */
function FilterBar({ children, dark }) {
    return (
        <div style={{ background: dark ? '#111827' : '#f9fafb', border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            {children}
        </div>
    );
}
function FInput({ label, placeholder, type = 'text', style, value, onChange, dark }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {label && <label style={{ fontSize: 12, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600 }}>{label}</label>}
            <input type={type} placeholder={placeholder} value={value} onChange={onChange} style={{ padding: '7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#111827', ...style }} />
        </div>
    );
}
function FSel({ label, placeholder, options = [], dark }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {label && <label style={{ fontSize: 12, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600 }}>{label}</label>}
            <select style={{ padding: '7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#374151', cursor: 'pointer' }}>
                <option value="">{placeholder || 'Please select'}</option>
                {options.map(o => <option key={o}>{o}</option>)}
            </select>
        </div>
    );
}
function SearchBtn() {
    return (
        <button style={{ padding: '7px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <SearchSVG />Search
        </button>
    );
}
function ResetBtn({ dark }) {
    return <button style={{ padding: '7px 14px', background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#374151', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>;
}
function Btn({ children, primary, red, onClick, dark }) {
    return (
        <button onClick={onClick} style={{ padding: '7px 16px', borderRadius: 6, border: primary ? 'none' : red ? '1px solid #ef4444' : `1px solid ${dark ? '#334155' : '#d1d5db'}`, background: primary ? '#3b82f6' : (dark ? '#111827' : '#fff'), color: primary ? '#fff' : red ? '#ef4444' : (dark ? '#e2e8f0' : '#374151'), fontSize: 13, cursor: 'pointer', fontWeight: primary ? 600 : 400, whiteSpace: 'nowrap' }}>
            {children}
        </button>
    );
}
function DropBtn({ children, dark }) {
    return <button style={{ padding: '7px 12px', borderRadius: 6, border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#374151', fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>{children} <span style={{ fontSize: 9 }}>▼</span></button>;
}
function ActionRow({ left, right, hideExport, dark }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap' }}>{left}</div>
            <div style={{ display: 'flex', gap: 6 }}>
                {right}
                {!hideExport && (
                    <>
                        <button style={{ padding: '6px 14px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#374151', fontSize: 13, cursor: 'pointer' }}>Export</button>
                        <button style={{ padding: '6px 8px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 12 }}><ColPickSVG />▾</button>
                    </>
                )}
            </div>
        </div>
    );
}
function TabBar({ tabs, active, onChange, dark }) {
    return (
        <div style={{ display: 'flex', borderBottom: `2px solid ${dark ? '#1e293b' : '#e5e7eb'}`, marginBottom: 16 }}>
            {tabs.map(t => (
                <button key={t} onClick={() => onChange(t)} style={{ padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: active === t ? 700 : 500, color: active === t ? (dark ? '#60a5fa' : '#3b82f6') : (dark ? '#94a3b8' : '#6b7280'), borderBottom: active === t ? `2.5px solid ${dark ? '#60a5fa' : '#3b82f6'}` : '2.5px solid transparent', marginBottom: -2 }}>
                    {t}
                </button>
            ))}
        </div>
    );
}
function EmptyTable({ cols, rows, dark }) {
    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead><tr>{cols.map(c => <th key={c} style={TH(dark)}>{c}</th>)}</tr></thead>
                <tbody>
                    {rows && rows.length ? rows.map((r, i) => (
                        <tr key={i}>{r.map((cell, j) => <td key={j} style={TD(dark)}>{cell}</td>)}</tr>
                    )) : (
                        <tr><td colSpan={cols.length} style={{ ...TD(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
function PageShell({ title, children, dark }) {
    return (
        <div style={{ flex: 1, overflowY: 'auto', background: dark ? '#0b1220' : '#fff', padding: '16px 24px' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: dark ? '#f1f5f9' : '#111827' }}>{title}</h2>
            {children}
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  Fleet Dashboard helpers                                        */
/* ══════════════════════════════════════════════════════════════ */

function StatCard({ label, value, sub, dark }) {
    return (
        <div style={{ flex: 1, background: dark ? '#111827' : '#fff', borderRadius: 10, border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, padding: '14px 16px', boxShadow: dark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 12.5, color: dark ? '#94a3b8' : '#6b7280', marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: dark ? '#f1f5f9' : '#111827' }}>{value ?? 0}</div>
            {sub && <div style={{ fontSize: 11, color: dark ? '#64748b' : '#9ca3af', marginTop: 4 }}>{sub}</div>}
        </div>
    );
}

/* Simple solid pie chart (CSS conic-gradient), built from real counts */
function Donut({ segments, dark }) {
    const total = segments.reduce((s, seg) => s + seg.count, 0);
    let acc = 0;
    const stops = total > 0
        ? segments.filter(s => s.count > 0).map(seg => {
            const start = acc;
            acc += (seg.count / total) * 100;
            return `${seg.color} ${start}% ${acc}%`;
        }).join(', ')
        : `${dark ? '#1e293b' : '#f1f5f9'} 0% 100%`;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 110, height: 110, borderRadius: '50%', flexShrink: 0, background: `conic-gradient(${stops})` }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: dark ? '#e2e8f0' : '#374151' }}>
                {segments.map(seg => (
                    <span key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: seg.color, display: 'inline-block' }} />
                        {seg.label}<span style={{ color: dark ? '#64748b' : '#9ca3af' }}>{total > 0 ? `${Math.round(seg.count / total * 100)}%` : '0%'}</span>
                    </span>
                ))}
                {total === 0 && <span style={{ color: dark ? '#64748b' : '#9ca3af' }}>No data</span>}
            </div>
        </div>
    );
}

const REMINDER_DONUT_COLORS = { Normal: '#3b82f6', Expired: '#ef4444', 'Expiring soon': '#f59e0b' };

/* Real license (Driver) / safety-sticker (VehicleSetting, per IMEI) expiry status — same
   daysUntil/expiryReminder helpers Driver/Vehicle Settings use. */
function ReminderCard({ drivers, vehicleSettings, dark }) {
    const [tab, setTab] = useState('License');
    const counts = { Normal: 0, Expired: 0, 'Expiring soon': 0 };
    if (tab === 'License') {
        drivers.forEach(d => {
            const status = expiryReminder(d.license_expiry, d.notify_days_before);
            if (counts[status] !== undefined) counts[status]++;
        });
    } else if (tab === 'Safety Sticker') {
        vehicleSettings.forEach(v => {
            const status = expiryReminder(v.safety_sticker_expiry, v.sticker_notify_days_before);
            if (counts[status] !== undefined) counts[status]++;
        });
    } else {
        vehicleSettings.forEach(v => {
            const status = expiryReminder(v.sim_data_expiry, v.sim_notify_days_before);
            if (counts[status] !== undefined) counts[status]++;
        });
    }
    const segments = Object.entries(counts).map(([label, count]) => ({ label, count, color: REMINDER_DONUT_COLORS[label] }));

    return (
        <div style={{ flex: 1, background: dark ? '#111827' : '#fff', borderRadius: 10, border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, padding: '14px 16px', boxShadow: dark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: dark ? '#f1f5f9' : '#111827', marginBottom: 8 }}>Reminder</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                {['License', 'Safety Sticker', 'SIM Data'].map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', padding: '0 0 3px', fontSize: 12.5, cursor: 'pointer', color: tab === t ? (dark ? '#60a5fa' : '#3b82f6') : (dark ? '#64748b' : '#9ca3af'), borderBottom: tab === t ? `2px solid ${dark ? '#60a5fa' : '#3b82f6'}` : '2px solid transparent' }}>{t} reminder</button>
                ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
                <Donut segments={segments} dark={dark} />
            </div>
        </div>
    );
}

/* Latest raw TurboHive alerts — real, not a mock list. */
function RecentAlertsCard({ alerts, devicesByImei, dark }) {
    return (
        <div style={{ flex: 1, background: dark ? '#111827' : '#fff', borderRadius: 10, border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, padding: '14px 16px', boxShadow: dark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: dark ? '#f1f5f9' : '#111827', marginBottom: 8 }}>Recent Alerts</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 190, overflowY: 'auto' }}>
                {alerts.length === 0 ? (
                    <p style={{ textAlign: 'center', color: dark ? '#64748b' : '#9ca3af', fontSize: 13, padding: '24px 0' }}>No alerts</p>
                ) : alerts.slice(0, 6).map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: `1px solid ${dark ? '#1e293b' : '#f8fafc'}`, fontSize: 12.5 }}>
                        <div>
                            <div style={{ fontWeight: 600, color: dark ? '#e2e8f0' : '#374151' }}>{a.name || `Code ${a.code}`}</div>
                            <div style={{ color: dark ? '#64748b' : '#9ca3af', fontSize: 11.5 }}>{devicesByImei[a.imei]?.deviceName || a.imei}</div>
                        </div>
                        <span style={{ color: dark ? '#64748b' : '#9ca3af', fontSize: 11, whiteSpace: 'nowrap' }}>{a.time ? new Date(a.time).toLocaleString() : '—'}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* Real per-vehicle alert counts (last 100 alerts fetched), not fixed fake plate numbers. */
function AlarmRankingCard({ alerts, devicesByImei, dark }) {
    const counts = {};
    alerts.forEach(a => { counts[a.imei] = (counts[a.imei] || 0) + 1; });
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return (
        <div style={{ flex: 1, background: dark ? '#111827' : '#fff', borderRadius: 10, border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, padding: '14px 16px', boxShadow: dark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: dark ? '#f1f5f9' : '#111827', marginBottom: 10 }}>Alarm statistics ranking (by vehicle)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 80px', fontSize: 12, fontWeight: 600, color: dark ? '#94a3b8' : '#6b7280', paddingBottom: 6, borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}` }}>
                <span>Rank</span><span>Vehicle</span><span style={{ textAlign: 'right' }}>Alert Count</span>
            </div>
            {ranked.length === 0 ? (
                <p style={{ textAlign: 'center', color: dark ? '#64748b' : '#9ca3af', fontSize: 13, padding: '24px 0' }}>No alerts</p>
            ) : ranked.map(([imei, count], i) => (
                <div key={imei} style={{ display: 'grid', gridTemplateColumns: '50px 1fr 80px', fontSize: 13, color: dark ? '#e2e8f0' : '#374151', padding: '7px 0', borderBottom: `1px solid ${dark ? '#1e293b' : '#f8fafc'}` }}>
                    <span>{i + 1}</span><span>{devicesByImei[imei]?.deviceName || imei}</span><span style={{ textAlign: 'right', fontWeight: 600 }}>{count}</span>
                </div>
            ))}
        </div>
    );
}

/* Today's mileage per vehicle — real, from TurboHive's GET /v3/mileage/realtime (categorical bar,
   not a fabricated time series — TurboHive's realtime endpoint isn't a date-range report). */
function MileageBarCard({ mileageRows, devicesByImei, dark }) {
    const rows = mileageRows.filter(r => (r.todayMileage || 0) > 0);
    const max = Math.max(1, ...rows.map(r => r.todayMileage || 0));
    return (
        <div style={{ flex: 1, background: dark ? '#111827' : '#fff', borderRadius: 10, border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, padding: '14px 16px', boxShadow: dark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: dark ? '#f1f5f9' : '#111827', marginBottom: 10 }}>Today's Mileage by Vehicle (km)</div>
            {rows.length === 0 ? (
                <p style={{ textAlign: 'center', color: dark ? '#64748b' : '#9ca3af', fontSize: 13, padding: '24px 0' }}>No mileage recorded yet today</p>
            ) : (
                <div style={{ height: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start', gap: 10, padding: '12px 4px 0' }}>
                    {rows.map(r => (
                        <div key={r.imei} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 46 }}>
                            <span style={{ fontSize: 11, color: dark ? '#e2e8f0' : '#374151', marginBottom: 3 }}>{r.todayMileage.toFixed(1)}</span>
                            <div style={{ width: '100%', background: dark ? 'rgba(59,130,246,0.35)' : '#dbeafe', borderRadius: '3px 3px 0 0', height: `${(r.todayMileage / max) * 80}%`, minHeight: 2 }} />
                            <span style={{ fontSize: 10.5, color: dark ? '#64748b' : '#9ca3af', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 46 }}>
                                {devicesByImei[r.imei]?.deviceName || r.imei}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  Fleet sub-pages                                               */
/* ══════════════════════════════════════════════════════════════ */

const ALARM_TYPE_PALETTE = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#ec4899'];

// Real fleet dashboard — Total Drivers/Vehicles from the local Driver registry and TurboHive's
// trackable device list; mileage from GET /v3/mileage/realtime; alerts (type ratio, per-vehicle
// ranking, recent list) from GET /v3/alerts/page. Anything TurboHive has no simple aggregate for
// (fuel consumption, exercise/idle/parked duration — all would need per-device date-range queries)
// was removed rather than left as fabricated placeholder data.
function FleetDashboard({ dark }) {
    const [drivers,  setDrivers]  = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [vehicleSettings, setVehicleSettings] = useState([]);
    const [mileage,  setMileage]  = useState([]);
    const [alerts,   setAlerts]   = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState('');

    useEffect(() => {
        (async () => {
            setLoading(true);
            setError('');
            try {
                const [drvRes, vehRes, settingsRes, mileRes, alertRes] = await Promise.all([
                    api.getFleetDrivers(),
                    api.getTurboHiveTrackableDevices({ page: 1, size: 100 }),
                    api.getVehicleSettings().catch(() => ({ data: [] })),
                    api.getTurboHiveRealtimeMileage({ page: 1, size: 100 }),
                    api.getTurboHiveAlerts({ page: 1, size: 100 }),
                ]);
                setDrivers(Array.isArray(drvRes.data) ? drvRes.data : []);
                setVehicles(Array.isArray(vehRes.data?.data) ? vehRes.data.data : []);
                setVehicleSettings(Array.isArray(settingsRes.data) ? settingsRes.data : []);
                setMileage(Array.isArray(mileRes.data?.data) ? mileRes.data.data : []);
                setAlerts(Array.isArray(alertRes.data?.list) ? alertRes.data.list : []);
            } catch (e) {
                setError('Failed to load dashboard data.');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const devicesByImei = {};
    vehicles.forEach(v => { devicesByImei[v.imei] = v; });

    const onlineCount   = vehicles.filter(v => v.onlineStatus === 1).length;
    const todayMileage  = mileage.reduce((sum, r) => sum + (r.todayMileage || 0), 0);
    const sevenDaysAgo  = Date.now() - 7 * 24 * 3600 * 1000;
    const recentAlerts  = alerts.filter(a => (a.time || 0) >= sevenDaysAgo);

    const alertTypeCounts = {};
    alerts.forEach(a => { const label = a.name || `Code ${a.code}`; alertTypeCounts[label] = (alertTypeCounts[label] || 0) + 1; });
    const alertTypeSegments = Object.entries(alertTypeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, count], i) => ({ label, count, color: ALARM_TYPE_PALETTE[i % ALARM_TYPE_PALETTE.length] }));

    if (loading) {
        return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Loading dashboard…</div>;
    }

    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: dark ? '#0b1220' : '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: dark ? '#f1f5f9' : '#111827' }}>Dashboard</h2>
            </div>

            {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? 'rgba(239,68,68,0.4)' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>{error}</div>}

            {/* Hero + stat cards */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 2, background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)', borderRadius: 10, padding: '20px 24px', color: '#fff', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 40, marginBottom: 10 }}>
                        <div><div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Total Drivers</div><div style={{ fontSize: 36, fontWeight: 800 }}>{drivers.length}</div></div>
                        <div><div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Total Vehicles</div><div style={{ fontSize: 36, fontWeight: 800 }}>{vehicles.length}</div></div>
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>Updated {new Date().toLocaleString()}</div>
                </div>
                <StatCard label="Online Vehicles" value={`${onlineCount} / ${vehicles.length}`} dark={dark} />
                <StatCard label="Driven Distance Today (km)" value={todayMileage.toFixed(1)} sub={mileage.length === 0 ? 'No devices with mileage enabled' : undefined} dark={dark} />
                <StatCard label="Alerts (Last 7 Days)" value={recentAlerts.length} dark={dark} />
            </div>

            {/* Reminder + Recent Alerts */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <ReminderCard drivers={drivers} vehicleSettings={vehicleSettings} dark={dark} />
                <RecentAlertsCard alerts={alerts} devicesByImei={devicesByImei} dark={dark} />
            </div>

            {/* Alarm type + Alarm ranking */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1, background: dark ? '#111827' : '#fff', borderRadius: 10, border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, padding: '14px 16px', boxShadow: dark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: dark ? '#f1f5f9' : '#111827', marginBottom: 8 }}>Alarm type ratio</div>
                    <Donut segments={alertTypeSegments} dark={dark} />
                </div>
                <AlarmRankingCard alerts={alerts} devicesByImei={devicesByImei} dark={dark} />
            </div>

            {/* Mileage */}
            <MileageBarCard mileageRows={mileage} devicesByImei={devicesByImei} dark={dark} />
        </div>
    );
}

/* Driver */
const DEFAULT_NOTICE_DAYS = 14;

function daysUntil(dateStr) {
    if (!dateStr) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((new Date(dateStr) - today) / 86400000);
}
function licenseStatus(dateStr) {
    if (!dateStr) return '—';
    return daysUntil(dateStr) < 0 ? 'Expired' : 'Valid';
}
function expiryReminder(dateStr, notifyDays) {
    if (!dateStr) return '—';
    const days = daysUntil(dateStr);
    if (days < 0) return 'Expired';
    if (days <= (notifyDays ?? DEFAULT_NOTICE_DAYS)) return 'Expiring soon';
    return 'Normal';
}
const REMINDER_COLOR = { Expired: '#ef4444', 'Expiring soon': '#f59e0b', Normal: '#16a34a', '—': '#9ca3af' };
const STATUS_COLOR    = { Expired: '#ef4444', Valid: '#16a34a', '—': '#9ca3af' };

function Badge({ text, color, dark }) {
    return <span style={{ fontSize: 12, fontWeight: 600, color, background: `${color}${dark ? '33' : '1a'}`, padding: '2px 8px', borderRadius: 999 }}>{text}</span>;
}

const driverFieldStyle = { display: 'flex', flexDirection: 'column', gap: 4 };
const driverInputStyle = (dark) => ({ padding: '7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box', width: '100%', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a' });
const driverLabelStyle = (dark) => ({ fontSize: 11.5, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600 });

function DriverFormModal({ driver, onClose, onSaved, dark }) {
    const isNew = !driver;
    const [form, setForm] = useState({
        badge_no: driver?.badge_no || '',
        name: driver?.name || '',
        phone: driver?.phone || '',
        license_no: driver?.license_no || '',
        rfid_card_no: driver?.rfid_card_no || '',
        ibutton_no: driver?.ibutton_no || '',
        register_place: driver?.register_place || '',
        register_date: driver?.register_date ? driver.register_date.slice(0, 10) : '',
        license_expiry: driver?.license_expiry ? driver.license_expiry.slice(0, 10) : '',
        notify_days_before: driver?.notify_days_before ?? '',
        status: driver?.status || 'Active',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

    const handleSave = async () => {
        if (!form.badge_no.trim() || !form.name.trim()) { setError('Driver No. and Driver Name are required.'); return; }
        setSaving(true);
        setError('');
        const payload = { ...form, notify_days_before: form.notify_days_before === '' ? null : Number(form.notify_days_before) };
        try {
            if (isNew) {
                await api.createFleetDriver(payload);
            } else {
                await api.updateFleetDriver(driver.id, payload);
            }
            onSaved();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to save driver.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, width: 480, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}` }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>{isNew ? 'New Driver' : 'Edit Driver'}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#64748b' : '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {error && <div style={{ gridColumn: '1 / -1', padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? 'rgba(239,68,68,0.4)' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>{error}</div>}

                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle(dark)}>Driver No. *</label>
                        <input value={form.badge_no} onChange={set('badge_no')} disabled={!isNew} style={{ ...driverInputStyle(dark), background: isNew ? (dark ? '#1e293b' : '#fff') : (dark ? '#0f172a' : '#f3f4f6') }} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle(dark)}>Driver Name *</label>
                        <input value={form.name} onChange={set('name')} style={driverInputStyle(dark)} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle(dark)}>Phone</label>
                        <input value={form.phone} onChange={set('phone')} style={driverInputStyle(dark)} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle(dark)}>License No.</label>
                        <input value={form.license_no} onChange={set('license_no')} style={driverInputStyle(dark)} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle(dark)}>RFID Card No.</label>
                        <input value={form.rfid_card_no} onChange={set('rfid_card_no')} style={driverInputStyle(dark)} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle(dark)}>iButton No.</label>
                        <input value={form.ibutton_no} onChange={set('ibutton_no')} placeholder="Card number on the iButton fob" style={driverInputStyle(dark)} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle(dark)}>Register Place</label>
                        <input value={form.register_place} onChange={set('register_place')} style={driverInputStyle(dark)} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle(dark)}>Register Date</label>
                        <input type="date" value={form.register_date} onChange={set('register_date')} style={driverInputStyle(dark)} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle(dark)}>Status</label>
                        <select value={form.status} onChange={set('status')} style={{ ...driverInputStyle(dark), background: dark ? '#1e293b' : '#fff', cursor: 'pointer' }}>
                            <option>Active</option>
                            <option>Inactive</option>
                        </select>
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle(dark)}>License Expiry</label>
                        <input type="date" value={form.license_expiry} onChange={set('license_expiry')} style={driverInputStyle(dark)} />
                    </div>
                    <div style={{ ...driverFieldStyle, gridColumn: '1 / -1' }}>
                        <label style={driverLabelStyle(dark)}>Notify before expiry (days)</label>
                        <input type="number" min="1" max="365" placeholder={`Default ${DEFAULT_NOTICE_DAYS}`} value={form.notify_days_before} onChange={set('notify_days_before')} style={{ ...driverInputStyle(dark), maxWidth: 200 }} />
                    </div>
                </div>

                <div style={{ padding: '12px 20px', borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`, background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Face enrollment happens on the JC171 dashcam itself (EVENTSET,FACE,SHOT captures and stores the
// photo locally on-device) — there's no local photo preview here, just the command trigger and
// FleetTrack's own tracking of what we last asked the device to do (see DriverFaceController).
// Captures a still photo via the office/laptop webcam (getUserMedia + a canvas snapshot) as an
// alternative to EVENTSET,FACE,SHOT for drivers who aren't near their vehicle yet. The photo is
// uploaded to our own server and pushed to the device via EVENTSET,FACE,DOWN (bulk-import from a
// URL) — see DriverFaceController::uploadFromCamera for the unconfirmed zip-vs-single-file caveat.
function FaceCameraCapture({ onCancel, onCaptured, dark }) {
    const videoRef  = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const [ready, setReady]     = useState(false);
    const [error, setError]     = useState('');
    const [previewUrl, setPreviewUrl] = useState('');
    const [previewBlob, setPreviewBlob] = useState(null);

    useEffect(() => {
        let cancelled = false;

        if (!navigator.mediaDevices?.getUserMedia) {
            setError('Camera access requires a secure connection (HTTPS or localhost) and a supported browser.');
            return;
        }

        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
            .then(stream => {
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play().catch(() => {});
                }
                setReady(true);
            })
            .catch(() => setError('Could not access the camera — check browser permissions.'));

        return () => {
            cancelled = true;
            streamRef.current?.getTracks().forEach(t => t.stop());
        };
    }, []);

    const takePhoto = () => {
        const video = videoRef.current, canvas = canvasRef.current;
        if (!video || !canvas) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        canvas.toBlob(blob => {
            if (!blob) return;
            setPreviewBlob(blob);
            setPreviewUrl(URL.createObjectURL(blob));
        }, 'image/jpeg', 0.92);
    };

    const retake = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl('');
        setPreviewBlob(null);
    };

    return (
        <div>
            {error && <div style={{ marginBottom: 10, padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? 'rgba(239,68,68,0.4)' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>{error}</div>}

            <div style={{ background: '#111827', borderRadius: 8, aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                {previewUrl ? (
                    <img src={previewUrl} alt="Captured preview" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                ) : (
                    <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, display: ready ? 'block' : 'none' }} />
                )}
                {!ready && !previewUrl && !error && <p style={{ color: '#94a3b8', fontSize: 12.5 }}>Requesting camera…</p>}
            </div>
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            <div style={{ display: 'flex', gap: 8 }}>
                {previewUrl ? (
                    <>
                        <button onClick={retake} style={{ flex: 1, padding: '8px 14px', borderRadius: 7, border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`, background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Retake</button>
                        <button onClick={() => onCaptured(previewBlob)} style={{ flex: 1, padding: '8px 14px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Use This Photo</button>
                    </>
                ) : (
                    <>
                        <button onClick={onCancel} style={{ flex: 1, padding: '8px 14px', borderRadius: 7, border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`, background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                        <button disabled={!ready} onClick={takePhoto} style={{ flex: 1, padding: '8px 14px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: ready ? 'pointer' : 'not-allowed' }}>Take Photo</button>
                    </>
                )}
            </div>
        </div>
    );
}

// Raw test of TurboHive's face-image ingest API (POST /face/uploadPic — see face-upload-api.md)
// — no photo capture/selection, just a file name (e.g. "22222-Jerome") sent as the multipart
// "file" field's filename with empty content, so the real TurboHive response (code 200/400/403/
// 500, exactly as documented) can be inspected directly, e.g. to verify the host/signature are
// right. See DriverFaceController::testUploadToTurboHive — nothing is stored locally.
function FacePhotoPicker({ imei, onCancel, dark }) {
    const [fileName, setFileName] = useState('');
    const [sending, setSending]   = useState(false);
    const [response, setResponse] = useState(null); // { code, message, data } from TurboHive
    const [error, setError]       = useState('');

    const submit = async () => {
        if (!fileName.trim()) { setError('Enter a file name.'); return; }
        setSending(true);
        setError('');
        setResponse(null);
        try {
            const res = await api.testUploadFaceFileName(imei, fileName.trim());
            setResponse(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Request failed.');
        } finally {
            setSending(false);
        }
    };

    const codeColor = response?.code === 200 ? '#16a34a' : '#dc2626';

    return (
        <div>
            {error && <div style={{ marginBottom: 10, padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? 'rgba(239,68,68,0.4)' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>{error}</div>}

            <div style={driverFieldStyle}>
                <label style={driverLabelStyle(dark)}>File Name</label>
                <input value={fileName} onChange={e => setFileName(e.target.value)} placeholder="e.g. 22222-Jerome" style={driverInputStyle(dark)} />
                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#9ca3af' }}>
                    Sent as-is to TurboHive's face upload API (imei={imei || '—'}) — no photo bytes, just this name.
                </p>
            </div>

            {response?._request && (
                <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, background: dark ? '#111827' : '#f9fafb' }}>
                    <div style={{ fontWeight: 700, color: dark ? '#e2e8f0' : '#374151', marginBottom: 6, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>Request Sent to TurboHive</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <tbody>
                            {Object.entries(response._request).map(([k, v]) => (
                                <tr key={k}>
                                    <td style={{ padding: '3px 8px 3px 0', color: dark ? '#94a3b8' : '#6b7280', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{k}</td>
                                    <td style={{ padding: '3px 0', color: dark ? '#f1f5f9' : '#111827', fontWeight: 500, wordBreak: 'break-all', fontFamily: 'monospace' }}>{String(v)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {response && (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${codeColor}`, background: dark ? '#111827' : '#f9fafb' }}>
                    <div style={{ fontWeight: 700, color: dark ? '#e2e8f0' : '#374151', marginBottom: 6, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>Response from TurboHive</div>
                    <div style={{ fontWeight: 700, color: codeColor, marginBottom: 4, fontSize: 13 }}>Code {response.code}</div>
                    <div style={{ fontSize: 13, color: dark ? '#e2e8f0' : '#374151' }}>{response.message}</div>
                    {response.data && <div style={{ fontSize: 12, color: dark ? '#94a3b8' : '#6b7280', marginTop: 4 }}>data: {response.data}</div>}
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={onCancel} style={{ flex: 1, padding: '8px 14px', borderRadius: 7, border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`, background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
                <button onClick={submit} disabled={sending} style={{ flex: 1, padding: '8px 14px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer' }}>
                    {sending ? 'Sending…' : 'Upload to TurboHive'}
                </button>
            </div>
        </div>
    );
}

function DriverFaceModal({ driver, onClose, dark }) {
    const imeis = driver.imeis || [];
    const [imei, setImei]       = useState(imeis[0] || '');
    const [faces, setFaces]     = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy]       = useState(false);
    const [error, setError]     = useState('');
    const [message, setMessage] = useState('');
    const [cameraOpen, setCameraOpen] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);

    const fetchFaces = async () => {
        setLoading(true);
        try {
            const res = await api.getDriverFaces({ driver_id: driver.id });
            setFaces(res.data);
        } catch (e) {
            setError('Failed to load face-enrollment status.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchFaces(); }, []);

    const run = async (fn, successMsg) => {
        if (!imei) { setError('Select a vehicle (IMEI) first.'); return; }
        setBusy(true); setError(''); setMessage('');
        try {
            await fn();
            setMessage(successMsg);
            await fetchFaces();
        } catch (e) {
            setError(e.response?.data?.message || 'Command failed.');
        } finally {
            setBusy(false);
        }
    };

    const handleCaptured = async (blob) => {
        setCameraOpen(false);
        setPickerOpen(false);
        await run(() => api.uploadDriverFaceToTurboHive(driver.id, imei, blob), 'Photo uploaded to TurboHive.');
    };

    const current = faces.find(f => f.imei === imei);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, width: 420, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}` }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>Face Enrollment — {driver.name}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#64748b' : '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20 }}>
                    {error && <div style={{ marginBottom: 14, padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? 'rgba(239,68,68,0.4)' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>{error}</div>}
                    {message && <div style={{ marginBottom: 14, padding: '8px 12px', background: dark ? 'rgba(34,197,94,0.15)' : '#f0fdf4', border: `1px solid ${dark ? 'rgba(34,197,94,0.4)' : '#bbf7d0'}`, borderRadius: 6, fontSize: 12, color: dark ? '#86efac' : '#166534' }}>{message}</div>}

                    {imeis.length === 0 ? (
                        <p style={{ fontSize: 13, color: '#94a3b8' }}>This driver isn't assigned to a vehicle yet — assign one first under Vehicle &gt; Assign Drivers.</p>
                    ) : cameraOpen ? (
                        <FaceCameraCapture onCancel={() => setCameraOpen(false)} onCaptured={handleCaptured} dark={dark} />
                    ) : pickerOpen ? (
                        <FacePhotoPicker imei={imei} onCancel={() => setPickerOpen(false)} dark={dark} />
                    ) : (
                        <>
                            <div style={{ marginBottom: 14 }}>
                                <label style={driverLabelStyle(dark)}>Vehicle (IMEI)</label>
                                <select value={imei} onChange={e => setImei(e.target.value)} style={{ ...driverInputStyle(dark), background: dark ? '#1e293b' : '#fff', cursor: 'pointer' }}>
                                    {imeis.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>

                            <div style={{ marginBottom: 14, padding: '10px 12px', background: dark ? '#111827' : '#f9fafb', border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 8, fontSize: 12.5, color: dark ? '#e2e8f0' : '#111827' }}>
                                <strong>Status:</strong> {loading ? 'Loading…' : (current?.status || 'Not enrolled')}
                                {current?.error && <div style={{ color: dark ? '#fca5a5' : '#991b1b', marginTop: 4 }}>{current.error}</div>}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <button disabled={busy} onClick={() => run(() => api.enrollDriverFace(driver.id, imei), 'Enroll command sent — device will capture a live photo.')}
                                    style={{ padding: '9px 14px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>
                                    Enroll Face (Device Camera)
                                </button>
                                <button disabled={busy} onClick={() => { setError(''); setMessage(''); setCameraOpen(true); }}
                                    style={{ padding: '9px 14px', borderRadius: 7, border: '1.5px solid #3b82f6', background: dark ? '#111827' : '#fff', color: '#60a5fa', fontSize: 13, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>
                                    Enroll Face (Laptop Camera)
                                </button>
                                <button disabled={busy} onClick={() => { setError(''); setMessage(''); setPickerOpen(true); }}
                                    style={{ padding: '9px 14px', borderRadius: 7, border: '1.5px solid #3b82f6', background: dark ? '#111827' : '#fff', color: '#60a5fa', fontSize: 13, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>
                                    Upload Photo (Test by File Name)
                                </button>
                                <button disabled={busy} onClick={() => run(() => api.testDriverFace(imei), 'Recognition test triggered.')}
                                    style={{ padding: '9px 14px', borderRadius: 7, border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`, background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#374151', fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                                    Test Recognition Now
                                </button>
                                <button disabled={busy} onClick={() => run(() => api.deleteDriverFace(driver.id, imei), 'Delete command sent.')}
                                    style={{ padding: '9px 14px', borderRadius: 7, border: '1.5px solid #fecaca', background: dark ? '#111827' : '#fff', color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                                    Delete Enrolled Face
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// FleetTrack-local driver registry (Approach 2): GET/POST/PUT/DELETE /api/drivers, which keeps a
// matching Traccar driver in sync server-side (DriverController) so the device<->driver link still
// works through Traccar elsewhere in the app. License status badges are computed from each
// driver's license_expiry; the same date drives the "drivers:notify-expirations" scheduled email
// reminder on the backend. (Safety sticker/insurance expiry live on the vehicle's own settings
// now — see VehicleFormModal.)
function DriverStatCard({ label, value, sublabel, color, dark }) {
    return (
        <div style={{ background: dark ? '#111827' : '#fff', border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 10, padding: '14px 16px', minWidth: 0 }}>
            <p style={{ margin: '0 0 6px', fontSize: 11.5, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</p>
            <p style={{ margin: 0, fontSize: 21, fontWeight: 700, color: color || (dark ? '#f1f5f9' : '#111827') }}>{value}</p>
            {sublabel && <p style={{ margin: '4px 0 0', fontSize: 11, color: dark ? '#64748b' : '#94a3b8' }}>{sublabel}</p>}
        </div>
    );
}

function DetailRow({ label, value, extra, dark }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ color: dark ? '#94a3b8' : '#6b7280' }}>{label}</span>
            <span style={{ color: dark ? '#f1f5f9' : '#111827', fontWeight: 500, textAlign: 'right', display: 'flex', alignItems: 'center', gap: 6 }}>{value ?? (!extra && '—')}{extra}</span>
        </div>
    );
}

const FACE_STATUS_COLOR = { pending: '#f59e0b', enrolled: '#16a34a', failed: '#ef4444', deleted: '#9ca3af' };
const DRIVER_DETAIL_TABS = ['Profile', 'Credentials', 'AI Facial Data'];

// Right-side detail panel for the driver selected in the list. "AI Facial Data" reads the real
// DriverFace enrollment records (see DriverFaceModal/DriverFaceController).
function DriverDetailPanel({ driver, onEdit, onManageFace, dark }) {
    const [tab, setTab] = useState('Profile');
    const [faces, setFaces] = useState([]);
    const [loadingTab, setLoadingTab] = useState(false);

    useEffect(() => { setTab('Profile'); }, [driver?.id]);

    useEffect(() => {
        if (!driver) return;
        if (tab === 'AI Facial Data') {
            setLoadingTab(true);
            api.getDriverFaces({ driver_id: driver.id })
                .then(res => setFaces(res.data ?? []))
                .catch(() => setFaces([]))
                .finally(() => setLoadingTab(false));
        }
    }, [tab, driver?.id]);

    if (!driver) {
        return (
            <div style={{ background: dark ? '#111827' : '#fff', border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 10, padding: 32, textAlign: 'center', color: dark ? '#64748b' : '#94a3b8', fontSize: 13 }}>
                Select a driver from the list to view details.
            </div>
        );
    }

    const lStatus   = licenseStatus(driver.license_expiry);
    const lReminder = expiryReminder(driver.license_expiry, driver.notify_days_before);
    const initials  = driver.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();

    return (
        <div style={{ background: dark ? '#111827' : '#fff', border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: dark ? 'rgba(59,130,246,0.15)' : '#eff6ff', color: dark ? '#60a5fa' : '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                    {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: dark ? '#f1f5f9' : '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{driver.name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: dark ? '#94a3b8' : '#6b7280' }}>{driver.badge_no}</p>
                </div>
                <Badge text={driver.authorized ? 'Authorized' : 'Not Authorized'} color={driver.authorized ? '#16a34a' : '#ef4444'} dark={dark} />
            </div>

            <div style={{ display: 'flex', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, overflowX: 'auto' }}>
                {DRIVER_DETAIL_TABS.map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        style={{ padding: '9px 14px', border: 'none', borderBottom: tab === t ? `2px solid ${dark ? '#60a5fa' : '#3b82f6'}` : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: tab === t ? (dark ? '#60a5fa' : '#1d4ed8') : (dark ? '#94a3b8' : '#6b7280'), whiteSpace: 'nowrap' }}>
                        {t}
                    </button>
                ))}
            </div>

            <div style={{ padding: 18, maxHeight: 380, overflowY: 'auto' }}>
                {tab === 'Profile' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
                        <DetailRow label="Driver No." value={driver.badge_no} dark={dark} />
                        <DetailRow label="Phone" value={driver.phone} dark={dark} />
                        <DetailRow label="Register Place" value={driver.register_place} dark={dark} />
                        <DetailRow label="Register Date" value={driver.register_date?.slice(0, 10)} dark={dark} />
                        <DetailRow label="Status" value={driver.status} dark={dark} />
                    </div>
                )}

                {tab === 'Credentials' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
                        <DetailRow label="License No." value={driver.license_no} dark={dark} />
                        <DetailRow label="License Expiry" value={driver.license_expiry?.slice(0, 10)} extra={<Badge text={lStatus} color={STATUS_COLOR[lStatus]} dark={dark} />} dark={dark} />
                        <DetailRow label="Reminder" extra={<Badge text={lReminder} color={REMINDER_COLOR[lReminder]} dark={dark} />} dark={dark} />
                        <DetailRow label="RFID Card No." value={driver.rfid_card_no} dark={dark} />
                        <DetailRow label="iButton No." value={driver.ibutton_no} dark={dark} />
                    </div>
                )}

                {tab === 'AI Facial Data' && (
                    <div>
                        <button onClick={() => onManageFace(driver)}
                            style={{ marginBottom: 12, padding: '7px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                            Manage Face Enrollment
                        </button>
                        {loadingTab ? (
                            <p style={{ color: dark ? '#64748b' : '#94a3b8', fontSize: 12.5 }}>Loading…</p>
                        ) : faces.length === 0 ? (
                            <p style={{ color: dark ? '#64748b' : '#94a3b8', fontSize: 12.5 }}>No face enrollment records yet.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {faces.map(f => (
                                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, borderRadius: 8 }}>
                                        {f.photo_path ? (
                                            <img src={`/storage/${f.photo_path}`} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                                        ) : (
                                            <div style={{ width: 36, height: 36, borderRadius: 6, background: dark ? '#1e293b' : '#f1f5f9', flexShrink: 0 }} />
                                        )}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: dark ? '#f1f5f9' : '#111827' }}>{f.imei}</p>
                                            <p style={{ margin: 0, fontSize: 11, color: dark ? '#64748b' : '#94a3b8' }}>
                                                {f.enrolled_at ? `Enrolled ${new Date(f.enrolled_at).toLocaleDateString()}` : f.requested_at ? `Requested ${new Date(f.requested_at).toLocaleDateString()}` : ''}
                                            </p>
                                        </div>
                                        <Badge text={f.status} color={FACE_STATUS_COLOR[f.status] ?? '#9ca3af'} dark={dark} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div style={{ padding: '12px 18px', borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}` }}>
                <button onClick={() => onEdit(driver)}
                    style={{ width: '100%', padding: '8px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                    Edit Profile
                </button>
            </div>
        </div>
    );
}

// Real data — same license_expiry/notify_days_before fields already driving the table's own
// License Status/Reminder columns, just surfaced as a compact ranked list.
function LicenseExpiryAlertCard({ drivers, dark }) {
    const alerts = drivers
        .filter(d => d.license_expiry && ['Expired', 'Expiring soon'].includes(expiryReminder(d.license_expiry, d.notify_days_before)))
        .sort((a, b) => new Date(a.license_expiry) - new Date(b.license_expiry))
        .slice(0, 6);

    return (
        <div style={{ background: dark ? '#111827' : '#fff', border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 10, padding: 18 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 13.5, fontWeight: 700, color: dark ? '#f1f5f9' : '#111827' }}>License Expiry Alert</h3>
            {alerts.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12.5, color: dark ? '#64748b' : '#94a3b8', textAlign: 'center', padding: '12px 0' }}>No upcoming expirations.</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {alerts.map(d => {
                        const status = expiryReminder(d.license_expiry, d.notify_days_before);
                        return (
                            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                                <div style={{ minWidth: 0 }}>
                                    <p style={{ margin: 0, fontWeight: 600, color: dark ? '#f1f5f9' : '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</p>
                                    <p style={{ margin: 0, color: dark ? '#64748b' : '#9ca3af' }}>{d.license_no || '—'}</p>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                                    <Badge text={status} color={REMINDER_COLOR[status]} dark={dark} />
                                    <p style={{ margin: '2px 0 0', color: dark ? '#64748b' : '#9ca3af' }}>{d.license_expiry.slice(0, 10)}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function DriverPage({ dark }) {
    const [drivers, setDrivers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const [search, setSearch]   = useState('');
    const [place, setPlace]     = useState('');
    const [expiredOnly, setExpiredOnly] = useState(false);
    const [editing, setEditing] = useState(null); // driver object, 'new', or null
    const [pendingDeleteId, setPendingDeleteId] = useState(null);
    const [faceDriver, setFaceDriver] = useState(null); // driver object, or null
    const [selectedId, setSelectedId] = useState(null); // driver id shown in the detail panel

    const fetchDrivers = async () => {
        setLoading(true);
        try {
            const res = await api.getFleetDrivers();
            setDrivers(res.data);
        } catch (e) {
            setError('Failed to load drivers.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDrivers(); }, []);

    const reset = () => { setSearch(''); setPlace(''); setExpiredOnly(false); };

    const filtered = drivers.filter(d => {
        if (search && !(d.badge_no.toLowerCase().includes(search.toLowerCase()) || d.name.toLowerCase().includes(search.toLowerCase()))) return false;
        if (place && !(d.register_place || '').toLowerCase().includes(place.toLowerCase())) return false;
        if (expiredOnly && licenseStatus(d.license_expiry) !== 'Expired') return false;
        return true;
    });

    const handleDelete = async () => {
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        try {
            await api.deleteFleetDriver(id);
            if (selectedId === id) setSelectedId(null);
            await fetchDrivers();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to delete driver.');
        }
    };

    const totalDrivers = drivers.length;
    const authorizedCount = drivers.filter(d => d.authorized).length;
    const notAuthorizedCount = totalDrivers - authorizedCount;
    const expiringSoonCount = drivers.filter(d => {
        const days = daysUntil(d.license_expiry);
        return days != null && days >= 0 && days <= 30;
    }).length;
    const pct = (n) => totalDrivers ? `${Math.round((n / totalDrivers) * 100)}%` : null;

    const selectedDriver = drivers.find(d => d.id === selectedId) || null;

    const COLS = ['No.','Driver No.','Driver Name','Phone','License No.','Authorization','RFID Card No.','iButton No.','Register Place','Register Date','License Expiry','License Status','Driving license reminder','Status','Action'];

    const stopRowClick = (e) => e.stopPropagation();

    return (
        <PageShell title="Driver Management with AI" dark={dark}>
            <p style={{ margin: '-6px 0 16px', fontSize: 12.5, color: dark ? '#94a3b8' : '#6b7280' }}>
                Manage drivers, credentials, and AI facial authorization.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
                <DriverStatCard label="Total Drivers" value={totalDrivers} dark={dark} />
                <DriverStatCard label="Authorized to Drive" value={authorizedCount} color="#16a34a" sublabel={pct(authorizedCount)} dark={dark} />
                <DriverStatCard label="Not Authorized" value={notAuthorizedCount} color="#ef4444" sublabel={pct(notAuthorizedCount)} dark={dark} />
                <DriverStatCard label="Expiring Licenses (30 Days)" value={expiringSoonCount} color="#f59e0b" dark={dark} />
            </div>

            <TabBar tabs={['Driver information']} active="Driver information" onChange={() => {}} dark={dark} />
            <FilterBar dark={dark}>
                <FInput placeholder="Driver No./Driver Name" style={{ width: 200 }} value={search} onChange={e => setSearch(e.target.value)} dark={dark} />
                <FInput placeholder="Register Place" style={{ width: 160 }} value={place} onChange={e => setPlace(e.target.value)} dark={dark} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: dark ? '#e2e8f0' : '#374151', cursor: 'pointer', paddingBottom: 1 }}>
                    <input type="checkbox" checked={expiredOnly} onChange={e => setExpiredOnly(e.target.checked)} style={{ accentColor: '#3b82f6' }} />License Expired
                </label>
                <button onClick={reset} style={{ padding: '7px 14px', background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#374151', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </FilterBar>
            <ActionRow left={[<Btn key="add" primary onClick={() => setEditing('new')} dark={dark}>Add Driver</Btn>]} hideExport dark={dark} />

            {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? 'rgba(239,68,68,0.4)' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1400 }}>
                        <thead><tr>{COLS.map(c => <th key={c} style={TH(dark)}>{c}</th>)}</tr></thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={COLS.length} style={{ ...TD(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={COLS.length} style={{ ...TD(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                            ) : filtered.map((d, i) => {
                                const lStatus = licenseStatus(d.license_expiry);
                                const lReminder = expiryReminder(d.license_expiry, d.notify_days_before);
                                return (
                                    <tr key={d.id} onClick={() => setSelectedId(d.id)}
                                        style={{ cursor: 'pointer', background: selectedId === d.id ? (dark ? 'rgba(59,130,246,0.15)' : '#eff6ff') : undefined }}>
                                        <td style={TD(dark)}>{i + 1}</td>
                                        <td style={TD(dark)}>{d.badge_no}</td>
                                        <td style={{ ...TD(dark), fontWeight: 500 }}>{d.name}</td>
                                        <td style={TD(dark)}>{d.phone || '—'}</td>
                                        <td style={TD(dark)}>{d.license_no || '—'}</td>
                                        <td style={TD(dark)}><Badge text={d.authorized ? 'Authorized' : 'Not Authorized'} color={d.authorized ? '#16a34a' : '#ef4444'} dark={dark} /></td>
                                        <td style={TD(dark)}>{d.rfid_card_no || '—'}</td>
                                        <td style={TD(dark)}>{d.ibutton_no || '—'}</td>
                                        <td style={TD(dark)}>{d.register_place || '—'}</td>
                                        <td style={TD(dark)}>{d.register_date ? d.register_date.slice(0, 10) : '—'}</td>
                                        <td style={TD(dark)}>{d.license_expiry ? d.license_expiry.slice(0, 10) : '—'}</td>
                                        <td style={TD(dark)}><Badge text={lStatus} color={STATUS_COLOR[lStatus]} dark={dark} /></td>
                                        <td style={TD(dark)}><Badge text={lReminder} color={REMINDER_COLOR[lReminder]} dark={dark} /></td>
                                        <td style={TD(dark)}>{d.status}</td>
                                        <td style={{ ...TD(dark), whiteSpace: 'nowrap' }} onClick={stopRowClick}>
                                            <button onClick={() => setEditing(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#60a5fa' : '#3b82f6', fontSize: 12.5, fontWeight: 600, marginRight: 10 }}>Edit</button>
                                            <button onClick={() => setFaceDriver(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0891b2', fontSize: 12.5, fontWeight: 600, marginRight: 10 }}>Face</button>
                                            <button onClick={() => setPendingDeleteId(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12.5, fontWeight: 600 }}>Delete</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <DriverDetailPanel driver={selectedDriver} onEdit={setEditing} onManageFace={setFaceDriver} dark={dark} />
                    <LicenseExpiryAlertCard drivers={drivers} dark={dark} />
                </div>
            </div>

            {editing && (
                <DriverFormModal
                    driver={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); fetchDrivers(); }}
                    dark={dark}
                />
            )}

            {faceDriver && (
                <DriverFaceModal driver={faceDriver} onClose={() => setFaceDriver(null)} dark={dark} />
            )}

            {pendingDeleteId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, padding: '24px 28px', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>Delete driver?</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748b' }}>This also removes the driver from Traccar. This cannot be undone.</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setPendingDeleteId(null)} style={{ flex: 1, padding: 9, borderRadius: 7, border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`, background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleDelete} style={{ flex: 1, padding: 9, borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </PageShell>
    );
}

/* Vehicle */
// A "vehicle" is a local (Laravel DB) profile row (see VehicleController) bound 1:1 to a TurboHive
// IMEI — name, plate number, make/model/year/color live here, distinct from the tracker's own
// deviceName. On top of that: a many-drivers-per-vehicle assignment (VehicleDriverController /
// driver_device — a vehicle can have multiple drivers, e.g. shift-based driving) and per-vehicle
// settings (VehicleSettingController — relay opt-in, fuel, safety sticker), both still keyed by
// IMEI rather than the local vehicle id.
function AssignDriversModal({ vehicle, allDrivers, assignedIds, onClose, onSaved, dark }) {
    const [selected, setSelected] = useState(new Set(assignedIds));
    const [saving, setSaving]     = useState(false);
    const [error, setError]       = useState('');

    const toggle = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            const { data } = await api.setVehicleDrivers(vehicle.imei, Array.from(selected));
            onSaved(data);
            onClose();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to save driver assignment.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, width: 380, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, flexShrink: 0 }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>Assign Drivers — {vehicle.name || vehicle.imei}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#64748b' : '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px' }}>
                    {error && <div style={{ margin: '8px 0', padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? 'rgba(239,68,68,0.4)' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>{error}</div>}
                    {allDrivers.length === 0 ? (
                        <p style={{ textAlign: 'center', color: dark ? '#64748b' : '#94a3b8', fontSize: 13, padding: '24px 0' }}>No drivers yet — add one under Driver first.</p>
                    ) : allDrivers.map(d => (
                        <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f8fafc'}`, cursor: 'pointer', fontSize: 13.5, color: dark ? '#e2e8f0' : '#374151' }}>
                            <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} style={{ accentColor: '#3b82f6', width: 15, height: 15 }} />
                            <span style={{ fontWeight: 500 }}>{d.name}</span>
                            <span style={{ color: dark ? '#64748b' : '#9ca3af', fontSize: 12 }}>{d.badge_no}</span>
                        </label>
                    ))}
                </div>

                <div style={{ padding: '12px 20px', borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`, background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Add/Edit form for the local vehicle registry, merged with its per-IMEI VehicleSetting row
// (see VehicleSettingController) so identity and configuration are one modal/one Save action:
// - IMEI is only pickable when adding a new vehicle (from `availableDevices` — TurboHive
//   trackable devices not yet bound to any local vehicle row) and is immutable afterwards, same
//   pattern as DriverFormModal's badge_no.
// - Relay opt-in: when armed, an unregistered RFID/iButton card tap also sends a relay disconnect
//   (immobilizer) command — but only while the vehicle is confirmed stationary (see
//   UnregisteredDriverAlertService on the backend). Off by default since immobilizing a vehicle is
//   high-impact; an email alert always fires regardless of this setting.
// - Fuel Rate / Tank Capacity: inputs for the Fuel Management > Consumption tab's rate-based and
//   sensor-based methods (see ReportPage.jsx's FuelConsumption component) — a vehicle without
//   these set just can't use that particular method yet.
// - Safety Sticker / Insurance Expiry: moved here from the Driver module — these belong to the
//   vehicle, not whichever driver happens to be assigned (see NotifyVehicleStickerExpirations and
//   NotifyVehicleInsuranceExpirations for the reminder emails, and AlertRecipient for who gets them).
function VehicleFormModal({ vehicle, availableDevices, onClose, onSaved, dark }) {
    const isNew = !vehicle;
    const [form, setForm] = useState({
        imei: vehicle?.imei || '',
        name: vehicle?.name || '',
        plate_number: vehicle?.plate_number || '',
        manufacturer: vehicle?.manufacturer || '',
        model: vehicle?.model || '',
        year: vehicle?.year ?? '',
        color: vehicle?.color || '',
        status: vehicle?.status || 'Active',
    });

    const [enabled, setEnabled]   = useState(false);
    const [faceFailEnabled, setFaceFailEnabled] = useState(false);
    const [channel, setChannel]   = useState(10);
    const [fuelRate, setFuelRate] = useState('');
    const [tankCapacity, setTankCapacity] = useState('');
    const [vehicleType, setVehicleType] = useState('');
    const [fuelType, setFuelType] = useState('');
    const [stickerExpiry, setStickerExpiry] = useState('');
    const [stickerNotifyDays, setStickerNotifyDays] = useState('');
    const [insuranceExpiry, setInsuranceExpiry] = useState('');
    const [insuranceNotifyDays, setInsuranceNotifyDays] = useState('');
    const [settingsLoading, setSettingsLoading] = useState(!isNew);

    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

    useEffect(() => {
        if (isNew) return;
        (async () => {
            try {
                const res = await api.getVehicleSetting(vehicle.imei);
                setEnabled(!!res.data.relay_disconnect_enabled);
                setFaceFailEnabled(!!res.data.relay_disconnect_on_face_fail);
                setChannel(res.data.relay_channel ?? 10);
                setFuelRate(res.data.fuel_rate_l_per_100km ?? '');
                setTankCapacity(res.data.fuel_tank_capacity_liters ?? '');
                setVehicleType(res.data.vehicle_type ?? '');
                setFuelType(res.data.fuel_type ?? '');
                setStickerExpiry(res.data.safety_sticker_expiry ? res.data.safety_sticker_expiry.slice(0, 10) : '');
                setStickerNotifyDays(res.data.sticker_notify_days_before ?? '');
                setInsuranceExpiry(res.data.insurance_expiry ? res.data.insurance_expiry.slice(0, 10) : '');
                setInsuranceNotifyDays(res.data.insurance_notify_days_before ?? '');
            } catch (e) {
                setError('Failed to load vehicle settings.');
            } finally {
                setSettingsLoading(false);
            }
        })();
    }, [isNew, vehicle?.imei]);

    const handleSave = async () => {
        if (!form.imei) { setError('Select an IMEI to bind this vehicle to.'); return; }
        if (!form.name.trim()) { setError('Vehicle Name is required.'); return; }
        setSaving(true);
        setError('');
        const payload = { ...form, year: form.year === '' ? null : Number(form.year) };
        try {
            if (isNew) {
                await api.createVehicle(payload);
            } else {
                await api.updateVehicle(vehicle.id, payload);
            }
            await api.setVehicleSetting(form.imei, {
                relay_disconnect_enabled: enabled,
                relay_disconnect_on_face_fail: faceFailEnabled,
                relay_channel: Number(channel) || 10,
                fuel_rate_l_per_100km: fuelRate === '' ? null : Number(fuelRate),
                fuel_tank_capacity_liters: tankCapacity === '' ? null : Number(tankCapacity),
                vehicle_type: vehicleType || null,
                fuel_type: fuelType || null,
                safety_sticker_expiry: stickerExpiry || null,
                sticker_notify_days_before: stickerNotifyDays === '' ? null : Number(stickerNotifyDays),
                insurance_expiry: insuranceExpiry || null,
                insurance_notify_days_before: insuranceNotifyDays === '' ? null : Number(insuranceNotifyDays),
            });
            onSaved();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to save vehicle.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, width: 480, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}` }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>{isNew ? 'Add Vehicle' : 'Edit Vehicle'}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#64748b' : '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {error && <div style={{ gridColumn: '1 / -1', padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? 'rgba(239,68,68,0.4)' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>{error}</div>}

                    <div style={{ ...driverFieldStyle, gridColumn: '1 / -1' }}>
                        <label style={driverLabelStyle(dark)}>IMEI *</label>
                        {isNew ? (
                            <select value={form.imei} onChange={set('imei')} style={{ ...driverInputStyle(dark), background: dark ? '#1e293b' : '#fff', cursor: 'pointer' }}>
                                <option value="">Select an unlinked device…</option>
                                {availableDevices.map(d => (
                                    <option key={d.imei} value={d.imei}>{d.imei} — {d.deviceName || 'unnamed device'}</option>
                                ))}
                            </select>
                        ) : (
                            <input value={form.imei} disabled style={{ ...driverInputStyle(dark), background: dark ? '#0f172a' : '#f3f4f6', fontFamily: 'monospace' }} />
                        )}
                        {isNew && availableDevices.length === 0 && (
                            <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#f59e0b' }}>Every trackable device is already linked to a vehicle.</p>
                        )}
                    </div>

                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle(dark)}>Vehicle Name *</label>
                        <input value={form.name} onChange={set('name')} placeholder="e.g. Delivery Van 3" style={driverInputStyle(dark)} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle(dark)}>Plate Number</label>
                        <input value={form.plate_number} onChange={set('plate_number')} style={driverInputStyle(dark)} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle(dark)}>Manufacturer</label>
                        <input value={form.manufacturer} onChange={set('manufacturer')} placeholder="e.g. Toyota" style={driverInputStyle(dark)} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle(dark)}>Model</label>
                        <input value={form.model} onChange={set('model')} placeholder="e.g. Hiace" style={driverInputStyle(dark)} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle(dark)}>Year</label>
                        <input type="number" min="1900" max="2100" value={form.year} onChange={set('year')} style={driverInputStyle(dark)} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle(dark)}>Color</label>
                        <input value={form.color} onChange={set('color')} style={driverInputStyle(dark)} />
                    </div>
                    {!isNew && (
                        <div style={driverFieldStyle}>
                            <label style={driverLabelStyle(dark)}>Status</label>
                            <select value={form.status} onChange={set('status')} style={{ ...driverInputStyle(dark), background: dark ? '#1e293b' : '#fff', cursor: 'pointer' }}>
                                <option>Active</option>
                                <option>Inactive</option>
                            </select>
                        </div>
                    )}
                </div>

                <div style={{ padding: '4px 20px 20px' }}>
                    {settingsLoading ? (
                        <p style={{ fontSize: 13, color: dark ? '#64748b' : '#94a3b8' }}>Loading settings…</p>
                    ) : (
                        <>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16, marginBottom: 16, cursor: 'pointer', borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, paddingTop: 16 }}>
                                <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ accentColor: '#3b82f6', width: 16, height: 16, marginTop: 2 }} />
                                <span style={{ fontSize: 13, color: dark ? '#e2e8f0' : '#374151' }}>
                                    <strong>Disconnect relay on unregistered driver tap.</strong><br />
                                    <span style={{ fontSize: 12, color: dark ? '#94a3b8' : '#6b7280' }}>Only fires while the vehicle is stationary. An email alert is always sent, whether or not this is enabled.</span>
                                </span>
                            </label>

                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
                                <input type="checkbox" checked={faceFailEnabled} onChange={e => setFaceFailEnabled(e.target.checked)} style={{ accentColor: '#3b82f6', width: 16, height: 16, marginTop: 2 }} />
                                <span style={{ fontSize: 13, color: dark ? '#e2e8f0' : '#374151' }}>
                                    <strong>Disconnect relay on failed face recognition.</strong><br />
                                    <span style={{ fontSize: 12, color: dark ? '#94a3b8' : '#6b7280' }}>Fires whenever the device's face check comes back with no match. Independent of the toggle above — an email alert is always sent, whether or not this is enabled.</span>
                                </span>
                            </label>

                            <div style={{ ...driverFieldStyle, marginBottom: 16 }}>
                                <label style={driverLabelStyle(dark)}>Relay Channel</label>
                                <input type="number" min="1" max="255" value={channel} onChange={e => setChannel(e.target.value)} style={{ ...driverInputStyle(dark), maxWidth: 120 }} />
                            </div>

                            <div style={{ ...driverFieldStyle, marginBottom: 16, borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, paddingTop: 16 }}>
                                <label style={driverLabelStyle(dark)}>Vehicle Type</label>
                                <select value={vehicleType} onChange={e => setVehicleType(e.target.value)} style={{ ...driverInputStyle(dark), background: dark ? '#1e293b' : '#fff', cursor: 'pointer', maxWidth: 200 }}>
                                    <option value="">Default (no icon)</option>
                                    {VEHICLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
                                </select>
                                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#9ca3af' }}>Controls the icon shown on the live map pin and in the device list sidebar.</p>
                            </div>

                            <div style={{ ...driverFieldStyle, marginBottom: 16 }}>
                                <label style={driverLabelStyle(dark)}>Fuel Type</label>
                                <select value={fuelType} onChange={e => setFuelType(e.target.value)} style={{ ...driverInputStyle(dark), background: dark ? '#1e293b' : '#fff', cursor: 'pointer', maxWidth: 200 }}>
                                    <option value="">Not set</option>
                                    {FUEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#9ca3af' }}>Matches this vehicle to the Fuel Price module's current petrol/diesel price.</p>
                            </div>

                            <div style={{ borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, paddingTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div style={driverFieldStyle}>
                                    <label style={driverLabelStyle(dark)}>Fuel Rate (L/100km)</label>
                                    <input type="number" min="0" step="0.1" placeholder="e.g. 12.5" value={fuelRate} onChange={e => setFuelRate(e.target.value)} style={driverInputStyle(dark)} />
                                </div>
                                <div style={driverFieldStyle}>
                                    <label style={driverLabelStyle(dark)}>Tank Capacity (L)</label>
                                    <input type="number" min="0" step="0.1" placeholder="e.g. 80" value={tankCapacity} onChange={e => setTankCapacity(e.target.value)} style={driverInputStyle(dark)} />
                                </div>
                                <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 11.5, color: '#9ca3af' }}>
                                    Used by Fuel Management &gt; Consumption's "Fuel Rate" and "Fuel Sensor" methods.
                                </p>
                            </div>

                            <div style={{ borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, paddingTop: 16, marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div style={driverFieldStyle}>
                                    <label style={driverLabelStyle(dark)}>Safety Sticker Expiry</label>
                                    <input type="date" value={stickerExpiry} onChange={e => setStickerExpiry(e.target.value)} style={driverInputStyle(dark)} />
                                </div>
                                <div style={driverFieldStyle}>
                                    <label style={driverLabelStyle(dark)}>Notify before expiry (days)</label>
                                    <input type="number" min="1" max="365" placeholder="Default 14" value={stickerNotifyDays} onChange={e => setStickerNotifyDays(e.target.value)} style={driverInputStyle(dark)} />
                                </div>
                            </div>

                            <div style={{ borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, paddingTop: 16, marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div style={driverFieldStyle}>
                                    <label style={driverLabelStyle(dark)}>Insurance Expiry</label>
                                    <input type="date" value={insuranceExpiry} onChange={e => setInsuranceExpiry(e.target.value)} style={driverInputStyle(dark)} />
                                </div>
                                <div style={driverFieldStyle}>
                                    <label style={driverLabelStyle(dark)}>Notify before expiry (days)</label>
                                    <input type="number" min="1" max="365" placeholder="Default 14" value={insuranceNotifyDays} onChange={e => setInsuranceNotifyDays(e.target.value)} style={driverInputStyle(dark)} />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div style={{ padding: '12px 20px', borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`, background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving || settingsLoading} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: (saving || settingsLoading) ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function VehiclePage({ dark }) {
    const [vehicles, setVehicles] = useState([]);       // local registry — see VehicleController
    const [devices,  setDevices]  = useState([]);       // raw TurboHive trackable devices
    const [vehicleSettings, setVehicleSettings] = useState([]); // safety sticker + vehicle_type, by imei
    const [drivers,  setDrivers]  = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState('');
    const [search,   setSearch]   = useState('');
    const [editing,  setEditing]  = useState(null); // vehicle object, 'new', or null
    const [pendingDeleteId, setPendingDeleteId] = useState(null);
    const [assigning, setAssigning] = useState(null); // vehicle object, or null

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const [vehRes, devRes, settingsRes, drvRes] = await Promise.all([
                api.getVehicles(),
                api.getTurboHiveTrackableDevices({ page: 1, size: 100 }),
                api.getVehicleSettings().catch(() => ({ data: [] })),
                api.getFleetDrivers(),
            ]);
            setVehicles(Array.isArray(vehRes.data) ? vehRes.data : []);
            setDevices(Array.isArray(devRes.data?.data) ? devRes.data.data : []);
            setVehicleSettings(Array.isArray(settingsRes.data) ? settingsRes.data : []);
            setDrivers(Array.isArray(drvRes.data) ? drvRes.data : []);
        } catch (e) {
            setError('Failed to load vehicles.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    // driver names per vehicle, derived from each driver's own `imeis` list — avoids an
    // assignment lookup per vehicle row.
    const driversByImei = {};
    drivers.forEach(d => (d.imeis || []).forEach(imei => {
        (driversByImei[imei] ||= []).push(d);
    }));

    const devicesByImei = {};
    devices.forEach(d => { devicesByImei[d.imei] = d; });

    const settingsByImei = {};
    vehicleSettings.forEach(s => { settingsByImei[s.imei] = s; });

    // TurboHive trackable devices with no local vehicle row yet — offered in the Add Vehicle
    // IMEI picker, since a device already bound to a vehicle shouldn't be pickable again.
    const boundImeis = new Set(vehicles.map(v => v.imei));
    const availableDevices = devices.filter(d => !boundImeis.has(d.imei));

    const filtered = vehicles.filter(v =>
        !search ||
        (v.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.plate_number || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.imei || '').includes(search)
    );

    const handleDelete = async () => {
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        try {
            await api.deleteVehicle(id);
            await load();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to delete vehicle.');
        }
    };

    const COLS = ['No.','Vehicle Name','Plate Number','IMEI','Manufacturer / Model','Year','Color','Status','Online','Safety Sticker Expiry','Safety Sticker Status','Insurance Expiry','Insurance Status','Drivers','Action'];

    return (
        <PageShell title="Vehicle" dark={dark}>
            <FilterBar dark={dark}>
                <FInput placeholder="Vehicle Name, Plate No., or IMEI" style={{ width: 240 }} value={search} onChange={e => setSearch(e.target.value)} dark={dark} />
                <button onClick={() => setSearch('')} style={{ padding: '7px 14px', background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#374151', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
                <button onClick={load} style={{ padding: '7px 14px', background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#374151', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Refresh</button>
            </FilterBar>
            <ActionRow left={[<Btn key="add" primary onClick={() => setEditing('new')} dark={dark}>Add Vehicle</Btn>]} hideExport dark={dark} />

            {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? 'rgba(239,68,68,0.4)' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>{error}</div>}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1500 }}>
                    <thead>
                        <tr>{COLS.map(c => <th key={c} style={TH(dark)}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                                {vehicles.length === 0 ? 'No vehicles yet — click "Add Vehicle" to link a tracked device.' : 'No vehicles found'}
                            </td></tr>
                        ) : filtered.map((v, i) => {
                            const assigned = driversByImei[v.imei] || [];
                            const device   = devicesByImei[v.imei];
                            const setting  = settingsByImei[v.imei];
                            const sStatus  = expiryReminder(setting?.safety_sticker_expiry, setting?.sticker_notify_days_before);
                            const iStatus  = expiryReminder(setting?.insurance_expiry, setting?.insurance_notify_days_before);
                            return (
                                <tr key={v.id}>
                                    <td style={TD(dark)}>{i + 1}</td>
                                    <td style={{ ...TD(dark), fontWeight: 500 }}>{v.name}</td>
                                    <td style={TD(dark)}>{v.plate_number || '—'}</td>
                                    <td style={{ ...TD(dark), fontFamily: 'monospace', fontSize: 12 }}>{v.imei}</td>
                                    <td style={TD(dark)}>{[v.manufacturer, v.model].filter(Boolean).join(' / ') || '—'}</td>
                                    <td style={TD(dark)}>{v.year || '—'}</td>
                                    <td style={TD(dark)}>{v.color || '—'}</td>
                                    <td style={TD(dark)}><Badge text={v.status} color={v.status === 'Active' ? '#16a34a' : '#ef4444'} dark={dark} /></td>
                                    <td style={TD(dark)}>
                                        {device ? <Badge text={device.onlineStatus === 1 ? 'Online' : 'Offline'} color={device.onlineStatus === 1 ? '#16a34a' : '#9ca3af'} dark={dark} /> : <span style={{ color: '#9ca3af' }}>—</span>}
                                    </td>
                                    <td style={TD(dark)}>{setting?.safety_sticker_expiry ? setting.safety_sticker_expiry.slice(0, 10) : '—'}</td>
                                    <td style={TD(dark)}><Badge text={sStatus} color={REMINDER_COLOR[sStatus]} dark={dark} /></td>
                                    <td style={TD(dark)}>{setting?.insurance_expiry ? setting.insurance_expiry.slice(0, 10) : '—'}</td>
                                    <td style={TD(dark)}><Badge text={iStatus} color={REMINDER_COLOR[iStatus]} dark={dark} /></td>
                                    <td style={TD(dark)}>
                                        {assigned.length === 0 ? <span style={{ color: '#9ca3af' }}>—</span> : assigned.map(d => d.name).join(', ')}
                                    </td>
                                    <td style={{ ...TD(dark), whiteSpace: 'nowrap' }}>
                                        <button onClick={() => setEditing(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#60a5fa' : '#3b82f6', fontSize: 12.5, fontWeight: 600, marginRight: 10 }}>Edit</button>
                                        <button onClick={() => setAssigning(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#60a5fa' : '#3b82f6', fontSize: 12.5, fontWeight: 600, marginRight: 10 }}>Assign Drivers</button>
                                        <button onClick={() => setPendingDeleteId(v.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12.5, fontWeight: 600 }}>Delete</button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {editing && (
                <VehicleFormModal
                    vehicle={editing === 'new' ? null : editing}
                    availableDevices={availableDevices}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load(); }}
                    dark={dark}
                />
            )}

            {pendingDeleteId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, padding: '24px 28px', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>Delete vehicle?</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748b' }}>This unlinks the IMEI from this vehicle profile. This cannot be undone.</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setPendingDeleteId(null)} style={{ flex: 1, padding: 9, borderRadius: 7, border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`, background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleDelete} style={{ flex: 1, padding: 9, borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {assigning && (
                <AssignDriversModal
                    vehicle={assigning}
                    allDrivers={drivers}
                    assignedIds={(driversByImei[assigning.imei] || []).map(d => d.id)}
                    onClose={() => setAssigning(null)}
                    onSaved={(updatedDrivers) => {
                        const ids = new Set(updatedDrivers.map(d => d.id));
                        setDrivers(ds => ds.map(d => {
                            const imeis = new Set(d.imeis || []);
                            ids.has(d.id) ? imeis.add(assigning.imei) : imeis.delete(assigning.imei);
                            return { ...d, imeis: Array.from(imeis) };
                        }));
                    }}
                    dark={dark}
                />
            )}
        </PageShell>
    );
}

/* Vehicle Track */
// Functional scope: real-time location, route replay, speed, mileage, stop, geofence, work-zone
// rule and online-rate management — for every VL863-tracked vehicle. Built almost entirely by
// composing the Traccar-backed report modules already built under Report (Replay, Track Details,
// Mileage, Parking/Idling, Geo Fence, Online/Offline) via <ReportPage reportSection="..."/>, plus
// the existing live map (MapCanvas) and geofence management page (GeofencePage) — no duplicated
// logic, just reused as-is under a single Fleet-side module.
function liveTrackDeviceShape(device, positionsByDeviceId, vehicleTypesByImei = {}) {
    const pos = positionsByDeviceId[device.id] || positionsByDeviceId[device.identifier] || positionsByDeviceId[device.uniqueId];
    const imei = device.uniqueId ?? device.identifier ?? device.tracker;
    return {
        id:      device.id,
        name:    device.name || device.identifier || device.uniqueId || device.tracker,
        tracker: device.model || device.uniqueId || device.identifier || device.tracker,
        imei,
        status:  device.status === 'online' ? 'ONLINE' : (device.status || 'OFFLINE'),
        lat:     pos ? pos.latitude  : device.lat ?? null,
        lng:     pos ? pos.longitude : device.lng ?? null,
        signal:  pos?.attributes?.batteryLevel ?? pos?.attributes?.rssi ?? device.signal ?? 0,
        vehicleType: vehicleTypesByImei[imei] ?? null,
    };
}

function LiveLocationTab({ dark }) {
    const [devices, setDevices]   = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading]   = useState(true);

    const load = async () => {
        try {
            const deviceRequest = turboHiveEnabled ? api.getDevices() : api.getTraccarDevices();
            const positionRequest = turboHiveEnabled ? Promise.resolve({ data: [] }) : api.getLatestPositions();
            const [devRes, posRes, settingsRes] = await Promise.all([
                deviceRequest, positionRequest, api.getVehicleSettings().catch(() => ({ data: [] })),
            ]);
            const positionsByDeviceId = {};
            posRes.data.forEach(p => { positionsByDeviceId[p.deviceId] = p; });
            const vehicleTypesByImei = {};
            (settingsRes.data ?? []).forEach(s => { if (s.imei && s.vehicle_type) vehicleTypesByImei[s.imei] = s.vehicle_type; });
            setDevices(devRes.data.map(d => liveTrackDeviceShape(d, positionsByDeviceId, vehicleTypesByImei)));
        } catch (e) {
            // keep showing the last successful snapshot if a poll fails
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        const t = setInterval(load, 10000);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        if (!turboHiveEnabled) {
            return;
        }

        const client = connectTurboHiveMqtt((location) => {
            setDevices(ds => applyTurboHivePosition(ds, location));
        }, (error) => {
            console.error('TurboHive MQTT error:', error);
        });

        return () => {
            client?.end(true);
        };
    }, []);

    const selectedDevice = devices.find(d => d.id === selected) || null;

    return (
        <div style={{ height: 600, borderRadius: 10, overflow: 'hidden', border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, position: 'relative' }}>
            {loading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, zIndex: 500, background: dark ? '#0b1220' : '#fff' }}>Loading…</div>
            )}
            <MapCanvas devices={devices} selected={selected} onSelect={setSelected} selectedDevice={selectedDevice} />
        </div>
    );
}

function EmbeddedReport({ section, height = 640, dark }) {
    return (
        <div style={{ height, display: 'flex', flexDirection: 'column', border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 10, overflow: 'hidden' }}>
            <ReportPage reportSection={section} dark={dark} />
        </div>
    );
}

const VEHICLE_TRACK_TABS = ['Real-time Location', 'Route Replay', 'Speed', 'Mileage', 'Stops', 'Geofence', 'Work-zone Rules', 'Online Rate'];

function VehicleTrackPage({ dark }) {
    const [tab, setTab]             = useState(VEHICLE_TRACK_TABS[0]);
    const [stopsView, setStopsView] = useState('Parking');
    const [rateView, setRateView]   = useState('Online');

    return (
        <PageShell title="Vehicle Track" dark={dark}>
            <p style={{ margin: '-6px 0 16px', fontSize: 12.5, color: dark ? '#94a3b8' : '#6b7280' }}>
                Real-time location, route replay, speed, mileage, stop, geofence, work-zone rule and online-rate management for every VL863-tracked vehicle — powered by Traccar.
            </p>
            <TabBar tabs={VEHICLE_TRACK_TABS} active={tab} onChange={setTab} dark={dark} />

            {tab === 'Real-time Location' && <LiveLocationTab dark={dark} />}
            {tab === 'Route Replay'       && <EmbeddedReport section="Replay" dark={dark} />}
            {tab === 'Speed'              && <EmbeddedReport section="Track Details" dark={dark} />}
            {tab === 'Mileage'            && <EmbeddedReport section="Mileage" dark={dark} />}
            {tab === 'Geofence'           && <EmbeddedReport section="Geo Fence" dark={dark} />}

            {tab === 'Stops' && (
                <>
                    <TabBar tabs={['Parking', 'Idling']} active={stopsView} onChange={setStopsView} dark={dark} />
                    <EmbeddedReport section={stopsView} dark={dark} />
                </>
            )}

            {tab === 'Online Rate' && (
                <>
                    <TabBar tabs={['Online', 'Offline']} active={rateView} onChange={setRateView} dark={dark} />
                    <EmbeddedReport section={rateView} dark={dark} />
                </>
            )}

            {tab === 'Work-zone Rules' && (
                <div style={{ height: 640, display: 'flex', border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 10, overflow: 'hidden' }}>
                    <GeofenceManagementPage onBack={() => {}} dark={dark} />
                </div>
            )}
        </PageShell>
    );
}

/* Fuel Management */
// Functional scope: fuel curve, refuelling, idle fuel, abnormal loss, vehicle/driver/route ranking
// and tonne-kilometre fuel analytics — core and auxiliary vehicles by priority. "Consumption" and
// "Current Fuel" reuse the existing Fuel Consumption / Current Fuel Value report modules; the rest
// (Fuel Curve, Refuelling, Idle Fuel, Abnormal Loss, Ranking, Tonne-Km) are real TurboHive OBD-backed
// reports (see ReportPage.jsx's "FUEL MANAGEMENT (Fleet)" section) surfaced the same way as Vehicle
// Track: via <ReportPage reportSection="..."/>. Tonne-Km is its own tab (not just extra columns on
// Ranking) since the spec calls it out as a distinct analytics capability.
// "Ranking" and "Tonne-Km" hidden from the tab bar temporarily per request — their report
// components/routes are untouched, so re-add the two entries below to bring them back.
const FUEL_MANAGEMENT_TABS = ['Fuel Curve', 'Consumption', 'Consumption (Mileage)', 'Consumption (Trips)', 'Current Fuel', 'Refuelling', 'Idle Fuel', 'Abnormal Loss', 'Fuel Price' /*, 'Ranking', 'Tonne-Km' */];

function FuelManagementPage({ dark }) {
    const [tab, setTab] = useState(FUEL_MANAGEMENT_TABS[0]);

    return (
        <PageShell title="Fuel Management" dark={dark}>
            <p style={{ margin: '-6px 0 16px', fontSize: 12.5, color: dark ? '#94a3b8' : '#6b7280' }}>
                Fuel curve, refuelling, idle fuel, abnormal loss, vehicle/driver/route ranking and tonne-kilometre fuel analytics — core and auxiliary vehicles by priority, powered by TurboHive OBD data.
            </p>
            <TabBar tabs={FUEL_MANAGEMENT_TABS} active={tab} onChange={setTab} dark={dark} />

            {tab === 'Fuel Curve'          && <EmbeddedReport section="Fuel Curve" dark={dark} />}
            {tab === 'Consumption'         && <EmbeddedReport section="Fuel Consumption" dark={dark} />}
            {tab === 'Consumption (Mileage)' && <EmbeddedReport section="Fuel Consumption (Mileage)" dark={dark} />}
            {tab === 'Consumption (Trips)' && <EmbeddedReport section="Fuel Consumption (Trips)" height={760} dark={dark} />}
            {tab === 'Current Fuel'        && <EmbeddedReport section="Current fuel Value" dark={dark} />}
            {tab === 'Refuelling'          && <EmbeddedReport section="Refuelling" dark={dark} />}
            {tab === 'Idle Fuel'           && <EmbeddedReport section="Idle Fuel" dark={dark} />}
            {tab === 'Abnormal Loss'       && <EmbeddedReport section="Abnormal Fuel Loss" dark={dark} />}
            {tab === 'Fuel Price' && (
                <div style={{ height: 640, display: 'flex', border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 10, overflow: 'hidden' }}>
                    <FuelPricePage dark={dark} />
                </div>
            )}
            {tab === 'Ranking'             && <EmbeddedReport section="Fuel Ranking" height={720} dark={dark} />}
            {tab === 'Tonne-Km'            && <EmbeddedReport section="Tonne-Km Fuel Analytics" height={720} dark={dark} />}
        </PageShell>
    );
}

/* Check in Record */
// Real check-ins (RFID/iButton card taps), not a mock. TurboHive has no REST history endpoint for
// this — only a live MQTT push ({userId}/peri/{imei}, messageType "dlt") — so MqttWorker persists
// every one into driver_checkins the moment it arrives (see that migration's docblock) and
// broadcasts it live over Reverb; this page reads the persisted history and also listens live so
// new taps appear without a refresh.
function CheckInPage({ dark }) {
    const [checkins, setCheckins] = useState([]);
    const [devices,  setDevices]  = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState('');
    const [cardId,   setCardId]   = useState('');
    const [deviceSearch, setDeviceSearch] = useState('');
    const [startDate, setStartDate] = useState(new Date(Date.now() - 30*24*3600*1000).toISOString().slice(0,10));
    const [endDate,   setEndDate]   = useState(new Date().toISOString().slice(0,10));

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const [ciRes, devRes] = await Promise.all([
                api.getDriverCheckins({ startDate, endDate: `${endDate} 23:59:59`, size: 100 }),
                api.getTurboHiveTrackableDevices({ page: 1, size: 100 }),
            ]);
            setCheckins(Array.isArray(ciRes.data?.data) ? ciRes.data.data : []);
            setDevices(Array.isArray(devRes.data?.data) ? devRes.data.data : []);
        } catch (e) {
            setError('Failed to load check-ins.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    // Live: new taps land in the list immediately without waiting for a refresh.
    useEffect(() => {
        if (!window.Echo) return;
        const channel = window.Echo.channel('fleet');
        channel.listen('.driver.checked-in', (data) => {
            setCheckins(cs => [{
                id: data.id,
                imei: data.imei,
                driver_card_id: data.driverCardId,
                driver: data.driverId ? { id: data.driverId, name: data.driverName, badge_no: data.driverBadge } : null,
                checkin_time: new Date(data.checkinTime).toISOString(),
            }, ...cs]);
        });
        return () => window.Echo.leaveChannel('fleet');
    }, []);

    const devicesByImei = {};
    devices.forEach(d => { devicesByImei[d.imei] = d; });

    const filtered = checkins.filter(c => {
        if (cardId && !c.driver_card_id.toLowerCase().includes(cardId.toLowerCase())) return false;
        if (deviceSearch) {
            const name = devicesByImei[c.imei]?.deviceName || '';
            if (!name.toLowerCase().includes(deviceSearch.toLowerCase()) && !c.imei.includes(deviceSearch)) return false;
        }
        return true;
    });

    return (
        <PageShell title="Check in Record" dark={dark}>
            <p style={{ margin: '-6px 0 16px', fontSize: 12.5, color: dark ? '#94a3b8' : '#6b7280' }}>
                RFID/iButton card taps, captured live from TurboHive's MQTT peripheral stream — TurboHive doesn't retain this data itself, so this is the system of record.
            </p>
            <FilterBar dark={dark}>
                <FInput placeholder="Card ID" style={{ width: 140 }} value={cardId} onChange={e => setCardId(e.target.value)} dark={dark} />
                <FInput placeholder="Device name or IMEI" style={{ width: 220 }} value={deviceSearch} onChange={e => setDeviceSearch(e.target.value)} dark={dark} />
                <FInput label="From" type="date" style={{ width: 160 }} value={startDate} onChange={e => setStartDate(e.target.value)} dark={dark} />
                <FInput label="To" type="date" style={{ width: 160 }} value={endDate} onChange={e => setEndDate(e.target.value)} dark={dark} />
                <button onClick={load} style={{ padding: '7px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
            </FilterBar>

            {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? 'rgba(239,68,68,0.4)' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>{error}</div>}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                    <thead><tr>{['No.','Card ID','IMEI','Device Name','Driver Name','Driver No.','Check-in Time'].map(c => <th key={c} style={TH(dark)}>{c}</th>)}</tr></thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ ...TD(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={7} style={{ ...TD(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>No check-ins in range</td></tr>
                        ) : filtered.map((c, i) => (
                            <tr key={c.id}>
                                <td style={TD(dark)}>{i + 1}</td>
                                <td style={{ ...TD(dark), fontFamily: 'monospace' }}>{c.driver_card_id}</td>
                                <td style={{ ...TD(dark), fontFamily: 'monospace', fontSize: 12 }}>{c.imei}</td>
                                <td style={TD(dark)}>{devicesByImei[c.imei]?.deviceName || '—'}</td>
                                <td style={{ ...TD(dark), fontWeight: 500 }}>{c.driver?.name || <span style={{ color: '#9ca3af', fontWeight: 400 }}>Unrecognized card</span>}</td>
                                <td style={TD(dark)}>{c.driver?.badge_no || '—'}</td>
                                <td style={{ ...TD(dark), whiteSpace: 'nowrap' }}>{new Date(c.checkin_time).toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </PageShell>
    );
}

/* Route Planning */
function RoutePlanningPage({ dark }) {
    return (
        <PageShell title="Route Planning" dark={dark}>
            <FilterBar dark={dark}>
                <FInput placeholder="Please enter the route name" style={{ width: 200 }} dark={dark} />
                <FInput placeholder="Vehicle No." style={{ width: 150 }} dark={dark} />
                <FInput placeholder="IMEI" style={{ width: 150 }} dark={dark} />
                <SearchBtn />
            </FilterBar>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <Btn primary dark={dark}>Add</Btn>
                <Btn red dark={dark}>Delete</Btn>
            </div>
            <EmptyTable dark={dark} cols={['No.','Route name','Start location','End location','Total Mileage(km)','Stop','Action']} rows={[
                [1,'Manila → Makati Daily Run','Manila Warehouse','Makati Depot','14.2','2','Edit'],
                [2,'Quezon City Distribution','Quezon City Hub','Pasig Distribution Center','21.6','3','Edit'],
                [3,'Caloocan Cold Chain','Caloocan Yard','Taguig Cold Storage','27.9','1','Edit'],
            ]} />
        </PageShell>
    );
}

/* Fleet Report */
function FleetReportPage({ dark }) {
    const [tab, setTab] = useState('Attendance Daily');
    const today = new Date().toISOString().slice(0,10);
    return (
        <PageShell title="Fleet Report" dark={dark}>
            <TabBar tabs={['Attendance Daily','Vehicle Trip']} active={tab} onChange={setTab} dark={dark} />
            <FilterBar dark={dark}>
                <FInput placeholder="Driver No." style={{ width: 130 }} dark={dark} />
                <FInput placeholder="Driver name" style={{ width: 130 }} dark={dark} />
                <FInput placeholder="Number plate" style={{ width: 140 }} dark={dark} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, padding: '7px 10px', fontSize: 13, color: dark ? '#e2e8f0' : '#374151', background: dark ? '#1e293b' : '#fff' }}>
                    <span>{today}</span><span style={{ color: '#9ca3af' }}>-</span><span>{today}</span>
                </div>
                <SearchBtn />
            </FilterBar>
            <ActionRow left={[]} dark={dark} />
            {tab === 'Attendance Daily'
                ? <EmptyTable dark={dark} cols={['Driver Name','Driver No.','Clock In Time','Clock Out Time','Work Duration','Driving Duration','Associated Vehicle']} rows={[
                    ['Juan Dela Cruz','D-1001','2026-06-18 06:00','2026-06-18 15:30','9h 30m','3h 30m','NCR-1234'],
                    ['Maria Santos','D-1002','2026-06-18 05:45','2026-06-18 14:50','9h 05m','2h 50m','NCR-5678'],
                    ['Ana Garcia','D-1004','2026-06-18 05:40','2026-06-18 16:10','10h 30m','4h 15m','NCR-3456'],
                  ]} />
                : <EmptyTable dark={dark} cols={['No.','Driver Name','Driver No.','Vehicle No.','Start Time','End Time','Mileage (km)','Duration','Associated Fleet']} rows={[
                    [1,'Juan Dela Cruz','D-1001','NCR-1234','2026-06-18 06:00','2026-06-18 09:30','84.2','3h 30m','NextGen PNG'],
                    [2,'Maria Santos','D-1002','NCR-5678','2026-06-18 07:10','2026-06-18 10:05','72.8','2h 55m','NextGen PNG'],
                    [3,'Ana Garcia','D-1004','NCR-3456','2026-06-18 05:45','2026-06-18 07:58','27.9','2h 13m','NextGen PNG'],
                  ]} />
            }
        </PageShell>
    );
}

/* Vehicle Maintenance */
// Local (Laravel DB) maintenance schedule/history per vehicle, keyed by TurboHive IMEI — same
// "Approach 2" convention as Driver/Vehicle Settings above (vehicles have no local `devices` row).
// Status badge is computed client-side from due_date/due_odometer_km vs. today/current mileage —
// mirrors the license/sticker expiry badges in DriverPage. The backend's
// vehicle-maintenance:notify-due scheduled command (routes/console.php) independently emails
// registered users once a record enters its notify window; this page is just the CRUD surface.
const MAINTENANCE_STATUS_COLOR = { Overdue: '#ef4444', 'Due Soon': '#f59e0b', Scheduled: '#3b82f6', Completed: '#16a34a', Cancelled: '#9ca3af' };

function maintenanceDaysUntil(dateStr) {
    if (!dateStr) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((new Date(dateStr) - today) / 86400000);
}

function maintenanceDisplayStatus(record, currentOdometer) {
    if (record.status !== 'Scheduled') return record.status;

    const days = maintenanceDaysUntil(record.due_date);
    if (days != null && days < 0) return 'Overdue';
    if (days != null && days <= (record.notify_days_before ?? 14)) return 'Due Soon';

    if (record.due_odometer_km != null && currentOdometer != null) {
        const remaining = Number(record.due_odometer_km) - currentOdometer;
        if (remaining < 0) return 'Overdue';
        if (remaining <= (record.notify_km_before ?? 500)) return 'Due Soon';
    }

    return 'Scheduled';
}

const maintFieldStyle = { display: 'flex', flexDirection: 'column', gap: 4 };
const maintInputStyle = (dark) => ({ padding: '7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box', width: '100%', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a' });
const maintLabelStyle = (dark) => ({ fontSize: 11.5, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600 });

function VehicleMaintenanceFormModal({ record, vehicles, onClose, onSaved, dark }) {
    const isNew = !record;
    const [form, setForm] = useState({
        imei: record?.imei || '',
        maintenance_type: record?.maintenance_type || '',
        description: record?.description || '',
        status: record?.status || 'Scheduled',
        due_date: record?.due_date ? record.due_date.slice(0, 10) : '',
        due_odometer_km: record?.due_odometer_km ?? '',
        notify_days_before: record?.notify_days_before ?? '',
        notify_km_before: record?.notify_km_before ?? '',
        completed_date: record?.completed_date ? record.completed_date.slice(0, 10) : '',
        completed_odometer_km: record?.completed_odometer_km ?? '',
        cost: record?.cost ?? '',
        vendor: record?.vendor || '',
        notes: record?.notes || '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

    const handleSave = async () => {
        if (!form.imei || !form.maintenance_type.trim()) { setError('Vehicle and Maintenance Type are required.'); return; }
        setSaving(true);
        setError('');
        const numOrNull = (v) => (v === '' ? null : Number(v));
        const payload = {
            ...form,
            due_odometer_km: numOrNull(form.due_odometer_km),
            notify_days_before: numOrNull(form.notify_days_before),
            notify_km_before: numOrNull(form.notify_km_before),
            completed_odometer_km: numOrNull(form.completed_odometer_km),
            cost: numOrNull(form.cost),
            due_date: form.due_date || null,
            completed_date: form.completed_date || null,
        };
        try {
            if (isNew) {
                await api.createVehicleMaintenance(payload);
            } else {
                await api.updateVehicleMaintenance(record.id, payload);
            }
            onSaved();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to save maintenance record.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, width: 520, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}` }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>{isNew ? 'New Maintenance Record' : 'Edit Maintenance Record'}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#64748b' : '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {error && <div style={{ gridColumn: '1 / -1', padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? 'rgba(239,68,68,0.4)' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>{error}</div>}

                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle(dark)}>Vehicle *</label>
                        <select value={form.imei} onChange={set('imei')} disabled={!isNew} style={{ ...maintInputStyle(dark), background: isNew ? (dark ? '#1e293b' : '#fff') : (dark ? '#0f172a' : '#f3f4f6'), cursor: isNew ? 'pointer' : 'default' }}>
                            <option value="">Select vehicle</option>
                            {vehicles.map(v => <option key={v.imei} value={v.imei}>{v.deviceName ?? v.imei}</option>)}
                        </select>
                    </div>
                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle(dark)}>Maintenance Type *</label>
                        <input value={form.maintenance_type} onChange={set('maintenance_type')} placeholder="e.g. Oil Change" style={maintInputStyle(dark)} />
                    </div>

                    <div style={{ ...maintFieldStyle, gridColumn: '1 / -1' }}>
                        <label style={maintLabelStyle(dark)}>Description</label>
                        <input value={form.description} onChange={set('description')} style={maintInputStyle(dark)} />
                    </div>

                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle(dark)}>Status</label>
                        <select value={form.status} onChange={set('status')} style={{ ...maintInputStyle(dark), background: dark ? '#1e293b' : '#fff', cursor: 'pointer' }}>
                            <option>Scheduled</option>
                            <option>Completed</option>
                            <option>Cancelled</option>
                        </select>
                    </div>
                    <div />

                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle(dark)}>Due Date</label>
                        <input type="date" value={form.due_date} onChange={set('due_date')} style={maintInputStyle(dark)} />
                    </div>
                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle(dark)}>Due Odometer (km)</label>
                        <input type="number" min="0" value={form.due_odometer_km} onChange={set('due_odometer_km')} style={maintInputStyle(dark)} />
                    </div>
                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle(dark)}>Notify Days Before</label>
                        <input type="number" min="1" placeholder="Default 14" value={form.notify_days_before} onChange={set('notify_days_before')} style={maintInputStyle(dark)} />
                    </div>
                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle(dark)}>Notify Km Before</label>
                        <input type="number" min="1" placeholder="Default 500" value={form.notify_km_before} onChange={set('notify_km_before')} style={maintInputStyle(dark)} />
                    </div>

                    <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, paddingTop: 14, marginTop: 2 }}>
                        <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: dark ? '#94a3b8' : '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>Completion</p>
                    </div>
                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle(dark)}>Completed Date</label>
                        <input type="date" value={form.completed_date} onChange={set('completed_date')} style={maintInputStyle(dark)} />
                    </div>
                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle(dark)}>Completed Odometer (km)</label>
                        <input type="number" min="0" value={form.completed_odometer_km} onChange={set('completed_odometer_km')} style={maintInputStyle(dark)} />
                    </div>
                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle(dark)}>Cost</label>
                        <input type="number" min="0" step="0.01" value={form.cost} onChange={set('cost')} style={maintInputStyle(dark)} />
                    </div>
                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle(dark)}>Vendor</label>
                        <input value={form.vendor} onChange={set('vendor')} style={maintInputStyle(dark)} />
                    </div>
                    <div style={{ ...maintFieldStyle, gridColumn: '1 / -1' }}>
                        <label style={maintLabelStyle(dark)}>Notes</label>
                        <input value={form.notes} onChange={set('notes')} style={maintInputStyle(dark)} />
                    </div>
                </div>

                <div style={{ padding: '12px 20px', borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`, background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function VehicleMaintenancePage({ dark }) {
    const [records, setRecords]   = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [odometerByImei, setOdometerByImei] = useState({});
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState('');
    const [search, setSearch]     = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [editing, setEditing]   = useState(null); // record object, 'new', or null
    const [pendingDeleteId, setPendingDeleteId] = useState(null);

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const [recRes, vehRes, mileageRes] = await Promise.all([
                api.getVehicleMaintenances(),
                api.getTurboHiveTrackableDevices({ page: 1, size: 100 }),
                api.getTurboHiveRealtimeMileage({ page: 1, size: 100 }),
            ]);
            setRecords(recRes.data ?? []);
            setVehicles(Array.isArray(vehRes.data?.data) ? vehRes.data.data : []);
            const byImei = {};
            (mileageRes.data?.data ?? []).forEach(m => { if (m.imei) byImei[m.imei] = Number(m.totalMileage ?? 0); });
            setOdometerByImei(byImei);
        } catch (e) {
            setError('Failed to load vehicle maintenance records.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const vehiclesByImei = {};
    vehicles.forEach(v => { vehiclesByImei[v.imei] = v; });

    const rows = records.map(r => ({ ...r, displayStatus: maintenanceDisplayStatus(r, odometerByImei[r.imei]) }));

    const filtered = rows.filter(r => {
        const deviceName = vehiclesByImei[r.imei]?.deviceName || r.imei;
        if (search && !(deviceName.toLowerCase().includes(search.toLowerCase()) || r.maintenance_type.toLowerCase().includes(search.toLowerCase()))) return false;
        if (statusFilter && r.displayStatus !== statusFilter) return false;
        return true;
    });

    const handleDelete = async () => {
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        try {
            await api.deleteVehicleMaintenance(id);
            await load();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to delete maintenance record.');
        }
    };

    const COLS = ['No.', 'Vehicle', 'Type', 'Status', 'Due Date', 'Due Odometer (km)', 'Cost', 'Vendor', 'Action'];

    return (
        <PageShell title="Vehicle Maintenance" dark={dark}>
            <TabBar tabs={['Maintenance Records']} active="Maintenance Records" onChange={() => {}} dark={dark} />
            <FilterBar dark={dark}>
                <FInput placeholder="Vehicle/Maintenance Type" style={{ width: 220 }} value={search} onChange={e => setSearch(e.target.value)} dark={dark} />
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#374151', cursor: 'pointer' }}>
                    <option value="">All statuses</option>
                    {Object.keys(MAINTENANCE_STATUS_COLOR).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => { setSearch(''); setStatusFilter(''); }} style={{ padding: '7px 14px', background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#374151', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </FilterBar>
            <ActionRow left={[<Btn key="add" primary onClick={() => setEditing('new')} dark={dark}>Add</Btn>]} dark={dark} />

            {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? 'rgba(239,68,68,0.4)' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>{error}</div>}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                    <thead><tr>{COLS.map(c => <th key={c} style={TH(dark)}>{c}</th>)}</tr></thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                        ) : filtered.map((r, i) => (
                            <tr key={r.id}>
                                <td style={TD(dark)}>{i + 1}</td>
                                <td style={{ ...TD(dark), fontWeight: 500 }}>{vehiclesByImei[r.imei]?.deviceName ?? r.imei}</td>
                                <td style={TD(dark)}>{r.maintenance_type}</td>
                                <td style={TD(dark)}><Badge text={r.displayStatus} color={MAINTENANCE_STATUS_COLOR[r.displayStatus]} dark={dark} /></td>
                                <td style={TD(dark)}>{r.due_date ? r.due_date.slice(0, 10) : '—'}</td>
                                <td style={TD(dark)}>{r.due_odometer_km ?? '—'}</td>
                                <td style={TD(dark)}>{r.cost ?? '—'}</td>
                                <td style={TD(dark)}>{r.vendor || '—'}</td>
                                <td style={{ ...TD(dark), whiteSpace: 'nowrap' }}>
                                    <button onClick={() => setEditing(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#60a5fa' : '#3b82f6', fontSize: 12.5, fontWeight: 600, marginRight: 10 }}>Edit</button>
                                    <button onClick={() => setPendingDeleteId(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12.5, fontWeight: 600 }}>Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {editing && (
                <VehicleMaintenanceFormModal
                    record={editing === 'new' ? null : editing}
                    vehicles={vehicles}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load(); }}
                    dark={dark}
                />
            )}

            {pendingDeleteId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, padding: '24px 28px', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>Delete maintenance record?</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748b' }}>This cannot be undone.</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setPendingDeleteId(null)} style={{ flex: 1, padding: 9, borderRadius: 7, border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`, background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleDelete} style={{ flex: 1, padding: 9, borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </PageShell>
    );
}

/* Capture History */
// Read-only tracking history for the alert-evidence upload round-trip: an alert with attached
// photos/video (alert.file) triggers an UPLOADFILE command (MqttWorker::requestAlertFileUpload),
// and the device's later upload confirmation ({userId}/notify/{imei}) is matched back and saved
// here (MqttWorker::recordUploadResult) — see the alert_file_uploads migration's docblock for the
// full round-trip. Nothing on this page is user-editable; every row is system-generated from MQTT.
const CAPTURE_STATUS_COLOR = { requested: '#3b82f6', uploaded: '#16a34a', failed: '#ef4444' };

function CaptureHistoryPage({ dark }) {
    const [rows, setRows]       = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const [imei, setImei]       = useState('');
    const [status, setStatus]   = useState('');

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const params = {};
            if (imei) params.imei = imei;
            if (status) params.status = status;
            const res = await api.getAlertFileUploads(params);
            setRows(res.data ?? []);
        } catch (e) {
            setError('Failed to load capture history.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const COLS = ['No.', 'Vehicle (IMEI)', 'Alert Code', 'Files Requested', 'Status', 'Result File', 'Requested At', 'Uploaded At'];

    return (
        <PageShell title="Capture History" dark={dark}>
            <p style={{ margin: '-6px 0 16px', fontSize: 12.5, color: dark ? '#94a3b8' : '#6b7280' }}>
                Tracks alert-evidence (photo/video) upload requests sent to devices and the resulting file URLs once TurboHive confirms the upload.
            </p>
            <FilterBar dark={dark}>
                <FInput placeholder="IMEI" style={{ width: 200 }} value={imei} onChange={e => setImei(e.target.value)} dark={dark} />
                <select value={status} onChange={e => setStatus(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#374151', cursor: 'pointer' }}>
                    <option value="">All statuses</option>
                    <option value="requested">Requested</option>
                    <option value="uploaded">Uploaded</option>
                    <option value="failed">Failed</option>
                </select>
                <button onClick={load} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={() => { setImei(''); setStatus(''); }} style={{ padding: '7px 14px', background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#374151', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </FilterBar>

            {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? 'rgba(239,68,68,0.4)' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>{error}</div>}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                    <thead><tr>{COLS.map(c => <th key={c} style={TH(dark)}>{c}</th>)}</tr></thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                        ) : rows.map((r, i) => (
                            <tr key={r.id}>
                                <td style={TD(dark)}>{i + 1}</td>
                                <td style={{ ...TD(dark), fontFamily: 'monospace', fontSize: 12 }}>{r.imei}</td>
                                <td style={TD(dark)}>{r.alert_code ?? '—'}</td>
                                <td style={TD(dark)}>{(r.file_names ?? []).length}</td>
                                <td style={TD(dark)}><Badge text={r.status} color={CAPTURE_STATUS_COLOR[r.status] ?? '#9ca3af'} dark={dark} /></td>
                                <td style={TD(dark)}>
                                    {r.uploaded_file_path
                                        ? <a href={r.uploaded_file_path} target="_blank" rel="noreferrer" style={{ color: dark ? '#60a5fa' : '#3b82f6' }}>View</a>
                                        : '—'}
                                </td>
                                <td style={TD(dark)}>{r.requested_at ? new Date(r.requested_at).toLocaleString() : '—'}</td>
                                <td style={TD(dark)}>{r.uploaded_at ? new Date(r.uploaded_at).toLocaleString() : '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </PageShell>
    );
}

/* Media Gallery */
// TurboHive's authoritative media library (GET /v3/resource/page — TurboHiveService::getResources)
// — every photo/video the platform has stored, whether from a device's own periodic capture or an
// alert's evidence once uploaded via the UPLOADFILE round-trip (see MqttWorker/AlertFileUpload).
// storagePath is a directly-usable URL, unlike alert.file's bare on-device filenames. Two
// independently-paginated tabs (mediaType 0=Image, 1=Video) matching TurboHive's own gallery UI.
function formatMediaBytes(bytes) {
    if (bytes == null) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// TurboHive's documented codes for POST /v3/resource/delete/bulk — surfaced verbatim rather than
// a generic "failed" message, since 3210 in particular needs the user to actually wait rather
// than retry, and 3001/1216 mean the selection itself is stale rather than a request problem.
const DELETE_ERROR_MESSAGES = {
    1101: 'Not authenticated with TurboHive — check the configured API token.',
    1205: 'Invalid time range.',
    1216: 'Duplicate items in the request.',
    3001: 'One or more selected items were not found (already deleted?). Try refreshing.',
    3210: 'A delete task is already running on this account — wait for it to finish before deleting more.',
};

function MediaGalleryPage({ dark }) {
    const [devices, setDevices]     = useState([]);
    const [imei, setImei]           = useState('');
    const [channel, setChannel]     = useState('');
    const [eventType, setEventType] = useState('');
    const [keyword, setKeyword]     = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate]     = useState('');
    const [tab, setTab]             = useState('video'); // 'image' | 'video'

    const [images, setImages] = useState({ rows: [], page: 1, total: 0, totalPages: 0 });
    const [videos, setVideos] = useState({ rows: [], page: 1, total: 0, totalPages: 0 });
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState('');

    const [selectedIds, setSelectedIds] = useState(new Set());
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteMessage, setDeleteMessage] = useState('');

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(Array.isArray(res.data?.data) ? res.data.data : []))
            .catch(() => setDevices([]));
    }, []);

    const buildParams = (mediaType, page) => {
        const params = { page, size: 20, mediaType };
        if (imei) params.imei = imei;
        if (channel) params.channel = Number(channel);
        if (eventType) params.eventType = eventType;
        if (keyword) params.keyword = keyword;
        if (startDate) params.startTime = new Date(startDate).getTime();
        if (endDate) params.endTime = new Date(endDate).getTime();
        return params;
    };

    const fetchTab = async (mediaType, page = 1) => {
        const res = await api.getTurboHiveResources(buildParams(mediaType, page));
        const d = res.data ?? {};
        return { rows: d.data ?? [], page: d.page ?? page, total: d.total ?? 0, totalPages: d.totalPages ?? 0 };
    };

    const load = async () => {
        setLoading(true);
        setError('');
        setSelectedIds(new Set());
        try {
            const [imgRes, vidRes] = await Promise.all([fetchTab(0, 1), fetchTab(1, 1)]);
            setImages(imgRes);
            setVideos(vidRes);
        } catch (e) {
            setError('Failed to load media.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const reset = () => {
        setImei(''); setChannel(''); setEventType(''); setKeyword(''); setStartDate(''); setEndDate('');
    };

    const changePage = async (mediaType, newPage) => {
        setLoading(true);
        setError('');
        try {
            const res = await fetchTab(mediaType, newPage);
            if (mediaType === 0) setImages(res); else setVideos(res);
        } catch (e) {
            setError('Failed to load media.');
        } finally {
            setLoading(false);
        }
    };

    const current = tab === 'image' ? images : videos;
    const isAlertEvent = (r) => /alert|alarm/i.test(r.eventType || '');

    const toggleSelect = (id) => setSelectedIds(s => {
        const n = new Set(s);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
    });

    const allOnPageSelected = current.rows.length > 0 && current.rows.every(r => selectedIds.has(r.id));
    const toggleSelectAllOnPage = () => setSelectedIds(s => {
        const n = new Set(s);
        if (allOnPageSelected) {
            current.rows.forEach(r => n.delete(r.id));
        } else {
            current.rows.forEach(r => n.add(r.id));
        }
        return n;
    });

    const handleDeleteSelected = async () => {
        setConfirmingDelete(false);
        setDeleting(true);
        setError('');
        setDeleteMessage('');
        try {
            const res = await api.deleteTurboHiveResources(Array.from(selectedIds));
            const body = res.data ?? {};
            if (body.code === 1000) {
                setDeleteMessage(`Delete task submitted (task #${body.data?.taskId}, ${body.data?.totalCount ?? selectedIds.size} item(s)). Files will be removed shortly — refresh in a moment to confirm.`);
                setSelectedIds(new Set());
            } else {
                setError(DELETE_ERROR_MESSAGES[body.code] || body.message || 'Failed to delete selected media.');
            }
        } catch (e) {
            const code = e.response?.data?.code;
            setError(DELETE_ERROR_MESSAGES[code] || e.response?.data?.message || 'Failed to delete selected media.');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <PageShell title="Media Gallery" dark={dark}>
            <p style={{ margin: '-6px 0 16px', fontSize: 12.5, color: dark ? '#94a3b8' : '#6b7280' }}>
                Photos and video captured by devices — periodic captures, alert evidence, and manual snapshots — from TurboHive's media library.
            </p>

            <FilterBar dark={dark}>
                <select value={imei} onChange={e => setImei(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#374151', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All vehicles</option>
                    {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName ?? d.imei}</option>)}
                </select>
                <input type="number" min="1" placeholder="Channel" value={channel} onChange={e => setChannel(e.target.value)}
                    style={{ width: 90, padding: '7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#111827' }} />
                <select value={eventType} onChange={e => setEventType(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#374151', cursor: 'pointer' }}>
                    <option value="">All event types</option>
                    <option value="capture">Capture</option>
                    <option value="alarm">Alarm</option>
                    <option value="alert">Alert</option>
                    <option value="historical">Historical</option>
                </select>
                <FInput placeholder="Keyword" style={{ width: 160 }} value={keyword} onChange={e => setKeyword(e.target.value)} dark={dark} />
                <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)}
                    style={{ padding: '6px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, color: dark ? '#e2e8f0' : '#374151', background: dark ? '#1e293b' : '#fff', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)}
                    style={{ padding: '6px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, color: dark ? '#e2e8f0' : '#374151', background: dark ? '#1e293b' : '#fff', outline: 'none' }} />
                <button onClick={load} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#374151', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </FilterBar>

            {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? 'rgba(239,68,68,0.4)' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>{error}</div>}
            {deleteMessage && <div style={{ marginBottom: 12, padding: '8px 12px', background: dark ? 'rgba(34,197,94,0.15)' : '#f0fdf4', border: `1px solid ${dark ? 'rgba(34,197,94,0.4)' : '#bbf7d0'}`, borderRadius: 6, fontSize: 12, color: dark ? '#86efac' : '#166534' }}>{deleteMessage}</div>}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setTab('video')}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', border: 'none', borderBottom: tab === 'video' ? `2.5px solid ${dark ? '#818cf8' : '#6366f1'}` : '2.5px solid transparent', background: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: tab === 'video' ? (dark ? '#a5b4fc' : '#4338ca') : (dark ? '#94a3b8' : '#6b7280') }}>
                        🎥 Videos <span style={{ background: tab === 'video' ? (dark ? 'rgba(99,102,241,0.2)' : '#e0e7ff') : (dark ? '#1e293b' : '#f1f5f9'), color: tab === 'video' ? (dark ? '#a5b4fc' : '#4338ca') : '#64748b', borderRadius: 999, padding: '1px 8px', fontSize: 12 }}>{videos.total}</span>
                    </button>
                    <button onClick={() => setTab('image')}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', border: 'none', borderBottom: tab === 'image' ? `2.5px solid ${dark ? '#818cf8' : '#6366f1'}` : '2.5px solid transparent', background: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: tab === 'image' ? (dark ? '#a5b4fc' : '#4338ca') : (dark ? '#94a3b8' : '#6b7280') }}>
                        🖼 Images <span style={{ background: tab === 'image' ? (dark ? 'rgba(99,102,241,0.2)' : '#e0e7ff') : (dark ? '#1e293b' : '#f1f5f9'), color: tab === 'image' ? (dark ? '#a5b4fc' : '#4338ca') : '#64748b', borderRadius: 999, padding: '1px 8px', fontSize: 12 }}>{images.total}</span>
                    </button>
                </div>

                {selectedIds.size > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8 }}>
                        <span style={{ fontSize: 12.5, color: dark ? '#94a3b8' : '#6b7280' }}>{selectedIds.size} selected</span>
                        <button onClick={() => setSelectedIds(new Set())} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#94a3b8' : '#6b7280', fontSize: 12.5 }}>Clear</button>
                        <button onClick={() => setConfirmingDelete(true)} disabled={deleting}
                            style={{ padding: '6px 14px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer' }}>
                            {deleting ? 'Deleting…' : 'Delete Selected'}
                        </button>
                    </div>
                )}
            </div>

            {loading ? (
                <p style={{ textAlign: 'center', color: '#94a3b8', padding: 48 }}>Loading…</p>
            ) : current.rows.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#94a3b8', padding: 48 }}>No {tab === 'image' ? 'images' : 'videos'} found</p>
            ) : (
                <>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12.5, color: dark ? '#e2e8f0' : '#374151', cursor: 'pointer', width: 'fit-content' }}>
                        <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAllOnPage} style={{ accentColor: '#3b82f6', width: 15, height: 15 }} />
                        Select all on this page
                    </label>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                        {current.rows.map(r => (
                            <div key={r.id} style={{ border: selectedIds.has(r.id) ? `1.5px solid ${dark ? '#818cf8' : '#6366f1'}` : `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 10, overflow: 'hidden', background: dark ? '#111827' : '#fff' }}>
                                <div style={{ position: 'relative', background: '#111827', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <label style={{ position: 'absolute', top: 6, left: 6, zIndex: 1, background: 'rgba(255,255,255,0.9)', borderRadius: 4, padding: 2, display: 'flex' }}>
                                        <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} style={{ accentColor: '#3b82f6', width: 15, height: 15, margin: 0 }} />
                                    </label>
                                    {tab === 'image' ? (
                                        <img src={r.storagePath} alt={r.fileName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <video src={r.storagePath} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    )}
                                    {isAlertEvent(r) && (
                                        <span style={{ position: 'absolute', top: 6, right: 6, background: '#ef4444', color: '#fff', fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>Alert</span>
                                    )}
                                </div>
                                <div style={{ padding: '10px 12px' }}>
                                    <p title={r.fileName} style={{ margin: '0 0 6px', fontSize: 12.5, fontWeight: 600, color: dark ? '#f1f5f9' : '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.fileName}</p>
                                    <p style={{ margin: '0 0 2px', fontSize: 11.5, color: dark ? '#94a3b8' : '#6b7280' }}>Device: {r.imei} · Channel: {r.channel}</p>
                                    <p style={{ margin: '0 0 2px', fontSize: 11.5, color: dark ? '#94a3b8' : '#6b7280' }}>{r.captureTime ? new Date(r.captureTime).toLocaleString() : '—'}</p>
                                    <p style={{ margin: 0, fontSize: 11.5, color: dark ? '#94a3b8' : '#6b7280' }}>{formatMediaBytes(r.fileSize)}</p>
                                    <a href={r.storagePath} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6, fontSize: 12, color: dark ? '#60a5fa' : '#3b82f6', textDecoration: 'none' }}>Open ↗</a>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 20 }}>
                        <button disabled={current.page <= 1} onClick={() => changePage(tab === 'image' ? 0 : 1, current.page - 1)}
                            style={{ padding: '6px 14px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, background: dark ? '#111827' : '#fff', fontSize: 13, cursor: current.page <= 1 ? 'not-allowed' : 'pointer', color: current.page <= 1 ? '#cbd5e1' : (dark ? '#e2e8f0' : '#374151') }}>Prev</button>
                        <span style={{ fontSize: 13, color: dark ? '#94a3b8' : '#6b7280' }}>Page {current.page} of {current.totalPages || 1}</span>
                        <button disabled={current.page >= (current.totalPages || 1)} onClick={() => changePage(tab === 'image' ? 0 : 1, current.page + 1)}
                            style={{ padding: '6px 14px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, background: dark ? '#111827' : '#fff', fontSize: 13, cursor: current.page >= (current.totalPages || 1) ? 'not-allowed' : 'pointer', color: current.page >= (current.totalPages || 1) ? '#cbd5e1' : (dark ? '#e2e8f0' : '#374151') }}>Next</button>
                    </div>
                </>
            )}

            {confirmingDelete && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, padding: '24px 28px', width: 340, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>Delete {selectedIds.size} item{selectedIds.size === 1 ? '' : 's'}?</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748b' }}>This submits a delete task to TurboHive and cannot be undone. Only one delete task can run at a time on this account.</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setConfirmingDelete(false)} style={{ flex: 1, padding: 9, borderRadius: 7, border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`, background: dark ? '#111827' : '#fff', color: dark ? '#e2e8f0' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleDeleteSelected} style={{ flex: 1, padding: 9, borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </PageShell>
    );
}

/* ── page map ────────────────────────────────────────────────── */
const PAGE_MAP = {
    Dashboard:     FleetDashboard,
    Driver:        DriverPage,
    Vehicle:       VehiclePage,
    VehicleTrack:  VehicleTrackPage,
    VehicleMaintenance: VehicleMaintenancePage,
    FuelManagement: FuelManagementPage,
    CheckIn:       CheckInPage,
    CaptureHistory: CaptureHistoryPage,
    MediaGallery:  MediaGalleryPage,
    FaceRecognition: FaceRecognitionPage,
    RoutePlanning: RoutePlanningPage,
    FleetReport:   FleetReportPage,
};

/* ══════════════════════════════════════════════════════════════ */
/*  Main export                                                   */
/* ══════════════════════════════════════════════════════════════ */
export default function FleetPage({ fleetPage = 'Dashboard', setFleetPage, dark }) {
    const [accountOpen, setAccountOpen] = useState(true);
    const Content = PAGE_MAP[fleetPage] || FleetDashboard;
    const showAccountList = !['Dashboard', 'Driver', 'Vehicle', 'VehicleTrack', 'VehicleMaintenance', 'FuelManagement', 'CheckIn', 'CaptureHistory', 'MediaGallery', 'FaceRecognition'].includes(fleetPage);

    return (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: '100%' }}>
            {showAccountList && (
                <>
                    {/* Account list panel */}
                    <div style={{ width: accountOpen ? 200 : 0, minWidth: accountOpen ? 200 : 0, overflow: 'hidden', background: dark ? '#0f172a' : '#fff', borderRight: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, transition: 'width 0.22s ease, min-width 0.22s ease', flexShrink: 0 }}>
                        <div style={{ width: 200, display: 'flex', flexDirection: 'column', height: '100%' }}>
                            {/* Header */}
                            <div style={{ padding: '12px 14px 10px', fontWeight: 700, fontSize: 13, color: dark ? '#f1f5f9' : '#111827', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, letterSpacing: 0.2 }}>Account List</div>
                            {/* Search row */}
                            <div style={{ padding: '8px 10px', display: 'flex', gap: 6, borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}` }}>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, overflow: 'hidden', background: dark ? '#111827' : '#f9fafb' }}>
                                    <input placeholder="Please enter the..." style={{ flex: 1, padding: '5px 8px', border: 'none', fontSize: 12, outline: 'none', minWidth: 0, background: 'transparent', color: dark ? '#e2e8f0' : '#374151' }} />
                                    <span style={{ padding: '0 7px', color: dark ? '#64748b' : '#9ca3af', display: 'flex', alignItems: 'center' }}><SearchSVG /></span>
                                </div>
                                <button style={{ padding: '5px 8px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, background: dark ? '#1e293b' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: dark ? '#e2e8f0' : '#111827' }}><DownloadSVG /></button>
                            </div>
                            {/* Account items */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, background: dark ? 'rgba(59,130,246,0.15)' : '#eff6ff', cursor: 'pointer' }}>
                                    <PersonSVG />
                                    <span style={{ color: dark ? '#e2e8f0' : '#374151', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>NextGen PNG(Stock8/Total8)</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Collapse strip */}
                    <button onClick={() => setAccountOpen(o => !o)} style={{ width: 13, background: dark ? '#1e293b' : '#e5e7eb', border: 'none', borderRight: `1px solid ${dark ? '#334155' : '#d1d5db'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: dark ? '#94a3b8' : '#6b7280', flexShrink: 0, transition: 'background 0.15s' }}>
                        <CollapseArrow open={accountOpen} />
                    </button>
                </>
            )}

            {/* Content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: dark ? '#0b1220' : '#fff' }}>
                <Content dark={dark} />
            </div>
        </div>
    );
}
