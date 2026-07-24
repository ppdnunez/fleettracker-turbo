<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; color: #1f2937; background: #f3f4f6; padding: 24px;">
    <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 10px; padding: 28px; border: 1px solid #e5e7eb;">
        <h2 style="margin: 0 0 4px; font-size: 17px; color: {{ $daysUntil < 0 ? '#b91c1c' : '#b45309' }};">
            Safety Sticker {{ $daysUntil < 0 ? 'has expired' : 'is expiring soon' }}
        </h2>
        <p style="margin: 0 0 20px; font-size: 13px; color: #6b7280;">FleetTrack vehicle safety-sticker reminder</p>

        <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr>
                <td style="padding: 6px 0; color: #6b7280; width: 140px;">Vehicle (IMEI)</td>
                <td style="padding: 6px 0; font-weight: 600;">{{ $setting->imei }}</td>
            </tr>
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Expiry date</td>
                <td style="padding: 6px 0;">{{ $expiryDate->toFormattedDateString() }}</td>
            </tr>
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Status</td>
                <td style="padding: 6px 0;">
                    @if($daysUntil < 0)
                        Expired {{ abs($daysUntil) }} day{{ abs($daysUntil) === 1 ? '' : 's' }} ago
                    @else
                        Expires in {{ $daysUntil }} day{{ $daysUntil === 1 ? '' : 's' }}
                    @endif
                </td>
            </tr>
        </table>

        <p style="margin: 24px 0 0; font-size: 12px; color: #9ca3af;">
            Update this vehicle's record in FleetTrack (Fleet &rarr; Vehicle &rarr; Vehicle Settings) once the renewal is done.
        </p>
    </div>
</body>
</html>
