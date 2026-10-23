//! Sunrise, sunset, and moonrise calculations for any coordinates.
//!
//! Based on Meeus, "Astronomical Algorithms", chapters 15 and 25.
//! The Hindu day runs from sunrise to sunrise, so this is foundational.

use std::f64::consts::PI;
use super::astronomy::*;

const DEG_TO_RAD: f64 = PI / 180.0;
const RAD_TO_DEG: f64 = 180.0 / PI;

/// Standard altitude for sunrise/sunset: -0.8333 degrees
/// (accounts for refraction and the Sun's angular radius)
const SUNRISE_ALTITUDE: f64 = -0.8333;

/// Calculate sunrise for a given JD (at 0h UT), latitude, longitude.
/// Returns hours from midnight in local time, or None if no sunrise.
pub fn calculate_sunrise(jd: f64, lat: f64, lon: f64, tz_offset: f64) -> Option<f64> {
    calculate_sun_event(jd, lat, lon, tz_offset, true)
}

/// Calculate sunset for a given JD (at 0h UT), latitude, longitude.
/// Returns hours from midnight in local time, or None if no sunset.
pub fn calculate_sunset(jd: f64, lat: f64, lon: f64, tz_offset: f64) -> Option<f64> {
    calculate_sun_event(jd, lat, lon, tz_offset, false)
}

/// Core sunrise/sunset calculation using the hour angle method.
fn calculate_sun_event(jd: f64, lat: f64, lon: f64, tz_offset: f64, is_rise: bool) -> Option<f64> {
    // Start with transit time, then iterate
    let n = jd - 2451545.0 + 0.5; // days from J2000 noon
    let j_star = n - lon / 360.0; // approximate solar noon (days)

    // Solar noon in JD
    let t = j_star / 36525.0;
    let eot = equation_of_time(jd);

    // Solar noon in local hours
    let noon_ut = 12.0 - eot / 60.0 - lon / 15.0;
    let noon_local = noon_ut + tz_offset;

    // Sun's declination at noon
    let jd_noon = jd + noon_ut / 24.0;
    let dec = sun_declination(jd_noon) * DEG_TO_RAD;
    let lat_rad = lat * DEG_TO_RAD;

    // Hour angle for the desired altitude
    let cos_h = (SUNRISE_ALTITUDE.to_radians().sin() - lat_rad.sin() * dec.sin())
        / (lat_rad.cos() * dec.cos());

    // Check if sun rises/sets at this latitude on this day
    if cos_h > 1.0 {
        return None; // Sun never rises (perpetual night)
    }
    if cos_h < -1.0 {
        return None; // Sun never sets (midnight sun)
    }

    let h = cos_h.acos() * RAD_TO_DEG / 15.0; // hour angle in hours

    let event = if is_rise {
        noon_local - h
    } else {
        noon_local + h
    };

    // Iterative refinement (one pass)
    let jd_event = jd + (event - tz_offset) / 24.0;
    let dec2 = sun_declination(jd_event) * DEG_TO_RAD;
    let eot2 = equation_of_time(jd_event);

    let noon_ut2 = 12.0 - eot2 / 60.0 - lon / 15.0;
    let noon_local2 = noon_ut2 + tz_offset;

    let cos_h2 = (SUNRISE_ALTITUDE.to_radians().sin() - lat_rad.sin() * dec2.sin())
        / (lat_rad.cos() * dec2.cos());

    if cos_h2.abs() > 1.0 {
        return Some(event); // Fall back to first approximation
    }

    let h2 = cos_h2.acos() * RAD_TO_DEG / 15.0;

    let refined = if is_rise {
        noon_local2 - h2
    } else {
        noon_local2 + h2
    };

    Some(refined)
}

/// Calculate moonrise for a given JD, latitude, longitude.
/// Returns hours from midnight in local time, or None if no moonrise on this day.
///
/// Moonrise is more complex than sunrise because the Moon moves ~13 degrees/day,
/// so we need to interpolate its position.
pub fn calculate_moonrise(jd: f64, lat: f64, lon: f64, tz_offset: f64) -> Option<f64> {
    let lat_rad = lat * DEG_TO_RAD;
    // Moon's horizontal parallax correction: about -0.7275 degrees typical
    let moon_altitude = 0.125; // degrees (accounts for parallax and refraction)

    // Search for moonrise by checking hour by hour
    let mut prev_ha_below = true;
    let mut best_time: Option<f64> = None;

    for hour in 0..24 {
        let h = hour as f64;
        let jd_h = jd + (h - tz_offset) / 24.0;

        // Moon's position
        let moon_dec = moon_declination(jd_h) * DEG_TO_RAD;
        let moon_ra = moon_right_ascension(jd_h); // hours
        let lst = gmst(jd_h) + lon / 15.0; // local sidereal time in hours
        let ha = (lst - moon_ra) * 15.0 * DEG_TO_RAD; // hour angle in radians

        // Moon's altitude
        let alt = (lat_rad.sin() * moon_dec.sin()
            + lat_rad.cos() * moon_dec.cos() * ha.cos())
        .asin()
            * RAD_TO_DEG;

        let is_below = alt < moon_altitude;

        if !is_below && prev_ha_below && hour > 0 {
            // Moonrise between this hour and the previous
            // Linear interpolation for the crossing time
            let jd_prev = jd + ((h - 1.0) - tz_offset) / 24.0;
            let moon_dec_prev = moon_declination(jd_prev) * DEG_TO_RAD;
            let moon_ra_prev = moon_right_ascension(jd_prev);
            let lst_prev = gmst(jd_prev) + lon / 15.0;
            let ha_prev = (lst_prev - moon_ra_prev) * 15.0 * DEG_TO_RAD;
            let alt_prev = (lat_rad.sin() * moon_dec_prev.sin()
                + lat_rad.cos() * moon_dec_prev.cos() * ha_prev.cos())
            .asin()
                * RAD_TO_DEG;

            // Interpolate
            let frac = (moon_altitude - alt_prev) / (alt - alt_prev);
            best_time = Some(h - 1.0 + frac);
            break;
        }

        prev_ha_below = is_below;
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
        // Expected sunset around 19:20 AEDT
        assert!(ss > 18.5 && ss < 20.5, "Melbourne sunset in Oct should be ~19:20, got {}:{:02}",
            ss as u32, ((ss - (ss as u32) as f64) * 60.0) as u32);
    }

    #[test]
    fn test_delhi_sunrise_october() {
        // Delhi, Oct 15 2026 (IST, UTC+5.5)
        // Expected sunrise around 6:15 AM IST
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let jd = date_to_jd(date);
        let sunrise = calculate_sunrise(jd, 28.6139, 77.2090, 5.5);
        assert!(sunrise.is_some());
        let sr = sunrise.unwrap();
        assert!(sr > 5.5 && sr < 7.0, "Delhi sunrise in Oct should be ~6:15, got {}:{:02}",
            sr as u32, ((sr - (sr as u32) as f64) * 60.0) as u32);
    }
}
