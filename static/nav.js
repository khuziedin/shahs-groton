// Shared bottom navigation for the manager/owner pages (not the staff kiosk).
// Role-aware: the owner sees Home/Schedule/Inventory/Console; a manager (no
// owner session) sees only Inventory/Console.
(function () {
  var ALL = {
    home:  { href: "/owner",     label: "Home",      icon: "⌂" },
    sched: { href: "/schedule",  label: "Schedule",  icon: "▦" },
    inv:   { href: "/inventory", label: "Inventory", icon: "▤" },
    con:   { href: "/admin",     label: "Console",   icon: "⚙" }
  };
  var path = location.pathname.replace(/\/$/, "") || "/";

  var css =
    "#mnav{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;" +
    "background:rgba(20,17,14,.97);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);" +
    "border-top:1px solid #2a241d;padding:7px 6px calc(7px + env(safe-area-inset-bottom));" +
    "box-shadow:0 -6px 20px rgba(0,0,0,.35)}" +
    "#mnav a{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;text-decoration:none;" +
    "color:#9a8f80;font:600 11px -apple-system,'Segoe UI',Roboto,Arial,sans-serif;padding:5px 2px;border-radius:13px}" +
    "#mnav a .i{font-size:19px;line-height:1}" +
    "#mnav a.on{color:#f0a35e;background:#221b12}" +
    "#mnav a:active{background:#241f18}";
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  function build(items) {
    var bar = document.createElement("nav");
    bar.id = "mnav";
    items.forEach(function (it) {
      var a = document.createElement("a");
      a.href = it.href;
      var on = (it.href === "/owner") ? (path === "/owner" || path === "/") : (path.indexOf(it.href) === 0);
      if (on) a.className = "on";
      a.innerHTML = '<span class="i">' + it.icon + "</span>" + it.label;
      bar.appendChild(a);
    });
    function mount() {
      document.body.appendChild(bar);
      try { document.body.style.paddingBottom = "76px"; } catch (e) {}
    }
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount);
  }

  fetch("/api/whoami", { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (w) {
      build((w && w.owner) ? [ALL.home, ALL.sched, ALL.inv, ALL.con] : [ALL.inv, ALL.con]);
    })
    .catch(function () { build([ALL.inv, ALL.con]); });
})();
