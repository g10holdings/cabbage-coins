// ---------------------------------------------------------------------------
// Coin design reference — known alt text by series
// ---------------------------------------------------------------------------
//
// WHY THIS FILE EXISTS
// A coin's design is fixed by its series, not its date: every Barber dime looks
// the same whether it's 1892 or 1916. So we don't need to ask an AI what a coin
// looks like — we can just look it up. That removes the guessing entirely.
//
// Anything NOT matched here is left blank, and the import prints a warning
// naming that coin so you can write its alt text by hand in the Studio.
//
// ADDING A SERIES
// Add a line to DESIGNS below: [ /pattern/i, 'description' ].
// - Order matters: the FIRST match wins, so put specific patterns above
//   general ones (e.g. "Barber Half" before a bare "Half Dollar").
// - Describe imagery only — no grade, date, mint mark, or PCGS/NGC/CAC.
// - Lowercase, no trailing period, roughly 6-14 words.
//
// ---------------------------------------------------------------------------

/**
 * Each entry: [pattern, alt text]. First match wins — order matters.
 * Obverse first, then reverse, since that's how the site reads them.
 */
const DESIGNS = [
  // --- Dollars -------------------------------------------------------------
  // Trade dollar first: its name contains "$1" patterns that could collide.
  [/Trade Dollar/i,
    'silver dollar with liberty seated on bales and an eagle with outstretched wings'],
  [/Peace Dollar/i,
    'silver dollar with liberty in a radiant crown and a perched eagle holding an olive branch'],
  [/Morgan/i,
    "silver dollar with liberty's head in a cap and an eagle with outstretched wings"],
  [/Seated Liberty Dollar/i,
    'silver dollar with liberty seated holding a shield and a heraldic eagle'],
  [/Draped Bust Dollar/i,
    'silver dollar with a draped bust of liberty and a heraldic eagle'],
  [/Eisenhower/i,
    'large coin with eisenhower in profile and an eagle landing on the moon'],

  // --- Half dollars --------------------------------------------------------
  [/Barber Half/i,
    "silver half dollar with liberty's head in a cap and a heraldic eagle with a shield"],
  [/Walking Liberty/i,
    'silver half dollar with liberty striding toward the sunrise and an eagle on a rocky perch'],
  [/Franklin/i,
    'silver half dollar with franklin in profile and the liberty bell'],
  [/Kennedy/i,
    'silver half dollar with kennedy in profile and the presidential seal eagle'],
  [/Capped Bust Half/i,
    'silver half dollar with liberty in a cap and an eagle behind a shield'],
  [/Draped Bust Half/i,
    'silver half dollar with a draped bust of liberty and a heraldic eagle'],
  [/Seated Liberty Half/i,
    'silver half dollar with liberty seated holding a shield and a heraldic eagle'],

  // --- Quarters ------------------------------------------------------------
  [/Barber Quarter/i,
    "silver quarter with liberty's head in a cap and a heraldic eagle with a shield"],
  [/Standing Liberty/i,
    'silver quarter with liberty standing in a gateway holding a shield and an eagle in flight'],
  [/Washington Quarter/i,
    'silver quarter with washington in profile and an eagle perched on a bundle of arrows'],
  [/Capped Bust Quarter/i,
    'silver quarter with liberty in a cap and an eagle behind a shield'],
  [/Seated Liberty Quarter/i,
    'silver quarter with liberty seated holding a shield and a heraldic eagle'],

  // --- Dimes ---------------------------------------------------------------
  // NOTE: Barber dimes have NO eagle — the reverse is a plain cereal wreath.
  // This is the single most common mistake when describing them.
  [/Barber Dime/i,
    "silver dime with liberty's head in a cap and a wreath of corn, wheat and oak"],
  [/Mercury Dime|Winged Liberty/i,
    'silver dime with a winged liberty head and a fasces beside an olive branch'],
  [/Roosevelt Dime/i,
    'silver dime with roosevelt in profile and a torch between olive and oak branches'],
  [/Seated Liberty Dime/i,
    'silver dime with liberty seated holding a shield and a wreath of grain'],

  // --- Nickels / five cents ------------------------------------------------
  [/Buffalo Nickel|Indian Head Nickel/i,
    'copper-nickel five cents with a native american profile and an american bison'],
  [/Liberty Head V Nickel|V Nickel|Liberty Nickel/i,
    "copper-nickel five cents with liberty's head in a coronet and a roman numeral five in a wreath"],
  [/Shield Nickel/i,
    'copper-nickel five cents with a shield and cross and a large numeral five'],
  [/Jefferson Nickel/i,
    'copper-nickel five cents with jefferson in profile and the monticello mansion'],

  // --- Small cents ---------------------------------------------------------
  [/Lincoln Cent|Wheat Cent|Wheat Penny/i,
    'copper cent with lincoln in profile and two ears of wheat'],
  [/Indian Head Cent|Indian Cent/i,
    'copper cent with liberty in a feathered headdress and an oak wreath with a shield'],
  [/Flying Eagle/i,
    'copper cent with an eagle in flight and a wreath of grain'],

  // --- Large cents / colonial ---------------------------------------------
  [/Talbot/i,
    'copper cent with a standing figure of commerce and a ship under sail'],
  [/Braided Hair/i,
    "copper cent with liberty's head in a coronet and a laurel wreath"],
  [/Large Cent|Coronet Head|Matron Head/i,
    "copper cent with liberty's head in a coronet and a laurel wreath"],
  [/Half Cent/i,
    "copper half cent with liberty's head and a laurel wreath"],
  [/Two Cent/i,
    'copper two cents with a shield and arrows and a wreath of grain'],

  // --- Gold ----------------------------------------------------------------
  [/Saint.?Gaudens|St\.? Gaudens/i,
    'gold coin with liberty striding with a torch and olive branch and an eagle in flight'],
  [/Indian Head Eagle|Indian Head \$10/i,
    'gold coin with liberty in a feathered headdress and a standing eagle'],
  [/Indian Head Quarter Eagle|Indian Head \$2\.?50|Indian Head Half Eagle|Indian Head \$5/i,
    'gold coin with a native american profile and a standing eagle, both incuse'],
  [/Liberty Head Double Eagle|Liberty Head \$20|Coronet Double Eagle/i,
    "gold coin with liberty's head in a coronet and a heraldic eagle with a shield"],
  [/Liberty Head|Coronet/i,
    "gold coin with liberty's head in a coronet and a heraldic eagle"],
];

/**
 * Looks up known alt text for a coin by its listing name.
 * Returns the description, or null when the series isn't in the table
 * (in which case the caller leaves the alt text blank and warns about it).
 */
function lookupDesign(name) {
  const n = String(name || '');
  for (const [pattern, alt] of DESIGNS) {
    if (pattern.test(n)) return alt;
  }
  return null;
}

export { DESIGNS, lookupDesign };
