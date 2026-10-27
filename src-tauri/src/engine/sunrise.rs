//! Sunrise, sunset, and moonrise calculations for any coordinates.
//!
//! Uses the NOAA Solar Calculator algorithm, which is well-tested
//! and gives results within ~1 minute of the actual time.

use std::f64::consts::PI;
use super::astronomy::*;

const DEG_TO_RAD: f64 = PI / 180.0;
const RAD_TO_DEG: f64 = 180.0 / PI;

/// Calculate sunrise for a given JD (at 0h UT), latitude, longitude.
/// Returns hours from midnight in local time, or None if no sunrise.
pub fn calculate_sunrise(jd: f64, lat: f64, lon: f64, tz_offset: f64) -> Option<f64> {
    sun_rise_set(jd, lat, lon, tz_offset, true)
}

/// Calculate sunset for a given JD (at 0h UT), latitude, longitude.
/// Returns hours from midnight in local time, or None if no sunset.
pub fn calculate_sunset(jd: f64, lat: f64, lon: f64, tz_offset: f64) -> Option<f64> {
    sun_rise_set(jd, lat, lon, tz_offset, false)
}

/// NOAA-based sunrise/sunset calculation.
///
/// JD should be for 0h UT of the desired date.
/// Returns local time in fractional hours.
fn sun_rise_set(jd: f64, lat: f64, lon: f64, tz_offset: f64, is_rise: bool) -> Option<f64> {
    // Use noon UT as initial approximation for declination and EoT
    let jd_noon = jd + 0.5; // noon UT
    let t = (jd_noon - 2451545.0) / 36525.0;

    // Sun's mean longitude
    let l0 = normalize_degrees(280.46646 + 36000.76983 * t + 0.0003032 * t * t);

    // Sun's mean anomaly
    let m = normalize_degrees(357.52911 + 35999.05029 * t - 0.0001537 * t * t);
    let m_rad = m * DEG_TO_RAD;

    // Equation of center
    let c = (1.9146 - 0.004817 * t - 0.000014 * t * t) * m_rad.sin()
        + (0.019993 - 0.000101 * t) * (2.0 * m_rad).sin()
        + 0.00029 * (3.0 * m_rad).sin();

    // Sun's true longitude
    let sun_lon = normalize_degrees(l0 + c);

    // Sun's apparent longitude
    let omega = 125.04 - 1934.136 * t;
    let sun_app_lon = sun_lon - 0.00569 - 0.00478 * (omega * DEG_TO_RAD).sin();

    // Obliquity of the ecliptic
    let obliquity = 23.4393 - 0.01300 * t;
    let obliquity_corr = obliquity + 0.00256 * (omega * DEG_TO_RAD).cos();

    // Sun's declination
    let dec = ((obliquity_corr * DEG_TO_RAD).sin() * (sun_app_lon * DEG_TO_RAD).sin())
        .asin() * RAD_TO_DEG;

    // Equation of Time (minutes)
    let y = ((obliquity_corr / 2.0) * DEG_TO_RAD).tan().powi(2);
    let l0_rad = l0 * DEG_TO_RAD;
    let eot = 4.0 * RAD_TO_DEG * (
        y * (2.0 * l0_rad).sin()
        - 2.0 * 0.016709 * m_rad.sin() // eccentricity approximation
        + 4.0 * 0.016709 * y * m_rad.sin() * (2.0 * l0_rad).cos()
        - 0.5 * y * y * (4.0 * l0_rad).sin()
        - 1.25 * 0.016709 * 0.016709 * (2.0 * m_rad).sin()
    );

    // Hour angle for sunrise/sunset
    let lat_rad = lat * DEG_TO_RAD;
    let dec_rad = dec * DEG_TO_RAD;

    // Standard altitude: -0.8333 degrees (includes refraction)
    let zenith = 90.8333 * DEG_TO_RAD;

    let cos_ha = (zenith.cos() - lat_rad.sin() * dec_rad.sin())
        / (lat_rad.cos() * dec_rad.cos());

    if cos_ha > 1.0 {
        return None; // Sun doesn't rise
    }
    if cos_ha < -1.0 {
        return None; // Sun doesn't set
    }

    let ha = cos_ha.acos() * RAD_TO_DEG; // degrees

    // Solar noon in minutes from midnight (local)
    let solar_noon_min = 720.0 - 4.0 * lon - eot + tz_offset * 60.0;

    // Sunrise/sunset time in minutes from midnight
    let event_min = if is_rise {
        solar_noon_min - ha * 4.0
    } else {
        solar_noon_min + ha * 4.0
    };

    Some(event_min / 60.0) // Convert to hours
}

/// Calculate moonrise for a given JD, latitude, longitude.
/// Returns hours from midnight in local time, or None if no moonrise on this day.
pub fn calculate_moonrise(jd: f64, lat: f64, lon: f64, tz_offset: f64) -> Option<f64> {
    let lat_rad = lat * DEG_TO_RAD;
    let moon_altitude_threshold = 0.125; // degrees, accounts for parallax and refraction

    // Search for moonrise by checking every 30 minutes
    let mut prev_alt = -999.0;
    let mut best_time: Option<f64> = None;

    for half_hour in 0..48 {
        let h = half_hour as f64 * 0.5;
        let jd_h = jd + (h - tz_offset) / 24.0;

        let moon_dec = moon_declination(jd_h) * DEG_TO_RAD;
        let moon_ra = moon_right_ascension(jd_h);
        let lst = gmst(jd_h) + lon / 15.0;
        let ha = (lst - moon_ra) * 15.0 * DEG_TO_RAD;

        let alt = (lat_rad.sin() * moon_dec.sin()
            + lat_rad.cos() * moon_dec.cos() * ha.cos())
        .asin()
            * RAD_TO_DEG;

        if prev_alt < moon_altitude_threshold && alt >= moon_altitude_threshold && half_hour > 0 {
            let frac = (moon_altitude_threshold - prev_alt) / (alt - prev_alt);
            best_time = Some(h - 0.5 + frac * 0.5);
            break;
        }

        prev_alt = alt;
    }

    best_time
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_melbourne_sunrise_october() {
        // Melbourne, Oct 15 2026 (AEDT, UTC+11)
        // Expected sunrise around 6:20 AM AEDT
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let jd = date_to_jd(date);
        let sunrise = calculate_sunrise(jd, -37.8136, 144.9631, 11.0);
        assert!(sunrise.is_some(), "Melbourne should have sunrise in October");
        let sr = sunrise.unwrap();
        println!("Melbourne sunrise: {}:{:02}", sr as u32, ((sr - (sr as u32) as f64) * 60.0) as u32);
        assert!(sr > 5.5 && sr < 7.5, "Melbourne sunrise in Oct should be ~6:20, got {}:{:02}",
            sr as u32, ((sr - (sr as u32) as f64) * 60.0) as u32);
    }

    #[test]
    fn test_melbourne_sunset_october() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let jd = date_to_jd(date);
        let sunset = calculate_sunset(jd, -37.8136, 144.9631, 11.0);
        assert!(sunset.is_some());
        let ss = sunset.unwrap();
        println!("Melbourne sunset: {}:{:02}", ss as u32, ((ss - (ss as u32) as f64) * 60.0) as u32);
        assert!(ss > 18.5 && ss < 20.5, "Melbourne sunset in Oct should be ~19:20, got {}:{:02}",
            ss as u32, ((ss - (ss as u32) as f64) * 60.0) as u32);
    }

    #[test]
    fn test_delhi_sunrise_october() {
        // Delhi, Oct 15 2026 (IST, UTC+5.5)
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let jd = date_to_jd(date);
        let sunrise = calculate_sunrise(jd, 28.6139, 77.2090, 5.5);
        assert!(sunrise.is_some());
        let sr = sunrise.unwrap();
        println!("Delhi sunrise: {}:{:02}", sr as u32, ((sr - (sr as u32) as f64) * 60.0) as u32);
        assert!(sr > 5.5 && sr < 7.0, "Delhi sunrise in Oct should be ~6:15, got {}:{:02}",
            sr as u32, ((sr - (sr as u32) as f64) * 60.0) as u32);
    }
}
