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

function StatCard({ label, value }) {
    return (
        <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12.5, color: '#6b7280' }}>{label}</span>
                <button style={{ padding: '2px 8px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 11, background: '#fff', color: '#6b7280', cursor: 'pointer' }}>This week ▾</button>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#111827' }}>{value ?? 0}</div>
        </div>
    );
}
function ChartCard({ tabs }) {
    const [active, setActive] = useState(tabs[0]);
    return (
        <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                    {tabs.map(t => (
                        <button key={t} onClick={() => setActive(t)} style={{ background: 'none', border: 'none', padding: '0 0 3px', fontSize: 12.5, cursor: 'pointer', color: active === t ? '#3b82f6' : '#9ca3af', borderBottom: active === t ? '2px solid #3b82f6' : '2px solid transparent', fontWeight: active === t ? 600 : 400 }}>{t}</button>
                    ))}
                </div>
                <button style={{ padding: '2px 8px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 11, background: '#fff', color: '#6b7280', cursor: 'pointer' }}>Last 7 days ▾</button>
            </div>
            <div style={{ height: 120, background: '#f8fafc', borderRadius: 8, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '12px 12px 0', gap: 4 }}>
                {[0.3,0.5,0.1,0.7,0.4,0.6,0.2].map((h, i) => (
                    <div key={i} style={{ flex: 1, background: '#dbeafe', borderRadius: '3px 3px 0 0', height: `${h * 60}%`, minHeight: 2 }} />
                ))}
            </div>
        </div>
    );
}
function ReminderCard() {
    const [tab, setTab] = useState('Driving license reminder');
    return (
        <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Reminder</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                {['Driving license reminder','Insurance reminder'].map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', padding: '0 0 3px', fontSize: 12.5, cursor: 'pointer', color: tab === t ? '#3b82f6' : '#9ca3af', borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent' }}>{t}</button>
                ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                <svg width="110" height="110" viewBox="0 0 110 110">
                    <circle cx="55" cy="55" r="44" fill="#3b82f6" opacity="0.1"/>
                    <circle cx="55" cy="55" r="44" fill="none" stroke="#3b82f6" strokeWidth="24" strokeDasharray="200 76" strokeDashoffset="25" transform="rotate(-90 55 55)"/>
                    <circle cx="55" cy="55" r="22" fill="#fff"/>
                </svg>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: '#6b7280', marginTop: 6 }}>
                {[['#3b82f6','Normal'],['#ef4444','Expired'],['#f59e0b','Expiring soon']].map(([c,l]) => (
                    <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: c }}/>
                        {l}
                    </span>
                ))}
            </div>
        </div>
    );
}
function AlarmRankingCard() {
    const [tab, setTab] = useState('Vehicle');
    return (
        <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Alarm statistics ranking</span>
                <button style={{ padding: '2px 8px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 11, background: '#fff', color: '#6b7280', cursor: 'pointer' }}>Last 7 days ▾</button>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                {['Vehicle','Alarm'].map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', padding: '0 0 3px', fontSize: 12.5, cursor: 'pointer', color: tab === t ? '#3b82f6' : '#9ca3af', borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent', fontWeight: tab === t ? 600 : 400 }}>{t}</button>
                ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 80px', fontSize: 12, fontWeight: 600, color: '#6b7280', paddingBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
                <span>Ranking</span><span>Number plate</span><span style={{ textAlign: 'right' }}>Alert Times</span>
            </div>
            {[['1','TRK-9982',14],['2','TRK-2201',9],['3','TRK-8834',6],['4','TRK-4821',3]].map(([rank, plate, count]) => (
                <div key={rank} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 80px', fontSize: 13, color: '#374151', padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
                    <span>{rank}</span><span>{plate}</span><span style={{ textAlign: 'right', fontWeight: 600 }}>{count}</span>
                </div>
            ))}
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  Fleet sub-pages                                               */
/* ══════════════════════════════════════════════════════════════ */

function FleetDashboard() {
    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#f8fafc' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Dashboard</h2>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                    <input type="checkbox" style={{ accentColor: '#3b82f6' }} /> Include sub-account
                </label>
            </div>

            {/* Hero + stat cards */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 2, background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)', borderRadius: 10, padding: '20px 24px', color: '#fff', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 40, marginBottom: 10 }}>
                        <div><div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Total Drivers</div><div style={{ fontSize: 36, fontWeight: 800 }}>6</div></div>
                        <div><div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Total Vehicles</div><div style={{ fontSize: 36, fontWeight: 800 }}>8</div></div>
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>Updated to {new Date().toISOString().slice(0,10)}</div>
                </div>
                <StatCard label="driven distance(km)" value="1,248" />
                <StatCard label="Total driving time(H)" value="86" />
                <StatCard label="Total Fuel Consumption (L)" value="312.4" />
            </div>

            {/* Reminder + Motion */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <ReminderCard />
                <ChartCard tabs={['exercise duration','Idling duration','Parked duration']} />
            </div>

            {/* Alarm type + Alarm ranking */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Alarm type ratio</span>
                        <button style={{ padding: '2px 8px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 11, background: '#fff', color: '#6b7280', cursor: 'pointer' }}>Last 7 days ▾</button>
                    </div>
                    <div style={{ height: 140, display: 'flex', alignItems: 'center', gap: 16, padding: '0 8px' }}>
                        <svg width="110" height="110" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
                            <circle r="16" cx="16" cy="16" fill="#f1f5f9" />
                            <circle r="8" cx="16" cy="16" fill="transparent" stroke="#3b82f6" strokeWidth="16" strokeDasharray="35.17 64.83" transform="rotate(-90 16 16)" />
                            <circle r="8" cx="16" cy="16" fill="transparent" stroke="#f59e0b" strokeWidth="16" strokeDasharray="25.12 74.88" strokeDashoffset="-35.17" transform="rotate(-90 16 16)" />
                            <circle r="8" cx="16" cy="16" fill="transparent" stroke="#ef4444" strokeWidth="16" strokeDasharray="20.10 79.90" strokeDashoffset="-60.29" transform="rotate(-90 16 16)" />
                            <circle r="8" cx="16" cy="16" fill="transparent" stroke="#10b981" strokeWidth="16" strokeDasharray="20.10 79.90" strokeDashoffset="-80.39" transform="rotate(-90 16 16)" />
                        </svg>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: '#374151' }}>
                            {[['#3b82f6','Overspeed','35%'],['#f59e0b','Geo-fence','25%'],['#ef4444','SOS','20%'],['#10b981','Low Battery','20%']].map(([c,l,p]) => (
                                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: c, display: 'inline-block' }} />{l}<span style={{ color: '#9ca3af' }}>{p}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
                <AlarmRankingCard />
            </div>

            {/* Fuel + Mileage */}
            <div style={{ display: 'flex', gap: 12 }}>
                <ChartCard tabs={['Total Fuel','Fuel /100km']} />
                <ChartCard tabs={['Total mileage','Average daily mileage']} />
            </div>
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

    const COLS = ['No.','Driver No.','Driver Name','Phone','License No.','RFID Card No.','Register Place','Register Date','License Expiry','License Status','Driving license reminder','Safety Sticker Expiry','Safety Sticker Status','Status','Action'];

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
            <ActionRow left={[<Btn primary onClick={() => setEditing('new')}>Add</Btn>]} />

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
function VehiclePage() {
    return (
        <PageShell title="Vehicle">
            <FilterBar>
                <FInput placeholder="IMEI" style={{ width: 150 }} />
                <FInput placeholder="Vehicle No." style={{ width: 150 }} />
                <FSel label="Status" placeholder="All Status" options={['Online','Offline','Moving','Parked']} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer', paddingBottom: 1 }}>
                    <input type="checkbox" style={{ accentColor: '#3b82f6' }} />Include sub-account
                </label>
                <SearchBtn /><ResetBtn />
            </FilterBar>
            <ActionRow left={[<Btn primary>Add</Btn>, <DropBtn>Batch operations</DropBtn>]} />
            <EmptyTable cols={['No.','Vehicle No.','Vehicle Type','Max Speed','Device Name','Device IMEI','Status','Insurance status','Insurance reminder','Action']} rows={[
                [1,'NCR-1234','Sedan','120 km/h','Device 001','123456789012001','Online','Active','Normal','Edit'],
                [2,'NCR-5678','Van','100 km/h','Device 002','123456789012002','Online','Active','Normal','Edit'],
                [3,'NCR-9012','Truck','90 km/h','Device 004','123456789012004','Offline','Expired','Expired','Edit'],
                [4,'NCR-3456','Motorcycle','110 km/h','Device 007','123456789012007','Online','Active','Expiring soon','Edit'],
            ]} />
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
// (Fuel Curve, Refuelling, Idle Fuel, Abnormal Loss, Ranking) are new Traccar-backed reports added
// for this module (see TraccarController's Fleet -> Fuel Management section) and surfaced the same
// way as Vehicle Track: via <ReportPage reportSection="..."/>.
const FUEL_MANAGEMENT_TABS = ['Fuel Curve', 'Consumption', 'Current Fuel', 'Refuelling', 'Idle Fuel', 'Abnormal Loss', 'Ranking'];

function FuelManagementPage() {
    const [tab, setTab] = useState(FUEL_MANAGEMENT_TABS[0]);

    return (
        <PageShell title="Fuel Management">
            <p style={{ margin: '-6px 0 16px', fontSize: 12.5, color: '#6b7280' }}>
                Fuel curve, refuelling, idle fuel, abnormal loss, vehicle/driver/route ranking and tonne-kilometre fuel analytics — core and auxiliary vehicles by priority, powered by Traccar.
            </p>
            <TabBar tabs={FUEL_MANAGEMENT_TABS} active={tab} onChange={setTab} />

            {tab === 'Fuel Curve'    && <EmbeddedReport section="Fuel Curve" />}
            {tab === 'Consumption'   && <EmbeddedReport section="Fuel Consumption" />}
            {tab === 'Current Fuel'  && <EmbeddedReport section="Current fuel Value" />}
            {tab === 'Refuelling'    && <EmbeddedReport section="Refuelling" />}
            {tab === 'Idle Fuel'     && <EmbeddedReport section="Idle Fuel" />}
            {tab === 'Abnormal Loss' && <EmbeddedReport section="Abnormal Fuel Loss" />}
            {tab === 'Ranking'       && <EmbeddedReport section="Fuel Ranking" height={720} />}
        </PageShell>
    );
}

/* Check in Record */
function CheckInPage() {
    const [tab, setTab] = useState('RFID');
    const today = new Date().toISOString().slice(0,10);
    const month = new Date(Date.now() - 30*24*3600*1000).toISOString().slice(0,10);
    return (
        <PageShell title="Check in Record">
            <TabBar tabs={['RFID','IBUTTON','KC208','DLT','Dashcam']} active={tab} onChange={setTab} />
            <FilterBar>
                <FInput placeholder="Card ID" style={{ width: 120 }} />
                <FInput placeholder="Device name or IMEI" style={{ width: 220 }} />
                <FInput placeholder="Driver No." style={{ width: 110 }} />
                <FInput placeholder="Driver name" style={{ width: 120 }} />
                <FInput placeholder="Number plate" style={{ width: 120 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: '#374151', background: '#fff' }}>
                    <span>{month}</span><span style={{ color: '#9ca3af' }}>-</span><span>{today}</span>
                </div>
                <SearchBtn />
            </FilterBar>
            <ActionRow left={[]} />
            <EmptyTable cols={['No.','Card ID','IMEI','Device name','Driver Name','Number plate','Driver No.','Photo','Operation Time']} rows={[
                [1,'RFID-88231','123456789012001','Device 001','Juan Dela Cruz','NCR-1234','D-1001','—','2026-06-18 06:00:02'],
                [2,'RFID-88232','123456789012002','Device 002','Maria Santos','NCR-5678','D-1002','—','2026-06-18 05:45:18'],
                [3,'RFID-88234','123456789012007','Device 007','Ana Garcia','NCR-3456','D-1004','—','2026-06-18 05:40:55'],
            ]} />
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

/* ── page map ────────────────────────────────────────────────── */
const PAGE_MAP = {
    Dashboard:     FleetDashboard,
    Driver:        DriverPage,
    Vehicle:       VehiclePage,
    VehicleTrack:  VehicleTrackPage,
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
    const showAccountList = !['Driver', 'VehicleTrack', 'FuelManagement'].includes(fleetPage);

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
