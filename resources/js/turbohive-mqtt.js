import mqtt from 'mqtt';

// Only VITE_GPS_PROVIDER is exposed to the bundle — MQTT credentials come from the backend.
export const turboHiveEnabled = import.meta.env.VITE_GPS_PROVIDER?.toLowerCase() === 'turbohive';

/**
 * Open a WebSocket MQTT connection to the TurboHive broker.
 *
 * @param {object}   config            Fetched from GET /api/turbohive/mqtt-config
 * @param {Function} onLocation        Called with a parsed location object on each GNSS message
 * @param {Function} onError           Called on MQTT errors
 * @param {Function} onStatusChange    Called with (true/false) on connect / disconnect
 */
export function connectTurboHiveMqtt(config, onLocation, onError = () => {}, onStatusChange = () => {}) {
    if (!config?.url) {
        console.warn('[TurboHive MQTT] No broker URL in config — check TURBOHIVE_MQTT_URL in .env');
        return null;
    }

    const topic = config.topicPrefix ?? `${config.userId ?? '+'}/location/gnss/#`;

    console.info(`[TurboHive MQTT] Connecting to ${config.url} as ${config.username} | topic: ${topic}`);

    const client = mqtt.connect(config.url, {
        clientId:        `fleettracker-${Math.floor(Math.random() * 1_000_000)}`,
        username:        config.username,
        password:        config.password,
        keepalive:       30,
        reconnectPeriod: 5000,
        connectTimeout:  10_000,
        clean:           true,
    });

    client.on('connect', () => {
        console.info('[TurboHive MQTT] Connected ✓');
        onStatusChange(true);
        client.subscribe(topic, { qos: 0 }, (err) => {
            if (err) {
                console.error('[TurboHive MQTT] Subscribe error:', err);
                onError(err);
            } else {
                console.info(`[TurboHive MQTT] Subscribed to ${topic}`);
            }
        });
    });

    client.on('reconnect',  () => { console.info('[TurboHive MQTT] Reconnecting…'); onStatusChange(false); });
    client.on('offline',    () => { console.warn('[TurboHive MQTT] Offline');        onStatusChange(false); });
    client.on('disconnect', () => { console.warn('[TurboHive MQTT] Disconnected');   onStatusChange(false); });

    client.on('message', (topic, payload) => {
        const location = parseTurboHiveMqttMessage(topic, payload);
        if (location) onLocation(location);
    });

    client.on('error', (err) => {
        console.error('[TurboHive MQTT] Error:', err?.message ?? err);
        onError(err);
        onStatusChange(false);
    });

    return client;
}

export function parseTurboHiveMqttMessage(topic, payload) {
    let message;
    try {
        message = JSON.parse(payload.toString());
    } catch {
        return null;
    }

    const deviceKey = String(
        message.imei ??
        message.deviceId ??
        message.uniqueId ??
        message.tracker ??
        extractDeviceKeyFromTopic(topic) ??
        ''
    );

    const latitude  = message.latitude  ?? message.lat ?? message.lat_gps  ?? message.gnss?.latitude  ?? message.gnss?.lat  ?? message.coords?.latitude  ?? message.coords?.lat;
    const longitude = message.longitude ?? message.lng ?? message.lon ?? message.long ?? message.gnss?.longitude ?? message.gnss?.lng ?? message.gnss?.lon ?? message.coords?.longitude ?? message.coords?.lng;

    if (!deviceKey || latitude == null || longitude == null) return null;

    return {
        deviceKey,
        latitude,
        longitude,
        speed:      message.speed      ?? message.spd       ?? message.Speed      ?? null,
        heading:    message.heading    ?? message.course     ?? message.direction  ?? message.angle ?? message.gnss?.heading ?? null,
        acc:        message.acc        ?? message.ignition   ?? message.attributes?.ignition ?? null,
        altitude:   message.altitude   ?? message.alt        ?? message.gnss?.altitude ?? null,
        deviceTime: message.deviceTime ?? message.gpsTime    ?? message.time       ?? message.timestamp ?? null,
        signal:     message.batteryLevel ?? message.battery ?? message.rssi ?? message.signal ?? message.attributes?.batteryLevel ?? message.attributes?.rssi,
        raw: message,
        topic,
    };
}

function extractDeviceKeyFromTopic(topic) {
    const parts = topic.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : null;
}

export function applyTurboHivePosition(devices, location) {
    if (!location) return devices;
    return devices.map((device) => {
        const deviceKey = String(device.imei ?? device.uniqueId ?? device.identifier ?? device.tracker ?? device.id ?? '');
        if (!deviceKey || deviceKey !== location.deviceKey) return device;

        return {
            ...device,
            lat:        location.latitude,
            lng:        location.longitude,
            speed:      location.speed   ?? device.speed,
            heading:    location.heading ?? device.heading,
            acc:        location.acc     ?? device.acc,
            altitude:   location.altitude ?? device.altitude,
            lastUpdate: location.deviceTime ?? new Date().toISOString(),
            signal:     location.signal  ?? device.signal ?? 0,
            status:     'ONLINE',
        };
    });
}
