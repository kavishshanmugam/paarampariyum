//! Festival rule evaluation.
//!
//! Each observance has a rule defined in YAML that specifies the governing tithi,
//! time-of-day condition, tie-breaks, and sect variants. This module evaluates
//! those rules against computed panchang data to determine festival dates.

use serde::{Deserialize, Serialize};
use super::types::*;

/// A festival rule as loaded from YAML
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FestivalRule {
    pub id: String,
    pub name: String,
    pub name_ta: Option<String>,  // Tamil
    pub name_te: Option<String>,  // Telugu
    pub name_kn: Option<String>,  // Kannada
    pub name_ml: Option<String>,  // Malayalam
    pub festival_type: FestivalType,
    pub basis: RuleBasis,
    pub reason_template: String,
    pub variants: Vec<SectVariant>,
    pub sequence: Option<FestivalSequence>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FestivalType {
    MajorFestival,
    RecurringMonthly,
    RecurringFortnightly,
    SolarTransit,
    Regional,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RuleBasis {
    Lunar {
        month: Option<LunarMonth>,
        paksha: Paksha,
        tithi: TithiName,
        must_prevail_during: TimeWindow,
        tie_break: TieBreak,
        adhik_maas: AdhikMaasBehaviour,
    },
    Solar {
        rashi: u8, // 0-11
        description: String,
    },
    Recurring {
        paksha: Option<Paksha>,
        tithi: TithiName,
        must_prevail_during: TimeWindow,
    },
    /// Nakshatra within a solar month (e.g. Onam = Shravana nakshatra in Chingam/Leo)
    SolarNakshatra {
        solar_rashi: u8,           // Sun's sidereal sign (4 = Leo for Chingam)
        nakshatra: NakshatraName,
        description: String,
    },
    /// Fixed day offset from a solar transit (e.g. Aadi Perukku = Cancer + 17 days)
    SolarOffset {
        rashi: u8,
        day_offset: i16,
        description: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TimeWindow {
    Sunrise,
    Midday,
    Pradosh,   // Evening twilight
    Midnight,
    Moonrise,
    AnyPart,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TieBreak {
    PreviousDay,
    NextDay,
    LongerDuration,
    SectSpecific,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AdhikMaasBehaviour {
    Skip,     // Not observed in Adhik Maas
    Observe,  // Observed in Adhik Maas
    Both,     // Observed in both regular and Adhik
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SectVariant {
    pub sect: Sect,
    pub note: String,
    pub date_offset: Option<i32>, // Days offset from standard
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FestivalSequence {
    pub group: String,
    pub day: u8,
    pub total: u8,
}

/// A resolved festival instance for a specific date and location
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FestivalInstance {
    pub rule_id: String,
    pub name: String,
    pub name_ta: Option<String>,
    pub date: chrono::NaiveDate,
    pub festival_type: FestivalType,
    pub reason: String,
    pub variant_note: Option<String>,
    pub close_call: bool,
    pub close_call_note: Option<String>,
    pub sequence: Option<FestivalSequence>,
}

/// Close-call threshold in minutes. If a tithi boundary falls within this
/// many minutes of the critical time window, the festival is flagged.
const CLOSE_CALL_MINUTES: f64 = 15.0;

/// Check if a tithi boundary is within CLOSE_CALL_MINUTES of a given JD.
/// Returns true if the tithi at (jd - 15min) or (jd + 15min) differs from the tithi at jd.
fn is_close_call(jd: f64, expected_tithi: &TithiName) -> bool {
    let delta = CLOSE_CALL_MINUTES / (24.0 * 60.0); // 15 min in days
    let before = super::tithi::compute_tithi(jd - delta);
    let after = super::tithi::compute_tithi(jd + delta);
    before.name != *expected_tithi || after.name != *expected_tithi
}

fn close_call_note(window_name: &str) -> String {
    format!("Close call: the tithi boundary falls within {} minutes of {}", CLOSE_CALL_MINUTES as u32, window_name)
}

/// Evaluate all festival rules for a date range and location.
pub fn evaluate_festivals(
    start: chrono::NaiveDate,
    end: chrono::NaiveDate,
    location: &Location,
    conventions: &Conventions,
    rules: &[FestivalRule],
) -> Vec<FestivalInstance> {
    let mut instances = Vec::new();
    let panchang_data = super::get_panchang_range(start, end, location, conventions);

    for rule in rules {
        match &rule.basis {
            RuleBasis::Lunar { month, paksha, tithi, must_prevail_during, .. } => {
                for day in &panchang_data {
                    // Match against the canonical Amanta month (festival rules use Amanta names)
                    let month_matches = month.as_ref()
                        .map(|m| *m == day.lunar_month.amanta_month && !day.lunar_month.is_adhik)
                        .unwrap_or(true);

                    // Check tithi at the specified time window
                    let tz_offset = super::astronomy::get_tz_offset(day.date, &location.timezone);
                    let jd = super::astronomy::date_to_jd(day.date);
                    let tithi_matches = match must_prevail_during {
                        TimeWindow::Sunrise => {
                            // Default: tithi at sunrise (already in day.tithi)
                            day.tithi.name == *tithi
                        }
                        TimeWindow::Pradosh => {
                            // Pradosh = evening twilight; use sunset time
                            let evening_h = day.sunset.unwrap_or(18.5);
                            let evening_jd = jd + (evening_h - tz_offset) / 24.0;
                            super::tithi::compute_tithi(evening_jd).name == *tithi
                        }
                        TimeWindow::Midday => {
                            let sunrise_h = day.sunrise.unwrap_or(6.0);
                            let sunset_h = day.sunset.unwrap_or(18.0);
                            let midday_h = (sunrise_h + sunset_h) / 2.0;
                            let midday_jd = jd + (midday_h - tz_offset) / 24.0;
                            super::tithi::compute_tithi(midday_jd).name == *tithi
                        }
                        TimeWindow::Midnight => {
                            // Local midnight = start of next local day
                            let midnight_jd = jd + (24.0 - tz_offset) / 24.0;
                            super::tithi::compute_tithi(midnight_jd).name == *tithi
                        }
                        TimeWindow::Moonrise => {
                            if let Some(mr) = day.moonrise {
                                let mr_jd = jd + (mr - tz_offset) / 24.0;
                                super::tithi::compute_tithi(mr_jd).name == *tithi
                            } else {
                                day.tithi.name == *tithi // fallback to sunrise
                            }
                        }
                        TimeWindow::AnyPart => {
                            // Check if the tithi exists at any point during the day
                            let sunrise_h = day.sunrise.unwrap_or(6.0);
                            let sunset_h = day.sunset.unwrap_or(18.0);
                            let start_jd = jd + (sunrise_h - tz_offset) / 24.0;
                            let end_jd = jd + (sunset_h - tz_offset) / 24.0;
                            // Check sunrise, midday, and sunset
                            let mid_jd = (start_jd + end_jd) / 2.0;
                            super::tithi::compute_tithi(start_jd).name == *tithi
                                || super::tithi::compute_tithi(mid_jd).name == *tithi
                                || super::tithi::compute_tithi(end_jd).name == *tithi
                        }
                    };

                    if month_matches
                        && day.paksha == *paksha
                        && tithi_matches
                    {
                        let reason = rule.reason_template
                            .replace("{tithi}", tithi.name())
                            .replace("{paksha}", paksha.name())
                            .replace("{month}", day.lunar_month.month.name())
                            .replace("{city}", &location.name);

                        let variant_note = rule.variants.iter()
                            .find(|v| v.sect != conventions.sect)
                            .map(|v| v.note.clone());

                        // Close-call detection: check if tithi boundary is near the window time
                        let (cc, cc_note) = {
                            let window_jd = match must_prevail_during {
                                TimeWindow::Sunrise => jd + (day.sunrise.unwrap_or(6.0) - tz_offset) / 24.0,
                                TimeWindow::Pradosh => jd + (day.sunset.unwrap_or(18.5) - tz_offset) / 24.0,
                                TimeWindow::Midday => {
                                    let mid = (day.sunrise.unwrap_or(6.0) + day.sunset.unwrap_or(18.0)) / 2.0;
                                    jd + (mid - tz_offset) / 24.0
                                }
                                TimeWindow::Midnight => jd + (24.0 - tz_offset) / 24.0,
                                TimeWindow::Moonrise => jd + (day.moonrise.unwrap_or(day.sunrise.unwrap_or(6.0)) - tz_offset) / 24.0,
                                TimeWindow::AnyPart => jd + (day.sunrise.unwrap_or(6.0) - tz_offset) / 24.0,
                            };
                            let window_name = match must_prevail_during {
                                TimeWindow::Sunrise => "sunrise",
                                TimeWindow::Pradosh => "pradosh (evening)",
                                TimeWindow::Midday => "midday",
                                TimeWindow::Midnight => "midnight",
                                TimeWindow::Moonrise => "moonrise",
                                TimeWindow::AnyPart => "sunrise",
                            };
                            if is_close_call(window_jd, tithi) {
                                (true, Some(close_call_note(window_name)))
                            } else {
                                (false, None)
                            }
                        };

                        instances.push(FestivalInstance {
                            rule_id: rule.id.clone(),
                            name: rule.name.clone(),
                            name_ta: rule.name_ta.clone(),
                            date: day.date,
                            festival_type: rule.festival_type.clone(),
                            reason,
                            variant_note,
                            close_call: cc,
                            close_call_note: cc_note,
                            sequence: rule.sequence.clone(),
                        });
                    }
                }
            }
            RuleBasis::Solar { rashi, description } => {
                // Solar transit: find when sun enters the target rashi
                for day in &panchang_data {
                    let jd = super::astronomy::date_to_jd(day.date);
                    let sun_lon = super::astronomy::sun_sidereal_longitude(jd);
                    let current_rashi = (sun_lon / 30.0).floor() as u8;

                    let jd_prev = super::astronomy::date_to_jd(
                        day.date - chrono::Duration::days(1)
                    );
                    let sun_lon_prev = super::astronomy::sun_sidereal_longitude(jd_prev);
                    let prev_rashi = (sun_lon_prev / 30.0).floor() as u8;

                    if current_rashi == *rashi && prev_rashi != *rashi {
                        instances.push(FestivalInstance {
                            rule_id: rule.id.clone(),
                            name: rule.name.clone(),
                            name_ta: rule.name_ta.clone(),
                            date: day.date,
                            festival_type: rule.festival_type.clone(),
                            reason: description.clone(),
                            variant_note: None,
                            close_call: false,
                            close_call_note: None,
                            sequence: rule.sequence.clone(),
                        });
                    }
                }
            }
            RuleBasis::SolarNakshatra { solar_rashi, nakshatra, description } => {
                // Find days where sun is in the target rashi and moon's nakshatra matches
                for day in &panchang_data {
                    let jd = super::astronomy::date_to_jd(day.date);
                    let sun_lon = super::astronomy::sun_sidereal_longitude(jd);
                    let current_rashi = (sun_lon / 30.0).floor() as u8;

                    if current_rashi == *solar_rashi && day.nakshatra.name == *nakshatra {
                        instances.push(FestivalInstance {
                            rule_id: rule.id.clone(),
                            name: rule.name.clone(),
                            name_ta: rule.name_ta.clone(),
                            date: day.date,
                            festival_type: rule.festival_type.clone(),
                            reason: description.clone(),
                            variant_note: None,
                            close_call: false,
                            close_call_note: None,
                            sequence: rule.sequence.clone(),
                        });
                    }
                }
            }
            RuleBasis::SolarOffset { rashi, day_offset, description } => {
                // Find the solar transit date, then add the offset
                for day in &panchang_data {
                    let jd = super::astronomy::date_to_jd(day.date);
                    let sun_lon = super::astronomy::sun_sidereal_longitude(jd);
                    let current_rashi = (sun_lon / 30.0).floor() as u8;

                    let jd_prev = super::astronomy::date_to_jd(
                        day.date - chrono::Duration::days(1)
                    );
                    let sun_lon_prev = super::astronomy::sun_sidereal_longitude(jd_prev);
                    let prev_rashi = (sun_lon_prev / 30.0).floor() as u8;

                    // Transit day found; the festival is transit + offset
                    if current_rashi == *rashi && prev_rashi != *rashi {
                        let festival_date = day.date + chrono::Duration::days(*day_offset as i64);
                        if festival_date >= start && festival_date <= end {
                            instances.push(FestivalInstance {
                                rule_id: rule.id.clone(),
                                name: rule.name.clone(),
                                name_ta: rule.name_ta.clone(),
                                date: festival_date,
                                festival_type: rule.festival_type.clone(),
                                reason: description.clone(),
                                variant_note: None,
                                close_call: false,
                                close_call_note: None,
                                sequence: rule.sequence.clone(),
                            });
                        }
                    }
                }
            }
            RuleBasis::Recurring { paksha, tithi, must_prevail_during } => {
                for day in &panchang_data {
                    let paksha_matches = paksha
                        .map(|p| p == day.paksha)
                        .unwrap_or(true);

                    // Check tithi at the specified time window
                    let tz_offset = super::astronomy::get_tz_offset(day.date, &location.timezone);
                    let jd = super::astronomy::date_to_jd(day.date);
                    let tithi_matches = match must_prevail_during {
                        TimeWindow::Pradosh => {
                            let evening_h = day.sunset.unwrap_or(18.5);
                            let evening_jd = jd + (evening_h - tz_offset) / 24.0;
                            super::tithi::compute_tithi(evening_jd).name == *tithi
                        }
                        TimeWindow::Moonrise => {
                            if let Some(mr) = day.moonrise {
                                let mr_jd = jd + (mr - tz_offset) / 24.0;
                                super::tithi::compute_tithi(mr_jd).name == *tithi
                            } else {
                                day.tithi.name == *tithi
                            }
                        }
                        _ => day.tithi.name == *tithi, // Sunrise and others: use sunrise tithi
                    };

                    if paksha_matches && tithi_matches {
                        let reason = rule.reason_template
                            .replace("{tithi}", tithi.name())
                            .replace("{month}", day.lunar_month.month.name());

                        // Close-call detection for recurring rules
                        let (cc, cc_note) = {
                            let window_jd = match must_prevail_during {
                                TimeWindow::Pradosh => jd + (day.sunset.unwrap_or(18.5) - tz_offset) / 24.0,
                                TimeWindow::Moonrise => jd + (day.moonrise.unwrap_or(day.sunrise.unwrap_or(6.0)) - tz_offset) / 24.0,
                                _ => jd + (day.sunrise.unwrap_or(6.0) - tz_offset) / 24.0,
                            };
                            let window_name = match must_prevail_during {
                                TimeWindow::Pradosh => "pradosh (evening)",
                                TimeWindow::Moonrise => "moonrise",
                                _ => "sunrise",
                            };
                            if is_close_call(window_jd, tithi) {
                                (true, Some(close_call_note(window_name)))
                            } else {
                                (false, None)
                            }
                        };

                        instances.push(FestivalInstance {
                            rule_id: rule.id.clone(),
                            name: rule.name.clone(),
                            name_ta: rule.name_ta.clone(),
                            date: day.date,
                            festival_type: rule.festival_type.clone(),
                            reason,
                            variant_note: None,
                            close_call: cc,
                            close_call_note: cc_note,
                            sequence: rule.sequence.clone(),
                        });
                    }
                }
            }
        }
    }

    instances.sort_by_key(|i| i.date);

    // Dedup: when the same rule fires on consecutive days (tithi spans two sunrises),
    // keep only the first occurrence (most panchangs pick the earlier date).
    instances.dedup_by(|b, a| a.rule_id == b.rule_id && (b.date - a.date).num_days() <= 1);

    instances
}

/// Load the default set of festival rules -- South Indian / Tamil focus.
pub fn default_rules() -> Vec<FestivalRule> {
    vec![
        // === DEEPAVALI (2 days in South Indian tradition) ===
        FestivalRule {
            id: "naraka-chaturdashi".into(),
            name: "Deepavali".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("\u{0BA4}\u{0BC0}\u{0BAA}\u{0BBE}\u{0BB5}\u{0BB3}\u{0BBF}".into()), // தீபாவளி
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Ashvina),
                paksha: Paksha::Krishna,
                tithi: TithiName::Chaturdashi,
                must_prevail_during: TimeWindow::Sunrise,
                tie_break: TieBreak::PreviousDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "{tithi} of {paksha} Paksha -- Deepavali; oil bath before dawn, Krishna's victory over Naraka".into(),
            variants: vec![],
            sequence: Some(FestivalSequence { group: "deepavali".into(), day: 1, total: 2 }),
        },
        FestivalRule {
            id: "diwali-lakshmi-puja".into(),
            name: "Deepavali Lakshmi Puja".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("\u{0BB2}\u{0B95}\u{0BCD}\u{0BB7}\u{0BCD}\u{0BAE}\u{0BBF} \u{0BAA}\u{0BC2}\u{0B9C}\u{0BC8}".into()), // லக்ஷ்மி பூஜை
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Ashvina),
                paksha: Paksha::Krishna,
                tithi: TithiName::Amavasya,
                must_prevail_during: TimeWindow::Pradosh,
                tie_break: TieBreak::PreviousDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "Amavasya in {month} -- Lakshmi Puja with lamps on the new-moon night".into(),
            variants: vec![],
            sequence: Some(FestivalSequence { group: "deepavali".into(), day: 2, total: 2 }),
        },

        // === RECURRING OBSERVANCES ===
        FestivalRule {
            id: "ekadashi".into(),
            name: "Ekadashi".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("\u{0B8F}\u{0B95}\u{0BBE}\u{0BA4}\u{0B9A}\u{0BBF}".into()), // ஏகாதசி
            festival_type: FestivalType::RecurringFortnightly,
            basis: RuleBasis::Recurring {
                paksha: None,
                tithi: TithiName::Ekadashi,
                must_prevail_during: TimeWindow::Sunrise,
            },
            reason_template: "{tithi} of {month} -- a fasting day sacred to Vishnu".into(),
            variants: vec![SectVariant {
                sect: Sect::Vaishnava,
                note: "Sri Vaishnavas may observe on the next day if Dashami touches sunrise".into(),
                date_offset: Some(1),
            }],
            sequence: None,
        },
        FestivalRule {
            id: "pradosh-vrat".into(),
            name: "Pradosham".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("\u{0BAA}\u{0BBF}\u{0BB0}\u{0BA4}\u{0BCB}\u{0BB7}\u{0BAE}\u{0BCD}".into()), // பிரதோஷம்
            festival_type: FestivalType::RecurringFortnightly,
            basis: RuleBasis::Recurring {
                paksha: None,
                tithi: TithiName::Trayodashi,
                must_prevail_during: TimeWindow::Pradosh,
            },
            reason_template: "{tithi} at dusk in {month} -- evening worship of Shiva".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "sankashti-chaturthi".into(),
            name: "Sankashti Chaturthi".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("\u{0B9A}\u{0B99}\u{0BCD}\u{0B95}\u{0B9F}\u{0BB9}\u{0BB0} \u{0B9A}\u{0BA4}\u{0BC1}\u{0BB0}\u{0BCD}\u{0BA4}\u{0BCD}\u{0BA4}\u{0BBF}".into()), // சங்கடஹர சதுர்த்தி
            festival_type: FestivalType::RecurringMonthly,
            basis: RuleBasis::Recurring {
                paksha: Some(Paksha::Krishna),
                tithi: TithiName::Chaturthi,
                must_prevail_during: TimeWindow::Moonrise,
            },
            reason_template: "{tithi} of Krishna Paksha in {month} -- fast broken after moonrise, for Vinayagar".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "purnima".into(),
            name: "Purnima".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("\u{0BAA}\u{0BCC}\u{0BB0}\u{0BCD}\u{0BA3}\u{0BAE}\u{0BBF}".into()), // பௌர்ணமி
            festival_type: FestivalType::RecurringMonthly,
            basis: RuleBasis::Recurring {
                paksha: Some(Paksha::Shukla),
                tithi: TithiName::Purnima,
                must_prevail_during: TimeWindow::Sunrise,
            },
            reason_template: "Full moon of {month}".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "amavasya".into(),
            name: "Amavasya".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("\u{0B85}\u{0BAE}\u{0BBE}\u{0BB5}\u{0BBE}\u{0B9A}\u{0BC8}".into()), // அமாவாசை
            festival_type: FestivalType::RecurringMonthly,
            basis: RuleBasis::Recurring {
                paksha: Some(Paksha::Krishna),
                tithi: TithiName::Amavasya,
                must_prevail_during: TimeWindow::Sunrise,
            },
            reason_template: "New moon of {month} -- tarpan and charity for ancestors".into(),
            variants: vec![],
            sequence: None,
        },

        // === MAJOR FESTIVALS ===
        // === PONGAL (4-day sequence) ===
        FestivalRule {
            id: "bhogi-pongal".into(),
            name: "Bhogi Pongal".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("போகிப் பொங்கல்".into()),
            festival_type: FestivalType::SolarTransit,
            basis: RuleBasis::SolarOffset {
                rashi: 9, // Capricorn
                day_offset: -1, // Day before Thai Pongal
                description: "Day before Thai Pongal -- Bhogi; discard old things, light bonfires".into(),
            },
            reason_template: "Day before Thai Pongal -- Bhogi".into(),
            variants: vec![],
            sequence: Some(FestivalSequence { group: "pongal".into(), day: 1, total: 4 }),
        },
        FestivalRule {
            id: "pongal".into(),
            name: "Thai Pongal".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("தைப் பொங்கல்".into()),
            festival_type: FestivalType::SolarTransit,
            basis: RuleBasis::Solar {
                rashi: 9, // Capricorn (Makara) -- Thai Pongal
                description: "Sun enters sidereal Capricorn -- Thai Pongal, Tamil harvest thanksgiving".into(),
            },
            reason_template: "Sun enters sidereal Capricorn -- Pongalo Pongal!".into(),
            variants: vec![],
            sequence: Some(FestivalSequence { group: "pongal".into(), day: 2, total: 4 }),
        },
        FestivalRule {
            id: "mattu-pongal".into(),
            name: "Mattu Pongal".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("மாட்டுப் பொங்கல்".into()),
            festival_type: FestivalType::SolarTransit,
            basis: RuleBasis::SolarOffset {
                rashi: 9,
                day_offset: 1,
                description: "Day after Thai Pongal -- Mattu Pongal; honour cattle and farm animals".into(),
            },
            reason_template: "Day after Thai Pongal -- Mattu Pongal".into(),
            variants: vec![],
            sequence: Some(FestivalSequence { group: "pongal".into(), day: 3, total: 4 }),
        },
        FestivalRule {
            id: "kaanum-pongal".into(),
            name: "Kaanum Pongal".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("காணும் பொங்கல்".into()),
            festival_type: FestivalType::SolarTransit,
            basis: RuleBasis::SolarOffset {
                rashi: 9,
                day_offset: 2,
                description: "Two days after Thai Pongal -- Kaanum Pongal; family outings and brother-sister bond".into(),
            },
            reason_template: "Two days after Thai Pongal -- Kaanum Pongal".into(),
            variants: vec![],
            sequence: Some(FestivalSequence { group: "pongal".into(), day: 4, total: 4 }),
        },
        FestivalRule {
            id: "maha-shivaratri".into(),
            name: "Maha Shivaratri".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("\u{0BAE}\u{0B95}\u{0BBE} \u{0B9A}\u{0BBF}\u{0BB5}\u{0BB0}\u{0BBE}\u{0BA4}\u{0BCD}\u{0BA4}\u{0BBF}\u{0BB0}\u{0BBF}".into()), // மகா சிவராத்திரி
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Magha),
                paksha: Paksha::Krishna,
                tithi: TithiName::Chaturdashi,
                must_prevail_during: TimeWindow::Midnight,
                tie_break: TieBreak::PreviousDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "{tithi} of {paksha} Paksha -- the great night of Shiva, observed with vigil and fasting".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "ugadi".into(),
            name: "Puthandu / Vishu".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("\u{0BAA}\u{0BC1}\u{0BA4}\u{0BCD}\u{0BA4}\u{0BBE}\u{0BA3}\u{0BCD}\u{0B9F}\u{0BC1}".into()), // புத்தாண்டு
            festival_type: FestivalType::SolarTransit,
            basis: RuleBasis::Solar {
                rashi: 0, // Aries (Mesha) -- Tamil/Malayalam New Year
                description: "Sun enters sidereal Aries -- Tamil Puthandu / Malayalam Vishu".into(),
            },
            reason_template: "Sun enters sidereal Aries -- Tamil and Malayalam New Year".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "ram-navami".into(),
            name: "Sri Rama Navami".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("\u{0BB8}\u{0BCD}\u{0BB0}\u{0BC0} \u{0BB0}\u{0BBE}\u{0BAE} \u{0BA8}\u{0BB5}\u{0BAE}\u{0BBF}".into()), // ஸ்ரீ ராம நவமி
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Chaitra),
                paksha: Paksha::Shukla,
                tithi: TithiName::Navami,
                must_prevail_during: TimeWindow::Midday,
                tie_break: TieBreak::NextDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "{tithi} of {paksha} Paksha in {month} at midday -- birth of Rama".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "ganesh-chaturthi".into(),
            name: "Vinayagar Chaturthi".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("\u{0BB5}\u{0BBF}\u{0BA8}\u{0BBE}\u{0BAF}\u{0B95}\u{0BB0}\u{0BCD} \u{0B9A}\u{0BA4}\u{0BC1}\u{0BB0}\u{0BCD}\u{0BA4}\u{0BCD}\u{0BA4}\u{0BBF}".into()), // விநாயகர் சதுர்த்தி
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Bhadrapada),
                paksha: Paksha::Shukla,
                tithi: TithiName::Chaturthi,
                must_prevail_during: TimeWindow::Midday,
                tie_break: TieBreak::NextDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "{tithi} of {paksha} Paksha in {month} -- Vinayagar Chaturthi, birth of Pillaiyar".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "navaratri-golu".into(),
            name: "Navaratri Golu".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("\u{0BA8}\u{0BB5}\u{0BB0}\u{0BBE}\u{0BA4}\u{0BCD}\u{0BA4}\u{0BBF}\u{0BB0}\u{0BBF} \u{0B95}\u{0BCA}\u{0BB2}\u{0BC1}".into()), // நவராத்திரி கொலு
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Ashvina),
                paksha: Paksha::Shukla,
                tithi: TithiName::Pratipada,
                must_prevail_during: TimeWindow::Sunrise,
                tie_break: TieBreak::NextDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "{tithi} of {paksha} Paksha in {month} -- Navaratri begins; Golu display and Devi worship".into(),
            variants: vec![],
            sequence: Some(FestivalSequence { group: "navaratri".into(), day: 1, total: 10 }),
        },
        // Vijayadashami / Saraswati Puja -- 10th day of Navaratri
        FestivalRule {
            id: "vijayadashami".into(),
            name: "Vijayadashami".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("விஜயதசமி".into()),
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Ashvina),
                paksha: Paksha::Shukla,
                tithi: TithiName::Dashami,
                must_prevail_during: TimeWindow::Sunrise,
                tie_break: TieBreak::NextDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "{tithi} of {paksha} Paksha -- Vijayadashami; Vidyarambham, victory of good over evil".into(),
            variants: vec![],
            sequence: Some(FestivalSequence { group: "navaratri".into(), day: 10, total: 10 }),
        },
        FestivalRule {
            id: "skanda-shashthi".into(),
            name: "Skanda Shashthi".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("\u{0B95}\u{0BA8}\u{0BCD}\u{0BA4} \u{0B9A}\u{0BB7}\u{0BCD}\u{0B9F}\u{0BBF}".into()), // கந்த சஷ்டி
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Ashvina),
                paksha: Paksha::Shukla,
                tithi: TithiName::Shashthi,
                must_prevail_during: TimeWindow::Pradosh,
                tie_break: TieBreak::PreviousDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "{tithi} of {paksha} Paksha -- Soorasamharam; Murugan defeats Soorapadman".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "karthigai-deepam".into(),
            name: "Karthigai Deepam".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("\u{0B95}\u{0BBE}\u{0BB0}\u{0BCD}\u{0BA4}\u{0BCD}\u{0BA4}\u{0BBF}\u{0B95}\u{0BC8} \u{0BA4}\u{0BC0}\u{0BAA}\u{0BAE}\u{0BCD}".into()), // கார்த்திகை தீபம்
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Kartika),
                paksha: Paksha::Shukla,
                tithi: TithiName::Purnima,
                must_prevail_during: TimeWindow::Pradosh,
                tie_break: TieBreak::PreviousDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "Kartika Purnima at dusk -- the Tamil festival of lamps; Shiva as the infinite Jyotirlinga".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "thaipusam".into(),
            name: "Thaipusam".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("தைப்பூசம்".into()),
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::SolarNakshatra {
                solar_rashi: 9, // Makara (Capricorn) = Tamil month Thai
                nakshatra: NakshatraName::Pushya, // Pusam/Pushya nakshatra
                description: "Pushya nakshatra in Tamil month Thai -- Thaipusam; Parvati gave Murugan the Vel".into(),
            },
            reason_template: "Pushya nakshatra in Thai -- Thaipusam; Murugan receives the Vel".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "varalakshmi-vratam".into(),
            name: "Varalakshmi Vratam".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("\u{0BB5}\u{0BB0}\u{0BB2}\u{0B95}\u{0BCD}\u{0BB7}\u{0BCD}\u{0BAE}\u{0BBF} \u{0BB5}\u{0BBF}\u{0BB0}\u{0BA4}\u{0BAE}\u{0BCD}".into()), // வரலக்ஷ்மி விரதம்
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Shravana),
                paksha: Paksha::Shukla,
                tithi: TithiName::Dwadashi,
                must_prevail_during: TimeWindow::Sunrise,
                tie_break: TieBreak::PreviousDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "Shravana Shukla Paksha -- Varalakshmi Vratam; Ashtalakshmi worship for family well-being".into(),
            variants: vec![],
            sequence: None,
        },

        // === SOUTH INDIAN REGIONAL ===
        FestivalRule {
            id: "onam".into(),
            name: "Onam".into(),
            name_te: None, name_kn: None, name_ml: Some("ഓണം".into()), name_ta: Some("ஓணம்".into()),
            festival_type: FestivalType::Regional,
            basis: RuleBasis::SolarNakshatra {
                solar_rashi: 4, // Leo (Chingam)
                nakshatra: NakshatraName::Shravana, // Thiruvonam
                description: "Thiruvonam nakshatra in Chingam -- Onam; Mahabali's annual homecoming".into(),
            },
            reason_template: "Thiruvonam nakshatra in Chingam -- Onam".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "aadi-perukku".into(),
            name: "Aadi Perukku".into(),
            name_te: None, name_kn: None, name_ml: None, name_ta: Some("ஆடிப்பெருக்கு".into()),
            festival_type: FestivalType::Regional,
            basis: RuleBasis::SolarOffset {
                rashi: 3, // Cancer (Kataka/Aadi)
                day_offset: 17, // 18th day of Aadi = transit + 17
                description: "18th day of Tamil month Aadi -- Aadi Perukku; river festival of water and fertility".into(),
            },
            reason_template: "18th of Aadi -- Aadi Perukku".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "ayyappa-mandalam".into(),
            name: "Mandala Kalam".into(),
            name_te: None, name_kn: None, name_ml: Some("മണ്ഡലകാലം".into()), name_ta: Some("ஐயப்பன் மண்டல காலம்".into()),
            festival_type: FestivalType::Regional,
            basis: RuleBasis::Solar {
                rashi: 7, // Scorpio (Vrischikam)
                description: "Sun enters sidereal Scorpio -- Mandala Kalam begins; 41-day Ayyappa austerity season".into(),
            },
            reason_template: "Sun enters Scorpio -- Ayyappa Mandala Kalam begins".into(),
            variants: vec![],
            sequence: None,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_rules_count() {
        let rules = default_rules();
        assert!(rules.len() >= 24, "Should have at least 24 default rules, got {}", rules.len());
    }

    #[test]
    fn test_deepavali_sequence() {
        let rules = default_rules();
        let deepavali_rules: Vec<_> = rules.iter()
            .filter(|r| r.sequence.as_ref().map(|s| s.group == "deepavali").unwrap_or(false))
            .collect();
        assert_eq!(deepavali_rules.len(), 2, "Should have 2 Deepavali sequence rules");
    }
}
