import { useEffect, useState } from 'react';
import { api } from '../api.js';

const row = { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 };
const label = { color: '#6b7280' };
const value = { color: '#111827', fontWeight: 600, textAlign: 'right' };

const FIELDS = [
    ['imei',         'IMEI'],
    ['deviceName',   'Device Name'],
    ['deviceType',   'Type'],
    ['manufacturer', 'Manufacturer'],
    ['model',        'Model'],
    ['gatewayName',  'Gateway'],
    ['protocol',     'Protocol'],
    ['remark',       'Remark'],
];

export default function DeviceDetailModal({ deviceId, onClose }) {
    const [device,  setDevice]  = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState('');

    useEffect(() => {
        api.getTurboHiveDeviceDetail(deviceId)
            .then(({ data }) => setDevice(data))
            .catch(() => setError('Failed to load device detail.'))
            .finally(() => setLoading(false));
    }, [deviceId]);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
            <div style={{ background: '#fff', borderRadius: 12, width: 420, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Device Detail</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: '4px 20px 20px' }}>
                    {loading ? (
                        <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '24px 0' }}>Loading…</p>
                    ) : error ? (
                        <p style={{ fontSize: 13, color: '#dc2626', textAlign: 'center', padding: '24px 0' }}>{error}</p>
                    ) : (
                        <>
                            {FIELDS.map(([key, l]) => (
                                <div key={key} style={row}>
                                    <span style={label}>{l}</span>
                                    <span style={value}>{device?.[key] ?? '—'}</span>
                                </div>
                            ))}
                            <div style={row}>
                                <span style={label}>Status</span>
                                <span style={value}>{device?.status === 1 ? 'Active' : 'Inactive'}</span>
                            </div>
                            <div style={row}>
                                <span style={label}>Online</span>
                                <span style={value}>{device?.onlineStatus === 1 ? 'Online' : 'Offline'}</span>
                            </div>
                            <div style={{ ...row, borderBottom: 'none' }}>
                                <span style={label}>Import Time</span>
                                <span style={value}>{device?.importTime ? new Date(device.importTime).toLocaleString() : '—'}</span>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
