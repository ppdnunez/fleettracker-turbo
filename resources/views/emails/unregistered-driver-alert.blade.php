<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; color: #1f2937; background: #f3f4f6; padding: 24px;">
    <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 10px; padding: 28px; border: 1px solid #e5e7eb;">
        <h2 style="margin: 0 0 4px; font-size: 17px; color: #b91c1c;">Unregistered Driver Detected</h2>
        <p style="margin: 0 0 20px; font-size: 13px; color: #6b7280;">FleetTrack driver check-in alert</p>

        <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr>
                <td style="padding: 6px 0; color: #6b7280; width: 140px;">Vehicle (IMEI)</td>
                <td style="padding: 6px 0; font-weight: 600;">{{ $imei }}</td>
            </tr>
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Detection Method</td>
                <td style="padding: 6px 0;">{{ $source === 'face' ? 'Face Recognition (JC171 AFIF)' : 'RFID / iButton' }}</td>
            </tr>
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Card / iButton ID</td>
                <td style="padding: 6px 0;">{{ $cardId }}</td>
            </tr>
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Vehicle Disconnected</td>
                <td style="padding: 6px 0; font-weight: 600; color: {{ $relayTriggered ? '#b91c1c' : '#6b7280' }};">
                    {{ $relayTriggered ? 'Yes — relay disconnect command sent' : 'No' }}
                </td>
            </tr>
        </table>

        <p style="margin: 24px 0 0; font-size: 12px; color: #9ca3af;">
            Sent automatically by FleetTrack when a card/iButton tap didn't match any registered driver.
        </p>
    </div>
</body>
</html>
