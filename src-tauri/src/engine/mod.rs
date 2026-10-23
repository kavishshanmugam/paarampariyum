//! Parampara Panchang Engine
//!
//! Deterministic Hindu calendar computation for any location and timezone.
//! All dates shown in the app come from this engine, never from the AI model.

pub mod types;
pub mod astronomy;
pub mod sunrise;
pub mod tithi;
pub mod calendar;
pub mod festivals;

pub use types::*;
pub use astronomy::*;
pub use sunrise::*;
pub use tithi::*;
pub use calendar::*;
pub use festivals::*;

/// Compute full panchang for a given date and location.
pub fn get_panchang(date: chrono::NaiveDate, location: &Location, conventions: &Conventions) -> DayPanchang {
    let jd = date_to_jd(date);
    let tz_offset = get_tz_offset(date, &location.timezone);

    // Sunrise and sunset for this location
    let sunrise = calculate_sunrise(jd, location.lat, location.lon, tz_offset);
    let sunset = calculate_sunset(jd, location.lat, location.lon, tz_offset);
    let moonrise = calculate_moonrise(jd, location.lat, location.lon, tz_offset);

    // Tithi at sunrise (governs the day in most traditions)
    let sunrise_jd = sunrise.map(|s| jd + s / 24.0).unwrap_or(jd + 6.0 / 24.0);
    let tithi_info = compute_tithi(sunrise_jd);
    let nakshatra_info = compute_nakshatra(sunrise_jd);
    let yoga_info = compute_yoga(sunrise_jd);
    let karana_info = compute_karana(sunrise_jd);

    // Lunar month determination
    let lunar_month = determine_lunar_month(date, location, conventions);

    DayPanchang {
        date,
        sunrise,
        sunset,
        moonrise,
        tithi: tithi_info,
        nakshatra: nakshatra_info,
        yoga: yoga_info,
        karana: karana_info,
        paksha: tithi_info.paksha(),
        lunar_month,
        weekday: date.weekday(),
    }
}

/// Compute panchang for a date range.
pub fn get_panchang_range(
    start: chrono::NaiveDate,
    end: chrono::NaiveDate,
    location: &Location,
    conventions: &Conventions,
) -> Vec<DayPanchang> {
    let mut results = Vec::new();
    let mut date = start;
    while date <= end {
        results.push(get_panchang(date, location, conventions));
        date += chrono::Duration::days(1);
    }
    results
}
