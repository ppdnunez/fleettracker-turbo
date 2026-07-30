import { useEffect, useState } from 'react';
import { api } from '../api.js';

const fieldLabelStyle = (dark) => ({ display: 'block', fontSize: 11.5, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600, marginBottom: 6 });
const inputStyle = (dark) => ({ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 7, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a' });

function NewClientModal({ onClose, onSaved, dark }) {
    const [name, setName] = useState('');
    const [adminName, setAdminName] = useState('');
    const [adminEmail, setAdminEmail] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    const [devices, setDevices] = useState([{ name: '', uniqueId: '' }]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const updateDevice = (idx, field, value) => {
        setDevices(rows => rows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    };
    const addDevice = () => setDevices(rows => [...rows, { name: '', uniqueId: '' }]);
    const removeDevice = (idx) => setDevices(rows => rows.filter((_, i) => i !== idx));

    const handleSave = async () => {
        if (!name.trim() || !adminName.trim() || !adminEmail.trim() || !adminPassword.trim()) {
            setError('Client name and admin name, email, and password are required.');
            return;
        }
        if (adminPassword.length < 8) {
            setError('Admin password must be at least 8 characters.');
            return;
        }
        const cleanDevices = devices
            .filter(d => d.name.trim() || d.uniqueId.trim())
            .map(d => ({ name: d.name.trim(), uniqueId: d.uniqueId.trim() }));
        for (const d of cleanDevices) {
            if (!d.name || !d.uniqueId) {
                setError('Each device needs both a name and a unique ID (IMEI).');
                return;
            }
        }

        setSaving(true);
        setError('');
        try {
            await api.createClient({
                name: name.trim(),
                admin_name: adminName.trim(),
                admin_email: adminEmail.trim(),
                admin_password: adminPassword,
                devices: cleanDevices,
            });
            onSaved();
        } catch (e) {
            setError(e?.response?.data?.message || 'Failed to provision client.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, width: 460, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}` }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>New Client</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#64748b' : '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20 }}>
                    {error && (
                        <div style={{ marginBottom: 14, padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? '#7f1d1d' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
                        <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: dark ? '#94a3b8' : '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>Client</p>
                        <label style={fieldLabelStyle(dark)}>Company / Client Name</label>
                        <input value={name} onChange={e => setName(e.target.value)} placeholder="Acme Logistics" style={inputStyle(dark)} />
                    </div>

                    <div style={{ border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
                        <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: dark ? '#94a3b8' : '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>Client Admin Login</p>
                        <label style={fieldLabelStyle(dark)}>Name</label>
                        <input value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Admin full name" style={{ ...inputStyle(dark), marginBottom: 10 }} />
                        <label style={fieldLabelStyle(dark)}>Email</label>
                        <input value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@client.com" style={{ ...inputStyle(dark), marginBottom: 10 }} />
                        <label style={fieldLabelStyle(dark)}>Password</label>
                        <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="At least 8 characters" style={inputStyle(dark)} />
                    </div>

                    <div style={{ border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 8, padding: 14 }}>
                        <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: dark ? '#94a3b8' : '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>Devices (optional)</p>
                        {devices.map((d, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                <input value={d.name} onChange={e => updateDevice(idx, 'name', e.target.value)} placeholder="Device name" style={inputStyle(dark)} />
                                <input value={d.uniqueId} onChange={e => updateDevice(idx, 'uniqueId', e.target.value)} placeholder="IMEI / unique ID" style={inputStyle(dark)} />
                                <button onClick={() => removeDevice(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16, flexShrink: 0 }}>✕</button>
                            </div>
                        ))}
                        <button onClick={addDevice} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#60a5fa' : '#3b82f6', fontSize: 12.5, fontWeight: 600, padding: 0 }}>+ Add device</button>
                    </div>
                </div>

                <div style={{ padding: '12px 20px', borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`, background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Provisioning…' : 'Provision Client'}
                    </button>
                </div>
            </div>
        </div>
    );
}

const THStyle = (dark) => ({ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: dark ? '#94a3b8' : '#374151', borderBottom: `2px solid ${dark ? '#1e293b' : '#e5e7eb'}`, whiteSpace: 'nowrap', background: dark ? '#0f172a' : '#f9fafb' });
const TDStyle = (dark) => ({ padding: '11px 14px', verticalAlign: 'middle', fontSize: 13, borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, color: dark ? '#e2e8f0' : '#0f172a' });

export default function ClientsPage({ dark }) {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showNew, setShowNew] = useState(false);

    const fetchClients = async () => {
        try {
            const res = await api.getClients();
            setClients(res.data);
        } catch (e) {
            setError('Failed to load clients.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchClients(); }, []);

    const toggleStatus = async (client) => {
        try {
            await api.updateClient(client.id, { status: client.status === 'active' ? 'suspended' : 'active' });
            await fetchClients();
        } catch (e) {
            setError('Failed to update client status.');
        }
    };

    const TH = THStyle(dark);
    const TD = TDStyle(dark);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: dark ? '#0b1220' : '#fff', position: 'relative' }}>
            <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: dark ? '#f1f5f9' : '#111827' }}>Clients</h2>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>SaaS tenants — each client is isolated to its own Traccar device group.</p>
                </div>
                <button onClick={() => setShowNew(true)} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    + New Client
                </button>
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
                            <th style={TH}>Traccar Group</th>
                            <th style={TH}>Users</th>
                            <th style={TH}>Status</th>
                            <th style={{ ...TH, textAlign: 'center', width: 110 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : clients.length === 0 ? (
                            <tr><td colSpan={5} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No clients yet</td></tr>
                        ) : clients.map(c => (
                            <tr key={c.id} onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.04)' : 'transparent'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <td style={{ ...TD, fontWeight: 500 }}>{c.name}</td>
                                <td style={TD}>#{c.traccar_group_id}</td>
                                <td style={TD}>{c.users_count}</td>
                                <td style={TD}>
                                    <span style={{
                                        padding: '3px 9px', borderRadius: 12, fontSize: 11.5, fontWeight: 700,
                                        background: c.status === 'active' ? (dark ? 'rgba(34,197,94,0.15)' : '#dcfce7') : (dark ? 'rgba(245,158,11,0.15)' : '#fef3c7'),
                                        color: c.status === 'active' ? '#166534' : '#92400e',
                                    }}>{c.status}</span>
                                </td>
                                <td style={{ ...TD, textAlign: 'center' }}>
                                    <button onClick={() => toggleStatus(c)} style={{ background: 'none', border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`, borderRadius: 6, cursor: 'pointer', color: dark ? '#e2e8f0' : '#475569', fontSize: 11.5, fontWeight: 600, padding: '5px 10px' }}>
                                        {c.status === 'active' ? 'Suspend' : 'Reactivate'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showNew && (
                <NewClientModal
                    onClose={() => setShowNew(false)}
                    onSaved={() => { setShowNew(false); fetchClients(); }}
                    dark={dark}
                />
            )}
        </div>
    );
}
