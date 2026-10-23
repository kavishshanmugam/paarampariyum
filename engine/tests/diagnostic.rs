use parampara_engine::*;

#[test]
fn diagnose_sunrise_jd_offset() {
    // Nov 8, 2026 Melbourne - Diwali
    let date = chrono::NaiveDate::from_ymd_opt(2026, 11, 8).unwrap();
    let jd = date_to_jd(date);
    let tz = get_tz_offset(date, "Australia/Melbourne");
    let sunrise = calculate_sunrise(jd, -37.8136, 144.9631, tz);
    
    println!("Date: {}", date);
    println!("JD midnight UT: {}", jd);
    println!("TZ offset: {} hours", tz);
    println!("Sunrise (local): {:?} hours", sunrise);
    
    // Current (buggy) sunrise JD
    let sunrise_h = sunrise.unwrap_or(6.0);
    let buggy_jd = jd + sunrise_h / 24.0;
    let correct_jd = jd + (sunrise_h - tz) / 24.0;
    
    println!("\nBuggy sunrise JD:   {} (= midnight UT + {:.2}h UT)", buggy_jd, sunrise_h);
    println!("Correct sunrise JD: {} (= midnight UT + {:.2}h UT)", correct_jd, sunrise_h - tz);
    println!("Difference: {:.2} hours", (buggy_jd - correct_jd) * 24.0);
    
    // Compute tithi at both times
    let tithi_buggy = compute_tithi(buggy_jd);
    let tithi_correct = compute_tithi(correct_jd);
    
    println!("\nTithi at buggy time:   {:?} (number {})", tithi_buggy.name, tithi_buggy.tithi_number);
    println!("Tithi at correct time: {:?} (number {})", tithi_correct.name, tithi_correct.tithi_number);
    
    // Nakshatra at both times
    let nak_buggy = compute_nakshatra(buggy_jd);
    let nak_correct = compute_nakshatra(correct_jd);
    
    println!("Nakshatra at buggy time:   {:?} (index {})", nak_buggy.name, nak_buggy.index);
    println!("Nakshatra at correct time: {:?} (index {})", nak_correct.name, nak_correct.index);
    
    // Drik Panchang says: Chaturdashi at sunrise, Chitra nakshatra at sunrise
    println!("\nDrik Panchang reference: Chaturdashi, Chitra");
}

#[test]
fn diagnose_lunar_month_mapping() {
    // Oct 10 new moon - check sun's rashi
    let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 10).unwrap();
    let jd = date_to_jd(date);
    let nm = find_previous_new_moon(jd);
    let sun_lon = sun_sidereal_longitude(nm);
    let rashi = (sun_lon / 30.0).floor() as u8;
    
    println!("New moon JD: {} (date: {})", nm, jd_to_date(nm));
    println!("Sun sidereal longitude at new moon: {:.2}°", sun_lon);
    println!("Rashi index: {} (0=Mesha, 5=Kanya, 6=Tula)", rashi);
    println!("Current from_index({}): {:?}", rashi, LunarMonth::from_index(rashi));
    println!("Fixed from_index({}): {:?}", (rashi+1)%12, LunarMonth::from_index((rashi+1)%12));
    println!("Drik Panchang says: Ashwina for this period");
}
