import { useEffect, useState } from 'react';
import { api } from '../api.js';

/* ── base64 helpers (UTF-8 safe) ──────────────────────────────── */
function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary);
}
function fromBase64(b64) {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

/* ── iCalendar (RFC5545) build/parse — Traccar stores `data` as a base64 VCALENDAR blob ── */
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const RECURRENCE_OPTIONS = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const recurrenceLabel = (r) => r === 'NONE' ? 'None' : r.charAt(0) + r.slice(1).toLowerCase();

function pad(n) { return String(n).padStart(2, '0'); }
function dtToIcs(d) {
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function dtToInputValue(d) {
    if (!d) return '';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function inputValueToDt(v) {
    return v ? new Date(v) : null;
}

function buildIcsData({ name, from, to, recurrence }) {
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Traccar//NONSGML Traccar//EN',
        'BEGIN:VEVENT',
        'UID:00000000-0000-0000-0000-000000000000',
        `DTSTART;TZID=${TZ}:${dtToIcs(from)}`,
        `DTEND;TZID=${TZ}:${dtToIcs(to)}`,
    ];
    if (recurrence !== 'NONE') lines.push(`RRULE:FREQ=${recurrence}`);
    lines.push(`SUMMARY:${name || 'Event'}`, 'END:VEVENT', 'END:VCALENDAR');
    return toBase64(lines.join('\r\n'));
}

function parseIcsData(b64) {
    if (!b64) return null;
    let text;
    try { text = fromBase64(b64); } catch { return null; }
    const dtstart = text.match(/DTSTART(?:;TZID=[^:]+)?:(\d{8}T\d{6})/);
    const dtend   = text.match(/DTEND(?:;TZID=[^:]+)?:(\d{8}T\d{6})/);
    const rrule   = text.match(/RRULE:FREQ=(\w+)/);
    const parse = (m) => {
        if (!m) return null;
        const s = m[1];
        return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}`);
    };
    return { from: parse(dtstart), to: parse(dtend), recurrence: rrule ? rrule[1] : 'NONE' };
}

const fieldLabelStyle = (dark) => ({ display: 'block', fontSize: 11.5, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600, marginBottom: 6 });
const inputStyle = (dark) => ({ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 7, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a' });

function CalendarModal({ calendar, onClose, onSaved, dark }) {
    const isNew = !calendar;
    const parsed = calendar ? parseIcsData(calendar.data) : null;
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

    const [name, setName]             = useState(calendar?.name || '');
    const [from, setFrom]             = useState(dtToInputValue(parsed?.from || now));
    const [to, setTo]                 = useState(dtToInputValue(parsed?.to || oneHourLater));
    const [recurrence, setRecurrence] = useState(parsed?.recurrence || 'DAILY');
    const [attributesOpen, setAttributesOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    const handleSave = async () => {
        if (!name.trim()) { setError('Name is required.'); return; }
        if (!from || !to) { setError('From and To are required.'); return; }
        setSaving(true);
        setError('');
        const payload = {
            name: name.trim(),
            data: buildIcsData({ name: name.trim(), from: inputValueToDt(from), to: inputValueToDt(to), recurrence }),
        };
        try {
            if (isNew) {
                await api.createCalendar(payload);
            } else {
                await api.updateCalendar(calendar.id, payload);
            }
            onSaved();
        } catch (e) {
            setError('Failed to save calendar.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, width: 420, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}` }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>{isNew ? 'New Calendar' : 'Edit Calendar'}</h2>
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
                            <label style={fieldLabelStyle(dark)}>Name</label>
                            <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" style={inputStyle(dark)} />
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={fieldLabelStyle(dark)}>Type</label>
                            <select value="SIMPLE" disabled style={{ ...inputStyle(dark), background: dark ? '#0f172a' : '#f9fafb', cursor: 'not-allowed', color: dark ? '#64748b' : '#6b7280' }}>
                                <option value="SIMPLE">Simple</option>
                            </select>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={fieldLabelStyle(dark)}>From</label>
                            <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle(dark)} />
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={fieldLabelStyle(dark)}>To</label>
                            <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)} style={inputStyle(dark)} />
                        </div>

                        <div>
                            <label style={fieldLabelStyle(dark)}>Recurrence</label>
                            <select value={recurrence} onChange={e => setRecurrence(e.target.value)} style={{ ...inputStyle(dark), background: dark ? '#1e293b' : '#fff', cursor: 'pointer' }}>
                                {RECURRENCE_OPTIONS.map(r => <option key={r} value={r}>{recurrenceLabel(r)}</option>)}
                            </select>
                        </div>
                    </div>

                    <div style={{ border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 8, overflow: 'hidden' }}>
                        <button onClick={() => setAttributesOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: dark ? '#111827' : '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: dark ? '#94a3b8' : '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                            Attributes
                            <span style={{ transform: attributesOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>▾</span>
                        </button>
                        {attributesOpen && (
                            <div style={{ padding: 14, borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}` }}>
                                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>No additional attributes.</p>
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

export default function CalendarPage({ dark }) {
    const [calendars, setCalendars] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const [search, setSearch]   = useState('');
    const [editing, setEditing] = useState(null); // calendar object, or 'new'
    const [pendingDeleteId, setPendingDeleteId] = useState(null);

    const fetchCalendars = async () => {
        try {
            const res = await api.getTraccarCalendars();
            setCalendars(res.data);
        } catch (e) {
            setError('Failed to load calendars.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchCalendars(); }, []);

    const filtered = calendars.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

    const handleDelete = async () => {
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        try {
            await api.deleteCalendar(id);
            await fetchCalendars();
        } catch (e) {
            setError('Failed to delete calendar.');
        }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: dark ? '#0b1220' : '#fff', position: 'relative' }}>
            <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: dark ? '#f1f5f9' : '#111827' }}>Calendars</h2>
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
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={TH(dark)}>Name</th>
                            <th style={{ ...TH(dark), textAlign: 'center', width: 100 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={2} style={{ ...TD(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={2} style={{ ...TD(dark), textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data found</td></tr>
                        ) : filtered.map(c => (
                            <tr key={c.id}>
                                <td style={{ ...TD(dark), fontWeight: 500 }}>{c.name}</td>
                                <td style={{ ...TD(dark), textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <button style={iconBtn(dark)} title="Edit" onClick={() => setEditing(c)}>✏</button>
                                    <button style={{ ...iconBtn(dark), color: '#ef4444' }} title="Delete" onClick={() => setPendingDeleteId(c.id)}>🗑</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <button onClick={() => setEditing('new')} title="Add calendar"
                style={{ position: 'absolute', bottom: 24, right: 24, width: 52, height: 52, borderRadius: '50%', background: '#3b82f6', color: '#fff', border: 'none', fontSize: 26, fontWeight: 400, lineHeight: 1, cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                +
            </button>

            {editing && (
                <CalendarModal
                    calendar={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); fetchCalendars(); }}
                    dark={dark}
                />
            )}

            {pendingDeleteId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, padding: '24px 28px', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>Delete calendar?</h3>
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
