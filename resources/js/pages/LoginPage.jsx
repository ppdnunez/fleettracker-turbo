import { useState } from 'react';
import { api } from '../api.js';

function FleetMark() {
    return (
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 17.5V9.8c0-.7.36-1.35.96-1.72l5.95-3.68a2.05 2.05 0 0 1 2.18 0l5.95 3.68c.6.37.96 1.02.96 1.72v7.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M7.2 17.5h9.6M8.3 14.2h7.4M10 10.8h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="7" cy="19" r="1.6" fill="currentColor"/>
            <circle cx="17" cy="19" r="1.6" fill="currentColor"/>
        </svg>
    );
}

function MailIcon() {
    return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 6.5h16v11H4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
            <path d="m4.5 7 7.5 6 7.5-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
}

function LockIcon() {
    return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7"/>
            <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
            <circle cx="12" cy="15" r="1.2" fill="currentColor"/>
        </svg>
    );
}

export default function LoginPage({ onLogin }) {
    const [email,    setEmail]    = useState('');
    const [password, setPassword] = useState('');
    const [error,    setError]    = useState('');
    const [loading,  setLoading]  = useState(false);

    const handleSubmit = async () => {
        setError('');
        if (!email || !password) { setError('Email and password are required.'); return; }
        setLoading(true);
        try {
            const res = await api.login(email, password);
            onLogin(res.data);
        } catch (err) {
            setError(
                err.response?.data?.errors?.email?.[0] ||
                err.response?.data?.message ||
                'Invalid email or password.'
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="login-shell">
            <section className="login-story" aria-label="FleetTrack overview">
                <div className="login-brand">
                    <span className="fleet-mark"><FleetMark /></span>
                    <span>FleetTrack</span>
                </div>

                <div className="login-story-copy">
                    <div className="login-eyebrow">Fleet intelligence, in motion</div>
                    <h1>Know where your fleet stands.</h1>
                    <p>Monitor vehicles, drivers, routes, maintenance, and live events from one focused operations workspace.</p>
                </div>

                <div className="login-proof" aria-label="Platform capabilities">
                    <span><i /> Live tracking</span>
                    <span><i /> Driver safety</span>
                    <span><i /> Fleet health</span>
                </div>
            </section>

            <section className="login-panel">
                <div className="login-card">
                    <header className="login-card-header">
                        <h2>Welcome back</h2>
                        <p>Sign in to continue to your fleet operations workspace.</p>
                    </header>

                    <form onSubmit={e => { e.preventDefault(); handleSubmit(); }}>
                        <div className="login-field">
                            <label htmlFor="fleet-email">Email address</label>
                            <div className="login-input-wrap">
                                <MailIcon />
                                <input
                                    id="fleet-email"
                                    className="login-input"
                                    type="email"
                                    value={email}
                                    placeholder="you@company.com"
                                    autoComplete="email"
                                    onChange={e => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="login-field">
                            <label htmlFor="fleet-password">Password</label>
                            <div className="login-input-wrap">
                                <LockIcon />
                                <input
                                    id="fleet-password"
                                    className="login-input"
                                    type="password"
                                    value={password}
                                    placeholder="Enter your password"
                                    autoComplete="current-password"
                                    onChange={e => setPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="login-error" role="alert">
                                {error}
                            </div>
                        )}

                        <button className="login-submit" type="submit" disabled={loading}>
                            {loading ? 'Signing in…' : 'Sign in'}
                            {!loading && <span aria-hidden="true">→</span>}
                        </button>
                    </form>

                    <p className="login-demo">
                        Demo access: admin@fleet.com / admin123
                    </p>
                </div>
            </section>
        </main>
    );
}
