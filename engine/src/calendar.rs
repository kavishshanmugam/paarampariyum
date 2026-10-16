//! Hindu calendar month and year determination.
//!
//! Maps Gregorian dates to lunar months, handles amanta/purnimanta naming,
//! Adhik Maas (intercalary months), and Vikram/Shaka year numbering.

use chrono::Datelike;
use super::astronomy::*;
use super::types::*;

/// Determine the lunar month for a given date and conventions.
pub fn determine_lunar_month(
    date: chrono::NaiveDate,
    _location: &Location,
    conventions: &Conventions,
) -> LunarMonthInfo {
    let jd = date_to_jd(date);

    // Find the most recent new moon before this date
    let new_moon_jd = find_previous_new_moon(jd);

    // Sun's sidereal longitude at new moon determines the month
    let sun_lon = sun_sidereal_longitude(new_moon_jd);
    let rashi = (sun_lon / 30.0).floor() as u8; // 0-11

    // Map rashi to lunar month
    // Rashi 0 (Mesha/Aries) -> Chaitra, etc.
    let month = LunarMonth::from_index(rashi);

    // Check for Adhik Maas: if the Sun doesn't change rashi during this lunar month
    let next_new_moon_jd = find_next_new_moon(jd);
    let sun_lon_next = sun_sidereal_longitude(next_new_moon_jd);
    let rashi_next = (sun_lon_next / 30.0).floor() as u8;
    let is_adhik = rashi == rashi_next;

    // Determine which paksha we're in
    let tithi_info = super::tithi::compute_tithi(jd);
    let in_krishna = tithi_info.tithi_number > 15;

    // Adjust month name for purnimanta system
    let display_month = match conventions.month_system {
        MonthSystem::Amanta => month,
        MonthSystem::Purnimanta => {
            if in_krishna {
                LunarMonth::from_index((rashi + 1) % 12)
            } else {
                month
            }
        }
    };

    // Year calculation
    let gregorian_year = date.year();
    let vikram = if date.month() >= 3 {
        (gregorian_year + 57) as u16
    } else {
        (gregorian_year + 56) as u16
    };
    let shaka = vikram - 135;

    LunarMonthInfo {
        month: display_month,
        is_adhik,
        year_vikram: vikram,
        year_shaka: shaka,
    }
}

/// Approximate the JD of a new moon near a given lunation number k.
///
/// Based on Meeus, "Astronomical Algorithms", Chapter 49.
/// k = 0 is the new moon of January 6, 2000.
fn new_moon_jd(k: f64) -> f64 {
    let t = k / 1236.85;
    let t2 = t * t;
    let t3 = t2 * t;
    let t4 = t3 * t;

    // Mean phase JD
    let mut jd = 2451550.09766 + 29.530588861 * k
        + 0.00015437 * t2
        - 0.000000150 * t3
        + 0.00000000073 * t4;

    // Sun's mean anomaly
    let m = normalize_degrees(2.5534 + 29.10535670 * k - 0.0000014 * t2 - 0.00000011 * t3);
    let m_rad = m * std::f64::consts::PI / 180.0;

    // Moon's mean anomaly
    let mp = normalize_degrees(201.5643 + 385.81693528 * k + 0.0107582 * t2
        + 0.00001238 * t3 - 0.000000058 * t4);
    let mp_rad = mp * std::f64::consts::PI / 180.0;

    // Moon's argument of latitude
    let f = normalize_degrees(160.7108 + 390.67050284 * k - 0.0016118 * t2
        - 0.00000227 * t3 + 0.000000011 * t4);
    let f_rad = f * std::f64::consts::PI / 180.0;

    // Correction for new moon
    let e = 1.0 - 0.002516 * t - 0.0000074 * t2;

    jd += -0.40720 * mp_rad.sin()
        + 0.17241 * e * m_rad.sin()
        + 0.01608 * (2.0 * mp_rad).sin()
        + 0.01039 * (2.0 * f_rad).sin()
        + 0.00739 * e * (mp_rad - m_rad).sin();

    jd
}

/// Find the lunation number k closest to a given JD.
fn jd_to_lunation(jd: f64) -> f64 {
    let year = 2000.0 + (jd - 2451545.0) / 365.25;
    ((year - 2000.0) * 12.3685).round()
}

/// Find the most recent new moon before the given JD.
pub fn find_previous_new_moon(jd: f64) -> f64 {
    let mut k = jd_to_lunation(jd);
    // Try the nearest new moon and go backwards if needed
    loop {
        let nm = new_moon_jd(k);
        if nm < jd {
            return nm;
        }
        k -= 1.0;
        if k < jd_to_lunation(jd) - 3.0 {
            break;
        }
    }
    // Fallback
    new_moon_jd(jd_to_lunation(jd) - 1.0)
}

/// Find the next new moon after the given JD.
pub fn find_next_new_moon(jd: f64) -> f64 {
    let mut k = jd_to_lunation(jd);
    loop {
        let nm = new_moon_jd(k);
        if nm > jd {
            return nm;
        }
        k += 1.0;
        if k > jd_to_lunation(jd) + 3.0 {
            break;
        }
    }
    new_moon_jd(jd_to_lunation(jd) + 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lunar_month_october_2026() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let location = Location::melbourne();
        let conventions = Conventions::default();
        let month_info = determine_lunar_month(date, &location, &conventions);

        println!("Oct 15 2026: {} (adhik: {}, Vikram: {}, Shaka: {})",
            month_info.month.name(), month_info.is_adhik,
            month_info.year_vikram, month_info.year_shaka);

        // Mid-October 2026 should be near Ashvina/Kartika
        assert!(
            month_info.month == LunarMonth::Ashvina ||
            month_info.month == LunarMonth::Kartika ||
            month_info.month == LunarMonth::Bhadrapada,
            "Expected Ashvina or nearby month, got {:?}", month_info.month
        );
    }

    #[test]
    fn test_vikram_year() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let location = Location::melbourne();
        let conventions = Conventions::default();
        let month_info = determine_lunar_month(date, &location, &conventions);
        assert_eq!(month_info.year_vikram, 2083);
        assert_eq!(month_info.year_shaka, 1948);
    }

    #[test]
    fn test_find_new_moon() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let jd = date_to_jd(date);
        let new_moon = find_previous_new_moon(jd);
        assert!(new_moon < jd, "Previous new moon should be before the given date");
        assert!(jd - new_moon < 30.0, "Previous new moon should be within 30 days, diff = {}", jd - new_moon);

        let new_moon_date = jd_to_date(new_moon);
        println!("Previous new moon: {}", new_moon_date);
    }

    #[test]
    fn test_new_moon_accuracy() {
        // The new moon in October 2026 is around Oct 10
        // The next one is around Nov 8 (Diwali Amavasya)
        let jd = date_to_jd(chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap());
        let nm = find_previous_new_moon(jd);
        let nm_date = jd_to_date(nm);
        println!("New moon before Oct 15 2026: {}", nm_date);
        // Should be around Oct 8-12
        assert!(nm_date.month() == 10 && nm_date.day() >= 7 && nm_date.day() <= 13,
            "Expected new moon around Oct 10, got {}", nm_date);

        // Next new moon should be around Nov 8 (Diwali)
        let next_nm = find_next_new_moon(jd);
        let next_nm_date = jd_to_date(next_nm);
        println!("Next new moon after Oct 15 2026: {}", next_nm_date);
        assert!(next_nm_date.month() == 11 && next_nm_date.day() >= 6 && next_nm_date.day() <= 12,
            "Expected next new moon around Nov 8, got {}", next_nm_date);
    }
}
