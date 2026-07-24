// Shared between the Vehicle Settings modal (FleetPage.jsx) and the Fuel Price module
// (FuelPricePage.jsx) so both use the same canonical values — must stay in sync with
// VehicleSettingController's `fuel_type` validation list and FuelPriceController's
// `fuel_type` validation list respectively.
export const FUEL_TYPES = [
    { value: 'petrol',   label: 'Petrol' },
    { value: 'diesel',   label: 'Diesel' },
    { value: 'electric', label: 'Electric' },
    { value: 'hybrid',   label: 'Hybrid' },
    { value: 'lpg',      label: 'LPG' },
];

// Only liquid fuels bought by the liter have a trackable price — electric/hybrid vehicles don't
// fit "price per liter" the same way, so the Fuel Price module's fuel type picker is narrower than
// the full vehicle fuel type list above.
export const PRICEABLE_FUEL_TYPES = [
    { value: 'petrol', label: 'Petrol' },
    { value: 'diesel', label: 'Diesel' },
];
