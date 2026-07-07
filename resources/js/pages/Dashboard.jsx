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
import { turboHiveEnabled, applyTurboHivePosition } from '../turbohive-mqtt.js';
import CalendarPage     from '../components/CalendarPage.jsx';
import ComputedAttributePage from '../components/ComputedAttributePage.jsx';
import MaintenancePage  from '../components/MaintenancePage.jsx';
import SavedCommandPage from '../components/SavedCommandPage.jsx';
import GroupPage        from '../components/GroupPage.jsx';
import DriverPage       from '../components/DriverPage.jsx';
import ClientsPage      from '../components/ClientsPage.jsx';

// How often the live map re-polls TurboHive's device list (covers both devices and their
// locations — fetchLiveDevices fetches both in one call) to catch devices going offline, which
// MQTT alone can't express (see fetchLiveDevices' polling effect below).
const DEVICE_POLL_SECONDS = 30;

// TurboHive's device-list endpoint (/v3/devices/page) has no position fields at all — lat/lng
// only exist on the separate /v3/track/location snapshot, keyed by "device.imei" (TurboHive's
// flat dotted-key convention). `positionsByImei` merges that in on initial load, same as the
// Traccar path already does; live updates then keep it fresh via applyTurboHivePosition() (MQTT).
function normalizeTurboHiveDevice(device, positionsByImei = {}) {
    const imei = String(device.imei ?? device.deviceId ?? device.uniqueId ?? device.id ?? '');
    const pos = positionsByImei[imei];
    return {
        id:     imei || String(device.id ?? ''),
        name:   device.name ?? device.deviceName ?? device.label ?? imei ?? 'Unknown',
        tracker: imei,
        imei,
        status: (device.onlineStatus === 1 || device.online === true || device.status === 'ONLINE' || device.status === 'online') ? 'ONLINE' : 'OFFLINE',
        lat:      pos ? pos['gnss.lat'] ?? null : device.lat ?? device.latitude ?? null,
        lng:      pos ? pos['gnss.lng'] ?? null : device.lng ?? device.longitude ?? null,
        speed:    pos?.['gnss.speed']     ?? null,
        heading:  pos?.['gnss.course']    ?? null,
        acc:      pos?.['status.acc']     ?? null,
        altitude: pos?.['gnss.altitude']  ?? null,
        lastUpdate: pos?.['server.time']  ?? null,
        signal: device.batteryLevel ?? device.battery ?? device.signal ?? 0,
    };
}

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
    const [geofenceAlerts, setGeofenceAlerts] = useState([]); // live enter/exit toasts

    // Live device data — initial load via REST, then kept live via WebSocket (Traccar) or MQTT (TurboHive)
    const [liveDevices,   setLiveDevices]   = useState([]);
    const [liveSelected,  setLiveSelected]  = useState(null);
    const [liveLoading,   setLiveLoading]   = useState(true);
    const [mqttConnected, setMqttConnected] = useState(false);
    const [nextRefreshIn, setNextRefreshIn] = useState(DEVICE_POLL_SECONDS);
    const wsRef = useRef(null);
    const wsReconnectRef = useRef(null);

    const fetchLiveDevices = async () => {
        try {
            if (turboHiveEnabled) {
                const [{ data }, locationsRes] = await Promise.all([
                    api.getTurboHiveTrackableDevices(),
                    api.getTurboHiveAllLocations().catch(() => ({ data: [] })),
                ]);
                const rawList = Array.isArray(data) ? data : (data?.list ?? data?.data ?? []);
                const positionsByImei = {};
                for (const loc of locationsRes.data ?? []) {
                    const imei = loc['device.imei'];
                    if (imei) positionsByImei[imei] = loc;
                }
                const normalized = rawList.map(d => normalizeTurboHiveDevice(d, positionsByImei));
                setLiveDevices(normalized);
                setLiveSelected(curr => curr ?? normalized[0]?.id ?? null);
            } else {
                const devicesRes   = await api.getTraccarDevices();
                const positionsRes = await api.getLatestPositions();
                const positionsByDeviceId = {};
                for (const p of positionsRes.data) positionsByDeviceId[p.deviceId] = p;
                const normalized = devicesRes.data.map(d => normalizeLiveDevice(d, positionsByDeviceId));
                setLiveDevices(normalized);
                setLiveSelected(curr => curr ?? normalized[0]?.id ?? null);
            }
        } catch (e) {
            console.error('Failed to load live devices:', e);
        } finally {
            setLiveLoading(false);
        }
    };

    // MQTT only ever pushes position updates (and always marks a device ONLINE when one arrives —
    // see applyTurboHivePosition) — there's no "device went offline" push to catch the opposite
    // case. Re-polling the REST device list periodically is what actually notices a device has
    // gone offline in TurboHive, the same way FleetPage's LiveLocationTab already does.
    //
    // A single 1s tick drives both the countdown display and the actual re-fetch (devices +
    // locations are already one combined call in fetchLiveDevices) — two independent timers (a
    // 1s display tick plus a separate 30s fetch interval) can drift apart, so the badge would hit
    // 0 and reset slightly before/after the real fetch actually fired.
    useEffect(() => {
        fetchLiveDevices();
        if (!turboHiveEnabled) return;

        setNextRefreshIn(DEVICE_POLL_SECONDS);
        const tick = setInterval(() => {
            setNextRefreshIn(s => {
                if (s <= 1) {
                    fetchLiveDevices();
                    return DEVICE_POLL_SECONDS;
                }
                return s - 1;
            });
        }, 1000);

        return () => clearInterval(tick);
    }, []);

    // Open Traccar's websocket directly from the browser for live position/device updates.
    // Auth mirrors the REST API: a short-lived Traccar bearer token is minted server-side
    // (GET /api/traccar/ws-token, behind auth:sanctum) and handed to the browser, which passes
    // it as ?token=... on the websocket URL — the Traccar admin password never reaches the browser.
    useEffect(() => {
        if (turboHiveEnabled) {
            return;
        }

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
                    if (msg.devices)   setLiveDevices(ds => applyLivePositions(ds, msg.devices));
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

    // Listen for TurboHive position updates broadcast from the mqtt:worker via Laravel Reverb
    useEffect(() => {
        if (!turboHiveEnabled || !window.Echo) return;

        const channel = window.Echo.channel('fleet');

        channel.subscribed(() => setMqttConnected(true));

        channel.listen('.position.updated', (data) => {
            setLiveDevices(ds => applyTurboHivePosition(ds, {
                deviceKey:  data.imei,
                latitude:   data.lat,
                longitude:  data.lng,
                speed:      data.speed,
                heading:    data.heading,
                acc:        data.acc,
                altitude:   data.altitude,
                deviceTime: data.timestamp,
                signal:     data.signal,
            }));
        });

        // Live geofence enter/exit — broadcast by GeofenceMonitorService from the same MQTT
        // position stream (see app/Services/GeofenceMonitorService.php).
        channel.listen('.geofence.event', (data) => {
            const id = `${data.geofenceId}-${data.triggeredAt}`;
            setGeofenceAlerts(a => [...a, { id, ...data }]);
            setTimeout(() => setGeofenceAlerts(a => a.filter(x => x.id !== id)), 8000);
        });

        channel.error(() => setMqttConnected(false));

        return () => {
            window.Echo.leaveChannel('fleet');
            setMqttConnected(false);
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
            {geofenceAlerts.length > 0 && (
                <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 8, width: 300 }}>
                    {geofenceAlerts.map(a => {
                        const deviceName = liveDevices.find(d => d.imei === a.imei)?.name ?? a.imei;
                        const isEnter = a.type === 'enter';
                        return (
                            <div key={a.id} style={{ background: '#fff', borderLeft: `4px solid ${isEnter ? '#16a34a' : '#f59e0b'}`, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', padding: '10px 14px' }}>
                                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                                    {deviceName} {isEnter ? 'entered' : 'exited'} {a.geofenceName}
                                </p>
                                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#6b7280' }}>
                                    {new Date(a.triggeredAt).toLocaleTimeString()}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}
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
                    <DeviceManagement />
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
                                    mqttConnected={turboHiveEnabled ? mqttConnected : undefined}
                                    nextRefreshIn={turboHiveEnabled ? nextRefreshIn : undefined}
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
