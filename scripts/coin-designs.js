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
// HOW A COIN IS MATCHED (rebuilt 2026-10-10)
// Each entry has a name pattern, and usually the denominations and years it
// applies to. The denomination comes from the CSV's denomination column (or the
// "50C" / "$1" in the name), so the wording of the name no longer matters:
// "Peace Dollar", "Peace Silver Dollar" and "$1 Peace" all find the Peace
// dollar, and "Seated Liberty", "Liberty Seated" and plain "Seated" all work.
// It also stops one coin borrowing another's description — before, "Capped
// Bust Half Dime" matched the half DOLLAR line and "Liberty Head Nickel" fell
// through to the gold line.
//
// It also uses the year where a design changed, and as a check: an 1857 coin named "Capped Bust" (that design
// ended in 1837) is left blank with a warning rather than described as the wrong coin.
//
// ADDING A SERIES
// Add an entry to DESIGNS below: { match: /pattern/i, denoms: [...], years: [from, to], alt: '...' }.
// - denoms: the denominations it applies to ('1/2C', '1C', '5C', 'H10C', '10C', '25C', '50C', '$1', 'G$1',
//   '$2.50', '$3', '$5', '$10', '$20', 'PESO'). Leave it out only when the name alone is unmistakable.
// - years: optional, for a series whose design changed (Lincoln cent reverse, etc.).
// - Order matters: the FIRST match wins, so put specific entries (commemoratives) above general ones.
// - Describe imagery only — no grade, date, mint mark, or PCGS/NGC/CAC.
// - Lowercase, no trailing period, roughly 6-14 words.
// - alt: null means "known, but deliberately left blank" (stops a near-miss line from mislabeling it).
//
// ---------------------------------------------------------------------------

/**
 * First match wins — order matters. Obverse first, then reverse, since that's how the site reads them.
 * @type {{match: RegExp, denoms?: string[], years?: [number, number], alt: string|null}[]}
 */
const DESIGNS = [
  // --- Modern bullion: left blank on purpose ------------------------------
  // Their designs borrow older ones (Walking Liberty, Saint-Gaudens) and changed in 2021, so the older
  // lines below would mislabel them.
  { match: /American (Silver|Gold|Platinum) Eagle|\bASE\b|\bAGE\b/i, alt: null },

  // --- Commemoratives (each has its own design) ---------------------------
  { match: /Isabella/i, denoms: ['25C'],
    alt: 'silver quarter with a crowned bust of queen isabella and a kneeling woman holding a distaff' },
  { match: /Lafayette/i, denoms: ['$1'],
    alt: 'silver dollar with busts of washington and lafayette and lafayette on horseback' },
  { match: /Columbian/i, denoms: ['50C'],
    alt: 'silver half dollar with a bust of columbus and a sailing ship over two hemispheres' },
  { match: /Grant/i, denoms: ['G$1'],
    alt: 'small gold coin with a bust of ulysses s. grant and the house where he was born' },
  { match: /Grant/i, denoms: ['50C'],
    alt: 'silver half dollar with a bust of ulysses s. grant and the house where he was born' },
  // Louisiana Purchase gold dollars come with Jefferson or McKinley; the name says which.
  { match: /Jefferson/i, denoms: ['G$1'],
    alt: 'small gold coin with a bust of thomas jefferson and an olive branch' },
  { match: /McKinley/i, denoms: ['G$1'],
    alt: 'small gold coin with a bust of william mckinley and an olive branch' },
  { match: /Lewis/i, denoms: ['G$1'],
    alt: 'small gold coin with a bust of meriwether lewis and a bust of william clark' },
  { match: /Sesqui/i, denoms: ['$2.50'],
    alt: 'gold coin with liberty holding a torch and scroll and independence hall' },
  { match: /Sesqui/i, denoms: ['50C'],
    alt: 'silver half dollar with busts of washington and coolidge and the liberty bell' },
  { match: /Pan[- ]?Pac/i, denoms: ['50C'],
    alt: 'silver half dollar with columbia scattering flowers beside a child and an eagle on a shield' },
  { match: /Lincoln|Illinois/i, denoms: ['50C'],
    alt: 'silver half dollar with a bust of lincoln and an eagle on a rock holding a shield' },
  { match: /Pilgrim/i, denoms: ['50C'],
    alt: 'silver half dollar with a bust of governor william bradford and the mayflower under sail' },
  { match: /Stone Mountain/i, denoms: ['50C'],
    alt: 'silver half dollar with generals lee and jackson on horseback and an eagle on a mountain crag' },
  { match: /Oregon/i, denoms: ['50C'],
    alt: 'silver half dollar with a native american with a bow before a map and a covered wagon with oxen' },
  { match: /Monroe/i, denoms: ['50C'],
    alt: 'silver half dollar with busts of monroe and john quincy adams and figures shaping the americas' },
  { match: /Booker/i, denoms: ['50C'],
    alt: 'silver half dollar with a bust of booker t. washington and the hall of fame above a log cabin' },
  { match: /Carver/i, denoms: ['50C'],
    alt: 'silver half dollar with busts of carver and booker t. washington and a map of the united states' },
  { match: /Texas/i, denoms: ['50C'],
    alt: 'silver half dollar with an eagle before a large star and a kneeling winged victory' },
  { match: /Boone/i, denoms: ['50C'],
    alt: 'silver half dollar with a bust of daniel boone and boone standing with a shawnee chief' },
  { match: /Hawaii/i, denoms: ['50C'],
    alt: 'silver half dollar with a bust of captain cook and a hawaiian chief with an outstretched arm' },

  // --- U.S. Philippines ----------------------------------------------------
  // US-administered pesos, 1903-1912 (large size to 1906, reduced after; same design). The 1936 Commonwealth
  // commemorative pesos are a different design, hence the years.
  { match: /Philippine/i, denoms: ['PESO'], years: [1903, 1912],
    alt: 'silver peso with a filipina woman at an anvil before a smoking volcano and an eagle atop a shield' },

  // --- Dollars -------------------------------------------------------------
  // Trade dollar first: it is a $1 coin too.
  { match: /Trade/i, denoms: ['T$1', '$1'],
    alt: 'silver dollar with liberty seated on bales and an eagle with outstretched wings' },
  { match: /\bPeace\b/i, denoms: ['$1'],
    alt: 'silver dollar with liberty in a radiant crown and a perched eagle holding an olive branch' },
  { match: /Morgan/i, denoms: ['$1'],
    alt: "silver dollar with liberty's head in a cap and an eagle with outstretched wings" },
  { match: /Seated/i, denoms: ['$1'], years: [1840, 1873],
    alt: 'silver dollar with liberty seated holding a shield and a heraldic eagle' },
  { match: /Draped Bust/i, denoms: ['$1'], years: [1795, 1804],
    alt: 'silver dollar with a draped bust of liberty and a heraldic eagle' },
  // 1975-76 coins carry the bicentennial reverse instead.
  { match: /Eisenhower|\bIke\b/i, denoms: ['$1'], years: [1971, 1974],
    alt: 'large coin with eisenhower in profile and an eagle landing on the moon' },
  { match: /Eisenhower|\bIke\b/i, denoms: ['$1'], years: [1977, 1978],
    alt: 'large coin with eisenhower in profile and an eagle landing on the moon' },
  { match: /Anthony|\bSBA\b/i, denoms: ['$1'],
    alt: 'small dollar with susan b. anthony in profile and an eagle landing on the moon' },

  // --- Half dollars --------------------------------------------------------
  { match: /Barber/i, denoms: ['50C'], years: [1892, 1915],
    alt: "silver half dollar with liberty's head in a cap and a heraldic eagle with a shield" },
  { match: /Walking Liberty|Walker/i, denoms: ['50C'],
    alt: 'silver half dollar with liberty striding toward the sunrise and an eagle on a rocky perch' },
  { match: /Franklin/i, denoms: ['50C'],
    alt: 'silver half dollar with franklin in profile and the liberty bell' },
  // 1975-76 coins carry the bicentennial reverse (Independence Hall) instead.
  // No metal named: silver in 1964, clad after.
  { match: /Kennedy/i, denoms: ['50C'], years: [1964, 1974],
    alt: 'half dollar with kennedy in profile and the presidential seal eagle' },
  { match: /Kennedy/i, denoms: ['50C'], years: [1977, 2099],
    alt: 'half dollar with kennedy in profile and the presidential seal eagle' },
  { match: /Capped Bust/i, denoms: ['50C'], years: [1807, 1839],
    alt: 'silver half dollar with liberty in a cap and an eagle behind a shield' },
  { match: /Draped Bust/i, denoms: ['50C'], years: [1796, 1807],
    alt: 'silver half dollar with a draped bust of liberty and a heraldic eagle' },
  { match: /Seated/i, denoms: ['50C'], years: [1839, 1891],
    alt: 'silver half dollar with liberty seated holding a shield and a heraldic eagle' },

  // --- Quarters ------------------------------------------------------------
  { match: /Barber/i, denoms: ['25C'], years: [1892, 1916],
    alt: "silver quarter with liberty's head in a cap and a heraldic eagle with a shield" },
  { match: /Standing Liberty/i, denoms: ['25C'],
    alt: 'silver quarter with liberty standing in a gateway holding a shield and an eagle in flight' },
  // The eagle reverse ran 1932-1998, apart from the 1975-76 bicentennial drummer boy.
  { match: /Washington/i, denoms: ['25C'], years: [1932, 1964],
    alt: 'silver quarter with washington in profile and an eagle perched on a bundle of arrows' },
  { match: /Washington/i, denoms: ['25C'], years: [1965, 1974],
    alt: 'quarter with washington in profile and an eagle perched on a bundle of arrows' },
  { match: /Washington/i, denoms: ['25C'], years: [1977, 1998],
    alt: 'quarter with washington in profile and an eagle perched on a bundle of arrows' },
  { match: /Capped Bust/i, denoms: ['25C'], years: [1815, 1838],
    alt: 'silver quarter with liberty in a cap and an eagle behind a shield' },
  { match: /Seated/i, denoms: ['25C'], years: [1838, 1891],
    alt: 'silver quarter with liberty seated holding a shield and a heraldic eagle' },

  // --- Dimes ---------------------------------------------------------------
  // NOTE: Barber dimes have NO eagle — the reverse is a plain cereal wreath.
  // This is the single most common mistake when describing them.
  { match: /Barber/i, denoms: ['10C'], years: [1892, 1916],
    alt: "silver dime with liberty's head in a cap and a wreath of corn, wheat and oak" },
  { match: /Mercury|Winged Liberty/i, denoms: ['10C'],
    alt: 'silver dime with a winged liberty head and a fasces beside an olive branch' },
  { match: /Roosevelt/i, denoms: ['10C'],
    alt: 'dime with roosevelt in profile and a torch between olive and oak branches' },
  { match: /Capped Bust/i, denoms: ['10C'], years: [1809, 1837],
    alt: 'silver dime with liberty in a cap and an eagle behind a shield' },
  // The wreath changed from laurel to cereal grain in 1860, so the alt text just says "a wreath".
  { match: /Seated/i, denoms: ['10C'], years: [1837, 1891],
    alt: 'silver dime with liberty seated holding a shield and a wreath' },

  // --- Half dimes ----------------------------------------------------------
  { match: /Seated/i, denoms: ['H10C'], years: [1837, 1873],
    alt: 'silver half dime with liberty seated holding a shield and a wreath' },
  { match: /Capped Bust/i, denoms: ['H10C'], years: [1829, 1837],
    alt: 'silver half dime with liberty in a cap and an eagle behind a shield' },

  // --- Nickels / five cents ------------------------------------------------
  { match: /Buffalo|Indian/i, denoms: ['5C'],
    alt: 'copper-nickel five cents with a native american profile and an american bison' },
  { match: /Liberty|\bV\b/i, denoms: ['5C'],
    alt: "copper-nickel five cents with liberty's head in a coronet and a roman numeral five in a wreath" },
  { match: /Shield/i, denoms: ['5C'],
    alt: 'copper-nickel five cents with a shield and cross and a large numeral five' },
  // Monticello reverse with the profile portrait ran 1938-2003 (2004-05 had the Westward Journey designs).
  { match: /Jefferson/i, denoms: ['5C'], years: [1938, 2003],
    alt: 'five cent coin with jefferson in profile and the monticello mansion' },   // wartime 1942-45 were silver

  // --- Small cents ---------------------------------------------------------
  // Lincoln reverse: wheat ears 1909-1958, the Lincoln Memorial 1959-2008, a union shield from 2010.
  { match: /Lincoln|Wheat/i, denoms: ['1C'], years: [1943, 1943],
    alt: 'zinc-coated steel cent with lincoln in profile and two ears of wheat' },
  { match: /Lincoln|Wheat/i, denoms: ['1C'], years: [1909, 1958],
    alt: 'copper cent with lincoln in profile and two ears of wheat' },
  { match: /Lincoln|Memorial/i, denoms: ['1C'], years: [1959, 2008],
    alt: 'copper cent with lincoln in profile and the lincoln memorial' },
  { match: /Lincoln|Shield/i, denoms: ['1C'], years: [2010, 2099],
    alt: 'copper cent with lincoln in profile and a union shield' },
  { match: /Indian/i, denoms: ['1C'],
    alt: 'copper cent with liberty in a feathered headdress and an oak wreath with a shield' },
  { match: /Flying Eagle/i, denoms: ['1C'],
    alt: 'copper cent with an eagle in flight and a wreath of grain' },

  // --- Large cents, half cents, two cents ---------------------------------
  { match: /Draped Bust/i, denoms: ['1C'], years: [1796, 1807],
    alt: 'copper cent with a draped bust of liberty and a laurel wreath' },
  { match: /Braided Hair|Large Cent|Coronet|Matron/i, denoms: ['1C'],
    alt: "copper cent with liberty's head in a coronet and a laurel wreath" },
  { match: /Talbot/i,
    alt: 'copper cent with a standing figure of commerce and a ship under sail' },
  { match: /./, denoms: ['1/2C'],
    alt: "copper half cent with liberty's head and a laurel wreath" },
  { match: /./, denoms: ['2C'],
    alt: 'copper two cents with a shield and arrows and a wreath of grain' },

  // --- Gold ----------------------------------------------------------------
  // Gold dollars: Liberty head (Type 1, 1849-54), then the Indian princess (Types 2 and 3).
  { match: /Princess|Indian|Type (2|3|II|III)\b/i, denoms: ['G$1'],
    alt: 'small gold coin with liberty in a feathered headdress and an agricultural wreath' },
  { match: /Liberty|Coronet|Type (1|I)\b/i, denoms: ['G$1'],
    alt: "small gold coin with liberty's head in a coronet and a wreath" },
  { match: /./, denoms: ['$3'],
    alt: 'gold coin with liberty in a feathered headdress and an agricultural wreath' },
  { match: /Saint.?Gaudens|St\.? ?Gaudens|\bSaint\b/i, denoms: ['$20'],
    alt: 'gold coin with liberty striding with a torch and olive branch and an eagle in flight' },
  { match: /Indian/i, denoms: ['$10'],
    alt: 'gold coin with liberty in a feathered headdress and a standing eagle' },
  { match: /Indian/i, denoms: ['$2.50', '$5'],
    alt: 'gold coin with a native american profile and a standing eagle, both incuse' },
  { match: /Liberty|Coronet/i, denoms: ['$20'],
    alt: "gold coin with liberty's head in a coronet and a heraldic eagle with a shield" },
  { match: /Liberty|Coronet/i, denoms: ['$2.50', '$5', '$10'],
    alt: "gold coin with liberty's head in a coronet and a heraldic eagle" },
];

/**
 * The denomination as one of the codes above: from the CSV column when it has one, else from the name
 * ("1893-S $1 Morgan…"). Spreadsheet variants are tidied: "1" → "$1", "$2.5" → "$2.50", "G$10" → "$10"
 * (only the gold DOLLAR keeps its G).
 */
function normalizeDenomination(denomination, name) {
  let d = String(denomination ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const inName = String(name ?? '').match(/(?:^|\s)(1\/2C|H10C|T\$1|G\$\d+(?:\.\d+)?|\$\d+(?:\.\d+)?|\d+C)(?=[\s,]|$)/i)?.[1].toUpperCase();
  // The spreadsheet writes dollar coins as bare numbers ("1", "2.5", "10"). A bare number is ambiguous ("5" could
  // be $5 gold or a 5C nickel), so the name's "$2.5" / "5C" decides; failing that it's read as dollars.
  if (!d || /^\d+(\.\d+)?$/.test(d)) d = inName ?? (d ? `$${d}` : '');
  if (/^G?\$2\.50?$/.test(d)) d = '$2.50';
  if (/^G\$/.test(d) && d !== 'G$1') d = d.slice(1);
  return d;
}

/** The year the coin is dated (the first year in the name), or null. Overdates like 1815/2 count as 1815. */
function yearOf(name) {
  const m = String(name ?? '').match(/\b(1[6-9]\d\d|20\d\d)\b/);
  return m ? Number(m[1]) : null;
}

/**
 * Looks up known alt text for a coin by its listing name and denomination.
 * Returns the description, or null when nothing in the table covers it
 * (in which case the caller leaves the alt text blank and warns about it).
 */
function lookupDesign(name, denomination) {
  const n = String(name || '');
  const denom = normalizeDenomination(denomination, n);
  const year = yearOf(n);
  for (const entry of DESIGNS) {
    if (entry.denoms && !entry.denoms.includes(denom)) continue;
    if (entry.years && !(year && year >= entry.years[0] && year <= entry.years[1])) continue;
    if (entry.match.test(n)) return entry.alt;
  }
  return null;
}

export { DESIGNS, lookupDesign, normalizeDenomination };
