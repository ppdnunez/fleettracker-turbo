import { useState } from 'react';
import { api } from '../api.js';

const sectionStyle = { border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 14 };
const sectionTitle = { margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4 };
const rowStyle      = { display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' };
const labelStyle     = { display: 'block', fontSize: 11.5, color: '#6b7280', fontWeight: 600, marginBottom: 5 };
const inputStyle     = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' };
const selectStyle    = { ...inputStyle, background: '#fff', cursor: 'pointer' };
const btnStyle       = (disabled) => ({ padding: '7px 14px', borderRadius: 6, border: '1px solid #3b82f6', background: '#fff', color: '#3b82f6', fontSize: 12.5, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap' });
const btnPrimary     = (disabled) => ({ ...btnStyle(disabled), background: '#3b82f6', color: '#fff' });

/**
 * Card Reader (iButton) configuration — sends raw VL863P text commands over TurboHive's
 * POST /v3/command/send (api.sendTurboHiveCommand) and shows each reply. See the VL863P
 * Operational Commands Manual §8.6 for the command grammar this mirrors.
 */
export default function IButtonConfigModal({ imei, deviceName, onClose }) {
    const [sending, setSending] = useState(false);
    const [log, setLog]         = useState([]); // [{ command, reply, ok, time }]

    const [swState, setSwState]           = useState('ON');
    const [authMode, setAuthMode]         = useState('0');
    const [bank, setBank]                 = useState('1'); // '1' -> IBUTTON_ID (1-10), '2' -> IBUTTON_ID2 (11-20)
    const [addNums, setAddNums]           = useState('');
    const [deleteSns, setDeleteSns]       = useState('');
    const [deleteNum, setDeleteNum]       = useState('');
    const [almState, setAlmState]         = useState('ON');
    const [almMethod, setAlmMethod]       = useState('0');
    const [relayMode, setRelayMode]       = useState('2');
    const [buzzState, setBuzzState]       = useState('OFF');

    const send = async (command) => {
        setSending(true);
        try {
            const { data } = await api.sendTurboHiveCommand(imei, command);
            const reply = data?.data?.content ?? data?.message ?? '(no reply)';
            const ok = (data?.code ?? 1000) === 1000;
            setLog(l => [{ command, reply, ok, time: new Date().toLocaleTimeString() }, ...l]);
        } catch (e) {
            setLog(l => [{ command, reply: e.response?.data?.message || 'Request failed.', ok: false, time: new Date().toLocaleTimeString() }, ...l]);
        } finally {
            setSending(false);
        }
    };

    const idCmd = bank === '1' ? 'IBUTTON_ID' : 'IBUTTON_ID2';

    const handleAdd = () => {
        const nums = addNums.split(',').map(s => s.trim()).filter(Boolean).slice(0, 10);
        if (nums.length === 0) return;
        send(`${idCmd},A,${nums.join(',')}#`);
    };
    const handleDeleteBySn = () => {
        const sns = deleteSns.split(',').map(s => s.trim()).filter(Boolean).slice(0, 10);
        if (sns.length === 0) return;
        send(`${idCmd},D,${sns.join(',')}#`);
    };
    const handleDeleteByNum = () => {
        if (!deleteNum.trim()) return;
        send(`${idCmd},D,${deleteNum.trim()}#`);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
            <div style={{ background: '#fff', borderRadius: 12, width: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>iButton Configuration</h2>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>{deviceName || imei} · {imei}</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                    {/* Enable/disable */}
                    <div style={sectionStyle}>
                        <p style={sectionTitle}>Card Reader System</p>
                        <div style={rowStyle}>
                            <div>
                                <label style={labelStyle}>Function switch</label>
                                <select value={swState} onChange={e => setSwState(e.target.value)} style={selectStyle}>
                                    <option value="ON">ON</option>
                                    <option value="OFF">OFF</option>
                                </select>
                            </div>
                            <button disabled={sending} onClick={() => send('IBUTTON_SW#')} style={btnStyle(sending)}>Query</button>
                            <button disabled={sending} onClick={() => send(`IBUTTON_SW,${swState}#`)} style={btnPrimary(sending)}>Apply</button>
                        </div>
                    </div>

                    {/* Auth mode */}
                    <div style={sectionStyle}>
                        <p style={sectionTitle}>Authentication Mode</p>
                        <div style={rowStyle}>
                            <div>
                                <label style={labelStyle}>Mode</label>
                                <select value={authMode} onChange={e => setAuthMode(e.target.value)} style={{ ...selectStyle, width: 260 }}>
                                    <option value="0">0 — Local authentication</option>
                                    <option value="3">3 — Authentication disabled</option>
                                </select>
                            </div>
                            <button disabled={sending} onClick={() => send('IBUTTON_MODE#')} style={btnStyle(sending)}>Query</button>
                            <button disabled={sending} onClick={() => send(`IBUTTON_MODE,${authMode}#`)} style={btnPrimary(sending)}>Apply</button>
                        </div>
                    </div>

                    {/* Whitelist */}
                    <div style={sectionStyle}>
                        <p style={sectionTitle}>Whitelist (Add / Delete iButton)</p>
                        <div style={{ ...rowStyle, marginBottom: 12 }}>
                            <div>
                                <label style={labelStyle}>Bank</label>
                                <select value={bank} onChange={e => setBank(e.target.value)} style={{ ...selectStyle, width: 200 }}>
                                    <option value="1">Slots 1–10 (IBUTTON_ID)</option>
                                    <option value="2">Slots 11–20 (IBUTTON_ID2)</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ marginBottom: 10 }}>
                            <label style={labelStyle}>Add card numbers (comma-separated, up to 10)</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input value={addNums} onChange={e => setAddNums(e.target.value)} placeholder="e.g. 1A2B3C4D, 5E6F7A8B" style={{ ...inputStyle, flex: 1 }} />
                                <button disabled={sending || !addNums.trim()} onClick={handleAdd} style={btnPrimary(sending || !addNums.trim())}>Add</button>
                            </div>
                        </div>

                        <div style={{ marginBottom: 10 }}>
                            <label style={labelStyle}>Delete by sequence number (comma-separated, up to 10)</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input value={deleteSns} onChange={e => setDeleteSns(e.target.value)} placeholder="e.g. 1, 3, 5" style={{ ...inputStyle, flex: 1 }} />
                                <button disabled={sending || !deleteSns.trim()} onClick={handleDeleteBySn} style={btnStyle(sending || !deleteSns.trim())}>Delete</button>
                            </div>
                        </div>

                        <div>
                            <label style={labelStyle}>Delete by card number</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input value={deleteNum} onChange={e => setDeleteNum(e.target.value)} placeholder="e.g. 1A2B3C4D" style={{ ...inputStyle, flex: 1 }} />
                                <button disabled={sending || !deleteNum.trim()} onClick={handleDeleteByNum} style={btnStyle(sending || !deleteNum.trim())}>Delete</button>
                            </div>
                        </div>
                    </div>

                    {/* Unauthorized alert */}
                    <div style={sectionStyle}>
                        <p style={sectionTitle}>Unauthorized iButton Alert</p>
                        <div style={rowStyle}>
                            <div>
                                <label style={labelStyle}>Function switch</label>
                                <select value={almState} onChange={e => setAlmState(e.target.value)} style={selectStyle}>
                                    <option value="ON">ON</option>
                                    <option value="OFF">OFF</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Reporting method</label>
                                <select value={almMethod} onChange={e => setAlmMethod(e.target.value)} disabled={almState === 'OFF'} style={{ ...selectStyle, width: 180 }}>
                                    <option value="0">0 — GPRS only</option>
                                    <option value="1">1 — GPRS + SMS</option>
                                </select>
                            </div>
                            <button disabled={sending} onClick={() => send('IBUTTON_ALM#')} style={btnStyle(sending)}>Query</button>
                            <button disabled={sending} onClick={() => send(almState === 'OFF' ? 'IBUTTON_ALM,OFF#' : `IBUTTON_ALM,ON,${almMethod}#`)} style={btnPrimary(sending)}>Apply</button>
                        </div>
                    </div>

                    {/* Relay linkage */}
                    <div style={sectionStyle}>
                        <p style={sectionTitle}>Relay Action on iButton Tap</p>
                        <div style={rowStyle}>
                            <div>
                                <label style={labelStyle}>Linkage mode</label>
                                <select value={relayMode} onChange={e => setRelayMode(e.target.value)} style={{ ...selectStyle, width: 320 }}>
                                    <option value="0">0 — Disabled (no linkage)</option>
                                    <option value="1">1 — Tap-to-enable, Tap-to-disable</option>
                                    <option value="2">2 — Tap-to-enable, ACC-to-disable</option>
                                </select>
                            </div>
                            <button disabled={sending} onClick={() => send('IBUTTON_CTL#')} style={btnStyle(sending)}>Query</button>
                            <button disabled={sending} onClick={() => send(`IBUTTON_CTL,${relayMode}#`)} style={btnPrimary(sending)}>Apply</button>
                        </div>
                        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#9ca3af', lineHeight: 1.4 }}>
                            Modes 1–2 require the card reader enabled, authentication mode 0, and at least one whitelisted iButton — otherwise the device allows any iButton to operate the vehicle.
                        </p>
                    </div>

                    {/* Buzzer */}
                    <div style={{ ...sectionStyle, marginBottom: 0 }}>
                        <p style={sectionTitle}>Buzzer Feedback</p>
                        <div style={rowStyle}>
                            <div>
                                <label style={labelStyle}>State</label>
                                <select value={buzzState} onChange={e => setBuzzState(e.target.value)} style={selectStyle}>
                                    <option value="ON">ON</option>
                                    <option value="OFF">OFF</option>
                                </select>
                            </div>
                            <button disabled={sending} onClick={() => send('IBUTTON_BUZZ#')} style={btnStyle(sending)}>Query</button>
                            <button disabled={sending} onClick={() => send(`IBUTTON_BUZZ,${buzzState}#`)} style={btnPrimary(sending)}>Apply</button>
                        </div>
                    </div>

                    {/* Activity log */}
                    {log.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                            <p style={sectionTitle}>Command Log</p>
                            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 8 }}>
                                {log.map((entry, i) => (
                                    <div key={i} style={{ padding: '8px 12px', borderBottom: i < log.length - 1 ? '1px solid #f8fafc' : 'none', fontSize: 12 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
                                            <span style={{ fontFamily: 'monospace' }}>{entry.command}</span>
                                            <span style={{ color: '#9ca3af' }}>{entry.time}</span>
                                        </div>
                                        <div style={{ color: entry.ok ? '#16a34a' : '#dc2626', marginTop: 2 }}>{entry.reply}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
                </div>
            </div>
        </div>
    );
}
