/**
 * JMTI Job Hiring — Applicant Form (Apps Script Web App)
 * Files in this project: Code.js (this), Images.js (logo + truck photo as base64), Index.html (chat-style interview UI)
 * Sheet columns:
 * # | Position | Applicant Name | Age | Contact # | Called \ nag usap | Address |
 * License No. | License Pic. | Truck Driven | # Years of Experience | Status | Remarks | Email
 */

const SPREADSHEET_ID = 'PASTE_YOUR_GOOGLE_SHEET_ID';   // from the sheet URL: /spreadsheets/d/<THIS PART>/edit
const SHEET_GID = 0;              // tab from the link (gid=0)
const HEADER_ROW = 1;
const LICENSE_FOLDER_NAME = 'JMTI License Pics';
const HR_PHONE = '09666308079';
const HR_PHONE_DISPLAY = '0966 630 8079';
const COMPANY = 'J. Magtalas Trucking Inc.';
const BACKOFFICE_URL = '';   // optional: paste the Back Office web app link to include it in Viber alerts

const COL = {
  NO: 1, POSITION: 2, NAME: 3, AGE: 4, CONTACT: 5, CALLED: 6, ADDRESS: 7,
  LICENSE_NO: 8, LICENSE_PIC: 9, TRUCK: 10, YEARS: 11, STATUS: 12, REMARKS: 13, EMAIL: 14
};
const NUM_COLS = 14;

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('JMTI — We\'re Hiring')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // embeddable in Google Sites
}

function getSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheets().find(s => s.getSheetId() === SHEET_GID);
  if (!sh) throw new Error('Hindi makita ang Job Hiring tab (gid ' + SHEET_GID + ').');
  // Make sure the Email header exists
  const h = sh.getRange(HEADER_ROW, COL.EMAIL);
  if (!String(h.getValue()).trim()) h.setValue('Email');
  return sh;
}

/** Last row that actually has an applicant (ignores blank rows with FALSE checkboxes). */
function lastDataRow_(sh) {
  const last = sh.getLastRow();
  if (last <= HEADER_ROW) return HEADER_ROW;
  const vals = sh.getRange(HEADER_ROW + 1, COL.POSITION, last - HEADER_ROW, 4).getValues(); // Position..Contact
  for (let i = vals.length - 1; i >= 0; i--) {
    if (vals[i].some(v => String(v).trim() !== '')) return HEADER_ROW + 1 + i;
  }
  return HEADER_ROW;
}

function digits_(v) { return String(v || '').replace(/\D/g, ''); }
function last10_(v) { return digits_(v).slice(-10); }

function getLicenseFolder_() {
  const it = DriveApp.getFoldersByName(LICENSE_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(LICENSE_FOLDER_NAME);
}

function saveLicensePic_(file, name) {
  if (!file || !file.data) return '';
  const bytes = Utilities.base64Decode(file.data);
  const safe = (name || 'applicant').replace(/[^\w\s.-]/g, '').trim();
  const blob = Utilities.newBlob(bytes, file.mimeType, safe + ' - License-ID - ' + file.name);
  const f = getLicenseFolder_().createFile(blob);
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/uc?export=view&id=' + f.getId();
}

/** Called by the applicant form. */
function submitApplicant(form) {
  const name = String(form.name || '').trim();
  const contact = digits_(form.contact);
  const email = String(form.email || '').trim();
  if (!form.position) throw new Error('Pumili ng Position.');
  if (!name) throw new Error('Ilagay ang iyong pangalan.');
  if (contact.length < 10) throw new Error('Ilagay ang tamang contact number (hal. 09XXXXXXXXX).');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Mali ang email address.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let no, row, viberText = '';
  try {
    const sh = getSheet_();
    const lastRow = lastDataRow_(sh);
    row = lastRow + 1;

    // Next running number + duplicate check (server-side only, no data sent to the page)
    no = 1;
    const dupes = [];
    if (lastRow > HEADER_ROW) {
      const rows = sh.getRange(HEADER_ROW + 1, 1, lastRow - HEADER_ROW, NUM_COLS).getValues();
      rows.forEach(r => {
        const n = Number(r[COL.NO - 1]);
        if (!isNaN(n) && n >= no) no = n + 1;
        if (last10_(r[COL.CONTACT - 1]) === last10_(contact)) dupes.push('#' + r[COL.NO - 1]);
      });
    }

    const age = form.age ? Number(form.age) : '';
    let status = 'Pending';
    if (age && ((form.position === 'Helper' && age > 45) || (form.position === 'Driver' && age >= 60))) {
      status = 'Not Qualified';
    }

    const stamp = Utilities.formatDate(new Date(), 'Asia/Manila', 'MMMM d, yyyy h:mma');
    let remarks = 'Nag-apply online ' + stamp;
    if (dupes.length) remarks += ' / Duplicate ng ' + dupes.join(', ');

    const licensePic = form.licenseFile ? saveLicensePic_(form.licenseFile, name) : '';

    // Viber alert text (posted after the row is saved)
    const addressStr = [form.barangay ? 'Brgy. ' + form.barangay : '', form.city, form.province].filter(Boolean).join(', ');
    viberText = [
      '🆕 BAGONG APPLICANT #' + no + (status === 'Not Qualified' ? '  ⛔ Not Qualified (edad)' : ''),
      '👤 ' + name + ' · ' + form.position + (age ? ' · ' + age + ' y/o' : ''),
      '📞 ' + contact + (email ? '   ✉️ ' + email : ''),
      addressStr ? '📍 ' + addressStr : '',
      form.position === 'Driver' ? '🚚 ' + [form.years ? form.years + ' yrs' : '', (form.truck || []).join(', '), form.licenseNo ? 'Lic. ' + form.licenseNo : ''].filter(Boolean).join(' · ') : '',
      licensePic ? '🪪 ID: ' + licensePic : '🪪 ID: walang in-upload',
      dupes.length ? '⚠️ Duplicate ng ' + dupes.join(', ') : '',
      '🕒 ' + stamp,
      BACKOFFICE_URL ? '➡️ Back Office: ' + BACKOFFICE_URL : ''
    ].filter(Boolean).join('\n');

    const values = [[
      no,
      form.position,
      name,
      age,
      contact,
      false,
      [form.barangay ? 'Brgy. ' + form.barangay : '', form.city, form.province].filter(Boolean).join(', '),
      String(form.licenseNo || '').trim(),
      licensePic,
      (form.truck || []).join(', '),
      form.years ? form.years + 'yrs' : '',
      status,
      remarks,
      email
    ]];

    sh.getRange(row, COL.CONTACT).setNumberFormat('@'); // keep leading 0
    sh.getRange(row, 1, 1, NUM_COLS).setValues(values);
    sh.getRange(row, COL.CALLED).insertCheckboxes();
  } finally {
    lock.releaseLock();
  }

  let emailed = false;
  if (email) {
    try { sendConfirmation_(email, name, form.position, no); emailed = true; } catch (e) { console.error(e); }
  }
  if (viberText) viberPost_(viberText);   // Viber channel alert (never blocks the applicant)
  return { ok: true, no: no, name: name, emailed: emailed };
}

/** Confirmation email to the applicant, with a Call button. */
function sendConfirmation_(email, name, position, no) {
  const logo = Utilities.newBlob(Utilities.base64Decode(LOGO_B64), 'image/jpeg', 'jmti-logo.jpg');
  const html =
    '<div style="background:#f3f5f9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">' +
    '<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden">' +
      '<div style="text-align:center;padding:22px 20px 8px"><img src="cid:logo" alt="JMTI" width="180" style="width:180px;max-width:60%"></div>' +
      '<div style="padding:8px 28px 28px;color:#1b2333;font-size:15px;line-height:1.6">' +
        '<h2 style="color:#0f3d7a;margin:6px 0 12px;font-size:20px">Salamat sa iyong application!</h2>' +
        '<p>Hi <b>' + esc_(name) + '</b>,</p>' +
        '<p>Natanggap na namin ang iyong application bilang <b>' + esc_(position) + '</b> sa ' + COMPANY + '. ' +
        'Application No. <b>#' + no + '</b>.</p>' +
        '<p>Tatawagan o ite-text ka ng aming HR para sa susunod na hakbang. Kung may tanong ka, tumawag lang sa amin:</p>' +
        '<div style="text-align:center;margin:24px 0">' +
          '<a href="tel:' + HR_PHONE + '" style="display:inline-block;background:#0f3d7a;color:#ffffff;text-decoration:none;' +
          'font-weight:bold;font-size:16px;padding:14px 28px;border-radius:10px">&#128222; Tumawag: ' + HR_PHONE_DISPLAY + '</a>' +
        '</div>' +
        '<p style="color:#6b7487;font-size:13px">Ihanda na ang iyong mga requirements (lisensya, NBI/police clearance, at iba pa) bago pumunta sa office.</p>' +
        '<p style="margin-top:20px">— JMTI HR</p>' +
      '</div>' +
    '</div></div>';

  MailApp.sendEmail({
    to: email,
    subject: 'JMTI Application Received — #' + no,
    htmlBody: html,
    body: 'Salamat sa iyong application bilang ' + position + ' sa ' + COMPANY + ' (Application #' + no + '). ' +
          'Tatawagan ka ng aming HR. Para sa tanong, tumawag sa ' + HR_PHONE_DISPLAY + '.',
    name: 'JMTI HR',
    inlineImages: { logo: logo }
  });
}

function esc_(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ---------- Philippine address (PSGC) ---------- */
const PSGC_API = 'https://psgc.gitlab.io/api';
const NCR_CODE = 'NCR';

function psgc_(path) {
  const cache = CacheService.getScriptCache();
  const key = 'psgc:' + path;
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const res = UrlFetchApp.fetch(PSGC_API + path, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Hindi ma-load ang address list. Subukan ulit.');
  const list = JSON.parse(res.getContentText())
    .map(x => ({ code: x.code, name: x.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  try { cache.put(key, JSON.stringify(list), 21600); } catch (e) {}
  return list;
}

function getProvinces() {
  const list = psgc_('/provinces/');
  list.unshift({ code: NCR_CODE, name: 'Metro Manila (NCR)' });
  return list;
}

function getCities(provinceCode) {
  return provinceCode === NCR_CODE
    ? psgc_('/regions/130000000/cities-municipalities/')
    : psgc_('/provinces/' + provinceCode + '/cities-municipalities/');
}

function getBarangays(cityCode) {
  return psgc_('/cities-municipalities/' + cityCode + '/barangays/');
}


/* =====================================================================
 *  VIBER CHANNEL UPDATES
 *  Token = the "Post API" authentication token of your Viber Channel
 *  (Viber app → your channel → channel info → Developer tools → Post API).
 *  FIRST TIME: in the Apps Script editor pick the function "viberSetup" and
 *  press ▶ Run. It authorizes the script, finds the channel superadmin,
 *  registers the webhook Viber requires, and posts a test message.
 * ===================================================================== */
const VIBER_ENABLED = true;
const VIBER_AUTH_TOKEN = 'PASTE_YOUR_VIBER_POST_API_TOKEN';   // Viber channel → Developer tools → Post API
const VIBER_API = 'https://chatapi.viber.com/pa/';
// Viber refuses to post until a "webhook" URL is registered (error 10 webhookNotSet), even if we never use it.
// We try this script's own web-app link first; leave blank to auto-detect, or paste your deployed …/exec link here.
const VIBER_WEBHOOK_URL = '';
// If Viber won't accept the Apps Script link, one of these public always-OK URLs is registered instead.
const VIBER_FALLBACK_WEBHOOKS = ['https://postman-echo.com/post', 'https://httpbin.org/post', 'https://httpstat.us/200'];

/** Viber calls the webhook URL here; we subscribe to no events and simply answer OK. */
function doPost(e) {
  return ContentService.createTextOutput(JSON.stringify({ status: 0, status_message: 'ok' })).setMimeType(ContentService.MimeType.JSON);
}

function viberApi_(path, payload) {
  const res = UrlFetchApp.fetch(VIBER_API + path, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Viber-Auth-Token': VIBER_AUTH_TOKEN },
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true
  });
  const txt = res.getContentText();
  let data; try { data = JSON.parse(txt); } catch (e) { throw new Error('Viber ' + path + ': HTTP ' + res.getResponseCode() + ' ' + txt); }
  if (data.status !== 0) throw new Error('Viber ' + path + ': ' + data.status + ' ' + (data.status_message || txt));
  return data;
}

/** Finds the channel superadmin (the "from" id required by the Post API) and remembers it. */
function viberResolveFrom_() {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty('VIBER_FROM');
  if (saved) return saved;
  const info = viberApi_('get_account_info', {});
  const members = info.members || [];
  const admin = members.find(m => m.role === 'superadmin') || members.find(m => m.role === 'admin') || members[0];
  if (!admin) throw new Error('Walang superadmin/admin na nakita sa channel members.');
  props.setProperty('VIBER_FROM', admin.id);
  props.setProperty('VIBER_CHANNEL', info.name || '');
  return admin.id;
}

/** Registers a webhook (required once per token). Tries the script's own link, then the fallbacks. */
function viberEnsureWebhook_(force) {
  const props = PropertiesService.getScriptProperties();
  if (!force && props.getProperty('VIBER_WEBHOOK_OK') === '1') return props.getProperty('VIBER_WEBHOOK_SET');
  let own = '';
  try { own = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  if (!/\/exec$/.test(own)) own = '';                       // a /dev link needs a Google login, Viber can't verify it
  const list = [VIBER_WEBHOOK_URL, own].concat(VIBER_FALLBACK_WEBHOOKS).filter(function (u, i, a) { return u && a.indexOf(u) === i; });
  let lastErr = null;
  for (let i = 0; i < list.length; i++) {
    try {
      viberApi_('set_webhook', { url: list[i], event_types: [], send_name: false, send_photo: false });
      props.setProperty('VIBER_WEBHOOK_OK', '1');
      props.setProperty('VIBER_WEBHOOK_SET', list[i]);
      Logger.log('Viber webhook registered: ' + list[i]);
      return list[i];
    } catch (e) {
      lastErr = e;
      Logger.log('Webhook not accepted (' + list[i] + '): ' + e.message);
    }
  }
  throw new Error('Hindi ma-register ang Viber webhook. ' + (lastErr ? lastErr.message : ''));
}

/** Posts a text message to the channel. Never throws (a Viber problem must not break the app). */
function viberPost_(text) {
  if (!VIBER_ENABLED || !VIBER_AUTH_TOKEN) return false;
  const body = { auth_token: VIBER_AUTH_TOKEN, from: '', type: 'text', text: String(text || '').slice(0, 7000) };
  try {
    body.from = viberResolveFrom_();
    try {
      viberApi_('post', body);
    } catch (e) {
      if (!/webhookNotSet|: 10 /.test(e.message)) throw e;   // only self-heal the webhook case
      viberEnsureWebhook_(true);
      viberApi_('post', body);
    }
    return true;
  } catch (e) {
    console.error('Viber post failed: ' + e.message);
    return false;
  }
}

/** RUN THIS ONCE from the editor (▶ Run). Check the Execution log for the result. */
function viberSetup() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('VIBER_FROM'); props.deleteProperty('VIBER_WEBHOOK_OK');
  const info = viberApi_('get_account_info', {});
  Logger.log('Channel: ' + info.name + ' | members: ' + (info.members || []).map(function (m) { return m.role + ' ' + m.name; }).join(', '));
  const from = viberResolveFrom_();
  Logger.log('Saved VIBER_FROM = ' + from);
  const hook = viberEnsureWebhook_(true);
  Logger.log('Webhook in use: ' + hook);
  viberApi_('post', { auth_token: VIBER_AUTH_TOKEN, from: from, type: 'text',
    text: '✅ Connected: ' + COMPANY + ' Hiring Desk ay magpo-post na ng updates dito.' });
  Logger.log('Test post sent — tingnan ang channel.');
}

/** Optional: run to send any test message. */
function viberTest() { viberPost_('🔔 Test message mula sa ' + COMPANY + ' Hiring Desk (' + new Date() + ')'); }

