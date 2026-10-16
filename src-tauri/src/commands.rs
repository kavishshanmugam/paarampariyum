//! Tauri IPC commands that expose the panchang engine to the frontend.

use parampara_engine::{self as engine, *};

/// Get panchang for a single date
#[tauri::command]
pub fn get_panchang(
    date: String,
    lat: Option<f64>,
    lon: Option<f64>,
    timezone: Option<String>,
    month_system: Option<String>,
    sect: Option<String>,
) -> Result<DayPanchang, String> {
    let date = chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date: {}", e))?;

    let location = Location {
        lat: lat.unwrap_or(-37.8136),
        lon: lon.unwrap_or(144.9631),
        timezone: timezone.unwrap_or_else(|| "Australia/Melbourne".to_string()),
        name: "Melbourne".to_string(),
    };

    let conventions = Conventions {
        month_system: match month_system.as_deref() {
            Some("amanta") => MonthSystem::Amanta,
            _ => MonthSystem::Purnimanta,
        },
        sect: match sect.as_deref() {
            Some("vaishnava") => Sect::Vaishnava,
            _ => Sect::Smarta,
        },
        ayanamsa: Ayanamsa::Lahiri,
    };

    Ok(engine::get_panchang(date, &location, &conventions))
}

/// Get panchang for a date range
#[tauri::command]
pub fn get_panchang_range(
    start: String,
    end: String,
    lat: Option<f64>,
    lon: Option<f64>,
    timezone: Option<String>,
    month_system: Option<String>,
    sect: Option<String>,
) -> Result<Vec<DayPanchang>, String> {
    let start = chrono::NaiveDate::parse_from_str(&start, "%Y-%m-%d")
        .map_err(|e| format!("Invalid start date: {}", e))?;
    let end = chrono::NaiveDate::parse_from_str(&end, "%Y-%m-%d")
        .map_err(|e| format!("Invalid end date: {}", e))?;

    let location = Location {
        lat: lat.unwrap_or(-37.8136),
        lon: lon.unwrap_or(144.9631),
        timezone: timezone.unwrap_or_else(|| "Australia/Melbourne".to_string()),
        name: "Melbourne".to_string(),
    };

    let conventions = Conventions {
        month_system: match month_system.as_deref() {
            Some("amanta") => MonthSystem::Amanta,
            _ => MonthSystem::Purnimanta,
        },
        sect: match sect.as_deref() {
            Some("vaishnava") => Sect::Vaishnava,
            _ => Sect::Smarta,
        },
        ayanamsa: Ayanamsa::Lahiri,
    };

    Ok(engine::get_panchang_range(start, end, &location, &conventions))
}

/// Get festival instances for a date range
#[tauri::command]
pub fn get_festivals(
    start: String,
    end: String,
    lat: Option<f64>,
    lon: Option<f64>,
    timezone: Option<String>,
    month_system: Option<String>,
    sect: Option<String>,
) -> Result<Vec<FestivalInstance>, String> {
    let start = chrono::NaiveDate::parse_from_str(&start, "%Y-%m-%d")
        .map_err(|e| format!("Invalid start date: {}", e))?;
    let end = chrono::NaiveDate::parse_from_str(&end, "%Y-%m-%d")
        .map_err(|e| format!("Invalid end date: {}", e))?;

    let location = Location {
        lat: lat.unwrap_or(-37.8136),
        lon: lon.unwrap_or(144.9631),
        timezone: timezone.unwrap_or_else(|| "Australia/Melbourne".to_string()),
        name: "Melbourne".to_string(),
    };

    let conventions = Conventions {
        month_system: match month_system.as_deref() {
            Some("amanta") => MonthSystem::Amanta,
            _ => MonthSystem::Purnimanta,
        },
        sect: match sect.as_deref() {
            Some("vaishnava") => Sect::Vaishnava,
            _ => Sect::Smarta,
        },
        ayanamsa: Ayanamsa::Lahiri,
    };

    let rules = festivals::default_rules();
    Ok(festivals::evaluate_festivals(start, end, &location, &conventions, &rules))
}

/// Compare dates between two locations (e.g., Melbourne vs India)
#[tauri::command]
pub fn compare_locations(
    date: String,
    lat1: f64, lon1: f64, tz1: String, name1: String,
    lat2: f64, lon2: f64, tz2: String, name2: String,
) -> Result<serde_json::Value, String> {
    let date = chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date: {}", e))?;

    let loc1 = Location { lat: lat1, lon: lon1, timezone: tz1, name: name1.clone() };
    let loc2 = Location { lat: lat2, lon: lon2, timezone: tz2, name: name2.clone() };
    let conv = Conventions::default();

    let p1 = engine::get_panchang(date, &loc1, &conv);
    let p2 = engine::get_panchang(date, &loc2, &conv);

    let different_tithi = p1.tithi.tithi_number != p2.tithi.tithi_number;

    Ok(serde_json::json!({
        "location1": {
            "name": name1,
            "panchang": p1,
        },
        "location2": {
            "name": name2,
            "panchang": p2,
        },
        "different_tithi": different_tithi,
        "explanation": if different_tithi {
            format!(
                "{} has {} at sunrise, while {} has {}. The tithi starts at the same instant everywhere, but sunrise in {} is about {} hours {} than in {}.",
                name1, p1.tithi.name.name(), name2, p2.tithi.name.name(),
                name1,
                "4.5", // placeholder
                if loc1.lon > loc2.lon { "earlier" } else { "later" },
                name2
            )
        } else {
            format!("Both {} and {} have the same tithi ({}) today.", name1, name2, p1.tithi.name.name())
        }
    }))
}
