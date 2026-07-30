import { useState, useEffect } from 'react';
import { api } from '../api.js';

const THStyle = (dark) => ({ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: dark ? '#94a3b8' : '#374151', borderBottom: `2px solid ${dark ? '#1e293b' : '#e5e7eb'}`, whiteSpace: 'nowrap', background: dark ? '#0f172a' : '#f9fafb' });
const TDStyle = (dark) => ({ padding: '11px 14px', verticalAlign: 'middle', fontSize: 13, borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, color: dark ? '#e2e8f0' : '#374151' });

const RESULT_COLOR = { succeeded: '#16a34a', failed: '#ef4444' };
const RESULT_LABEL = { succeeded: 'Succeeded', failed: 'Failed' };

function Badge({ text, color }) {
    return <span style={{ fontSize: 12, fontWeight: 600, color, background: `${color}1a`, padding: '2px 8px', borderRadius: 999 }}>{text}</span>;
}

function StatCard({ label, value, color, dark }) {
    return (
        <div style={{ flex: 1, background: dark ? '#111827' : '#fff', borderRadius: 10, border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, padding: '14px 16px' }}>
            <div style={{ fontSize: 12.5, color: dark ? '#94a3b8' : '#6b7280', marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: color || (dark ? '#f1f5f9' : '#111827') }}>{value}</div>
        </div>
    );
}

/**
 * Face Recognition (alert.code 1823 = match / 1824 = no match) — a biometric authentication event,
 * kept deliberately separate from the Driving Behavior module's 13xx codes. History is captured
 * live by MqttWorker::recordFaceRecognitionEvent into face_recognition_events (see that table's
 * migration docblock); this page just lists it, plus a live top-up via the same 'fleet' Reverb
 * channel other live feeds (ReportPage's alert feed, Dashboard's position/geofence feed) use.
 */
export default function FaceRecognitionPage({ dark }) {
    const TH = THStyle(dark);
    const TD = TDStyle(dark);
    const [events, setEvents]   = useState([]);
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const [search, setSearch]   = useState('');
    const [result, setResult]   = useState(''); // '', 'succeeded', 'failed'
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate]     = useState('');

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const params = {};
            if (result) params.result = result;
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = `${endDate} 23:59:59`;
            const [evRes, devRes] = await Promise.all([
                api.getFaceRecognitionEvents(params),
                api.getTurboHiveTrackableDevices({ page: 1, size: 100 }).catch(() => ({ data: { data: [] } })),
            ]);
            setEvents(Array.isArray(evRes.data) ? evRes.data : []);
            setDevices(Array.isArray(devRes.data?.data) ? devRes.data.data : []);
        } catch (e) {
            setError('Failed to load face recognition events.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [result, startDate, endDate]);

    // Live top-up — MqttWorker persists 1823/1824 the moment they arrive, so a fresh row is
    // already safe to show without waiting for the next poll/refresh.
    useEffect(() => {
        if (!window.Echo) return;
        const channel = window.Echo.channel('fleet');
        channel.listen('.alert.received', (data) => {
            if (data.code !== '1823' && data.code !== '1824') return;
            const newResult = data.code === '1823' ? 'succeeded' : 'failed';
            setEvents(evs => [{
                id: `live-${Date.now()}`,
                imei: data.imei,
                driver: null,
                result: newResult,
                file_names: data.raw?.['alert.file'] ? data.raw['alert.file'].split(',').map(s => s.trim()).filter(Boolean) : [],
                latitude: data.latitude,
                longitude: data.longitude,
                occurred_at: new Date(data.timestamp).toISOString(),
            }, ...evs]);
        });
        return () => window.Echo.leaveChannel('fleet');
    }, []);

    const devicesByImei = {};
    devices.forEach(d => { devicesByImei[d.imei] = d; });

    const filtered = events.filter(ev => {
        if (!search) return true;
        const name = devicesByImei[ev.imei]?.deviceName || '';
        const q = search.toLowerCase();
        return ev.imei.toLowerCase().includes(q) || name.toLowerCase().includes(q) || (ev.driver?.name || '').toLowerCase().includes(q);
    });

    const total     = events.length;
    const succeeded = events.filter(e => e.result === 'succeeded').length;
    const failed    = events.filter(e => e.result === 'failed').length;

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: dark ? '#0b1220' : '#fff' }}>
            <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: dark ? '#f1f5f9' : '#111827' }}>Face Recognition</h2>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: dark ? '#94a3b8' : '#6b7280' }}>Driver face-match checks captured live from device cameras (alert codes 1823/1824) — not a driving-behavior alert.</p>
            </div>

            <div style={{ display: 'flex', gap: 12, padding: '14px 20px 0', flexShrink: 0 }}>
                <StatCard label="Total Checks" value={total} dark={dark} />
                <StatCard label="Succeeded" value={succeeded} color="#16a34a" dark={dark} />
                <StatCard label="Failed" value={failed} color="#ef4444" dark={dark} />
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', padding: '14px 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, flexShrink: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600 }}>Search</label>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Vehicle name, IMEI, or driver"
                        style={{ width: 260, boxSizing: 'border-box', padding: '7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600 }}>Result</label>
                    <select value={result} onChange={e => setResult(e.target.value)}
                        style={{ padding: '7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a', cursor: 'pointer' }}>
                        <option value="">All</option>
                        <option value="succeeded">Succeeded</option>
                        <option value="failed">Failed</option>
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600 }}>From</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                        style={{ padding: '7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600 }}>To</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                        style={{ padding: '7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a' }} />
                </div>
                <button onClick={() => { setSearch(''); setResult(''); setStartDate(''); setEndDate(''); }}
                    style={{ padding: '7px 14px', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#374151', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
                <button onClick={load} style={{ padding: '7px 14px', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#374151', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Refresh</button>
            </div>

            {error && (
                <div style={{ margin: '12px 20px 0', padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? '#7f1d1d' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>
                    {error}
                </div>
            )}

            <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                    <thead>
                        <tr>
                            <th style={TH}>Time</th>
                            <th style={TH}>Vehicle</th>
                            <th style={TH}>IMEI</th>
                            <th style={TH}>Driver</th>
                            <th style={TH}>Result</th>
                            <th style={TH}>Filename(s)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={6} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No face recognition checks recorded yet.</td></tr>
                        ) : filtered.map(ev => (
                            <tr key={ev.id}>
                                <td style={{ ...TD, color: dark ? '#94a3b8' : '#6b7280', whiteSpace: 'nowrap' }}>{new Date(ev.occurred_at).toLocaleString()}</td>
                                <td style={{ ...TD, fontWeight: 500 }}>{devicesByImei[ev.imei]?.deviceName || '—'}</td>
                                <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{ev.imei}</td>
                                <td style={TD}>{ev.driver?.name || '—'}</td>
                                <td style={TD}><Badge text={RESULT_LABEL[ev.result] || ev.result} color={RESULT_COLOR[ev.result] || '#9ca3af'} /></td>
                                <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11.5, color: dark ? '#94a3b8' : '#6b7280' }}>
                                    {(ev.file_names || []).length > 0 ? ev.file_names.join(', ') : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
