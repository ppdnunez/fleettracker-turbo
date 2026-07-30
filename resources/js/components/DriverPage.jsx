import { useEffect, useState } from 'react';
import { api } from '../api.js';
import AttributesEditor from './AttributesEditor.jsx';

const fieldLabelStyle = (dark) => ({ display: 'block', fontSize: 11.5, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600, marginBottom: 6 });
const inputStyle = (dark) => ({ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 7, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a' });

function DriverModal({ driver, onClose, onSaved, dark }) {
    const isNew = !driver;
    const [name, setName]         = useState(driver?.name || '');
    const [uniqueId, setUniqueId] = useState(driver?.uniqueId || '');
    const [attrRows, setAttrRows] = useState(Object.entries(driver?.attributes || {}).map(([key, value]) => ({ key, value: String(value) })));
    const [attributesOpen, setAttributesOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    const handleSave = async () => {
        if (!name.trim() || !uniqueId.trim()) { setError('Name and Identifier are required.'); return; }
        setSaving(true);
        setError('');
        const attributes = Object.fromEntries(attrRows.filter(r => r.key.trim()).map(r => [r.key.trim(), r.value]));
        const payload = { name: name.trim(), uniqueId: uniqueId.trim(), attributes };
        try {
            if (isNew) {
                await api.createDriver(payload);
            } else {
                await api.updateDriver(driver.id, payload);
            }
            onSaved();
        } catch (e) {
            setError('Failed to save driver.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, width: 420, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}` }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>{isNew ? 'New Driver' : 'Edit Driver'}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#64748b' : '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20 }}>
                    {error && (
                        <div style={{ marginBottom: 14, padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? '#7f1d1d' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
                        <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: dark ? '#94a3b8' : '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>Required</p>
                        <div style={{ marginBottom: 14 }}>
                            <label style={fieldLabelStyle(dark)}>Name</label>
                            <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" style={inputStyle(dark)} />
                        </div>
                        <div>
                            <label style={fieldLabelStyle(dark)}>Identifier</label>
                            <input value={uniqueId} onChange={e => setUniqueId(e.target.value)} placeholder="Identifier" style={inputStyle(dark)} />
                        </div>
                    </div>

                    <div style={{ border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 8, overflow: 'hidden' }}>
                        <button onClick={() => setAttributesOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: dark ? '#111827' : '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: dark ? '#94a3b8' : '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                            Attributes
                            <span style={{ transform: attributesOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>▾</span>
                        </button>
                        {attributesOpen && (
                            <div style={{ padding: 14, borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}` }}>
                                <AttributesEditor rows={attrRows} onChange={setAttrRows} dark={dark} />
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ padding: '12px 20px', borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`, background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

const THStyle = (dark) => ({ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: dark ? '#94a3b8' : '#374151', borderBottom: `2px solid ${dark ? '#1e293b' : '#e5e7eb'}`, whiteSpace: 'nowrap', background: dark ? '#0f172a' : '#f9fafb' });
const TDStyle = (dark) => ({ padding: '11px 14px', verticalAlign: 'middle', fontSize: 13, borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, color: dark ? '#e2e8f0' : '#0f172a' });
const iconBtnStyle = (dark) => ({ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#60a5fa' : '#3b82f6', padding: 5, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' });

export default function DriverPage({ dark }) {
    const [drivers, setDrivers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const [search, setSearch]   = useState('');
    const [editing, setEditing] = useState(null); // driver object, or 'new'
    const [pendingDeleteId, setPendingDeleteId] = useState(null);

    const fetchDrivers = async () => {
        try {
            const res = await api.getTraccarDrivers();
            setDrivers(res.data);
        } catch (e) {
            setError('Failed to load drivers.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDrivers(); }, []);

    const filtered = drivers.filter(d =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        d.uniqueId.toLowerCase().includes(search.toLowerCase())
    );

    const handleDelete = async () => {
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        try {
            await api.deleteDriver(id);
            await fetchDrivers();
        } catch (e) {
            setError('Failed to delete driver.');
        }
    };

    const TH = THStyle(dark);
    const TD = TDStyle(dark);
    const iconBtn = iconBtnStyle(dark);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: dark ? '#0b1220' : '#fff', position: 'relative' }}>
            <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: dark ? '#f1f5f9' : '#111827' }}>Drivers</h2>
            </div>

            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, flexShrink: 0 }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search"
                    style={{ width: '100%', maxWidth: 420, boxSizing: 'border-box', padding: '8px 12px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a' }} />
            </div>

            {error && (
                <div style={{ margin: '12px 20px 0', padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? '#7f1d1d' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>
                    {error}
                </div>
            )}

            <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={TH}>Name</th>
                            <th style={TH}>Identifier</th>
                            <th style={{ ...TH, textAlign: 'center', width: 100 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={3} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={3} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data found</td></tr>
                        ) : filtered.map(d => (
                            <tr key={d.id} onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.04)' : 'transparent'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <td style={{ ...TD, fontWeight: 500 }}>{d.name}</td>
                                <td style={TD}>{d.uniqueId}</td>
                                <td style={{ ...TD, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <button style={iconBtn} title="Edit" onClick={() => setEditing(d)}>✏</button>
                                    <button style={{ ...iconBtn, color: '#ef4444' }} title="Delete" onClick={() => setPendingDeleteId(d.id)}>🗑</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <button onClick={() => setEditing('new')} title="Add driver"
                style={{ position: 'absolute', bottom: 24, right: 24, width: 52, height: 52, borderRadius: '50%', background: '#3b82f6', color: '#fff', border: 'none', fontSize: 26, fontWeight: 400, lineHeight: 1, cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                +
            </button>

            {editing && (
                <DriverModal
                    driver={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); fetchDrivers(); }}
                    dark={dark}
                />
            )}

            {pendingDeleteId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, padding: '24px 28px', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>Delete driver?</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: dark ? '#94a3b8' : '#64748b' }}>This cannot be undone.</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setPendingDeleteId(null)} style={{ flex: 1, padding: 9, borderRadius: 7, border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`, background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleDelete} style={{ flex: 1, padding: 9, borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
