import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const fieldLabelStyle = { display: 'block', fontSize: 11.5, color: '#6b7280', fontWeight: 600, marginBottom: 6 };
const inputStyle  = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', color: '#111827' };
const selectStyle = { ...inputStyle, background: '#fff', cursor: 'pointer', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%23999\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' };

function Field({ label, hint, children }) {
    return (
        <div style={{ marginBottom: 16 }}>
            <label style={fieldLabelStyle}>{label}</label>
            {children}
            {hint && <p style={{ margin: '5px 2px 0', fontSize: 11.5, color: '#9ca3af', lineHeight: 1.4 }}>{hint}</p>}
        </div>
    );
}

/* ── error codes TurboHive's /v3/devices/import/single returns ─ */
const ERROR_HINTS = {
    2002: 'A device with this IMEI is already in your account.',
    2006: 'That model was not found for the selected vendor.',
    2009: 'Device vendor not found.',
    4001: 'Device quota exceeded — your account has reached its device limit.',
    1202: 'IMEI, Vendor and Model are required.',
    1203: 'IMEI format is invalid.',
};

/* ── main modal — imports a device already provisioned by the vendor into this account ── */
export default function ImportDeviceModal({ onClose, onCreated }) {
    const [vendors, setVendors] = useState([]);
    const [models,  setModels]  = useState([]);
    const [loadingCatalog, setLoadingCatalog] = useState(true);

    const [imei,         setImei]         = useState('');
    const [vendorCode,   setVendorCode]   = useState('');
    const [modelCode,    setModelCode]    = useState('');
    const [deviceName,   setDeviceName]   = useState('');
    const [error,        setError]        = useState('');
    const [saving,       setSaving]       = useState(false);

    useEffect(() => {
        Promise.all([api.getTurboHiveVendors(), api.getTurboHiveModels()])
            .then(([v, m]) => {
                setVendors(Array.isArray(v.data) ? v.data : []);
                setModels(Array.isArray(m.data) ? m.data : []);
            })
            .catch(() => setError('Failed to load vendor/model catalog.'))
            .finally(() => setLoadingCatalog(false));
    }, []);

    const selectedVendor = vendors.find(v => v.vendorCode === vendorCode);
    const modelsForVendor = useMemo(
        () => models.filter(m => !selectedVendor || m.vendorId === selectedVendor.id),
        [models, selectedVendor]
    );
    const selectedModel = modelsForVendor.find(m => m.modelCode === modelCode);

    const handleVendorChange = (code) => {
        setVendorCode(code);
        setModelCode('');
    };

    const handleSubmit = async () => {
        setError('');
        if (!imei.trim() || !vendorCode || !modelCode) {
            setError('IMEI, Vendor and Model are required.');
            return;
        }
        setSaving(true);
        try {
            const { data } = await api.importTurboHiveDevice({
                imei:         imei.trim(),
                manufacturer: vendorCode,
                model:        modelCode,
                deviceName:   deviceName.trim() || undefined,
                deviceType:   selectedModel?.deviceType || undefined,
                protocol:     selectedModel?.protocol || undefined,
            });
            if (data?.code !== 1000) {
                setError(ERROR_HINTS[data?.code] || data?.message || 'Failed to import device.');
                return;
            }
            onCreated?.();
            onClose();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to import device.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
            <div style={{ background: '#fff', borderRadius: 10, width: 440, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Import Device</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 22, lineHeight: 1 }}>×</button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                    {loadingCatalog ? (
                        <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '24px 0' }}>Loading vendor/model catalog…</p>
                    ) : (
                        <>
                            <Field label="IMEI" hint="The IMEI printed on the device — must match what it reports to TurboHive.">
                                <input value={imei} onChange={e => setImei(e.target.value)} placeholder="e.g. 863800080017899" style={inputStyle} />
                            </Field>

                            <Field label="Vendor">
                                <select value={vendorCode} onChange={e => handleVendorChange(e.target.value)} style={selectStyle}>
                                    <option value="">Select vendor…</option>
                                    {vendors.map(v => <option key={v.id} value={v.vendorCode}>{v.vendorName}</option>)}
                                </select>
                            </Field>

                            <Field label="Model">
                                <select value={modelCode} onChange={e => setModelCode(e.target.value)} disabled={!vendorCode} style={selectStyle}>
                                    <option value="">{vendorCode ? 'Select model…' : 'Select a vendor first'}</option>
                                    {modelsForVendor.map(m => <option key={m.id} value={m.modelCode}>{m.modelName}</option>)}
                                </select>
                            </Field>

                            {selectedModel && (
                                <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 12, color: '#6b7280' }}>
                                    <span>Type: <strong style={{ color: '#374151' }}>{selectedModel.deviceType || '—'}</strong></span>
                                    <span>Protocol: <strong style={{ color: '#374151' }}>{selectedModel.protocol || '—'}</strong></span>
                                </div>
                            )}

                            <Field label="Device Name" hint="Optional — a friendly name for this device.">
                                <input value={deviceName} onChange={e => setDeviceName(e.target.value)} placeholder="e.g. Truck 12" style={inputStyle} />
                            </Field>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
                    <span style={{ flex: 1, fontSize: 12.5, color: '#ef4444' }}>{error}</span>
                    <button onClick={onClose} style={{ padding: '8px 22px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>Cancel</button>
                    <button onClick={handleSubmit} disabled={saving || loadingCatalog}
                        style={{ padding: '8px 22px', border: 'none', borderRadius: 8, background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600, cursor: (saving || loadingCatalog) ? 'not-allowed' : 'pointer', opacity: (saving || loadingCatalog) ? 0.7 : 1 }}>
                        {saving ? 'Importing…' : 'Import'}
                    </button>
                </div>
            </div>
        </div>
    );
}
