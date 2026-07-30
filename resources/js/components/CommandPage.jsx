import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';

const th = (dark) => ({ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: dark ? '#94a3b8' : '#374151', borderBottom: `2px solid ${dark ? '#1e293b' : '#e5e7eb'}`, whiteSpace: 'nowrap', background: dark ? '#0f172a' : '#f9fafb' });
const td = (dark) => ({ padding: '11px 14px', verticalAlign: 'middle', fontSize: 13, borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, color: dark ? '#e2e8f0' : '#374151' });

const inputStyleFor = (dark) => ({ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 8, fontSize: 13, outline: 'none', color: dark ? '#e2e8f0' : '#374151', background: dark ? '#1e293b' : '#fff' });
const labelStyleFor = (dark) => ({ display: 'block', fontSize: 13, fontWeight: 700, color: dark ? '#f1f5f9' : '#111827', marginBottom: 8 });

const STATUS_COLOR = { success: '#16a34a', failed: '#ef4444', pending: '#f59e0b', timeout: '#9ca3af' };

function Badge({ text, color }) {
    return <span style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', background: color, padding: '2px 9px', borderRadius: 999, textTransform: 'uppercase' }}>{text}</span>;
}

// Multi-device searchable checklist — same "click to open a panel with a search box" shape as
// ReportPage.jsx's SearchSelect, but selecting multiple devices at once since batchSend's `imeis`
// is an array (that's the whole point of the batch endpoint over the single-device /command one).
function DeviceMultiSelect({ devices, selected, onChange, dark }) {
    const [open, setOpen]   = useState(false);
    const [query, setQuery] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    const filtered = query
        ? devices.filter(d => (d.deviceName ?? d.imei).toLowerCase().includes(query.toLowerCase()) || d.imei.includes(query))
        : devices;

    const toggle = (imei) => {
        onChange(selected.includes(imei) ? selected.filter(i => i !== imei) : [...selected, imei]);
    };

    // "IMEI (deviceName)" — same format Device Management lists devices in.
    const label = (d) => `${d.imei} (${d.deviceName ?? 'unnamed'})`;

    const selectedLabels = selected
        .map(imei => { const d = devices.find(d => d.imei === imei); return d ? label(d) : imei; });
    const summary = selectedLabels.length === 0
        ? 'Search and select a device…'
        : selectedLabels.length <= 2
        ? selectedLabels.join(', ')
        : `${selectedLabels.length} devices selected`;

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <label style={labelStyleFor(dark)}>Device Selection</label>
            <div onClick={() => setOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', border: `1px solid ${open ? '#6366f1' : (dark ? '#334155' : '#d1d5db')}`, borderRadius: 8, background: dark ? '#1e293b' : '#fff', cursor: 'pointer', fontSize: 13, color: selected.length ? (dark ? '#e2e8f0' : '#111827') : (dark ? '#64748b' : '#9ca3af') }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
                <span style={{ color: dark ? '#64748b' : '#9ca3af', marginLeft: 8 }}>▾</span>
            </div>
            {open && (
                <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4, background: dark ? '#111827' : '#fff', border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.15)', maxHeight: 320, display: 'flex', flexDirection: 'column' }}>
                    <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…"
                        style={{ margin: 8, padding: '6px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#111827' }} />
                    {selected.length > 0 && (
                        <div style={{ padding: '0 12px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 11.5, color: dark ? '#94a3b8' : '#6b7280' }}>{selected.length} selected</span>
                            <button onClick={() => onChange([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 11.5, fontWeight: 600 }}>Clear all</button>
                        </div>
                    )}
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {filtered.length === 0 ? (
                            <div style={{ padding: '8px 12px', fontSize: 13, color: dark ? '#64748b' : '#9ca3af' }}>No matches</div>
                        ) : filtered.map(d => (
                            <label key={d.imei} onClick={e => e.stopPropagation()}
                                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: dark ? '#e2e8f0' : '#374151' }}>
                                <input type="checkbox" checked={selected.includes(d.imei)} onChange={() => toggle(d.imei)} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label(d)}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function ResponseModal({ record, onClose, dark }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
            onClick={onClose}>
            <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}
                onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}` }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>Response — {record.imei}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#64748b' : '#9ca3af', fontSize: 16 }}>✕</button>
                </div>
                <pre style={{ margin: 0, padding: 20, overflow: 'auto', fontSize: 12, fontFamily: 'monospace', color: dark ? '#e2e8f0' : '#374151', background: dark ? '#0b1220' : '#f8fafc' }}>
                    {JSON.stringify(record.response, null, 2)}
                </pre>
            </div>
        </div>
    );
}

/**
 * Batch device command dispatch — TurboHive's POST /v3/command/batchSend sends one command to
 * many IMEIs at once (see TurboHiveController::batchSendCommand). Distinct from the single-device
 * command sender embedded in DrivingBehaviorAlertModal/IButtonConfigModal (POST /v3/command/send) —
 * this is the dedicated multi-device module, reached from Device > Command in the sidebar.
 * TurboHive has no history endpoint for either, so Command History here reads from the local
 * device_commands table this page's own sends write to (one row per IMEI per batch).
 */
export default function CommandPage({ dark }) {
    const [devices, setDevices]     = useState([]);
    const [selected, setSelected]   = useState([]);
    const [content, setContent]     = useState('');

    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState('');
    const [sendResult, setSendResult] = useState(null);

    const [history, setHistory]   = useState([]);
    const [showAll, setShowAll]   = useState(false);
    const [histLoading, setHistLoading] = useState(true);
    const [viewingResponse, setViewingResponse] = useState(null);

    const historyRef = useRef(null);

    useEffect(() => {
        api.getTurboHiveTrackableDevices({ page: 1, size: 200 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    const loadHistory = async () => {
        setHistLoading(true);
        try {
            const res = await api.getCommandHistory(showAll ? { all: 1 } : {});
            setHistory(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            setHistory([]);
        } finally {
            setHistLoading(false);
        }
    };

    useEffect(() => { loadHistory(); }, [showAll]); // eslint-disable-line react-hooks/exhaustive-deps

    // Every command sent from this page is a plain text command, dispatched async (TurboHive's own
    // recommendation for batch sends) with offline devices queued — there's nothing here for a user
    // to misconfigure by picking the wrong option, so these aren't exposed as form fields.
    const buildPayload = () => ({
        imeis: selected,
        content,
        messageFormat: 'text',
        sync: false,
        offline: true,
        timeout: 30,
        batchTimeout: 45,
        isManual: true,
    });

    const handleClear = () => {
        setSelected([]); setContent('');
        setSendError(''); setSendResult(null);
    };

    const handleSend = async () => {
        if (selected.length === 0) { setSendError('Select at least one device.'); return; }
        if (!content.trim()) { setSendError('Enter a command.'); return; }
        setSending(true);
        setSendError('');
        setSendResult(null);
        try {
            const payload = buildPayload();
            const res = await api.batchSendTurboHiveCommand(payload.imeis, payload.content, payload);
            setSendResult(res.data);
            await loadHistory();
        } catch (e) {
            setSendError(e.response?.data?.message || 'Failed to send command.');
        } finally {
            setSending(false);
        }
    };

    const HIST_COLS = ['Time', 'IMEI', 'Content', 'Message Format', 'Is Manual', 'Mode', 'Status', 'Response'];

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: dark ? '#0b1220' : '#fff' }}>
            <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: dark ? '#f1f5f9' : '#111827' }}>Command</h2>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: dark ? '#94a3b8' : '#6b7280' }}>Send a command to one or many devices at once via TurboHive's batch command dispatch.</p>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px' }}>
                <div style={{ marginBottom: 18 }}>
                    <DeviceMultiSelect devices={devices} selected={selected} onChange={setSelected} dark={dark} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ ...labelStyleFor(dark), marginBottom: 0 }}>Command Content</label>
                    <button onClick={() => historyRef.current?.scrollIntoView({ behavior: 'smooth' })}
                        style={{ padding: '6px 14px', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#374151', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                        🕐 History
                    </button>
                </div>
                <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Enter your command here..." rows={4}
                    style={{ ...inputStyleFor(dark), resize: 'vertical', fontFamily: 'monospace' }} />
                <p style={{ margin: '6px 0 0', fontSize: 12, color: dark ? '#64748b' : '#9ca3af', fontStyle: 'italic' }}>
                    Enter text command (e.g., Status#, GMT#, CHECK#)
                </p>

                {sendError && <div style={{ marginTop: 12, padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? 'rgba(239,68,68,0.35)' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#f87171' : '#991b1b' }}>{sendError}</div>}
                {sendResult && (
                    <div style={{ marginTop: 12, padding: '10px 12px', background: dark ? 'rgba(34,197,94,0.15)' : '#f0fdf4', border: `1px solid ${dark ? 'rgba(34,197,94,0.35)' : '#bbf7d0'}`, borderRadius: 6, fontSize: 12.5, color: dark ? '#4ade80' : '#166534' }}>
                        Batch dispatched — {sendResult.data?.success ?? 0}/{sendResult.data?.total ?? selected.length} succeeded
                        {sendResult.data?.async ? ' (async — some rows may still settle)' : ''}.
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                    <button onClick={handleClear} style={{ padding: '9px 18px', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#374151', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Clear</button>
                    <button onClick={handleSend} disabled={sending}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 22px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.7 : 1 }}>
                        ➤ {sending ? 'Sending…' : 'Send Command'}
                    </button>
                </div>

                <div ref={historyRef} style={{ marginTop: 32, paddingTop: 20, borderTop: `1px dashed ${dark ? '#1e293b' : '#e5e7eb'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#111827' }}>Command History</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: dark ? '#e2e8f0' : '#374151', cursor: 'pointer' }}>
                                <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
                                Show ALL Commands
                            </label>
                            <button onClick={loadHistory} title="Refresh"
                                style={{ padding: '6px 10px', background: dark ? '#1e293b' : '#f3f4f6', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 8, cursor: 'pointer', fontSize: 13, color: dark ? '#e2e8f0' : '#111827' }}>↻</button>
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                            <thead><tr>{HIST_COLS.map(c => <th key={c} style={th(dark)}>{c}</th>)}</tr></thead>
                            <tbody>
                                {histLoading ? (
                                    <tr><td colSpan={HIST_COLS.length} style={{ ...td(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                                ) : history.length === 0 ? (
                                    <tr><td colSpan={HIST_COLS.length} style={{ ...td(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>No commands sent yet.</td></tr>
                                ) : history.map(r => (
                                    <tr key={r.id}>
                                        <td style={td(dark)}>{new Date(r.created_at).toLocaleString()}</td>
                                        <td style={{ ...td(dark), fontFamily: 'monospace', fontSize: 12 }}>{r.imei}</td>
                                        <td style={{ ...td(dark), fontFamily: 'monospace' }}>{r.content}</td>
                                        <td style={td(dark)}><Badge text={r.message_format} color="#6366f1" /></td>
                                        <td style={td(dark)}>{r.is_manual ? 'Yes' : 'No'}</td>
                                        <td style={td(dark)}><Badge text={r.mode} color="#0ea5e9" /></td>
                                        <td style={td(dark)}><Badge text={r.status} color={STATUS_COLOR[r.status] || '#9ca3af'} /></td>
                                        <td style={td(dark)}>
                                            <button onClick={() => setViewingResponse(r)} title="View response"
                                                style={{ background: dark ? 'rgba(99,102,241,0.15)' : '#eef2ff', border: `1px solid ${dark ? 'rgba(99,102,241,0.35)' : '#e0e7ff'}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: dark ? '#a5b4fc' : '#4f46e5' }}>👁</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {viewingResponse && <ResponseModal record={viewingResponse} onClose={() => setViewingResponse(null)} dark={dark} />}
        </div>
    );
}
