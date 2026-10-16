//! Astronomical calculations based on Jean Meeus, "Astronomical Algorithms"
//!
//! These provide Sun and Moon positions accurate enough for panchang computation.
//! All angles in degrees unless noted. Julian Day (JD) is the time unit.

use std::f64::consts::PI;
use chrono::{Datelike, Offset};

const DEG_TO_RAD: f64 = PI / 180.0;
const RAD_TO_DEG: f64 = 180.0 / PI;

/// Lahiri ayanamsa: the offset from tropical to sidereal zodiac.
/// Reference: Indian Calendar Reform Committee, Lahiri value.
/// Ayanamsa on J2000.0 (JD 2451545.0) is approximately 23.853 degrees.
/// It increases by about 50.29" per year (precession).
pub fn lahiri_ayanamsa(jd: f64) -> f64 {
    let t = (jd - 2451545.0) / 36525.0; // Julian centuries from J2000.0
    // Lahiri ayanamsa: 23°51'11.3" at J2000 + precession
    // 23.85314 + 50.2888"/yr * T (in centuries)
    23.85314 + (50.2888 / 3600.0) * t * 100.0
}

/// Convert a chrono NaiveDate to Julian Day Number.
pub fn date_to_jd(date: chrono::NaiveDate) -> f64 {
    let y = date.year() as f64;
    let m = date.month() as f64;
    let d = date.day() as f64;

    let (y2, m2) = if m <= 2.0 {
        (y - 1.0, m + 12.0)
    } else {
        (y, m)
    };

    let a = (y2 / 100.0).floor();
    let b = 2.0 - a + (a / 4.0).floor();

    (365.25 * (y2 + 4716.0)).floor() + (30.6001 * (m2 + 1.0)).floor() + d + b - 1524.5
}

/// Convert Julian Day to chrono NaiveDate.
pub fn jd_to_date(jd: f64) -> chrono::NaiveDate {
    let jd = jd + 0.5;
    let z = jd.floor() as i64;
    let _f = jd - z as f64;

    let a = if z < 2299161 {
        z
    } else {
        let alpha = ((z as f64 - 1867216.25) / 36524.25).floor() as i64;
        z + 1 + alpha - alpha / 4
    };

    let b = a + 1524;
    let c = ((b as f64 - 122.1) / 365.25).floor() as i64;
    let d = (365.25 * c as f64).floor() as i64;
    let e = ((b - d) as f64 / 30.6001).floor() as i64;

    let day = (b - d - (30.6001 * e as f64).floor() as i64) as u32;
    let month = if e < 14 { e - 1 } else { e - 13 } as u32;
    let year = if month > 2 { c - 4716 } else { c - 4715 } as i32;

    chrono::NaiveDate::from_ymd_opt(year, month, day)
        .unwrap_or_else(|| chrono::NaiveDate::from_ymd_opt(year, month, day.min(28)).unwrap())
}

/// Get timezone offset in hours for a given date and IANA timezone.
pub fn get_tz_offset(date: chrono::NaiveDate, tz_name: &str) -> f64 {
    use chrono::TimeZone;
    let tz: chrono_tz::Tz = tz_name.parse().unwrap_or(chrono_tz::Australia::Melbourne);
    let noon = date.and_hms_opt(12, 0, 0).unwrap();
    let dt = tz.from_local_datetime(&noon).earliest().unwrap_or_else(|| {
        tz.from_local_datetime(&noon).latest().unwrap()
    });
    dt.offset().fix().local_minus_utc() as f64 / 3600.0
}

/// Normalize angle to 0-360 degrees.
pub fn normalize_degrees(angle: f64) -> f64 {
    let mut a = angle % 360.0;
    if a < 0.0 {
        a += 360.0;
    }
    a
}

/// Sun's geometric mean longitude (degrees), Meeus Ch. 25
fn sun_mean_longitude(t: f64) -> f64 {
    normalize_degrees(280.46646 + t * (36000.76983 + t * 0.0003032))
}

/// Sun's mean anomaly (degrees), Meeus Ch. 25
fn sun_mean_anomaly(t: f64) -> f64 {
    normalize_degrees(357.52911 + t * (35999.05029 - t * 0.0001537))
}

/// Moon's mean longitude (degrees), Meeus Ch. 47
fn moon_mean_longitude(t: f64) -> f64 {
    normalize_degrees(
        218.3165 + 481267.8813 * t
    )
}

/// Moon's mean anomaly (degrees), Meeus Ch. 47
fn moon_mean_anomaly(t: f64) -> f64 {
    normalize_degrees(
        134.9634 + 477198.8676 * t
    )
}

/// Moon's mean elongation (degrees), Meeus Ch. 47
fn moon_mean_elongation(t: f64) -> f64 {
    normalize_degrees(
        297.8502 + 445267.1115 * t
    )
}

/// Moon's argument of latitude
fn moon_argument_of_latitude(t: f64) -> f64 {
    normalize_degrees(
        93.2720 + 483202.0175 * t
    )
}

/// Eccentricity of Earth's orbit
fn earth_eccentricity(t: f64) -> f64 {
    1.0 - 0.002516 * t - 0.0000074 * t * t
}

/// Sun's equation of center (degrees), Meeus Ch. 25
fn sun_equation_of_center(t: f64) -> f64 {
    let m = sun_mean_anomaly(t) * DEG_TO_RAD;
    (1.9146 - 0.004817 * t - 0.000014 * t * t) * m.sin()
        + (0.019993 - 0.000101 * t) * (2.0 * m).sin()
        + 0.00029 * (3.0 * m).sin()
}

/// Sun's true longitude (tropical, degrees)
pub fn sun_true_longitude(jd: f64) -> f64 {
    let t = (jd - 2451545.0) / 36525.0;
    normalize_degrees(sun_mean_longitude(t) + sun_equation_of_center(t))
}

/// Sun's apparent longitude (includes nutation and aberration)
pub fn sun_apparent_longitude(jd: f64) -> f64 {
    let t = (jd - 2451545.0) / 36525.0;
    let true_lon = sun_true_longitude(jd);
    let omega = 125.04 - 1934.136 * t;
    normalize_degrees(true_lon - 0.00569 - 0.00478 * (omega * DEG_TO_RAD).sin())
}

/// Sun's sidereal longitude (using Lahiri ayanamsa)
pub fn sun_sidereal_longitude(jd: f64) -> f64 {
    normalize_degrees(sun_apparent_longitude(jd) - lahiri_ayanamsa(jd))
}

/// Moon's longitude (tropical, simplified Meeus Ch. 47)
/// This uses the principal terms for accuracy sufficient for tithi computation.
pub fn moon_longitude(jd: f64) -> f64 {
    let t = (jd - 2451545.0) / 36525.0;
    let lp = moon_mean_longitude(t);
    let d = moon_mean_elongation(t) * DEG_TO_RAD;
    let m = sun_mean_anomaly(t) * DEG_TO_RAD;
    let mp = moon_mean_anomaly(t) * DEG_TO_RAD;
    let f = moon_argument_of_latitude(t) * DEG_TO_RAD;
    let e = earth_eccentricity(t);

    // Principal periodic terms for longitude (degrees)
    let mut sl = 0.0;
    sl += 6.289 * mp.sin();
    sl += 1.274 * (2.0 * d - mp).sin();
    sl += 0.658 * (2.0 * d).sin();
    sl += 0.214 * (2.0 * mp).sin();
    sl -= 0.186 * m.sin() * e;
    sl -= 0.114 * (2.0 * f).sin();
    sl += 0.059 * (2.0 * d - 2.0 * mp).sin();
    sl += 0.057 * (2.0 * d - m - mp).sin() * e;
    sl += 0.053 * (2.0 * d + mp).sin();
    sl += 0.046 * (2.0 * d - m).sin() * e;
    sl -= 0.041 * (m - mp).sin() * e;
    sl -= 0.035 * d.sin();
    sl -= 0.031 * (m + mp).sin() * e;

    normalize_degrees(lp + sl)
}

/// Moon's sidereal longitude (using Lahiri ayanamsa)
pub fn moon_sidereal_longitude(jd: f64) -> f64 {
    normalize_degrees(moon_longitude(jd) - lahiri_ayanamsa(jd))
}

/// Sun's declination (degrees), needed for sunrise/sunset
pub fn sun_declination(jd: f64) -> f64 {
    let t = (jd - 2451545.0) / 36525.0;
    let app_lon = sun_apparent_longitude(jd) * DEG_TO_RAD;
    let obliquity = (23.4393 - 0.01300 * t) * DEG_TO_RAD;
    (obliquity.sin() * app_lon.sin()).asin() * RAD_TO_DEG
}

/// Sun's right ascension (degrees)
pub fn sun_right_ascension(jd: f64) -> f64 {
    let t = (jd - 2451545.0) / 36525.0;
    let app_lon = sun_apparent_longitude(jd) * DEG_TO_RAD;
    let obliquity = (23.4393 - 0.01300 * t) * DEG_TO_RAD;
    let ra = (obliquity.cos() * app_lon.sin()).atan2(app_lon.cos());
    normalize_degrees(ra * RAD_TO_DEG)
}

/// Equation of time (minutes), for sunrise/sunset calculation
pub fn equation_of_time(jd: f64) -> f64 {
    let t = (jd - 2451545.0) / 36525.0;
    let l0 = sun_mean_longitude(t) * DEG_TO_RAD;
    let e = earth_eccentricity(t);
    let m = sun_mean_anomaly(t) * DEG_TO_RAD;
    let obliquity = (23.4393 - 0.01300 * t) * DEG_TO_RAD;

    let y = (obliquity / 2.0).tan().powi(2);

    let eot = y * (2.0 * l0).sin()
        - 2.0 * e * m.sin()
        + 4.0 * e * y * m.sin() * (2.0 * l0).cos()
        - 0.5 * y * y * (4.0 * l0).sin()
        - 1.25 * e * e * (2.0 * m).sin();

    eot * RAD_TO_DEG * 4.0 // Convert to minutes
}

/// Moon's declination (degrees), simplified
pub fn moon_declination(jd: f64) -> f64 {
    let t = (jd - 2451545.0) / 36525.0;
    let moon_lon = moon_longitude(jd) * DEG_TO_RAD;
    let f = moon_argument_of_latitude(t) * DEG_TO_RAD;
    let obliquity = (23.4393 - 0.01300 * t) * DEG_TO_RAD;

    // Simplified: use ecliptic latitude approximation
    let moon_lat = 5.128 * f.sin(); // degrees
    let moon_lat_rad = moon_lat * DEG_TO_RAD;

    let dec = (moon_lat_rad.cos() * obliquity.sin() * moon_lon.sin()
        + moon_lat_rad.sin() * obliquity.cos())
    .asin();

    dec * RAD_TO_DEG
}

/// Moon's right ascension (hours), simplified
pub fn moon_right_ascension(jd: f64) -> f64 {
    let t = (jd - 2451545.0) / 36525.0;
    let moon_lon = moon_longitude(jd) * DEG_TO_RAD;
    let f = moon_argument_of_latitude(t) * DEG_TO_RAD;
    let obliquity = (23.4393 - 0.01300 * t) * DEG_TO_RAD;

    let moon_lat = (5.128 * f.sin()) * DEG_TO_RAD;

    let y = obliquity.cos() * moon_lon.sin() * moon_lat.cos()
        - obliquity.sin() * moon_lat.sin();
    let x = moon_lon.cos() * moon_lat.cos();

    let ra = y.atan2(x);
    normalize_degrees(ra * RAD_TO_DEG) / 15.0 // Convert to hours
}

/// Greenwich Mean Sidereal Time (hours) for a given JD
pub fn gmst(jd: f64) -> f64 {
    let t = (jd - 2451545.0) / 36525.0;
    let theta = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
        + 0.000387933 * t * t
        - t * t * t / 38710000.0;
    normalize_degrees(theta) / 15.0 // Convert to hours
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_date_to_jd() {
        // J2000.0 epoch: January 1.5, 2000 = JD 2451545.0
        let date = chrono::NaiveDate::from_ymd_opt(2000, 1, 1).unwrap();
        let jd = date_to_jd(date);
        assert!((jd - 2451544.5).abs() < 0.01, "JD for 2000-01-01 should be ~2451544.5, got {}", jd);
    }

    #[test]
    fn test_jd_roundtrip() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let jd = date_to_jd(date);
        let date2 = jd_to_date(jd);
        assert_eq!(date, date2);
    }

    #[test]
    fn test_lahiri_ayanamsa_2026() {
        // Lahiri ayanamsa for 2026 should be approximately 24.2 degrees
        let date = chrono::NaiveDate::from_ymd_opt(2026, 1, 1).unwrap();
        let jd = date_to_jd(date);
        let aya = lahiri_ayanamsa(jd);
        assert!(aya > 24.0 && aya < 25.0, "Lahiri ayanamsa for 2026 should be ~24.2, got {}", aya);
    }

    #[test]
    fn test_sun_longitude_range() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let jd = date_to_jd(date);
        let lon = sun_sidereal_longitude(jd);
        // Mid-October: sun should be in Virgo/Libra sidereal (~175-210 degrees)
        assert!(lon > 150.0 && lon < 220.0, "Sun sidereal longitude in Oct should be ~180, got {}", lon);
    }

    #[test]
    fn test_melbourne_tz_offset() {
        // October 15, 2026 - AEDT (UTC+11)
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let offset = get_tz_offset(date, "Australia/Melbourne");
        assert_eq!(offset, 11.0, "Melbourne should be UTC+11 in October (AEDT)");
    }

    #[test]
    fn test_melbourne_tz_offset_winter() {
        // July 15, 2026 - AEST (UTC+10)
        let date = chrono::NaiveDate::from_ymd_opt(2026, 7, 15).unwrap();
        let offset = get_tz_offset(date, "Australia/Melbourne");
        assert_eq!(offset, 10.0, "Melbourne should be UTC+10 in July (AEST)");
    }
}
