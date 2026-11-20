// Curated in the Sawyer TD-H3/NICFW receive-only channel plan (November 2026).
// FM means analog voice FM here; SDR-TUNR's WFM mode is broadcast FM only.
export const SAWYER_PRESETS = Object.freeze({
  A: { label: 'Bedside', automatic: true },
  B: { label: 'GMRS / FRS', automatic: true },
  C: { label: 'Local FRS / MURS', automatic: true },
  D: { label: 'Ham', automatic: true },
  E: { label: 'Rail', automatic: true },
  F: { label: 'Air voice', automatic: true },
  G: { label: 'Marine', automatic: true },
  H: { label: 'NOAA weather', automatic: false },
  I: { label: 'Airport weather / ATIS', automatic: false },
  J: { label: 'Air guard', automatic: false },
  K: { label: 'DX watch', automatic: true },
  L: { label: 'GMRS inputs', automatic: true },
  M: { label: 'ISS', automatic: false },
});

const rows = [
  ["GMRS 15", 462550000, "FM", "ABK", "GMRS repeater output and simplex; no RX tone", "FCC Part 95"],
  ["GMRS 16", 462575000, "FM", "ABK", "GMRS repeater output and simplex; no RX tone", "FCC Part 95"],
  ["GMRS 17", 462600000, "FM", "ABK", "GMRS repeater output and simplex; no RX tone", "FCC Part 95"],
  ["GMRS 18", 462625000, "FM", "ABK", "GMRS repeater output and simplex; no RX tone", "FCC Part 95"],
  ["GMRS 19", 462650000, "FM", "ABK", "GMRS repeater output and simplex; no RX tone", "FCC Part 95"],
  ["GMRS 20", 462675000, "FM", "ABK", "GMRS repeater output and simplex; no RX tone", "FCC Part 95"],
  ["GMRS 21", 462700000, "FM", "ABK", "GMRS repeater output and simplex; no RX tone", "FCC Part 95"],
  ["GMRS 22", 462725000, "FM", "ABK", "GMRS repeater output and simplex; no RX tone", "FCC Part 95"],
  ["FRS 01", 462562500, "FM", "BC", "Shared FRS/GMRS interstitial", "FCC Part 95"],
  ["FRS 02", 462587500, "FM", "BC", "Shared FRS/GMRS interstitial", "FCC Part 95"],
  ["FRS 03", 462612500, "FM", "BC", "Shared FRS/GMRS interstitial", "FCC Part 95"],
  ["FRS 04", 462637500, "FM", "BC", "Shared FRS/GMRS interstitial", "FCC Part 95"],
  ["FRS 05", 462662500, "FM", "BC", "Shared FRS/GMRS interstitial", "FCC Part 95"],
  ["FRS 06", 462687500, "FM", "BC", "Shared FRS/GMRS interstitial", "FCC Part 95"],
  ["FRS 07", 462712500, "FM", "BC", "Shared FRS/GMRS interstitial", "FCC Part 95"],
  ["FRS 08", 467562500, "FM", "BC", "Shared low-power interstitial; very local", "FCC Part 95"],
  ["FRS 09", 467587500, "FM", "BC", "Shared low-power interstitial; very local", "FCC Part 95"],
  ["FRS 10", 467612500, "FM", "BC", "Shared low-power interstitial; very local", "FCC Part 95"],
  ["FRS 11", 467637500, "FM", "BC", "Shared low-power interstitial; very local", "FCC Part 95"],
  ["FRS 12", 467662500, "FM", "BC", "Shared low-power interstitial; very local", "FCC Part 95"],
  ["FRS 13", 467687500, "FM", "BC", "Shared low-power interstitial; very local", "FCC Part 95"],
  ["FRS 14", 467712500, "FM", "BC", "Shared low-power interstitial; very local", "FCC Part 95"],
  ["RPT IN 15", 467550000, "FM", "L", "Repeater input monitor only; nearby users, not DX", "FCC Part 95"],
  ["RPT IN 16", 467575000, "FM", "L", "Repeater input monitor only; nearby users, not DX", "FCC Part 95"],
  ["RPT IN 17", 467600000, "FM", "L", "Repeater input monitor only; nearby users, not DX", "FCC Part 95"],
  ["RPT IN 18", 467625000, "FM", "L", "Repeater input monitor only; nearby users, not DX", "FCC Part 95"],
  ["RPT IN 19", 467650000, "FM", "L", "Repeater input monitor only; nearby users, not DX", "FCC Part 95"],
  ["RPT IN 20", 467675000, "FM", "L", "Repeater input monitor only; nearby users, not DX", "FCC Part 95"],
  ["RPT IN 21", 467700000, "FM", "L", "Repeater input monitor only; nearby users, not DX", "FCC Part 95"],
  ["RPT IN 22", 467725000, "FM", "L", "Repeater input monitor only; nearby users, not DX", "FCC Part 95"],
  ["MURS 1", 151820000, "FM", "C", "", "FCC Part 95"],
  ["MURS 2", 151880000, "FM", "C", "", "FCC Part 95"],
  ["MURS 3", 151940000, "FM", "C", "", "FCC Part 95"],
  ["MURS 4", 154570000, "FM", "C", "", "FCC Part 95"],
  ["MURS 5", 154600000, "FM", "C", "", "FCC Part 95"],
  ["W8MAI BRG", 442775000, "FM", "ADK", "Bridgman UHF", "MIARC / ARRL"],
  ["KB8VIM STJ", 146720000, "FM", "ADK", "St Joseph; RX only", "MIARC / ARRL"],
  ["KC8BRS NLS", 147180000, "FM", "ADK", "Niles VHF", "MIARC / ARRL"],
  ["W8MAI SL V", 146820000, "FM", "DK", "Sister Lakes VHF", "MIARC / ARRL"],
  ["W8MAI SL U", 444700000, "FM", "DK", "Sister Lakes UHF", "MIARC / ARRL"],
  ["2M CALL", 146520000, "FM", "ADK", "National FM simplex calling", "MIARC / ARRL"],
  ["70CM CALL", 446000000, "FM", "ADK", "National FM simplex calling", "MIARC / ARRL"],
  ["CSX ROAD", 160230000, "FM", "AE", "CSX Grand Rapids Sub road / AAR 08", "Chicago Railfan / On Track On Line"],
  ["CSX DISP", 160635000, "FM", "AE", "CSX Grand Rapids Sub dispatch / AAR 35", "Chicago Railfan / On Track On Line"],
  ["AMTK MI RD", 161505000, "FM", "AE", "Amtrak Michigan Line road / AAR 93; verify locally", "Chicago Railfan / On Track On Line"],
  ["SBN APP N", 118550000, "AM", "AF", "South Bend approach; also serves Benton Harbor", "FAA / airport publications"],
  ["SBN APP S", 132050000, "AM", "AF", "South Bend other approach sector", "FAA / airport publications"],
  ["BEH CTAF", 123000000, "AM", "AF", "Benton Harbor CTAF / UNICOM", "FAA / airport publications"],
  ["BEH CLNC", 119700000, "AM", "F", "Benton Harbor clearance delivery", "FAA / airport publications"],
  ["SBN TWR", 135675000, "AM", "AF", "South Bend tower / CTAF", "FAA / airport publications"],
  ["SBN GND", 121700000, "AM", "F", "South Bend ground", "FAA / airport publications"],
  ["SBN CLNC", 121900000, "AM", "F", "South Bend clearance delivery", "FAA / airport publications"],
  ["CHI ARTCC", 124100000, "AM", "F", "Chicago Center frequency listed in SBN airport plan", "FAA / airport publications"],
  ["MGC CTAF", 122700000, "AM", "AF", "Michigan City CTAF / UNICOM", "FAA / airport publications"],
  ["MGC CLNC", 118625000, "AM", "F", "Michigan City clearance delivery", "FAA / airport publications"],
  ["NLS C91 CTAF", 122800000, "AM", "AF", "Shared Niles and Dowagiac CTAF; one memory", "FAA / airport publications"],
  ["BEH ASOS", 121550000, "AM", "I", "Benton Harbor; manual, continuous broadcast", "FAA / airport publications"],
  ["SBN ATIS", 120675000, "AM", "I", "South Bend; manual, continuous broadcast", "FAA / airport publications"],
  ["MGC AWOS", 128450000, "AM", "I", "Michigan City; manual, continuous broadcast", "FAA / airport publications"],
  ["EKM AWOS", 124475000, "AM", "I", "Elkhart; manual, continuous broadcast", "FAA / airport publications"],
  ["MAR 16", 156800000, "FM", "AG", "Distress, safety and calling", "USCG NAVCEN"],
  ["MAR 09", 156450000, "FM", "AG", "Boater calling", "USCG NAVCEN"],
  ["MAR 13", 156650000, "FM", "AG", "Bridge-to-bridge", "USCG NAVCEN"],
  ["MAR 22A", 157100000, "FM", "AG", "USCG liaison and safety; 1022", "USCG NAVCEN"],
  ["MAR 68", 156425000, "FM", "G", "Noncommercial", "USCG NAVCEN"],
  ["MAR 69", 156475000, "FM", "G", "Noncommercial", "USCG NAVCEN"],
  ["MAR 71", 156575000, "FM", "G", "Noncommercial", "USCG NAVCEN"],
  ["MAR 72", 156625000, "FM", "G", "Noncommercial intership", "USCG NAVCEN"],
  ["MAR 06", 156300000, "FM", "G", "Intership safety", "USCG NAVCEN"],
  ["MAR 67", 156375000, "FM", "G", "Commercial; intership only", "USCG NAVCEN"],
  ["MAR 78A", 156925000, "FM", "G", "Noncommercial; 1078", "USCG NAVCEN"],
  ["MAR 83A", 157175000, "FM", "G", "US Coast Guard only; 1083", "USCG NAVCEN"],
  ["WX KJY62", 162500000, "FM", "H", "Michigan City/La Porte; try first for Berrien; manual only", "NWS"],
  ["WX WXJ57", 162400000, "FM", "H", "South Bend; manual only", "NWS"],
  ["WX WWF34", 162475000, "FM", "H", "Plainwell; manual only", "NWS"],
  ["WX 550", 162550000, "FM", "H", "Kentwood or another regional transmitter; manual only", "NWS"],
  ["WX 425", 162425000, "FM", "H", "Travel / regional search; manual only", "NWS"],
  ["WX 450", 162450000, "FM", "H", "Travel / regional search; manual only", "NWS"],
  ["WX 525", 162525000, "FM", "H", "Travel / regional search; manual only", "NWS"],
  ["AIR GUARD", 121500000, "AM", "J", "Emergency guard; optional, not in routine scan", "FAA AIM"],
  ["ISS VOICE", 145800000, "FM", "M", "Scheduled voice downlink; not continuously active", "ARISS"],
  ["ISS RPT", 437800000, "FM", "M", "Crossband FM downlink if active; Doppler tuning may help", "ARISS"],
];

export function isSawyerManualFrequency(frequency) {
  return rows.some(([, hz, , groups]) => hz === frequency && /[HIJM]/.test(groups));
}

export function sawyerChannels(preset) {
  if (!Object.hasOwn(SAWYER_PRESETS, preset)) return [];
  return rows.filter(row => row[3].includes(preset))
    .map(([name, frequency, mode, , detail, sourceName]) => ({
      name, frequency, mode, detail, sourceName, manualOnly: isSawyerManualFrequency(frequency),
    }));
}

export function sawyerScanChannels(preset) {
  if (!Object.hasOwn(SAWYER_PRESETS, preset) || !SAWYER_PRESETS[preset].automatic) return [];
  return sawyerChannels(preset).filter(channel => !channel.manualOnly);
}

export function addSawyerFavorites(favorites, preset, createID) {
  const bandName = Object.hasOwn(SAWYER_PRESETS, preset) ? `Sawyer · ${SAWYER_PRESETS[preset].label}` : '';
  const known = new Set(favorites.map(({ frequency, mode }) => `${frequency}:${mode}`));
  const added = [];
  for (const { name, frequency, mode } of sawyerChannels(preset)) {
    const key = `${frequency}:${mode}`;
    if (known.has(key)) continue;
    known.add(key);
    added.push({ id: createID(), name, frequency, mode, bandName });
  }
  return { favorites: [...favorites, ...added], added: added.length };
}
