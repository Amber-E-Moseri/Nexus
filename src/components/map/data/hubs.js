// Real hub coordinates for BLW CAN campuses, ported verbatim from the standalone
// map app. A "hub" is a travel-coordination point that groups campuses within 25km.
// Fields: lat, lng, radius (degrees, legacy cluster spread), group (region).
export const HUBS = {
  "Barrie (Georgian)": {
    "lat": 44.5015,
    "lng": -79.5644,
    "radius": 0.1779,
    "group": "Central"
  },
  "Brock": {
    "lat": 43.0981,
    "lng": -79.1865,
    "radius": 0.1588,
    "group": "Central"
  },
  "Gatineau": {
    "lat": 45.4572,
    "lng": -75.7673,
    "radius": 0.15,
    "group": "Central"
  },
  "Kingston (Queen’s)": {
    "lat": 44.2891,
    "lng": -76.5233,
    "radius": 1.1911,
    "group": "Central"
  },
  "McMaster": {
    "lat": 43.2346,
    "lng": -79.868,
    "radius": 0.2018,
    "group": "Central"
  },
  "UTM": {
    "lat": 43.5723,
    "lng": -79.6534,
    "radius": 0.176,
    "group": "Central"
  },
  "Montreal": {
    "lat": 45.5283,
    "lng": -73.616,
    "radius": 0.8602,
    "group": "Central"
  },
  "Nipissing University (North Bay)": {
    "lat": 46.3443,
    "lng": -79.4895,
    "radius": 0.15,
    "group": "Central"
  },
  "UTSC": {
    "lat": 43.8402,
    "lng": -79.1113,
    "radius": 0.3106,
    "group": "Central"
  },
  "Ottawa": {
    "lat": 45.3557,
    "lng": -75.5745,
    "radius": 1.2183,
    "group": "Central"
  },
  "Peterborough (Trent)": {
    "lat": 44.3213,
    "lng": -78.4686,
    "radius": 0.3549,
    "group": "Central"
  },
  "Québec City": {
    "lat": 46.7472,
    "lng": -71.1195,
    "radius": 1.6176,
    "group": "Central"
  },
  "Sault Ste. Marie (Algoma)": {
    "lat": 46.5172,
    "lng": -84.2991,
    "radius": 0.15,
    "group": "Central"
  },
  "Sherbrooke": {
    "lat": 45.3914,
    "lng": -72.0562,
    "radius": 0.8761,
    "group": "Central"
  },
  "Shippagan (U de Moncton)": {
    "lat": 48.2917,
    "lng": -64.5928,
    "radius": 0.7259,
    "group": "Central"
  },
  "Sudbury (Laurentian)": {
    "lat": 46.4931,
    "lng": -80.9702,
    "radius": 0.15,
    "group": "Central"
  },
  "Thunder Bay (Lakehead)": {
    "lat": 48.4121,
    "lng": -89.2648,
    "radius": 0.15,
    "group": "Central"
  },
  "TMU": {
    "lat": 43.6598,
    "lng": -79.3884,
    "radius": 0.15,
    "group": "Central"
  },
  "Trois-Rivières": {
    "lat": 46.2238,
    "lng": -72.5799,
    "radius": 0.8542,
    "group": "Central"
  },
  "Université du Québec à Chicoutimi (UQAC)": {
    "lat": 48.4752,
    "lng": -71.4485,
    "radius": 1.315,
    "group": "Central"
  },
  "Université du Québec à Rimouski (UQAR)": {
    "lat": 49.0311,
    "lng": -67.8304,
    "radius": 2.4706,
    "group": "Central"
  },
  "Université du Québec en Abitibi-Témiscamingue (UQAT) – Rouyn-Noranda": {
    "lat": 48.3182,
    "lng": -79.7385,
    "radius": 1.913,
    "group": "Central"
  },
  "University of Guelph – Ridgetown Campus": {
    "lat": 42.7109,
    "lng": -82.1136,
    "radius": 0.4591,
    "group": "Central"
  },
  "Waterloo": {
    "lat": 43.4562,
    "lng": -80.4555,
    "radius": 0.3096,
    "group": "Central"
  },
  "Western (London)": {
    "lat": 43.0094,
    "lng": -81.2567,
    "radius": 0.15,
    "group": "Central"
  },
  "Windsor": {
    "lat": 42.2778,
    "lng": -83.0437,
    "radius": 0.15,
    "group": "Central"
  },
  "York Keele": {
    "lat": 43.7594,
    "lng": -79.4669,
    "radius": 0.1862,
    "group": "Central"
  },
  "Saint John (NBCC)": {
    "lat": 44.8627,
    "lng": -65.683,
    "radius": 0.9782,
    "group": "Central-East"
  },
  "Cambridge Bay (Kitikmeot Campus)": {
    "lat": 69.1169,
    "lng": -105.0597,
    "radius": 0.15,
    "group": "Central-East"
  },
  "Charlottetown (UPEI)": {
    "lat": 46.1445,
    "lng": -61.9291,
    "radius": 2.3875,
    "group": "Central-East"
  },
  "Brandon (Brandon U)": {
    "lat": 50.1742,
    "lng": -99.9636,
    "radius": 1.2607,
    "group": "Central-East"
  },
  "Edmundston (U de Moncton)": {
    "lat": 47.3723,
    "lng": -68.3135,
    "radius": 0.15,
    "group": "Central-East"
  },
  "Fort McMurray (Keyano)": {
    "lat": 56.2914,
    "lng": -109.9221,
    "radius": 1.9326,
    "group": "Central-East"
  },
  "Iqaluit (Nunatta Campus)": {
    "lat": 63.7512,
    "lng": -68.515,
    "radius": 0.15,
    "group": "Central-East"
  },
  "Kindersley (Great Plains College)": {
    "lat": 51.4695,
    "lng": -109.1569,
    "radius": 0.15,
    "group": "Central-East"
  },
  "Dalhousie University (Halifax)": {
    "lat": 44.6906,
    "lng": -63.6716,
    "radius": 1.0392,
    "group": "Central-East"
  },
  "Fredericton (UNB)": {
    "lat": 45.9466,
    "lng": -66.6461,
    "radius": 0.15,
    "group": "Central-East"
  },
  "La Ronge / Air Ronge (Northlands)": {
    "lat": 54.8237,
    "lng": -104.0583,
    "radius": 3.8951,
    "group": "Central-East"
  },
  "Lloydminster (Lakeland College)": {
    "lat": 53.6922,
    "lng": -109.2382,
    "radius": 1.1761,
    "group": "Central-East"
  },
  "Medicine Hat (MHC)": {
    "lat": 49.9636,
    "lng": -110.0836,
    "radius": 0.7869,
    "group": "Central-East"
  },
  "Regina (U of Regina)": {
    "lat": 50.4838,
    "lng": -104.3138,
    "radius": 2.5714,
    "group": "Central-East"
  },
  "Bathurst (CCNB)": {
    "lat": 47.0245,
    "lng": -65.466,
    "radius": 0.15,
    "group": "Central-East"
  },
  "Saskatoon (U of Saskatchewan)": {
    "lat": 52.1601,
    "lng": -106.5029,
    "radius": 1.9602,
    "group": "Central-East"
  },
  "North Battleford (NWRC)": {
    "lat": 52.4208,
    "lng": -108.1325,
    "radius": 0.5114,
    "group": "Central-East"
  },
  "Portage la Prairie (ACC Southport)": {
    "lat": 49.9149,
    "lng": -98.2791,
    "radius": 0.15,
    "group": "Central-East"
  },
  "Moncton (U de Moncton)": {
    "lat": 46.1067,
    "lng": -64.8051,
    "radius": 0.15,
    "group": "Central-East"
  },
  "Prince Albert (Sask Polytech)": {
    "lat": 53.157,
    "lng": -105.0227,
    "radius": 1.3395,
    "group": "Central-East"
  },
  "Sackville (Mount Allison)": {
    "lat": 45.8983,
    "lng": -64.3731,
    "radius": 0.15,
    "group": "Central-East"
  },
  "Rankin Inlet (Kivalliq Campus)": {
    "lat": 62.8084,
    "lng": -92.0853,
    "radius": 0.15,
    "group": "Central-East"
  },
  "St. John’s (MUN)": {
    "lat": 47.5777,
    "lng": -52.7194,
    "radius": 0.15,
    "group": "Central-East"
  },
  "Swift Current (Great Plains College)": {
    "lat": 50.0799,
    "lng": -107.177,
    "radius": 0.8482,
    "group": "Central-East"
  },
  "St. Andrews (NBCC)": {
    "lat": 45.0724,
    "lng": -67.045,
    "radius": 0.15,
    "group": "Central-East"
  },
  "Thompson (UCN)": {
    "lat": 55.7496,
    "lng": -97.8666,
    "radius": 0.15,
    "group": "Central-East"
  },
  "Winnipeg (UManitoba Fort Garry)": {
    "lat": 49.8677,
    "lng": -97.1693,
    "radius": 0.15,
    "group": "Central-East"
  },
  "Woodstock (NBCC)": {
    "lat": 46.2106,
    "lng": -67.5431,
    "radius": 0.15,
    "group": "Central-East"
  },
  "Burnaby (SFU)": {
    "lat": 49.2477,
    "lng": -122.9732,
    "radius": 0.15,
    "group": "West"
  },
  "Calgary (UCalgary)": {
    "lat": 51.0313,
    "lng": -114.0998,
    "radius": 0.15,
    "group": "West"
  },
  "Courtenay (NIC)": {
    "lat": 49.7104,
    "lng": -124.9716,
    "radius": 0.15,
    "group": "West"
  },
  "Cranbrook (College of Rockies)": {
    "lat": 49.4138,
    "lng": -116.696,
    "radius": 1.2504,
    "group": "West"
  },
  "Edmonton (U of A North)": {
    "lat": 53.6521,
    "lng": -113.385,
    "radius": 2.7774,
    "group": "West"
  },
  "Inuvik (Aurora College)": {
    "lat": 68.3592,
    "lng": -133.7182,
    "radius": 0.15,
    "group": "West"
  },
  "Grande Prairie (Northwestern Polytechnic)": {
    "lat": 55.4615,
    "lng": -119.5228,
    "radius": 0.9859,
    "group": "West"
  },
  "Kamloops (TRU)": {
    "lat": 50.5419,
    "lng": -120.1889,
    "radius": 1.1931,
    "group": "West"
  },
  "Kelowna (Okanagan College)": {
    "lat": 49.6222,
    "lng": -119.5035,
    "radius": 0.7646,
    "group": "West"
  },
  "Lethbridge (U of L)": {
    "lat": 49.6687,
    "lng": -112.8359,
    "radius": 0.15,
    "group": "West"
  },
  "Nanaimo (VIU)": {
    "lat": 49.1621,
    "lng": -123.9532,
    "radius": 0.15,
    "group": "West"
  },
  "Prince George (UNBC)": {
    "lat": 53.8985,
    "lng": -122.7994,
    "radius": 0.15,
    "group": "West"
  },
  "Red Deer (RDP)": {
    "lat": 52.1748,
    "lng": -113.886,
    "radius": 0.5699,
    "group": "West"
  },
  "Surrey/Langley (KPU)": {
    "lat": 49.132,
    "lng": -122.5009,
    "radius": 0.7105,
    "group": "West"
  },
  "Vancouver (UBC)": {
    "lat": 49.2668,
    "lng": -123.1201,
    "radius": 0.1696,
    "group": "West"
  },
  "Victoria (UVic)": {
    "lat": 48.4415,
    "lng": -123.3691,
    "radius": 0.15,
    "group": "West"
  },
  "Whitehorse (Yukon Univ.)": {
    "lat": 60.75,
    "lng": -135.0972,
    "radius": 0.15,
    "group": "West"
  },
  "Terrace (NWCC)": {
    "lat": 54.5276,
    "lng": -128.635,
    "radius": 0.15,
    "group": "West"
  }
}

// Region accent colors (matches the reach-status legend chrome, not the status dots).
export const GROUP_COLORS = { Central: "#1a73e8", "Central-East": "#0f9d58", West: "#8430ce" }

export const HUB_THRESHOLD_KM = 25

// Haversine distance in km between two [lat,lng] points.
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// Nearest hub to a campus coordinate: { name, distanceKm } or null.
export function nearestHub(lat, lng) {
  if (lat == null || lng == null) return null
  let best = null
  for (const [name, h] of Object.entries(HUBS)) {
    if (h.lat == null || h.lng == null) continue
    const d = haversineKm(lat, lng, h.lat, h.lng)
    if (!best || d < best.distanceKm) best = { name, distanceKm: d, group: h.group }
  }
  return best
}

// A campus "needs a coverage plan" when no hub is within 25km.
export function needsPlan(lat, lng) {
  const nh = nearestHub(lat, lng)
  return !nh || nh.distanceKm > HUB_THRESHOLD_KM
}
