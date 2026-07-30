import { useEffect, useState } from 'react';
import { api } from '../api.js';

const TYPE_LABELS = {
    custom: 'Custom',
    deviceIdentification: 'Device Identification',
    positionSingle: 'Position Single',
    positionPeriodic: 'Position Periodic',
    positionStop: 'Position Stop',
    engineStop: 'Engine Stop',
    engineResume: 'Engine Resume',
    alarmArm: 'Arm Alarm',
    alarmDisarm: 'Disarm Alarm',
    alarmDismiss: 'Dismiss Alarm',
    setTimezone: 'Set Timezone',
    requestPhoto: 'Request Photo',
    powerOff: 'Power Off',
    rebootDevice: 'Reboot Device',
    factoryReset: 'Factory Reset',
    sendSms: 'Send SMS',
    sendUssd: 'Send USSD',
    sosNumber: 'SOS Number',
    silenceTime: 'Silence Time',
    setPhonebook: 'Set Phonebook',
    message: 'Message',
    voiceMessage: 'Voice Message',
    outputControl: 'Output Control',
    voiceMonitoring: 'Voice Monitoring',
    setAgps: 'Set AGPS',
    setIndicator: 'Set Indicator',
    configuration: 'Configuration',
    getVersion: 'Get Version',
    firmwareUpdate: 'Firmware Update',
    setConnection: 'Set Connection',
    setOdometer: 'Set Odometer',
    getModemStatus: 'Get Modem Status',
    getDeviceStatus: 'Get Device Status',
    setSpeedLimit: 'Set Speed Limit',
    modePowerSaving: 'Power Saving Mode',
    modeDeepSleep: 'Deep Sleep Mode',
    videoStart: 'Video Start',
    videoStop: 'Video Stop',
    alarmGeofence: 'Set Geofence Alarm',
    alarmBattery: 'Set Battery Alarm',
    alarmSos: 'Set SOS Alarm',
    alarmRemove: 'Set Remove Alarm',
    alarmClock: 'Set Clock Alarm',
    alarmSpeed: 'Set Speed Alarm',
    alarmFall: 'Set Fall Alarm',
    alarmVibration: 'Set Vibration Alarm',
};
function humanize(type) {
    if (!type) return '';
    return type.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
}
const typeLabel = (type) => TYPE_LABELS[type] || humanize(type);

const fieldLabelStyle = (dark) => ({ display: 'block', fontSize: 11.5, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600, marginBottom: 6 });
const inputStyle = (dark) => ({ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 7, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a' });

function SavedCommandModal({ command, onClose, onSaved, dark }) {
    const isNew = !command;
    const [description, setDescription] = useState(command?.description || '');
    const [type, setType]               = useState(command?.type || '');
    const [textChannel, setTextChannel] = useState(command?.textChannel || false);
    const [noQueue, setNoQueue]         = useState(command?.attributes?.noQueue || false);

    const [types, setTypes]   = useState([]);
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    useEffect(() => {
        api.getCommandTypes().then(res => setTypes(res.data)).catch(() => {});
    }, []);

    const handleSave = async () => {
        if (!description.trim() || !type) { setError('Description and Type are required.'); return; }
        setSaving(true);
        setError('');
        const payload = { description: description.trim(), type, textChannel, noQueue };
        try {
            if (isNew) {
                await api.createSavedCommand(payload);
            } else {
                await api.updateSavedCommand(command.id, payload);
            }
            onSaved();
        } catch (e) {
            setError('Failed to save command.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, width: 420, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}` }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>{isNew ? 'New Saved Command' : 'Edit Saved Command'}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#64748b' : '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20 }}>
                    {error && (
                        <div style={{ marginBottom: 14, padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 8, padding: 14 }}>
                        <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: dark ? '#94a3b8' : '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>Required</p>

                        <div style={{ marginBottom: 14 }}>
                            <label style={fieldLabelStyle(dark)}>Description</label>
                            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" style={inputStyle(dark)} />
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={fieldLabelStyle(dark)}>Type</label>
                            <select value={type} onChange={e => setType(e.target.value)} style={{ ...inputStyle(dark), background: dark ? '#1e293b' : '#fff', cursor: 'pointer' }}>
                                <option value="">Select a type…</option>
                                {types.map(t => <option key={t.type} value={t.type}>{typeLabel(t.type)}</option>)}
                            </select>
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: dark ? '#94a3b8' : '#374151', cursor: 'pointer', marginBottom: 10 }}>
                            <input type="checkbox" checked={textChannel} onChange={e => setTextChannel(e.target.checked)} />
                            Send SMS
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: dark ? '#94a3b8' : '#374151', cursor: 'pointer' }}>
                            <input type="checkbox" checked={noQueue} onChange={e => setNoQueue(e.target.checked)} />
                            No queue
                        </label>
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

export default function SavedCommandPage({ dark }) {
    const [commands, setCommands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const [search, setSearch]   = useState('');
    const [editing, setEditing] = useState(null); // command object, or 'new'
    const [pendingDeleteId, setPendingDeleteId] = useState(null);

    const fetchCommands = async () => {
        try {
            const res = await api.getCommands();
            setCommands(res.data);
        } catch (e) {
            setError('Failed to load saved commands.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchCommands(); }, []);

    const filtered = commands.filter(c =>
        c.description.toLowerCase().includes(search.toLowerCase()) ||
        typeLabel(c.type).toLowerCase().includes(search.toLowerCase())
    );

    const handleDelete = async () => {
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        try {
            await api.deleteSavedCommand(id);
            await fetchCommands();
        } catch (e) {
            setError('Failed to delete command.');
        }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: dark ? '#0b1220' : '#fff', position: 'relative' }}>
            <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: dark ? '#f1f5f9' : '#111827' }}>Saved Commands</h2>
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
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                    <thead>
                        <tr>
                            <th style={TH(dark)}>Description</th>
                            <th style={TH(dark)}>Type</th>
                            <th style={{ ...TH(dark), textAlign: 'center' }}>Send SMS</th>
                            <th style={{ ...TH(dark), textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={4} style={{ ...TD(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={4} style={{ ...TD(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data found</td></tr>
                        ) : filtered.map(c => (
                            <tr key={c.id}>
                                <td style={{ ...TD(dark), fontWeight: 500 }}>{c.description}</td>
                                <td style={TD(dark)}>{typeLabel(c.type)}</td>
                                <td style={{ ...TD(dark), textAlign: 'center' }}>{c.textChannel ? 'Yes' : 'No'}</td>
                                <td style={{ ...TD(dark), textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <button style={iconBtn(dark)} title="Edit" onClick={() => setEditing(c)}>✏</button>
                                    <button style={{ ...iconBtn(dark), color: '#ef4444' }} title="Delete" onClick={() => setPendingDeleteId(c.id)}>🗑</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <button onClick={() => setEditing('new')} title="Add saved command"
                style={{ position: 'absolute', bottom: 24, right: 24, width: 52, height: 52, borderRadius: '50%', background: '#3b82f6', color: '#fff', border: 'none', fontSize: 26, fontWeight: 400, lineHeight: 1, cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                +
            </button>

            {editing && (
                <SavedCommandModal
                    command={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); fetchCommands(); }}
                    dark={dark}
                />
            )}

            {pendingDeleteId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, padding: '24px 28px', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>Delete saved command?</h3>
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
