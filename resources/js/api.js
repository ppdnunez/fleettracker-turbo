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

export const api = {
    login:   (email, password) => axios.post('/api/login', { email, password }),
    logout:  ()                => axios.post('/api/logout'),
    me:      ()                => axios.get('/api/user'),

    getDevices:   ()          => axios.get('/api/devices'),
    createDevice: (data)      => axios.post('/api/devices', data),
    updateDevice: (id, data)  => axios.put(`/api/devices/${id}`, data),
    deleteDevice: (id)        => axios.delete(`/api/devices/${id}`),

    getFleetDrivers:    ()         => axios.get('/api/drivers'),
    createFleetDriver:  (data)     => axios.post('/api/drivers', data),
    updateFleetDriver:  (id, data) => axios.put(`/api/drivers/${id}`, data),
    deleteFleetDriver:  (id)       => axios.delete(`/api/drivers/${id}`),

    getTraccarDevices:    ()             => axios.get('/api/traccar/devices'),
    createTraccarDevice:  (data)         => axios.post('/api/traccar/devices', data),
    updateTraccarDevice:  (id, data)     => axios.put(`/api/traccar/devices/${id}`, data),
    getTraccarGroups:     ()             => axios.get('/api/traccar/groups'),
    getTraccarCalendars:  ()             => axios.get('/api/traccar/calendars'),
    getLatestPositions:   ()             => axios.get('/api/traccar/positions'),
    getWsToken:           ()             => axios.get('/api/traccar/ws-token'),
    getAlertEvents:       (params)       => axios.get('/api/traccar/reports/events', { params }),
    getBatteryReport:         (params)   => axios.get('/api/traccar/reports/battery', { params }),
    getExternalBatteryReport: (params)   => axios.get('/api/traccar/reports/external-battery', { params }),
    getFuelConsumptionReport: (params)   => axios.get('/api/traccar/reports/fuel', { params }),
    getCurrentFuel:           (params)   => axios.get('/api/traccar/reports/current-fuel', { params }),
    getFuelCurveReport:       (params)   => axios.get('/api/traccar/reports/fuel-curve', { params }),
    getRefuellingReport:      (params)   => axios.get('/api/traccar/reports/fuel-refuelling', { params }),
    getAbnormalFuelLossReport:(params)   => axios.get('/api/traccar/reports/fuel-abnormal-loss', { params }),
    getIdleFuelReport:        (params)   => axios.get('/api/traccar/reports/fuel-idle', { params }),
    getFuelRankingReport:     (params)   => axios.get('/api/traccar/reports/fuel-ranking', { params }),
    getTemperatureHumidityReport: (params) => axios.get('/api/traccar/reports/temperature', { params }),
    getPositioningBatteryReport: (params) => axios.get('/api/traccar/reports/positioning', { params }),
    getTravelStatisticsReport: (params) => axios.get('/api/traccar/reports/travel', { params }),
    getMileageReport: (params) => axios.get('/api/traccar/reports/mileage', { params }),
    getTripsDetailReport: (params) => axios.get('/api/traccar/reports/trips-detail', { params }),
    getOverspeedReport: (params) => axios.get('/api/traccar/reports/overspeed', { params }),
    getParkingReport: (params) => axios.get('/api/traccar/reports/parking', { params }),
    getIdlingReport: (params) => axios.get('/api/traccar/reports/idling', { params }),
    getIgnitionReport: (params) => axios.get('/api/traccar/reports/ignition', { params }),
    getGeofenceReport: (params) => axios.get('/api/traccar/reports/geofence', { params }),
    getOnlineDevicesReport: () => axios.get('/api/traccar/reports/online'),
    getOfflineDevicesReport: () => axios.get('/api/traccar/reports/offline'),
    getDevicePosition:    (id)           => axios.get(`/api/traccar/devices/${id}/position`),
    getRouteHistory:      (id, from, to) => axios.get(`/api/traccar/devices/${id}/route`, { params: { from, to } }),
    getTripsReport:       (id, from, to) => axios.get(`/api/traccar/devices/${id}/trips`, { params: { from, to } }),
    exportTripsReport:    (id, from, to) => axios.get(`/api/traccar/devices/${id}/trips/export`, { params: { from, to }, responseType: 'blob' }),

    getGeofences:   ()         => axios.get('/api/traccar/geofences'),
    createGeofence: (data)     => axios.post('/api/traccar/geofences', data),
    updateGeofence: (id, data) => axios.put(`/api/traccar/geofences/${id}`, data),
    deleteGeofence: (id)       => axios.delete(`/api/traccar/geofences/${id}`),

    getTraccarNotifications: ()       => axios.get('/api/traccar/notifications'),
    getTraccarDrivers:       ()       => axios.get('/api/traccar/drivers'),
    getDeviceConnections:    (id)     => axios.get(`/api/traccar/devices/${id}/connections`),
    linkDeviceConnection:    (id, type, connId)   => axios.post(`/api/traccar/devices/${id}/connections`, { type, id: connId }),
    unlinkDeviceConnection:  (id, type, connId)   => axios.delete(`/api/traccar/devices/${id}/connections`, { data: { type, id: connId } }),

    getNotificationTypes:   ()         => axios.get('/api/traccar/notifications/types'),
    getNotificators:        ()         => axios.get('/api/traccar/notifications/notificators'),
    testNotificationChannels: (channels) => axios.post('/api/traccar/notifications/test', { channels }),
    getCommands:            ()         => axios.get('/api/traccar/commands'),
    getNotification:        (id)       => axios.get(`/api/traccar/notifications/${id}`),
    createNotification:     (data)     => axios.post('/api/traccar/notifications', data),
    updateNotification:     (id, data) => axios.put(`/api/traccar/notifications/${id}`, data),
    deleteNotification:     (id)       => axios.delete(`/api/traccar/notifications/${id}`),
    getNotificationDevices: (id)       => axios.get(`/api/traccar/notifications/${id}/devices`),

    createCalendar: (data)     => axios.post('/api/traccar/calendars', data),
    updateCalendar: (id, data) => axios.put(`/api/traccar/calendars/${id}`, data),
    deleteCalendar: (id)       => axios.delete(`/api/traccar/calendars/${id}`),

    getComputedAttributes:    ()         => axios.get('/api/traccar/attributes/computed'),
    createComputedAttribute:  (data)     => axios.post('/api/traccar/attributes/computed', data),
    updateComputedAttribute:  (id, data) => axios.put(`/api/traccar/attributes/computed/${id}`, data),
    deleteComputedAttribute:  (id)       => axios.delete(`/api/traccar/attributes/computed/${id}`),
    testComputedAttribute:    (data)     => axios.post('/api/traccar/attributes/computed/test', data),

    getMaintenances:   ()         => axios.get('/api/traccar/maintenance'),
    createMaintenance: (data)     => axios.post('/api/traccar/maintenance', data),
    updateMaintenance: (id, data) => axios.put(`/api/traccar/maintenance/${id}`, data),
    deleteMaintenance: (id)       => axios.delete(`/api/traccar/maintenance/${id}`),

    getCommandTypes:    ()         => axios.get('/api/traccar/commands/types'),
    createSavedCommand: (data)     => axios.post('/api/traccar/commands', data),
    updateSavedCommand: (id, data) => axios.put(`/api/traccar/commands/${id}`, data),
    deleteSavedCommand: (id)       => axios.delete(`/api/traccar/commands/${id}`),

    createGroup: (data)     => axios.post('/api/traccar/groups', data),
    updateGroup: (id, data) => axios.put(`/api/traccar/groups/${id}`, data),
    deleteGroup: (id)       => axios.delete(`/api/traccar/groups/${id}`),
    getGroupConnections:   (id)               => axios.get(`/api/traccar/groups/${id}/connections`),
    linkGroupConnection:   (id, type, connId) => axios.post(`/api/traccar/groups/${id}/connections`, { type, id: connId }),
    unlinkGroupConnection: (id, type, connId) => axios.delete(`/api/traccar/groups/${id}/connections`, { data: { type, id: connId } }),

    createDriver: (data)     => axios.post('/api/traccar/drivers', data),
    updateDriver: (id, data) => axios.put(`/api/traccar/drivers/${id}`, data),
    deleteDriver: (id)       => axios.delete(`/api/traccar/drivers/${id}`),
};
