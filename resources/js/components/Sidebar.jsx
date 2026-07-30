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

function SubGroup({ label, items, openKey, activePage, onItemClick, onToggle, sidebarOpen }) {
    const isOpen = openKey;
    return (
        <>
            <button onClick={onToggle} style={{
                display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left',
                padding: '6px 8px 6px 22px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: 'transparent', color: '#6b7280', fontSize: 12.5, fontWeight: 600, marginBottom: 1,
            }}>
                <span style={{ flex: 1 }}>{label}</span>
                <ChevSVG open={isOpen} />
            </button>
            {isOpen && items.map(item => (
                <NavItem key={item} label={item} depth={2} sidebarOpen={sidebarOpen}
                    active={activePage === item} onClick={() => onItemClick(item)} />
            ))}
        </>
    );
}

/* ── main component ─────────────────────────────────────────── */
// "Route Planning" and "Fleet Report" hidden from the nav temporarily per request — pages/routing
// are untouched, so re-add the two entries below to bring them back.
const FLEET_ITEMS = [
    { label: 'Dashboard',       key: 'Dashboard' },
    { label: 'Driver',          key: 'Driver' },
    { label: 'Vehicle',         key: 'Vehicle' },
    { label: 'Vehicle Track',   key: 'VehicleTrack' },
    { label: 'Vehicle Maintenance', key: 'VehicleMaintenance' },
    { label: 'Fuel Management', key: 'FuelManagement' },
    { label: 'Check in Record', key: 'CheckIn' },
    { label: 'Capture History', key: 'CaptureHistory' },
    { label: 'Media Gallery',   key: 'MediaGallery' },
    { label: 'Face Recognition', key: 'FaceRecognition' },
    // { label: 'Route Planning',  key: 'RoutePlanning' },
    // { label: 'Fleet Report',    key: 'FleetReport' },
];

export default function Sidebar({ user, page, setPage, onLogoutClick, open, onToggle, reportSection, setReportSection, fleetPage, setFleetPage }) {
    const [reportOpen,   setReportOpen]   = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [fleetOpen,    setFleetOpen]    = useState(true);
    const [devStatOpen,  setDevStatOpen]  = useState(false);
    const [motStatOpen,  setMotStatOpen]  = useState(false);
    const [stateStatOpen,setStateStatOpen]= useState(false);
    const [alertOpen,    setAlertOpen]    = useState(false);
    const [liveStatOpen, setLiveStatOpen] = useState(false);

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
                        {FLEET_ITEMS.map(({ label, key }) => (
                            <NavItem key={key} label={label} depth={1} sidebarOpen={open}
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
                        <NavItem label="Device Management" depth={1} sidebarOpen={open}
                            active={page === 'Device Management'}
                            onClick={() => navTo('Device Management')} />
                        <NavItem label="Sim Data Management" depth={1} sidebarOpen={open}
                            active={page === 'Sim Data Management'}
                            onClick={() => navTo('Sim Data Management')} />
                        <NavItem label="Command" depth={1} sidebarOpen={open}
                            active={page === 'Command'}
                            onClick={() => navTo('Command')} />
                        <NavItem label="Geofence" depth={1} sidebarOpen={open}
                            active={page === 'Geofence'}
                            onClick={() => navTo('Geofence')} />
                        <NavItem label="Alert Recipients" depth={1} sidebarOpen={open}
                            active={page === 'Alert Recipients'}
                            onClick={() => navTo('Alert Recipients')} />
                        {!turboHiveEnabled && <>
                        <NavItem label="Notification" depth={1} sidebarOpen={open}
                            active={page === 'Notification'}
                            onClick={() => navTo('Notification')} />
                        <NavItem label="Calendars" depth={1} sidebarOpen={open}
                            active={page === 'Calendars'}
                            onClick={() => navTo('Calendars')} />
                        <NavItem label="Computed Attributes" depth={1} sidebarOpen={open}
                            active={page === 'Computed Attributes'}
                            onClick={() => navTo('Computed Attributes')} />
                        <NavItem label="Maintenance" depth={1} sidebarOpen={open}
                            active={page === 'Maintenance'}
                            onClick={() => navTo('Maintenance')} />
                        <NavItem label="Saved Commands" depth={1} sidebarOpen={open}
                            active={page === 'Saved Commands'}
                            onClick={() => navTo('Saved Commands')} />
                        <NavItem label="Groups" depth={1} sidebarOpen={open}
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
                        <SubGroup label="Live Statistic" openKey={liveStatOpen} onToggle={() => setLiveStatOpen(o => !o)}
                            items={REPORT_LIVE} activePage={isReportActive ? reportSection : null}
                            onItemClick={reportTo} sidebarOpen={open} />
                        <SubGroup label="Device Statistics" openKey={devStatOpen} onToggle={() => setDevStatOpen(o => !o)}
                            items={REPORT_DEVICE} activePage={isReportActive ? reportSection : null}
                            onItemClick={reportTo} sidebarOpen={open} />
                        <SubGroup label="Motion Statistics" openKey={motStatOpen} onToggle={() => setMotStatOpen(o => !o)}
                            items={REPORT_MOTION} activePage={isReportActive ? reportSection : null}
                            onItemClick={reportTo} sidebarOpen={open} />
                        <SubGroup label="State Statistics" openKey={stateStatOpen} onToggle={() => setStateStatOpen(o => !o)}
                            items={['Offline', 'Online']} activePage={isReportActive ? reportSection : null}
                            onItemClick={reportTo} sidebarOpen={open} />
                        <SubGroup label="Alert Statistics" openKey={alertOpen} onToggle={() => setAlertOpen(o => !o)}
                            items={REPORT_ALERT} activePage={isReportActive ? reportSection : null}
                            onItemClick={reportTo} sidebarOpen={open} />
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
