//! Hindu calendar month and year determination.
//!
//! Maps Gregorian dates to lunar months, handles amanta/purnimanta naming,
//! Adhik Maas (intercalary months), and Vikram/Shaka year numbering.

use super::astronomy::*;
use super::types::*;

/// Determine the lunar month for a given date and conventions.
///
/// The lunar month is determined by which solar month (rashi) the Sun occupies
/// at the new moon that begins the month.
pub fn determine_lunar_month(
    date: chrono::NaiveDate,
    location: &Location,
    conventions: &Conventions,
) -> LunarMonthInfo {
    let jd = date_to_jd(date);

    // Find the most recent new moon (Amavasya) before this date
    let new_moon_jd = find_previous_new_moon(jd);

    // Sun's sidereal longitude at new moon determines the month
    let sun_lon = sun_sidereal_longitude(new_moon_jd);
    let rashi = (sun_lon / 30.0).floor() as u8; // 0-11 (solar month index)

    // Map rashi to lunar month
    // Rashi 0 (Mesha/Aries) -> Chaitra, etc.
    let month = LunarMonth::from_index(rashi);

    // Check for Adhik Maas: if the Sun doesn't change rashi during this lunar month,
    // it's an intercalary month
    let next_new_moon_jd = find_next_new_moon(jd);
    let sun_lon_next = sun_sidereal_longitude(next_new_moon_jd);
    let rashi_next = (sun_lon_next / 30.0).floor() as u8;
    let is_adhik = rashi == rashi_next;

    // Determine which paksha we're in
    let tithi_info = super::tithi::compute_tithi(jd);
    let in_krishna = tithi_info.tithi_number > 15;

    // Adjust month name for purnimanta system
    // In purnimanta, the month name changes at Purnima (full moon)
    // In amanta, it changes at Amavasya (new moon)
    let display_month = match conventions.month_system {
        MonthSystem::Amanta => month,
        MonthSystem::Purnimanta => {
            if in_krishna {
                // In Krishna Paksha under purnimanta, the month name is one ahead
                LunarMonth::from_index((rashi + 1) % 12)
            } else {
                month
            }
        }
    };

    // Year calculation
    // Vikram Samvat: starts at Chaitra Shukla Pratipada
    // Shaka: Vikram - 135 (approximately)
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

/// Find the most recent new moon (Sun-Moon conjunction) before the given JD.
///
/// Uses a search starting from ~30 days before.
pub fn find_previous_new_moon(jd: f64) -> f64 {
    // Start searching from about 35 days before
    let mut search_jd = jd - 35.0;

    // Walk forward in 1-day steps to find where elongation crosses 0/360
    let mut prev_elongation = get_elongation(search_jd);

    for _ in 0..40 {
        search_jd += 1.0;
        let elongation = get_elongation(search_jd);

        // New moon: elongation crosses from ~350+ to ~10 (wraps around 0)
        if prev_elongation > 300.0 && elongation < 60.0 && search_jd <= jd {
            // Found approximate new moon, refine with bisection
            return refine_new_moon(search_jd - 1.0, search_jd);
        }

        prev_elongation = elongation;
    }

    // Fallback: search more carefully
    search_jd = jd - 30.0;
    for _ in 0..60 {
        search_jd += 0.5;
        let elongation = get_elongation(search_jd);
        if elongation < 5.0 && search_jd <= jd {
            return search_jd;
        }
    }

    jd // shouldn't happen
}

/// Find the next new moon after the given JD.
pub fn find_next_new_moon(jd: f64) -> f64 {
    let mut search_jd = jd;
    let mut prev_elongation = get_elongation(search_jd);

    for _ in 0..35 {
        search_jd += 1.0;
        let elongation = get_elongation(search_jd);

        if prev_elongation > 300.0 && elongation < 60.0 {
            return refine_new_moon(search_jd - 1.0, search_jd);
        }

        prev_elongation = elongation;
    }

    jd + 29.53 // approximate synodic month
}

/// Moon-Sun elongation (0-360 degrees)
fn get_elongation(jd: f64) -> f64 {
    normalize_degrees(moon_sidereal_longitude(jd) - sun_sidereal_longitude(jd))
}

/// Refine new moon time using bisection.
fn refine_new_moon(jd_lo: f64, jd_hi: f64) -> f64 {
    let mut lo = jd_lo;
    let mut hi = jd_hi;

    for _ in 0..50 {
        let mid = (lo + hi) / 2.0;
        let elong = get_elongation(mid);

        if elong < 180.0 {
            hi = mid;
        } else {
            lo = mid;
        }
    }

    (lo + hi) / 2.0
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

        // Mid-October 2026 should be in Ashvina or Kartika
        println!("Oct 15 2026: {} (adhik: {}, Vikram: {}, Shaka: {})",
            month_info.month.name(), month_info.is_adhik,
            month_info.year_vikram, month_info.year_shaka);
    }

    #[test]
    fn test_vikram_year() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let location = Location::melbourne();
        let conventions = Conventions::default();
        let month_info = determine_lunar_month(date, &location, &conventions);

        // 2026 + 57 = 2083
        assert_eq!(month_info.year_vikram, 2083);
        assert_eq!(month_info.year_shaka, 1948);
    }

    #[test]
    fn test_find_new_moon() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let jd = date_to_jd(date);
        let new_moon = find_previous_new_moon(jd);
        assert!(new_moon < jd, "Previous new moon should be before the given date");
        assert!(jd - new_moon < 30.0, "Previous new moon should be within 30 days");
    }
}
