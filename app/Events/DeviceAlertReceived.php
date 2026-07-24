<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class DeviceAlertReceived implements ShouldBroadcastNow
{
    use Dispatchable, SerializesModels;

    /**
     * Full alert.code → metadata map, transcribed from TurboHive's own alert catalog reference
     * (Type / Code / Trigger Type / Severity / Description columns) — supersedes the previous
     * partial/confirmed-only map. Categories: 10xx Device Status, 11xx GNSS, 12xx Vehicle Status,
     * 13xx Driving Behavior, 14xx Personal Safety, 15xx Vehicle Safety, 16xx Peripheral & Sensor,
     * 17xx ADAS, 18xx DSM (includes 1823/1824 face-recognition — kept out of the Driving Behavior
     * module on purpose, see FaceRecognitionEvent), 99xx Others.
     *
     * `trigger_type` ('event' = one-shot instantaneous occurrence, 'stateful' = an ongoing condition
     * that stays active, e.g. Speeding while over the limit) and `severity` are TurboHive's own
     * classification, lowercased here for consistent frontend comparison. `description` is the
     * catalog's static description text — used as a fallback since the live MQTT payload (unlike
     * the REST GET /v3/alerts/page response) never includes alert.description at all.
     */
    private const KNOWN_CODE_NAMES = [
        // ── 10xx Device Status ──────────────────────────────────────────────
        '1001' => ['name' => 'Device Normal', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Device works correctly'],
        '1002' => ['name' => 'External Power Off', 'trigger_type' => 'stateful', 'severity' => 'high', 'description' => 'External power was cut off'],
        '1003' => ['name' => 'Device Power On', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Device is powered on'],
        '1004' => ['name' => 'External Power Undervoltage', 'trigger_type' => 'stateful', 'severity' => 'medium', 'description' => 'Voltage of external power is rather low'],
        '1005' => ['name' => 'Low Power Protection', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Device entered protection mode due to low external power'],
        '1006' => ['name' => 'Manual Shutdown', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Device was powered off manually'],
        '1007' => ['name' => 'Airplane Mode', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Device entered airplane mode due to low external power'],
        '1008' => ['name' => 'Device Removed', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Device was removed'],
        '1009' => ['name' => 'Low Power Shutdown', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Device has shut down due to low external power'],
        '1010' => ['name' => 'Cover Opened', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Device cover was opened'],
        '1011' => ['name' => 'Internal Battery Undervoltage', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Voltage of internal battery is rather low'],
        '1012' => ['name' => 'About To Sleep', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Device is about to enter sleep mode'],
        '1013' => ['name' => 'Device Plugged Out', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Device was plugged out'],
        '1014' => ['name' => 'Device Plugged In', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Device was plugged in'],
        '1015' => ['name' => 'Land Transport Mode', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Device changed to land transport mode'],
        '1016' => ['name' => 'Water Transport Mode', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Device changed to waterborne transport mode'],
        '1017' => ['name' => 'Stationary Mode', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Device changed to stationery mode'],
        '1018' => ['name' => 'Deep Sleep', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Entered Deep Sleep Mode'],
        '1019' => ['name' => 'Cover Or Collision', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Device opened unexpectedly or hit violently'],
        '1020' => ['name' => 'Light Detected', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Light Detected'],
        '1021' => ['name' => 'Active Offline', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Active Offline Alarm'],
        '1022' => ['name' => 'Device Locked', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Device Locked'],
        '1023' => ['name' => 'Device Unlocked', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Device Unlocked'],
        '1024' => ['name' => 'Unexpected Unlock', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Device Unlocked Unexpectedly'],
        '1025' => ['name' => 'Unlock Failed', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Failed to Unlock Device'],
        '1026' => ['name' => 'Out Of Range', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Device Out of Preset Range'],
        '1027' => ['name' => 'Stationary Too Long', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Device Stationary Too Long'],
        '1028' => ['name' => 'Battery Fully Charged', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Internal Battery Fully Charged'],
        '1029' => ['name' => 'Battery Error', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Internal Battery Error'],
        '1030' => ['name' => 'Battery Temperature High', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Internal Battery Temperature High'],
        '1031' => ['name' => 'Battery Charging Started', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Internal Battery Charging Started'],
        '1032' => ['name' => 'Battery Charging Stopped', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Internal Battery Charging Stopped'],
        '1033' => ['name' => 'Battery Almost Full', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Internal Battery Almost Full'],
        '1034' => ['name' => 'Battery Charge Complete', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Internal Battery Charging Complete'],
        '1035' => ['name' => 'External Voltage High', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'External Power Voltage Too High'],
        '1036' => ['name' => 'Voltage Exception', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Voltage Value Exception'],
        '1037' => ['name' => 'Device Signed In', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Device Signed In'],
        '1038' => ['name' => 'Device Signed Out', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Device Signed Out'],
        '1039' => ['name' => 'Device Installed', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Device Installed'],
        '1040' => ['name' => 'Temperature Rising', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Temperature Rising Abnormally'],
        '1041' => ['name' => 'Temperature Dropping', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Temperature Dropping Abnormally'],
        '1042' => ['name' => 'Device Restarted', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Device Restarted'],
        '1043' => ['name' => 'Device Tilted', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Device Tilted Unexpectedly'],
        '1044' => ['name' => 'Device Muted', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Device Muted'],

        // ── 11xx GNSS ────────────────────────────────────────────────────────
        '1101' => ['name' => 'Geofence Entry', 'trigger_type' => 'stateful', 'severity' => 'low', 'description' => 'Vehicle entered geofence'],
        '1102' => ['name' => 'Geofence Exit', 'trigger_type' => 'stateful', 'severity' => 'low', 'description' => 'Vehicle left geofence'],
        '1103' => ['name' => 'GNSS Dead Zone Entry', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Entered GNSS dead zone'],
        '1104' => ['name' => 'GNSS Dead Zone Exit', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Left GNSS dead zone'],
        '1105' => ['name' => 'First Fix', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Device got the first fix'],
        '1106' => ['name' => 'Route In/Out', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'In and out the route'],
        '1107' => ['name' => 'Road Section Time Issue', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Insufficient/too long driving time on the road section'],
        '1108' => ['name' => 'Route Deviation', 'trigger_type' => 'stateful', 'severity' => 'medium', 'description' => 'Route deviation alarm'],
        '1109' => ['name' => 'External GNSS Antenna Disconnected', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'External GNSS Antenna Disconnected'],
        '1110' => ['name' => 'GNSS Module Failure', 'trigger_type' => 'stateful', 'severity' => 'high', 'description' => 'GNSS module failure'],
        '1111' => ['name' => 'GNSS Antenna Disconnected', 'trigger_type' => 'stateful', 'severity' => 'high', 'description' => 'GNSS antenna not connected or cut off'],
        '1112' => ['name' => 'GNSS Antenna Short', 'trigger_type' => 'stateful', 'severity' => 'medium', 'description' => 'GNSS antenna short circuit'],
        '1113' => ['name' => 'GNSS Module Error', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'GNSS Module Error'],
        '1114' => ['name' => 'UBI GNSS Chip Error', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'UBI GNSS Chip Error'],
        '1115' => ['name' => 'Geofence Speeding', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Speeding Inside Geofence'],
        '1116' => ['name' => 'Long Time To Fix', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Time to Position Fix Too Long'],

        // ── 12xx Vehicle Status ─────────────────────────────────────────────
        '1201' => ['name' => 'Fuel Power Reconnected', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Fuel and power reconnected'],
        '1202' => ['name' => 'Fuel Power Cut Off', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Fuel and power disconnected'],
        '1203' => ['name' => 'Engine Failure', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Engine failed'],
        '1204' => ['name' => 'Vehicle Battery Undervoltage', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Vehicle battery was undervoltage'],
        '1205' => ['name' => 'Long Parking', 'trigger_type' => 'stateful', 'severity' => 'low', 'description' => 'Vehicle has parked for too long'],
        '1206' => ['name' => 'High Water Temperature', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Water temperature is too high'],
        '1207' => ['name' => 'Ignition On', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Ignition turned on'],
        '1208' => ['name' => 'Ignition Off', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Ignition turned off'],
        '1209' => ['name' => 'VSS Failure', 'trigger_type' => 'stateful', 'severity' => 'high', 'description' => 'Vehicle VSS failure'],
        '1210' => ['name' => 'Illegal Ignition', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Vehicle illegal ignition'],
        '1211' => ['name' => 'Engine On', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Engine Turned On'],
        '1213' => ['name' => 'Speed Normal', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Vehicle Speed Resumed Normal'],
        '1214' => ['name' => 'ADC1 Voltage High', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Voltage Exceptionally High (ADC1)'],
        '1215' => ['name' => 'ADC1 Voltage Low', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Voltage Exceptionally Low (ADC1)'],
        '1216' => ['name' => 'ADC1 Voltage Rising', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Voltage Rising Abnormally (ADC1)'],
        '1217' => ['name' => 'ADC1 Voltage Dropping', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Voltage Dropping Abnormally (ADC1)'],
        '1218' => ['name' => 'Live Wire Exception', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Live Wire Exception'],
        '1219' => ['name' => 'Door Status Abnormal', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Abnormal door status'],
        '1220' => ['name' => 'Door Opened', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Door was opened'],
        '1221' => ['name' => 'Door Closed', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Door was closed'],
        '1222' => ['name' => 'Low Fuel', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Tank needs refill'],
        '1223' => ['name' => 'Fuel Level Abnormal', 'trigger_type' => 'stateful', 'severity' => 'medium', 'description' => 'Abnormal fuel level'],
        '1224' => ['name' => 'Fuel Level Increased', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Fuel Level Increased Unexpectedly'],
        '1225' => ['name' => 'Fuel Level Dropped', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Fuel Level Dropped Unexpectedly'],
        '1226' => ['name' => 'Exit Transport Mode', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Exited Transport Mode'],
        '1227' => ['name' => 'Idling Too Long', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Vehicle Idling Too Long'],
        '1228' => ['name' => 'Illegal Door Opening', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Illegal door opening alarm'],
        '1229' => ['name' => 'Mirror Vibration', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Rear Mirror Vibration'],
        '1230' => ['name' => 'Truck Opened', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Truck Opened'],

        // ── 13xx Driving Behavior ────────────────────────────────────────────
        '1301' => ['name' => 'Speeding', 'trigger_type' => 'stateful', 'severity' => 'medium', 'description' => 'Vehicle has been speeding'],
        '1302' => ['name' => 'Harsh Acceleration', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Vehicle has been accelerated harshly'],
        '1303' => ['name' => 'Sharp Left Turn', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Vehicle has turned left abruptly'],
        '1304' => ['name' => 'Sharp Right Turn', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Vehicle has turned right abruptly'],
        '1305' => ['name' => 'Hard Braking', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Vehicle has been braked hard'],
        '1306' => ['name' => 'Sharp Turn', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Vehicle has turned abruptly'],
        '1307' => ['name' => 'Fatigue Warning', 'trigger_type' => 'stateful', 'severity' => 'medium', 'description' => 'Fatigue driving warning'],
        '1308' => ['name' => 'Daily Driving Timeout', 'trigger_type' => 'stateful', 'severity' => 'high', 'description' => 'Cumulative driving time-out for the day'],
        '1309' => ['name' => 'Over Driving', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Over Driving'],

        // ── 14xx Personal Safety ─────────────────────────────────────────────
        '1401' => ['name' => 'Emergency SOS', 'trigger_type' => 'event', 'severity' => 'critical', 'description' => 'An emergency alert was triggered'],
        '1402' => ['name' => 'Fall Down', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'User has fallen down'],
        '1403' => ['name' => 'Body Temperature Abnormal', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'The body temperature of the user is abnormal'],
        '1404' => ['name' => 'Danger Warning', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Danger warning'],

        // ── 15xx Vehicle Safety ──────────────────────────────────────────────
        '1501' => ['name' => 'Unexpected Vibration', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Vehicle vibrated unexpectedly'],
        '1502' => ['name' => 'Unexpected Movement', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Vehicle has been moved unexpectedly'],
        '1503' => ['name' => 'Collision', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Vehicle collided'],
        '1504' => ['name' => 'Rollover', 'trigger_type' => 'event', 'severity' => 'critical', 'description' => 'Vehicle Rollover'],
        '1505' => ['name' => 'Stability Exception', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Vehicle Stability Exception'],
        '1506' => ['name' => 'Attitude Exception', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Vehicle Attitude Exception'],
        '1507' => ['name' => 'Airbag Deployed', 'trigger_type' => 'event', 'severity' => 'critical', 'description' => 'Safety Airbag Deployed'],
        '1508' => ['name' => 'Vehicle May Be Stolen', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Vehicle May Have Been Stolen'],
        '1509' => ['name' => 'Unexpected Start', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Vehicle Started Unexpectedly'],
        '1510' => ['name' => 'Unexpected Towing', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Vehicle Towing Away Unexpectedly'],
        '1511' => ['name' => 'Suspected Fuel Theft', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Fuel may be stolen'],
        '1512' => ['name' => 'Vehicle Stolen', 'trigger_type' => 'stateful', 'severity' => 'critical', 'description' => 'Vehicle stolen (with anti-theft device)'],
        '1513' => ['name' => 'Vehicle Finding', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Vehicle Finding'],

        // ── 16xx Peripheral & Sensor ─────────────────────────────────────────
        '1601' => ['name' => 'SIM Changed', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'SIM card changed'],
        '1602' => ['name' => 'SD Card Inserted', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'SD/T card insertion or mount'],
        '1603' => ['name' => 'SD Card Removed', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'SD/T card not inserted or removed'],
        '1604' => ['name' => 'SD Card Corrupted', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'SD/T card corrupted(abnormal writing)'],
        '1605' => ['name' => 'SD Card Mounted', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'SD Card Mounted'],
        '1606' => ['name' => 'No SD Card', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'No SD Card Detected'],
        '1607' => ['name' => 'Video Signal Lost', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Video signal lost (per-channel)'],
        '1608' => ['name' => 'Video Blocked', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Video signal blocked (per-channel)'],
        '1609' => ['name' => 'Storage Failure', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Storage unit failure'],
        '1610' => ['name' => 'LCD Failure', 'trigger_type' => 'stateful', 'severity' => 'high', 'description' => 'Terminal LCD or display failure'],
        '1611' => ['name' => 'TTS Failure', 'trigger_type' => 'stateful', 'severity' => 'medium', 'description' => 'TTS module failure'],
        '1612' => ['name' => 'Camera Failure', 'trigger_type' => 'stateful', 'severity' => 'high', 'description' => 'Camera failure'],
        '1613' => ['name' => 'IC Card Failure', 'trigger_type' => 'stateful', 'severity' => 'medium', 'description' => 'IC card module of road transport certificate failure'],
        '1614' => ['name' => 'Charger Connected', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Charger Connected'],
        '1615' => ['name' => 'DLT Card Login', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'DLT Card Login'],
        '1616' => ['name' => 'DLT Card Logout', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'DLT Card Logout'],
        '1617' => ['name' => 'DLT Unregistered Card', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'DLT Non-Registered Card'],
        '1618' => ['name' => 'No USB Camera', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'No USB Camera Detected'],
        '1619' => ['name' => 'Temp Or Humidity Abnormal', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Temperature or humidity abnormal'],
        '1620' => ['name' => 'Temperature Recovered', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Temperature recovered to normal'],
        '1621' => ['name' => 'Environment Abnormal', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Abnormal ambient environment'],
        '1622' => ['name' => 'Fuel Sensor Comm Error', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Fuel Sensor Communication Error'],
        '1623' => ['name' => 'Fuel Sensor Comm Resumed', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Fuel Sensor Communication Resumed'],
        '1624' => ['name' => 'Temp Sensor Comm Error', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Temperature Sensor Communication Error'],
        '1625' => ['name' => 'Temp Sensor Error', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Temperature Sensor Error'],
        '1626' => ['name' => 'Temp Sensor Timeout', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Temperature Sensor Connection Timeout'],
        '1627' => ['name' => 'RFID Sensor Error', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'RFID Sensor Error'],
        '1628' => ['name' => 'Memory Card Space Low', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Memory Card Space Low'],
        '1629' => ['name' => 'RFID Card Swipe', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'RFID Card Swipe Detected'],
        '1630' => ['name' => '3D Acceleration Error', 'trigger_type' => 'event', 'severity' => 'high', 'description' => '3D Acceleration Sensor Error'],
        '1631' => ['name' => 'UBI Sensor Chip Error', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'UBI Sensor Chip Error'],
        '1632' => ['name' => 'UBI Encrypted IC Error', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'UBI Encrypted IC Error'],
        '1633' => ['name' => 'Flash Error', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'FLASH Error'],
        '1634' => ['name' => 'CAN Module Error', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'CAN Module Error'],
        '1635' => ['name' => 'SD Card Fault', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'SD Card Fault Detected'],
        '1636' => ['name' => 'DMS Camera Communication Abnormality', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'DMS Camera Communication Abnormality Detected'],

        // ── 17xx ADAS ────────────────────────────────────────────────────────
        '1701' => ['name' => 'Forward Collision Warning', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Forward Collision Warning'],
        '1702' => ['name' => 'Lane Departure Warning', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Lane Departure Warning'],
        '1703' => ['name' => 'Headway Monitor Warning', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Headway Monitor Warning'],
        '1704' => ['name' => 'Pedestrian Collision Warning', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Pedestrian Collision Warning'],
        '1705' => ['name' => 'Lane Change Warning', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Lane Change Warning'],
        '1706' => ['name' => 'Road Sign Overrun', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Road Sign Overrun'],
        '1707' => ['name' => 'Obstacle Warning', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Obstacle Warning'],
        '1708' => ['name' => 'Road Sign Recognition', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Road Sign Recognition Event'],
        '1709' => ['name' => 'Active Capture', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Active Capture Event (ADAS)'],

        // ── 18xx DSM (1823/1824 are face-recognition — see FaceRecognitionEvent, excluded from
        //    the Driving Behavior module on purpose) ──────────────────────────
        '1801' => ['name' => 'Fatigue Driving', 'trigger_type' => 'stateful', 'severity' => 'high', 'description' => 'Fatigue driving was detected'],
        '1802' => ['name' => 'Using Phone', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Driver Using Phone'],
        '1803' => ['name' => 'Smoking', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Driver Smoking'],
        '1804' => ['name' => 'Driver Distraction', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Driver Distraction'],
        '1805' => ['name' => 'No Face Detected', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'No Driver Face Detected'],
        '1806' => ['name' => 'Camera Blocked', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Camera Blocked'],
        '1807' => ['name' => 'Seatbelt Unfastened', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Seatbelt Unfastened'],
        '1808' => ['name' => 'Sunglasses Detected', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Sunglasses Detected'],
        '1809' => ['name' => 'Hands Off Wheel', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Hands Off Steering Wheel'],
        '1810' => ['name' => 'Answering Phone', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Driver Answering Phone'],
        '1811' => ['name' => 'Auto Capture', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Automatic Capture Event (DMS)'],
        '1812' => ['name' => 'Driver Change', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Driver Change Event'],
        '1813' => ['name' => 'DSM Calibration Anomaly', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'DSM Calibration Anomaly'],
        '1814' => ['name' => 'Frequent Blinking', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Driver Blinking Frequently'],
        '1815' => ['name' => 'Yawning', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Driver Yawning'],
        '1816' => ['name' => 'Seatbelt Fastened', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Seatbelt Fastened'],
        '1817' => ['name' => 'Capture Completed', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Capture Completed'],
        '1818' => ['name' => 'Driver Info Changed', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Driver Info Changed'],
        '1819' => ['name' => 'Face Alignment Error', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Face Alignment Error'],
        '1820' => ['name' => 'Head Lowered', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Driver Lowered Head'],
        '1821' => ['name' => 'Driver Drinking', 'trigger_type' => 'event', 'severity' => 'critical', 'description' => 'Driver Drinking'],
        '1822' => ['name' => 'Driver Eyes Closed', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Driver Eyes Closed'],
        '1823' => ['name' => 'Face Recognition Succeeded', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Face Recognition Succeeded'],
        '1824' => ['name' => 'Face Recognition Failed', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Face Recognition Failed'],
        '1825' => ['name' => 'Face Data Uploaded', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Face Data Uploaded To Platform'],

        // ── 99xx Others ──────────────────────────────────────────────────────
        '9901' => ['name' => 'Pseudo Base Station', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Pseudo Base Station Detected'],
        '9902' => ['name' => 'Suspected Herd Departure', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Suspected Leaving Designated Herd'],
        '9903' => ['name' => 'Away From Beacon', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Moving Away From Beacon'],
        '9904' => ['name' => 'Left Herd', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Left Designated Herd'],
        '9905' => ['name' => 'Voice Control', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Voice Control'],
        '9906' => ['name' => 'Identification', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Identification'],
        '9907' => ['name' => 'Key Press Event', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Key Press Event Triggered'],
        '9908' => ['name' => 'Exit Defense Mode', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Exited Defense Mode'],
        '9909' => ['name' => 'Enter Defense Mode', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Entered Defense Mode'],
        '9911' => ['name' => 'Reserved 1', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Reserved 1'],
        '9912' => ['name' => 'Reserved 2', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Reserved 2'],
        '9913' => ['name' => 'Reserved 3', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'Reserved 3'],
        '9914' => ['name' => 'Pet Lost', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Pet Lost'],
        '9915' => ['name' => 'Package Opened', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Package Opened Unexpectedly'],
        '9916' => ['name' => 'Pulse Exception', 'trigger_type' => 'event', 'severity' => 'high', 'description' => 'Pulse Exception'],
        '9917' => ['name' => 'Near Bluetooth Beacon', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Close to Bluetooth Beacon'],
        '9918' => ['name' => 'Bluetooth MAC Found', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Bluetooth MAC Addresses Found'],
        '9919' => ['name' => 'No Bluetooth MAC', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'No Bluetooth MAC Addresses Found'],
        '9920' => ['name' => 'INPUT1 On', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'INPUT1 Activated'],
        '9921' => ['name' => 'INPUT1 Off', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'INPUT1 Deactivated'],
        '9922' => ['name' => 'INPUT2 On', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'INPUT2 Activated'],
        '9923' => ['name' => 'INPUT2 Off', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'INPUT2 Deactivated'],
        '9924' => ['name' => 'Motion Start', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Motion Start'],
        '9925' => ['name' => 'Motion Stop', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'Motion Stop'],
        '9926' => ['name' => 'File Uploaded', 'trigger_type' => 'event', 'severity' => 'info', 'description' => 'File Uploaded Completely'],
        '9927' => ['name' => 'Loud Ambient Sound', 'trigger_type' => 'event', 'severity' => 'low', 'description' => 'The ambient sound was too loud'],
        '9928' => ['name' => 'Data Usage Exception', 'trigger_type' => 'event', 'severity' => 'medium', 'description' => 'Mobile Data Usage Exception'],
    ];

    public function __construct(
        public readonly string $imei,
        public readonly array  $alert,
    ) {}

    public function broadcastOn(): Channel
    {
        return new Channel('fleet');
    }

    public function broadcastAs(): string
    {
        return 'alert.received';
    }

    /**
     * Real raw MQTT payload (captured via TurboHive's own MQTT test console on
     * {userId}/alert/{imei}), e.g.:
     *   {"alert.type": 1, "alert.code": "1401", "device.imei": "...", "gnss.lng": 147.18224,
     *    "gnss.lat": -9.443918, "device.time": 1783037773000, "alert.msgClass": 0}
     * Notably: alert.type is numeric (not TurboHiveService::getAlerts's REST-only "256-6" style
     * string), there's no alert.name/alert.description at all, and the timestamp field is
     * device.time rather than alert.time. Field names are still tried both dotted and flat as a
     * fallback, since TurboHive doesn't formally document this shape and it could vary by alert.
     */
    public function broadcastWith(): array
    {
        $a = $this->alert;
        $extra = json_decode($a['alert.extraInfo'] ?? $a['extraInfo'] ?? '', true) ?: [];
        $code  = (string) ($a['alert.code'] ?? $a['code'] ?? '');
        $known = self::KNOWN_CODE_NAMES[$code] ?? null;

        return [
            'imei'        => $this->imei,
            'type'        => $a['alert.type'] ?? $a['type'] ?? $a['alertType'] ?? null,
            'code'        => $code !== '' ? $code : null,
            'name'        => $a['alert.name'] ?? $a['name'] ?? $known['name'] ?? null,
            'description' => $a['alert.description'] ?? $a['description'] ?? $known['description'] ?? null,
            'triggerType' => $known['trigger_type'] ?? null,
            'severity'    => $known['severity'] ?? null,
            'latitude'    => $a['gnss.lat'] ?? $a['latitude'] ?? $a['lat'] ?? null,
            'longitude'   => $a['gnss.lng'] ?? $a['longitude'] ?? $a['lng'] ?? null,
            'speed'       => $extra['gpsSpeed'] ?? $a['speed'] ?? null,
            'msgClass'    => $a['alert.msgClass'] ?? $a['msgClass'] ?? null,
            'timestamp'   => $a['device.time'] ?? $a['alert.time'] ?? $a['time'] ?? $a['alertTime'] ?? now()->valueOf(),
            'raw'         => $a,
        ];
    }
}
