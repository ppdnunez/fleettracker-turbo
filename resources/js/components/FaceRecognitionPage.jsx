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

function TabBar({ tabs, active, onChange, dark }) {
    return (
        <div style={{ display: 'flex', gap: 4, padding: '0 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, flexShrink: 0 }}>
            {tabs.map(t => (
                <button key={t} onClick={() => onChange(t)}
                    style={{
                        padding: '10px 16px', fontSize: 13, fontWeight: 600, border: 'none', borderBottom: `2px solid ${active === t ? '#3b82f6' : 'transparent'}`,
                        background: 'transparent', color: active === t ? (dark ? '#f1f5f9' : '#111827') : (dark ? '#64748b' : '#9ca3af'), cursor: 'pointer',
                    }}>
                    {t}
                </button>
            ))}
        </div>
    );
}

const RESPONSE_COLOR = (code) => (code === 200 ? '#16a34a' : code === 403 ? '#f59e0b' : '#ef4444');

/**
 * Our own re-implementation of TurboHive's device-facing face image ingest API
 * (POST /img/uploads/face/uploadPic — see face-upload-api.md, FaceUploadService,
 * FaceUploadController). Devices are pointed here instead of TurboHive's/a third party's host via
 * the "Push Upload Host" form below (DriverFaceController::setUploadUrl -> UPLOADFACE command).
 * Lists every request received and exactly what {code,message,data} we replied with.
 */
function UploadLogTab({ dark, devices, devicesByImei }) {
    const TH = THStyle(dark);
    const TD = TDStyle(dark);
    const [receipts, setReceipts] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState('');
    const [search, setSearch]     = useState('');

    const [hostConfig, setHostConfig] = useState('');
    const [pushImei, setPushImei]     = useState('');
    const [pushUrl, setPushUrl]       = useState('');
    const [pushing, setPushing]       = useState(false);
    const [pushResult, setPushResult] = useState(null);

    const [showRawLog, setShowRawLog]   = useState(false);
    const [rawLines, setRawLines]       = useState([]);
    const [rawLoading, setRawLoading]   = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const params = {};
            if (search) params.imei = search;
            const res = await api.getFaceUploads(params);
            setReceipts(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            setError('Failed to load upload log.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [search]);

    // Raw request log — the web-UI equivalent of `tail -f storage/logs/laravel.log` for
    // uploadPic()'s own Log::info() entry (see FaceUploadController), so a device that's failing
    // (or not reaching us at all) can be diagnosed without cPanel Terminal/SSH access. Only polled
    // while the panel is open.
    const loadRawLog = async () => {
        setRawLoading(true);
        try {
            const res = await api.getFaceUploadRawLog({ limit: 100 });
            setRawLines(res.data?.lines ?? []);
        } catch (e) {
            // leave last successful snapshot on a failed poll
        } finally {
            setRawLoading(false);
        }
    };

    useEffect(() => {
        if (!showRawLog) return;
        loadRawLog();
        if (!autoRefresh) return;
        const t = setInterval(loadRawLog, 5000);
        return () => clearInterval(t);
    }, [showRawLog, autoRefresh]);

    useEffect(() => {
        api.getFaceUploadConfig().then(res => {
            const host = res.data?.host || '';
            setHostConfig(host);
            setPushUrl(host);
        }).catch(() => {});
    }, []);

    const handlePush = async () => {
        if (!pushImei || !pushUrl) return;
        setPushing(true);
        setPushResult(null);
        try {
            const res = await api.setFaceUploadUrl(pushImei, pushUrl);
            setPushResult(res.data);
        } catch (e) {
            setPushResult(e.response?.data || { message: 'Failed to send command.' });
        } finally {
            setPushing(false);
        }
    };

    return (
        <>
            <div style={{ padding: '14px 20px 0', flexShrink: 0 }}>
                <div style={{ background: dark ? '#111827' : '#f9fafb', border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: dark ? '#94a3b8' : '#6b7280', marginBottom: 10 }}>Push Upload Host to Device</div>
                    {hostConfig && (
                        <div style={{ fontSize: 11.5, color: dark ? '#64748b' : '#9ca3af', marginBottom: 10 }}>
                            Configured host: <span style={{ fontFamily: 'monospace', color: dark ? '#94a3b8' : '#6b7280' }}>{hostConfig}</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 12, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600 }}>Device</label>
                            <select value={pushImei} onChange={e => setPushImei(e.target.value)}
                                style={{ width: 220, padding: '7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a', cursor: 'pointer' }}>
                                <option value="">Select device…</option>
                                {devices.map(d => <option key={d.imei} value={d.imei}>{d.deviceName || d.imei}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 260 }}>
                            <label style={{ fontSize: 12, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600 }}>Upload URL</label>
                            <input value={pushUrl} onChange={e => setPushUrl(e.target.value)}
                                style={{ padding: '7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a' }} />
                        </div>
                        <button onClick={handlePush} disabled={pushing || !pushImei || !pushUrl}
                            style={{ padding: '8px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: (pushing || !pushImei || !pushUrl) ? 'not-allowed' : 'pointer', opacity: (pushing || !pushImei || !pushUrl) ? 0.6 : 1 }}>
                            {pushing ? 'Sending…' : 'Push to Device'}
                        </button>
                    </div>
                    {pushResult && (
                        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', background: dark ? '#0b1220' : '#fff', border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, color: dark ? '#94a3b8' : '#6b7280', whiteSpace: 'pre-wrap' }}>
                            {JSON.stringify(pushResult, null, 2)}
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', padding: '14px 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, flexShrink: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600 }}>IMEI</label>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by IMEI"
                        style={{ width: 220, boxSizing: 'border-box', padding: '7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a' }} />
                </div>
                <button onClick={load} style={{ padding: '7px 14px', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#374151', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Refresh</button>
                <button onClick={() => setShowRawLog(v => !v)} style={{ padding: '7px 14px', background: showRawLog ? '#3b82f6' : (dark ? '#1e293b' : '#fff'), color: showRawLog ? '#fff' : (dark ? '#e2e8f0' : '#374151'), border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {showRawLog ? 'Hide Raw Log' : 'Show Raw Log'}
                </button>
            </div>

            {showRawLog && (
                <div style={{ margin: '0 20px 14px', border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: dark ? '#111827' : '#f9fafb', borderBottom: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}` }}>
                        <span style={{ fontSize: 12, color: dark ? '#94a3b8' : '#6b7280' }}>
                            Live tail of <code>storage/logs/laravel.log</code> — every raw request to <code>face/uploadPic</code>, logged before validation.
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: dark ? '#94a3b8' : '#6b7280', cursor: 'pointer' }}>
                                <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
                                Auto-refresh
                            </label>
                            <button onClick={loadRawLog} disabled={rawLoading} style={{ padding: '4px 10px', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#374151', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 5, fontSize: 12, cursor: rawLoading ? 'default' : 'pointer' }}>
                                {rawLoading ? 'Loading…' : 'Refresh'}
                            </button>
                        </div>
                    </div>
                    <div style={{ maxHeight: 280, overflow: 'auto', padding: '10px 12px', background: dark ? '#0b1220' : '#0f172a', fontFamily: 'monospace', fontSize: 11.5, lineHeight: 1.6 }}>
                        {rawLines.length === 0 ? (
                            <div style={{ color: '#64748b' }}>{rawLoading ? 'Loading…' : 'No matching log entries yet — trigger the device and hit Refresh.'}</div>
                        ) : rawLines.map((line, i) => (
                            <div key={i} style={{ color: '#cbd5e1', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginBottom: 6, paddingBottom: 6, borderBottom: i < rawLines.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                                {line}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {error && (
                <div style={{ margin: '12px 20px 0', padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? '#7f1d1d' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>
                    {error}
                </div>
            )}

            <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
                    <thead>
                        <tr>
                            <th style={TH}>Received</th>
                            <th style={TH}>Vehicle</th>
                            <th style={TH}>IMEI</th>
                            <th style={TH}>File Name</th>
                            <th style={TH}>Instruction ID</th>
                            <th style={TH}>Source IP</th>
                            <th style={TH}>Response</th>
                            <th style={TH}>Message</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : receipts.length === 0 ? (
                            <tr><td colSpan={8} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No uploads received yet.</td></tr>
                        ) : receipts.map(r => (
                            <tr key={r.id}>
                                <td style={{ ...TD, color: dark ? '#94a3b8' : '#6b7280', whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString()}</td>
                                <td style={{ ...TD, fontWeight: 500 }}>{devicesByImei[r.imei]?.deviceName || '—'}</td>
                                <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{r.imei || '—'}</td>
                                <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{r.file_name || '—'}</td>
                                <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{r.instruction_id || '—'}</td>
                                <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }} title={r.user_agent || ''}>{r.ip || '—'}</td>
                                <td style={TD}><Badge text={r.response_code} color={RESPONSE_COLOR(r.response_code)} /></td>
                                <td style={{ ...TD, color: dark ? '#94a3b8' : '#6b7280' }}>{r.response_message}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

/**
 * Face Recognition (alert.code 1823 = match / 1824 = no match) — a biometric authentication event,
 * kept deliberately separate from the Driving Behavior module's 13xx codes. History is captured
 * live by MqttWorker::recordFaceRecognitionEvent into face_recognition_events (see that table's
 * migration docblock); this page just lists it, plus a live top-up via the same 'fleet' Reverb
 * channel other live feeds (ReportPage's alert feed, Dashboard's position/geofence feed) use.
 *
 * The "Upload Log" tab is a separate concern: our own re-implementation of TurboHive's raw
 * device-facing face-photo ingest API (see UploadLogTab above) — what actually lands the image on
 * our server, upstream of whatever alert code eventually gets attached to it.
 */
export default function FaceRecognitionPage({ dark }) {
    const TH = THStyle(dark);
    const TD = TDStyle(dark);
    const [tab, setTab] = useState('Match Events');
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
            <TabBar tabs={['Match Events', 'Upload Log']} active={tab} onChange={setTab} dark={dark} />

            {tab === 'Upload Log' ? (
                <UploadLogTab dark={dark} devices={devices} devicesByImei={devicesByImei} />
            ) : (
                <>
                    <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, flexShrink: 0 }}>
                        <p style={{ margin: 0, fontSize: 12.5, color: dark ? '#94a3b8' : '#6b7280' }}>Driver face-match checks captured live from device cameras (alert codes 1823/1824) — not a driving-behavior alert.</p>
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
                </>
            )}
        </div>
    );
}
