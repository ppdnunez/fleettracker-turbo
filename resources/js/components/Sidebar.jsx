import { useState } from 'react';

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

/* ── nav tree structure ─────────────────────────────────────── */
const REPORT_DEVICE = [
    'Internal Battery','External Battery','Fuel Consumption','Current fuel Value',
    'Temperature & Humidity','Driver Behavior','Positioning & Battery',
    'Travel statistics (OBD)',
];
const REPORT_MOTION = [
    'Track Details','Replay','Mileage','Trips','Overspeed','Parking','Idling','Ignition','Geo Fence',
];
const REPORT_ALERT = ['Alert Details'];

/* ── helpers ─────────────────────────────────────────────────── */
const EXPANDED_W = 220;
const COLLAPSED_W = 62;

function NavItem({ icon, label, active, onClick, depth = 0, open, sidebarOpen }) {
    const bg   = active ? '#eff6ff' : 'transparent';
    const col  = active ? '#1e40af' : '#4b5563';
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
const FLEET_ITEMS = [
    { label: 'Dashboard',       key: 'Dashboard' },
    { label: 'Driver',          key: 'Driver' },
    { label: 'Vehicle',         key: 'Vehicle' },
    { label: 'Vehicle Track',   key: 'VehicleTrack' },
    { label: 'Fuel Management', key: 'FuelManagement' },
    { label: 'Check in Record', key: 'CheckIn' },
    { label: 'Route Planning',  key: 'RoutePlanning' },
    { label: 'Fleet Report',    key: 'FleetReport' },
];

export default function Sidebar({ user, page, setPage, onLogoutClick, open, onToggle, reportSection, setReportSection, fleetPage, setFleetPage }) {
    const [reportOpen,   setReportOpen]   = useState(false);
    const [deviceOpen,   setDeviceOpen]   = useState(false);
    const [fleetOpen,    setFleetOpen]    = useState(false);
    const [devStatOpen,  setDevStatOpen]  = useState(false);
    const [motStatOpen,  setMotStatOpen]  = useState(false);
    const [stateStatOpen,setStateStatOpen]= useState(false);
    const [alertOpen,    setAlertOpen]    = useState(false);

    const W = open ? EXPANDED_W : COLLAPSED_W;

    const navTo = (p) => { setPage(p); };
    const reportTo = (section) => { setReportSection(section); setPage('Report'); };

    const isReportActive = page === 'Report';
    const isDeviceActive = page === 'Device Management' || page === 'Dashboard' || page === 'Geofence' || page === 'Notification' || page === 'Calendars' || page === 'Computed Attributes' || page === 'Maintenance' || page === 'Saved Commands' || page === 'Groups' || page === 'Drivers';
    const isFleetActive  = page === 'Fleet';

    return (
        <aside style={{
            width: W, minWidth: W, background: '#fff', borderRight: '1px solid #e2e8f0',
            display: 'flex', flexDirection: 'column', zIndex: 10, flexShrink: 0, overflow: 'hidden',
            transition: `width 0.22s ease, min-width 0.22s ease`,
        }}>
            {/* Logo + hamburger */}
            <div style={{ height: 58, display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9', flexShrink: 0, paddingLeft: open ? 14 : 0, justifyContent: open ? 'flex-start' : 'center', gap: 10, overflow: 'hidden' }}>
                {open && (
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#1e40af,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>📡</div>
                )}
                {open && <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', flex: 1 }}>FleetTrack</span>}
                <button onClick={onToggle} title="Toggle sidebar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 6, flexShrink: 0 }}>
                    <HamSVG />
                </button>
            </div>

            {/* Nav */}
            <nav style={{ flex: 1, padding: open ? '10px 8px' : '10px 6px', overflowY: 'auto', overflowX: 'hidden' }}>
                {/* Dashboard */}
                <NavItem icon={<DashSVG />} label="Dashboard" active={page === 'Dashboard' && !isReportActive}
                    onClick={() => navTo('Dashboard')} sidebarOpen={open} />

                {/* Report */}
                <NavItem icon={<ReportSVG />} label="Report" active={isReportActive}
                    open={open ? reportOpen : undefined}
                    onClick={() => { if (open) setReportOpen(o => !o); else { setPage('Report'); } }}
                    sidebarOpen={open} />

                {open && reportOpen && (
                    <div style={{ marginLeft: 4 }}>
                        {/* Device Statistics */}
                        <SubGroup label="Device Statistics" openKey={devStatOpen} onToggle={() => setDevStatOpen(o => !o)}
                            items={REPORT_DEVICE} activePage={isReportActive ? reportSection : null}
                            onItemClick={reportTo} sidebarOpen={open} />

                        {/* Motion Statistics */}
                        <SubGroup label="Motion Statistics" openKey={motStatOpen} onToggle={() => setMotStatOpen(o => !o)}
                            items={REPORT_MOTION} activePage={isReportActive ? reportSection : null}
                            onItemClick={reportTo} sidebarOpen={open} />

                        {/* State Statistics */}
                        <SubGroup label="State Statistics" openKey={stateStatOpen} onToggle={() => setStateStatOpen(o => !o)}
                            items={['Offline', 'Online']} activePage={isReportActive ? reportSection : null}
                            onItemClick={reportTo} sidebarOpen={open} />

                        {/* Alert Statistics */}
                        <SubGroup label="Alert Statistics" openKey={alertOpen} onToggle={() => setAlertOpen(o => !o)}
                            items={REPORT_ALERT} activePage={isReportActive ? reportSection : null}
                            onItemClick={reportTo} sidebarOpen={open} />
                    </div>
                )}

                {/* Device */}
                <NavItem icon={<DeviceSVG />} label="Device" active={isDeviceActive && !isReportActive}
                    open={open ? deviceOpen : undefined}
                    onClick={() => { if (open) setDeviceOpen(o => !o); else navTo('Dashboard'); }}
                    sidebarOpen={open} />

                {open && deviceOpen && (
                    <div style={{ marginLeft: 4 }}>
                        <NavItem label="Device Management" depth={1} sidebarOpen={open}
                            active={page === 'Device Management'}
                            onClick={() => navTo('Device Management')} />
                        <NavItem label="Device Map & Video" depth={1} sidebarOpen={open}
                            active={page === 'Dashboard' && !isReportActive}
                            onClick={() => navTo('Dashboard')} />
                        <NavItem label="Geofence" depth={1} sidebarOpen={open}
                            active={page === 'Geofence'}
                            onClick={() => navTo('Geofence')} />
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
                        <NavItem label="Drivers" depth={1} sidebarOpen={open}
                            active={page === 'Drivers'}
                            onClick={() => navTo('Drivers')} />
                    </div>
                )}

                {/* Fleet */}
                <NavItem icon={<FleetSVG />} label="Fleet" active={isFleetActive}
                    open={open ? fleetOpen : undefined}
                    onClick={() => { if (open) setFleetOpen(o => !o); else { navTo('Fleet'); } }}
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
