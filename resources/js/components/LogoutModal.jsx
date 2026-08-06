export default function LogoutModal({ onCancel, onConfirm, dark }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5000 }}>
            <div style={{ background: dark ? '#111827' : '#fff', borderRadius: 16, padding: '32px 36px', width: 320, boxShadow: '0 24px 64px rgba(0,0,0,0.3)', textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>👋</div>
                <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: dark ? '#f1f5f9' : '#0f172a' }}>Sign Out?</h2>
                <p style={{ margin: '0 0 24px', fontSize: 13, color: dark ? '#94a3b8' : '#64748b' }}>You'll be logged out of FleetTrack.</p>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={onCancel} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`, background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#475569', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={onConfirm} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Sign Out</button>
                </div>
            </div>
        </div>
    );
}
