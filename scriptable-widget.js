// Parcel Pickup — Scriptable widget
//
// A small (square) iOS home-screen widget that shows how many packages are
// waiting for pickup and renders the CODE128 barcode for the most recent
// pending parcel code. Tapping the widget opens the full web app.
//
// Setup:
//   1. Install "Scriptable" from the App Store.
//   2. Create a new script and paste this file's contents into it.
//      Name it something like "Parcel Pickup".
//   3. Long-press the home screen → add a Scriptable widget (Small size).
//   4. Long-press the widget → Edit Widget → Script: Parcel Pickup.
//
// The widget reads the same Firebase Realtime Database the web app uses,
// so it stays in sync automatically. Data is cached locally so the widget
// still shows the last known state when offline.

const DB_URL  = "https://parcelpending-e22a5-default-rtdb.firebaseio.com/parcels.json";
const APP_URL = "https://erikhardin.github.io/parcelpending/";

// Match the web app: JsBarcode encodes the code plus a trailing newline
// (the kiosk scanner treats it as an Enter keypress).
const APPEND_NEWLINE = true;

// ─── Data ─────────────────────────────────────────────────────────────────────

async function fetchParcels() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.cacheDirectory(), "parcelpending-widget.json");
  try {
    const data = await new Request(DB_URL).loadJSON();
    fm.writeString(cachePath, JSON.stringify(data || {}));
    return data || {};
  } catch (e) {
    if (fm.fileExists(cachePath)) {
      try { return JSON.parse(fm.readString(cachePath)); } catch (_) {}
    }
    return {};
  }
}

// ─── CODE128 encoding ─────────────────────────────────────────────────────────

// Bar/space module widths for values 0–105, plus the stop pattern (106).
const CODE128_WIDTHS = [
  "212222","222122","222221","121223","121322","131222","122213","122312",
  "132212","221213","221312","231212","112232","122132","122231","113222",
  "123122","123221","223211","221132","221231","213212","223112","312131",
  "311222","321122","321221","312212","322112","322211","212123","212321",
  "232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121",
  "313121","211331","231131","213113","213311","213131","311123","311321",
  "331121","312113","312311","332111","314111","221411","431111","111224",
  "111422","121124","121421","141122","141221","112214","112412","122114",
  "122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112",
  "421211","212141","214121","412121","111143","111341","131141","114113",
  "114311","411113","411311","113141","114131","311141","411131","211412",
  "211214","211232","2331112"
];

function code128CharValue(ch, mode) {
  const c = ch.charCodeAt(0);
  if (mode === "A") return c < 32 ? c + 64 : c - 32;
  return c - 32; // mode B
}

function code128Values(text) {
  const digitRun = (i) => {
    let n = 0;
    while (i + n < text.length && text[i + n] >= "0" && text[i + n] <= "9") n++;
    return n;
  };

  const values = [];
  let mode, i = 0;
  if (digitRun(0) >= 2) { mode = "C"; values.push(105); }
  else                  { mode = "B"; values.push(104); }

  while (i < text.length) {
    const run = digitRun(i);
    if (mode === "C") {
      if (run >= 2) { values.push(parseInt(text.substr(i, 2), 10)); i += 2; continue; }
      mode = text.charCodeAt(i) < 32 ? "A" : "B";
      values.push(mode === "A" ? 101 : 100);
      continue;
    }
    if (run >= 4) {
      if (run % 2 === 1) { values.push(code128CharValue(text[i], mode)); i++; }
      mode = "C"; values.push(99);
      continue;
    }
    const c = text.charCodeAt(i);
    if (mode === "B" && c < 32) { mode = "A"; values.push(101); continue; }
    if (mode === "A" && c > 95) { mode = "B"; values.push(100); continue; }
    values.push(code128CharValue(text[i], mode));
    i++;
  }

  let sum = values[0];
  for (let k = 1; k < values.length; k++) sum += values[k] * k;
  values.push(sum % 103);
  values.push(106);
  return values;
}

function drawBarcode(text, widthPt, heightPt) {
  const values = code128Values(text);
  let modules = 0;
  for (const v of values) {
    for (const d of CODE128_WIDTHS[v]) modules += +d;
  }
  const quiet = 8; // quiet zone (modules) on each side
  const totalModules = modules + quiet * 2;

  const ctx = new DrawContext();
  ctx.size = new Size(widthPt, heightPt);
  ctx.opaque = true;
  ctx.respectScreenScale = true;
  ctx.setFillColor(Color.white());
  ctx.fillRect(new Rect(0, 0, widthPt, heightPt));

  const mw = widthPt / totalModules;
  const pad = 4;
  let x = quiet * mw;
  ctx.setFillColor(Color.black());
  for (const v of values) {
    const pattern = CODE128_WIDTHS[v];
    for (let j = 0; j < pattern.length; j++) {
      const w = +pattern[j] * mw;
      if (j % 2 === 0) ctx.fillRect(new Rect(x, pad, w, heightPt - pad * 2));
      x += w;
    }
  }
  return ctx.getImage();
}

// ─── Widget ───────────────────────────────────────────────────────────────────

async function buildWidget() {
  const parcels = await fetchParcels();
  const pending = Object.values(parcels).filter((p) => p && !p.done);
  pending.sort((a, b) => String(b.addedAt || "").localeCompare(String(a.addedAt || "")));
  const totalPkgs = pending.reduce((s, p) => s + (p.count || 1), 0);

  const w = new ListWidget();
  w.url = APP_URL;
  w.backgroundColor = new Color("#1a1714");
  w.setPadding(12, 12, 12, 12);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  const accent = new Color("#d94f1e");
  const muted  = new Color("#8a8480");

  const title = w.addText("PARCEL PICKUP");
  title.font = Font.semiboldMonospacedSystemFont(9);
  title.textColor = muted;

  w.addSpacer(2);

  if (pending.length === 0) {
    w.addSpacer();
    const em = w.addText("🎉");
    em.font = Font.systemFont(28);
    em.centerAlignText();
    w.addSpacer(4);
    const msg = w.addText("All picked up");
    msg.font = Font.boldSystemFont(14);
    msg.textColor = Color.white();
    msg.centerAlignText();
    w.addSpacer();
    return w;
  }

  const count = w.addText(
    totalPkgs + " package" + (totalPkgs !== 1 ? "s" : "") + " waiting"
  );
  count.font = Font.boldSystemFont(15);
  count.textColor = accent;
  count.minimumScaleFactor = 0.7;
  count.lineLimit = 1;

  w.addSpacer();

  const code = String(pending[0].code || "");
  const barcodeText = APPEND_NEWLINE ? code + "\n" : code;
  const img = w.addImage(drawBarcode(barcodeText, 260, 76));
  img.centerAlignImage();
  img.containerRelativeShape = false;
  img.cornerRadius = 4;

  w.addSpacer(5);

  const label = w.addText(
    "#" + code + (pending.length > 1 ? "  +" + (pending.length - 1) + " more" : "")
  );
  label.font = Font.regularMonospacedSystemFont(9);
  label.textColor = muted;
  label.centerAlignText();
  label.lineLimit = 1;
  label.minimumScaleFactor = 0.6;

  return w;
}

const widget = await buildWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentSmall();
}
Script.complete();
