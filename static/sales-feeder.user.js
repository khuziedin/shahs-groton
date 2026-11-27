// ==UserScript==
// @name         Shah's Halal — Live Sales Feeder
// @namespace    shahs-groton
// @version      0.1
// @description  Reads the open POS / DoorDash / Uber Eats / Grubhub dashboards and sends today's totals to the shop tablet.
// @match        https://*.mypospointe.com/*
// @match        https://*.doordash.com/*
// @match        https://*.ubereats.com/*
// @match        https://*.grubhub.com/*
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// ==/UserScript==

/* ============================  SET THESE TWO  ============================ */
const TABLET = "http://10.1.10.119:8080";   // the shop tablet's address on the shop Wi-Fi
const TOKEN  = "PASTE_SALES_TOKEN_HERE";     // Owner dashboard: get it from Console -> Live sales
/* ======================================================================== */

const EVERY_SECONDS = 60;

// Pull every "$1,234.56"-style amount out of a bit of text, largest first.
function moneyIn(text) {
  const out = [];
  (String(text).match(/\$\s?[\d,]+(?:\.\d{2})?/g) || []).forEach(m => {
    const n = parseFloat(m.replace(/[^0-9.]/g, ""));
    if (!isNaN(n)) out.push(n);
  });
  return out.sort((a, b) => b - a);
}
// Find the dollar amount sitting closest after a label on the page.
function amountNear(labels) {
  const els = document.querySelectorAll("*");
  for (const lab of labels) {
    for (const el of els) {
      const t = (el.textContent || "").trim();
      if (t.length < 60 && t.toLowerCase().includes(lab.toLowerCase())) {
        const near = (el.parentElement ? el.parentElement.textContent : t);
        const m = moneyIn(near);
        if (m.length) return m[0];
      }
    }
  }
  return null;
}

// Each site returns {source, gross, net, orders}. These selectors are a starting
// point tuned by heuristic — once the real dashboards are seen they get pinned to
// the exact elements so the numbers are always right.
function scrape() {
  const host = location.hostname;
  if (host.includes("mypospointe")) {
    return { source: "pos",
             gross: amountNear(["gross sales", "total sales", "net sales", "sales"]),
             net:   amountNear(["net sales", "total sales"]),
             orders: null };
  }
  if (host.includes("doordash")) {
    return { source: "doordash",
             gross: amountNear(["gross sales", "sales", "total"]),
             net:   amountNear(["net", "payout"]),
             orders: null };
  }
  if (host.includes("ubereats")) {
    return { source: "ubereats",
             gross: amountNear(["gross", "sales", "total"]),
             net:   amountNear(["net payout", "payout", "net"]),
             orders: null };
  }
  if (host.includes("grubhub")) {
    return { source: "grubhub",
             gross: amountNear(["gross", "sales", "subtotal", "total"]),
             net:   amountNear(["net", "payout"]),
             orders: null };
  }
  return null;
}

function send(d) {
  if (!d || (d.gross == null && d.net == null)) return;
  GM_xmlhttpRequest({
    method: "POST",
    url: TABLET + "/api/sales/ingest",
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify({ token: TOKEN, source: d.source, gross: d.gross, net: d.net, orders: d.orders }),
    onload:  r => console.log("[Shah's feeder]", d.source, "->", r.status),
    onerror: e => console.log("[Shah's feeder] error", e)
  });
}

function tick() { try { send(scrape()); } catch (e) { console.log("[Shah's feeder]", e); } }
setTimeout(tick, 4000);
setInterval(tick, EVERY_SECONDS * 1000);
