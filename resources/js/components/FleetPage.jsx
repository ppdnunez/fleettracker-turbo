import { useState, useEffect } from 'react';
import { api } from '../api.js';
import MapCanvas from './MapCanvas.jsx';
import ReportPage from './ReportPage.jsx';
import GeofenceManagementPage from './GeofencePage.jsx';
import { turboHiveEnabled, connectTurboHiveMqtt, applyTurboHivePosition } from '../turbohive-mqtt.js';

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
const TH = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', background: '#f9fafb' };
const TD = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#374151' };

/* ── shared sub-components (match ReportPage style) ─────────── */
function FilterBar({ children }) {
    return (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            {children}
        </div>
    );
}
function FInput({ label, placeholder, type = 'text', style, value, onChange }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {label && <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{label}</label>}
            <input type={type} placeholder={placeholder} value={value} onChange={onChange} style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', ...style }} />
        </div>
    );
}
function FSel({ label, placeholder, options = [] }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {label && <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{label}</label>}
            <select style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
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
function ResetBtn() {
    return <button style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>;
}
function Btn({ children, primary, red, onClick }) {
    return (
        <button onClick={onClick} style={{ padding: '7px 16px', borderRadius: 6, border: primary ? 'none' : red ? '1px solid #ef4444' : '1px solid #d1d5db', background: primary ? '#3b82f6' : '#fff', color: primary ? '#fff' : red ? '#ef4444' : '#374151', fontSize: 13, cursor: 'pointer', fontWeight: primary ? 600 : 400, whiteSpace: 'nowrap' }}>
            {children}
        </button>
    );
}
function DropBtn({ children }) {
    return <button style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>{children} <span style={{ fontSize: 9 }}>▼</span></button>;
}
function ActionRow({ left, right }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap' }}>{left}</div>
            <div style={{ display: 'flex', gap: 6 }}>
                {right}
                <button style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer' }}>Export</button>
                <button style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 12 }}><ColPickSVG />▾</button>
            </div>
        </div>
    );
}
function TabBar({ tabs, active, onChange }) {
    return (
        <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: 16 }}>
            {tabs.map(t => (
                <button key={t} onClick={() => onChange(t)} style={{ padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: active === t ? 700 : 500, color: active === t ? '#3b82f6' : '#6b7280', borderBottom: active === t ? '2.5px solid #3b82f6' : '2.5px solid transparent', marginBottom: -2 }}>
                    {t}
                </button>
            ))}
        </div>
    );
}
function EmptyTable({ cols, rows }) {
    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead><tr>{cols.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {rows && rows.length ? rows.map((r, i) => (
                        <tr key={i}>{r.map((cell, j) => <td key={j} style={TD}>{cell}</td>)}</tr>
                    )) : (
                        <tr><td colSpan={cols.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
function PageShell({ title, children }) {
    return (
        <div style={{ flex: 1, overflowY: 'auto', background: '#fff', padding: '16px 24px' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#111827' }}>{title}</h2>
            {children}
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  Fleet Dashboard helpers                                        */
/* ══════════════════════════════════════════════════════════════ */

function StatCard({ label, value, sub }) {
    return (
        <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#111827' }}>{value ?? 0}</div>
            {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{sub}</div>}
        </div>
    );
}

/* Simple solid pie chart (CSS conic-gradient), built from real counts */
function Donut({ segments }) {
    const total = segments.reduce((s, seg) => s + seg.count, 0);
    let acc = 0;
    const stops = total > 0
        ? segments.filter(s => s.count > 0).map(seg => {
            const start = acc;
            acc += (seg.count / total) * 100;
            return `${seg.color} ${start}% ${acc}%`;
        }).join(', ')
        : '#f1f5f9 0% 100%';

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 110, height: 110, borderRadius: '50%', flexShrink: 0, background: `conic-gradient(${stops})` }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: '#374151' }}>
                {segments.map(seg => (
                    <span key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: seg.color, display: 'inline-block' }} />
                        {seg.label}<span style={{ color: '#9ca3af' }}>{total > 0 ? `${Math.round(seg.count / total * 100)}%` : '0%'}</span>
                    </span>
                ))}
                {total === 0 && <span style={{ color: '#9ca3af' }}>No data</span>}
            </div>
        </div>
    );
}

const REMINDER_DONUT_COLORS = { Normal: '#3b82f6', Expired: '#ef4444', 'Expiring soon': '#f59e0b' };

/* Real license / safety-sticker expiry status, computed from the actual Driver list — same
   daysUntil/expiryReminder helpers Driver page uses. */
function ReminderCard({ drivers }) {
    const [tab, setTab] = useState('License');
    const dateField = tab === 'License' ? 'license_expiry' : 'safety_sticker_expiry';
    const counts = { Normal: 0, Expired: 0, 'Expiring soon': 0 };
    drivers.forEach(d => {
        const status = expiryReminder(d[dateField], d.notify_days_before);
        if (counts[status] !== undefined) counts[status]++;
    });
    const segments = Object.entries(counts).map(([label, count]) => ({ label, count, color: REMINDER_DONUT_COLORS[label] }));

    return (
        <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Reminder</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                {['License', 'Safety Sticker'].map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', padding: '0 0 3px', fontSize: 12.5, cursor: 'pointer', color: tab === t ? '#3b82f6' : '#9ca3af', borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent' }}>{t} reminder</button>
                ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
                <Donut segments={segments} />
            </div>
        </div>
    );
}

/* Latest raw TurboHive alerts — real, not a mock list. */
function RecentAlertsCard({ alerts, devicesByImei }) {
    return (
        <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Recent Alerts</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 190, overflowY: 'auto' }}>
                {alerts.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '24px 0' }}>No alerts</p>
                ) : alerts.slice(0, 6).map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: '1px solid #f8fafc', fontSize: 12.5 }}>
                        <div>
                            <div style={{ fontWeight: 600, color: '#374151' }}>{a.name || `Code ${a.code}`}</div>
                            <div style={{ color: '#9ca3af', fontSize: 11.5 }}>{devicesByImei[a.imei]?.deviceName || a.imei}</div>
                        </div>
                        <span style={{ color: '#9ca3af', fontSize: 11, whiteSpace: 'nowrap' }}>{a.time ? new Date(a.time).toLocaleString() : '—'}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* Real per-vehicle alert counts (last 100 alerts fetched), not fixed fake plate numbers. */
function AlarmRankingCard({ alerts, devicesByImei }) {
    const counts = {};
    alerts.forEach(a => { counts[a.imei] = (counts[a.imei] || 0) + 1; });
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return (
        <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 10 }}>Alarm statistics ranking (by vehicle)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 80px', fontSize: 12, fontWeight: 600, color: '#6b7280', paddingBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
                <span>Rank</span><span>Vehicle</span><span style={{ textAlign: 'right' }}>Alert Count</span>
            </div>
            {ranked.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '24px 0' }}>No alerts</p>
            ) : ranked.map(([imei, count], i) => (
                <div key={imei} style={{ display: 'grid', gridTemplateColumns: '50px 1fr 80px', fontSize: 13, color: '#374151', padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
                    <span>{i + 1}</span><span>{devicesByImei[imei]?.deviceName || imei}</span><span style={{ textAlign: 'right', fontWeight: 600 }}>{count}</span>
                </div>
            ))}
        </div>
    );
}

/* Today's mileage per vehicle — real, from TurboHive's GET /v3/mileage/realtime (categorical bar,
   not a fabricated time series — TurboHive's realtime endpoint isn't a date-range report). */
function MileageBarCard({ mileageRows, devicesByImei }) {
    const rows = mileageRows.filter(r => (r.todayMileage || 0) > 0);
    const max = Math.max(1, ...rows.map(r => r.todayMileage || 0));
    return (
        <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 10 }}>Today's Mileage by Vehicle (km)</div>
            {rows.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '24px 0' }}>No mileage recorded yet today</p>
            ) : (
                <div style={{ height: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start', gap: 10, padding: '12px 4px 0' }}>
                    {rows.map(r => (
                        <div key={r.imei} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 46 }}>
                            <span style={{ fontSize: 11, color: '#374151', marginBottom: 3 }}>{r.todayMileage.toFixed(1)}</span>
                            <div style={{ width: '100%', background: '#dbeafe', borderRadius: '3px 3px 0 0', height: `${(r.todayMileage / max) * 80}%`, minHeight: 2 }} />
                            <span style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 46 }}>
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
function FleetDashboard() {
    const [drivers,  setDrivers]  = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [mileage,  setMileage]  = useState([]);
    const [alerts,   setAlerts]   = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState('');

    useEffect(() => {
        (async () => {
            setLoading(true);
            setError('');
            try {
                const [drvRes, vehRes, mileRes, alertRes] = await Promise.all([
                    api.getFleetDrivers(),
                    api.getTurboHiveTrackableDevices({ page: 1, size: 100 }),
                    api.getTurboHiveRealtimeMileage({ page: 1, size: 100 }),
                    api.getTurboHiveAlerts({ page: 1, size: 100 }),
                ]);
                setDrivers(Array.isArray(drvRes.data) ? drvRes.data : []);
                setVehicles(Array.isArray(vehRes.data?.data) ? vehRes.data.data : []);
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
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Dashboard</h2>
            </div>

            {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>{error}</div>}

            {/* Hero + stat cards */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 2, background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)', borderRadius: 10, padding: '20px 24px', color: '#fff', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 40, marginBottom: 10 }}>
                        <div><div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Total Drivers</div><div style={{ fontSize: 36, fontWeight: 800 }}>{drivers.length}</div></div>
                        <div><div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Total Vehicles</div><div style={{ fontSize: 36, fontWeight: 800 }}>{vehicles.length}</div></div>
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>Updated {new Date().toLocaleString()}</div>
                </div>
                <StatCard label="Online Vehicles" value={`${onlineCount} / ${vehicles.length}`} />
                <StatCard label="Driven Distance Today (km)" value={todayMileage.toFixed(1)} sub={mileage.length === 0 ? 'No devices with mileage enabled' : undefined} />
                <StatCard label="Alerts (Last 7 Days)" value={recentAlerts.length} />
            </div>

            {/* Reminder + Recent Alerts */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <ReminderCard drivers={drivers} />
                <RecentAlertsCard alerts={alerts} devicesByImei={devicesByImei} />
            </div>

            {/* Alarm type + Alarm ranking */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Alarm type ratio</div>
                    <Donut segments={alertTypeSegments} />
                </div>
                <AlarmRankingCard alerts={alerts} devicesByImei={devicesByImei} />
            </div>

            {/* Mileage */}
            <MileageBarCard mileageRows={mileage} devicesByImei={devicesByImei} />
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

function Badge({ text, color }) {
    return <span style={{ fontSize: 12, fontWeight: 600, color, background: `${color}1a`, padding: '2px 8px', borderRadius: 999 }}>{text}</span>;
}

const driverFieldStyle = { display: 'flex', flexDirection: 'column', gap: 4 };
const driverInputStyle = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box', width: '100%' };
const driverLabelStyle = { fontSize: 11.5, color: '#6b7280', fontWeight: 600 };

function DriverFormModal({ driver, onClose, onSaved }) {
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
        safety_sticker_expiry: driver?.safety_sticker_expiry ? driver.safety_sticker_expiry.slice(0, 10) : '',
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
            <div style={{ background: '#fff', borderRadius: 12, width: 480, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{isNew ? 'New Driver' : 'Edit Driver'}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {error && <div style={{ gridColumn: '1 / -1', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>{error}</div>}

                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Driver No. *</label>
                        <input value={form.badge_no} onChange={set('badge_no')} disabled={!isNew} style={{ ...driverInputStyle, background: isNew ? '#fff' : '#f3f4f6' }} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Driver Name *</label>
                        <input value={form.name} onChange={set('name')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Phone</label>
                        <input value={form.phone} onChange={set('phone')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>License No.</label>
                        <input value={form.license_no} onChange={set('license_no')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>RFID Card No.</label>
                        <input value={form.rfid_card_no} onChange={set('rfid_card_no')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>iButton No.</label>
                        <input value={form.ibutton_no} onChange={set('ibutton_no')} placeholder="Card number on the iButton fob" style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Register Place</label>
                        <input value={form.register_place} onChange={set('register_place')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Register Date</label>
                        <input type="date" value={form.register_date} onChange={set('register_date')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Status</label>
                        <select value={form.status} onChange={set('status')} style={{ ...driverInputStyle, background: '#fff', cursor: 'pointer' }}>
                            <option>Active</option>
                            <option>Inactive</option>
                        </select>
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>License Expiry</label>
                        <input type="date" value={form.license_expiry} onChange={set('license_expiry')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Safety Sticker Expiry</label>
                        <input type="date" value={form.safety_sticker_expiry} onChange={set('safety_sticker_expiry')} style={driverInputStyle} />
                    </div>
                    <div style={{ ...driverFieldStyle, gridColumn: '1 / -1' }}>
                        <label style={driverLabelStyle}>Notify before expiry (days)</label>
                        <input type="number" min="1" max="365" placeholder={`Default ${DEFAULT_NOTICE_DAYS}`} value={form.notify_days_before} onChange={set('notify_days_before')} style={{ ...driverInputStyle, maxWidth: 200 }} />
                    </div>
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
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
function DriverFaceModal({ driver, onClose }) {
    const imeis = driver.imeis || [];
    const [imei, setImei]       = useState(imeis[0] || '');
    const [faces, setFaces]     = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy]       = useState(false);
    const [error, setError]     = useState('');
    const [message, setMessage] = useState('');

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

    const current = faces.find(f => f.imei === imei);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: '#fff', borderRadius: 12, width: 420, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Face Enrollment — {driver.name}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20 }}>
                    {error && <div style={{ marginBottom: 14, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>{error}</div>}
                    {message && <div style={{ marginBottom: 14, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 12, color: '#166534' }}>{message}</div>}

                    {imeis.length === 0 ? (
                        <p style={{ fontSize: 13, color: '#94a3b8' }}>This driver isn't assigned to a vehicle yet — assign one first under Vehicle &gt; Assign Drivers.</p>
                    ) : (
                        <>
                            <div style={{ marginBottom: 14 }}>
                                <label style={driverLabelStyle}>Vehicle (IMEI)</label>
                                <select value={imei} onChange={e => setImei(e.target.value)} style={{ ...driverInputStyle, background: '#fff', cursor: 'pointer' }}>
                                    {imeis.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>

                            <div style={{ marginBottom: 14, padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12.5 }}>
                                <strong>Status:</strong> {loading ? 'Loading…' : (current?.status || 'Not enrolled')}
                                {current?.error && <div style={{ color: '#991b1b', marginTop: 4 }}>{current.error}</div>}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <button disabled={busy} onClick={() => run(() => api.enrollDriverFace(driver.id, imei), 'Enroll command sent — device will capture a live photo.')}
                                    style={{ padding: '9px 14px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>
                                    Enroll Face
                                </button>
                                <button disabled={busy} onClick={() => run(() => api.testDriverFace(imei), 'Recognition test triggered.')}
                                    style={{ padding: '9px 14px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                                    Test Recognition Now
                                </button>
                                <button disabled={busy} onClick={() => run(() => api.deleteDriverFace(driver.id, imei), 'Delete command sent.')}
                                    style={{ padding: '9px 14px', borderRadius: 7, border: '1.5px solid #fecaca', background: '#fff', color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
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
// works through Traccar elsewhere in the app. License/Safety Sticker status badges are computed
// from each driver's expiry dates; the same dates drive the "drivers:notify-expirations" scheduled
// email reminder on the backend.
function DriverPage() {
    const [drivers, setDrivers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const [search, setSearch]   = useState('');
    const [place, setPlace]     = useState('');
    const [expiredOnly, setExpiredOnly] = useState(false);
    const [editing, setEditing] = useState(null); // driver object, 'new', or null
    const [pendingDeleteId, setPendingDeleteId] = useState(null);
    const [faceDriver, setFaceDriver] = useState(null); // driver object, or null

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
            await fetchDrivers();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to delete driver.');
        }
    };

    const COLS = ['No.','Driver No.','Driver Name','Phone','License No.','RFID Card No.','iButton No.','Register Place','Register Date','License Expiry','License Status','Driving license reminder','Safety Sticker Expiry','Safety Sticker Status','Status','Action'];

    return (
        <PageShell title="Driver">
            <TabBar tabs={['Driver information']} active="Driver information" onChange={() => {}} />
            <FilterBar>
                <FInput placeholder="Driver No./Driver Name" style={{ width: 200 }} value={search} onChange={e => setSearch(e.target.value)} />
                <FInput placeholder="Register Place" style={{ width: 160 }} value={place} onChange={e => setPlace(e.target.value)} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer', paddingBottom: 1 }}>
                    <input type="checkbox" checked={expiredOnly} onChange={e => setExpiredOnly(e.target.checked)} style={{ accentColor: '#3b82f6' }} />License Expired
                </label>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </FilterBar>
            <ActionRow left={[<Btn key="add" primary onClick={() => setEditing('new')}>Add</Btn>]} />

            {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>{error}</div>}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1400 }}>
                    <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                        ) : filtered.map((d, i) => {
                            const lStatus = licenseStatus(d.license_expiry);
                            const lReminder = expiryReminder(d.license_expiry, d.notify_days_before);
                            const sStatus = expiryReminder(d.safety_sticker_expiry, d.notify_days_before);
                            return (
                                <tr key={d.id}>
                                    <td style={TD}>{i + 1}</td>
                                    <td style={TD}>{d.badge_no}</td>
                                    <td style={{ ...TD, fontWeight: 500 }}>{d.name}</td>
                                    <td style={TD}>{d.phone || '—'}</td>
                                    <td style={TD}>{d.license_no || '—'}</td>
                                    <td style={TD}>{d.rfid_card_no || '—'}</td>
                                    <td style={TD}>{d.ibutton_no || '—'}</td>
                                    <td style={TD}>{d.register_place || '—'}</td>
                                    <td style={TD}>{d.register_date ? d.register_date.slice(0, 10) : '—'}</td>
                                    <td style={TD}>{d.license_expiry ? d.license_expiry.slice(0, 10) : '—'}</td>
                                    <td style={TD}><Badge text={lStatus} color={STATUS_COLOR[lStatus]} /></td>
                                    <td style={TD}><Badge text={lReminder} color={REMINDER_COLOR[lReminder]} /></td>
                                    <td style={TD}>{d.safety_sticker_expiry ? d.safety_sticker_expiry.slice(0, 10) : '—'}</td>
                                    <td style={TD}><Badge text={sStatus} color={REMINDER_COLOR[sStatus]} /></td>
                                    <td style={TD}>{d.status}</td>
                                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                                        <button onClick={() => setEditing(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: 12.5, fontWeight: 600, marginRight: 10 }}>Edit</button>
                                        <button onClick={() => setFaceDriver(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0891b2', fontSize: 12.5, fontWeight: 600, marginRight: 10 }}>Face</button>
                                        <button onClick={() => setPendingDeleteId(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12.5, fontWeight: 600 }}>Delete</button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {editing && (
                <DriverFormModal
                    driver={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); fetchDrivers(); }}
                />
            )}

            {faceDriver && (
                <DriverFaceModal driver={faceDriver} onClose={() => setFaceDriver(null)} />
            )}

            {pendingDeleteId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Delete driver?</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748b' }}>This also removes the driver from Traccar. This cannot be undone.</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setPendingDeleteId(null)} style={{ flex: 1, padding: 9, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleDelete} style={{ flex: 1, padding: 9, borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </PageShell>
    );
}

/* Vehicle */
// Vehicle = a real TurboHive device (same trackable-device list Device Management shows). The
// only thing this module adds on top is a local (Laravel DB) many-drivers-per-vehicle assignment,
// via VehicleDriverController / driver_device — a vehicle can have multiple drivers (e.g.
// shift-based driving), keyed by IMEI since TurboHive devices don't have a local `devices` row.
function AssignDriversModal({ vehicle, allDrivers, assignedIds, onClose, onSaved }) {
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
            <div style={{ background: '#fff', borderRadius: 12, width: 380, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Assign Drivers — {vehicle.deviceName || vehicle.imei}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px' }}>
                    {error && <div style={{ margin: '8px 0', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>{error}</div>}
                    {allDrivers.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: '24px 0' }}>No drivers yet — add one under Driver first.</p>
                    ) : allDrivers.map(d => (
                        <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', fontSize: 13.5, color: '#374151' }}>
                            <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} style={{ accentColor: '#3b82f6', width: 15, height: 15 }} />
                            <span style={{ fontWeight: 500 }}>{d.name}</span>
                            <span style={{ color: '#9ca3af', fontSize: 12 }}>{d.badge_no}</span>
                        </label>
                    ))}
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Per-vehicle settings, keyed by TurboHive IMEI (see VehicleSettingController):
// - Relay opt-in: when armed, an unregistered RFID/iButton card tap also sends a relay disconnect
//   (immobilizer) command — but only while the vehicle is confirmed stationary (see
//   UnregisteredDriverAlertService on the backend). Off by default since immobilizing a vehicle is
//   high-impact; an email alert always fires regardless of this setting.
// - Fuel Rate / Tank Capacity: inputs for the Fuel Management > Consumption tab's rate-based and
//   sensor-based methods (see ReportPage.jsx's FuelConsumption component) — a vehicle without
//   these set just can't use that particular method yet.
function VehicleSettingsModal({ vehicle, onClose }) {
    const [enabled, setEnabled]   = useState(false);
    const [channel, setChannel]   = useState(10);
    const [fuelRate, setFuelRate] = useState('');
    const [tankCapacity, setTankCapacity] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving]   = useState(false);
    const [error, setError]     = useState('');

    useEffect(() => {
        (async () => {
            try {
                const res = await api.getVehicleSetting(vehicle.imei);
                setEnabled(!!res.data.relay_disconnect_enabled);
                setChannel(res.data.relay_channel ?? 10);
                setFuelRate(res.data.fuel_rate_l_per_100km ?? '');
                setTankCapacity(res.data.fuel_tank_capacity_liters ?? '');
            } catch (e) {
                setError('Failed to load vehicle settings.');
            } finally {
                setLoading(false);
            }
        })();
    }, [vehicle.imei]);

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            await api.setVehicleSetting(vehicle.imei, {
                relay_disconnect_enabled: enabled,
                relay_channel: Number(channel) || 10,
                fuel_rate_l_per_100km: fuelRate === '' ? null : Number(fuelRate),
                fuel_tank_capacity_liters: tankCapacity === '' ? null : Number(tankCapacity),
            });
            onClose();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to save vehicle settings.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: '#fff', borderRadius: 12, width: 420, boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Vehicle Settings — {vehicle.deviceName || vehicle.imei}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20 }}>
                    {error && <div style={{ marginBottom: 14, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>{error}</div>}

                    {loading ? (
                        <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading…</p>
                    ) : (
                        <>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
                                <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ accentColor: '#3b82f6', width: 16, height: 16, marginTop: 2 }} />
                                <span style={{ fontSize: 13, color: '#374151' }}>
                                    <strong>Disconnect relay on unregistered driver tap.</strong><br />
                                    <span style={{ fontSize: 12, color: '#6b7280' }}>Only fires while the vehicle is stationary. An email alert is always sent, whether or not this is enabled.</span>
                                </span>
                            </label>

                            <div style={{ ...driverFieldStyle, marginBottom: 16 }}>
                                <label style={driverLabelStyle}>Relay Channel</label>
                                <input type="number" min="1" max="255" value={channel} onChange={e => setChannel(e.target.value)} style={{ ...driverInputStyle, maxWidth: 120 }} />
                            </div>

                            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div style={driverFieldStyle}>
                                    <label style={driverLabelStyle}>Fuel Rate (L/100km)</label>
                                    <input type="number" min="0" step="0.1" placeholder="e.g. 12.5" value={fuelRate} onChange={e => setFuelRate(e.target.value)} style={driverInputStyle} />
                                </div>
                                <div style={driverFieldStyle}>
                                    <label style={driverLabelStyle}>Tank Capacity (L)</label>
                                    <input type="number" min="0" step="0.1" placeholder="e.g. 80" value={tankCapacity} onChange={e => setTankCapacity(e.target.value)} style={driverInputStyle} />
                                </div>
                                <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 11.5, color: '#9ca3af' }}>
                                    Used by Fuel Management &gt; Consumption's "Fuel Rate" and "Fuel Sensor" methods.
                                </p>
                            </div>
                        </>
                    )}
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving || loading} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: (saving || loading) ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function VehiclePage() {
    const [vehicles, setVehicles] = useState([]);
    const [drivers,  setDrivers]  = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState('');
    const [search,   setSearch]   = useState('');
    const [assigning, setAssigning] = useState(null); // vehicle object, or null
    const [vehicleSettingsFor, setVehicleSettingsFor] = useState(null); // vehicle object, or null

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const [vehRes, drvRes] = await Promise.all([api.getTurboHiveTrackableDevices({ page: 1, size: 100 }), api.getFleetDrivers()]);
            setVehicles(Array.isArray(vehRes.data?.data) ? vehRes.data.data : []);
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

    const filtered = vehicles.filter(v =>
        !search ||
        (v.deviceName || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.imei || '').includes(search)
    );

    return (
        <PageShell title="Vehicle">
            <FilterBar>
                <FInput placeholder="IMEI or Vehicle Name" style={{ width: 220 }} value={search} onChange={e => setSearch(e.target.value)} />
                <button onClick={() => setSearch('')} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
                <button onClick={load} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Refresh</button>
            </FilterBar>

            {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>{error}</div>}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                    <thead>
                        <tr>{['No.','Vehicle Name','IMEI','Type','Manufacturer / Model','Status','Online','Drivers','Action'].map(c => <th key={c} style={TH}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={9} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={9} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No vehicles found</td></tr>
                        ) : filtered.map((v, i) => {
                            const assigned = driversByImei[v.imei] || [];
                            return (
                                <tr key={v.id}>
                                    <td style={TD}>{i + 1}</td>
                                    <td style={{ ...TD, fontWeight: 500 }}>{v.deviceName || '—'}</td>
                                    <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{v.imei}</td>
                                    <td style={TD}>{v.deviceType || '—'}</td>
                                    <td style={TD}>{[v.manufacturer, v.model].filter(Boolean).join(' / ') || '—'}</td>
                                    <td style={TD}><Badge text={v.status === 1 ? 'Active' : 'Inactive'} color={v.status === 1 ? '#16a34a' : '#ef4444'} /></td>
                                    <td style={TD}><Badge text={v.onlineStatus === 1 ? 'Online' : 'Offline'} color={v.onlineStatus === 1 ? '#16a34a' : '#9ca3af'} /></td>
                                    <td style={TD}>
                                        {assigned.length === 0 ? <span style={{ color: '#9ca3af' }}>—</span> : assigned.map(d => d.name).join(', ')}
                                    </td>
                                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                                        <button onClick={() => setAssigning(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: 12.5, fontWeight: 600, marginRight: 10 }}>Assign Drivers</button>
                                        <button onClick={() => setVehicleSettingsFor(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0891b2', fontSize: 12.5, fontWeight: 600 }}>Vehicle Settings</button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

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
                />
            )}

            {vehicleSettingsFor && (
                <VehicleSettingsModal vehicle={vehicleSettingsFor} onClose={() => setVehicleSettingsFor(null)} />
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
function liveTrackDeviceShape(device, positionsByDeviceId) {
    const pos = positionsByDeviceId[device.id] || positionsByDeviceId[device.identifier] || positionsByDeviceId[device.uniqueId];
    return {
        id:      device.id,
        name:    device.name || device.identifier || device.uniqueId || device.tracker,
        tracker: device.model || device.uniqueId || device.identifier || device.tracker,
        imei:    device.uniqueId ?? device.identifier ?? device.tracker,
        status:  device.status === 'online' ? 'ONLINE' : (device.status || 'OFFLINE'),
        lat:     pos ? pos.latitude  : device.lat ?? null,
        lng:     pos ? pos.longitude : device.lng ?? null,
        signal:  pos?.attributes?.batteryLevel ?? pos?.attributes?.rssi ?? device.signal ?? 0,
    };
}

function LiveLocationTab() {
    const [devices, setDevices]   = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading]   = useState(true);

    const load = async () => {
        try {
            const deviceRequest = turboHiveEnabled ? api.getDevices() : api.getTraccarDevices();
            const positionRequest = turboHiveEnabled ? Promise.resolve({ data: [] }) : api.getLatestPositions();
            const [devRes, posRes] = await Promise.all([deviceRequest, positionRequest]);
            const positionsByDeviceId = {};
            posRes.data.forEach(p => { positionsByDeviceId[p.deviceId] = p; });
            setDevices(devRes.data.map(d => liveTrackDeviceShape(d, positionsByDeviceId)));
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
        <div style={{ height: 600, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb', position: 'relative' }}>
            {loading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, zIndex: 500, background: '#fff' }}>Loading…</div>
            )}
            <MapCanvas devices={devices} selected={selected} onSelect={setSelected} selectedDevice={selectedDevice} />
        </div>
    );
}

function EmbeddedReport({ section, height = 640 }) {
    return (
        <div style={{ height, display: 'flex', flexDirection: 'column', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
            <ReportPage reportSection={section} />
        </div>
    );
}

const VEHICLE_TRACK_TABS = ['Real-time Location', 'Route Replay', 'Speed', 'Mileage', 'Stops', 'Geofence', 'Work-zone Rules', 'Online Rate'];

function VehicleTrackPage() {
    const [tab, setTab]             = useState(VEHICLE_TRACK_TABS[0]);
    const [stopsView, setStopsView] = useState('Parking');
    const [rateView, setRateView]   = useState('Online');

    return (
        <PageShell title="Vehicle Track">
            <p style={{ margin: '-6px 0 16px', fontSize: 12.5, color: '#6b7280' }}>
                Real-time location, route replay, speed, mileage, stop, geofence, work-zone rule and online-rate management for every VL863-tracked vehicle — powered by Traccar.
            </p>
            <TabBar tabs={VEHICLE_TRACK_TABS} active={tab} onChange={setTab} />

            {tab === 'Real-time Location' && <LiveLocationTab />}
            {tab === 'Route Replay'       && <EmbeddedReport section="Replay" />}
            {tab === 'Speed'              && <EmbeddedReport section="Track Details" />}
            {tab === 'Mileage'            && <EmbeddedReport section="Mileage" />}
            {tab === 'Geofence'           && <EmbeddedReport section="Geo Fence" />}

            {tab === 'Stops' && (
                <>
                    <TabBar tabs={['Parking', 'Idling']} active={stopsView} onChange={setStopsView} />
                    <EmbeddedReport section={stopsView} />
                </>
            )}

            {tab === 'Online Rate' && (
                <>
                    <TabBar tabs={['Online', 'Offline']} active={rateView} onChange={setRateView} />
                    <EmbeddedReport section={rateView} />
                </>
            )}

            {tab === 'Work-zone Rules' && (
                <div style={{ height: 640, display: 'flex', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                    <GeofenceManagementPage onBack={() => {}} />
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
const FUEL_MANAGEMENT_TABS = ['Fuel Curve', 'Consumption', 'Current Fuel', 'Refuelling', 'Idle Fuel', 'Abnormal Loss' /*, 'Ranking', 'Tonne-Km' */];

function FuelManagementPage() {
    const [tab, setTab] = useState(FUEL_MANAGEMENT_TABS[0]);

    return (
        <PageShell title="Fuel Management">
            <p style={{ margin: '-6px 0 16px', fontSize: 12.5, color: '#6b7280' }}>
                Fuel curve, refuelling, idle fuel, abnormal loss, vehicle/driver/route ranking and tonne-kilometre fuel analytics — core and auxiliary vehicles by priority, powered by TurboHive OBD data.
            </p>
            <TabBar tabs={FUEL_MANAGEMENT_TABS} active={tab} onChange={setTab} />

            {tab === 'Fuel Curve'    && <EmbeddedReport section="Fuel Curve" />}
            {tab === 'Consumption'   && <EmbeddedReport section="Fuel Consumption" />}
            {tab === 'Current Fuel'  && <EmbeddedReport section="Current fuel Value" />}
            {tab === 'Refuelling'    && <EmbeddedReport section="Refuelling" />}
            {tab === 'Idle Fuel'     && <EmbeddedReport section="Idle Fuel" />}
            {tab === 'Abnormal Loss' && <EmbeddedReport section="Abnormal Fuel Loss" />}
            {tab === 'Ranking'       && <EmbeddedReport section="Fuel Ranking" height={720} />}
            {tab === 'Tonne-Km'      && <EmbeddedReport section="Tonne-Km Fuel Analytics" height={720} />}
        </PageShell>
    );
}

/* Check in Record */
// Real check-ins (RFID/iButton card taps), not a mock. TurboHive has no REST history endpoint for
// this — only a live MQTT push ({userId}/peri/{imei}, messageType "dlt") — so MqttWorker persists
// every one into driver_checkins the moment it arrives (see that migration's docblock) and
// broadcasts it live over Reverb; this page reads the persisted history and also listens live so
// new taps appear without a refresh.
function CheckInPage() {
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
        <PageShell title="Check in Record">
            <p style={{ margin: '-6px 0 16px', fontSize: 12.5, color: '#6b7280' }}>
                RFID/iButton card taps, captured live from TurboHive's MQTT peripheral stream — TurboHive doesn't retain this data itself, so this is the system of record.
            </p>
            <FilterBar>
                <FInput placeholder="Card ID" style={{ width: 140 }} value={cardId} onChange={e => setCardId(e.target.value)} />
                <FInput placeholder="Device name or IMEI" style={{ width: 220 }} value={deviceSearch} onChange={e => setDeviceSearch(e.target.value)} />
                <FInput label="From" type="date" style={{ width: 160 }} value={startDate} onChange={e => setStartDate(e.target.value)} />
                <FInput label="To" type="date" style={{ width: 160 }} value={endDate} onChange={e => setEndDate(e.target.value)} />
                <button onClick={load} style={{ padding: '7px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
            </FilterBar>

            {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>{error}</div>}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                    <thead><tr>{['No.','Card ID','IMEI','Device Name','Driver Name','Driver No.','Check-in Time'].map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={7} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No check-ins in range</td></tr>
                        ) : filtered.map((c, i) => (
                            <tr key={c.id}>
                                <td style={TD}>{i + 1}</td>
                                <td style={{ ...TD, fontFamily: 'monospace' }}>{c.driver_card_id}</td>
                                <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{c.imei}</td>
                                <td style={TD}>{devicesByImei[c.imei]?.deviceName || '—'}</td>
                                <td style={{ ...TD, fontWeight: 500 }}>{c.driver?.name || <span style={{ color: '#9ca3af', fontWeight: 400 }}>Unrecognized card</span>}</td>
                                <td style={TD}>{c.driver?.badge_no || '—'}</td>
                                <td style={{ ...TD, whiteSpace: 'nowrap' }}>{new Date(c.checkin_time).toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </PageShell>
    );
}

/* Route Planning */
function RoutePlanningPage() {
    return (
        <PageShell title="Route Planning">
            <FilterBar>
                <FInput placeholder="Please enter the route name" style={{ width: 200 }} />
                <FInput placeholder="Vehicle No." style={{ width: 150 }} />
                <FInput placeholder="IMEI" style={{ width: 150 }} />
                <SearchBtn />
            </FilterBar>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <Btn primary>Add</Btn>
                <Btn red>Delete</Btn>
            </div>
            <EmptyTable cols={['No.','Route name','Start location','End location','Total Mileage(km)','Stop','Action']} rows={[
                [1,'Manila → Makati Daily Run','Manila Warehouse','Makati Depot','14.2','2','Edit'],
                [2,'Quezon City Distribution','Quezon City Hub','Pasig Distribution Center','21.6','3','Edit'],
                [3,'Caloocan Cold Chain','Caloocan Yard','Taguig Cold Storage','27.9','1','Edit'],
            ]} />
        </PageShell>
    );
}

/* Fleet Report */
function FleetReportPage() {
    const [tab, setTab] = useState('Attendance Daily');
    const today = new Date().toISOString().slice(0,10);
    return (
        <PageShell title="Fleet Report">
            <TabBar tabs={['Attendance Daily','Vehicle Trip']} active={tab} onChange={setTab} />
            <FilterBar>
                <FInput placeholder="Driver No." style={{ width: 130 }} />
                <FInput placeholder="Driver name" style={{ width: 130 }} />
                <FInput placeholder="Number plate" style={{ width: 140 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: '#374151', background: '#fff' }}>
                    <span>{today}</span><span style={{ color: '#9ca3af' }}>-</span><span>{today}</span>
                </div>
                <SearchBtn />
            </FilterBar>
            <ActionRow left={[]} />
            {tab === 'Attendance Daily'
                ? <EmptyTable cols={['Driver Name','Driver No.','Clock In Time','Clock Out Time','Work Duration','Driving Duration','Associated Vehicle']} rows={[
                    ['Juan Dela Cruz','D-1001','2026-06-18 06:00','2026-06-18 15:30','9h 30m','3h 30m','NCR-1234'],
                    ['Maria Santos','D-1002','2026-06-18 05:45','2026-06-18 14:50','9h 05m','2h 50m','NCR-5678'],
                    ['Ana Garcia','D-1004','2026-06-18 05:40','2026-06-18 16:10','10h 30m','4h 15m','NCR-3456'],
                  ]} />
                : <EmptyTable cols={['No.','Driver Name','Driver No.','Vehicle No.','Start Time','End Time','Mileage (km)','Duration','Associated Fleet']} rows={[
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
const maintInputStyle = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box', width: '100%' };
const maintLabelStyle = { fontSize: 11.5, color: '#6b7280', fontWeight: 600 };

function VehicleMaintenanceFormModal({ record, vehicles, onClose, onSaved }) {
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
            <div style={{ background: '#fff', borderRadius: 12, width: 520, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{isNew ? 'New Maintenance Record' : 'Edit Maintenance Record'}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {error && <div style={{ gridColumn: '1 / -1', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>{error}</div>}

                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle}>Vehicle *</label>
                        <select value={form.imei} onChange={set('imei')} disabled={!isNew} style={{ ...maintInputStyle, background: isNew ? '#fff' : '#f3f4f6', cursor: isNew ? 'pointer' : 'default' }}>
                            <option value="">Select vehicle</option>
                            {vehicles.map(v => <option key={v.imei} value={v.imei}>{v.deviceName ?? v.imei}</option>)}
                        </select>
                    </div>
                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle}>Maintenance Type *</label>
                        <input value={form.maintenance_type} onChange={set('maintenance_type')} placeholder="e.g. Oil Change" style={maintInputStyle} />
                    </div>

                    <div style={{ ...maintFieldStyle, gridColumn: '1 / -1' }}>
                        <label style={maintLabelStyle}>Description</label>
                        <input value={form.description} onChange={set('description')} style={maintInputStyle} />
                    </div>

                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle}>Status</label>
                        <select value={form.status} onChange={set('status')} style={{ ...maintInputStyle, background: '#fff', cursor: 'pointer' }}>
                            <option>Scheduled</option>
                            <option>Completed</option>
                            <option>Cancelled</option>
                        </select>
                    </div>
                    <div />

                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle}>Due Date</label>
                        <input type="date" value={form.due_date} onChange={set('due_date')} style={maintInputStyle} />
                    </div>
                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle}>Due Odometer (km)</label>
                        <input type="number" min="0" value={form.due_odometer_km} onChange={set('due_odometer_km')} style={maintInputStyle} />
                    </div>
                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle}>Notify Days Before</label>
                        <input type="number" min="1" placeholder="Default 14" value={form.notify_days_before} onChange={set('notify_days_before')} style={maintInputStyle} />
                    </div>
                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle}>Notify Km Before</label>
                        <input type="number" min="1" placeholder="Default 500" value={form.notify_km_before} onChange={set('notify_km_before')} style={maintInputStyle} />
                    </div>

                    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #f1f5f9', paddingTop: 14, marginTop: 2 }}>
                        <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>Completion</p>
                    </div>
                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle}>Completed Date</label>
                        <input type="date" value={form.completed_date} onChange={set('completed_date')} style={maintInputStyle} />
                    </div>
                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle}>Completed Odometer (km)</label>
                        <input type="number" min="0" value={form.completed_odometer_km} onChange={set('completed_odometer_km')} style={maintInputStyle} />
                    </div>
                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle}>Cost</label>
                        <input type="number" min="0" step="0.01" value={form.cost} onChange={set('cost')} style={maintInputStyle} />
                    </div>
                    <div style={maintFieldStyle}>
                        <label style={maintLabelStyle}>Vendor</label>
                        <input value={form.vendor} onChange={set('vendor')} style={maintInputStyle} />
                    </div>
                    <div style={{ ...maintFieldStyle, gridColumn: '1 / -1' }}>
                        <label style={maintLabelStyle}>Notes</label>
                        <input value={form.notes} onChange={set('notes')} style={maintInputStyle} />
                    </div>
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function VehicleMaintenancePage() {
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
        <PageShell title="Vehicle Maintenance">
            <TabBar tabs={['Maintenance Records']} active="Maintenance Records" onChange={() => {}} />
            <FilterBar>
                <FInput placeholder="Vehicle/Maintenance Type" style={{ width: 220 }} value={search} onChange={e => setSearch(e.target.value)} />
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                    <option value="">All statuses</option>
                    {Object.keys(MAINTENANCE_STATUS_COLOR).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => { setSearch(''); setStatusFilter(''); }} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </FilterBar>
            <ActionRow left={[<Btn key="add" primary onClick={() => setEditing('new')}>Add</Btn>]} />

            {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>{error}</div>}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                    <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                        ) : filtered.map((r, i) => (
                            <tr key={r.id}>
                                <td style={TD}>{i + 1}</td>
                                <td style={{ ...TD, fontWeight: 500 }}>{vehiclesByImei[r.imei]?.deviceName ?? r.imei}</td>
                                <td style={TD}>{r.maintenance_type}</td>
                                <td style={TD}><Badge text={r.displayStatus} color={MAINTENANCE_STATUS_COLOR[r.displayStatus]} /></td>
                                <td style={TD}>{r.due_date ? r.due_date.slice(0, 10) : '—'}</td>
                                <td style={TD}>{r.due_odometer_km ?? '—'}</td>
                                <td style={TD}>{r.cost ?? '—'}</td>
                                <td style={TD}>{r.vendor || '—'}</td>
                                <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                                    <button onClick={() => setEditing(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: 12.5, fontWeight: 600, marginRight: 10 }}>Edit</button>
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
                />
            )}

            {pendingDeleteId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Delete maintenance record?</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748b' }}>This cannot be undone.</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setPendingDeleteId(null)} style={{ flex: 1, padding: 9, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleDelete} style={{ flex: 1, padding: 9, borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
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
    RoutePlanning: RoutePlanningPage,
    FleetReport:   FleetReportPage,
};

/* ══════════════════════════════════════════════════════════════ */
/*  Main export                                                   */
/* ══════════════════════════════════════════════════════════════ */
export default function FleetPage({ fleetPage = 'Dashboard', setFleetPage }) {
    const [accountOpen, setAccountOpen] = useState(true);
    const Content = PAGE_MAP[fleetPage] || FleetDashboard;
    const showAccountList = !['Dashboard', 'Driver', 'Vehicle', 'VehicleTrack', 'VehicleMaintenance', 'FuelManagement', 'CheckIn'].includes(fleetPage);

    return (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: '100%' }}>
            {showAccountList && (
                <>
                    {/* Account list panel */}
                    <div style={{ width: accountOpen ? 200 : 0, minWidth: accountOpen ? 200 : 0, overflow: 'hidden', background: '#fff', borderRight: '1px solid #e5e7eb', transition: 'width 0.22s ease, min-width 0.22s ease', flexShrink: 0 }}>
                        <div style={{ width: 200, display: 'flex', flexDirection: 'column', height: '100%' }}>
                            {/* Header */}
                            <div style={{ padding: '12px 14px 10px', fontWeight: 700, fontSize: 13, color: '#111827', borderBottom: '1px solid #f1f5f9', letterSpacing: 0.2 }}>Account List</div>
                            {/* Search row */}
                            <div style={{ padding: '8px 10px', display: 'flex', gap: 6, borderBottom: '1px solid #f1f5f9' }}>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: 6, overflow: 'hidden', background: '#f9fafb' }}>
                                    <input placeholder="Please enter the..." style={{ flex: 1, padding: '5px 8px', border: 'none', fontSize: 12, outline: 'none', minWidth: 0, background: 'transparent', color: '#374151' }} />
                                    <span style={{ padding: '0 7px', color: '#9ca3af', display: 'flex', alignItems: 'center' }}><SearchSVG /></span>
                                </div>
                                <button style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><DownloadSVG /></button>
                            </div>
                            {/* Account items */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, background: '#eff6ff', cursor: 'pointer' }}>
                                    <PersonSVG />
                                    <span style={{ color: '#374151', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>NextGen PNG(Stock8/Total8)</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Collapse strip */}
                    <button onClick={() => setAccountOpen(o => !o)} style={{ width: 13, background: '#e5e7eb', border: 'none', borderRight: '1px solid #d1d5db', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', flexShrink: 0, transition: 'background 0.15s' }}>
                        <CollapseArrow open={accountOpen} />
                    </button>
                </>
            )}

            {/* Content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
                <Content />
            </div>
        </div>
    );
}
