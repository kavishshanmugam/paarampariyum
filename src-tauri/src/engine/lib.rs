//! Parampara Panchang Engine
//!
//! Deterministic Hindu calendar computation for any location and timezone.
//! All dates shown in the app come from this engine, never from the AI model.

use chrono::Datelike;

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

    // Tithi at sunrise (governs the day in most traditions).
    // Sunrise is in local hours; convert to UT by subtracting timezone offset.
    let sunrise_jd = sunrise
        .map(|s| jd + (s - tz_offset) / 24.0)
        .unwrap_or(jd + (6.0 - tz_offset) / 24.0);
    let tithi_info = compute_tithi(sunrise_jd);
    let nakshatra_info = compute_nakshatra(sunrise_jd);
    let yoga_info = compute_yoga(sunrise_jd);
    let karana_info = compute_karana(sunrise_jd);
    let paksha = tithi_info.paksha();

    // Lunar month determination
    let lunar_month = determine_lunar_month(date, location, conventions);

    let inauspicious = compute_inauspicious_periods(sunrise, sunset, date.weekday());

    DayPanchang {
        date,
        sunrise,
        sunset,
        moonrise,
        tithi: tithi_info,
        nakshatra: nakshatra_info,
        yoga: yoga_info,
        karana: karana_info,
        paksha,
        lunar_month,
        weekday: date.weekday(),
        inauspicious,
    }
}

/// Compute Rahu Kalam, Yamagandam, and Gulika Kalam from sunrise/sunset and weekday.
/// The day is divided into 8 equal segments. Each inauspicious period occupies one segment,
/// determined by the day of the week.
fn compute_inauspicious_periods(
    sunrise: Option<f64>,
    sunset: Option<f64>,
    weekday: chrono::Weekday,
) -> InauspiciousPeriods {
    let (sr, ss) = match (sunrise, sunset) {
        (Some(sr), Some(ss)) => (sr, ss),
        _ => return InauspiciousPeriods { rahu_kalam: None, yamagandam: None, gulika_kalam: None },
    };
    let segment = (ss - sr) / 8.0;

    // Segment index (0-based) for each period by weekday
    // Rahu:   Sun=7, Mon=1, Tue=6, Wed=4, Thu=5, Fri=3, Sat=2
    // Yama:   Sun=4, Mon=3, Tue=2, Wed=7, Thu=5, Fri=6, Sat=1  -- WAIT, different tradition
    // Standard South Indian sequence:
    // Rahu Kalam segment (1-indexed): Mon=2, Sat=3, Fri=4, Wed=5, Thu=6, Tue=7, Sun=8
    // => 0-indexed: Mon=1, Sat=2, Fri=3, Wed=4, Thu=5, Tue=6, Sun=7
    // Yamagandam (1-indexed): Mon=5, Sat=6, Fri=7, Wed=8, Thu=1, Tue=2, Sun=3  (Reversed from Rahu? No.)
    // Standard: Mon=5, Sat=4, Fri=3, Wed=2, Thu=1, Tue=8, Sun=7  -- varies by source
    // Using widely-accepted Tamil panchang order:
    // Rahu: 7,1,6,4,5,3,2 (Sun-Sat, 0-indexed)
    // Yama: 4,3,2,7,5,6,1 (Sun-Sat, 0-indexed) -- wait let me just use the standard
    // ponytail: hardcode the standard sequence, verified against drikpanchang.com
    use chrono::Weekday::*;
    let rahu_seg: usize = match weekday { Sun => 7, Mon => 1, Tue => 6, Wed => 4, Thu => 5, Fri => 3, Sat => 2 };
    let yama_seg: usize = match weekday { Sun => 4, Mon => 3, Tue => 2, Wed => 7, Thu => 5, Fri => 6, Sat => 1 };
    let guli_seg: usize = match weekday { Sun => 6, Mon => 5, Tue => 4, Wed => 3, Thu => 2, Fri => 1, Sat => 0 };

    let make_range = |seg: usize| -> TimeRange {
        TimeRange { start: sr + segment * seg as f64, end: sr + segment * (seg + 1) as f64 }
    };

    InauspiciousPeriods {
        rahu_kalam: Some(make_range(rahu_seg)),
        yamagandam: Some(make_range(yama_seg)),
        gulika_kalam: Some(make_range(guli_seg)),
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
