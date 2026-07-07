<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; color: #1f2937; background: #f3f4f6; padding: 24px;">
    <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 10px; padding: 28px; border: 1px solid #e5e7eb;">
        <h2 style="margin: 0 0 4px; font-size: 17px; color: {{ $event->type === 'enter' ? '#15803d' : '#b45309' }};">
            {{ $event->type === 'enter' ? 'Geofence Entry' : 'Geofence Exit' }}
        </h2>
        <p style="margin: 0 0 20px; font-size: 13px; color: #6b7280;">FleetTrack geofence alert</p>

        <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr>
                <td style="padding: 6px 0; color: #6b7280; width: 140px;">Device</td>
                <td style="padding: 6px 0; font-weight: 600;">{{ $deviceLabel }}</td>
            </tr>
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Geofence</td>
                <td style="padding: 6px 0;">{{ $geofenceName }}</td>
            </tr>
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Event</td>
                <td style="padding: 6px 0;">{{ $event->type === 'enter' ? 'Entered' : 'Exited' }}</td>
            </tr>
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Time</td>
                <td style="padding: 6px 0;">{{ $event->triggered_at->toDayDateTimeString() }}</td>
            </tr>
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Coordinates</td>
                <td style="padding: 6px 0;">
                    <a href="https://www.google.com/maps?q={{ $event->latitude }},{{ $event->longitude }}" style="color: #2563eb;">
                        {{ number_format($event->latitude, 6) }}, {{ number_format($event->longitude, 6) }}
                    </a>
                </td>
            </tr>
        </table>

        <p style="margin: 24px 0 0; font-size: 12px; color: #9ca3af;">
            Sent automatically by FleetTrack's geofence monitor when this device crossed the geofence boundary.
        </p>
    </div>
</body>
</html>
