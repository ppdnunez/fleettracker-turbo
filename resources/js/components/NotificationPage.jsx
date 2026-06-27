import { useEffect, useState } from 'react';
import { api } from '../api.js';

const TYPE_LABELS = {
    commandResult: 'Command result',
    deviceOnline: 'Status online',
    deviceUnknown: 'Status unknown',
    deviceOffline: 'Status offline',
    deviceInactive: 'Device inactive',
    queuedCommandSent: 'Queued command sent',
    deviceMoving: 'Device moving',
    deviceStopped: 'Device stopped',
    deviceOverspeed: 'Speed limit exceeded',
    deviceFuelDrop: 'Fuel drop',
    deviceFuelIncrease: 'Fuel increase',
    geofenceEnter: 'Geofence entered',
    geofenceExit: 'Geofence exited',
    proximityEnter: 'Linked device nearby',
    proximityExit: 'Linked device away',
    unaccompaniedMotion: 'Unaccompanied motion',
    alarm: 'Alarm',
    ignitionOn: 'Ignition on',
    ignitionOff: 'Ignition off',
    maintenance: 'Maintenance required',
    driverChanged: 'Driver changed',
    media: 'Media',
};
const CHANNEL_LABELS = { web: 'Web', mail: 'Email', command: 'Command', sms: 'SMS' };

// Traccar's alarm sub-types (Position.ALARM_*) — for type=alarm notifications, attributes.alarms
// holds a comma-separated list of these keys to filter which alarms trigger the notification.
const ALARM_TYPES = [
    ['general', 'General'], ['sos', 'SOS'], ['vibration', 'Vibration'], ['movement', 'Movement'],
    ['lowspeed', 'Low Speed'], ['overspeed', 'Overspeed'], ['fallDown', 'Fall Down'],
    ['lowPower', 'Low Power'], ['lowBattery', 'Low Battery'], ['fault', 'Fault'],
    ['powerOff', 'Power Off'], ['powerOn', 'Power On'], ['door', 'Door'], ['lock', 'Lock'],
    ['unlock', 'Unlock'], ['geofence', 'Geofence'], ['geofenceEnter', 'Geofence Enter'],
    ['geofenceExit', 'Geofence Exit'], ['tow', 'Tow'], ['idle', 'Idle'], ['highRpm', 'High RPM'],
    ['hardAcceleration', 'Hard Acceleration'], ['hardBraking', 'Hard Braking'],
    ['hardCornering', 'Hard Cornering'], ['laneChange', 'Lane Change'],
    ['fatigueDriving', 'Fatigue Driving'], ['powerCut', 'Power Cut'],
    ['powerRestored', 'Power Restored'], ['jamming', 'Jamming'], ['temperature', 'Temperature'],
    ['parking', 'Parking'], ['bonnet', 'Bonnet'], ['footBrake', 'Foot Brake'],
    ['fuelLeak', 'Fuel Leak'], ['tampering', 'Tampering'], ['removing', 'Removing'],
];
const ALARM_LABELS = Object.fromEntries(ALARM_TYPES);
const alarmLabel = (key) => ALARM_LABELS[key] || humanize(null, key);

function humanize(label, raw) {
    if (label) return label;
    if (!raw) return '';
    return raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
}
const typeLabel    = (type) => humanize(TYPE_LABELS[type], type);
const channelLabel = (ch)   => humanize(CHANNEL_LABELS[ch], ch);
const channelsLabel = (notificators) => (notificators || '').split(',').filter(Boolean).map(channelLabel).join(', ') || '—';

const tagStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px',
    background: '#f1f5f9', color: '#334155', borderRadius: 16, fontSize: 12.5, fontWeight: 500,
};
const tagRemoveBtnStyle = {
    background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 11,
    width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
};
const fieldLabelStyle = { display: 'block', fontSize: 11.5, color: '#6b7280', fontWeight: 600, marginBottom: 6 };
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none' };

function ChannelsField({ allChannels, selected, onChange, disabled }) {
    const available = allChannels.filter(c => !selected.includes(c.type));
    return (
        <div style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 8px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 38 }}>
            {selected.map(ch => (
                <span key={ch} style={tagStyle}>
                    {channelLabel(ch)}
                    <button disabled={disabled} onClick={() => onChange(selected.filter(c => c !== ch))} style={tagRemoveBtnStyle}>✕</button>
                </span>
            ))}
            {available.length > 0 && (
                <select disabled={disabled} value="" onChange={e => { if (e.target.value) onChange([...selected, e.target.value]); }}
                    style={{ border: 'none', outline: 'none', background: 'transparent', color: '#3b82f6', fontSize: 12.5, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                    <option value="">+ Add…</option>
                    {available.map(c => <option key={c.type} value={c.type}>{channelLabel(c.type)}</option>)}
                </select>
            )}
        </div>
    );
}

function DevicesField({ allDevices, linkedIds, onAdd, onRemove, disabled }) {
    const linked    = linkedIds.map(id => allDevices.find(d => d.id === id)).filter(Boolean);
    const available = allDevices.filter(d => !linkedIds.includes(d.id));
    return (
        <div style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 8px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 38 }}>
            {linked.map(d => (
                <span key={d.id} style={tagStyle}>
                    {d.name}
                    <button disabled={disabled} onClick={() => onRemove(d.id)} style={tagRemoveBtnStyle}>✕</button>
                </span>
            ))}
            {available.length > 0 && (
                <select disabled={disabled} value="" onChange={e => { if (e.target.value) onAdd(Number(e.target.value)); }}
                    style={{ border: 'none', outline: 'none', background: 'transparent', color: '#3b82f6', fontSize: 12.5, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                    <option value="">+ Add…</option>
                    {available.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
            )}
            {linked.length === 0 && available.length === 0 && (
                <span style={{ fontSize: 12, color: '#94a3b8' }}>No devices</span>
            )}
        </div>
    );
}

function AlarmsField({ selected, onChange, disabled }) {
    const toggle = (key) => {
        if (disabled) return;
        onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]);
    };
    return (
        <div style={{ border: '1px solid #d1d5db', borderRadius: 8, maxHeight: 220, overflowY: 'auto' }}>
            {ALARM_TYPES.map(([key, label]) => (
                <label key={key} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', fontSize: 13,
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

function NotificationModal({ notification, onClose, onSaved }) {
    const isNew = !notification;
    const [type, setType]               = useState(notification?.type || '');
    const [alarms, setAlarms]           = useState((notification?.attributes?.alarms || '').split(',').filter(Boolean));
    const [channels, setChannels]       = useState((notification?.notificators || '').split(',').filter(Boolean));
    const [always, setAlways]           = useState(notification?.always ?? true);
    const [description, setDescription] = useState(notification?.description || '');
    const [calendarId, setCalendarId]   = useState(notification?.calendarId || 0);
    const [commandId, setCommandId]     = useState(notification?.commandId || 0);
    const [extraOpen, setExtraOpen]     = useState(false);

    const [allTypes, setAllTypes]             = useState([]);
    const [allChannels, setAllChannels]       = useState([]);
    const [allCalendars, setAllCalendars]     = useState([]);
    const [allCommands, setAllCommands]       = useState([]);
    const [allDevices, setAllDevices]         = useState([]);
    const [linkedDeviceIds, setLinkedDeviceIds] = useState([]);

    const [loading, setLoading] = useState(true);
    const [saving,  setSaving]  = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResults, setTestResults] = useState(null);
    const [error,   setError]   = useState('');

    useEffect(() => {
        (async () => {
            try {
                const calls = [api.getNotificationTypes(), api.getNotificators(), api.getTraccarCalendars(), api.getCommands()];
                if (!isNew) calls.push(api.getTraccarDevices(), api.getNotificationDevices(notification.id));
                const results = await Promise.all(calls);
                setAllTypes(results[0].data);
                setAllChannels(results[1].data);
                setAllCalendars(results[2].data);
                setAllCommands(results[3].data);
                if (!isNew) {
                    setAllDevices(results[4].data);
                    setLinkedDeviceIds(results[5].data.map(d => d.id));
                }
            } catch (e) {
                setError('Failed to load notification options.');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const handleTest = async () => {
        if (channels.length === 0) { setError('Select at least one channel to test.'); return; }
        setTesting(true);
        setError('');
        setTestResults(null);
        try {
            const res = await api.testNotificationChannels(channels);
            setTestResults(res.data.results);
        } catch (e) {
            setError('Failed to send test notification.');
        } finally {
            setTesting(false);
        }
    };

    const handleAddDevice = async (deviceId) => {
        try {
            await api.linkDeviceConnection(deviceId, 'notification', notification.id);
            setLinkedDeviceIds(ids => [...ids, deviceId]);
        } catch (e) {
            setError('Failed to link device.');
        }
    };
    const handleRemoveDevice = async (deviceId) => {
        try {
            await api.unlinkDeviceConnection(deviceId, 'notification', notification.id);
            setLinkedDeviceIds(ids => ids.filter(id => id !== deviceId));
        } catch (e) {
            setError('Failed to unlink device.');
        }
    };

    const handleSave = async () => {
        if (!type) { setError('Type is required.'); return; }
        setSaving(true);
        setError('');
        const payload = {
            type,
            always,
            calendarId: calendarId || 0,
            commandId:  commandId || 0,
            notificators: channels.join(','),
            description: description || null,
            attributes: type === 'alarm' && alarms.length ? { alarms: alarms.join(',') } : {},
        };
        try {
            if (isNew) {
                await api.createNotification(payload);
            } else {
                await api.updateNotification(notification.id, payload);
            }
            onSaved();
        } catch (e) {
            setError('Failed to save notification.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: '#fff', borderRadius: 12, width: 440, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{isNew ? 'New Notification' : 'Edit Notification'}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20 }}>
                    {error && (
                        <div style={{ marginBottom: 14, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 24 }}>Loading…</p>
                    ) : (
                        <>
                            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                                <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>Required</p>

                                <div style={{ marginBottom: 14 }}>
                                    <label style={fieldLabelStyle}>Type</label>
                                    <select value={type} onChange={e => setType(e.target.value)} style={{ ...inputStyle, background: '#fff', cursor: 'pointer' }}>
                                        <option value="">Select a type…</option>
                                        {allTypes.map(t => <option key={t.type} value={t.type}>{typeLabel(t.type)}</option>)}
                                    </select>
                                </div>

                                {type === 'alarm' && (
                                    <div style={{ marginBottom: 14 }}>
                                        <label style={fieldLabelStyle}>Alarms</label>
                                        <AlarmsField selected={alarms} disabled={saving} onChange={setAlarms} />
                                        {alarms.length > 0 && (
                                            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#6b7280' }}>{alarms.map(alarmLabel).join(', ')}</p>
                                        )}
                                    </div>
                                )}

                                <div style={{ marginBottom: 14 }}>
                                    <label style={fieldLabelStyle}>Channels</label>
                                    <ChannelsField allChannels={allChannels} selected={channels} disabled={saving}
                                        onChange={next => { setChannels(next); setTestResults(null); }} />
                                </div>

                                <button onClick={handleTest} disabled={testing} style={{ width: '100%', padding: 9, borderRadius: 7, border: '1.5px solid #3b82f6', background: '#fff', color: '#3b82f6', fontSize: 13, fontWeight: 600, cursor: testing ? 'not-allowed' : 'pointer', marginBottom: testResults ? 8 : 14 }}>
                                    {testing ? 'Sending…' : 'Test Channels'}
                                </button>

                                {testResults && (
                                    <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {testResults.map(r => (
                                            <div key={r.channel} style={{ fontSize: 12, color: r.success ? '#15803d' : '#991b1b' }}>
                                                {r.success ? '✓' : '✕'} {channelLabel(r.channel)}{r.success ? ' — sent' : ` — ${r.message || 'failed'}`}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={always} onChange={e => setAlways(e.target.checked)} />
                                    All Devices
                                </label>

                                {!always && (
                                    <div style={{ marginTop: 14 }}>
                                        <label style={fieldLabelStyle}>Devices</label>
                                        {isNew ? (
                                            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Save the notification first, then reopen it to choose specific devices.</p>
                                        ) : (
                                            <DevicesField allDevices={allDevices} linkedIds={linkedDeviceIds} onAdd={handleAddDevice} onRemove={handleRemoveDevice} disabled={saving} />
                                        )}
                                    </div>
                                )}
                            </div>

                            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                                <button onClick={() => setExtraOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                                    Extra
                                    <span style={{ transform: extraOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>▾</span>
                                </button>
                                {extraOpen && (
                                    <div style={{ padding: 14, borderTop: '1px solid #f1f5f9' }}>
                                        <div style={{ marginBottom: 14 }}>
                                            <label style={fieldLabelStyle}>Description</label>
                                            <input value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} />
                                        </div>
                                        <div style={{ marginBottom: 14 }}>
                                            <label style={fieldLabelStyle}>Calendar</label>
                                            <select value={calendarId} onChange={e => setCalendarId(Number(e.target.value))} style={{ ...inputStyle, background: '#fff', cursor: 'pointer' }}>
                                                <option value={0}>None</option>
                                                {allCalendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={fieldLabelStyle}>Saved Command</label>
                                            <select value={commandId} onChange={e => setCommandId(Number(e.target.value))} style={{ ...inputStyle, background: '#fff', cursor: 'pointer' }}>
                                                <option value={0}>None</option>
                                                {allCommands.map(c => <option key={c.id} value={c.id}>{c.description || c.type}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving || loading} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
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

export default function NotificationPage() {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState('');
    const [search, setSearch]     = useState('');
    const [editing, setEditing]   = useState(null);   // notification object, or 'new'
    const [pendingDeleteId, setPendingDeleteId] = useState(null);

    const fetchNotifications = async () => {
        try {
            const res = await api.getTraccarNotifications();
            setNotifications(res.data);
        } catch (e) {
            setError('Failed to load notifications.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchNotifications(); }, []);

    const filtered = notifications.filter(n =>
        (n.description || '').toLowerCase().includes(search.toLowerCase()) ||
        typeLabel(n.type).toLowerCase().includes(search.toLowerCase())
    );

    const handleDelete = async () => {
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        try {
            await api.deleteNotification(id);
            await fetchNotifications();
        } catch (e) {
            setError('Failed to delete notification.');
        }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', position: 'relative' }}>
            <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Notification</h2>
            </div>

            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search"
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
                            <th style={TH}>Description</th>
                            <th style={TH}>Type of Notification</th>
                            <th style={{ ...TH, textAlign: 'center' }}>All Devices</th>
                            <th style={TH}>Alarms</th>
                            <th style={TH}>Channels</th>
                            <th style={{ ...TH, textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={6} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data found</td></tr>
                        ) : filtered.map(n => (
                            <tr key={n.id}>
                                <td style={TD}>{n.description || '—'}</td>
                                <td style={{ ...TD, fontWeight: 500 }}>{typeLabel(n.type)}</td>
                                <td style={{ ...TD, textAlign: 'center' }}>{n.always ? 'Yes' : 'No'}</td>
                                <td style={TD}>{n.attributes?.alarms ? n.attributes.alarms.split(',').map(alarmLabel).join(', ') : '—'}</td>
                                <td style={TD}>{channelsLabel(n.notificators)}</td>
                                <td style={{ ...TD, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <button style={iconBtn} title="Edit" onClick={() => setEditing(n)}>✏</button>
                                    <button style={{ ...iconBtn, color: '#ef4444' }} title="Delete" onClick={() => setPendingDeleteId(n.id)}>🗑</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <button onClick={() => setEditing('new')} title="Add notification"
                style={{ position: 'absolute', bottom: 24, right: 24, width: 52, height: 52, borderRadius: '50%', background: '#3b82f6', color: '#fff', border: 'none', fontSize: 26, fontWeight: 400, lineHeight: 1, cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                +
            </button>

            {editing && (
                <NotificationModal
                    notification={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); fetchNotifications(); }}
                />
            )}

            {pendingDeleteId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Delete notification?</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748b' }}>This cannot be undone.</p>
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
