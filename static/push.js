// Owner phone push-notification control (clock in/out alerts).
// Lives in #pushbar, OUTSIDE #root, so the dashboard's 45s auto-refresh never
// wipes its state. Only the owner's logged-in phone can subscribe.
(function () {
  var bar = document.getElementById('pushbar');
  if (!bar) return;

  function card(inner) {
    bar.innerHTML = '<div class="card" style="margin-bottom:0">' + inner + '</div>';
  }
  function note(msg) {
    card('<div style="font-size:13px;color:#c9bdac;line-height:1.45">' + msg + '</div>');
  }

  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  function isStandalone() {
    return (window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches
            || window.matchMedia('(display-mode: fullscreen)').matches))
        || window.navigator.standalone === true;
  }
  var supported = ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);

  // iOS only allows web push from an app opened via its Home Screen icon.
  if (isIOS && !isStandalone()) {
    note('🔔 <b>Clock-in alerts:</b> tap the Share button, choose <b>Add to Home Screen</b>, '
       + 'then open Shah\'s from that icon — you can switch on notifications there.');
    return;
  }
  if (!supported) {
    note('🔔 Notifications aren\'t supported in this browser. On iPhone, open the app from its Home Screen icon.');
    return;
  }

  function urlB64ToUint8(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4);
    var base = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  var reg = null;

  function renderEnabled() {
    card('<div style="display:flex;align-items:center;gap:12px">'
      + '<div style="flex:1"><div style="font-weight:700;font-size:15px">🔔 Clock-in alerts are on</div>'
      + '<div style="font-size:12.5px;color:#9a8f80;margin-top:2px">You\'ll get a push the moment anyone clocks in or out.</div></div>'
      + '<button id="ptest" class="iconbtn" style="width:auto;padding:0 14px;font-size:13px;font-weight:650">Test</button>'
      + '</div>'
      + '<div style="margin-top:9px"><a href="#" id="poff" style="font-size:12px;color:#8a8072">Turn off on this phone</a></div>');
    document.getElementById('ptest').onclick = function () {
      var b = this; b.textContent = '…';
      fetch('/api/push/test', { method: 'POST', credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) { b.textContent = (d.sent > 0) ? 'Sent ✓' : 'No devices'; })
        .catch(function () { b.textContent = 'Error'; })
        .then(function () { setTimeout(function () { b.textContent = 'Test'; }, 2500); });
    };
    document.getElementById('poff').onclick = function (e) {
      e.preventDefault();
      reg.pushManager.getSubscription().then(function (sub) {
        if (sub) {
          var ep = sub.endpoint;
          sub.unsubscribe();
          fetch('/api/push/unsubscribe', { method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: ep }) });
        }
        renderDisabled();
      });
    };
  }

  function renderDisabled(extra) {
    card('<div style="display:flex;align-items:center;gap:12px">'
      + '<div style="flex:1"><div style="font-weight:700;font-size:15px">🔔 Turn on clock-in alerts</div>'
      + '<div style="font-size:12.5px;color:#9a8f80;margin-top:2px">Get a push on this phone whenever someone clocks in or out.</div></div>'
      + '<button id="pon" class="iconbtn" style="width:auto;padding:0 16px;font-size:14px;font-weight:700;'
      + 'background:#b06d10;border-color:#b06d10;color:#fff">Enable</button>'
      + '</div>'
      + (extra ? ('<div style="font-size:12px;color:#e2a19a;margin-top:9px;line-height:1.4">' + extra + '</div>') : ''));
    document.getElementById('pon').onclick = enable;
  }

  function enable() {
    var btn = document.getElementById('pon'); if (btn) btn.textContent = '…';
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') {
        renderDisabled('Notifications are turned off for this app. Enable them in your phone Settings, then tap Enable again.');
        return;
      }
      fetch('/api/push/pubkey', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.key) { renderDisabled('Server key isn\'t ready yet — reopen the app in a moment.'); return; }
          return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(d.key) });
        })
        .then(function (sub) {
          if (!sub) return;
          return fetch('/api/push/subscribe', { method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub }) });
        })
        .then(function () { renderEnabled(); })
        .catch(function (err) { renderDisabled('Couldn\'t enable (' + ((err && err.message) || err) + '). Try again.'); });
    });
  }

  navigator.serviceWorker.register('/sw.js', { scope: '/' })
    .then(function (r) { reg = r; return navigator.serviceWorker.ready; })
    .then(function () {
      if (Notification.permission === 'granted') {
        reg.pushManager.getSubscription().then(function (sub) {
          if (sub) {
            fetch('/api/push/subscribe', { method: 'POST', credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub }) });
            renderEnabled();
          } else {
            renderDisabled();
          }
        });
      } else if (Notification.permission === 'denied') {
        renderDisabled('Notifications are blocked for this app. Enable them in your phone Settings to get alerts.');
      } else {
        renderDisabled();
      }
    })
    .catch(function (err) { note('🔔 Couldn\'t set up notifications (' + ((err && err.message) || err) + ').'); });
})();
