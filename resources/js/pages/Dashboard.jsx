import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import Sidebar          from '../components/Sidebar.jsx';
import DeviceList       from '../components/DeviceList.jsx';
import MapCanvas        from '../components/MapCanvas.jsx';
import VideoMode        from '../components/VideoMode.jsx';
import TopBar           from '../components/TopBar.jsx';
import LogoutModal      from '../components/LogoutModal.jsx';
import DeviceManagement from '../components/DeviceManagement.jsx';
import ReportPage       from '../components/ReportPage.jsx';
import FleetPage        from '../components/FleetPage.jsx';
import GeofencePage     from '../components/GeofencePage.jsx';
import NotificationPage from '../components/NotificationPage.jsx';
import CalendarPage     from '../components/CalendarPage.jsx';
import ComputedAttributePage from '../components/ComputedAttributePage.jsx';
import MaintenancePage  from '../components/MaintenancePage.jsx';
import SavedCommandPage from '../components/SavedCommandPage.jsx';
import GroupPage        from '../components/GroupPage.jsx';
import DriverPage       from '../components/DriverPage.jsx';
import ClientsPage      from '../components/ClientsPage.jsx';

/* Traccar's device/position shape -> the shape DeviceList/MapCanvas/TopBar already expect,
   plus the raw Traccar fields (groupId, phone, model, ...) EditDeviceModal needs to edit a device. */
function normalizeLiveDevice(device, positionsByDeviceId) {
    const pos = positionsByDeviceId[device.id];
    return {
        id:      device.id,
        name:    device.name,
        tracker: device.model || device.uniqueId,
        imei:    device.uniqueId,
        status:  device.status === 'online' ? 'ONLINE' : 'OFFLINE',
        lat:     pos ? pos.latitude  : null,
        lng:     pos ? pos.longitude : null,
        signal:  pos?.attributes?.batteryLevel ?? pos?.attributes?.rssi ?? 0,
        groupId:        device.groupId,
        calendarId:     device.calendarId,
        phone:          device.phone,
        model:          device.model,
        contact:        device.contact,
        category:       device.category,
        disabled:       device.disabled,
        expirationTime: device.expirationTime,
        attributes:     device.attributes,
    };
}

// Merge a Traccar websocket {"positions": [...]} push into existing device list
function applyLivePositions(devices, positions) {
    const byDeviceId = {};
    for (const p of positions) byDeviceId[p.deviceId] = p;
    return devices.map(d => {
        const p = byDeviceId[d.id];
        if (!p) return d;
        return {
            ...d,
            lat:    p.latitude,
            lng:    p.longitude,
            signal: p.attributes?.batteryLevel ?? p.attributes?.rssi ?? d.signal,
        };
    });
}

// Merge a Traccar websocket {"devices": [...]} push (device attribute changes) into existing device list
function applyLiveDevices(devices, updates) {
    const byId = {};
    for (const u of updates) byId[u.id] = u;
    return devices.map(d => {
        const u = byId[d.id];
        if (!u) return d;
        return {
            ...d,
            name:    u.name,
            tracker: u.model || u.uniqueId,
            imei:    u.uniqueId,
            status:  u.status === 'online' ? 'ONLINE' : 'OFFLINE',
            groupId:        u.groupId,
            calendarId:     u.calendarId,
            phone:          u.phone,
            model:          u.model,
            contact:        u.contact,
            category:       u.category,
            disabled:       u.disabled,
            expirationTime: u.expirationTime,
            attributes:     u.attributes,
        };
    });
}

export default function Dashboard({ user, onLogout }) {
    const [search,         setSearch]         = useState('');
    const [page,           setPage]           = useState('Dashboard');
    const [showLogout,     setShowLogout]      = useState(false);
    const [mapMode,        setMapMode]        = useState('Map');
    const [panelOpen,      setPanelOpen]      = useState(true);
    const [sidebarOpen,    setSidebarOpen]    = useState(true);
    const [reportSection,  setReportSection]  = useState('Internal Battery');
    const [fleetPage,      setFleetPage]      = useState('Dashboard');

    // Live Traccar data (Device Management + Device Map & Video) — initial load via REST,
    // then kept live via Traccar's own websocket (see effect below).
    const [liveDevices, setLiveDevices] = useState([]);
    const [liveSelected, setLiveSelected] = useState(null);
    const [liveLoading, setLiveLoading] = useState(true);
    const wsRef = useRef(null);
    const wsReconnectRef = useRef(null);

    const fetchLiveDevices = async () => {
        try {
            const [devicesRes, positionsRes] = await Promise.all([
                api.getTraccarDevices(),
                api.getLatestPositions(),
            ]);
            const positionsByDeviceId = {};
            for (const p of positionsRes.data) positionsByDeviceId[p.deviceId] = p;
            const normalized = devicesRes.data.map(d => normalizeLiveDevice(d, positionsByDeviceId));
            setLiveDevices(normalized);
            setLiveSelected(curr => curr ?? normalized[0]?.id ?? null);
        } catch (e) {
            console.error('Failed to load Traccar devices:', e);
        } finally {
            setLiveLoading(false);
        }
    };

    useEffect(() => {
        fetchLiveDevices();
    }, []);

    // Open Traccar's websocket directly from the browser for live position/device updates.
    // Auth mirrors the REST API: a short-lived Traccar bearer token is minted server-side
    // (GET /api/traccar/ws-token, behind auth:sanctum) and handed to the browser, which passes
    // it as ?token=... on the websocket URL — the Traccar admin password never reaches the browser.
    useEffect(() => {
        let cancelled = false;

        const connect = async () => {
            try {
                const { data } = await api.getWsToken();
                if (cancelled) return;

                const ws = new WebSocket(`${data.url}?token=${encodeURIComponent(data.token)}`);
                wsRef.current = ws;

                ws.onmessage = (evt) => {
                    let msg;
                    try { msg = JSON.parse(evt.data); } catch { return; }
                    if (msg.positions) setLiveDevices(ds => applyLivePositions(ds, msg.positions));
                    if (msg.devices)   setLiveDevices(ds => applyLiveDevices(ds, msg.devices));
                };

                ws.onclose = () => {
                    if (!cancelled) wsReconnectRef.current = setTimeout(connect, 3000);
                };
                ws.onerror = () => ws.close();
            } catch (e) {
                console.error('Failed to open Traccar websocket:', e);
                if (!cancelled) wsReconnectRef.current = setTimeout(connect, 3000);
            }
        };

        connect();

        return () => {
            cancelled = true;
            clearTimeout(wsReconnectRef.current);
            wsRef.current?.close();
        };
    }, []);

    const filtered       = liveDevices.filter(d =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        (d.tracker || '').toLowerCase().includes(search.toLowerCase())
    );
    const onlineCount    = liveDevices.filter(d => d.status === 'ONLINE').length;
    const selectedDevice = liveDevices.find(d => d.id === liveSelected);

    return (
        <div style={{ display: 'flex', height: '100vh', fontFamily: 'Inter,system-ui,sans-serif', background: '#f1f5f9', overflow: 'hidden' }}>
            <Sidebar
                user={user}
                page={page}
                setPage={setPage}
                onLogoutClick={() => setShowLogout(true)}
                open={sidebarOpen}
                onToggle={() => setSidebarOpen(o => !o)}
                reportSection={reportSection}
                setReportSection={setReportSection}
                fleetPage={fleetPage}
                setFleetPage={setFleetPage}
            />

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ height: 46, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 9, padding: '0 18px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {user.name[0]}
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{user.name}</p>
                        <p style={{ margin: 0, fontSize: 10, color: '#94a3b8', textTransform: 'capitalize' }}>{user.role || 'Administrator'}</p>
                    </div>
                </div>

                {page === 'Device Management' ? (
                    <DeviceManagement devices={liveDevices} loading={liveLoading} onRefresh={fetchLiveDevices} />
                ) : page === 'Geofence' ? (
                    <GeofencePage onBack={() => setPage('Dashboard')} />
                ) : page === 'Notification' ? (
                    <NotificationPage />
                ) : page === 'Calendars' ? (
                    <CalendarPage />
                ) : page === 'Computed Attributes' ? (
                    <ComputedAttributePage />
                ) : page === 'Maintenance' ? (
                    <MaintenancePage />
                ) : page === 'Saved Commands' ? (
                    <SavedCommandPage />
                ) : page === 'Groups' ? (
                    <GroupPage />
                ) : page === 'Drivers' ? (
                    <DriverPage />
                ) : page === 'Clients' ? (
                    <ClientsPage />
                ) : page === 'Report' ? (
                    <ReportPage reportSection={reportSection} setReportSection={setReportSection} />
                ) : page === 'Fleet' ? (
                    <FleetPage fleetPage={fleetPage} setFleetPage={setFleetPage} />
                ) : (
                    <>
                        <TopBar
                            onlineCount={onlineCount}
                            total={liveDevices.length}
                            mapMode={mapMode}
                            setMapMode={setMapMode}
                            selectedDevice={selectedDevice}
                        />
                        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                            <DeviceList
                                devices={filtered}
                                selected={liveSelected}
                                onSelect={setLiveSelected}
                                search={search}
                                setSearch={setSearch}
                                loading={liveLoading}
                                open={panelOpen}
                                onToggle={() => setPanelOpen(o => !o)}
                            />

                            {mapMode === 'Video' ? (
                                <VideoMode selectedDevice={selectedDevice} />
                            ) : (
                                <MapCanvas
                                    devices={liveDevices}
                                    selected={liveSelected}
                                    onSelect={setLiveSelected}
                                    selectedDevice={selectedDevice}
                                    mapMode={mapMode}
                                />
                            )}
                        </div>
                    </>
                )}
            </div>

            {showLogout && <LogoutModal onCancel={() => setShowLogout(false)} onConfirm={onLogout} />}
        </div>
    );
}
