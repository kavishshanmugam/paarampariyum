//! Validation test: dumps panchang data for comparison with Drik Panchang.
//! Run with: cargo test --manifest-path engine/Cargo.toml --test validation -- --nocapture

use parampara_engine::*;

fn mel() -> Location {
    Location::melbourne()
}

fn conv() -> Conventions {
    Conventions::default()
}

#[test]
fn dump_oct_nov_dec_2026_panchang() {
    let loc = mel();
    let conv = conv();

    // Key dates to validate against Drik Panchang
    let dates = vec![
        // October 2026
        "2026-10-01", "2026-10-05", "2026-10-10", "2026-10-15",
        "2026-10-20", "2026-10-25", "2026-10-31",
        // November 2026 (Diwali season)
        "2026-11-01", "2026-11-05", "2026-11-06", "2026-11-07",
        "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-15",
        "2026-11-20", "2026-11-25",
        // December 2026
        "2026-12-01", "2026-12-10", "2026-12-15", "2026-12-25",
        // January 2027 (Pongal)
        "2027-01-14", "2027-01-15",
        // February 2027 (Thaipusam, Maha Shivaratri)
        "2027-02-01", "2027-02-10", "2027-02-15", "2027-02-20", "2027-02-21",
        // March 2027
        "2027-03-01", "2027-03-06", "2027-03-10", "2027-03-15", "2027-03-19", "2027-03-20", "2027-03-28",
        // April 2027 (Sri Rama Navami, Puthandu)
        "2027-04-01", "2027-04-05", "2027-04-10", "2027-04-15",
    ];

    println!("\n=== PANCHANG VALIDATION DATA (Melbourne) ===");
    println!("{:<12} {:<8} {:<6} {:<18} {:<18} {:<14} {:<14} {:<10}", 
        "Date", "Sunrise", "Sunset", "Tithi", "Nakshatra", "Yoga", "LunarMonth", "Paksha");
    println!("{}", "-".repeat(110));

    for ds in &dates {
        let date = chrono::NaiveDate::parse_from_str(ds, "%Y-%m-%d").unwrap();
        let p = get_panchang(date, &loc, &conv);
        println!("{:<12} {:>5.2}   {:>5.2}   {:<18} {:<18} {:<14} {:<14} {:<10}",
            ds,
            p.sunrise.unwrap_or(0.0),
            p.sunset.unwrap_or(0.0),
            format!("{:?}", p.tithi.name),
            format!("{:?}", p.nakshatra.name),
            format!("{:?}", p.yoga.name),
            format!("{:?}", p.lunar_month.month),
            format!("{:?}", p.paksha),
        );
    }
}

#[test]
fn dump_festivals_oct2026_apr2027() {
    let loc = mel();
    let conv = conv();
    let rules = default_rules();

    let start = chrono::NaiveDate::from_ymd_opt(2026, 10, 1).unwrap();
    let end = chrono::NaiveDate::from_ymd_opt(2027, 4, 30).unwrap();
    let festivals = evaluate_festivals(start, end, &loc, &conv, &rules);

    println!("\n=== FESTIVAL DATES (Melbourne, Oct 2026 - Apr 2027) ===");
    println!("{:<12} {:<30} {:<20} {}", "Date", "Name", "Type", "Reason");
    println!("{}", "-".repeat(110));

    let mut close_calls = 0;
    for f in &festivals {
        let cc = if f.close_call { " [CLOSE CALL]" } else { "" };
        println!("{:<12} {:<30} {:<20} {}{}",
            f.date.format("%Y-%m-%d"),
            f.name,
            format!("{:?}", f.festival_type),
            &f.reason[..f.reason.len().min(55)],
            cc,
        );
        if f.close_call { close_calls += 1; }
    }
    println!("\nTotal festivals: {}, Close calls: {}", festivals.len(), close_calls);
}
