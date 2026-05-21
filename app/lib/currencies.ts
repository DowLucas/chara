// ISO 4217 active currency list. Bundled rather than fetched so the picker
// works offline and is auditable in source. `decimals` is the standard minor
// unit exponent (0 for JPY/KRW/VND, 3 for KWD/BHD/JOD/OMR/TND/LYD/IQD, 2
// for everything else). `symbol` is the most-recognised glyph and is
// best-effort — callers that need a guaranteed render must fall back to the
// code itself.

export interface Currency {
  /** ISO 4217 alphabetic code, e.g. "SEK", "JPY", "USD". */
  code: string;
  /** English short name. */
  name: string;
  /** Minor-unit exponent. 1 SEK = 100 öre → 2; 1 JPY = 1 ¥ → 0; 1 KWD = 1000 fils → 3. */
  decimals: 0 | 2 | 3;
  /** Best-effort display glyph. May be empty for codes with no widely-used symbol. */
  symbol?: string;
}

// Currencies whose users we expect to start with — shown above the
// alphabetical list in pickers as a quick-access strip.
export const SUGGESTED_CURRENCY_CODES = ['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK'] as const;

export const CURRENCIES: readonly Currency[] = [
  { code: 'AED', name: 'UAE Dirham',                       decimals: 2, symbol: 'د.إ' },
  { code: 'AFN', name: 'Afghan Afghani',                   decimals: 2, symbol: '؋' },
  { code: 'ALL', name: 'Albanian Lek',                     decimals: 2, symbol: 'L' },
  { code: 'AMD', name: 'Armenian Dram',                    decimals: 2, symbol: '֏' },
  { code: 'ANG', name: 'Netherlands Antillean Guilder',    decimals: 2, symbol: 'ƒ' },
  { code: 'AOA', name: 'Angolan Kwanza',                   decimals: 2, symbol: 'Kz' },
  { code: 'ARS', name: 'Argentine Peso',                   decimals: 2, symbol: '$' },
  { code: 'AUD', name: 'Australian Dollar',                decimals: 2, symbol: 'A$' },
  { code: 'AWG', name: 'Aruban Florin',                    decimals: 2, symbol: 'ƒ' },
  { code: 'AZN', name: 'Azerbaijani Manat',                decimals: 2, symbol: '₼' },
  { code: 'BAM', name: 'Bosnia-Herzegovina Convertible Mark', decimals: 2, symbol: 'KM' },
  { code: 'BBD', name: 'Barbadian Dollar',                 decimals: 2, symbol: '$' },
  { code: 'BDT', name: 'Bangladeshi Taka',                 decimals: 2, symbol: '৳' },
  { code: 'BGN', name: 'Bulgarian Lev',                    decimals: 2, symbol: 'лв' },
  { code: 'BHD', name: 'Bahraini Dinar',                   decimals: 3, symbol: '.د.ب' },
  { code: 'BIF', name: 'Burundian Franc',                  decimals: 0, symbol: 'FBu' },
  { code: 'BMD', name: 'Bermudian Dollar',                 decimals: 2, symbol: '$' },
  { code: 'BND', name: 'Brunei Dollar',                    decimals: 2, symbol: '$' },
  { code: 'BOB', name: 'Bolivian Boliviano',               decimals: 2, symbol: 'Bs.' },
  { code: 'BRL', name: 'Brazilian Real',                   decimals: 2, symbol: 'R$' },
  { code: 'BSD', name: 'Bahamian Dollar',                  decimals: 2, symbol: '$' },
  { code: 'BTN', name: 'Bhutanese Ngultrum',               decimals: 2, symbol: 'Nu.' },
  { code: 'BWP', name: 'Botswanan Pula',                   decimals: 2, symbol: 'P' },
  { code: 'BYN', name: 'Belarusian Ruble',                 decimals: 2, symbol: 'Br' },
  { code: 'BZD', name: 'Belize Dollar',                    decimals: 2, symbol: 'BZ$' },
  { code: 'CAD', name: 'Canadian Dollar',                  decimals: 2, symbol: 'C$' },
  { code: 'CDF', name: 'Congolese Franc',                  decimals: 2, symbol: 'FC' },
  { code: 'CHF', name: 'Swiss Franc',                      decimals: 2, symbol: 'CHF' },
  { code: 'CLP', name: 'Chilean Peso',                     decimals: 0, symbol: '$' },
  { code: 'CNY', name: 'Chinese Yuan',                     decimals: 2, symbol: '¥' },
  { code: 'COP', name: 'Colombian Peso',                   decimals: 2, symbol: '$' },
  { code: 'CRC', name: 'Costa Rican Colón',                decimals: 2, symbol: '₡' },
  { code: 'CUP', name: 'Cuban Peso',                       decimals: 2, symbol: '₱' },
  { code: 'CVE', name: 'Cape Verdean Escudo',              decimals: 2, symbol: '$' },
  { code: 'CZK', name: 'Czech Koruna',                     decimals: 2, symbol: 'Kč' },
  { code: 'DJF', name: 'Djiboutian Franc',                 decimals: 0, symbol: 'Fdj' },
  { code: 'DKK', name: 'Danish Krone',                     decimals: 2, symbol: 'kr' },
  { code: 'DOP', name: 'Dominican Peso',                   decimals: 2, symbol: 'RD$' },
  { code: 'DZD', name: 'Algerian Dinar',                   decimals: 2, symbol: 'دج' },
  { code: 'EGP', name: 'Egyptian Pound',                   decimals: 2, symbol: 'E£' },
  { code: 'ERN', name: 'Eritrean Nakfa',                   decimals: 2, symbol: 'Nfk' },
  { code: 'ETB', name: 'Ethiopian Birr',                   decimals: 2, symbol: 'Br' },
  { code: 'EUR', name: 'Euro',                             decimals: 2, symbol: '€' },
  { code: 'FJD', name: 'Fijian Dollar',                    decimals: 2, symbol: '$' },
  { code: 'FKP', name: 'Falkland Islands Pound',           decimals: 2, symbol: '£' },
  { code: 'GBP', name: 'British Pound',                    decimals: 2, symbol: '£' },
  { code: 'GEL', name: 'Georgian Lari',                    decimals: 2, symbol: '₾' },
  { code: 'GHS', name: 'Ghanaian Cedi',                    decimals: 2, symbol: '₵' },
  { code: 'GIP', name: 'Gibraltar Pound',                  decimals: 2, symbol: '£' },
  { code: 'GMD', name: 'Gambian Dalasi',                   decimals: 2, symbol: 'D' },
  { code: 'GNF', name: 'Guinean Franc',                    decimals: 0, symbol: 'FG' },
  { code: 'GTQ', name: 'Guatemalan Quetzal',               decimals: 2, symbol: 'Q' },
  { code: 'GYD', name: 'Guyanaese Dollar',                 decimals: 2, symbol: '$' },
  { code: 'HKD', name: 'Hong Kong Dollar',                 decimals: 2, symbol: 'HK$' },
  { code: 'HNL', name: 'Honduran Lempira',                 decimals: 2, symbol: 'L' },
  { code: 'HTG', name: 'Haitian Gourde',                   decimals: 2, symbol: 'G' },
  { code: 'HUF', name: 'Hungarian Forint',                 decimals: 2, symbol: 'Ft' },
  { code: 'IDR', name: 'Indonesian Rupiah',                decimals: 2, symbol: 'Rp' },
  { code: 'ILS', name: 'Israeli New Shekel',               decimals: 2, symbol: '₪' },
  { code: 'INR', name: 'Indian Rupee',                     decimals: 2, symbol: '₹' },
  { code: 'IQD', name: 'Iraqi Dinar',                      decimals: 3, symbol: 'ع.د' },
  { code: 'IRR', name: 'Iranian Rial',                     decimals: 2, symbol: '﷼' },
  { code: 'ISK', name: 'Icelandic Króna',                  decimals: 0, symbol: 'kr' },
  { code: 'JMD', name: 'Jamaican Dollar',                  decimals: 2, symbol: 'J$' },
  { code: 'JOD', name: 'Jordanian Dinar',                  decimals: 3, symbol: 'د.ا' },
  { code: 'JPY', name: 'Japanese Yen',                     decimals: 0, symbol: '¥' },
  { code: 'KES', name: 'Kenyan Shilling',                  decimals: 2, symbol: 'KSh' },
  { code: 'KGS', name: 'Kyrgystani Som',                   decimals: 2, symbol: 'с' },
  { code: 'KHR', name: 'Cambodian Riel',                   decimals: 2, symbol: '៛' },
  { code: 'KMF', name: 'Comorian Franc',                   decimals: 0, symbol: 'CF' },
  { code: 'KPW', name: 'North Korean Won',                 decimals: 2, symbol: '₩' },
  { code: 'KRW', name: 'South Korean Won',                 decimals: 0, symbol: '₩' },
  { code: 'KWD', name: 'Kuwaiti Dinar',                    decimals: 3, symbol: 'د.ك' },
  { code: 'KYD', name: 'Cayman Islands Dollar',            decimals: 2, symbol: '$' },
  { code: 'KZT', name: 'Kazakhstani Tenge',                decimals: 2, symbol: '₸' },
  { code: 'LAK', name: 'Laotian Kip',                      decimals: 2, symbol: '₭' },
  { code: 'LBP', name: 'Lebanese Pound',                   decimals: 2, symbol: 'ل.ل' },
  { code: 'LKR', name: 'Sri Lankan Rupee',                 decimals: 2, symbol: 'Rs' },
  { code: 'LRD', name: 'Liberian Dollar',                  decimals: 2, symbol: '$' },
  { code: 'LSL', name: 'Lesotho Loti',                     decimals: 2, symbol: 'L' },
  { code: 'LYD', name: 'Libyan Dinar',                     decimals: 3, symbol: 'ل.د' },
  { code: 'MAD', name: 'Moroccan Dirham',                  decimals: 2, symbol: 'د.م.' },
  { code: 'MDL', name: 'Moldovan Leu',                     decimals: 2, symbol: 'L' },
  { code: 'MGA', name: 'Malagasy Ariary',                  decimals: 2, symbol: 'Ar' },
  { code: 'MKD', name: 'Macedonian Denar',                 decimals: 2, symbol: 'ден' },
  { code: 'MMK', name: 'Myanma Kyat',                      decimals: 2, symbol: 'K' },
  { code: 'MNT', name: 'Mongolian Tugrik',                 decimals: 2, symbol: '₮' },
  { code: 'MOP', name: 'Macanese Pataca',                  decimals: 2, symbol: 'MOP$' },
  { code: 'MRU', name: 'Mauritanian Ouguiya',              decimals: 2, symbol: 'UM' },
  { code: 'MUR', name: 'Mauritian Rupee',                  decimals: 2, symbol: '₨' },
  { code: 'MVR', name: 'Maldivian Rufiyaa',                decimals: 2, symbol: 'Rf' },
  { code: 'MWK', name: 'Malawian Kwacha',                  decimals: 2, symbol: 'MK' },
  { code: 'MXN', name: 'Mexican Peso',                     decimals: 2, symbol: '$' },
  { code: 'MYR', name: 'Malaysian Ringgit',                decimals: 2, symbol: 'RM' },
  { code: 'MZN', name: 'Mozambican Metical',               decimals: 2, symbol: 'MT' },
  { code: 'NAD', name: 'Namibian Dollar',                  decimals: 2, symbol: '$' },
  { code: 'NGN', name: 'Nigerian Naira',                   decimals: 2, symbol: '₦' },
  { code: 'NIO', name: 'Nicaraguan Córdoba',               decimals: 2, symbol: 'C$' },
  { code: 'NOK', name: 'Norwegian Krone',                  decimals: 2, symbol: 'kr' },
  { code: 'NPR', name: 'Nepalese Rupee',                   decimals: 2, symbol: '₨' },
  { code: 'NZD', name: 'New Zealand Dollar',               decimals: 2, symbol: 'NZ$' },
  { code: 'OMR', name: 'Omani Rial',                       decimals: 3, symbol: 'ر.ع.' },
  { code: 'PAB', name: 'Panamanian Balboa',                decimals: 2, symbol: 'B/.' },
  { code: 'PEN', name: 'Peruvian Sol',                     decimals: 2, symbol: 'S/' },
  { code: 'PGK', name: 'Papua New Guinean Kina',           decimals: 2, symbol: 'K' },
  { code: 'PHP', name: 'Philippine Peso',                  decimals: 2, symbol: '₱' },
  { code: 'PKR', name: 'Pakistani Rupee',                  decimals: 2, symbol: '₨' },
  { code: 'PLN', name: 'Polish Złoty',                     decimals: 2, symbol: 'zł' },
  { code: 'PYG', name: 'Paraguayan Guarani',               decimals: 0, symbol: '₲' },
  { code: 'QAR', name: 'Qatari Rial',                      decimals: 2, symbol: 'ر.ق' },
  { code: 'RON', name: 'Romanian Leu',                     decimals: 2, symbol: 'lei' },
  { code: 'RSD', name: 'Serbian Dinar',                    decimals: 2, symbol: 'дин.' },
  { code: 'RUB', name: 'Russian Ruble',                    decimals: 2, symbol: '₽' },
  { code: 'RWF', name: 'Rwandan Franc',                    decimals: 0, symbol: 'FRw' },
  { code: 'SAR', name: 'Saudi Riyal',                      decimals: 2, symbol: 'ر.س' },
  { code: 'SBD', name: 'Solomon Islands Dollar',           decimals: 2, symbol: '$' },
  { code: 'SCR', name: 'Seychellois Rupee',                decimals: 2, symbol: '₨' },
  { code: 'SDG', name: 'Sudanese Pound',                   decimals: 2, symbol: 'ج.س.' },
  { code: 'SEK', name: 'Swedish Krona',                    decimals: 2, symbol: 'kr' },
  { code: 'SGD', name: 'Singapore Dollar',                 decimals: 2, symbol: 'S$' },
  { code: 'SHP', name: 'Saint Helena Pound',               decimals: 2, symbol: '£' },
  { code: 'SLE', name: 'Sierra Leonean Leone',             decimals: 2, symbol: 'Le' },
  { code: 'SOS', name: 'Somali Shilling',                  decimals: 2, symbol: 'S' },
  { code: 'SRD', name: 'Surinamese Dollar',                decimals: 2, symbol: '$' },
  { code: 'SSP', name: 'South Sudanese Pound',             decimals: 2, symbol: '£' },
  { code: 'STN', name: 'São Tomé and Príncipe Dobra',      decimals: 2, symbol: 'Db' },
  { code: 'SVC', name: 'Salvadoran Colón',                 decimals: 2, symbol: '$' },
  { code: 'SYP', name: 'Syrian Pound',                     decimals: 2, symbol: '£' },
  { code: 'SZL', name: 'Swazi Lilangeni',                  decimals: 2, symbol: 'L' },
  { code: 'THB', name: 'Thai Baht',                        decimals: 2, symbol: '฿' },
  { code: 'TJS', name: 'Tajikistani Somoni',               decimals: 2, symbol: 'SM' },
  { code: 'TMT', name: 'Turkmenistani Manat',              decimals: 2, symbol: 'm' },
  { code: 'TND', name: 'Tunisian Dinar',                   decimals: 3, symbol: 'د.ت' },
  { code: 'TOP', name: 'Tongan Paʻanga',                   decimals: 2, symbol: 'T$' },
  { code: 'TRY', name: 'Turkish Lira',                     decimals: 2, symbol: '₺' },
  { code: 'TTD', name: 'Trinidad and Tobago Dollar',       decimals: 2, symbol: 'TT$' },
  { code: 'TWD', name: 'New Taiwan Dollar',                decimals: 2, symbol: 'NT$' },
  { code: 'TZS', name: 'Tanzanian Shilling',               decimals: 2, symbol: 'TSh' },
  { code: 'UAH', name: 'Ukrainian Hryvnia',                decimals: 2, symbol: '₴' },
  { code: 'UGX', name: 'Ugandan Shilling',                 decimals: 0, symbol: 'USh' },
  { code: 'USD', name: 'US Dollar',                        decimals: 2, symbol: '$' },
  { code: 'UYU', name: 'Uruguayan Peso',                   decimals: 2, symbol: '$U' },
  { code: 'UZS', name: 'Uzbekistan Som',                   decimals: 2, symbol: 'soʻm' },
  { code: 'VES', name: 'Venezuelan Bolívar Soberano',      decimals: 2, symbol: 'Bs.S' },
  { code: 'VND', name: 'Vietnamese Dong',                  decimals: 0, symbol: '₫' },
  { code: 'VUV', name: 'Vanuatu Vatu',                     decimals: 0, symbol: 'VT' },
  { code: 'WST', name: 'Samoan Tala',                      decimals: 2, symbol: 'WS$' },
  { code: 'XAF', name: 'Central African CFA Franc',        decimals: 0, symbol: 'FCFA' },
  { code: 'XCD', name: 'East Caribbean Dollar',            decimals: 2, symbol: '$' },
  { code: 'XOF', name: 'West African CFA Franc',           decimals: 0, symbol: 'CFA' },
  { code: 'XPF', name: 'CFP Franc',                        decimals: 0, symbol: '₣' },
  { code: 'YER', name: 'Yemeni Rial',                      decimals: 2, symbol: '﷼' },
  { code: 'ZAR', name: 'South African Rand',               decimals: 2, symbol: 'R' },
  { code: 'ZMW', name: 'Zambian Kwacha',                   decimals: 2, symbol: 'ZK' },
  { code: 'ZWG', name: 'Zimbabwe Gold',                    decimals: 2, symbol: 'ZiG' },
];

const BY_CODE: Map<string, Currency> = new Map(CURRENCIES.map((c) => [c.code, c]));

/** Look up a currency by ISO code. Returns undefined for unknown codes —
 *  callers should fall back to displaying the raw code. */
export function getCurrency(code: string): Currency | undefined {
  return BY_CODE.get(code.toUpperCase());
}

/** Minor-unit exponent for a currency. Falls back to 2 if the code is
 *  unknown so legacy data with a typo'd code still renders something
 *  reasonable. */
export function currencyDecimals(code: string): number {
  return BY_CODE.get(code.toUpperCase())?.decimals ?? 2;
}

/** Whether `code` is a recognised ISO 4217 alphabetic code we support. */
export function isKnownCurrency(code: string): boolean {
  return BY_CODE.has(code.toUpperCase());
}
