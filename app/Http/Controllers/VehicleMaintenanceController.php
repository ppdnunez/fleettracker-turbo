<?php

namespace App\Http\Controllers;

use App\Mail\VehicleMaintenanceCreatedMail;
use App\Models\AlertRecipient;
use App\Models\VehicleMaintenance;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

// Local (Laravel DB) maintenance schedule/history per vehicle, keyed by TurboHive IMEI — same
// convention as vehicle_settings, since vehicles have no local `devices` row. See
// NotifyVehicleMaintenanceDue for the scheduled due/overdue reminder that reads
// due_date/due_odometer_km; store() below sends a separate one-time "scheduled" confirmation.
class VehicleMaintenanceController extends Controller
{
    public function index()
    {
        return response()->json(
            VehicleMaintenance::orderBy('due_date')->orderByDesc('created_at')->get()
        );
    }

    private function validationRules(): array
    {
        return [
            'imei'                  => 'required|string',
            'maintenance_type'      => 'required|string|max:100',
            'description'           => 'nullable|string',
            'status'                => 'nullable|in:Scheduled,Completed,Cancelled',
            'due_date'              => 'nullable|date',
            'due_odometer_km'       => 'nullable|numeric|min:0',
            'notify_days_before'    => 'nullable|integer|min:1|max:365',
            'notify_km_before'      => 'nullable|integer|min:1|max:100000',
            'completed_date'        => 'nullable|date',
            'completed_odometer_km' => 'nullable|numeric|min:0',
            'cost'                  => 'nullable|numeric|min:0',
            'vendor'                => 'nullable|string|max:150',
            'notes'                 => 'nullable|string',
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->validationRules());
        $record = VehicleMaintenance::create($data);

        $this->sendCreatedEmail($record);

        return response()->json($record, 201);
    }

    /**
     * Sent synchronously (VehicleMaintenanceCreatedMail has no ShouldQueue — see its docblock). A
     * delivery failure is logged rather than thrown, so it never blocks the record from saving.
     */
    private function sendCreatedEmail(VehicleMaintenance $record): void
    {
        $recipients = AlertRecipient::emailsFor('vehicle_maintenance');
        if (empty($recipients)) {
            return;
        }

        try {
            foreach ($recipients as $email) {
                Mail::to($email)->send(new VehicleMaintenanceCreatedMail($record));
            }
        } catch (\Throwable $e) {
            Log::warning('Vehicle maintenance created email failed to send', [
                'vehicle_maintenance_id' => $record->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    public function update(Request $request, VehicleMaintenance $vehicleMaintenance)
    {
        $data = $request->validate($this->validationRules());
        $vehicleMaintenance->update($data);

        return response()->json($vehicleMaintenance);
    }

    public function destroy(VehicleMaintenance $vehicleMaintenance)
    {
        $vehicleMaintenance->delete();

        return response()->json(['message' => 'Maintenance record deleted.']);
    }
}
