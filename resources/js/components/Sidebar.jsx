import { useState } from 'react';
import { turboHiveEnabled } from '../turbohive-mqtt.js';
import { REPORT_CATEGORIES } from './ReportPage.jsx';

/* ── SVG icons ─────────────────────────────────────────────── */
const HamSVG = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="2" y1="4"  x2="16" y2="4"/>
        <line x1="2" y1="9"  x2="16" y2="9"/>
        <line x1="2" y1="14" x2="16" y2="14"/>
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
const SettingsSVG = () => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8.5" cy="8.5" r="2.4"/>
        <path d="M7 1.7h3l.45 1.75c.4.16.77.38 1.1.64l1.72-.5 1.5 2.6-1.28 1.25c.03.35.03.7 0 1.06l1.28 1.25-1.5 2.6-1.72-.5c-.33.27-.7.48-1.1.64L10 14.3H7l-.45-1.75a6 6 0 0 1-1.1-.64l-1.72.5-1.5-2.6 1.28-1.25a6 6 0 0 1 0-1.06L2.23 6.25l1.5-2.6 1.72.5c.33-.27.7-.48 1.1-.64L7 1.7Z"/>
    </svg>
);
// Delivery-truck side profile (cab box + hood + wheels) — replaces the old bar-chart-shaped icon,
// which read as a generic stats glyph rather than anything fleet/vehicle related.
const FleetSVG = () => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 4.5h8v7H1z"/>
        <path d="M9 8h3.3L15 10.6v2.9H9z"/>
        <circle cx="4.5" cy="14" r="1.5" fill="currentColor" stroke="none"/>
        <circle cx="12" cy="14" r="1.5" fill="currentColor" stroke="none"/>
        <path d="M1 14h1.6M12.9 14h1.6M6.5 14h4"/>
    </svg>
);

/* ── Fleet sub-nav icons ───────────────────────────────────────── */
const DashboardSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="1.5" width="6" height="6" rx="1"/>
        <rect x="9.5" y="1.5" width="6" height="6" rx="1"/>
        <rect x="1.5" y="9.5" width="6" height="6" rx="1"/>
        <rect x="9.5" y="9.5" width="6" height="6" rx="1"/>
    </svg>
);
const DriverSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8.5" cy="5" r="3"/>
        <path d="M2.5 15c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/>
    </svg>
);
const VehicleSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 11.5 3 7a2 2 0 0 1 1.9-1.4h7.2A2 2 0 0 1 14 7l1 4.5"/>
        <rect x="1.2" y="11.5" width="14.6" height="3" rx="1"/>
        <circle cx="5" cy="14.7" r="1.4" fill="currentColor" stroke="none"/>
        <circle cx="12" cy="14.7" r="1.4" fill="currentColor" stroke="none"/>
    </svg>
);
const VehicleTrackSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 15.5S3 10.8 3 6.8a5.5 5.5 0 0 1 11 0c0 4-5.5 8.7-5.5 8.7Z"/>
        <circle cx="8.5" cy="6.6" r="1.9"/>
    </svg>
);
const WrenchSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11.7 2.3a3.3 3.3 0 0 0-4.4 4.1L2 11.7l2 2 5.3-5.3a3.3 3.3 0 0 0 4.1-4.4l-2.1 2.1-1.6-.4-.4-1.6 2.1-2.1Z"/>
    </svg>
);
const FuelSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="2" width="7" height="12" rx="1"/>
        <line x1="1.5" y1="6" x2="8.5" y2="6"/>
        <path d="M8.5 5V3.5l2.5 2v6.5a1.3 1.3 0 0 0 2.6 0V8.2l-1.6-1.6"/>
    </svg>
);
const CheckInSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="3" width="14" height="10" rx="1.5"/>
        <circle cx="5.3" cy="8" r="1.6"/>
        <line x1="9" y1="6.5" x2="13.5" y2="6.5"/>
        <line x1="9" y1="9.5" x2="13.5" y2="9.5"/>
    </svg>
);
const CaptureSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="4.5" width="14" height="9.5" rx="1.5"/>
        <path d="M5 4.5 6.3 2.3h4.4L12 4.5"/>
        <circle cx="8.5" cy="9.2" r="2.7"/>
    </svg>
);
const GallerySVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="1.5" width="11" height="9" rx="1.2"/>
        <circle cx="4.7" cy="4.6" r="1.1" fill="currentColor" stroke="none"/>
        <path d="M2.2 9.5 5.5 6.3l2 2 2.6-3 2.4 3.7"/>
        <path d="M4 13h11a1 1 0 0 0 1-1V4.5" opacity="0.55"/>
    </svg>
);
const FaceSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 5.5V3.5a1.5 1.5 0 0 1 1.5-1.5H5.5M11.5 2h2A1.5 1.5 0 0 1 15 3.5v2M15 11.5v2a1.5 1.5 0 0 1-1.5 1.5h-2M5.5 15h-2A1.5 1.5 0 0 1 2 13.5v-2"/>
        <circle cx="8.5" cy="8.5" r="2.6"/>
    </svg>
);

/* ── Settings sub-nav icons ────────────────────────────────────── */
const DeviceMgmtSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="13" height="7" rx="1.2"/>
        <line x1="5.5" y1="6" x2="5.5" y2="3.5"/>
        <line x1="11.5" y1="6" x2="11.5" y2="3.5"/>
        <circle cx="5.8" cy="9.5" r="0.9" fill="currentColor" stroke="none"/>
        <circle cx="11.2" cy="9.5" r="0.9" fill="currentColor" stroke="none"/>
    </svg>
);
const SimSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 1.5h6l3 3v10a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1Z"/>
        <path d="M6 6h5v5H6z"/>
    </svg>
);
const CommandSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="2.5" width="14" height="12" rx="1.5"/>
        <polyline points="4,6.5 7,8.5 4,10.5"/>
        <line x1="8.5" y1="10.5" x2="12.5" y2="10.5"/>
    </svg>
);
const GeofenceSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 2 14 5.5v6L8.5 15 3 11.5v-6Z"/>
        <circle cx="8.5" cy="8.2" r="1.6" fill="currentColor" stroke="none"/>
    </svg>
);
const AlertRecipientsSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="3.5" width="14" height="10" rx="1.3"/>
        <path d="M2 4.5l6.5 5 6.5-5"/>
    </svg>
);
const NotificationSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 2.5a3.6 3.6 0 0 0-3.6 3.6v2.2L3.3 11h10.4l-1.6-2.7V6.1A3.6 3.6 0 0 0 8.5 2.5Z"/>
        <path d="M7 13.2a1.5 1.5 0 0 0 3 0"/>
    </svg>
);
const CalendarSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="13" height="11.5" rx="1.3"/>
        <line x1="2" y1="6.3" x2="15" y2="6.3"/>
        <line x1="5.5" y1="1.5" x2="5.5" y2="4.2"/>
        <line x1="11.5" y1="1.5" x2="11.5" y2="4.2"/>
    </svg>
);
const AttributesSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 4.5h11M3 8.5h7M3 12.5h11"/>
        <circle cx="10.5" cy="4.5" r="1.4" fill="currentColor" stroke="none"/>
        <circle cx="6.5" cy="8.5" r="1.4" fill="currentColor" stroke="none"/>
        <circle cx="12.5" cy="12.5" r="1.4" fill="currentColor" stroke="none"/>
    </svg>
);
const BookmarkSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2h9a1 1 0 0 1 1 1v12l-5.5-3.3L3 15V3a1 1 0 0 1 1-1Z"/>
    </svg>
);
const GroupsSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 1.5 15 5l-6.5 3.5L2 5Z"/>
        <path d="M2 8.5l6.5 3.5L15 8.5"/>
        <path d="M2 12l6.5 3.5L15 12"/>
    </svg>
);
/* ── Reports category icons ────────────────────────────────────── */
const LiveStatSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8.5" cy="12.5" r="1.4" fill="currentColor" stroke="none"/>
        <path d="M5.5 9.5a4.2 4.2 0 0 1 6 0"/>
        <path d="M3 7a8 8 0 0 1 11 0"/>
    </svg>
);
const DeviceStatSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="13" height="9" rx="1.3"/>
        <path d="M5 8.5V7M8.5 8.5V5.5M12 8.5V6.5"/>
        <line x1="5.5" y1="14.5" x2="11.5" y2="14.5"/>
        <line x1="8.5" y1="11" x2="8.5" y2="14.5"/>
    </svg>
);
const MotionStatSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 12.5a6 6 0 1 1 12 0"/>
        <line x1="8.5" y1="12.5" x2="11.5" y2="8.5"/>
        <circle cx="8.5" cy="12.5" r="1" fill="currentColor" stroke="none"/>
    </svg>
);
const StateStatSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8.5" y1="2.5" x2="8.5" y2="7.5"/>
        <path d="M5 4.3a5.5 5.5 0 1 0 7 0"/>
    </svg>
);
const AlertStatSVG = () => (
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 2.5 15.5 14.5H1.5Z"/>
        <line x1="8.5" y1="6.5" x2="8.5" y2="10"/>
        <circle cx="8.5" cy="12.3" r="0.9" fill="currentColor" stroke="none"/>
    </svg>
);
const REPORT_CATEGORY_ICONS = {
    live: <LiveStatSVG />,
    device: <DeviceStatSVG />,
    motion: <MotionStatSVG />,
    state: <StateStatSVG />,
    alert: <AlertStatSVG />,
};

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

/* ── nav tree structure ─────────────────────────────────────── */
// Report category -> report-name lists now live in ReportPage.jsx (REPORT_CATEGORIES, imported
// above) since ReportPage's own in-page tab bar needs the same grouping — this file just renders
// one flat nav entry per category instead of the old nested/scrolling per-report tree.

/* ── helpers ─────────────────────────────────────────────────── */
const EXPANDED_W = 220;
const COLLAPSED_W = 62;

function FleetMark() {
    return (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 17.5V9.8c0-.7.36-1.35.96-1.72l5.95-3.68a2.05 2.05 0 0 1 2.18 0l5.95 3.68c.6.37.96 1.02.96 1.72v7.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M7.2 17.5h9.6M8.3 14.2h7.4M10 10.8h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="7" cy="19" r="1.6" fill="currentColor"/>
            <circle cx="17" cy="19" r="1.6" fill="currentColor"/>
        </svg>
    );
}

function NavItem({ icon, label, active, onClick, depth = 0, open, sidebarOpen }) {
    const bg   = active ? '#e6f4f3' : 'transparent';
    const col  = active ? '#07565b' : '#486581';
    const left = 8 + depth * 14;
    return (
        <button data-active={active ? 'true' : 'false'} onClick={onClick} title={!sidebarOpen ? label : undefined} style={{
            display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
            padding: sidebarOpen ? `8px ${8}px 8px ${left}px` : '8px 0',
            justifyContent: sidebarOpen ? 'flex-start' : 'center',
            borderRadius: 8, border: 'none', cursor: 'pointer', background: bg, color: col,
            fontSize: 12.5, fontWeight: active ? 800 : 600, marginBottom: 2, flexShrink: 0,
            transition: 'background 0.16s, color 0.16s',
        }}>
            {icon && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, opacity: active ? 1 : 0.75 }}>{icon}</span>}
            {sidebarOpen && <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{label}</span>}
            {sidebarOpen && open !== undefined && <ChevSVG open={open} />}
        </button>
    );
}

/* ── main component ─────────────────────────────────────────── */
// "Route Planning" and "Fleet Report" hidden from the nav temporarily per request — pages/routing
// are untouched, so re-add the two entries below to bring them back.
export const FLEET_ITEMS = [
    { label: 'Dashboard',       key: 'Dashboard',          icon: <DashboardSVG /> },
    { label: 'Driver',          key: 'Driver',             icon: <DriverSVG /> },
    { label: 'Vehicle',         key: 'Vehicle',            icon: <VehicleSVG /> },
    { label: 'Vehicle Track',   key: 'VehicleTrack',       icon: <VehicleTrackSVG /> },
    { label: 'Vehicle Maintenance', key: 'VehicleMaintenance', icon: <WrenchSVG /> },
    { label: 'Fuel Management', key: 'FuelManagement',     icon: <FuelSVG /> },
    { label: 'Check in Record', key: 'CheckIn',            icon: <CheckInSVG /> },
    { label: 'Capture History', key: 'CaptureHistory',     icon: <CaptureSVG /> },
    { label: 'Media Gallery',   key: 'MediaGallery',       icon: <GallerySVG /> },
    { label: 'Face Recognition', key: 'FaceRecognition',   icon: <FaceSVG /> },
    // { label: 'Route Planning',  key: 'RoutePlanning' },
    // { label: 'Fleet Report',    key: 'FleetReport' },
];

export default function Sidebar({ user, page, setPage, onLogoutClick, open, onToggle, reportSection, setReportSection, fleetPage, setFleetPage }) {
    const [reportOpen,   setReportOpen]   = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [fleetOpen,    setFleetOpen]    = useState(true);

    const W = open ? EXPANDED_W : COLLAPSED_W;

    const navTo = (p) => { setPage(p); };
    const reportTo = (section) => { setReportSection(section); setPage('Report'); };
    const toggleSection = (section) => {
        if (section === 'fleet') {
            const next = !fleetOpen;
            setFleetOpen(next);
            if (next) { setSettingsOpen(false); setReportOpen(false); }
        } else if (section === 'settings') {
            const next = !settingsOpen;
            setSettingsOpen(next);
            if (next) { setFleetOpen(false); setReportOpen(false); }
        } else {
            const next = !reportOpen;
            setReportOpen(next);
            if (next) { setFleetOpen(false); setSettingsOpen(false); }
        }
    };

    const isReportActive = page === 'Report';
    const isSettingsActive = page === 'Device Management' || page === 'Sim Data Management' || page === 'Geofence' || page === 'Alert Recipients' || page === 'Notification' || page === 'Calendars' || page === 'Computed Attributes' || page === 'Maintenance' || page === 'Saved Commands' || page === 'Groups' || page === 'Drivers' || page === 'Command';
    const isFleetActive  = page === 'Fleet';

    return (
        <aside className="mine-sidebar" style={{
            width: W, minWidth: W, background: '#fff', borderRight: '1px solid #d9e2ec',
            display: 'flex', flexDirection: 'column', zIndex: 10, flexShrink: 0, overflow: 'hidden',
            transition: `width 0.22s ease, min-width 0.22s ease`,
            boxShadow: '2px 0 16px rgba(16,42,67,.035)',
        }}>
            {/* Logo + hamburger */}
            <div style={{ height: 63, display: 'flex', alignItems: 'center', borderBottom: '1px solid #edf2f7', flexShrink: 0, paddingLeft: open ? 14 : 0, justifyContent: open ? 'flex-start' : 'center', gap: 10, overflow: 'hidden' }}>
                {open && (
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#0b6e75,#168a83)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 7px 16px rgba(11,110,117,.2)' }}><FleetMark /></div>
                )}
                {open && <span style={{ fontSize: 15, fontWeight: 850, color: '#102a43', letterSpacing: '-.025em', whiteSpace: 'nowrap', flex: 1 }}>FleetTrack</span>}
                <button onClick={onToggle} title="Toggle sidebar" style={{ background: '#f5f8fa', border: '1px solid #e7edf3', cursor: 'pointer', color: '#627d98', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 7, borderRadius: 8, flexShrink: 0, marginRight: open ? 10 : 0 }}>
                    <HamSVG />
                </button>
            </div>

            {/* Nav */}
            <nav className="scrollbar-thin" style={{ flex: 1, padding: open ? '14px 9px' : '12px 6px', overflowY: 'auto', overflowX: 'hidden' }}>
                {/* Fleet is the primary operational interface. Its Dashboard owns map/video. */}
                <NavItem icon={<FleetSVG />} label="Fleet" active={isFleetActive}
                    open={open ? fleetOpen : undefined}
                    onClick={() => { if (open) toggleSection('fleet'); else navTo('Fleet'); }}
                    sidebarOpen={open} />

                {open && fleetOpen && (
                    <div style={{ marginLeft: 4 }}>
                        {FLEET_ITEMS.map(({ label, key, icon }) => (
                            <NavItem key={key} label={label} icon={icon} depth={1} sidebarOpen={open}
                                active={isFleetActive && fleetPage === key}
                                onClick={() => { navTo('Fleet'); setFleetPage(key); }} />
                        ))}
                    </div>
                )}

                {/* Settings contains device and platform configuration. */}
                <NavItem icon={<SettingsSVG />} label="Settings" active={isSettingsActive}
                    open={open ? settingsOpen : undefined}
                    onClick={() => { if (open) toggleSection('settings'); else navTo('Device Management'); }}
                    sidebarOpen={open} />

                {open && settingsOpen && (
                    <div style={{ marginLeft: 4 }}>
                        <NavItem label="Device Management" icon={<DeviceMgmtSVG />} depth={1} sidebarOpen={open}
                            active={page === 'Device Management'}
                            onClick={() => navTo('Device Management')} />
                        <NavItem label="Sim Data Management" icon={<SimSVG />} depth={1} sidebarOpen={open}
                            active={page === 'Sim Data Management'}
                            onClick={() => navTo('Sim Data Management')} />
                        <NavItem label="Command" icon={<CommandSVG />} depth={1} sidebarOpen={open}
                            active={page === 'Command'}
                            onClick={() => navTo('Command')} />
                        <NavItem label="Geofence" icon={<GeofenceSVG />} depth={1} sidebarOpen={open}
                            active={page === 'Geofence'}
                            onClick={() => navTo('Geofence')} />
                        <NavItem label="Alert Recipients" icon={<AlertRecipientsSVG />} depth={1} sidebarOpen={open}
                            active={page === 'Alert Recipients'}
                            onClick={() => navTo('Alert Recipients')} />
                        {!turboHiveEnabled && <>
                        <NavItem label="Notification" icon={<NotificationSVG />} depth={1} sidebarOpen={open}
                            active={page === 'Notification'}
                            onClick={() => navTo('Notification')} />
                        <NavItem label="Calendars" icon={<CalendarSVG />} depth={1} sidebarOpen={open}
                            active={page === 'Calendars'}
                            onClick={() => navTo('Calendars')} />
                        <NavItem label="Computed Attributes" icon={<AttributesSVG />} depth={1} sidebarOpen={open}
                            active={page === 'Computed Attributes'}
                            onClick={() => navTo('Computed Attributes')} />
                        <NavItem label="Maintenance" icon={<WrenchSVG />} depth={1} sidebarOpen={open}
                            active={page === 'Maintenance'}
                            onClick={() => navTo('Maintenance')} />
                        <NavItem label="Saved Commands" icon={<BookmarkSVG />} depth={1} sidebarOpen={open}
                            active={page === 'Saved Commands'}
                            onClick={() => navTo('Saved Commands')} />
                        <NavItem label="Groups" icon={<GroupsSVG />} depth={1} sidebarOpen={open}
                            active={page === 'Groups'}
                            onClick={() => navTo('Groups')} />
                        </>}
                        {/* "Drivers" hidden from the nav per request — DriverPage.jsx/route are untouched.
                            The functional driver module lives under Fleet -> Driver. */}
                    </div>
                )}

                {/* Reports follows Settings in the primary navigation. */}
                <NavItem icon={<ReportSVG />} label="Reports" active={isReportActive}
                    open={open ? reportOpen : undefined}
                    onClick={() => { if (open) toggleSection('reports'); else setPage('Report'); }}
                    sidebarOpen={open} />

                {open && reportOpen && (
                    <div style={{ marginLeft: 4 }}>
                        {REPORT_CATEGORIES.map(cat => (
                            <NavItem key={cat.key} label={cat.label} icon={REPORT_CATEGORY_ICONS[cat.key]} depth={1} sidebarOpen={open}
                                active={isReportActive && cat.items.includes(reportSection)}
                                onClick={() => reportTo(cat.items[0])} />
                        ))}
                    </div>
                )}

                {/* Clients (SaaS tenants) - super_admin only */}
                {user.role === 'super_admin' && (
                    <NavItem icon={<ClientsSVG />} label="Clients" active={page === 'Clients'}
                        onClick={() => navTo('Clients')} sidebarOpen={open} />
                )}
            </nav>

            {/* Sign out */}
            <div style={{ padding: open ? '10px 8px' : '10px 6px', borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
                <button onClick={onLogoutClick} title={!open ? 'Sign Out' : undefined} style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: open ? '9px 12px' : '9px 0',
                    justifyContent: open ? 'flex-start' : 'center',
                    borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: '#ef4444', fontSize: 13, fontWeight: 600,
                }}>
                    <LogoutSVG />
                    {open && 'Sign Out'}
                </button>
            </div>
        </aside>
    );
}
