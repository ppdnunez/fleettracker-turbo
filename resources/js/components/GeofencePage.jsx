import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { api } from '../api.js';

const CENTER = [14.5995, 120.9842];
const SHAPE_STYLE = { color: '#3b82f6', weight: 2, fillOpacity: 0.15 };
const SHAPE_STYLE_SELECTED = { color: '#f59e0b', weight: 3, fillOpacity: 0.25 };

/* ── Traccar's WKT subset (CIRCLE / POLYGON / LINESTRING) <-> Leaflet geometry ── */
function areaToShape(area) {
    if (!area) return null;
    let m = area.match(/^CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/i);
    if (m) return { type: 'circle', center: [Number(m[1]), Number(m[2])], radius: Number(m[3]) };

    m = area.match(/^POLYGON\s*\(\(([^)]+)\)\)$/i);
    if (m) return { type: 'polygon', points: m[1].split(',').map(p => p.trim().split(/\s+/).map(Number)) };

    m = area.match(/^LINESTRING\s*\(([^)]+)\)$/i);
    if (m) return { type: 'polyline', points: m[1].split(',').map(p => p.trim().split(/\s+/).map(Number)) };

    return null;
}

function shapeToLayer(shape, style) {
    if (shape.type === 'circle')   return L.circle(shape.center, { radius: shape.radius, ...style });
    if (shape.type === 'polygon')  return L.polygon(shape.points, style);
    if (shape.type === 'polyline') return L.polyline(shape.points, style);
    return null;
}

function layerToArea(layer) {
    if (layer instanceof L.Circle) {
        const c = layer.getLatLng();
        return `CIRCLE (${c.lat} ${c.lng}, ${Math.round(layer.getRadius())})`;
    }
    if (layer instanceof L.Polygon) {
        const ring = layer.getLatLngs()[0];
        const closed = [...ring, ring[0]];
        return `POLYGON ((${closed.map(p => `${p.lat} ${p.lng}`).join(', ')}))`;
    }
    if (layer instanceof L.Polyline) {
        return `LINESTRING (${layer.getLatLngs().map(p => `${p.lat} ${p.lng}`).join(', ')})`;
    }
    return null;
}

const TOOLS = [
    { key: 'polygon',  label: 'Polygon', icon: '▱' },
    { key: 'circle',   label: 'Circle',  icon: '◯' },
    { key: 'delete',   label: 'Delete',  icon: '🗑' },
];

/* ── Lives inside the MapContainer: draw toolbar + rendering existing geofences ── */
function DrawLayer({ geofences, selectedId, editingId, onCreate, onEditSave, onEditCancel, onDeleteShape }) {
    const map = useMap();
    const [ready, setReady] = useState(false);
    const [activeTool, setActiveTool] = useState(null);
    const [pending, setPending] = useState(null); // { layer, area }
    const [pendingName, setPendingName] = useState('');

    const groupRef     = useRef(null);
    const layersById    = useRef({});
    const deleteModeRef = useRef(false);
    const handlerRef    = useRef(null);

    // leaflet-draw expects a global `window.L` at the moment it's evaluated. A dynamic
    // import (unlike a static one) runs exactly where it's written, so this guarantees
    // window.L is set first regardless of how the bundler orders static imports.
    useEffect(() => {
        window.L = L;
        import('leaflet-draw').then(() => setReady(true));
    }, []);

    useEffect(() => {
        if (!ready) return;
        const group = L.featureGroup().addTo(map);
        groupRef.current = group;

        const onCreated = (e) => {
            setActiveTool(null);
            const area = layerToArea(e.layer);
            e.layer.addTo(map);
            setPending({ layer: e.layer, area });
            setPendingName('New geofence');
        };
        map.on(L.Draw.Event.CREATED, onCreated);
        return () => {
            map.off(L.Draw.Event.CREATED, onCreated);
            map.removeLayer(group);
        };
    }, [ready, map]);

    useEffect(() => { deleteModeRef.current = activeTool === 'delete'; }, [activeTool]);

    // Keep rendered shapes in sync with the geofence list
    useEffect(() => {
        if (!ready || !groupRef.current) return;
        groupRef.current.clearLayers();
        layersById.current = {};
        geofences.forEach(g => {
            const shape = areaToShape(g.area);
            if (!shape) return;
            const style = g.id === selectedId ? SHAPE_STYLE_SELECTED : SHAPE_STYLE;
            const layer = shapeToLayer(shape, style);
            if (!layer) return;
            layer.bindTooltip(g.name);
            layer.on('click', () => { if (deleteModeRef.current) onDeleteShape(g.id); });
            layer.addTo(groupRef.current);
            layersById.current[g.id] = layer;
        });
    }, [ready, geofences, selectedId]);

    // Fly to the selected geofence
    useEffect(() => {
        if (!selectedId) return;
        const layer = layersById.current[selectedId];
        if (!layer) return;
        if (layer.getBounds) map.fitBounds(layer.getBounds(), { maxZoom: 17 });
        else if (layer.getLatLng) map.setView(layer.getLatLng(), Math.max(map.getZoom(), 15));
    }, [selectedId]);

    // Live vertex/radius editing for the geofence being edited
    useEffect(() => {
        if (!ready || !editingId) return;
        const layer = layersById.current[editingId];
        if (!layer?.editing) return;
        layer.editing.enable();
        return () => layer.editing?.disable();
    }, [ready, editingId]);

    const startTool = (tool) => {
        if (!ready) return;
        handlerRef.current?.disable?.();
        if (activeTool === tool) { setActiveTool(null); return; }
        setActiveTool(tool);
        if (tool === 'delete') return;
        const Handler = { circle: L.Draw.Circle, polygon: L.Draw.Polygon, polyline: L.Draw.Polyline }[tool];
        handlerRef.current = new Handler(map, { shapeOptions: SHAPE_STYLE });
        handlerRef.current.enable();
    };

    const confirmPending = async () => {
        if (!pending) return;
        map.removeLayer(pending.layer);
        await onCreate(pendingName.trim() || 'New geofence', pending.area);
        setPending(null);
    };
    const cancelPending = () => {
        if (pending) map.removeLayer(pending.layer);
        setPending(null);
    };

    const saveEdit = () => {
        const layer = layersById.current[editingId];
        if (layer) onEditSave(editingId, layerToArea(layer));
    };

    return (
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {TOOLS.map(t => (
                    <button key={t.key} title={t.label} disabled={!ready} onClick={() => startTool(t.key)}
                        style={{
                            width: 32, height: 32, fontSize: 15, lineHeight: 1,
                            border: activeTool === t.key ? '1.5px solid #3b82f6' : '1px solid #e2e8f0',
                            borderRadius: 6, background: activeTool === t.key ? '#eff6ff' : '#fff',
                            cursor: ready ? 'pointer' : 'not-allowed', color: t.key === 'delete' ? '#ef4444' : '#374151',
                        }}>
                        {t.icon}
                    </button>
                ))}
            </div>

            {pending && (
                <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', padding: 10, width: 200 }}>
                    <label style={{ display: 'block', fontSize: 11.5, color: '#6b7280', fontWeight: 600, marginBottom: 4 }}>Geofence name</label>
                    <input autoFocus value={pendingName} onChange={e => setPendingName(e.target.value)}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, outline: 'none', marginBottom: 8 }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={confirmPending} style={{ flex: 1, padding: '6px 0', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                        <button onClick={cancelPending} style={{ flex: 1, padding: '6px 0', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
                    </div>
                </div>
            )}

            {editingId && (
                <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', padding: 10, width: 200, fontSize: 12 }}>
                    <p style={{ margin: '0 0 8px', color: '#374151' }}>Drag the shape to edit it, then save.</p>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={saveEdit} style={{ flex: 1, padding: '6px 0', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                        <button onClick={onEditCancel} style={{ flex: 1, padding: '6px 0', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
                    </div>
                </div>
            )}

            {activeTool === 'delete' && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px', width: 200, fontSize: 12, color: '#991b1b' }}>
                    Click a shape on the map to delete it.
                </div>
            )}
        </div>
    );
}

/* ── Root export ───────────────────────────────────────────────── */
export default function GeofencePage({ onBack }) {
    const [geofences, setGeofences] = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [selectedId, setSelectedId] = useState(null);
    const [editingId,  setEditingId]  = useState(null);
    const [error,      setError]      = useState('');
    const [pendingDeleteId, setPendingDeleteId] = useState(null);
    const [devices,    setDevices]    = useState([]);
    const [linking,    setLinking]    = useState(null); // imei currently being toggled

    const fetchGeofences = async () => {
        try {
            const res = await api.getGeofences();
            setGeofences(res.data);
        } catch (e) {
            setError('Failed to load geofences.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGeofences();
        api.getTurboHiveTrackableDevices({ page: 1, size: 100 })
            .then(res => setDevices(res.data?.data ?? []))
            .catch(() => setDevices([]));
    }, []);

    // Mirrors Traccar's separate /api/permissions step — a geofence is only checked against
    // devices explicitly linked here (see GeofenceController::linkDevice/unlinkDevice).
    const toggleLink = async (geofenceId, imei, currentlyLinked) => {
        setLinking(imei);
        try {
            if (currentlyLinked) await api.unlinkGeofenceDevice(geofenceId, imei);
            else await api.linkGeofenceDevice(geofenceId, imei);
            await fetchGeofences();
        } catch (e) {
            setError('Failed to update device link.');
        } finally {
            setLinking(null);
        }
    };

    const handleCreate = async (name, area) => {
        try {
            await api.createGeofence({ name, area });
            await fetchGeofences();
        } catch (e) {
            setError('Failed to create geofence.');
        }
    };

    const handleEditSave = async (id, area) => {
        const g = geofences.find(g => g.id === id);
        if (!g) return;
        try {
            await api.updateGeofence(id, { name: g.name, area });
            setEditingId(null);
            await fetchGeofences();
        } catch (e) {
            setError('Failed to update geofence.');
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.deleteGeofence(id);
            if (selectedId === id) setSelectedId(null);
            if (editingId === id) setEditingId(null);
            await fetchGeofences();
        } catch (e) {
            setError('Failed to delete geofence.');
        }
    };

    const requestDelete = (id) => setPendingDeleteId(id);
    const confirmDelete = async () => {
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        if (id != null) await handleDelete(id);
    };

    return (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left panel */}
            <div style={{ width: 280, minWidth: 280, display: 'flex', flexDirection: 'column', background: '#fff', borderRight: '1px solid #e2e8f0' }}>
                <div style={{ height: 58, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                    <button onClick={onBack} title="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151', fontSize: 18, display: 'flex' }}>←</button>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Geofences</h2>
                </div>

                {error && (
                    <div style={{ margin: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
                        {error}
                    </div>
                )}

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading ? (
                        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 24 }}>Loading…</p>
                    ) : geofences.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 24 }}>No geofences yet. Draw one on the map to get started.</p>
                    ) : geofences.map(g => (
                        <div key={g.id} onClick={() => setSelectedId(g.id)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', background: selectedId === g.id ? '#eff6ff' : 'transparent' }}>
                            <span style={{ fontSize: 13.5, fontWeight: 500, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                <button onClick={e => { e.stopPropagation(); setSelectedId(g.id); setEditingId(g.id); }} title="Edit"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4 }}>✏</button>
                                <button onClick={e => { e.stopPropagation(); requestDelete(g.id); }} title="Delete"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>🗑</button>
                            </div>
                        </div>
                    ))}
                </div>

                {selectedId && (() => {
                    const selected = geofences.find(g => g.id === selectedId);
                    const linkedImeis = selected?.imeis ?? [];
                    return (
                        <div style={{ borderTop: '1px solid #e2e8f0', flexShrink: 0, maxHeight: 240, display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '10px 16px 6px', fontSize: 12, fontWeight: 700, color: '#374151' }}>
                                Linked Devices — {selected?.name}
                            </div>
                            <div style={{ overflowY: 'auto', padding: '0 8px 10px' }}>
                                {devices.length === 0 ? (
                                    <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: 12 }}>No TurboHive devices found.</p>
                                ) : devices.map(d => {
                                    const isLinked = linkedImeis.includes(d.imei);
                                    return (
                                        <label key={d.imei}
                                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: linking === d.imei ? 'default' : 'pointer', fontSize: 12.5, color: '#374151', opacity: linking === d.imei ? 0.6 : 1 }}>
                                            <input type="checkbox" checked={isLinked} disabled={linking === d.imei}
                                                onChange={() => toggleLink(selectedId, d.imei, isLinked)} />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.deviceName ?? d.imei}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* Map */}
            <div style={{ flex: 1, position: 'relative' }}>
                <MapContainer center={CENTER} zoom={13} style={{ width: '100%', height: '100%' }} scrollWheelZoom zoomControl={false}>
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <ZoomControl position="topright" />
                    <DrawLayer
                        geofences={geofences}
                        selectedId={selectedId}
                        editingId={editingId}
                        onCreate={handleCreate}
                        onEditSave={handleEditSave}
                        onEditCancel={() => setEditingId(null)}
                        onDeleteShape={requestDelete}
                    />
                </MapContainer>

                {pendingDeleteId && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                        <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                            <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Delete geofence?</h3>
                            <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748b' }}>
                                "{geofences.find(g => g.id === pendingDeleteId)?.name}" will be permanently removed.
                            </p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => setPendingDeleteId(null)} style={{ flex: 1, padding: 9, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                <button onClick={confirmDelete} style={{ flex: 1, padding: 9, borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
