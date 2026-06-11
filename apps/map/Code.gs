// ═══════════════════════════════════════════════════════════════════════════
//  BLW CAN MAP — Complete Apps Script (v4)
//  
//  PASTE THIS ENTIRE FILE into Apps Script (replaces everything).
//  Contains:
//    PART 1 — Your existing distance formulas (DIST_FROM_HUB, NEAREST_HUB, etc.)
//    PART 2 — BLW CAN Map backend (getAll, upsert, groups, ping)
//
//  SETUP:
//  1. Open your Google Sheet → Extensions → Apps Script
//  2. Select all existing code → delete → paste this file
//  3. Deploy → New Deployment → Web App
//     - Execute as: Me
//     - Who has access: Anyone
//  4. Copy the Web App URL
//  5. In blwcan_map_v4.html find CFG.SCRIPT_URL → paste the URL
//  6. Run testPing() from the editor to verify sheets are found
// ═══════════════════════════════════════════════════════════════════════════


// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  PART 1 — DISTANCE FORMULA FUNCTIONS (your existing code, unchanged)    ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/** Returns Haversine distance (km) from a named Hub (in 'Hubs' sheet) to a campus lat/lon.
 * Usage in Sheets:
 *   =DIST_FROM_HUB(HubName, CampusLat, CampusLon)
 *   =DIST_FROM_HUB(A2, F2, G2)
 * Supports ranges (arrayformulas) too.
 */
function DIST_FROM_HUB(hubName, lat, lon) {
  const hubs = _loadHubs_();
  const R = 6371;
  const toRad = x => x * Math.PI / 180;

  const compute = (hName, la, lo) => {
    if (!hName || la === "" || lo === "" || !hubs[hName]) return "";
    const {lat: hLat, lon: hLon} = hubs[hName];
    const φ1 = toRad(parseFloat(la)), λ1 = toRad(parseFloat(lo));
    const φ2 = toRad(hLat),          λ2 = toRad(hLon);
    const dφ = φ2 - φ1, dλ = λ2 - λ1;
    const a = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
    return +(R * 2 * Math.asin(Math.sqrt(a))).toFixed(3);
  };

  if (Array.isArray(hubName) || Array.isArray(lat) || Array.isArray(lon)) {
    const H  = Array.isArray(hubName) ? hubName : [[hubName]];
    const LA = Array.isArray(lat)     ? lat     : [[lat]];
    const LO = Array.isArray(lon)     ? lon     : [[lon]];
    const rows = Math.max(H.length, LA.length, LO.length);
    const cols = Math.max(H[0].length, LA[0].length, LO[0].length);
    return Array.from({length: rows}, (_, r) =>
      Array.from({length: cols}, (_, c) =>
        compute(H[r]?.[c] ?? H[0][0], LA[r]?.[c] ?? LA[0][0], LO[r]?.[c] ?? LO[0][0])
      )
    );
  }
  return compute(hubName, lat, lon);
}

/** Returns the nearest Hub Name for a campus lat/lon.
 * Usage:
 *   =NEAREST_HUB(Lat, Lon)
 *   =NEAREST_HUB(F2, G2, TRUE, E2)  // region-restricted
 */
function NEAREST_HUB(lat, lon, restrictByRegion, region) {
  const hubs  = _loadHubsList_();
  const R     = 6371;
  const toRad = x => x * Math.PI / 180;

  const nearest = (la, lo, restrict, reg) => {
    if (la === "" || lo === "") return "";
    const φ1 = toRad(parseFloat(la)), λ1 = toRad(parseFloat(lo));
    let best = {name: "", d: Infinity};
    for (const h of hubs) {
      if (restrict && reg && h.region && String(h.region) !== String(reg)) continue;
      const φ2 = toRad(h.lat), λ2 = toRad(h.lon);
      const dφ = φ2 - φ1, dλ = λ2 - λ1;
      const a  = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
      const d  = R * 2 * Math.asin(Math.sqrt(a));
      if (d < best.d) best = {name: h.name, d};
    }
    return best.name || "";
  };

  if (Array.isArray(lat) || Array.isArray(lon)) {
    const LA = Array.isArray(lat)    ? lat    : [[lat]];
    const LO = Array.isArray(lon)    ? lon    : [[lon]];
    const RG = Array.isArray(region) ? region : [[region]];
    const rows = Math.max(LA.length, LO.length, RG.length);
    const cols = Math.max(LA[0].length, LO[0].length, RG[0].length);
    return Array.from({length: rows}, (_, r) =>
      Array.from({length: cols}, (_, c) =>
        nearest(LA[r]?.[c] ?? "", LO[r]?.[c] ?? "", !!restrictByRegion, RG[r]?.[c] ?? "")
      )
    );
  }
  return nearest(lat, lon, !!restrictByRegion, region);
}

/** Returns distance (km) to the nearest hub for a campus lat/lon.
 * Usage:
 *   =DIST_TO_NEAREST_HUB(F2, G2)
 *   =DIST_TO_NEAREST_HUB(F2, G2, TRUE, E2)  // region-restricted
 */
function DIST_TO_NEAREST_HUB(lat, lon, restrictByRegion, region) {
  const hubs  = _loadHubsList_();
  const R     = 6371;
  const toRad = x => x * Math.PI / 180;

  const compute = (la, lo, restrict, reg) => {
    if (la === "" || lo === "") return "";
    const φ1 = toRad(parseFloat(la)), λ1 = toRad(parseFloat(lo));
    let best = {d: Infinity};
    for (const h of hubs) {
      if (restrict && reg && h.region && String(h.region) !== String(reg)) continue;
      const φ2 = toRad(h.lat), λ2 = toRad(h.lon);
      const dφ = φ2 - φ1, dλ = λ2 - λ1;
      const a  = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
      const d  = R * 2 * Math.asin(Math.sqrt(a));
      if (d < best.d) best = {d};
    }
    return isFinite(best.d) ? +best.d.toFixed(3) : "";
  };

  if (Array.isArray(lat) || Array.isArray(lon)) {
    const LA = Array.isArray(lat)    ? lat    : [[lat]];
    const LO = Array.isArray(lon)    ? lon    : [[lon]];
    const RG = Array.isArray(region) ? region : [[region]];
    const rows = Math.max(LA.length, LO.length, RG.length);
    const cols = Math.max(LA[0].length, LO[0].length, RG[0].length);
    return Array.from({length: rows}, (_, r) =>
      Array.from({length: cols}, (_, c) =>
        compute(LA[r]?.[c] ?? "", LO[r]?.[c] ?? "", !!restrictByRegion, RG[r]?.[c] ?? "")
      )
    );
  }
  return compute(lat, lon, !!restrictByRegion, region);
}

/** Loads hubs from 'Hubs' sheet — A: Hub Name, B: Lat, C: Lon, D: Region (optional) */
function _loadHubs_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Hubs');
  if (!sh) throw new Error("Hubs sheet not found.");
  const values = sh.getRange(2, 1, Math.max(sh.getLastRow()-1, 0), 4).getValues();
  const map = {};
  for (const [name, lat, lon] of values) {
    if (!name || lat === "" || lon === "") continue;
    map[String(name)] = {lat: parseFloat(lat), lon: parseFloat(lon)};
  }
  return map;
}

function _loadHubsList_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Hubs');
  if (!sh) throw new Error("Hubs sheet not found.");
  const values = sh.getRange(2, 1, Math.max(sh.getLastRow()-1, 0), 4).getValues();
  const out = [];
  for (const [name, lat, lon, region] of values) {
    if (!name || lat === "" || lon === "") continue;
    out.push({name: String(name), lat: parseFloat(lat), lon: parseFloat(lon), region: region ?? ""});
  }
  return out;
}


// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  PART 2 — BLW CAN MAP BACKEND                                           ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// ── Configuration ────────────────────────────────────────────────────────────

const SRC_SHEET     = 'Campuses';         // Your existing data tab — READ ONLY
const OVERLAY_SHEET = 'BLW_CAN_Campuses'; // Created automatically — app writes here
const LOG_SHEET     = 'BLW_CAN_ChangeLog'; // Status change audit log
const HUB_THRESHOLD = 25;                 // km — beyond this = Needs Coverage Plan

// Overlay sheet column headers (A → P)
const OV_HEADERS = [
  'Join Key',        // A — Institution | Campus (unique key)
  'Institution',     // B
  'Campus',          // C
  'Group',           // D
  'Sub-Group',       // E
  'Status',          // F — color-coded automatically
  'Contact Name',    // G
  'Contact Phone',   // H
  'Notes',           // I
  'Strategy',        // J
  'Prayer Points',   // K — JSON array e.g. ["Point 1","Point 2"]
  'Prayer Notes',    // L
  'Custom Photo URL',// M
  'Coverage Plan',   // N — for campuses with no hub within 25 km
  'Last Updated',    // O — auto timestamp
  'Updated By',      // P — group / subgroup that saved the record
];

// Source (Campuses) sheet column indices — 0-based, A=0
// Your confirmed layout: A=Group, C=Institution, D=Campus, E=Address,
// F=Lat, G=Lng, H=Hub, I=Distance, J=Cluster, K=Status, L=Sub-Group
const C = {
  group:       0,   // A
  institution: 2,   // C
  campus:      3,   // D
  address:     4,   // E
  lat:         5,   // F
  lng:         6,   // G
  hub:         7,   // H
  distance:    8,   // I
  cluster:     9,   // J
  status:      10,  // K
  subgroup:    11,  // L
};

// ── JSON response helper ─────────────────────────────────────────────────────
function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Router ───────────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || 'getAll';
    if (action === 'getAll')    return respond(getAllCampuses());
    if (action === 'getGroups') return respond(getGroups());
    if (action === 'getHubs')   return respond(getHubs());
    if (action === 'getPhoto')  return respond(getPhoto(e.parameter.name || '', e.parameter.campus || ''));
    if (action === 'ping')      return respond({ ok: true, ts: new Date().toISOString() });
    return respond({ error: 'Unknown GET action: ' + action });
  } catch(err) {
    return respond({ error: err.message, stack: err.stack });
  }
}

// ── GET PHOTO — fetches Wikipedia image server-side (no CORS issues) ────────
// Apps Script can call any external URL freely — no CORS restrictions.
// Returns the image URL for the map to display directly.
function getPhoto(institutionName, campusName) {
  if (!institutionName) return { url: null };
  try {
    var searchTerms = [];
    if (campusName && campusName.trim()) {
      searchTerms.push(institutionName + ' ' + campusName);
      var shortCampus = campusName.replace(/Campus/gi,'').trim();
      if (shortCampus) searchTerms.push(institutionName + ' ' + shortCampus);
    }
    searchTerms.push(institutionName);

    for (var i = 0; i < searchTerms.length; i++) {
      var term    = searchTerms[i].trim();
      var encoded = encodeURIComponent(term);
      Logger.log('Trying: ' + term);

      // Step 1: pageimages
      var url1 = 'https://en.wikipedia.org/w/api.php?action=query&titles='
        + encoded + '&prop=pageimages&format=json&pithumbsize=800&piprop=original%7Cthumbnail&redirects=1';
      Utilities.sleep(300); // be nice to Wikipedia
      var r1   = UrlFetchApp.fetch(url1, { muteHttpExceptions:true, headers:{'User-Agent':'BLWCanMap/1.0 (blwcan@outreach.ca)'} });
      var code1 = r1.getResponseCode();
      if (code1 === 429) { Logger.log('  rate limited, waiting 3s'); Utilities.sleep(3000); r1 = UrlFetchApp.fetch(url1, { muteHttpExceptions:true, headers:{'User-Agent':'BLWCanMap/1.0 (blwcan@outreach.ca)'} }); code1 = r1.getResponseCode(); }
      Logger.log('  pageimages HTTP: ' + code1);

      if (r1.getResponseCode() === 200) {
        var d1    = JSON.parse(r1.getContentText());
        var pp    = d1 && d1.query && d1.query.pages;
        var page  = pp ? Object.values(pp)[0] : null;
        Logger.log('  page: ' + (page ? 'id='+page.pageid+' missing='+(page.missing||'no') : 'null'));
        if (page && page.pageid > 0 && page.missing === undefined) {
          var img = (page.original && page.original.source) || (page.thumbnail && page.thumbnail.source);
          Logger.log('  img: ' + (img || 'none'));
          if (img && isGoodImage(img)) {
            var big = img.replace(/\/\d+px-/, '/800px-');
            Logger.log('  FOUND: ' + big.substring(0,80));
            return { url: big, title: page.title };
          }
        }
      }

      // Step 2: image list
      var url2 = 'https://en.wikipedia.org/w/api.php?action=query&titles='
        + encoded + '&prop=images&format=json&imlimit=30&redirects=1';
      Utilities.sleep(300);
      var r2   = UrlFetchApp.fetch(url2, { muteHttpExceptions:true, headers:{'User-Agent':'BLWCanMap/1.0 (blwcan@outreach.ca)'} });
      var code2 = r2.getResponseCode();
      if (code2 === 429) { Utilities.sleep(3000); r2 = UrlFetchApp.fetch(url2, { muteHttpExceptions:true, headers:{'User-Agent':'BLWCanMap/1.0 (blwcan@outreach.ca)'} }); code2 = r2.getResponseCode(); }
      if (code2 !== 200) { Logger.log('  list HTTP fail: '+code2); continue; }

      var d2    = JSON.parse(r2.getContentText());
      var pp2   = d2 && d2.query && d2.query.pages;
      var page2 = pp2 ? Object.values(pp2)[0] : null;
      var imgs  = page2 && page2.images;
      Logger.log('  images found: ' + (imgs ? imgs.length : 0));
      if (!imgs || !imgs.length) continue;

      var keywords = (institutionName+' '+(campusName||'')).toLowerCase().split(' ').filter(function(w){return w.length>3;});
      var scored = [];
      for (var j = 0; j < imgs.length; j++) {
        var t = (imgs[j].title||'').toLowerCase();
        if (!/\.(jpg|jpeg|png)/i.test(t)) continue;
        if (!isGoodImageTitle(t)) continue;
        var sc = 0;
        keywords.forEach(function(kw){if(t.indexOf(kw)>-1)sc+=10;});
        if (/campus|building|hall|aerial|exterior|entrance/i.test(t)) sc+=5;
        if (/portrait|person|player|coach|athlete/i.test(t)) sc-=20;
        scored.push({title:imgs[j].title, score:sc});
      }
      scored.sort(function(a,b){return b.score-a.score;});
      Logger.log('  top candidates: ' + scored.slice(0,3).map(function(x){return x.title+'('+x.score+')'}).join(', '));

      for (var k = 0; k < Math.min(5, scored.length); k++) {
        var it   = encodeURIComponent(scored[k].title);
        var iu   = 'https://en.wikipedia.org/w/api.php?action=query&titles='+it+'&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json';
        var r3   = UrlFetchApp.fetch(iu, { muteHttpExceptions:true, headers:{'User-Agent':'BLWCanMap/1.0'} });
        if (r3.getResponseCode() !== 200) continue;
        var d3   = JSON.parse(r3.getContentText());
        var pp3  = d3 && d3.query && d3.query.pages;
        var p3   = pp3 ? Object.values(pp3)[0] : null;
        var info = p3 && p3.imageinfo && p3.imageinfo[0];
        var src  = info && (info.thumburl || info.url);
        Logger.log('  candidate '+k+': ' + (src||'no url'));
        if (src && isGoodImage(src)) {
          Logger.log('  FOUND via list: ' + src.substring(0,80));
          return { url: src, title: page2.title };
        }
      }
    }
    Logger.log('No image found for: ' + institutionName);
    return { url: null };
  } catch(e) {
    Logger.log('ERROR: ' + e.message);
    return { url: null, error: e.message };
  }
}

function testGetPhoto() {
  ['Brock University','University of Toronto','McMaster University'].forEach(function(name){
    Logger.log('=== ' + name + ' ===');
    var r = getPhoto(name, '');
    Logger.log('RESULT: ' + (r.url||'null'));
  });
}

function isGoodImage(url) {
  if (!url) return false;
  if (/\.svg$/i.test(url)) return false;
  // Only filter actual logo/crest filenames — NOT the domain
  if (/[/_](logo|shield|flag|coat|emblem|badge|crest|seal|wordmark|arms)[_/.]/i.test(url)) return false;
  if (/commons-logo|question_book|edit-clear/i.test(url)) return false;
  return true;
}

function isGoodImageTitle(title) {
  if (/\.svg$/i.test(title)) return false;
  if (/logo|icon|shield|flag|coat|emblem|badge|crest|seal|wordmark|arms/i.test(title)) return false;
  if (/commons-logo|question_book|edit-clear|wikimedia/i.test(title)) return false;
  if (/portrait|headshot|profile|signature/i.test(title)) return false;
  return true;
}

// Test from editor
function testGetPhoto() {
  ['Brock University','University of Toronto','McMaster University',
   'University of Waterloo','York University','University of Calgary',
   'Simon Fraser University','Dalhousie University'].forEach(function(name){
    var r = getPhoto(name);
    Logger.log(name + ' → ' + (r.url ? r.url.substring(0,90) : 'null') + (r.error?' ERR:'+r.error:''));
  });
}

// Test from editor
function testGetPhoto() {
  ['Brock University','University of Toronto','McMaster University',
   'University of Waterloo','York University'].forEach(function(name){
    var r = getPhoto(name);
    Logger.log(name + ' → ' + (r.url ? r.url.substring(0,80) : 'null'));
  });
}


// Run this ONCE from the Apps Script editor, then redeploy as new version
function authorizeScript() {
  var r = UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  Logger.log('Auth OK — status: ' + r.getResponseCode() + ' — now redeploy as new version');
}

// ── GET HUBS — reads Hubs sheet (A: Name, B: Lat, C: Lng, D: Region) ────────
function getHubs() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const sh   = ss.getSheetByName('Hubs');
  if (!sh) throw new Error('Hubs sheet not found.');
  const rows = sh.getRange(2, 1, Math.max(sh.getLastRow()-1, 0), 4).getValues();
  const out  = [];
  rows.forEach(([name, lat, lng, region]) => {
    if (!name || lat === '' || lng === '') return;
    out.push({
      name:   String(name).trim(),
      lat:    parseFloat(lat),
      lng:    parseFloat(lng),
      group:  String(region || '').trim() || null,
    });
  });
  return out;
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'upsert') return respond(upsertRecord(body));
    return respond({ error: 'Unknown POST action' });
  } catch(err) {
    return respond({ error: err.message });
  }
}

// ── GET ALL CAMPUSES ─────────────────────────────────────────────────────────
// Reads Campuses (source of truth) and merges any edits from BLW_CAN_Campuses.
// The source sheet is NEVER written to.

function getAllCampuses() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const srcSh = ss.getSheetByName(SRC_SHEET);
  if (!srcSh) throw new Error('Sheet "' + SRC_SHEET + '" not found. Check the tab name.');

  const overlay = loadOverlayMap();
  const lastRow = srcSh.getLastRow();
  if (lastRow < 2) return [];

  const rows = srcSh.getRange(2, 1, lastRow - 1, 12).getValues();
  const out  = [];

  rows.forEach((row, i) => {
    const institution = String(row[C.institution] || '').trim();
    if (!institution) return; // skip blank rows

    const lat = parseFloat(row[C.lat]);
    const lng = parseFloat(row[C.lng]);
    if (isNaN(lat) || isNaN(lng)) return; // skip rows without coordinates

    const campus  = String(row[C.campus]   || '').trim();
    const joinKey = makeJoinKey(institution, campus);
    const edit    = overlay[joinKey] || {};

    // Hub coverage check — beyond 25 km or no hub = needs plan
    const dist     = parseFloat(row[C.distance]);
    const hasHub   = String(row[C.hub] || '').trim().length > 0;
    const needsPlan = !hasHub || isNaN(dist) || dist > HUB_THRESHOLD;

    out.push({
      id:            i,
      joinKey,
      group:         String(row[C.group]   || '').trim(),
      institution,
      campus,
      address:       String(row[C.address] || '').trim(),
      lat, lng,
      hub:           String(row[C.hub]     || '').trim(),
      distance:      String(row[C.distance]|| '').trim(),
      cluster:       String(row[C.cluster] || '').trim(),
      needs_plan:    needsPlan,

      // Overlay overrides source; source is the fallback
      status:        edit.status    || String(row[C.status]   || '').trim() || 'Not Reached',
      subgroup:      edit.subgroup  || String(row[C.subgroup] || '').trim() || '',

      // Overlay-only fields (not in Campuses sheet)
      contact_name:  edit.contact_name  || '',
      contact_phone: edit.contact_phone || '',
      notes:         edit.notes         || '',
      strategy:      edit.strategy      || '',
      prayer_points: edit.prayer_points || '[]',
      prayer_notes:  edit.prayer_notes  || '',
      custom_photo:  edit.custom_photo  || '',
      coverage_plan: edit.coverage_plan || '',
    });
  });

  return out;
}

// ── GET GROUPS ───────────────────────────────────────────────────────────────
// Returns distinct groups and sub-groups live from the Campuses sheet col L.
// Used to populate the onboarding dropdowns dynamically.

function getGroups() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const srcSh = ss.getSheetByName(SRC_SHEET);
  if (!srcSh) throw new Error('Sheet "' + SRC_SHEET + '" not found.');

  const lastRow = srcSh.getLastRow();
  if (lastRow < 2) return {};

  const rows   = srcSh.getRange(2, 1, lastRow - 1, 12).getValues();
  const groups = {};

  rows.forEach(row => {
    const g = String(row[C.group]    || '').trim();
    const s = String(row[C.subgroup] || '').trim();
    if (!g) return;
    if (!groups[g]) groups[g] = new Set();
    if (s) groups[g].add(s);
  });

  // Convert Sets → sorted arrays; add placeholder subs if col L not yet filled
  const result = {};
  Object.entries(groups).forEach(([g, subs]) => {
    result[g] = [...subs].sort();
    if (result[g].length === 0) result[g] = [g + ' Sub-A', g + ' Sub-B'];
  });
  return result;
}

// ── UPSERT RECORD ────────────────────────────────────────────────────────────
// Writes one campus record to BLW_CAN_Campuses overlay.
// NEVER touches the Campuses source sheet.

function upsertRecord(p) {
  const joinKey = p.joinKey || makeJoinKey(p.institution || '', p.campus || '');
  if (!joinKey) return { error: 'joinKey or institution is required' };

  const sheet = getOrCreateOverlay();
  const now   = Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'
  );
  const by = [p.group, p.subgroup].filter(Boolean).join(' / ') || 'unknown';

  const rowData = [
    joinKey,
    p.institution    || '',
    p.campus         || '',
    p.group          || '',
    p.subgroup       || '',
    p.status         || 'Not Reached',
    p.contact_name   || '',
    p.contact_phone  || '',
    p.notes          || '',
    p.strategy       || '',
    p.prayer_points  || '[]',
    p.prayer_notes   || '',
    p.custom_photo   || '',
    p.coverage_plan  || '',
    now,
    by,
  ];

  // Find existing row by join key (column A)
  const allData = sheet.getDataRange().getValues();
  let rowIdx    = -1;
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]).trim() === joinKey) { rowIdx = i + 1; break; }
  }

  if (rowIdx > 0) {
    sheet.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
    rowIdx = sheet.getLastRow();
  }

  // Alternating row background
  sheet.getRange(rowIdx, 1, 1, OV_HEADERS.length)
    .setBackground(rowIdx % 2 === 0 ? '#f8f9fa' : '#ffffff');

  // Color-code the status cell
  colorStatusCell(sheet, rowIdx, p.status);

  // Log status change if status was updated
  const prevStatus = (allData[rowIdx-1] && rowIdx > 1) ? String(allData[rowIdx-1][5]||'').trim() : '';
  const newStatus  = p.status || 'Not Reached';
  if (newStatus && newStatus !== prevStatus) {
    logStatusChange({
      institution:  p.institution || '',
      campus:       p.campus      || '',
      group:        p.group       || '',
      subgroup:     p.subgroup    || '',
      by,
      oldStatus:    prevStatus,
      newStatus,
      joinKey,
    });
  }

  return { success: true, joinKey, row: rowIdx, updatedBy: by };
}

// ── STATUS CHANGE LOG ────────────────────────────────────────────────────────
function logStatusChange(p) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let   sheet = ss.getSheetByName(LOG_SHEET);

    if (!sheet) {
      sheet = ss.insertSheet(LOG_SHEET);
      const hRow = sheet.getRange(1, 1, 1, LOG_HEADERS.length);
      hRow.setValues([['Timestamp','Institution','Campus','Group','Sub-Group',
                       'Changed By','Old Status','New Status','Join Key']]);
      hRow.setBackground('#0d1117').setFontColor('#fff')
          .setFontWeight('bold').setFontSize(11);
      sheet.setFrozenRows(1);
      sheet.setRowHeight(1, 36);
      [160,200,160,110,150,180,160,160,260]
        .forEach((w,i)=>sheet.setColumnWidth(i+1,w));

      // Color-code New Status column (H)
      const pal = {
        'Established Fellowship':{ bg:'#e6f4ea', fg:'#1e8e3e' },
        'Pioneering Fellowship': { bg:'#fef7e0', fg:'#b46a00' },
        'Influenced':            { bg:'#e8f0fe', fg:'#1a73e8' },
        'Not Reached':           { bg:'#fce8e6', fg:'#d93025' },
      };
      const rules = sheet.getConditionalFormatRules();
      const col   = sheet.getRange('H2:H10000');
      Object.entries(pal).forEach(([v,c])=>{
        rules.push(SpreadsheetApp.newConditionalFormatRule()
          .whenTextEqualTo(v).setBackground(c.bg).setFontColor(c.fg).setBold(true)
          .setRanges([col]).build());
      });
      sheet.setConditionalFormatRules(rules);
    }

    const now = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'
    );
    sheet.appendRow([
      now,
      p.institution,
      p.campus,
      p.group,
      p.subgroup,
      p.by,
      p.oldStatus  || '(new)',
      p.newStatus,
      p.joinKey,
    ]);

    // Alternate row shading
    const row = sheet.getLastRow();
    sheet.getRange(row, 1, 1, LOG_HEADERS.length)
      .setBackground(row % 2 === 0 ? '#f8f9fa' : '#ffffff');

  } catch(e) {
    Logger.log('Log error: ' + e.message);
    // Don't throw — logging failure should not break the save
  }
}

// ── OVERLAY SHEET — get or create ────────────────────────────────────────────
function getOrCreateOverlay() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(OVERLAY_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(OVERLAY_SHEET);

    // Write and style header row
    sheet.getRange(1, 1, 1, OV_HEADERS.length).setValues([OV_HEADERS]);
    const headerRow = sheet.getRange(1, 1, 1, OV_HEADERS.length);
    headerRow
      .setBackground('#0d1117')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setFontSize(11)
      .setVerticalAlignment('middle');
    sheet.setRowHeight(1, 36);
    sheet.setFrozenRows(1);

    // Column widths (A → P)
    [260, 200, 160, 110, 150, 160, 140, 140, 300, 300, 200, 200, 200, 300, 160, 180]
      .forEach((w, i) => sheet.setColumnWidth(i + 1, w));

    // Conditional formatting on Status column (F)
    addStatusFormatting(sheet);

    Logger.log('Created overlay sheet: ' + OVERLAY_SHEET);
  }

  return sheet;
}

// ── OVERLAY SHEET — load into memory map ─────────────────────────────────────
function loadOverlayMap() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(OVERLAY_SHEET);
  if (!sheet) return {};

  const data = sheet.getDataRange().getValues();
  const map  = {};

  data.slice(1).forEach(row => {
    const key = String(row[0] || '').trim();
    if (!key) return;
    map[key] = {
      status:        String(row[5]  || '').trim(),
      contact_name:  String(row[6]  || '').trim(),
      contact_phone: String(row[7]  || '').trim(),
      notes:         String(row[8]  || '').trim(),
      strategy:      String(row[9]  || '').trim(),
      prayer_points: String(row[10] || '[]').trim(),
      prayer_notes:  String(row[11] || '').trim(),
      custom_photo:  String(row[12] || '').trim(),
      coverage_plan: String(row[13] || '').trim(),
      subgroup:      String(row[4]  || '').trim(),
    };
  });

  return map;
}

// ── STATUS CELL FORMATTING ───────────────────────────────────────────────────
function addStatusFormatting(sheet) {
  const rules = sheet.getConditionalFormatRules();
  const col   = sheet.getRange('F2:F10000');
  const palette = {
    'Established Fellowship': { bg: '#e6f4ea', fg: '#1e8e3e' },
    'Pioneering Fellowship':  { bg: '#fef7e0', fg: '#b46a00' },
    'Influenced':             { bg: '#e8f0fe', fg: '#1a73e8' },
    'Not Reached':            { bg: '#fce8e6', fg: '#d93025' },
  };
  Object.entries(palette).forEach(([val, c]) => {
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(val)
        .setBackground(c.bg)
        .setFontColor(c.fg)
        .setBold(true)
        .setRanges([col])
        .build()
    );
  });
  sheet.setConditionalFormatRules(rules);
}

function colorStatusCell(sheet, row, status) {
  const palette = {
    'Established Fellowship': { bg: '#e6f4ea', fg: '#1e8e3e' },
    'Pioneering Fellowship':  { bg: '#fef7e0', fg: '#b46a00' },
    'Influenced':             { bg: '#e8f0fe', fg: '#1a73e8' },
    'Not Reached':            { bg: '#fce8e6', fg: '#d93025' },
  };
  const c = palette[status];
  if (!c) return;
  sheet.getRange(row, 6) // column F = Status
    .setBackground(c.bg)
    .setFontColor(c.fg)
    .setFontWeight('bold');
}

// ── UTILITY ──────────────────────────────────────────────────────────────────
function makeJoinKey(institution, campus) {
  const i = String(institution || '').trim();
  const c = String(campus      || '').trim();
  return c ? i + ' | ' + c : i;
}

// ── TEST FUNCTIONS (run these from the Apps Script editor to verify) ──────────

// Verify the script can see your sheets
function testPing() {
  const sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets().map(s => s.getName());
  Logger.log('✅ Script is running');
  Logger.log('Sheets found: ' + sheets.join(', '));
  const hasCampuses = sheets.includes(SRC_SHEET);
  const hasHubs     = sheets.includes('Hubs');
  Logger.log('Campuses sheet: ' + (hasCampuses ? '✅ found' : '❌ NOT FOUND — check tab name'));
  Logger.log('Hubs sheet: '     + (hasHubs     ? '✅ found' : '❌ NOT FOUND'));
}

// Check how many campuses are read and what the first one looks like
function testGetAll() {
  const data = getAllCampuses();
  Logger.log('Total campuses loaded: ' + data.length);
  Logger.log('Needs coverage plan: ' + data.filter(d => d.needs_plan).length);
  if (data.length > 0) Logger.log('First campus: ' + JSON.stringify(data[0], null, 2));
}

// Check groups and sub-groups from col L
function testGroups() {
  Logger.log(JSON.stringify(getGroups(), null, 2));
}

// Write a test record to the overlay sheet
function testUpsert() {
  const result = upsertRecord({
    joinKey:       'Brock University',
    institution:   'Brock University',
    campus:        '',
    group:         'Central',
    subgroup:      'Central Sub-A',
    status:        'Established Fellowship',
    contact_name:  'Test Contact',
    contact_phone: '+1 (555) 000-0000',
    notes:         'Test note written from Apps Script editor',
    strategy:      'Test strategy',
    prayer_points: '["Lord bless this campus","Send labourers into the harvest"]',
    prayer_notes:  'Standing in faith for this campus',
    coverage_plan: '',
  });
  Logger.log(JSON.stringify(result));
}

// ── BULK PHOTO AUDIT ─────────────────────────────────────────────────────────
// Run this from the editor to see which campuses have photos and which don't
// Results written to a new sheet: BLW_CAN_PhotoAudit
function auditPhotos() {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var campuses = getAllCampuses();

  // Create or clear audit sheet
  var auditSheet = ss.getSheetByName('BLW_CAN_PhotoAudit');
  if (!auditSheet) auditSheet = ss.insertSheet('BLW_CAN_PhotoAudit');
  else auditSheet.clearContents();

  // Headers
  var headers = ['Institution','Campus','Group','Has Photo','Photo URL','Notes'];
  auditSheet.getRange(1,1,1,headers.length).setValues([headers]);
  var hRow = auditSheet.getRange(1,1,1,headers.length);
  hRow.setBackground('#0d1117').setFontColor('#fff').setFontWeight('bold');
  auditSheet.setFrozenRows(1);

  var results = [];
  var found = 0, missing = 0;

  for (var i = 0; i < campuses.length; i++) {
    var c = campuses[i];
    // Skip duplicates — only check unique institution names
    if (i > 0 && campuses[i-1].institution === c.institution) continue;

    Logger.log('Checking ' + (i+1) + '/' + campuses.length + ': ' + c.institution);

    var result = getPhoto(c.institution);
    var hasPhoto = !!(result && result.url);
    if (hasPhoto) found++; else missing++;

    results.push([
      c.institution,
      c.campus || '',
      c.group  || '',
      hasPhoto ? 'YES' : 'NO',
      result.url || '',
      result.error || (hasPhoto ? 'OK' : 'No image found')
    ]);

    // Write in batches of 20 to avoid timeout
    if (results.length >= 20) {
      var startRow = auditSheet.getLastRow() + 1;
      auditSheet.getRange(startRow, 1, results.length, headers.length).setValues(results);
      results = [];
      Utilities.sleep(500); // be nice to Wikipedia API
    }
  }

  // Write remaining
  if (results.length > 0) {
    var startRow = auditSheet.getLastRow() + 1;
    auditSheet.getRange(startRow, 1, results.length, headers.length).setValues(results);
  }

  // Color code YES/NO column
  var lastRow = auditSheet.getLastRow();
  var rules = auditSheet.getConditionalFormatRules();
  var yesRange = auditSheet.getRange('D2:D' + lastRow);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('YES').setBackground('#e6f4ea').setFontColor('#1e8e3e').setBold(true)
    .setRanges([yesRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('NO').setBackground('#fce8e6').setFontColor('#d93025')
    .setRanges([yesRange]).build());
  auditSheet.setConditionalFormatRules(rules);

  // Auto-resize columns
  auditSheet.autoResizeColumns(1, headers.length);

  Logger.log('AUDIT COMPLETE — Found: ' + found + ', Missing: ' + missing);
  SpreadsheetApp.getUi().alert('Photo audit complete!\n\nFound: ' + found + '\nMissing: ' + missing + '\n\nSee BLW_CAN_PhotoAudit sheet.');
}
