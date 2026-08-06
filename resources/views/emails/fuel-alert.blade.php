<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; color: #1f2937; background: #f3f4f6; padding: 24px;">
    <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 10px; padding: 28px; border: 1px solid #e5e7eb;">
        <h2 style="margin: 0 0 4px; font-size: 17px; color: #b45309;">
            Fuel Alert: {{ $alert->type }}
        </h2>
        <p style="margin: 0 0 20px; font-size: 13px; color: #6b7280;">FleetTrack fuel monitor</p>

        <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr>
                <td style="padding: 6px 0; color: #6b7280; width: 140px;">Vehicle</td>
                <td style="padding: 6px 0; font-weight: 600;">{{ $deviceLabel }}</td>
            </tr>
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Alert Type</td>
                <td style="padding: 6px 0;">{{ $alert->type }} (code {{ $alert->code }})</td>
            </tr>
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Severity</td>
                <td style="padding: 6px 0; text-transform: capitalize;">{{ $alert->severity }}</td>
            </tr>
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Description</td>
                <td style="padding: 6px 0;">{{ $alert->description }}</td>
            </tr>
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Time</td>
                <td style="padding: 6px 0;">{{ $alert->occurred_at->toDayDateTimeString() }}</td>
            </tr>
            @if($alert->latitude && $alert->longitude)
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Coordinates</td>
                <td style="padding: 6px 0;">
                    <a href="https://www.google.com/maps?q={{ $alert->latitude }},{{ $alert->longitude }}" style="color: #2563eb;">
                        {{ number_format($alert->latitude, 6) }}, {{ number_format($alert->longitude, 6) }}
                    </a>
                </td>
            </tr>
            @endif
        </table>

        <p style="margin: 24px 0 0; font-size: 12px; color: #9ca3af;">
            Sent automatically by FleetTrack's fuel monitor when this vehicle reported an abnormal fuel loss or drop.
        </p>
    </div>
</body>
</html>
