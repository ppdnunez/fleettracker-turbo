import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';

/* ── icons ──────────────────────────────────────────────────── */
const SearchSVG = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="5.5" cy="5.5" r="4"/><line x1="9" y1="9" x2="12" y2="12"/>
    </svg>
);
const RefreshSVG = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M1 6.5a5.5 5.5 0 1 0 1.1-3.3"/><polyline points="1,1 1,5 5,5"/>
    </svg>
);
const PinSVG = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M7 1C4.8 1 2.5 3.2 2.5 5.8 2.5 9.2 7 13 7 13s4.5-3.8 4.5-7.2C11.5 3.2 9.2 1 7 1Z"/>
        <circle cx="7" cy="5.5" r="1.8" fill="currentColor" stroke="none"/>
    </svg>
);
const ListSVG = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <line x1="5" y1="4" x2="12" y2="4"/><line x1="5" y1="7" x2="12" y2="7"/><line x1="5" y1="10" x2="12" y2="10"/>
        <circle cx="2.5" cy="4" r="1" fill="currentColor" stroke="none"/>
        <circle cx="2.5" cy="7" r="1" fill="currentColor" stroke="none"/>
        <circle cx="2.5" cy="10" r="1" fill="currentColor" stroke="none"/>
    </svg>
);

/* ── styles ─────────────────────────────────────────────────── */
const TH = {
    padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12,
    color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', background: '#f9fafb',
};
const TD = { padding: '9px 12px', verticalAlign: 'middle', fontSize: 12.5, borderBottom: '1px solid #f1f5f9' };
const inp = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12.5, outline: 'none', background: '#fff', color: '#374151' };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: 4, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

/* label + input pair used in filter rows */
function FilterField({ label, children }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
            {children}
        </div>
    );
}

function Badge({ label, color = 'gray' }) {
    const palettes = {
        blue:  { bg: '#eff6ff', fg: '#1d4ed8' },
        green: { bg: '#dcfce7', fg: '#16a34a' },
        red:   { bg: '#fef2f2', fg: '#dc2626' },
        gray:  { bg: '#f1f5f9', fg: '#94a3b8' },
        indigo:{ bg: '#eef2ff', fg: '#4338ca' },
    };
    const p = palettes[color] ?? palettes.gray;
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: p.bg, color: p.fg, whiteSpace: 'nowrap' }}>
            {(color === 'green' || color === 'gray') && (
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: color === 'green' ? '#22c55e' : '#cbd5e1', display: 'inline-block', flexShrink: 0 }} />
            )}
            {label}
        </span>
    );
}

const EMPTY_DRAFT = { deviceType: '', manufacturer: '', model: '', protocol: '', importTimeStart: '', importTimeEnd: '' };

/* date string 'YYYY-MM-DD' → ms timestamp (start of day UTC) */
const dateToMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : null;

/* ── main component ─────────────────────────────────────────── */
export default function DeviceManagement() {
    const [devices,  setDevices]  = useState([]);
    const [meta,     setMeta]     = useState({ page: 1, size: 10, total: 0, totalPages: 1 });
    const [loading,  setLoading]  = useState(true);
    const [selected, setSelected] = useState(new Set());
    const [draft,    setDraft]    = useState(EMPTY_DRAFT);
    const [query,    setQuery]    = useState({ page: 1, size: 10 });

    const set = (key) => (e) => setDraft(f => ({ ...f, [key]: e.target.value }));

    const load = useCallback(async (params) => {
        setLoading(true);
        try {
            const { data } = await api.getTurboHiveDevices(params);
            setDevices(Array.isArray(data?.data) ? data.data : []);
            setMeta({
                page:       data?.page       ?? 1,
                size:       data?.size       ?? 10,
                total:      data?.total      ?? 0,
                totalPages: data?.totalPages ?? 1,
            });
        } catch (e) {
            console.error('Failed to load TurboHive devices:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(query); }, [query]);

    const search = () => {
        const q = { page: 1, size: query.size };
        if (draft.deviceType)     q.deviceType   = draft.deviceType;
        if (draft.manufacturer)   q.manufacturer = draft.manufacturer;
        if (draft.model)          q.model        = draft.model;
        if (draft.protocol)       q.protocol     = draft.protocol;
        const ts = dateToMs(draft.importTimeStart);
        const te = dateToMs(draft.importTimeEnd);
        if (ts) q.importTimeStart = ts;
        if (te) q.importTimeEnd   = te;
        setQuery(q);
    };

    const reset = () => {
        setDraft(EMPTY_DRAFT);
        setQuery({ page: 1, size: 10 });
    };

    const goPage = (p) => setQuery(q => ({ ...q, page: p }));

    const allChecked = devices.length > 0 && devices.every(d => selected.has(d.id));
    const toggleAll  = () => setSelected(allChecked ? new Set() : new Set(devices.map(d => d.id)));
    const toggleOne  = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

    const startRow = (meta.page - 1) * meta.size + 1;

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>

            {/* ── Title bar ── */}
            <div style={{ padding: '13px 20px 11px', borderBottom: '1px solid #e5e7eb', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827', flex: 1 }}>Device Management</h2>
                <span style={{ fontSize: 11.5, color: '#6b7280', background: '#f1f5f9', padding: '3px 10px', borderRadius: 10 }}>
                    {meta.total} device{meta.total !== 1 ? 's' : ''}
                </span>
                <button onClick={() => load(query)} title="Refresh"
                    style={{ ...iconBtn, color: '#6b7280', padding: '6px 9px', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                    <RefreshSVG />
                </button>
            </div>

            {/* ── Filters ── */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Row 1 */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                    <FilterField label="Device Type">
                        <input value={draft.deviceType} onChange={set('deviceType')}
                            placeholder="e.g. OBD, Tracker" style={{ ...inp, width: 150 }} />
                    </FilterField>
                    <FilterField label="Manufacturer">
                        <input value={draft.manufacturer} onChange={set('manufacturer')}
                            placeholder="e.g. JIMI" style={{ ...inp, width: 130 }} />
                    </FilterField>
                    <FilterField label="Model">
                        <input value={draft.model} onChange={set('model')}
                            placeholder="e.g. JC371" style={{ ...inp, width: 120 }} />
                    </FilterField>
                    <FilterField label="Protocol">
                        <input value={draft.protocol} onChange={set('protocol')}
                            placeholder="e.g. JT808" style={{ ...inp, width: 110 }} />
                    </FilterField>
                    <FilterField label="Import Time Start">
                        <input type="date" value={draft.importTimeStart} onChange={set('importTimeStart')}
                            style={{ ...inp, width: 140 }} />
                    </FilterField>
                    <FilterField label="Import Time End">
                        <input type="date" value={draft.importTimeEnd} onChange={set('importTimeEnd')}
                            style={{ ...inp, width: 140 }} />
                    </FilterField>
                    <button onClick={search}
                        style={{ padding: '6px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-end' }}>
                        <SearchSVG /> Search
                    </button>
                    <button onClick={reset}
                        style={{ padding: '6px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-end' }}>
                        Reset
                    </button>
                </div>
            </div>

            {/* ── Table ── */}
            <div style={{ flex: 1, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                    <thead>
                        <tr>
                            <th style={{ ...TH, width: 34 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                            <th style={{ ...TH, width: 42 }}>No.</th>
                            <th style={TH}>Device Name</th>
                            <th style={TH}>IMEI</th>
                            <th style={TH}>Type</th>
                            <th style={TH}>Manufacturer</th>
                            <th style={TH}>Model</th>
                            <th style={TH}>Gateway</th>
                            <th style={TH}>Protocol</th>
                            <th style={{ ...TH, textAlign: 'center' }}>Status</th>
                            <th style={{ ...TH, textAlign: 'center' }}>Online</th>
                            <th style={TH}>Import Time</th>
                            <th style={TH}>Remark</th>
                            <th style={{ ...TH, textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={14} style={{ ...TD, textAlign: 'center', padding: 52, color: '#94a3b8' }}>
                                <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 24, height: 24, border: '3px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                    Loading devices…
                                </div>
                            </td></tr>
                        ) : devices.length === 0 ? (
                            <tr><td colSpan={14} style={{ ...TD, textAlign: 'center', padding: 52, color: '#94a3b8' }}>No devices found</td></tr>
                        ) : devices.map((d, i) => (
                            <tr key={d.id} style={{ background: selected.has(d.id) ? '#eff6ff' : i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                <td style={TD}><input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleOne(d.id)} /></td>
                                <td style={{ ...TD, color: '#94a3b8', fontSize: 11.5 }}>{startRow + i}</td>
                                <td style={{ ...TD, fontWeight: 600, color: '#111827' }}>{d.deviceName || '—'}</td>
                                <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11.5, color: '#1d4ed8', letterSpacing: '0.02em' }}>{d.imei || '—'}</td>
                                <td style={TD}><Badge label={d.deviceType || '—'} color="blue" /></td>
                                <td style={TD}>{d.manufacturer || '—'}</td>
                                <td style={TD}>{d.model || '—'}</td>
                                <td style={{ ...TD, color: '#6b7280' }}>{d.gatewayName || (d.gatewayId ? `#${d.gatewayId}` : '—')}</td>
                                <td style={TD}><Badge label={d.protocol || '—'} color="indigo" /></td>
                                <td style={{ ...TD, textAlign: 'center' }}>
                                    <Badge label={d.status === 1 ? 'Active' : 'Inactive'} color={d.status === 1 ? 'green' : 'red'} />
                                </td>
                                <td style={{ ...TD, textAlign: 'center' }}>
                                    <Badge label={d.onlineStatus === 1 ? 'Online' : 'Offline'} color={d.onlineStatus === 1 ? 'green' : 'gray'} />
                                </td>
                                <td style={{ ...TD, color: '#6b7280', fontSize: 11.5, whiteSpace: 'nowrap' }}>
                                    {d.importTime ? new Date(d.importTime).toLocaleString() : '—'}
                                </td>
                                <td style={{ ...TD, color: '#6b7280', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                    title={d.remark || ''}>
                                    {d.remark || '—'}
                                </td>
                                <td style={{ ...TD, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <button style={iconBtn} title="View location"><PinSVG /></button>
                                    <button style={iconBtn} title="Device detail"><ListSVG /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ── Pagination ── */}
            <div style={{ padding: '10px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 12, color: '#6b7280', marginRight: 10 }}>
                    {meta.total === 0 ? '0 records' : `${startRow}–${Math.min(meta.page * meta.size, meta.total)} of ${meta.total}`}
                </span>
                <button onClick={() => goPage(1)}            disabled={meta.page === 1}               style={pagerBtn(meta.page === 1)}>«</button>
                <button onClick={() => goPage(meta.page-1)}  disabled={meta.page === 1}               style={pagerBtn(meta.page === 1)}>‹</button>
                {Array.from({ length: Math.min(5, meta.totalPages) }, (_, k) => {
                    const p = Math.max(1, Math.min(meta.page - 2, meta.totalPages - 4)) + k;
                    if (p < 1 || p > meta.totalPages) return null;
                    return (
                        <button key={p} onClick={() => goPage(p)}
                            style={{ ...pagerBtn(false), background: p === meta.page ? '#3b82f6' : '#fff', color: p === meta.page ? '#fff' : '#374151', fontWeight: p === meta.page ? 700 : 400, borderColor: p === meta.page ? '#3b82f6' : '#e5e7eb' }}>
                            {p}
                        </button>
                    );
                })}
                <button onClick={() => goPage(meta.page+1)}  disabled={meta.page === meta.totalPages} style={pagerBtn(meta.page === meta.totalPages)}>›</button>
                <button onClick={() => goPage(meta.totalPages)} disabled={meta.page === meta.totalPages} style={pagerBtn(meta.page === meta.totalPages)}>»</button>
                <select value={meta.size} onChange={e => setQuery(q => ({ ...q, size: +e.target.value, page: 1 }))}
                    style={{ ...inp, padding: '4px 8px', fontSize: 12, marginLeft: 8 }}>
                    {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
                </select>
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

const pagerBtn = (disabled) => ({
    padding: '4px 9px', borderRadius: 5, border: '1px solid #e5e7eb',
    background: '#fff', color: disabled ? '#d1d5db' : '#374151',
    cursor: disabled ? 'default' : 'pointer', fontSize: 12.5,
});
