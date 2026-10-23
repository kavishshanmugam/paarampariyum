use chrono::{NaiveDate, Weekday};
use serde::{Deserialize, Serialize};

/// Geographic location with timezone
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Location {
    pub lat: f64,
    pub lon: f64,
    pub timezone: String,
    pub name: String,
}

impl Location {
    /// Melbourne CBD default
    pub fn melbourne() -> Self {
        Location {
            lat: -37.8136,
            lon: 144.9631,
            timezone: "Australia/Melbourne".to_string(),
            name: "Melbourne".to_string(),
        }
    }
}

/// Calendar conventions for a user profile
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conventions {
    pub month_system: MonthSystem,
    pub sect: Sect,
    pub ayanamsa: Ayanamsa,
}

impl Default for Conventions {
    fn default() -> Self {
        Conventions {
            month_system: MonthSystem::Purnimanta,
            sect: Sect::Smarta,
            ayanamsa: Ayanamsa::Lahiri,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum MonthSystem {
    Amanta,
    Purnimanta,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Sect {
    Smarta,
    Vaishnava,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Ayanamsa {
    Lahiri,
}

/// The 30 tithis (lunar days)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TithiName {
    Pratipada,
    Dwitiya,
    Tritiya,
    Chaturthi,
    Panchami,
    Shashthi,
    Saptami,
    Ashtami,
    Navami,
    Dashami,
    Ekadashi,
    Dwadashi,
    Trayodashi,
    Chaturdashi,
    Purnima,   // Full moon (end of Shukla)
    Amavasya,  // New moon (end of Krishna)
}

impl TithiName {
    pub fn from_index(index: u8) -> Self {
        match index {
            0 => TithiName::Pratipada,
            1 => TithiName::Dwitiya,
            2 => TithiName::Tritiya,
            3 => TithiName::Chaturthi,
            4 => TithiName::Panchami,
            5 => TithiName::Shashthi,
            6 => TithiName::Saptami,
            7 => TithiName::Ashtami,
            8 => TithiName::Navami,
            9 => TithiName::Dashami,
            10 => TithiName::Ekadashi,
            11 => TithiName::Dwadashi,
            12 => TithiName::Trayodashi,
            13 => TithiName::Chaturdashi,
            14 => TithiName::Purnima,
            _ => TithiName::Pratipada, // wraps
        }
    }

    pub fn index(&self) -> u8 {
        match self {
            TithiName::Pratipada => 0,
            TithiName::Dwitiya => 1,
            TithiName::Tritiya => 2,
            TithiName::Chaturthi => 3,
            TithiName::Panchami => 4,
            TithiName::Shashthi => 5,
            TithiName::Saptami => 6,
            TithiName::Ashtami => 7,
            TithiName::Navami => 8,
            TithiName::Dashami => 9,
            TithiName::Ekadashi => 10,
            TithiName::Dwadashi => 11,
            TithiName::Trayodashi => 12,
            TithiName::Chaturdashi => 13,
            TithiName::Purnima => 14,
            TithiName::Amavasya => 14, // Same index in the other paksha
        }
    }

    /// Display name in English
    pub fn name(&self) -> &'static str {
        match self {
            TithiName::Pratipada => "Pratipada",
            TithiName::Dwitiya => "Dwitiya",
            TithiName::Tritiya => "Tritiya",
            TithiName::Chaturthi => "Chaturthi",
            TithiName::Panchami => "Panchami",
            TithiName::Shashthi => "Shashthi",
            TithiName::Saptami => "Saptami",
            TithiName::Ashtami => "Ashtami",
            TithiName::Navami => "Navami",
            TithiName::Dashami => "Dashami",
            TithiName::Ekadashi => "Ekadashi",
            TithiName::Dwadashi => "Dwadashi",
            TithiName::Trayodashi => "Trayodashi",
            TithiName::Chaturdashi => "Chaturdashi",
            TithiName::Purnima => "Purnima",
            TithiName::Amavasya => "Amavasya",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Paksha {
    Shukla, // Waxing (bright half)
    Krishna, // Waning (dark half)
}

impl Paksha {
    pub fn name(&self) -> &'static str {
        match self {
            Paksha::Shukla => "Shukla",
            Paksha::Krishna => "Krishna",
        }
    }
}

/// Tithi information with timing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TithiInfo {
    pub name: TithiName,
    pub tithi_number: u8, // 1-30 (1-15 Shukla, 16-30 Krishna)
    pub start_jd: f64,
    pub end_jd: f64,
}

impl TithiInfo {
    pub fn paksha(&self) -> Paksha {
        if self.tithi_number <= 15 {
            Paksha::Shukla
        } else {
            Paksha::Krishna
        }
    }
}

/// The 27 nakshatras (lunar mansions)
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum NakshatraName {
    Ashwini, Bharani, Krittika, Rohini, Mrigashira,
    Ardra, Punarvasu, Pushya, Ashlesha, Magha,
    PurvaPhalguni, UttaraPhalguni, Hasta, Chitra, Swati,
    Vishakha, Anuradha, Jyeshtha, Mula, PurvaAshadha,
    UttaraAshadha, Shravana, Dhanishta, Shatabhisha,
    PurvaBhadrapada, UttaraBhadrapada, Revati,
}

impl NakshatraName {
    pub fn from_index(index: u8) -> Self {
        match index % 27 {
            0 => NakshatraName::Ashwini,
            1 => NakshatraName::Bharani,
            2 => NakshatraName::Krittika,
            3 => NakshatraName::Rohini,
            4 => NakshatraName::Mrigashira,
            5 => NakshatraName::Ardra,
            6 => NakshatraName::Punarvasu,
            7 => NakshatraName::Pushya,
            8 => NakshatraName::Ashlesha,
            9 => NakshatraName::Magha,
            10 => NakshatraName::PurvaPhalguni,
            11 => NakshatraName::UttaraPhalguni,
            12 => NakshatraName::Hasta,
            13 => NakshatraName::Chitra,
            14 => NakshatraName::Swati,
            15 => NakshatraName::Vishakha,
            16 => NakshatraName::Anuradha,
            17 => NakshatraName::Jyeshtha,
            18 => NakshatraName::Mula,
            19 => NakshatraName::PurvaAshadha,
            20 => NakshatraName::UttaraAshadha,
            21 => NakshatraName::Shravana,
            22 => NakshatraName::Dhanishta,
            23 => NakshatraName::Shatabhisha,
            24 => NakshatraName::PurvaBhadrapada,
            25 => NakshatraName::UttaraBhadrapada,
            _ => NakshatraName::Revati,
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            NakshatraName::Ashwini => "Ashwini",
            NakshatraName::Bharani => "Bharani",
            NakshatraName::Krittika => "Krittika",
            NakshatraName::Rohini => "Rohini",
            NakshatraName::Mrigashira => "Mrigashira",
            NakshatraName::Ardra => "Ardra",
            NakshatraName::Punarvasu => "Punarvasu",
            NakshatraName::Pushya => "Pushya",
            NakshatraName::Ashlesha => "Ashlesha",
            NakshatraName::Magha => "Magha",
            NakshatraName::PurvaPhalguni => "Purva Phalguni",
            NakshatraName::UttaraPhalguni => "Uttara Phalguni",
            NakshatraName::Hasta => "Hasta",
            NakshatraName::Chitra => "Chitra",
            NakshatraName::Swati => "Swati",
            NakshatraName::Vishakha => "Vishakha",
            NakshatraName::Anuradha => "Anuradha",
            NakshatraName::Jyeshtha => "Jyeshtha",
            NakshatraName::Mula => "Mula",
            NakshatraName::PurvaAshadha => "Purva Ashadha",
            NakshatraName::UttaraAshadha => "Uttara Ashadha",
            NakshatraName::Shravana => "Shravana",
            NakshatraName::Dhanishta => "Dhanishta",
            NakshatraName::Shatabhisha => "Shatabhisha",
            NakshatraName::PurvaBhadrapada => "Purva Bhadrapada",
            NakshatraName::UttaraBhadrapada => "Uttara Bhadrapada",
            NakshatraName::Revati => "Revati",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NakshatraInfo {
    pub name: NakshatraName,
    pub index: u8,
    pub start_jd: f64,
    pub end_jd: f64,
}

/// The 27 yogas
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YogaInfo {
    pub name: String,
    pub index: u8,
}

/// The 11 karanas (half-tithis)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KaranaInfo {
    pub name: String,
    pub index: u8,
}

/// Hindu lunar month names
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LunarMonth {
    Chaitra,
    Vaishakha,
    Jyeshtha,
    Ashadha,
    Shravana,
    Bhadrapada,
    Ashvina,
    Kartika,
    Margashirsha,
    Pausha,
    Magha,
    Phalguna,
}

impl LunarMonth {
    pub fn from_index(index: u8) -> Self {
        match index % 12 {
            0 => LunarMonth::Chaitra,
            1 => LunarMonth::Vaishakha,
            2 => LunarMonth::Jyeshtha,
            3 => LunarMonth::Ashadha,
            4 => LunarMonth::Shravana,
            5 => LunarMonth::Bhadrapada,
            6 => LunarMonth::Ashvina,
            7 => LunarMonth::Kartika,
            8 => LunarMonth::Margashirsha,
            9 => LunarMonth::Pausha,
            10 => LunarMonth::Magha,
            _ => LunarMonth::Phalguna,
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            LunarMonth::Chaitra => "Chaitra",
            LunarMonth::Vaishakha => "Vaishakha",
            LunarMonth::Jyeshtha => "Jyeshtha",
            LunarMonth::Ashadha => "Ashadha",
            LunarMonth::Shravana => "Shravana",
            LunarMonth::Bhadrapada => "Bhadrapada",
            LunarMonth::Ashvina => "Ashvina",
            LunarMonth::Kartika => "Kartika",
            LunarMonth::Margashirsha => "Margashirsha",
            LunarMonth::Pausha => "Pausha",
            LunarMonth::Magha => "Magha",
            LunarMonth::Phalguna => "Phalguna",
        }
    }

    pub fn name_hi(&self) -> &'static str {
        match self {
            LunarMonth::Chaitra => "\u{091a}\u{0948}\u{0924}\u{094d}\u{0930}",
            LunarMonth::Vaishakha => "\u{0935}\u{0948}\u{0936}\u{093e}\u{0916}",
            LunarMonth::Jyeshtha => "\u{091c}\u{094d}\u{092f}\u{0947}\u{0937}\u{094d}\u{0920}",
            LunarMonth::Ashadha => "\u{0906}\u{0937}\u{093e}\u{0922}\u{093c}",
            LunarMonth::Shravana => "\u{0936}\u{094d}\u{0930}\u{093e}\u{0935}\u{0923}",
            LunarMonth::Bhadrapada => "\u{092d}\u{093e}\u{0926}\u{094d}\u{0930}\u{092a}\u{0926}",
            LunarMonth::Ashvina => "\u{0906}\u{0936}\u{094d}\u{0935}\u{093f}\u{0928}",
            LunarMonth::Kartika => "\u{0915}\u{093e}\u{0930}\u{094d}\u{0924}\u{093f}\u{0915}",
            LunarMonth::Margashirsha => "\u{092e}\u{093e}\u{0930}\u{094d}\u{0917}\u{0936}\u{0940}\u{0930}\u{094d}\u{0937}",
            LunarMonth::Pausha => "\u{092a}\u{094c}\u{0937}",
            LunarMonth::Magha => "\u{092e}\u{093e}\u{0918}",
            LunarMonth::Phalguna => "\u{092b}\u{093e}\u{0932}\u{094d}\u{0917}\u{0941}\u{0928}",
        }
    }
}

/// Lunar month info including extra month handling
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LunarMonthInfo {
    pub month: LunarMonth,         // Display month (respects user's Amanta/Purnimanta setting)
    pub amanta_month: LunarMonth,  // Canonical Amanta month (used for festival rule matching)
    pub is_adhik: bool,            // Intercalary (extra) month
    pub year_vikram: u16,
    pub year_shaka: u16,
}

/// Complete panchang data for one day
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayPanchang {
    pub date: NaiveDate,
    pub sunrise: Option<f64>,  // Hours from midnight (local time)
    pub sunset: Option<f64>,
    pub moonrise: Option<f64>,
    pub tithi: TithiInfo,
    pub nakshatra: NakshatraInfo,
    pub yoga: YogaInfo,
    pub karana: KaranaInfo,
    pub paksha: Paksha,
    pub lunar_month: LunarMonthInfo,
    pub weekday: Weekday,
}

impl DayPanchang {
    /// Format sunrise as HH:MM
    pub fn sunrise_time(&self) -> String {
        match self.sunrise {
            Some(h) => {
                let hours = h as u32;
                let minutes = ((h - hours as f64) * 60.0) as u32;
                format!("{:02}:{:02}", hours, minutes)
            }
            None => "N/A".to_string(),
        }
    }

    /// Format sunset as HH:MM
    pub fn sunset_time(&self) -> String {
        match self.sunset {
            Some(h) => {
                let hours = h as u32;
                let minutes = ((h - hours as f64) * 60.0) as u32;
                format!("{:02}:{:02}", hours, minutes)
            }
            None => "N/A".to_string(),
        }
    }
}
