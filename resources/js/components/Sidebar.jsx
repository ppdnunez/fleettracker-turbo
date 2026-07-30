import { useState } from 'react';
import { turboHiveEnabled } from '../turbohive-mqtt.js';

/* ── SVG icons ─────────────────────────────────────────────── */
const HamSVG = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="2" y1="4"  x2="16" y2="4"/>
        <line x1="2" y1="9"  x2="16" y2="9"/>
        <line x1="2" y1="14" x2="16" y2="14"/>
    </svg>
);
const DashSVG = () => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="1" y="1" width="6" height="6" rx="1.5"/>
        <rect x="10" y="1" width="6" height="6" rx="1.5"/>
        <rect x="1" y="10" width="6" height="6" rx="1.5"/>
        <rect x="10" y="10" width="6" height="6" rx="1.5"/>
    </svg>
);
const ReportSVG = () => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <rect x="2" y="1" width="13" height="15" rx="2"/>
        <line x1="5" y1="6"  x2="12" y2="6"/>
        <line x1="5" y1="9"  x2="12" y2="9"/>
        <line x1="5" y1="12" x2="9"  y2="12"/>
    </svg>
);
const DeviceSVG = () => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <rect x="1.5" y="2" width="14" height="10" rx="2"/>
        <line x1="5" y1="12" x2="5"  y2="15"/>
        <line x1="12" y1="12" x2="12" y2="15"/>
        <line x1="3" y1="15" x2="14" y2="15"/>
    </svg>
);
const FleetSVG = () => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <rect x="1" y="5" width="5" height="10" rx="1"/>
        <rect x="7" y="3" width="5" height="12" rx="1"/>
        <rect x="13" y="1" width="3" height="14" rx="1"/>
    </svg>
);
const ClientsSVG = () => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="6" cy="5" r="2.4"/>
        <path d="M1.5 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/>
        <circle cx="13" cy="6" r="1.8"/>
        <path d="M10.5 9.2c1.7.2 3.5 1.3 4 3.8"/>
    </svg>
);
const ChevSVG = ({ open }) => (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
        style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease', flexShrink: 0 }}>
        <polyline points="2,3.5 5.5,7.5 9,3.5"/>
    </svg>
);
const LogoutSVG = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>
        <polyline points="11,5 14,8 11,11"/>
        <line x1="6" y1="8" x2="14" y2="8"/>
    </svg>
);

/* ── sub-item icons ───────────────────────────────────────────
   Fleet's and Device's dropdown children previously rendered without icons — one small SVG per
   module name, kept in the same stroke/currentColor style as the top-level icons above. */
const PersonSVG = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="8" cy="4.5" r="2.5"/>
        <path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/>
    </svg>
);
const CarSVG = () => (
    <svg width="17" height="15" viewBox="0 0 17 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="6.5" width="14" height="4.5" rx="1.2"/>
        <path d="M3 6.5l1.5-3.5h9l1.5 3.5"/>
        <circle cx="4.5" cy="12" r="1.4"/>
        <circle cx="12.5" cy="12" r="1.4"/>
    </svg>
);
const PinSVG = () => (
    <svg width="15" height="17" viewBox="0 0 15 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7.5 15.5S13 10 13 6a5.5 5.5 0 1 0-11 0c0 4 5.5 9.5 5.5 9.5z"/>
        <circle cx="7.5" cy="6" r="1.8"/>
    </svg>
);
const WrenchSVG = () => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 2.5a3.5 3.5 0 0 0-4.6 4.2L2 11.1v2.4h2.4l4.4-4.4a3.5 3.5 0 0 0 4.2-4.6l-2.3 2.3-1.7-1.7z"/>
    </svg>
);
const FuelSVG = () => (
    <svg width="15" height="17" viewBox="0 0 15 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="2.5" width="7" height="12.5" rx="1"/>
        <line x1="1.5" y1="6" x2="8.5" y2="6"/>
        <path d="M8.5 6.5l2.5 1.5v5.5a1.3 1.3 0 0 0 2.6 0V8.5l-1.6-1.8"/>
    </svg>
);
const ClipboardCheckSVG = () => (
    <svg width="15" height="17" viewBox="0 0 15 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="2.5" width="12" height="13" rx="1.5"/>
        <path d="M5 2.5V1.5h5v1"/>
        <polyline points="4.5,9 6.5,11 10.5,6.5"/>
    </svg>
);
const CameraSVG = () => (
    <svg width="17" height="15" viewBox="0 0 17 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.5 4.5A1.5 1.5 0 0 1 3 3h2l1-1.5h4L11 3h2a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5z"/>
        <circle cx="8" cy="8.5" r="3"/>
    </svg>
);
const ImageSVG = () => (
    <svg width="17" height="15" viewBox="0 0 17 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="1" width="15" height="13" rx="1.5"/>
        <circle cx="5.5" cy="5.5" r="1.5"/>
        <path d="M1 11l4-4 3 3 3.5-3.5L16 11"/>
    </svg>
);
const ScanFaceSVG = () => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M1.5 5V3a1.5 1.5 0 0 1 1.5-1.5h2"/>
        <path d="M15.5 5V3A1.5 1.5 0 0 0 14 1.5h-2"/>
        <path d="M1.5 12v2A1.5 1.5 0 0 0 3 15.5h2"/>
        <path d="M15.5 12v2a1.5 1.5 0 0 1-1.5 1.5h-2"/>
        <circle cx="8.5" cy="8.5" r="1"/>
    </svg>
);
const SimCardSVG = () => (
    <svg width="14" height="17" viewBox="0 0 14 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h5l4 4v9a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 15z"/>
        <rect x="4" y="8" width="6" height="4.5" rx="0.8"/>
    </svg>
);
const TerminalSVG = () => (
    <svg width="17" height="15" viewBox="0 0 17 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="1" width="15" height="13" rx="1.5"/>
        <polyline points="4,5.5 7,7.5 4,9.5"/>
        <line x1="8.5" y1="10" x2="12.5" y2="10"/>
    </svg>
);
const GeofenceSVG = () => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 1.5l6 3.3v6.4l-6 3.3-6-3.3V4.8z"/>
        <circle cx="8.5" cy="8.5" r="1.6"/>
    </svg>
);
const BellSVG = () => (
    <svg width="15" height="17" viewBox="0 0 15 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7.5 1.5a4 4 0 0 0-4 4v2.8c0 .9-.35 1.75-1 2.4l-.7.7h11.4l-.7-.7a3.4 3.4 0 0 1-1-2.4V5.5a4 4 0 0 0-4-4z"/>
        <path d="M6 14a1.5 1.5 0 0 0 3 0"/>
    </svg>
);
const MailSVG = () => (
    <svg width="17" height="13" viewBox="0 0 17 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="1" width="15" height="11" rx="1.5"/>
        <path d="M1.5 2l7 5.5L15.5 2"/>
    </svg>
);
const CalendarSVG = () => (
    <svg width="16" height="17" viewBox="0 0 16 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="2.5" width="14" height="13" rx="1.5"/>
        <line x1="1" y1="6.5" x2="15" y2="6.5"/>
        <line x1="4.5" y1="1" x2="4.5" y2="4"/>
        <line x1="11.5" y1="1" x2="11.5" y2="4"/>
    </svg>
);
const TagSVG = () => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 1.5h5.5V7L7 14.5l-5.5-5.5z"/>
        <circle cx="11.3" cy="4.2" r="1"/>
    </svg>
);
const BookmarkSVG = () => (
    <svg width="13" height="17" viewBox="0 0 13 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.5 1.5h10v14l-5-3.5-5 3.5z"/>
    </svg>
);
const LayersSVG = () => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="8.5,1.5 15.5,5.5 8.5,9.5 1.5,5.5"/>
        <polyline points="1.5,9.5 8.5,13.5 15.5,9.5"/>
        <polyline points="1.5,13 8.5,17 15.5,13"/>
    </svg>
);

/* ── theme toggle icons ───────────────────────────────────────── */
const SunSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="7.5" cy="7.5" r="3"/>
        <line x1="7.5" y1="0.5" x2="7.5" y2="2"/>
        <line x1="7.5" y1="13" x2="7.5" y2="14.5"/>
        <line x1="0.5" y1="7.5" x2="2" y2="7.5"/>
        <line x1="13" y1="7.5" x2="14.5" y2="7.5"/>
        <line x1="2.4" y1="2.4" x2="3.4" y2="3.4"/>
        <line x1="11.6" y1="11.6" x2="12.6" y2="12.6"/>
        <line x1="2.4" y1="12.6" x2="3.4" y2="11.6"/>
        <line x1="11.6" y1="3.4" x2="12.6" y2="2.4"/>
    </svg>
);
const MoonSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 9.3A6 6 0 1 1 5.7 2a5 5 0 0 0 7.3 7.3z"/>
    </svg>
);

/* ── nav tree structure ─────────────────────────────────────── */
const REPORT_DEVICE = [
    'Internal Battery','External Battery','Fuel Consumption',
    'Driver Behavior','DMS','Positioning & Battery',
    'Travel statistics (OBD)',
];
const REPORT_MOTION = [
    'Track Details','Replay','Mileage','Trips','Overspeed','Parking','Idling','Ignition','Geo Fence',
];
const REPORT_ALERT = ['Alert Details'];
const REPORT_LIVE = ['Current fuel Value', 'Temperature & Humidity', 'Driver Behavior (Live)', 'DMS (Live)'];

/* ── helpers ─────────────────────────────────────────────────── */
const EXPANDED_W = 220;
const COLLAPSED_W = 62;

function NavItem({ icon, label, active, onClick, depth = 0, open, sidebarOpen, dark }) {
    const bg   = active ? (dark ? 'rgba(59,130,246,0.16)' : '#eff6ff') : 'transparent';
    const col  = active ? (dark ? '#60a5fa' : '#1e40af') : (dark ? '#94a3b8' : '#4b5563');
    const left = 8 + depth * 14;
    return (
        <button onClick={onClick} title={!sidebarOpen ? label : undefined} style={{
            display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
            padding: sidebarOpen ? `8px ${8}px 8px ${left}px` : '8px 0',
            justifyContent: sidebarOpen ? 'flex-start' : 'center',
            borderRadius: 8, border: 'none', cursor: 'pointer', background: bg, color: col,
            fontSize: 13, fontWeight: active ? 700 : 500, marginBottom: 1, flexShrink: 0,
        }}>
            {icon && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, opacity: active ? 1 : 0.75 }}>{icon}</span>}
            {sidebarOpen && <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{label}</span>}
            {sidebarOpen && open !== undefined && <ChevSVG open={open} />}
        </button>
    );
}

function SubGroup({ label, items, openKey, activePage, onItemClick, onToggle, sidebarOpen, dark }) {
    const isOpen = openKey;
    return (
        <>
            <button onClick={onToggle} style={{
                display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left',
                padding: '6px 8px 6px 22px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: 'transparent', color: dark ? '#64748b' : '#6b7280', fontSize: 12.5, fontWeight: 600, marginBottom: 1,
            }}>
                <span style={{ flex: 1 }}>{label}</span>
                <ChevSVG open={isOpen} />
            </button>
            {isOpen && items.map(item => (
                <NavItem key={item} label={item} depth={2} sidebarOpen={sidebarOpen} dark={dark}
                    active={activePage === item} onClick={() => onItemClick(item)} />
            ))}
        </>
    );
}

function ThemeToggle({ dark, onToggle, sidebarOpen }) {
    return (
        <button onClick={onToggle} title={dark ? 'Switch to light mode' : 'Switch to dark mode'} style={{
            display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
            padding: sidebarOpen ? '8px 8px' : '8px 0',
            justifyContent: sidebarOpen ? 'space-between' : 'center',
            borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent',
            color: dark ? '#94a3b8' : '#4b5563', fontSize: 13, fontWeight: 500, marginBottom: 2, flexShrink: 0,
        }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{dark ? <MoonSVG /> : <SunSVG />}</span>
                {sidebarOpen && <span>{dark ? 'Dark Mode' : 'Light Mode'}</span>}
            </span>
            {sidebarOpen && (
                <span style={{
                    width: 32, height: 18, borderRadius: 999, background: dark ? '#3b82f6' : '#e5e7eb',
                    position: 'relative', flexShrink: 0, transition: 'background 0.15s ease',
                }}>
                    <span style={{
                        position: 'absolute', top: 2, left: dark ? 16 : 2, width: 14, height: 14,
                        borderRadius: '50%', background: '#fff', transition: 'left 0.15s ease',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
                    }} />
                </span>
            )}
        </button>
    );
}

/* ── main component ─────────────────────────────────────────── */
// "Route Planning" and "Fleet Report" hidden from the nav temporarily per request — pages/routing
// are untouched, so re-add the two entries below to bring them back.
const FLEET_ITEMS = [
    { label: 'Dashboard',       key: 'Dashboard', icon: <DashSVG /> },
    { label: 'Driver',          key: 'Driver', icon: <PersonSVG /> },
    { label: 'Vehicle',         key: 'Vehicle', icon: <CarSVG /> },
    { label: 'Vehicle Track',   key: 'VehicleTrack', icon: <PinSVG /> },
    { label: 'Vehicle Maintenance', key: 'VehicleMaintenance', icon: <WrenchSVG /> },
    { label: 'Fuel Management', key: 'FuelManagement', icon: <FuelSVG /> },
    { label: 'Check in Record', key: 'CheckIn', icon: <ClipboardCheckSVG /> },
    { label: 'Capture History', key: 'CaptureHistory', icon: <CameraSVG /> },
    { label: 'Media Gallery',   key: 'MediaGallery', icon: <ImageSVG /> },
    { label: 'Face Recognition', key: 'FaceRecognition', icon: <ScanFaceSVG /> },
    // { label: 'Route Planning',  key: 'RoutePlanning' },
    // { label: 'Fleet Report',    key: 'FleetReport' },
];

export default function Sidebar({ user, page, setPage, onLogoutClick, open, onToggle, reportSection, setReportSection, fleetPage, setFleetPage, dark, onToggleDark }) {
    const [reportOpen,   setReportOpen]   = useState(false);
    const [deviceOpen,   setDeviceOpen]   = useState(false);
    const [fleetOpen,    setFleetOpen]    = useState(false);
    const [devStatOpen,  setDevStatOpen]  = useState(false);
    const [motStatOpen,  setMotStatOpen]  = useState(false);
    const [stateStatOpen,setStateStatOpen]= useState(false);
    const [alertOpen,    setAlertOpen]    = useState(false);
    const [liveStatOpen, setLiveStatOpen] = useState(false);

    const W = open ? EXPANDED_W : COLLAPSED_W;

    const navTo = (p) => { setPage(p); };
    const reportTo = (section) => { setReportSection(section); setPage('Report'); };

    const isReportActive = page === 'Report';
    const isDeviceActive = page === 'Device Management' || page === 'Sim Data Management' || page === 'Dashboard' || page === 'Geofence' || page === 'Alert Recipients' || page === 'Notification' || page === 'Calendars' || page === 'Computed Attributes' || page === 'Maintenance' || page === 'Saved Commands' || page === 'Groups' || page === 'Drivers' || page === 'Command';
    const isFleetActive  = page === 'Fleet';

    return (
        <aside style={{
            width: W, minWidth: W, background: dark ? '#0b1220' : '#fff', borderRight: `1px solid ${dark ? '#1e293b' : '#e2e8f0'}`,
            display: 'flex', flexDirection: 'column', zIndex: 10, flexShrink: 0, overflow: 'hidden',
            transition: `width 0.22s ease, min-width 0.22s ease, background 0.15s ease, border-color 0.15s ease`,
        }}>
            {/* Logo + hamburger */}
            <div style={{ height: 58, display: 'flex', alignItems: 'center', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, flexShrink: 0, paddingLeft: open ? 14 : 0, justifyContent: open ? 'flex-start' : 'center', gap: 10, overflow: 'hidden' }}>
                {open && (
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#1e40af,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>📡</div>
                )}
                {open && <span style={{ fontSize: 14, fontWeight: 800, color: dark ? '#f1f5f9' : '#0f172a', whiteSpace: 'nowrap', flex: 1 }}>FleetTrack</span>}
                <button onClick={onToggle} title="Toggle sidebar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#94a3b8' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 6, flexShrink: 0 }}>
                    <HamSVG />
                </button>
            </div>

            {/* Nav */}
            <nav style={{ flex: 1, padding: open ? '10px 8px' : '10px 6px', overflowY: 'auto', overflowX: 'hidden' }}>
                {/* Dashboard */}
                <NavItem icon={<DashSVG />} label="Dashboard" active={page === 'Dashboard' && !isReportActive} dark={dark}
                    onClick={() => navTo('Dashboard')} sidebarOpen={open} />

                {/* Report */}
                <NavItem icon={<ReportSVG />} label="Report" active={isReportActive} dark={dark}
                    open={open ? reportOpen : undefined}
                    onClick={() => { if (open) setReportOpen(o => !o); else { setPage('Report'); } }}
                    sidebarOpen={open} />

                {open && reportOpen && (
                    <div style={{ marginLeft: 4 }}>
                        {/* Live Statistic */}
                        <SubGroup label="Live Statistic" openKey={liveStatOpen} onToggle={() => setLiveStatOpen(o => !o)} dark={dark}
                            items={REPORT_LIVE} activePage={isReportActive ? reportSection : null}
                            onItemClick={reportTo} sidebarOpen={open} />

                        {/* Device Statistics */}
                        <SubGroup label="Device Statistics" openKey={devStatOpen} onToggle={() => setDevStatOpen(o => !o)} dark={dark}
                            items={REPORT_DEVICE} activePage={isReportActive ? reportSection : null}
                            onItemClick={reportTo} sidebarOpen={open} />

                        {/* Motion Statistics */}
                        <SubGroup label="Motion Statistics" openKey={motStatOpen} onToggle={() => setMotStatOpen(o => !o)} dark={dark}
                            items={REPORT_MOTION} activePage={isReportActive ? reportSection : null}
                            onItemClick={reportTo} sidebarOpen={open} />

                        {/* State Statistics */}
                        <SubGroup label="State Statistics" openKey={stateStatOpen} onToggle={() => setStateStatOpen(o => !o)} dark={dark}
                            items={['Offline', 'Online']} activePage={isReportActive ? reportSection : null}
                            onItemClick={reportTo} sidebarOpen={open} />

                        {/* Alert Statistics */}
                        <SubGroup label="Alert Statistics" openKey={alertOpen} onToggle={() => setAlertOpen(o => !o)} dark={dark}
                            items={REPORT_ALERT} activePage={isReportActive ? reportSection : null}
                            onItemClick={reportTo} sidebarOpen={open} />
                    </div>
                )}

                {/* Device */}
                <NavItem icon={<DeviceSVG />} label="Device" active={isDeviceActive && !isReportActive} dark={dark}
                    open={open ? deviceOpen : undefined}
                    onClick={() => { if (open) setDeviceOpen(o => !o); else navTo('Dashboard'); }}
                    sidebarOpen={open} />

                {open && deviceOpen && (
                    <div style={{ marginLeft: 4 }}>
                        <NavItem icon={<DeviceSVG />} label="Device Management" depth={1} sidebarOpen={open} dark={dark}
                            active={page === 'Device Management'}
                            onClick={() => navTo('Device Management')} />
                        <NavItem icon={<SimCardSVG />} label="Sim Data Management" depth={1} sidebarOpen={open} dark={dark}
                            active={page === 'Sim Data Management'}
                            onClick={() => navTo('Sim Data Management')} />
                        <NavItem icon={<TerminalSVG />} label="Command" depth={1} sidebarOpen={open} dark={dark}
                            active={page === 'Command'}
                            onClick={() => navTo('Command')} />
                        <NavItem icon={<PinSVG />} label="Device Map & Video" depth={1} sidebarOpen={open} dark={dark}
                            active={page === 'Dashboard' && !isReportActive}
                            onClick={() => navTo('Dashboard')} />
                        <NavItem icon={<GeofenceSVG />} label="Geofence" depth={1} sidebarOpen={open} dark={dark}
                            active={page === 'Geofence'}
                            onClick={() => navTo('Geofence')} />
                        <NavItem icon={<BellSVG />} label="Alert Recipients" depth={1} sidebarOpen={open} dark={dark}
                            active={page === 'Alert Recipients'}
                            onClick={() => navTo('Alert Recipients')} />
                        {!turboHiveEnabled && <>
                        <NavItem icon={<MailSVG />} label="Notification" depth={1} sidebarOpen={open} dark={dark}
                            active={page === 'Notification'}
                            onClick={() => navTo('Notification')} />
                        <NavItem icon={<CalendarSVG />} label="Calendars" depth={1} sidebarOpen={open} dark={dark}
                            active={page === 'Calendars'}
                            onClick={() => navTo('Calendars')} />
                        <NavItem icon={<TagSVG />} label="Computed Attributes" depth={1} sidebarOpen={open} dark={dark}
                            active={page === 'Computed Attributes'}
                            onClick={() => navTo('Computed Attributes')} />
                        <NavItem icon={<WrenchSVG />} label="Maintenance" depth={1} sidebarOpen={open} dark={dark}
                            active={page === 'Maintenance'}
                            onClick={() => navTo('Maintenance')} />
                        <NavItem icon={<BookmarkSVG />} label="Saved Commands" depth={1} sidebarOpen={open} dark={dark}
                            active={page === 'Saved Commands'}
                            onClick={() => navTo('Saved Commands')} />
                        <NavItem icon={<LayersSVG />} label="Groups" depth={1} sidebarOpen={open} dark={dark}
                            active={page === 'Groups'}
                            onClick={() => navTo('Groups')} />
                        </>}
                        {/* "Drivers" hidden from the nav per request — DriverPage.jsx/route are untouched.
                            The functional driver module lives under Fleet -> Driver. */}
                    </div>
                )}

                {/* Fleet */}
                <NavItem icon={<FleetSVG />} label="Fleet" active={isFleetActive} dark={dark}
                    open={open ? fleetOpen : undefined}
                    onClick={() => { if (open) setFleetOpen(o => !o); else { navTo('Fleet'); } }}
                    sidebarOpen={open} />

                {open && fleetOpen && (
                    <div style={{ marginLeft: 4 }}>
                        {FLEET_ITEMS.map(({ label, key, icon }) => (
                            <NavItem key={key} icon={icon} label={label} depth={1} sidebarOpen={open} dark={dark}
                                active={isFleetActive && fleetPage === key}
                                onClick={() => { navTo('Fleet'); setFleetPage(key); }} />
                        ))}
                    </div>
                )}

                {/* Clients (SaaS tenants) - super_admin only */}
                {user.role === 'super_admin' && (
                    <NavItem icon={<ClientsSVG />} label="Clients" active={page === 'Clients'} dark={dark}
                        onClick={() => navTo('Clients')} sidebarOpen={open} />
                )}
            </nav>

            {/* Theme toggle + sign out */}
            <div style={{ padding: open ? '10px 8px' : '10px 6px', borderTop: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, flexShrink: 0 }}>
                <ThemeToggle dark={dark} onToggle={onToggleDark} sidebarOpen={open} />
                <button onClick={onLogoutClick} title={!open ? 'Sign Out' : undefined} style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: open ? '9px 12px' : '9px 0',
                    justifyContent: open ? 'flex-start' : 'center',
                    borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: dark ? '#f87171' : '#ef4444', fontSize: 13, fontWeight: 600,
                }}>
                    <LogoutSVG />
                    {open && 'Sign Out'}
                </button>
            </div>
        </aside>
    );
}
