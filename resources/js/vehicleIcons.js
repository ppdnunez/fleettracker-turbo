// Shared vehicle-type catalog — used by the Vehicle Settings dropdown (FleetPage.jsx), the map pin
// markers (MapCanvas.jsx), and the device list sidebar icons (DeviceList.jsx), so all three stay
// in sync off one source of truth. `vehicle_type` lives on `vehicle_settings` (nullable — a
// vehicle without one set falls back to the default pin/icon everywhere).
export const VEHICLE_TYPES = [
    { value: 'car',        label: 'Car',        emoji: '🚗' },
    { value: 'suv',        label: 'SUV',        emoji: '🚙' },
    { value: 'truck',      label: 'Truck',      emoji: '🚚' },
    { value: 'van',        label: 'Van',        emoji: '🚐' },
    { value: 'bus',        label: 'Bus',        emoji: '🚌' },
    { value: 'motorcycle', label: 'Motorcycle', emoji: '🏍️' },
];

export function vehicleTypeEmoji(vehicleType) {
    return VEHICLE_TYPES.find(t => t.value === vehicleType)?.emoji ?? null;
}

/**
 * SVG markup for a map pin's inner glyph — the same emoji shown in the Vehicle Settings dropdown,
 * rendered via an SVG <text> node so it matches exactly rather than an approximated vector
 * silhouette (an earlier version tried hand-drawn shapes here; too small/abstract to read on the
 * actual map, so this renders the literal emoji character instead). Returns `null` for an
 * unset/unrecognized type so the caller can fall back to its own default (arrow/dot).
 */
export function vehicleGlyphSvg(vehicleType) {
    const emoji = vehicleTypeEmoji(vehicleType);
    if (!emoji) return null;
    return `<text x="12" y="13" font-size="13" text-anchor="middle" dominant-baseline="central">${emoji}</text>`;
}
