import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Kept in sync with App\Models\AlertRecipient::CATEGORIES on the backend — every alert email this
// app sends fans out through one of these four categories.
const CATEGORIES = [
    ['geofence', 'Geofence Enter/Exit'],
    ['driver_checkin', 'Face Recognition / Driver Check-in'],
    ['driver_expiry', 'Driver License & Safety Sticker Expiry'],
    ['vehicle_maintenance', 'Vehicle Maintenance Due'],
];
const CATEGORY_LABELS = Object.fromEntries(CATEGORIES);
const categoryLabel = (key) => CATEGORY_LABELS[key] || key;

const fieldLabelStyle = { display: 'block', fontSize: 11.5, color: '#6b7280', fontWeight: 600, marginBottom: 6 };
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none' };
const tagStyle = {
    display: 'inline-flex', alignItems: 'center', padding: '3px 9px', margin: '2px 4px 2px 0',
    background: '#eff6ff', color: '#1d4ed8', borderRadius: 14, fontSize: 11.5, fontWeight: 600,
};

function CategoriesField({ selected, onChange, disabled }) {
    const toggle = (key) => {
        if (disabled) return;
        onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]);
    };
    return (
        <div style={{ border: '1px solid #d1d5db', borderRadius: 8 }}>
            {CATEGORIES.map(([key, label]) => (
                <label key={key} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', fontSize: 13,
                    cursor: disabled ? 'not-allowed' : 'pointer', background: selected.includes(key) ? '#eff6ff' : '#fff',
                    borderBottom: '1px solid #f1f5f9',
                }}>
                    <input type="checkbox" checked={selected.includes(key)} disabled={disabled} onChange={() => toggle(key)} />
                    {label}
                </label>
            ))}
        </div>
    );
}

function RecipientModal({ recipient, onClose, onSaved }) {
    const isNew = !recipient;
    const [email, setEmail]           = useState(recipient?.email || '');
    const [name, setName]             = useState(recipient?.name || '');
    const [categories, setCategories] = useState(recipient?.categories || []);
    const [active, setActive]         = useState(recipient?.active ?? true);
    const [saving, setSaving]         = useState(false);
    const [error, setError]           = useState('');

    const handleSave = async () => {
        if (!email.trim()) { setError('Email is required.'); return; }
        if (categories.length === 0) { setError('Select at least one alert type.'); return; }
        setSaving(true);
        setError('');
        const payload = { email: email.trim(), name: name.trim() || null, categories, active };
        try {
            if (isNew) {
                await api.createAlertRecipient(payload);
            } else {
                await api.updateAlertRecipient(recipient.id, payload);
            }
            onSaved();
        } catch (e) {
            setError(e.response?.data?.message || e.response?.data?.errors?.email?.[0] || 'Failed to save recipient.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: '#fff', borderRadius: 12, width: 420, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{isNew ? 'New Recipient' : 'Edit Recipient'}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20 }}>
                    {error && (
                        <div style={{ marginBottom: 14, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ marginBottom: 14 }}>
                        <label style={fieldLabelStyle}>Email</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={saving} placeholder="name@example.com" style={inputStyle} />
                    </div>

                    <div style={{ marginBottom: 14 }}>
                        <label style={fieldLabelStyle}>Name (optional)</label>
                        <input value={name} onChange={e => setName(e.target.value)} disabled={saving} placeholder="e.g. Fleet Supervisor" style={inputStyle} />
                    </div>

                    <div style={{ marginBottom: 14 }}>
                        <label style={fieldLabelStyle}>Receives alerts for</label>
                        <CategoriesField selected={categories} disabled={saving} onChange={setCategories} />
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} disabled={saving} />
                        Active
                    </label>
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

const TH = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', background: '#f9fafb' };
const TD = { padding: '11px 14px', verticalAlign: 'middle', fontSize: 13, borderBottom: '1px solid #f1f5f9' };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: 5, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

export default function AlertRecipientsPage() {
    const [recipients, setRecipients] = useState([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState('');
    const [search, setSearch]         = useState('');
    const [editing, setEditing]       = useState(null); // recipient object, or 'new'
    const [pendingDeleteId, setPendingDeleteId] = useState(null);

    const fetchRecipients = async () => {
        try {
            const res = await api.getAlertRecipients();
            setRecipients(res.data);
        } catch (e) {
            setError('Failed to load alert recipients.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchRecipients(); }, []);

    const filtered = recipients.filter(r =>
        r.email.toLowerCase().includes(search.toLowerCase()) ||
        (r.name || '').toLowerCase().includes(search.toLowerCase())
    );

    const handleDelete = async () => {
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        try {
            await api.deleteAlertRecipient(id);
            await fetchRecipients();
        } catch (e) {
            setError('Failed to delete recipient.');
        }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', position: 'relative' }}>
            <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Alert Recipients</h2>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#6b7280' }}>Who gets emailed for geofence, driver check-in, license/sticker expiry, and maintenance alerts.</p>
            </div>

            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by email or name"
                    style={{ width: '100%', maxWidth: 420, boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }} />
            </div>

            {error && (
                <div style={{ margin: '12px 20px 0', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
                    {error}
                </div>
            )}

            <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                    <thead>
                        <tr>
                            <th style={TH}>Email</th>
                            <th style={TH}>Name</th>
                            <th style={TH}>Alert Types</th>
                            <th style={{ ...TH, textAlign: 'center' }}>Active</th>
                            <th style={{ ...TH, textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={5} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No recipients yet — add one to start receiving alert emails.</td></tr>
                        ) : filtered.map(r => (
                            <tr key={r.id}>
                                <td style={{ ...TD, fontWeight: 500 }}>{r.email}</td>
                                <td style={TD}>{r.name || '—'}</td>
                                <td style={TD}>
                                    {(r.categories || []).map(c => <span key={c} style={tagStyle}>{categoryLabel(c)}</span>)}
                                </td>
                                <td style={{ ...TD, textAlign: 'center' }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: r.active ? '#16a34a' : '#94a3b8' }}>● {r.active ? 'Active' : 'Paused'}</span>
                                </td>
                                <td style={{ ...TD, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <button style={iconBtn} title="Edit" onClick={() => setEditing(r)}>✏</button>
                                    <button style={{ ...iconBtn, color: '#ef4444' }} title="Delete" onClick={() => setPendingDeleteId(r.id)}>🗑</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <button onClick={() => setEditing('new')} title="Add recipient"
                style={{ position: 'absolute', bottom: 24, right: 24, width: 52, height: 52, borderRadius: '50%', background: '#3b82f6', color: '#fff', border: 'none', fontSize: 26, fontWeight: 400, lineHeight: 1, cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                +
            </button>

            {editing && (
                <RecipientModal
                    recipient={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); fetchRecipients(); }}
                />
            )}

            {pendingDeleteId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Delete recipient?</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748b' }}>They will stop receiving all alert emails.</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setPendingDeleteId(null)} style={{ flex: 1, padding: 9, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleDelete} style={{ flex: 1, padding: 9, borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
