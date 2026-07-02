import axios from 'axios';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

axios.defaults.baseURL = '/';
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
axios.defaults.withCredentials = true;

const csrfToken = document.head.querySelector('meta[name="csrf-token"]');
if (csrfToken) {
    axios.defaults.headers.common['X-CSRF-TOKEN'] = csrfToken.content;
}

const bearerToken = localStorage.getItem('fleet_token');
if (bearerToken) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${bearerToken}`;
}

window.axios  = axios;
window.Pusher = Pusher;

// Laravel Echo — connects to Reverb WebSocket server
// Run: php artisan reverb:start  (dev)
window.Echo = new Echo({
    broadcaster:   'reverb',
    key:           import.meta.env.VITE_REVERB_APP_KEY,
    wsHost:        import.meta.env.VITE_REVERB_HOST ?? '127.0.0.1',
    wsPort:        import.meta.env.VITE_REVERB_PORT ?? 8080,
    wssPort:       import.meta.env.VITE_REVERB_PORT ?? 8080,
    forceTLS:      (import.meta.env.VITE_REVERB_SCHEME ?? 'http') === 'https',
    enabledTransports: ['ws', 'wss'],
    disableStats:  true,
});
