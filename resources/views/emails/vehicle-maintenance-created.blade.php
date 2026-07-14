<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; color: #1f2937; background: #f3f4f6; padding: 24px;">
    <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 10px; padding: 28px; border: 1px solid #e5e7eb;">
        <h2 style="margin: 0 0 4px; font-size: 17px; color: #1d4ed8;">New Maintenance Scheduled</h2>
        <p style="margin: 0 0 20px; font-size: 13px; color: #6b7280;">FleetTrack maintenance notification</p>

        <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr>
                <td style="padding: 6px 0; color: #6b7280; width: 140px;">Vehicle (IMEI)</td>
                <td style="padding: 6px 0; font-weight: 600;">{{ $record->imei }}</td>
            </tr>
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Maintenance Type</td>
                <td style="padding: 6px 0;">{{ $record->maintenance_type }}</td>
            </tr>
            @if($record->description)
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Description</td>
                <td style="padding: 6px 0;">{{ $record->description }}</td>
            </tr>
            @endif
            @if($record->due_date)
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Due Date</td>
                <td style="padding: 6px 0;">{{ $record->due_date->toFormattedDateString() }}</td>
            </tr>
            @endif
            @if($record->due_odometer_km)
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Due Odometer</td>
                <td style="padding: 6px 0;">{{ number_format($record->due_odometer_km, 0) }} km</td>
            </tr>
            @endif
            @if($record->vendor)
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Vendor</td>
                <td style="padding: 6px 0;">{{ $record->vendor }}</td>
            </tr>
            @endif
            @if(!$record->due_date && !$record->due_odometer_km)
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Reminder</td>
                <td style="padding: 6px 0; color: #b45309;">No due date or odometer set — you won't get a due-soon reminder until one is added.</td>
            </tr>
            @endif
        </table>

        <p style="margin: 24px 0 0; font-size: 12px; color: #9ca3af;">
            View or edit this record in FleetTrack (Fleet &rarr; Vehicle Maintenance).
        </p>
    </div>
</body>
</html>
