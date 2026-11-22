// Owner mobile dashboard — reads the admin dashboard API using the owner cookie.
(function () {
  var root = document.getElementById('root');

  function h(n) { return (Math.round((n || 0) * 100) / 100); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function money(n) { return '$' + (Math.round((n || 0) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function ago(sec) {
    var s = Math.max(0, Math.floor(Date.now() / 1000) - sec), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60);
    return hh ? (hh + 'h ' + mm + 'm') : (mm + 'm');
  }

  async function load() {
    var r;
    try {
      r = await fetch('/api/admin/dashboard', { credentials: 'same-origin' });
    } catch (e) { root.innerHTML = '<div class="loading">Network error. <a style="color:#b06d10" href="/owner">Retry</a></div>'; return; }
    if (r.status === 401) { location.href = '/owner/login'; return; }
    if (!r.ok) { root.innerHTML = '<div class="loading">Couldn\'t load (' + r.status + ').</div>'; return; }
    var d = await r.json();
    render(d);
  }

  function render(d) {
    try { document.getElementById('store').textContent = d.store || "Shah's Halal"; } catch (e) {}
    var on = d.on_now || [], rows = d.rows || [], tot = d.totals || {}, warn = d.ot_warnings || [];
    var html = '';

    // On the clock now
    html += '<div class="card"><h2>On the clock now · ' + on.length + '</h2>';
    if (!on.length) html += '<div class="empty">No one is clocked in right now.</div>';
    else on.forEach(function (p) {
      html += '<div class="row"><div class="nm"><span class="dot"></span>' + esc(p.name) + '</div>'
            + '<div class="meta">' + ago(p.since) + ' · in at ' + new Date(p.since * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</div></div>';
    });
    html += '</div>';

    // Stat tiles
    html += '<div class="tiles">'
      + tile(h(d.today_hours) + 'h', 'Hours today')
      + tile(h(tot.hrs) + 'h', 'Hours this week')
      + tile(money(tot.pay), 'Labor cost (est.)', true)
      + tile(h(tot.ot) + 'h', 'Overtime this week')
      + '</div>';
    if (d.wages_placeholder) html += '<div class="note">Labor $ are estimates — set real wages in Manager → Team for exact numbers.</div>';

    // OT warnings
    if (warn.length) {
      html += '<div class="card"><h2>Overtime watch</h2>';
      warn.forEach(function (w) {
        html += '<div class="row"><div class="nm">' + esc(w.name) + '</div><div class="meta">' + h(w.hrs) + 'h'
              + (w.ot > 0 ? '<span class="pill ot">' + h(w.ot) + 'h OT</span>' : '<span class="pill ot">near 40</span>') + '</div></div>';
      });
      html += '</div>';
    }

    // Per-employee week
    html += '<div class="card"><h2>This week · ' + esc(d.week) + '</h2>';
    var worked = rows.filter(function (r) { return r.hrs > 0 || r.open_now; })
                     .sort(function (a, b) { return b.hrs - a.hrs; });
    if (!worked.length) html += '<div class="empty">No hours recorded yet this week.</div>';
    else worked.forEach(function (r) {
      html += '<div class="row"><div class="nm">' + esc(r.name)
            + (r.open_now ? '<span class="pill">on now</span>' : '')
            + (r.ot > 0 ? '<span class="pill ot">' + h(r.ot) + 'h OT</span>' : '')
            + '</div><div class="meta">' + h(r.hrs) + 'h · ' + money(r.pay) + '</div></div>';
    });
    html += '</div>';

    // Quick links
    html += '<div class="card"><h2>Open</h2><div class="links">'
      + '<a href="/admin">Manager console</a>'
      + '<a href="/admin#reports">Reports &amp; payroll</a>'
      + '<a href="/inventory">Inventory</a>'
      + '<a href="/admin#photos">Punch photos</a>'
      + '</div></div>';

    html += '<div class="foot">Updated ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' · pull to refresh</div>';
    root.innerHTML = html;
  }

  function tile(n, l, accent) {
    return '<div class="tile' + (accent ? ' accent' : '') + '"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>';
  }

  document.getElementById('refresh').addEventListener('click', function () { root.innerHTML = '<div class="loading">Loading…</div>'; load(); });
  document.getElementById('logout').addEventListener('click', function () { location.href = '/owner/logout'; });
  load();
  setInterval(load, 60000); // auto-refresh each minute
})();
