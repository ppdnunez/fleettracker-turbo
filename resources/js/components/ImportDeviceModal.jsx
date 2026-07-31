import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const fieldLabelStyleFor = (dark) => ({ display: 'block', fontSize: 11.5, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600, marginBottom: 6 });
const inputStyleFor  = (dark) => ({ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 8, fontSize: 14, outline: 'none', color: dark ? '#e2e8f0' : '#111827', background: dark ? '#1e293b' : '#fff' });
const selectStyleFor = (dark) => ({ ...inputStyleFor(dark), cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23999'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' });

function Field({ label, hint, children, dark }) {
    return (
        <div style={{ marginBottom: 16 }}>
            <label style={fieldLabelStyleFor(dark)}>{label}</label>
            {children}
            {hint && <p style={{ margin: '5px 2px 0', fontSize: 11.5, color: dark ? '#64748b' : '#9ca3af', lineHeight: 1.4 }}>{hint}</p>}
        </div>
    );
}

/* ── every error code documented for POST /v3/devices/import/single ─ */
const ERROR_HINTS = {
    1101: 'You are not authenticated — try signing in again.',
    1202: 'IMEI, Vendor and Model are required.',
    1203: 'IMEI format is invalid — it must be digits only.',
    1204: 'A field value is out of the allowed range.',
    2002: 'A device with this IMEI is already in your account.',
    2006: 'That model was not found for the selected vendor.',
    2009: 'Device vendor not found.',
    2010: 'Invalid device type for the selected model.',
    2026: 'Private deployment accounts are not allowed to add devices.',
    4001: 'Device quota exceeded — your account has reached its device limit.',
    4005: 'Your account quota has not been initialized yet — contact support.',
    4007: 'Failed to update your device quota — try again.',
};

/* ── field constraints per the documented request schema ─ */
const IMEI_PATTERN = /^\d*$/;
const IMEI_MAX_LEN = 25;
const NAME_MAX_LEN = 50;

/* ── main modal — imports a device already provisioned by the vendor into this account ── */
export default function ImportDeviceModal({ onClose, onCreated, dark }) {
    const [vendors, setVendors] = useState([]);
    const [models,  setModels]  = useState([]);
    const [loadingCatalog, setLoadingCatalog] = useState(true);
    const inputStyle  = inputStyleFor(dark);
    const selectStyle = selectStyleFor(dark);

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
        if (!IMEI_PATTERN.test(imei.trim()) || imei.trim().length > IMEI_MAX_LEN) {
            setError(`IMEI must be digits only, up to ${IMEI_MAX_LEN} characters.`);
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
            <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 10, width: 440, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, flexShrink: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: dark ? '#f1f5f9' : '#111827' }}>Import Device</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#64748b' : '#9ca3af', fontSize: 22, lineHeight: 1 }}>×</button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                    {loadingCatalog ? (
                        <p style={{ fontSize: 13, color: dark ? '#64748b' : '#94a3b8', textAlign: 'center', padding: '24px 0' }}>Loading vendor/model catalog…</p>
                    ) : (
                        <>
                            <Field label="IMEI" hint="Digits only, up to 25 characters — must match what the device reports to TurboHive." dark={dark}>
                                <input value={imei} inputMode="numeric" maxLength={IMEI_MAX_LEN}
                                    onChange={e => { if (IMEI_PATTERN.test(e.target.value)) setImei(e.target.value); }}
                                    placeholder="e.g. 863800080017899" style={inputStyle} />
                            </Field>

                            <Field label="Vendor" dark={dark}>
                                <select value={vendorCode} onChange={e => handleVendorChange(e.target.value)} style={selectStyle}>
                                    <option value="">Select vendor…</option>
                                    {vendors.map(v => <option key={v.id} value={v.vendorCode}>{v.vendorName}</option>)}
                                </select>
                            </Field>

                            <Field label="Model" dark={dark}>
                                <select value={modelCode} onChange={e => setModelCode(e.target.value)} disabled={!vendorCode} style={selectStyle}>
                                    <option value="">{vendorCode ? 'Select model…' : 'Select a vendor first'}</option>
                                    {modelsForVendor.map(m => <option key={m.id} value={m.modelCode}>{m.modelName}</option>)}
                                </select>
                            </Field>

                            {selectedModel && (
                                <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 12, color: dark ? '#94a3b8' : '#6b7280' }}>
                                    <span>Type: <strong style={{ color: dark ? '#e2e8f0' : '#374151' }}>{selectedModel.deviceType || '—'}</strong></span>
                                    <span>Protocol: <strong style={{ color: dark ? '#e2e8f0' : '#374151' }}>{selectedModel.protocol || '—'}</strong></span>
                                </div>
                            )}

                            <Field label="Device Name" hint="Optional — a friendly name for this device, up to 50 characters." dark={dark}>
                                <input value={deviceName} maxLength={NAME_MAX_LEN} onChange={e => setDeviceName(e.target.value)} placeholder="e.g. Truck 12" style={inputStyle} />
                            </Field>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px', borderTop: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, flexShrink: 0 }}>
                    <span style={{ flex: 1, fontSize: 12.5, color: '#ef4444' }}>{error}</span>
                    <button onClick={onClose} style={{ padding: '8px 22px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 8, background: dark ? '#1e293b' : '#fff', fontSize: 13, cursor: 'pointer', color: dark ? '#e2e8f0' : '#374151' }}>Cancel</button>
                    <button onClick={handleSubmit} disabled={saving || loadingCatalog}
                        style={{ padding: '8px 22px', border: 'none', borderRadius: 8, background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600, cursor: (saving || loadingCatalog) ? 'not-allowed' : 'pointer', opacity: (saving || loadingCatalog) ? 0.7 : 1 }}>
                        {saving ? 'Importing…' : 'Import'}
                    </button>
                </div>
            </div>
        </div>
    );
}
