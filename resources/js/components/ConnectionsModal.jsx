import { useEffect, useState } from 'react';
import { api } from '../api.js';

function humanizeNotificationType(type) {
    if (!type) return 'Notification';
    return type.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
}

const TYPE_PLURAL = { geofence: 'geofences', notification: 'notifications', driver: 'drivers', attribute: 'computedAttributes', maintenance: 'maintenances', command: 'commands' };

const tagStyleFor = (dark) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px',
    background: dark ? '#1e293b' : '#f1f5f9', color: dark ? '#e2e8f0' : '#334155', borderRadius: 16, fontSize: 12.5, fontWeight: 500,
});
const tagRemoveBtnStyleFor = (dark) => ({
    background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#94a3b8' : '#94a3b8', fontSize: 11,
    width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
});

function LinkField({ label, options, linkedIds, getLabel, onAdd, onRemove, disabled, dark }) {
    const linked    = linkedIds.map(id => options.find(o => o.id === id)).filter(Boolean);
    const available = options.filter(o => !linkedIds.includes(o.id));
    const tagStyle = tagStyleFor(dark);
    const tagRemoveBtnStyle = tagRemoveBtnStyleFor(dark);

    return (
        <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11.5, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600, marginBottom: 6 }}>{label}</label>
            <div style={{ border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 8, padding: '7px 8px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 38 }}>
                {linked.map(o => (
                    <span key={o.id} style={tagStyle}>
                        {getLabel(o)}
                        <button disabled={disabled} onClick={() => onRemove(o.id)} title="Remove" style={tagRemoveBtnStyle}>✕</button>
                    </span>
                ))}
                {available.length > 0 && (
                    <select disabled={disabled} value="" onChange={e => { if (e.target.value) onAdd(Number(e.target.value)); }}
                        style={{ border: 'none', outline: 'none', background: 'transparent', color: dark ? '#60a5fa' : '#3b82f6', fontSize: 12.5, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                        <option value="">+ Add…</option>
                        {available.map(o => <option key={o.id} value={o.id}>{getLabel(o)}</option>)}
                    </select>
                )}
                {linked.length === 0 && available.length === 0 && (
                    <span style={{ fontSize: 12, color: dark ? '#64748b' : '#94a3b8' }}>None available</span>
                )}
            </div>
        </div>
    );
}

export default function ConnectionsModal({ owner, ownerType = 'device', onClose, dark }) {
    const connApi = ownerType === 'group'
        ? { get: api.getGroupConnections, link: api.linkGroupConnection, unlink: api.unlinkGroupConnection }
        : { get: api.getDeviceConnections, link: api.linkDeviceConnection, unlink: api.unlinkDeviceConnection };

    const [allGeofences,     setAllGeofences]     = useState([]);
    const [allNotifications, setAllNotifications] = useState([]);
    const [allDrivers,       setAllDrivers]        = useState([]);
    const [allAttributes,    setAllAttributes]     = useState([]);
    const [allMaintenances,  setAllMaintenances]   = useState([]);
    const [allCommands,      setAllCommands]       = useState([]);
    const [linked,           setLinked]            = useState({ geofences: [], notifications: [], drivers: [], computedAttributes: [], maintenances: [], commands: [] });
    const [loading,          setLoading]           = useState(true);
    const [busy,             setBusy]              = useState(false);
    const [error,            setError]             = useState('');

    useEffect(() => {
        (async () => {
            try {
                const [g, n, d, a, m, c, conn] = await Promise.all([
                    api.getGeofences(),
                    api.getTraccarNotifications(),
                    api.getTraccarDrivers(),
                    api.getComputedAttributes(),
                    api.getMaintenances(),
                    api.getCommands(),
                    connApi.get(owner.id),
                ]);
                setAllGeofences(g.data);
                setAllNotifications(n.data);
                setAllDrivers(d.data);
                setAllAttributes(a.data);
                setAllMaintenances(m.data);
                setAllCommands(c.data);
                setLinked({
                    geofences:           conn.data.geofences.map(x => x.id),
                    notifications:       conn.data.notifications.map(x => x.id),
                    drivers:             conn.data.drivers.map(x => x.id),
                    computedAttributes:  conn.data.computedAttributes.map(x => x.id),
                    maintenances:        conn.data.maintenances.map(x => x.id),
                    commands:            conn.data.commands.map(x => x.id),
                });
            } catch (e) {
                setError('Failed to load connections.');
            } finally {
                setLoading(false);
            }
        })();
    }, [owner.id]);

    const handleAdd = async (type, id) => {
        setBusy(true);
        setError('');
        try {
            await connApi.link(owner.id, type, id);
            setLinked(l => ({ ...l, [TYPE_PLURAL[type]]: [...l[TYPE_PLURAL[type]], id] }));
        } catch (e) {
            setError('Failed to add connection.');
        } finally {
            setBusy(false);
        }
    };

    const handleRemove = async (type, id) => {
        setBusy(true);
        setError('');
        try {
            await connApi.unlink(owner.id, type, id);
            setLinked(l => ({ ...l, [TYPE_PLURAL[type]]: l[TYPE_PLURAL[type]].filter(x => x !== id) }));
        } catch (e) {
            setError('Failed to remove connection.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, width: 420, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}` }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>Connections</h2>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: dark ? '#64748b' : '#94a3b8' }}>{owner.name}</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#64748b' : '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20 }}>
                    {error && (
                        <div style={{ marginBottom: 14, padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? '#7f1d1d' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <p style={{ textAlign: 'center', color: dark ? '#64748b' : '#94a3b8', fontSize: 13, padding: 24 }}>Loading…</p>
                    ) : (
                        <>
                            <LinkField label="Geofences" options={allGeofences} linkedIds={linked.geofences} disabled={busy} dark={dark}
                                getLabel={g => g.name}
                                onAdd={id => handleAdd('geofence', id)} onRemove={id => handleRemove('geofence', id)} />
                            <LinkField label="Notifications" options={allNotifications} linkedIds={linked.notifications} disabled={busy} dark={dark}
                                getLabel={n => n.description || humanizeNotificationType(n.type)}
                                onAdd={id => handleAdd('notification', id)} onRemove={id => handleRemove('notification', id)} />
                            <LinkField label="Drivers" options={allDrivers} linkedIds={linked.drivers} disabled={busy} dark={dark}
                                getLabel={d => d.name}
                                onAdd={id => handleAdd('driver', id)} onRemove={id => handleRemove('driver', id)} />
                            <LinkField label="Computed Attributes" options={allAttributes} linkedIds={linked.computedAttributes} disabled={busy} dark={dark}
                                getLabel={a => a.description || a.attribute}
                                onAdd={id => handleAdd('attribute', id)} onRemove={id => handleRemove('attribute', id)} />
                            <LinkField label="Maintenance" options={allMaintenances} linkedIds={linked.maintenances} disabled={busy} dark={dark}
                                getLabel={m => m.name}
                                onAdd={id => handleAdd('maintenance', id)} onRemove={id => handleRemove('maintenance', id)} />
                            <LinkField label="Saved Commands" options={allCommands} linkedIds={linked.commands} disabled={busy} dark={dark}
                                getLabel={c => c.description}
                                onAdd={id => handleAdd('command', id)} onRemove={id => handleRemove('command', id)} />
                        </>
                    )}
                </div>

                <div style={{ padding: '12px 20px', borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Done</button>
                </div>
            </div>
        </div>
    );
}
