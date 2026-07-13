import axios from 'axios';

export function setAuthToken(token) {
    if (token) {
        localStorage.setItem('fleet_token', token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
        localStorage.removeItem('fleet_token');
        delete axios.defaults.headers.common['Authorization'];
    }
}

const empty = () => Promise.resolve({ data: [] });

export const api = {
    // ── Auth ────────────────────────────────────────────────────────────────
    login:   (email, password) => axios.post('/api/login', { email, password }),
    logout:  ()                => axios.post('/api/logout'),
    me:      ()                => axios.get('/api/user'),

    // ── Local device registry (Laravel DB) ──────────────────────────────────
    getDevices:   ()          => axios.get('/api/devices'),
    createDevice: (data)      => axios.post('/api/devices', data),
    updateDevice: (id, data)  => axios.put(`/api/devices/${id}`, data),
    deleteDevice: (id)        => axios.delete(`/api/devices/${id}`),

    // ── Local driver registry (Laravel DB) ──────────────────────────────────
    getFleetDrivers:    ()         => axios.get('/api/drivers'),
    createFleetDriver:  (data)     => axios.post('/api/drivers', data),
    updateFleetDriver:  (id, data) => axios.put(`/api/drivers/${id}`, data),
    deleteFleetDriver:  (id)       => axios.delete(`/api/drivers/${id}`),

    // ── Vehicle <-> Driver assignment (Laravel DB, keyed by TurboHive IMEI) ──
    getVehicleDrivers: (imei)            => axios.get(`/api/vehicle-drivers/${imei}`),
    setVehicleDrivers: (imei, driverIds) => axios.put(`/api/vehicle-drivers/${imei}`, { driverIds }),

    // ── Per-vehicle relay-disconnect opt-in (Laravel DB, keyed by TurboHive IMEI) ──
    getVehicleSetting: (imei)       => axios.get(`/api/vehicle-settings/${imei}`),
    setVehicleSetting: (imei, data) => axios.put(`/api/vehicle-settings/${imei}`, data),

    // ── Vehicle maintenance schedule/history (Laravel DB, keyed by TurboHive IMEI) ──
    getVehicleMaintenances:   ()         => axios.get('/api/vehicle-maintenances'),
    createVehicleMaintenance: (data)     => axios.post('/api/vehicle-maintenances', data),
    updateVehicleMaintenance: (id, data) => axios.put(`/api/vehicle-maintenances/${id}`, data),
    deleteVehicleMaintenance: (id)       => axios.delete(`/api/vehicle-maintenances/${id}`),

    // ── Driver check-ins (RFID/iButton taps, captured live via MqttWorker) ──
    getDriverCheckins: (params) => axios.get('/api/driver-checkins', { params }),

    // ── Local client registry (Laravel DB) ──────────────────────────────────
    getClients:   ()         => axios.get('/api/clients'),
    createClient: (data)     => axios.post('/api/clients', data),
    updateClient: (id, data) => axios.put(`/api/clients/${id}`, data),

    // ── TurboHive — devices & status ────────────────────────────────────────
    getTurboHiveMqttConfig:   ()         => axios.get('/api/turbohive/mqtt-config'),
    getTurboHiveDevices:      (params)   => axios.get('/api/turbohive/devices', { params }),
    // Same endpoint, minus Dashcam-type devices — a dashcam is auxiliary hardware attached to an
    // already-tracked vehicle, not a separate trackable unit, so it shouldn't appear in
    // vehicle-centric device pickers (reports, dashboard, geofence linking). Device Management
    // still uses the raw getTurboHiveDevices() above since managing dashcam hardware itself is
    // legitimate there.
    getTurboHiveTrackableDevices: async (params) => {
        const res = await api.getTurboHiveDevices(params);
        if (Array.isArray(res.data?.data)) {
            res.data.data = res.data.data.filter(d => d.deviceType !== 'Dashcam');
        }
        return res;
    },
    getTurboHiveDeviceStatus: (imeis)    => axios.post('/api/turbohive/devices/status', { imeis }),
    getTraccarDevices:        ()         => axios.get('/api/turbohive/devices'),
    getTurboHiveDeviceDetail: (id)       => axios.get(`/api/turbohive/devices/${id}`),
    importTurboHiveDevice:    (data)     => axios.post('/api/turbohive/devices/import', data),
    deleteTurboHiveDevice:    (id)       => axios.delete(`/api/turbohive/devices/${id}`),
    getTurboHiveVendors:      ()         => axios.get('/api/turbohive/vendors'),
    getTurboHiveModels:       ()         => axios.get('/api/turbohive/models'),

    // ── TurboHive — location & track ────────────────────────────────────────
    getTurboHiveAllLocations:   ()                         => axios.get('/api/turbohive/locations'),
    getLatestPositions:         ()                         => axios.get('/api/turbohive/locations'),
    getTurboHiveDeviceLocation: (imei)                     => axios.get(`/api/turbohive/device/${imei}/location`),
    getTurboHiveBatteryStatus:  (imei)                     => axios.get(`/api/turbohive/device/${imei}/battery`),
    getTurboHiveObdData:        (imei, startTime, endTime, pageSize = 100) => axios.get(`/api/turbohive/device/${imei}/obd`, { params: { startTime, endTime, pageSize } }),
    getTurboHivePositioningBattery: (imeis)                 => axios.get('/api/turbohive/positioning-battery', imeis && imeis.length ? { params: { imeis } } : {}),
    getTurboHiveRealtimeMileage: (params)                   => axios.get('/api/turbohive/mileage/realtime', { params }),
    getTurboHiveTrack:          (imei, startTime, endTime) => axios.get(`/api/turbohive/device/${imei}/track`, { params: { startTime, endTime } }),
    getTurboHiveTrackList:      (imei, startTime, endTime) => axios.get(`/api/turbohive/device/${imei}/track-list`, { params: { startTime, endTime } }),
    getTurboHiveTrips:          (imei, startTime, endTime) => axios.get(`/api/turbohive/device/${imei}/trips`, { params: { startTime, endTime } }),
    getTurboHiveAlerts:         (params)                   => axios.get('/api/turbohive/alerts', { params }),

    // ── TurboHive — commands ────────────────────────────────────────────────
    sendTurboHiveCommand: (imei, content, options = {}) =>
        axios.post('/api/turbohive/command', { imei, content, ...options }),

    // ── TurboHive — video ───────────────────────────────────────────────────
    startTurboHiveVideo:    (imei, channel = 1, dataType = 'audio_video') =>
        axios.post('/api/turbohive/video/start', { imei, channel, dataType }),
    stopTurboHiveVideo:     (imei, channel = 1) =>
        axios.post('/api/turbohive/video/stop', { imei, channel }),
    getTurboHiveVideoFiles: (imei, channel, startTime, endTime) =>
        axios.post('/api/turbohive/video/files', { imei, channel, startTime, endTime }),
    startTurboHivePlayback: (imei, channel, fileNames) =>
        axios.post('/api/turbohive/video/playback/start', { imei, channel, fileNames }),
    stopTurboHivePlayback:  (imei, channel = 1) =>
        axios.post('/api/turbohive/video/playback/stop', { imei, channel }),
    startTurboHiveCapture:  (imei, channel = 1, type = 1, duration = 5) =>
        axios.post('/api/turbohive/video/capture', { imei, channel, type, duration }),

    // ── TurboHive — driver face enrollment (JC171 EVENTSET,FACE/AFIF) ───────
    getDriverFaces:          (params = {})                       => axios.get('/api/turbohive/face', { params }),
    configureFaceRecognition: (imei, similarity, deadlineSeconds = 180, recheckMinutes = 10) =>
        axios.post('/api/turbohive/face/configure', { imei, similarity, deadlineSeconds, recheckMinutes }),
    enrollDriverFace:        (driverId, imei)                    => axios.post('/api/turbohive/face/enroll', { driver_id: driverId, imei }),
    testDriverFace:          (imei)                               => axios.post('/api/turbohive/face/test', { imei }),
    deleteDriverFace:        (driverId, imei)                     => axios.post('/api/turbohive/face/delete', { driver_id: driverId, imei }),
    checkFaceRoster:         (imei)                               => axios.post('/api/turbohive/face/roster', { imei }),
    setFaceUploadUrl:        (imei, url)                          => axios.post('/api/turbohive/face/upload-url', { imei, url }),

    // ── Stubs — Traccar-only features removed; return empty so UI won't crash ──
    getTraccarGroups:             empty,
    getTraccarCalendars:          empty,
    getWsToken:                   empty,
    getAlertEvents:               empty,
    getBatteryReport:             empty,
    getExternalBatteryReport:     empty,
    getFuelConsumptionReport:     empty,
    getCurrentFuel:               empty,
    getFuelCurveReport:           empty,
    getRefuellingReport:          empty,
    getAbnormalFuelLossReport:    empty,
    getIdleFuelReport:            empty,
    getFuelRankingReport:         empty,
    getTemperatureHumidityReport: empty,
    getPositioningBatteryReport:  empty,
    getTravelStatisticsReport:    empty,
    getMileageReport:             empty,
    getTripsDetailReport:         empty,
    getOverspeedReport:           empty,
    getParkingReport:             empty,
    getIdlingReport:              empty,
    getIgnitionReport:            empty,
    getGeofenceReport:            empty,
    getOnlineDevicesReport:       empty,
    getOfflineDevicesReport:      empty,
    getDevicePosition:            empty,
    getRouteHistory:              empty,
    getTripsReport:               empty,
    exportTripsReport:            empty,
    getGeofences:                 ()         => axios.get('/api/geofences'),
    createGeofence:               (data)     => axios.post('/api/geofences', data),
    updateGeofence:               (id, data) => axios.put(`/api/geofences/${id}`, data),
    deleteGeofence:               (id)       => axios.delete(`/api/geofences/${id}`),
    linkGeofenceDevice:           (id, imei) => axios.post(`/api/geofences/${id}/devices`, { imei }),
    unlinkGeofenceDevice:         (id, imei) => axios.delete(`/api/geofences/${id}/devices/${imei}`),
    getTraccarNotifications:      empty,
    getTraccarDrivers:            empty,
    getDeviceConnections:         empty,
    linkDeviceConnection:         empty,
    unlinkDeviceConnection:       empty,
    getNotificationTypes:         empty,
    getNotificators:              empty,
    testNotificationChannels:     empty,
    getCommands:                  empty,
    getNotification:              empty,
    createNotification:           empty,
    updateNotification:           empty,
    deleteNotification:           empty,
    getNotificationDevices:       empty,
    createCalendar:               empty,
    updateCalendar:               empty,
    deleteCalendar:               empty,
    getComputedAttributes:        empty,
    createComputedAttribute:      empty,
    updateComputedAttribute:      empty,
    deleteComputedAttribute:      empty,
    testComputedAttribute:        empty,
    getMaintenances:              empty,
    createMaintenance:            empty,
    updateMaintenance:            empty,
    deleteMaintenance:            empty,
    getCommandTypes:              empty,
    createSavedCommand:           empty,
    updateSavedCommand:           empty,
    deleteSavedCommand:           empty,
    createGroup:                  empty,
    updateGroup:                  empty,
    deleteGroup:                  empty,
    getGroupConnections:          empty,
    linkGroupConnection:          empty,
    unlinkGroupConnection:        empty,
    createTraccarDevice:          empty,
    updateTraccarDevice:          empty,
    createDriver:                 empty,
    updateDriver:                 empty,
    deleteDriver:                 empty,
};
