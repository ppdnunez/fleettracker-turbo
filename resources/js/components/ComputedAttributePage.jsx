import { useEffect, useState } from 'react';
import { api } from '../api.js';

const TYPE_OPTIONS = [
    { value: 'number',  label: 'Number' },
    { value: 'string',  label: 'String' },
    { value: 'boolean', label: 'Boolean' },
];
const typeLabel = (type) => TYPE_OPTIONS.find(t => t.value === type)?.label || type;

const fieldLabelStyle = (dark) => ({ display: 'block', fontSize: 11.5, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600, marginBottom: 6 });
const inputStyle = (dark) => ({ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 7, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a' });
const textareaStyle = (dark) => ({ ...inputStyle(dark), fontFamily: 'monospace', resize: 'vertical', minHeight: 80 });

function AttributeModal({ attribute, onClose, onSaved, dark }) {
    const isNew = !attribute;
    const [description, setDescription] = useState(attribute?.description || '');
    const [attr, setAttr]                = useState(attribute?.attribute || '');
    const [expression, setExpression]    = useState(attribute?.expression || '');
    const [type, setType]                = useState(attribute?.type || 'number');
    const [priority, setPriority]        = useState(attribute?.priority ?? 0);
    const [extraOpen, setExtraOpen]      = useState(false);
    const [testOpen, setTestOpen]        = useState(false);

    const [devices, setDevices]   = useState([]);
    const [testDeviceId, setTestDeviceId] = useState('');
    const [testing, setTesting]   = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [testError, setTestError]   = useState('');

    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => {
            setDevices(res.data);
            if (res.data[0]) setTestDeviceId(res.data[0].id);
        }).catch(() => {});
    }, []);

    const handleTest = async () => {
        if (!testDeviceId) return;
        setTesting(true);
        setTestError('');
        setTestResult(null);
        try {
            const res = await api.testComputedAttribute({
                deviceId: Number(testDeviceId), description, attribute: attr, expression, type, priority: priority || 0,
            });
            setTestResult(res.data.result);
        } catch (e) {
            setTestError(e.response?.data?.message || 'Test failed — check the expression and that the device has a recent position.');
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async () => {
        if (!description.trim() || !attr.trim() || !expression.trim()) {
            setError('Description, Attribute and Expression are required.');
            return;
        }
        setSaving(true);
        setError('');
        const payload = { description: description.trim(), attribute: attr.trim(), expression, type, priority: priority || 0 };
        try {
            if (isNew) {
                await api.createComputedAttribute(payload);
            } else {
                await api.updateComputedAttribute(attribute.id, payload);
            }
            onSaved();
        } catch (e) {
            setError('Failed to save computed attribute.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, width: 440, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}` }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>{isNew ? 'New Computed Attribute' : 'Edit Computed Attribute'}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#64748b' : '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20 }}>
                    {error && (
                        <div style={{ marginBottom: 14, padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
                        <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: dark ? '#94a3b8' : '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>Required</p>

                        <div style={{ marginBottom: 14 }}>
                            <label style={fieldLabelStyle(dark)}>Description</label>
                            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" style={inputStyle(dark)} />
                        </div>
                        <div style={{ marginBottom: 14 }}>
                            <label style={fieldLabelStyle(dark)}>Attribute</label>
                            <input value={attr} onChange={e => setAttr(e.target.value)} placeholder="e.g. speedKmh" style={{ ...inputStyle(dark), fontFamily: 'monospace' }} />
                        </div>
                        <div style={{ marginBottom: 14 }}>
                            <label style={fieldLabelStyle(dark)}>Expression</label>
                            <textarea value={expression} onChange={e => setExpression(e.target.value)} placeholder="e.g. speed * 1.852" style={textareaStyle(dark)} />
                        </div>
                        <div>
                            <label style={fieldLabelStyle(dark)}>Type</label>
                            <select value={type} onChange={e => setType(e.target.value)} style={{ ...inputStyle(dark), background: dark ? '#1e293b' : '#fff', cursor: 'pointer' }}>
                                {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div style={{ border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
                        <button onClick={() => setExtraOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: dark ? '#111827' : '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: dark ? '#94a3b8' : '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                            Extra
                            <span style={{ transform: extraOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>▾</span>
                        </button>
                        {extraOpen && (
                            <div style={{ padding: 14, borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}` }}>
                                <label style={fieldLabelStyle(dark)}>Priority</label>
                                <input type="number" value={priority} onChange={e => setPriority(Number(e.target.value))} style={inputStyle(dark)} />
                            </div>
                        )}
                    </div>

                    <div style={{ border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 8, overflow: 'hidden' }}>
                        <button onClick={() => setTestOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: dark ? '#111827' : '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: dark ? '#94a3b8' : '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                            Test
                            <span style={{ transform: testOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>▾</span>
                        </button>
                        {testOpen && (
                            <div style={{ padding: 14, borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}` }}>
                                <label style={fieldLabelStyle(dark)}>Device</label>
                                <select value={testDeviceId} onChange={e => setTestDeviceId(e.target.value)} style={{ ...inputStyle(dark), background: dark ? '#1e293b' : '#fff', cursor: 'pointer', marginBottom: 10 }}>
                                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                                <button onClick={handleTest} disabled={testing || !testDeviceId} style={{ width: '100%', padding: 9, borderRadius: 7, border: `1.5px solid ${dark ? '#60a5fa' : '#3b82f6'}`, background: dark ? '#1e293b' : '#fff', color: dark ? '#60a5fa' : '#3b82f6', fontSize: 13, fontWeight: 600, cursor: testing ? 'not-allowed' : 'pointer' }}>
                                    {testing ? 'Running…' : 'Run Test'}
                                </button>
                                {testError && <p style={{ margin: '10px 0 0', fontSize: 12, color: '#991b1b' }}>{testError}</p>}
                                {testResult !== null && !testError && (
                                    <p style={{ margin: '10px 0 0', fontSize: 13, color: dark ? '#e2e8f0' : '#0f172a' }}>Result: <strong>{String(testResult)}</strong></p>
                                )}
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

const TH = (dark) => ({ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: dark ? '#94a3b8' : '#374151', borderBottom: `2px solid ${dark ? '#1e293b' : '#e5e7eb'}`, whiteSpace: 'nowrap', background: dark ? '#0f172a' : '#f9fafb' });
const TD = (dark) => ({ padding: '11px 14px', verticalAlign: 'middle', fontSize: 13, borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, color: dark ? '#e2e8f0' : '#111827' });
const iconBtn = (dark) => ({ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#60a5fa' : '#3b82f6', padding: 5, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' });

export default function ComputedAttributePage({ dark }) {
    const [attributes, setAttributes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const [search, setSearch]   = useState('');
    const [editing, setEditing] = useState(null); // attribute object, or 'new'
    const [pendingDeleteId, setPendingDeleteId] = useState(null);

    const fetchAttributes = async () => {
        try {
            const res = await api.getComputedAttributes();
            setAttributes(res.data);
        } catch (e) {
            setError('Failed to load computed attributes.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAttributes(); }, []);

    const filtered = attributes.filter(a =>
        a.description.toLowerCase().includes(search.toLowerCase()) ||
        a.attribute.toLowerCase().includes(search.toLowerCase())
    );

    const handleDelete = async () => {
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        try {
            await api.deleteComputedAttribute(id);
            await fetchAttributes();
        } catch (e) {
            setError('Failed to delete computed attribute.');
        }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: dark ? '#0b1220' : '#fff', position: 'relative' }}>
            <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: dark ? '#f1f5f9' : '#111827' }}>Computed Attributes</h2>
            </div>

            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, flexShrink: 0 }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search"
                    style={{ width: '100%', maxWidth: 420, boxSizing: 'border-box', padding: '8px 12px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a' }} />
            </div>

            {error && (
                <div style={{ margin: '12px 20px 0', padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
                    {error}
                </div>
            )}

            <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                    <thead>
                        <tr>
                            <th style={TH(dark)}>Description</th>
                            <th style={TH(dark)}>Attribute</th>
                            <th style={TH(dark)}>Expression</th>
                            <th style={TH(dark)}>Type</th>
                            <th style={{ ...TH(dark), textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} style={{ ...TD(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={5} style={{ ...TD(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data found</td></tr>
                        ) : filtered.map(a => (
                            <tr key={a.id}>
                                <td style={{ ...TD(dark), fontWeight: 500 }}>{a.description}</td>
                                <td style={{ ...TD(dark), fontFamily: 'monospace' }}>{a.attribute}</td>
                                <td style={{ ...TD(dark), fontFamily: 'monospace', color: dark ? '#94a3b8' : '#6b7280' }}>{a.expression}</td>
                                <td style={TD(dark)}>{typeLabel(a.type)}</td>
                                <td style={{ ...TD(dark), textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <button style={iconBtn(dark)} title="Edit" onClick={() => setEditing(a)}>✏</button>
                                    <button style={{ ...iconBtn(dark), color: '#ef4444' }} title="Delete" onClick={() => setPendingDeleteId(a.id)}>🗑</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <button onClick={() => setEditing('new')} title="Add computed attribute"
                style={{ position: 'absolute', bottom: 24, right: 24, width: 52, height: 52, borderRadius: '50%', background: '#3b82f6', color: '#fff', border: 'none', fontSize: 26, fontWeight: 400, lineHeight: 1, cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                +
            </button>

            {editing && (
                <AttributeModal
                    attribute={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); fetchAttributes(); }}
                    dark={dark}
                />
            )}

            {pendingDeleteId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, padding: '24px 28px', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>Delete computed attribute?</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748b' }}>This cannot be undone.</p>
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
