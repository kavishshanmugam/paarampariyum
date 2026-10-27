//! Tithi (lunar day), Nakshatra, Yoga, and Karana computation.
//!
//! A tithi is defined by each 12 degrees of Moon-Sun elongation.
//! There are 30 tithis in a lunar month (15 in each paksha).

use super::astronomy::*;
use super::types::*;

/// Compute the tithi at a given Julian Day.
///
/// The tithi number (1-30) is determined by the Moon-Sun elongation:
/// - Tithis 1-15: Shukla Paksha (waxing, elongation 0-180)
/// - Tithis 16-30: Krishna Paksha (waning, elongation 180-360)
pub fn compute_tithi(jd: f64) -> TithiInfo {
    let moon_lon = moon_sidereal_longitude(jd);
    let sun_lon = sun_sidereal_longitude(jd);

    // Elongation: difference between Moon and Sun longitude
    let elongation = normalize_degrees(moon_lon - sun_lon);

    // Each tithi spans 12 degrees
    let tithi_number = (elongation / 12.0).floor() as u8 + 1; // 1-30
    let tithi_index = ((tithi_number - 1) % 15) as u8;

    // Determine tithi name
    let name = if tithi_number <= 14 {
        TithiName::from_index(tithi_index)
    } else if tithi_number == 15 {
        TithiName::Purnima
    } else if tithi_number <= 29 {
        TithiName::from_index(tithi_index)
    } else {
        TithiName::Amavasya
    };

    // Find start and end of this tithi by searching for boundary crossings
    let tithi_start_deg = (tithi_number as f64 - 1.0) * 12.0;
    let tithi_end_deg = tithi_number as f64 * 12.0;

    let start_jd = find_elongation_time(jd - 1.5, jd, tithi_start_deg);
    let end_jd = find_elongation_time(jd, jd + 1.5, tithi_end_deg);

    TithiInfo {
        name,
        tithi_number,
        start_jd,
        end_jd,
    }
}

/// Find the JD when Moon-Sun elongation crosses a target value.
/// Uses bisection search for robustness.
fn find_elongation_time(jd_start: f64, jd_end: f64, target_elongation: f64) -> f64 {
    let mut lo = jd_start;
    let mut hi = jd_end;

    for _ in 0..50 {
        let mid = (lo + hi) / 2.0;
        let elong = normalize_degrees(moon_sidereal_longitude(mid) - sun_sidereal_longitude(mid));

        // Handle the 360/0 wrap-around
        let diff = angle_diff(elong, target_elongation);

        if diff.abs() < 0.001 {
            return mid;
        }

        // Determine which half contains the crossing
        let elong_lo = normalize_degrees(moon_sidereal_longitude(lo) - sun_sidereal_longitude(lo));
        let diff_lo = angle_diff(elong_lo, target_elongation);

        if diff_lo.signum() != diff.signum() {
            hi = mid;
        } else {
            lo = mid;
        }
    }

    (lo + hi) / 2.0
}

/// Signed angular difference (-180 to 180)
fn angle_diff(a: f64, b: f64) -> f64 {
    let mut d = a - b;
    while d > 180.0 { d -= 360.0; }
    while d < -180.0 { d += 360.0; }
    d
}

/// Compute the nakshatra at a given Julian Day.
///
/// A nakshatra is one of 27 segments of 13°20' (800 arc-minutes) of the sidereal zodiac,
/// based on the Moon's sidereal longitude.
pub fn compute_nakshatra(jd: f64) -> NakshatraInfo {
    let moon_lon = moon_sidereal_longitude(jd);

    // Each nakshatra spans 13°20' = 13.3333 degrees
    let nakshatra_span = 360.0 / 27.0; // 13.3333...
    let index = (moon_lon / nakshatra_span).floor() as u8;

    let name = NakshatraName::from_index(index);

    // Find start and end times
    let start_deg = index as f64 * nakshatra_span;
    let end_deg = (index as f64 + 1.0) * nakshatra_span;

    let start_jd = find_moon_longitude_time(jd - 1.5, jd, start_deg);
    let end_jd = find_moon_longitude_time(jd, jd + 1.5, end_deg);

    NakshatraInfo {
        name,
        index,
        start_jd,
        end_jd,
    }
}

/// Find when the Moon's sidereal longitude crosses a target value.
fn find_moon_longitude_time(jd_start: f64, jd_end: f64, target: f64) -> f64 {
    let mut lo = jd_start;
    let mut hi = jd_end;

    for _ in 0..50 {
        let mid = (lo + hi) / 2.0;
        let moon_lon = moon_sidereal_longitude(mid);
        let diff = angle_diff(moon_lon, target);

        if diff.abs() < 0.001 {
            return mid;
        }

        let moon_lo = moon_sidereal_longitude(lo);
        let diff_lo = angle_diff(moon_lo, target);

        if diff_lo.signum() != diff.signum() {
            hi = mid;
        } else {
            lo = mid;
        }
    }

    (lo + hi) / 2.0
}

/// Compute yoga at a given Julian Day.
///
/// Yoga is determined by the sum of Sun's and Moon's sidereal longitudes.
/// Each yoga spans 13°20' (same as nakshatra).
pub fn compute_yoga(jd: f64) -> YogaInfo {
    let sun_lon = sun_sidereal_longitude(jd);
    let moon_lon = moon_sidereal_longitude(jd);

    let sum = normalize_degrees(sun_lon + moon_lon);
    let yoga_span = 360.0 / 27.0;
    let index = (sum / yoga_span).floor() as u8;

    let names = [
        "Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana",
        "Atiganda", "Sukarma", "Dhriti", "Shula", "Ganda",
        "Vriddhi", "Dhruva", "Vyaghata", "Harshana", "Vajra",
        "Siddhi", "Vyatipata", "Variyan", "Parigha", "Shiva",
        "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma",
        "Indra", "Vaidhriti",
    ];

    YogaInfo {
        name: names[(index % 27) as usize].to_string(),
        index,
    }
}

/// Compute karana at a given Julian Day.
///
/// A karana is half a tithi (6 degrees of elongation). There are 60 karanas in a month,
/// but only 11 named ones (4 fixed + 7 rotating).
pub fn compute_karana(jd: f64) -> KaranaInfo {
    let moon_lon = moon_sidereal_longitude(jd);
    let sun_lon = sun_sidereal_longitude(jd);
    let elongation = normalize_degrees(moon_lon - sun_lon);

    // Each karana spans 6 degrees
    let karana_index = (elongation / 6.0).floor() as u8; // 0-59

    // Fixed karanas
    let name = match karana_index {
        0 => "Kimstughna".to_string(),
        57 => "Shakuni".to_string(),
        58 => "Chatushpada".to_string(),
        59 => "Nagava".to_string(),
        _ => {
            // Rotating karanas (7 names, cycle through positions 1-56)
            let rotating = [
                "Bava", "Balava", "Kaulava", "Taitila",
                "Garaja", "Vanija", "Vishti",
            ];
            let idx = ((karana_index - 1) % 7) as usize;
            rotating[idx].to_string()
        }
    };

    KaranaInfo {
        name,
        index: karana_index,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tithi_computation() {
        // Test that we get a valid tithi for today
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let jd = date_to_jd(date);
        // Compute at Melbourne sunrise (~6:20 AEDT = ~19:20 UT previous day)
        let sunrise_jd = jd + (6.33 - 11.0) / 24.0; // approximate

        let tithi = compute_tithi(sunrise_jd);
        assert!(tithi.tithi_number >= 1 && tithi.tithi_number <= 30,
            "Tithi number should be 1-30, got {}", tithi.tithi_number);
        assert!(tithi.end_jd > tithi.start_jd,
            "Tithi end should be after start");
    }

    #[test]
    fn test_tithi_full_moon() {
        // Full moon in Oct 2026 is around Oct 25 (new moon Oct 10, +15 days)
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 25).unwrap();
        let jd = date_to_jd(date);
        let tithi = compute_tithi(jd + 0.25); // noon UT
        println!("Oct 25 2026 tithi: {} (number {})", tithi.name.name(), tithi.tithi_number);
        // Should be within a couple days of Purnima (tithi 15)
        assert!(tithi.tithi_number >= 13 && tithi.tithi_number <= 17,
            "Near full moon, tithi should be ~15, got {}", tithi.tithi_number);
    }

    #[test]
    fn test_nakshatra_range() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let jd = date_to_jd(date);
        let nak = compute_nakshatra(jd + 0.25);
        assert!(nak.index < 27, "Nakshatra index should be 0-26, got {}", nak.index);
    }

    #[test]
    fn test_yoga_range() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let jd = date_to_jd(date);
        let yoga = compute_yoga(jd + 0.25);
        assert!(yoga.index < 27, "Yoga index should be 0-26, got {}", yoga.index);
    }

    #[test]
    fn test_karana_range() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let jd = date_to_jd(date);
        let karana = compute_karana(jd + 0.25);
        assert!(karana.index < 60, "Karana index should be 0-59, got {}", karana.index);
    }
}
