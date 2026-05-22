// ============================================================
// gmail-automation.gs
// Google Apps Script — Gmail → Firebase Realtime Database
// ============================================================
//
// SETUP (one-time)
// ----------------
// 1. Go to https://script.google.com → New project
//    Name it "ParcelPendingSync"
//
// 2. Replace the contents of Code.gs with this entire file.
//
// 3. Store your Firebase database secret:
//    a. In the Apps Script editor, click ⚙️ (Project Settings)
//    b. Scroll to "Script Properties" → "Edit script properties"
//    c. Add property:
//         Name:  FIREBASE_SECRET
//         Value: (your secret from Firebase Console →
//                 Project Settings → Service Accounts →
//                 Database secrets → Show)
//    d. Click "Save"
//
// 4. Run once to grant Gmail permission:
//    a. Select "processParcelEmails" in the function dropdown
//    b. Click ▶ Run → "Review permissions" → Allow
//
// 5. Set up the 5-minute trigger:
//    a. Click ⏰ (Triggers) on the left → "Add Trigger"
//    b. Function: processParcelEmails
//       Event source: Time-driven → Minutes timer → Every 5 minutes
//    c. Save (may prompt for permissions again → Allow)
//
// New parcel emails will now appear in the app within 5 minutes.
// ============================================================

var FIREBASE_DB_URL = 'https://parcelpending-e22a5-default-rtdb.firebaseio.com';
var GMAIL_SEARCH    = 'from:no-reply@parcelpending.com is:unread';
var LABEL_NAME      = 'parcel-processed';

// ── Entry point (called by trigger) ──────────────────────────
function processParcelEmails() {
  var secret = PropertiesService.getScriptProperties()
                                .getProperty('FIREBASE_SECRET');
  if (!secret) {
    Logger.log('ERROR: FIREBASE_SECRET script property not set. See setup instructions at top of file.');
    return;
  }

  var label   = getOrCreateLabel(LABEL_NAME);
  var threads = GmailApp.search(GMAIL_SEARCH);

  if (threads.length === 0) {
    Logger.log('No unread parcel emails found.');
    return;
  }

  Logger.log('Found ' + threads.length + ' thread(s) to process.');

  threads.forEach(function(thread) {
    thread.getMessages().forEach(function(message) {
      if (!message.isUnread()) return;
      try {
        processMessage(message, secret, label);
      } catch (err) {
        Logger.log('ERROR processing "' + message.getSubject() + '": ' + err.message);
      }
    });
  });
}

// ── Process a single email ────────────────────────────────────
function processMessage(message, secret, label) {
  var body = message.getPlainBody();

  var codeMatch = body.match(/\b(\d{8})\b/);
  if (!codeMatch) {
    Logger.log('No 8-digit code found — skipping: ' + message.getSubject());
    markProcessed(message, label);
    return;
  }
  var code = codeMatch[1];
  var key  = safeKey(code);

  var carrier   = extractCarrier(body);
  var dateLabel = computeDateLabel(message.getDate());

  if (firebaseKeyExists(key, secret)) {
    Logger.log('Code ' + code + ' already exists — skipping.');
    markProcessed(message, label);
    return;
  }

  firebasePut(key, {
    code:      code,
    carriers:  carrier ? [carrier] : [],
    count:     1,
    dateLabel: dateLabel,
    done:      false,
    addedAt:   new Date().toISOString()
  }, secret);

  Logger.log('Added code ' + code + ' | carrier: ' + (carrier || 'none') + ' | ' + dateLabel);
  markProcessed(message, label);
}

// ── Extract carrier after "DELIVERED BY:" ────────────────────
function extractCarrier(body) {
  // Handles same-line: "DELIVERED BY: Amazon Master"
  // and next-line:     "DELIVERED BY:\nAmazon Master"
  var match = body.match(/DELIVERED\s+BY:\s*\r?\n?\s*(.+)/i);
  if (!match) return null;
  var raw = match[1].replace(/[.,;:]+$/, '').trim();
  return raw.length > 0 ? raw : null;
}

// ── Compute dateLabel from email received date ────────────────
function computeDateLabel(emailDate) {
  var now   = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var sent  = new Date(emailDate.getFullYear(), emailDate.getMonth(), emailDate.getDate());
  var diff  = Math.round((today - sent) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return diff + ' days ago';
}

// ── Firebase: check if key exists ────────────────────────────
function firebaseKeyExists(key, secret) {
  var url = FIREBASE_DB_URL + '/parcels/' + key + '.json?auth=' +
            encodeURIComponent(secret);
  var res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('Firebase GET failed: HTTP ' + res.getResponseCode() + ' — ' + res.getContentText());
  }
  return res.getContentText().trim() !== 'null';
}

// ── Firebase: write record ────────────────────────────────────
function firebasePut(key, record, secret) {
  var url = FIREBASE_DB_URL + '/parcels/' + key + '.json?auth=' +
            encodeURIComponent(secret);
  var res = UrlFetchApp.fetch(url, {
    method:             'put',
    contentType:        'application/json',
    payload:            JSON.stringify(record),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Firebase PUT failed: HTTP ' + res.getResponseCode() + ' — ' + res.getContentText());
  }
}

// ── Mark email as read and labelled ──────────────────────────
function markProcessed(message, label) {
  message.markRead();
  message.getThread().addLabel(label);
}

// ── Get or create Gmail label ─────────────────────────────────
function getOrCreateLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

// ── safeKey: mirrors index.html implementation ───────────────
function safeKey(code) {
  return String(code).replace(/[.#$\/\[\]]/g, '_');
}
