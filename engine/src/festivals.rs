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
    pub name_hi: Option<String>,
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
    pub name_hi: Option<String>,
    pub date: chrono::NaiveDate,
    pub festival_type: FestivalType,
    pub reason: String,
    pub variant_note: Option<String>,
    pub close_call: bool,
    pub sequence: Option<FestivalSequence>,
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
            RuleBasis::Lunar { month, paksha, tithi, must_prevail_during: _, .. } => {
                for day in &panchang_data {
                    let month_matches = month.as_ref()
                        .map(|m| *m == day.lunar_month.month && !day.lunar_month.is_adhik)
                        .unwrap_or(true);

                    if month_matches
                        && day.paksha == *paksha
                        && day.tithi.name == *tithi
                    {
                        let reason = rule.reason_template
                            .replace("{tithi}", tithi.name())
                            .replace("{paksha}", paksha.name())
                            .replace("{month}", day.lunar_month.month.name())
                            .replace("{city}", &location.name);

                        let variant_note = rule.variants.iter()
                            .find(|v| v.sect != conventions.sect)
                            .map(|v| v.note.clone());

                        instances.push(FestivalInstance {
                            rule_id: rule.id.clone(),
                            name: rule.name.clone(),
                            name_hi: rule.name_hi.clone(),
                            date: day.date,
                            festival_type: rule.festival_type.clone(),
                            reason,
                            variant_note,
                            close_call: false,
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
                            name_hi: rule.name_hi.clone(),
                            date: day.date,
                            festival_type: rule.festival_type.clone(),
                            reason: description.clone(),
                            variant_note: None,
                            close_call: false,
                            sequence: rule.sequence.clone(),
                        });
                    }
                }
            }
            RuleBasis::Recurring { paksha, tithi, .. } => {
                for day in &panchang_data {
                    let paksha_matches = paksha
                        .map(|p| p == day.paksha)
                        .unwrap_or(true);

                    if paksha_matches && day.tithi.name == *tithi {
                        let reason = rule.reason_template
                            .replace("{tithi}", tithi.name())
                            .replace("{month}", day.lunar_month.month.name());

                        instances.push(FestivalInstance {
                            rule_id: rule.id.clone(),
                            name: rule.name.clone(),
                            name_hi: rule.name_hi.clone(),
                            date: day.date,
                            festival_type: rule.festival_type.clone(),
                            reason,
                            variant_note: None,
                            close_call: false,
                            sequence: rule.sequence.clone(),
                        });
                    }
                }
            }
        }
    }

    instances.sort_by_key(|i| i.date);
    instances
}

/// Load the default set of festival rules for the MVP (~20 observances).
pub fn default_rules() -> Vec<FestivalRule> {
    vec![
        // === DIWALI SEQUENCE (5 days) ===
        FestivalRule {
            id: "dhanteras".into(),
            name: "Dhanteras".into(),
            name_hi: Some("\u{0927}\u{0928}\u{0924}\u{0947}\u{0930}\u{0938}".into()),
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Ashvina),
                paksha: Paksha::Krishna,
                tithi: TithiName::Trayodashi,
                must_prevail_during: TimeWindow::Pradosh,
                tie_break: TieBreak::PreviousDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "{tithi} of {paksha} Paksha in {month} -- Dhanteras, honouring Dhanvantari and prosperity".into(),
            variants: vec![],
            sequence: Some(FestivalSequence { group: "diwali".into(), day: 1, total: 5 }),
        },
        FestivalRule {
            id: "naraka-chaturdashi".into(),
            name: "Naraka Chaturdashi".into(),
            name_hi: Some("\u{0928}\u{0930}\u{0915} \u{091a}\u{0924}\u{0941}\u{0930}\u{094d}\u{0926}\u{0936}\u{0940}".into()),
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Ashvina),
                paksha: Paksha::Krishna,
                tithi: TithiName::Chaturdashi,
                must_prevail_during: TimeWindow::Sunrise,
                tie_break: TieBreak::PreviousDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "{tithi} of {paksha} Paksha -- Krishna's victory over Naraka; the main Deepavali morning in South India".into(),
            variants: vec![SectVariant {
                sect: Sect::Smarta,
                note: "In South India, this is the main Deepavali, with an oil bath before dawn".into(),
                date_offset: None,
            }],
            sequence: Some(FestivalSequence { group: "diwali".into(), day: 2, total: 5 }),
        },
        FestivalRule {
            id: "diwali-lakshmi-puja".into(),
            name: "Diwali (Lakshmi Puja)".into(),
            name_hi: Some("\u{0926}\u{0940}\u{092a}\u{093e}\u{0935}\u{0932}\u{0940}".into()),
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Ashvina),
                paksha: Paksha::Krishna,
                tithi: TithiName::Amavasya,
                must_prevail_during: TimeWindow::Pradosh,
                tie_break: TieBreak::PreviousDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "Amavasya in {month} -- the new-moon night of Kartika, when Lakshmi is welcomed with lamps".into(),
            variants: vec![
                SectVariant {
                    sect: Sect::Smarta,
                    note: "In Bengal, this is Kali Puja".into(),
                    date_offset: None,
                },
            ],
            sequence: Some(FestivalSequence { group: "diwali".into(), day: 3, total: 5 }),
        },
        FestivalRule {
            id: "govardhan-puja".into(),
            name: "Govardhan Puja".into(),
            name_hi: Some("\u{0917}\u{094b}\u{0935}\u{0930}\u{094d}\u{0927}\u{0928} \u{092a}\u{0942}\u{091c}\u{093e}".into()),
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Kartika),
                paksha: Paksha::Shukla,
                tithi: TithiName::Pratipada,
                must_prevail_during: TimeWindow::Sunrise,
                tie_break: TieBreak::NextDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "{tithi} of {paksha} Paksha in {month} -- Krishna lifting Mount Govardhan; the Gujarati New Year".into(),
            variants: vec![],
            sequence: Some(FestivalSequence { group: "diwali".into(), day: 4, total: 5 }),
        },
        FestivalRule {
            id: "bhai-dooj".into(),
            name: "Bhai Dooj".into(),
            name_hi: Some("\u{092d}\u{093e}\u{0908} \u{0926}\u{0942}\u{091c}".into()),
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Kartika),
                paksha: Paksha::Shukla,
                tithi: TithiName::Dwitiya,
                must_prevail_during: TimeWindow::Sunrise,
                tie_break: TieBreak::NextDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "{tithi} of {paksha} Paksha in {month} -- brothers and sisters honour their bond".into(),
            variants: vec![],
            sequence: Some(FestivalSequence { group: "diwali".into(), day: 5, total: 5 }),
        },

        // === RECURRING OBSERVANCES ===
        FestivalRule {
            id: "ekadashi".into(),
            name: "Ekadashi".into(),
            name_hi: Some("\u{090f}\u{0915}\u{093e}\u{0926}\u{0936}\u{0940}".into()),
            festival_type: FestivalType::RecurringFortnightly,
            basis: RuleBasis::Recurring {
                paksha: None, // Both pakshas
                tithi: TithiName::Ekadashi,
                must_prevail_during: TimeWindow::Sunrise,
            },
            reason_template: "{tithi} of {month} -- a fasting day sacred to Vishnu".into(),
            variants: vec![SectVariant {
                sect: Sect::Vaishnava,
                note: "Vaishnavas may observe on the next day if Dashami touches sunrise".into(),
                date_offset: Some(1),
            }],
            sequence: None,
        },
        FestivalRule {
            id: "pradosh-vrat".into(),
            name: "Pradosh Vrat".into(),
            name_hi: Some("\u{092a}\u{094d}\u{0930}\u{0926}\u{094b}\u{0937} \u{0935}\u{094d}\u{0930}\u{0924}".into()),
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
            name_hi: Some("\u{0938}\u{0902}\u{0915}\u{0937}\u{094d}\u{091f}\u{0940} \u{091a}\u{0924}\u{0941}\u{0930}\u{094d}\u{0925}\u{0940}".into()),
            festival_type: FestivalType::RecurringMonthly,
            basis: RuleBasis::Recurring {
                paksha: Some(Paksha::Krishna),
                tithi: TithiName::Chaturthi,
                must_prevail_during: TimeWindow::Moonrise,
            },
            reason_template: "{tithi} of Krishna Paksha in {month} -- fast broken after moonrise, for Ganesha".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "purnima".into(),
            name: "Purnima".into(),
            name_hi: Some("\u{092a}\u{0942}\u{0930}\u{094d}\u{0923}\u{093f}\u{092e}\u{093e}".into()),
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
            name_hi: Some("\u{0905}\u{092e}\u{093e}\u{0935}\u{0938}\u{094d}\u{092f}\u{093e}".into()),
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
        FestivalRule {
            id: "makar-sankranti".into(),
            name: "Makar Sankranti".into(),
            name_hi: Some("\u{092e}\u{0915}\u{0930} \u{0938}\u{0902}\u{0915}\u{094d}\u{0930}\u{093e}\u{0902}\u{0924}\u{093f}".into()),
            festival_type: FestivalType::SolarTransit,
            basis: RuleBasis::Solar {
                rashi: 9, // Capricorn (Makara) in sidereal zodiac
                description: "Sun enters sidereal Capricorn -- the traditional start of Uttarayana".into(),
            },
            reason_template: "Sun enters sidereal Capricorn".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "maha-shivaratri".into(),
            name: "Maha Shivaratri".into(),
            name_hi: Some("\u{092e}\u{0939}\u{093e}\u{0936}\u{093f}\u{0935}\u{0930}\u{093e}\u{0924}\u{094d}\u{0930}\u{093f}".into()),
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Magha), // Amanta; Phalguna in Purnimanta
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
            id: "holi".into(),
            name: "Holi (Holika Dahan)".into(),
            name_hi: Some("\u{0939}\u{094b}\u{0932}\u{0940}".into()),
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Phalguna),
                paksha: Paksha::Shukla,
                tithi: TithiName::Purnima,
                must_prevail_during: TimeWindow::Pradosh,
                tie_break: TieBreak::PreviousDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "Purnima of Phalguna at dusk -- bonfire night recalling Prahlada's faith".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "ram-navami".into(),
            name: "Ram Navami".into(),
            name_hi: Some("\u{0930}\u{093e}\u{092e} \u{0928}\u{0935}\u{092e}\u{0940}".into()),
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Chaitra),
                paksha: Paksha::Shukla,
                tithi: TithiName::Navami,
                must_prevail_during: TimeWindow::Midday,
                tie_break: TieBreak::NextDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "{tithi} of {paksha} Paksha in {month} at midday -- birth of Rama in Ayodhya".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "ganesh-chaturthi".into(),
            name: "Ganesh Chaturthi".into(),
            name_hi: Some("\u{0917}\u{0923}\u{0947}\u{0936} \u{091a}\u{0924}\u{0941}\u{0930}\u{094d}\u{0925}\u{0940}".into()),
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Bhadrapada),
                paksha: Paksha::Shukla,
                tithi: TithiName::Chaturthi,
                must_prevail_during: TimeWindow::Midday,
                tie_break: TieBreak::NextDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "{tithi} of {paksha} Paksha in {month} -- birth of Ganesha, the remover of obstacles".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "chhath-puja".into(),
            name: "Chhath Puja".into(),
            name_hi: Some("\u{091b}\u{0920} \u{092a}\u{0942}\u{091c}\u{093e}".into()),
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Kartika),
                paksha: Paksha::Shukla,
                tithi: TithiName::Shashthi,
                must_prevail_during: TimeWindow::Sunrise,
                tie_break: TieBreak::PreviousDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "{tithi} of {paksha} Paksha in {month} -- sun worship at the riverbank".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "dev-uthani-ekadashi".into(),
            name: "Dev Uthani Ekadashi".into(),
            name_hi: Some("\u{0926}\u{0947}\u{0935} \u{0909}\u{0920}\u{0928}\u{0940} \u{090f}\u{0915}\u{093e}\u{0926}\u{0936}\u{0940}".into()),
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Kartika),
                paksha: Paksha::Shukla,
                tithi: TithiName::Ekadashi,
                must_prevail_during: TimeWindow::Sunrise,
                tie_break: TieBreak::NextDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "{tithi} of {paksha} Paksha in {month} -- Vishnu awakens, the wedding season begins".into(),
            variants: vec![],
            sequence: None,
        },
        FestivalRule {
            id: "vasant-panchami".into(),
            name: "Vasant Panchami".into(),
            name_hi: Some("\u{0935}\u{0938}\u{0902}\u{0924} \u{092a}\u{0902}\u{091a}\u{092e}\u{0940}".into()),
            festival_type: FestivalType::MajorFestival,
            basis: RuleBasis::Lunar {
                month: Some(LunarMonth::Magha),
                paksha: Paksha::Shukla,
                tithi: TithiName::Panchami,
                must_prevail_during: TimeWindow::Sunrise,
                tie_break: TieBreak::NextDay,
                adhik_maas: AdhikMaasBehaviour::Skip,
            },
            reason_template: "{tithi} of {paksha} Paksha in {month} -- Saraswati Puja, the first stirrings of spring".into(),
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
        assert!(rules.len() >= 18, "Should have at least 18 default rules, got {}", rules.len());
    }

    #[test]
    fn test_diwali_sequence() {
        let rules = default_rules();
        let diwali_rules: Vec<_> = rules.iter()
            .filter(|r| r.sequence.as_ref().map(|s| s.group == "diwali").unwrap_or(false))
            .collect();
        assert_eq!(diwali_rules.len(), 5, "Should have 5 Diwali sequence rules");
    }
}
