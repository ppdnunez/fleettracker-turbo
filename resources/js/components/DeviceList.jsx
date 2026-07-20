import { vehicleTypeEmoji } from '../vehicleIcons.js';

// Generic hardware-tracker icon (a tilted box with a lighter top face and darker side face for a
// simple pseudo-3D look, plus two small port/button accents) — shown when a vehicle has no
// vehicle_type set, replacing the flat gear placeholder that used to sit there.
function DeviceHardwareIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24">
            <defs>
                <linearGradient id="deviceTopFace" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#cbd5e1" />
                    <stop offset="100%" stopColor="#93a5bb" />
                </linearGradient>
                <linearGradient id="deviceSideFace" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7b8fa8" />
                    <stop offset="100%" stopColor="#48566b" />
                </linearGradient>
            </defs>
            <g transform="rotate(-24 12 12)">
                <rect x="4" y="10" width="16" height="6.5" rx="2" fill="url(#deviceSideFace)" />
                <rect x="4" y="7.5" width="16" height="6" rx="2" fill="url(#deviceTopFace)" />
                <rect x="7.5" y="9.5" width="3" height="2" rx="0.6" fill="#33415a" />
                <rect x="12.5" y="9.5" width="3" height="2" rx="0.6" fill="#33415a" />
            </g>
        </svg>
    );
}

function CollapseArrow({ open }) {
    return (
        <svg width="7" height="11" viewBox="0 0 7 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {open
                ? <polyline points="5.5,1 1.5,5.5 5.5,10"/>
                : <polyline points="1.5,1 5.5,5.5 1.5,10"/>
            }
        </svg>
    );
}

function SearchIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#94a3b8" strokeWidth="1.7">
            <circle cx="6" cy="6" r="4.5"/><line x1="9.5" y1="9.5" x2="13" y2="13"/>
        </svg>
    );
}

function SignalBars({ pct, online }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 14 }}>
            {[25, 50, 75, 100].map((t, i) => (
                <span key={i} style={{ width: 3, height: 4 + i * 2.5, borderRadius: 1, background: online && pct >= t ? '#3b82f6' : '#cbd5e1', display: 'block' }} />
            ))}
            <span style={{ fontSize: 10, color: online ? '#3b82f6' : '#94a3b8', marginLeft: 2, lineHeight: 1 }}>{pct}%</span>
        </span>
    );
}

export default function DeviceList({ devices, selected, onSelect, search, setSearch, loading, open, onToggle }) {
    return (
        <div style={{ display: 'flex', flexShrink: 0 }}>
            {/* Panel — width collapses to 0, content stays 260 and clips */}
            <div style={{
                width: open ? 260 : 0,
                minWidth: open ? 260 : 0,
                overflow: 'hidden',
                background: '#fff',
                borderRight: open ? '1px solid #e2e8f0' : 'none',
                transition: 'width 0.22s ease, min-width 0.22s ease',
                display: 'flex',
                flexDirection: 'column',
            }}>
                <div style={{ width: 260, display: 'flex', flexDirection: 'column', height: '100%' }}>
                    {/* Header — no hamburger */}
                    <div style={{ height: 44, display: 'flex', alignItems: 'center', padding: '0 14px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1.2 }}>DEVICES</span>
                    </div>

                    {/* Search */}
                    <div style={{ padding: '10px 12px 6px', flexShrink: 0 }}>
                        <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}><SearchIcon /></span>
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search device..."
                                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px 8px 32px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', background: '#f8fafc', color: '#0f172a' }} />
                        </div>
                    </div>

                    {/* List */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {loading ? (
                            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, paddingTop: 32 }}>Loading devices…</p>
                        ) : devices.length === 0 ? (
                            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, paddingTop: 32 }}>No devices found.</p>
                        ) : devices.map(d => (
                            <div key={d.id} onClick={() => onSelect(d.id)} style={{ padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', background: selected === d.id ? '#eff6ff' : 'transparent', borderLeft: `3px solid ${selected === d.id ? '#3b82f6' : 'transparent'}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ width: 28, height: 28, borderRadius: 7, background: selected === d.id ? '#dbeafe' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                                            {vehicleTypeEmoji(d.vehicleType) ?? <DeviceHardwareIcon />}
                                        </div>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{d.name}</span>
                                    </div>
                                    <span style={{ fontSize: 10, color: '#94a3b8' }}>···</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 36 }}>
                                    <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>{d.tracker}</span>
                                    <SignalBars pct={d.signal || 0} online={d.status === 'ONLINE'} />
                                </div>
                                <div style={{ paddingLeft: 36, marginTop: 4 }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: d.status === 'ONLINE' ? '#22c55e' : '#94a3b8' }}>● {d.status}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right-side collapse strip */}
            <button onClick={onToggle} title={open ? 'Collapse' : 'Expand'} style={{
                width: 13, background: '#e5e7eb', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#6b7280', flexShrink: 0, transition: 'background 0.15s',
                borderRight: '1px solid #d1d5db',
            }}>
                <CollapseArrow open={open} />
            </button>
        </div>
    );
}
