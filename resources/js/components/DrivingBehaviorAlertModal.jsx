import { useState } from 'react';
import { api } from '../api.js';

const sectionStyleFor = (dark) => ({ border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, borderRadius: 8, padding: 14, marginBottom: 14 });
const sectionTitleFor = (dark) => ({ margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, color: dark ? '#94a3b8' : '#374151', textTransform: 'uppercase', letterSpacing: 0.4 });
const rowStyle      = { display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' };
const labelStyleFor  = (dark) => ({ display: 'block', fontSize: 11.5, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600, marginBottom: 5 });
const inputStyleFor  = (dark) => ({ padding: '7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#111827' });
const selectStyleFor = (dark) => ({ ...inputStyleFor(dark), cursor: 'pointer' });
const numStyleFor    = (dark) => (w) => ({ ...inputStyleFor(dark), width: w ?? 90 });
const btnStyleFor    = (dark) => (disabled) => ({ padding: '7px 14px', borderRadius: 6, border: `1px solid ${dark ? '#60a5fa' : '#3b82f6'}`, background: dark ? '#111827' : '#fff', color: dark ? '#60a5fa' : '#3b82f6', fontSize: 12.5, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap' });
const btnPrimaryFor  = (dark) => (disabled) => ({ ...btnStyleFor(dark)(disabled), background: '#3b82f6', color: '#fff' });

const REPORT_METHOD_OPTIONS = [
    { value: '0', label: '0 — GPRS only' },
    { value: '1', label: '1 — SMS + GPRS' },
];

/** Function switch + reporting method pair shared by every alert type in this modal. */
function SwitchAndMethod({ enabled, setEnabled, method, setMethod, dark }) {
    const labelStyle = labelStyleFor(dark);
    const selectStyle = selectStyleFor(dark);
    return (
        <>
            <div>
                <label style={labelStyle}>Function switch</label>
                <select value={enabled} onChange={e => setEnabled(e.target.value)} style={selectStyle}>
                    <option value="ON">ON</option>
                    <option value="OFF">OFF</option>
                </select>
            </div>
            <div>
                <label style={labelStyle}>Reporting method</label>
                <select value={method} onChange={e => setMethod(e.target.value)} disabled={enabled === 'OFF'} style={{ ...selectStyle, width: 180 }}>
                    {REPORT_METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </div>
        </>
    );
}

function NumField({ label, value, onChange, min, max, width, dark }) {
    return (
        <div>
            <label style={labelStyleFor(dark)}>{label}</label>
            <input type="number" min={min} max={max} value={value} onChange={e => onChange(e.target.value)} style={numStyleFor(dark)(width)} />
        </div>
    );
}

/**
 * Driving Behavior Alerts (VL863P Operational Commands Manual §6.7) — sends raw device text
 * commands over TurboHive's POST /v3/command/send (api.sendTurboHiveCommand), same pattern as
 * IButtonConfigModal. Covers Overspeed, Harsh Accel/Decel, Harsh Cornering, Collision, Rollover,
 * and Fatigue Driving (Overtime) — every alert type is query-then-apply against the live device,
 * nothing is persisted locally (there is no local Vehicle/Device row for these device-side
 * thresholds, same as IButtonConfigModal's command log).
 */
export default function DrivingBehaviorAlertModal({ imei, deviceName, onClose, dark }) {
    const [sending, setSending] = useState(false);
    const [log, setLog]         = useState([]); // [{ command, reply, ok, time }]

    const sectionStyle = sectionStyleFor(dark);
    const sectionTitle = sectionTitleFor(dark);
    const btnStyle     = btnStyleFor(dark);
    const btnPrimary   = btnPrimaryFor(dark);

    // 6.7.1 Overspeed — SPEED,P1,P2,P3,P4#
    const [spEnabled, setSpEnabled] = useState('ON');
    const [spMethod, setSpMethod]   = useState('0');
    const [spSpeed, setSpSpeed]     = useState(100);
    const [spWindow, setSpWindow]   = useState(10);

    // 6.7.2 Harsh Acceleration/Deceleration — SPEEDCHECK,P1,P2,P3,P4,P5#
    const [scEnabled, setScEnabled] = useState('OFF');
    const [scMethod, setScMethod]   = useState('0');
    const [scWindow, setScWindow]   = useState(4);
    const [scAccel, setScAccel]     = useState(30);
    const [scDecel, setScDecel]     = useState(50);

    // 6.7.3 Harsh Cornering — SWERVE,P1,P2,P3,P4,P5#
    const [swEnabled, setSwEnabled] = useState('OFF');
    const [swMethod, setSwMethod]   = useState('0');
    const [swAngle, setSwAngle]     = useState(30);
    const [swSpeed, setSwSpeed]     = useState(60);
    const [swWindow, setSwWindow]   = useState(3);

    // 6.7.4 Collision — COLLIDE,P1,P2,P3,P4,P5,P6#
    const [clEnabled, setClEnabled]   = useState('OFF');
    const [clMethod, setClMethod]     = useState('0');
    const [clImpact, setClImpact]     = useState(480);
    const [clDropWin, setClDropWin]   = useState(10);
    const [clStillWin, setClStillWin] = useState(90);
    const [clStillSpd, setClStillSpd] = useState(5);

    // 6.7.5 Rollover — ROLLOVER,P1,P2,P3,P4# (requires Collision alert enabled on the device)
    const [rlEnabled, setRlEnabled] = useState('OFF');
    const [rlMethod, setRlMethod]   = useState('0');
    const [rlGforce, setRlGforce]   = useState(15);
    const [rlWindow, setRlWindow]   = useState(20);

    // 6.7.6 Fatigue Driving (Overtime) — OVERTIME,P1,P2,P3,P4#
    const [otEnabled, setOtEnabled] = useState('ON');
    const [otMethod, setOtMethod]   = useState('0');
    const [otMaxDrive, setOtMaxDrive] = useState(240);
    const [otMinRest, setOtMinRest]   = useState(30);

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

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
            <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 12, width: 620, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, flexShrink: 0 }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: dark ? '#f1f5f9' : '#0f172a' }}>Driving Behavior Alerts</h2>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: dark ? '#94a3b8' : '#6b7280' }}>{deviceName || imei} · {imei}</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#64748b' : '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                    {/* 6.7.1 Overspeed Alert */}
                    <div style={sectionStyle}>
                        <p style={sectionTitle}>Overspeed Alert</p>
                        <div style={rowStyle}>
                            <SwitchAndMethod enabled={spEnabled} setEnabled={setSpEnabled} method={spMethod} setMethod={setSpMethod} dark={dark} />
                            <NumField label="Speed threshold (km/h)" value={spSpeed} onChange={setSpSpeed} min={1} max={255} dark={dark} />
                            <NumField label="Detection window (s)" value={spWindow} onChange={setSpWindow} min={5} max={600} dark={dark} />
                            <button disabled={sending} onClick={() => send('SPEED#')} style={btnStyle(sending)}>Query</button>
                            <button disabled={sending} onClick={() => send(`SPEED,${spEnabled},${spMethod},${spSpeed},${spWindow}#`)} style={btnPrimary(sending)}>Apply</button>
                        </div>
                        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: dark ? '#64748b' : '#9ca3af' }}>Triggers if speed continuously exceeds the threshold for the full detection window.</p>
                    </div>

                    {/* 6.7.2 Harsh Acceleration/Deceleration Alert */}
                    <div style={sectionStyle}>
                        <p style={sectionTitle}>Harsh Acceleration / Deceleration Alert</p>
                        <div style={rowStyle}>
                            <SwitchAndMethod enabled={scEnabled} setEnabled={setScEnabled} method={scMethod} setMethod={setScMethod} dark={dark} />
                            <NumField label="Detection window (s)" value={scWindow} onChange={setScWindow} min={1} max={30} dark={dark} />
                            <NumField label="Acceleration threshold (km/h)" value={scAccel} onChange={setScAccel} min={10} max={300} width={120} dark={dark} />
                            <NumField label="Deceleration threshold (km/h)" value={scDecel} onChange={setScDecel} min={10} max={300} width={120} dark={dark} />
                            <button disabled={sending} onClick={() => send('SPEEDCHECK#')} style={btnStyle(sending)}>Query</button>
                            <button disabled={sending} onClick={() => send(`SPEEDCHECK,${scEnabled},${scMethod},${scWindow},${scAccel},${scDecel}#`)} style={btnPrimary(sending)}>Apply</button>
                        </div>
                        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: dark ? '#64748b' : '#9ca3af' }}>Triggers if GPS speed changes by more than the threshold within the detection window (either direction).</p>
                    </div>

                    {/* 6.7.3 Harsh Cornering Alert */}
                    <div style={sectionStyle}>
                        <p style={sectionTitle}>Harsh Cornering Alert</p>
                        <div style={rowStyle}>
                            <SwitchAndMethod enabled={swEnabled} setEnabled={setSwEnabled} method={swMethod} setMethod={setSwMethod} dark={dark} />
                            <NumField label="Heading change threshold (°)" value={swAngle} onChange={setSwAngle} min={10} max={180} width={140} dark={dark} />
                            <NumField label="Speed threshold (km/h)" value={swSpeed} onChange={setSwSpeed} min={10} max={200} dark={dark} />
                            <NumField label="Detection window (s)" value={swWindow} onChange={setSwWindow} min={1} max={30} dark={dark} />
                            <button disabled={sending} onClick={() => send('SWERVE#')} style={btnStyle(sending)}>Query</button>
                            <button disabled={sending} onClick={() => send(`SWERVE,${swEnabled},${swMethod},${swAngle},${swSpeed},${swWindow}#`)} style={btnPrimary(sending)}>Apply</button>
                        </div>
                        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: dark ? '#64748b' : '#9ca3af' }}>Triggers when speed is at/above the threshold and heading changes by more than the angle within the detection window.</p>
                    </div>

                    {/* 6.7.4 Collision Alert */}
                    <div style={sectionStyle}>
                        <p style={sectionTitle}>Collision Alert</p>
                        <div style={rowStyle}>
                            <SwitchAndMethod enabled={clEnabled} setEnabled={setClEnabled} method={clMethod} setMethod={setClMethod} dark={dark} />
                            <NumField label="Impact level threshold" value={clImpact} onChange={setClImpact} min={10} max={1024} width={110} dark={dark} />
                            <NumField label="Speed-drop window (s)" value={clDropWin} onChange={setClDropWin} min={3} max={20} dark={dark} />
                            <NumField label="Stationary check window (s)" value={clStillWin} onChange={setClStillWin} min={10} max={90} width={140} dark={dark} />
                            <NumField label="Stationary speed (km/h)" value={clStillSpd} onChange={setClStillSpd} min={5} max={30} width={120} dark={dark} />
                            <button disabled={sending} onClick={() => send('COLLIDE#')} style={btnStyle(sending)}>Query</button>
                            <button disabled={sending} onClick={() => send(`COLLIDE,${clEnabled},${clMethod},${clImpact},${clDropWin},${clStillWin},${clStillSpd}#`)} style={btnPrimary(sending)}>Apply</button>
                        </div>
                        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: dark ? '#64748b' : '#9ca3af' }}>
                            Valid only when GPS speed was above 5 km/h at impact. False-alarm-prone if the vehicle hits a large speed bump and stops within the drop window.
                        </p>
                    </div>

                    {/* 6.7.5 Rollover Alert */}
                    <div style={sectionStyle}>
                        <p style={sectionTitle}>Rollover Alert</p>
                        <div style={rowStyle}>
                            <SwitchAndMethod enabled={rlEnabled} setEnabled={setRlEnabled} method={rlMethod} setMethod={setRlMethod} dark={dark} />
                            <NumField label="G-force change (× 0.1g)" value={rlGforce} onChange={setRlGforce} min={1} max={40} width={130} dark={dark} />
                            <NumField label="Detection window (s)" value={rlWindow} onChange={setRlWindow} min={1} max={90} dark={dark} />
                            <button disabled={sending} onClick={() => send('ROLLOVER#')} style={btnStyle(sending)}>Query</button>
                            <button disabled={sending} onClick={() => send(`ROLLOVER,${rlEnabled},${rlMethod},${rlGforce},${rlWindow}#`)} style={btnPrimary(sending)}>Apply</button>
                        </div>
                        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: dark ? '#64748b' : '#9ca3af' }}>Requires Collision Alert (above) to be enabled on the device — otherwise this setting has no effect.</p>
                    </div>

                    {/* 6.7.6 Fatigue Driving Alert (Overtime) */}
                    <div style={{ ...sectionStyle, marginBottom: 0 }}>
                        <p style={sectionTitle}>Fatigue Driving Alert (Overtime)</p>
                        <div style={rowStyle}>
                            <SwitchAndMethod enabled={otEnabled} setEnabled={setOtEnabled} method={otMethod} setMethod={setOtMethod} dark={dark} />
                            <NumField label="Max continuous driving (min)" value={otMaxDrive} onChange={setOtMaxDrive} min={10} max={1440} width={150} dark={dark} />
                            <NumField label="Min rest time (min)" value={otMinRest} onChange={setOtMinRest} min={10} max={1440} width={120} dark={dark} />
                            <button disabled={sending} onClick={() => send('OVERTIME#')} style={btnStyle(sending)}>Query</button>
                            <button disabled={sending} onClick={() => send(`OVERTIME,${otEnabled},${otMethod},${otMaxDrive},${otMinRest}#`)} style={btnPrimary(sending)}>Apply</button>
                        </div>
                        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: dark ? '#64748b' : '#9ca3af' }}>Alert resets once ACC has been off for the configured rest time.</p>
                    </div>

                    {/* Activity log */}
                    {log.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                            <p style={sectionTitle}>Command Log</p>
                            <div style={{ maxHeight: 160, overflowY: 'auto', border: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, borderRadius: 8 }}>
                                {log.map((entry, i) => (
                                    <div key={i} style={{ padding: '8px 12px', borderBottom: i < log.length - 1 ? `1px solid ${dark ? '#1e293b' : '#f8fafc'}` : 'none', fontSize: 12 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: dark ? '#e2e8f0' : '#374151' }}>
                                            <span style={{ fontFamily: 'monospace' }}>{entry.command}</span>
                                            <span style={{ color: dark ? '#64748b' : '#9ca3af' }}>{entry.time}</span>
                                        </div>
                                        <div style={{ color: entry.ok ? '#16a34a' : '#dc2626', marginTop: 2 }}>{entry.reply}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ padding: '12px 20px', borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`, background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
                </div>
            </div>
        </div>
    );
}
