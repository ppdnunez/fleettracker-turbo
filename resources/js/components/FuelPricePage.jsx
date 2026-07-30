import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { PRICEABLE_FUEL_TYPES } from '../fuelTypes.js';

const THStyle = (dark) => ({ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: dark ? '#94a3b8' : '#374151', borderBottom: `2px solid ${dark ? '#1e293b' : '#e5e7eb'}`, whiteSpace: 'nowrap', background: dark ? '#0f172a' : '#f9fafb' });
const TDStyle = (dark) => ({ padding: '11px 14px', verticalAlign: 'middle', fontSize: 13, borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, color: dark ? '#e2e8f0' : '#374151' });

const FUEL_LABEL = Object.fromEntries(PRICEABLE_FUEL_TYPES.map(f => [f.value, f.label]));
const FUEL_COLOR = { petrol: '#16a34a', diesel: '#f59e0b' };

// effective_date comes back as a full ISO datetime (Eloquent's `date` cast serializes that way,
// even though only the calendar date is meaningful here) — trim to YYYY-MM-DD for display.
function fmtDate(d) { return d ? String(d).slice(0, 10) : '—'; }

function CurrentPriceCard({ fuelType, entry, dark }) {
    const color = FUEL_COLOR[fuelType] || (dark ? '#f1f5f9' : '#111827');
    return (
        <div style={{ flex: 1, background: dark ? '#111827' : '#fff', borderRadius: 10, border: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, padding: '14px 16px' }}>
            <div style={{ fontSize: 12.5, color: dark ? '#94a3b8' : '#6b7280', marginBottom: 8 }}>{FUEL_LABEL[fuelType]} — Current Price</div>
            <div style={{ fontSize: 26, fontWeight: 800, color }}>
                {entry ? Number(entry.price_per_liter).toFixed(2) : '—'}
                <span style={{ fontSize: 13, fontWeight: 500, color: dark ? '#64748b' : '#9ca3af' }}> /L</span>
            </div>
            <div style={{ fontSize: 11.5, color: dark ? '#64748b' : '#9ca3af', marginTop: 4 }}>
                {entry ? `Effective ${fmtDate(entry.effective_date)}` : 'No price set yet'}
            </div>
        </div>
    );
}

/**
 * Petrol/diesel price setting + history (FuelPriceController). Every entry is a new row, never
 * edited in place, so "current price" is just the most recent entry per fuel type — this page
 * derives that from the same list rather than a separate endpoint. Lives under Fleet > Fuel
 * Management > Fuel Price. See VehicleSetting.fuel_type for how a vehicle is matched to a fuel type.
 */
export default function FuelPricePage({ dark }) {
    const TH = THStyle(dark);
    const TD = TDStyle(dark);
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');

    const [fuelType, setFuelType]   = useState('petrol');
    const [price, setPrice]         = useState('');
    const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [saving, setSaving]       = useState(false);
    const [formError, setFormError] = useState('');

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.getFuelPrices();
            setEntries(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            setError('Failed to load fuel price history.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const currentByType = {};
    for (const type of PRICEABLE_FUEL_TYPES) {
        currentByType[type.value] = entries.find(e => e.fuel_type === type.value) ?? null;
    }

    const handleAdd = async () => {
        if (price === '' || Number(price) < 0) { setFormError('Enter a valid price.'); return; }
        setSaving(true);
        setFormError('');
        try {
            await api.createFuelPrice({
                fuel_type: fuelType,
                price_per_liter: Number(price),
                effective_date: effectiveDate || null,
            });
            setPrice('');
            await load();
        } catch (e) {
            setFormError(e.response?.data?.message || 'Failed to save price.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.deleteFuelPrice(id);
            setEntries(es => es.filter(e => e.id !== id));
        } catch (e) {
            setError('Failed to delete price entry.');
        }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: dark ? '#0b1220' : '#fff' }}>
            <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${dark ? '#1e293b' : '#e5e7eb'}`, flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: dark ? '#f1f5f9' : '#111827' }}>Fuel Price</h2>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: dark ? '#94a3b8' : '#6b7280' }}>Set the current petrol/diesel price and keep a history of changes over time.</p>
            </div>

            <div style={{ display: 'flex', gap: 12, padding: '14px 20px 0', flexShrink: 0 }}>
                {PRICEABLE_FUEL_TYPES.map(t => (
                    <CurrentPriceCard key={t.value} fuelType={t.value} entry={currentByType[t.value]} dark={dark} />
                ))}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', padding: '14px 20px', borderBottom: `1px solid ${dark ? '#1e293b' : '#f1f5f9'}`, flexShrink: 0, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600 }}>Fuel Type</label>
                    <select value={fuelType} onChange={e => setFuelType(e.target.value)}
                        style={{ padding: '7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a', cursor: 'pointer' }}>
                        {PRICEABLE_FUEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600 }}>Price per Liter</label>
                    <input type="number" min="0" step="0.01" placeholder="e.g. 4.35" value={price} onChange={e => setPrice(e.target.value)}
                        style={{ width: 140, boxSizing: 'border-box', padding: '7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: dark ? '#94a3b8' : '#6b7280', fontWeight: 600 }}>Effective Date</label>
                    <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)}
                        style={{ padding: '7px 10px', border: `1px solid ${dark ? '#334155' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#0f172a' }} />
                </div>
                <button onClick={handleAdd} disabled={saving}
                    style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                    {saving ? 'Saving…' : 'Set Price'}
                </button>
                {formError && <span style={{ fontSize: 12, color: '#ef4444' }}>{formError}</span>}
            </div>

            {error && (
                <div style={{ margin: '12px 20px 0', padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: `1px solid ${dark ? '#7f1d1d' : '#fecaca'}`, borderRadius: 6, fontSize: 12, color: dark ? '#fca5a5' : '#991b1b' }}>
                    {error}
                </div>
            )}

            <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                    <thead>
                        <tr>
                            <th style={TH}>Fuel Type</th>
                            <th style={TH}>Price per Liter</th>
                            <th style={TH}>Effective Date</th>
                            <th style={TH}>Set On</th>
                            <th style={TH}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : entries.length === 0 ? (
                            <tr><td colSpan={5} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No price history yet.</td></tr>
                        ) : entries.map(e => (
                            <tr key={e.id}>
                                <td style={TD}>{FUEL_LABEL[e.fuel_type] || e.fuel_type}</td>
                                <td style={TD}>{Number(e.price_per_liter).toFixed(2)}</td>
                                <td style={TD}>{fmtDate(e.effective_date)}</td>
                                <td style={{ ...TD, color: dark ? '#94a3b8' : '#6b7280' }}>{new Date(e.created_at).toLocaleString()}</td>
                                <td style={TD}>
                                    <button onClick={() => handleDelete(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12, fontWeight: 600 }}>Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
