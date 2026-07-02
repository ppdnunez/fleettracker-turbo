import { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { api } from '../api.js';
import { turboHiveEnabled } from '../turbohive-mqtt.js';

const GRID_LAYOUTS = [
    { cols: 1, rows: 1 },
    { cols: 2, rows: 1 },
    { cols: 2, rows: 2 },
    { cols: 3, rows: 2 },
    { cols: 3, rows: 3 },
    { cols: 4, rows: 4 },
];

function GridIcon({ cols, rows, active, onClick }) {
    const S = 16, gap = 1;
    const cw = (S - (cols - 1) * gap) / cols;
    const ch = (S - (rows - 1) * gap) / rows;
    const cells = [];
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            cells.push(<rect key={`${r}-${c}`} x={c * (cw + gap)} y={r * (ch + gap)} width={cw} height={ch} fill={active ? '#3b82f6' : '#94a3b8'} rx={0.5} />);
    return (
        <button onClick={onClick} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: active ? '1.5px solid #3b82f6' : '1.5px solid #e2e8f0', borderRadius: 6, background: active ? '#eff6ff' : '#fff', cursor: 'pointer', padding: 0 }}>
            <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>{cells}</svg>
        </button>
    );
}

function CameraPlaceholder() {
    return (
        <svg width="90" height="90" viewBox="0 0 90 90" fill="none">
            <circle cx="45" cy="40" r="26" fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.55)" strokeWidth="3.5"/>
            <circle cx="45" cy="40" r="16" fill="rgba(255,255,255,0.28)" stroke="rgba(255,255,255,0.65)" strokeWidth="2.5"/>
            <circle cx="45" cy="40" r="8"  fill="rgba(255,255,255,0.4)"/>
            <circle cx="41" cy="36" r="3"  fill="rgba(255,255,255,0.75)"/>
            <rect x="43" y="64" width="4"  height="12" rx="2" fill="rgba(255,255,255,0.45)"/>
            <rect x="32" y="74" width="26" height="4.5" rx="2.2" fill="rgba(255,255,255,0.45)"/>
        </svg>
    );
}

const PlaySVG = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
        <polygon points="2,1.5 11,6.5 2,11.5"/>
    </svg>
);
const RecordSVG = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="6.5" cy="6.5" r="5"/>
        <polygon points="4.5,4 9.5,6.5 4.5,9" fill="currentColor" stroke="none"/>
    </svg>
);
const MuteSVG = ({ on }) => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4">
        <polygon points="1.5,4.5 4.5,4.5 7.5,2 7.5,11 4.5,8.5 1.5,8.5" fill={on ? 'currentColor' : 'none'}/>
        {on
            ? <><line x1="9.5" y1="3.5" x2="12.5" y2="9.5"/><line x1="12.5" y1="3.5" x2="9.5" y2="9.5"/></>
            : <><path d="M9.5 4.5 Q11.5 6.5 9.5 8.5" strokeLinecap="round"/><path d="M10.5 2.5 Q13.5 6.5 10.5 10.5" strokeLinecap="round"/></>
        }
    </svg>
);
const SnapSVG = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="1" y="3.5" width="11" height="8" rx="1.3"/>
        <circle cx="6.5" cy="7.5" r="2.3"/>
        <path d="M4.5 3.5 L5 2 H8 L8.5 3.5" strokeLinejoin="round"/>
    </svg>
);
const EditSVG = () => (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M1.5 9.5 L3.5 9.5 L9.5 3.5 L7.5 1.5 Z"/>
        <line x1="7.5" y1="1.5" x2="9.5" y2="3.5"/>
    </svg>
);
const ExpandSVG = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4">
        <polyline points="1,4.5 1,1 4.5,1"/>
        <polyline points="8.5,1 12,1 12,4.5"/>
        <polyline points="12,8.5 12,12 8.5,12"/>
        <polyline points="4.5,12 1,12 1,8.5"/>
    </svg>
);
const CornerSVG = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="1.5" y="1.5" width="10" height="10" rx="1.5"/>
        <polyline points="4.5,1.5 1.5,1.5 1.5,4.5"/>
    </svg>
);

const iconBtn = (active, disabled) => ({
    background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    color: active ? '#3b82f6' : disabled ? '#cbd5e1' : '#94a3b8',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 4, borderRadius: 4, transition: 'color 0.15s',
});

function VideoPanel({ index, device, onExpand }) {
    const channel = index + 1;
    const [playing,       setPlaying]       = useState(false);
    const [muted,         setMuted]         = useState(false);
    const [chName,        setChName]        = useState(`CH-${channel}`);
    const [editing,       setEditing]       = useState(false);
    const [streamUrls,    setStreamUrls]    = useState(null);
    const [streamError,   setStreamError]   = useState(null);
    const [streamLoading, setStreamLoading] = useState(false);
    const videoRef      = useRef(null);
    const hlsRef        = useRef(null);
    const activeImeiRef = useRef(null);

    const destroyHls = () => {
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
        const v = videoRef.current;
        if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
    };

    const doStop = (imei) => {
        destroyHls();
        const target = imei ?? activeImeiRef.current;
        if (turboHiveEnabled && target) {
            api.stopTurboHiveVideo(target, channel).catch(() => {});
        }
        activeImeiRef.current = null;
        setPlaying(false);
        setStreamUrls(null);
        setStreamError(null);
        setStreamLoading(false);
    };

    // Stop stream when device selection changes
    useEffect(() => {
        const newImei = device?.imei ?? null;
        if (activeImeiRef.current && activeImeiRef.current !== newImei) {
            doStop(activeImeiRef.current);
        }
    }, [device?.imei]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            destroyHls();
            if (turboHiveEnabled && activeImeiRef.current) {
                api.stopTurboHiveVideo(activeImeiRef.current, channel).catch(() => {});
            }
        };
    }, []);

    // Attach HLS player when stream URLs arrive
    useEffect(() => {
        if (!streamUrls?.hls) { setStreamLoading(false); return; }
        const video = videoRef.current;
        if (!video) return;

        if (Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true });
            hlsRef.current = hls;
            hls.loadSource(streamUrls.hls);
            hls.attachMedia(video);
            hls.once(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => {});
                setStreamLoading(false);
            });
            hls.on(Hls.Events.ERROR, (_, data) => {
                if (data.fatal) { setStreamError('Stream error'); setStreamLoading(false); }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS (Safari)
            video.src = streamUrls.hls;
            video.play().catch(() => {});
            setStreamLoading(false);
        } else {
            setStreamError('HLS not supported in this browser');
            setStreamLoading(false);
        }

        return destroyHls;
    }, [streamUrls?.hls]);

    const startStream = async () => {
        if (!turboHiveEnabled) { setStreamError('TurboHive not enabled'); return; }
        if (!device?.imei) { setStreamError(device ? 'No IMEI for device' : 'No device selected'); return; }
        setStreamLoading(true);
        setStreamError(null);
        try {
            const { data } = await api.startTurboHiveVideo(device.imei, channel);
            activeImeiRef.current = device.imei;
            setStreamUrls(data);
            setPlaying(true);
        } catch {
            setStreamError('Failed to start stream');
            setStreamLoading(false);
        }
    };

    const handlePlayToggle = () => {
        if (playing) doStop();
        else startStream();
    };

    const showVideo = playing && streamUrls?.hls;

    return (
        <div style={{ position: 'relative', background: 'linear-gradient(135deg,#bfdbfe 0%,#dbeafe 45%,#eff6ff 100%)', display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', overflow: 'hidden', minHeight: 0 }}>
            <button onClick={onExpand} style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.9)', borderRadius: 4, padding: 3, cursor: 'pointer', color: '#64748b', display: 'flex', lineHeight: 0 }}>
                <CornerSVG />
            </button>

            {/* Video / placeholder area */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, position: 'relative', background: showVideo ? '#000' : undefined }}>
                <video
                    ref={videoRef}
                    muted={muted}
                    autoPlay
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: showVideo ? 'block' : 'none' }}
                />
                {!showVideo && <CameraPlaceholder />}
                {streamLoading && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,246,255,0.75)' }}>
                        <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>Connecting…</span>
                    </div>
                )}
                {streamError && !streamLoading && (
                    <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
                        <span style={{ fontSize: 10, color: '#ef4444', background: 'rgba(255,255,255,0.9)', padding: '2px 8px', borderRadius: 4 }}>{streamError}</span>
                    </div>
                )}
            </div>

            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', background: '#fff', borderTop: '1px solid #e2e8f0', gap: 2, flexShrink: 0 }}>
                <button onClick={handlePlayToggle} disabled={streamLoading} style={iconBtn(playing, streamLoading)}><PlaySVG /></button>
                <button style={iconBtn(false)}><RecordSVG /></button>
                <button onClick={() => setMuted(m => !m)} style={iconBtn(muted)}><MuteSVG on={muted} /></button>
                <button style={iconBtn(false)}><SnapSVG /></button>

                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                    {editing ? (
                        <input autoFocus value={chName} onChange={e => setChName(e.target.value)}
                            onBlur={() => setEditing(false)} onKeyDown={e => e.key === 'Enter' && setEditing(false)}
                            style={{ width: 52, fontSize: 11, fontWeight: 700, color: '#3b82f6', border: 'none', borderBottom: '1px solid #3b82f6', outline: 'none', textAlign: 'center', background: 'transparent' }} />
                    ) : (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', whiteSpace: 'nowrap' }}>{chName}</span>
                    )}
                    <button onClick={() => setEditing(true)} style={{ ...iconBtn(false), padding: 2 }}><EditSVG /></button>
                </div>

                <button onClick={onExpand} style={iconBtn(false)}><ExpandSVG /></button>
            </div>
        </div>
    );
}

export default function VideoMode({ selectedDevice }) {
    const [gridIdx,  setGridIdx]  = useState(2);
    const [expanded, setExpanded] = useState(null);
    const { cols, rows } = GRID_LAYOUTS[gridIdx];
    const count = cols * rows;
    const selectedLabel = selectedDevice
        ? (selectedDevice.name || selectedDevice.tracker || selectedDevice.imei || `Device ${selectedDevice.id}`)
        : 'No device selected';

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' }}>
            {/* Grid selector bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '7px 16px', borderBottom: '1px solid #e2e8f0', background: '#fff', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {GRID_LAYOUTS.map((g, i) => (
                        <GridIcon key={i} cols={g.cols} rows={g.rows} active={i === gridIdx} onClick={() => { setGridIdx(i); setExpanded(null); }} />
                    ))}
                </div>
                <div style={{ color: '#475569', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {selectedLabel}
                </div>
            </div>

            {/* Video panels */}
            <div style={{
                flex: 1, display: 'grid', minHeight: 0,
                gridTemplateColumns: expanded !== null ? '1fr' : `repeat(${cols}, 1fr)`,
                gridTemplateRows:    expanded !== null ? '1fr' : `repeat(${rows}, 1fr)`,
                gap: 2, padding: 2,
            }}>
                {expanded !== null ? (
                    <VideoPanel
                        key={`${selectedDevice?.id ?? 'none'}-${expanded}`}
                        index={expanded}
                        device={selectedDevice}
                        onExpand={() => setExpanded(null)}
                    />
                ) : (
                    Array.from({ length: count }, (_, i) => (
                        <VideoPanel
                            key={`${selectedDevice?.id ?? 'none'}-${i}`}
                            index={i}
                            device={selectedDevice}
                            onExpand={() => setExpanded(i)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
