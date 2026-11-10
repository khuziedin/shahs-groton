"use strict";
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const el=(t,c,txt)=>{const e=document.createElement(t);if(c)e.className=c;if(txt!=null)e.textContent=txt;return e;};
  const pad2=n=>String(n).padStart(2,"0");
  function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("show"),2600);}
  const fmtHrs=h=>(Math.round(h*100)/100).toFixed(2);
  const money=n=>"$"+(Math.round(n*100)/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  function token(){try{return sessionStorage.getItem("tc_tok")||"";}catch(e){return window._tok||"";}}
  function setToken(t){try{sessionStorage.setItem("tc_tok",t);}catch(e){window._tok=t;}}

  async function api(path,opts){
    opts=opts||{}; opts.headers=Object.assign({"Content-Type":"application/json","Authorization":"Bearer "+token()},opts.headers||{});
    const r=await fetch(path,opts);
    if(r.status===401){renderLock();throw new Error("auth");}
    return r.json();
  }

  const S={tab:"dashboard",week:null};

  // after a self-update the server restarts; poll until it answers, then reload
  function waitForRestart(){
    let tries=0;
    const iv=setInterval(async()=>{
      tries++;
      try{const r=await fetch("/api/state",{cache:"no-store"});if(r.ok){clearInterval(iv);location.reload();return;}}catch(e){}
      if(tries>45){clearInterval(iv);const s=document.getElementById("ustatus");if(s)s.textContent="Taking longer than usual — reload the page in a moment.";}
    },1500);
  }

  /* ---------- login ---------- */
  async function boot(){ if(token())show(); else renderLock(); }
  function renderLock(){
    const root=$("#root"); root.innerHTML="";
    const w=el("div","lock");
    w.innerHTML='<img src="/static/logo.png" alt="" style="height:88px;margin:0 auto 14px;display:block"><h2>Manager access</h2><p>Enter the manager PIN to view hours, edit the timesheet and manage your team.</p>';
    const inp=el("input");inp.type="password";inp.inputMode="numeric";inp.placeholder="Manager PIN";inp.style.textAlign="center";inp.style.fontSize="20px";inp.style.letterSpacing=".3em";
    w.appendChild(inp);
    const b=el("button","btn primary mt","Unlock");b.style.width="100%";
    const go=async()=>{ try{ const r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pin:inp.value})});
      const j=await r.json(); if(j.ok){setToken(j.token);show();} else {inp.value="";inp.placeholder="Wrong PIN";toast("Incorrect manager PIN");} }catch(e){toast("Error");} };
    b.onclick=go; inp.onkeydown=e=>{if(e.key==="Enter")go();};
    w.appendChild(b); root.appendChild(w); setTimeout(()=>inp.focus(),80);
  }

  function show(){
    const root=$("#root"); root.innerHTML="";
    const tabs=el("div","tabs");
    [["dashboard","Dashboard"],["report","Report"],["timesheet","Timesheet"],["team","Team"],["inventory","Inventory"],["photos","Photos"],["audit","Activity log"],["settings","Settings"]].forEach(([k,label])=>{
      const t=el("button","tab"+(S.tab===k?" on":""),label); t.onclick=()=>{S.tab=k;show();}; tabs.appendChild(t);
    });
    root.appendChild(tabs);
    const body=el("div"); body.id="tabbody"; root.appendChild(body);
    if(S.tab==="dashboard")renderDashboard(body);
    else if(S.tab==="report")renderReport(body);
    else if(S.tab==="timesheet")renderTimesheet(body);
    else if(S.tab==="team")renderTeam(body);
    else if(S.tab==="photos")renderPhotos(body);
    else if(S.tab==="audit")renderAudit(body);
    else if(S.tab==="inventory")renderInventory(body);
    else renderSettings(body);
  }
  function loadingInto(b){b.innerHTML='<div class="loading"><div class="spin"></div><div>Loading…</div></div>';}

  /* ---------- dashboard ---------- */
  async function renderDashboard(b){
    loadingInto(b);
    const d=await api("/api/admin/dashboard");
    b.innerHTML="";
    if(d.wages_placeholder) b.appendChild(banner("Wage rates are placeholders. Set each person's real rate in <b>Team</b> for accurate pay."));
    const stats=el("div","grid stats");
    stats.appendChild(stat("On the clock now",(d.on_now.length)));
    stats.appendChild(stat("Hours today",fmtHrs(d.today_hours)));
    stats.appendChild(stat("Hours this week",fmtHrs(d.totals.hrs)));
    stats.appendChild(stat("Labor cost this week",money(d.totals.pay)));
    b.appendChild(stats);

    const h=el("h3");h.style.margin="22px 0 10px";h.textContent="On the clock now"; b.appendChild(h);
    if(!d.on_now.length){const e=el("div","emptyroster");e.textContent="Nobody is clocked in.";b.appendChild(e);}
    else{ const wrap=el("div","grid");wrap.style.gridTemplateColumns="repeat(auto-fit,minmax(220px,1fr))";
      d.on_now.forEach(p=>{const c=el("div","stat");c.innerHTML='<div class="k">'+p.name+'</div><div class="v" style="font-size:22px">'+fmtHrs(p.elapsed_h)+' <small>h</small></div><div class="muted small">since '+new Date(p.since*1000).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})+'</div>';wrap.appendChild(c);});
      b.appendChild(wrap);
    }
    if(d.ot_warnings.length){
      const w=el("div");w.style.marginTop="22px";
      const hh=el("h3");hh.style.margin="0 0 10px";hh.textContent="Overtime watch";w.appendChild(hh);
      d.ot_warnings.forEach(x=>{const r=el("div","setcard");r.style.marginBottom="8px";r.style.padding="12px 15px";
        r.innerHTML='<b>'+x.name+'</b> — '+fmtHrs(x.hrs)+' h this week'+(x.ot>0?' <span class="pill ot">'+fmtHrs(x.ot)+' OT</span>':' <span class="muted small">(approaching OT)</span>');w.appendChild(r);});
      b.appendChild(w);
    }
  }
  function stat(k,v){const c=el("div","stat");c.innerHTML='<div class="k">'+k+'</div><div class="v">'+v+'</div>';return c;}
  function banner(html){const d=el("div","banner");d.innerHTML=html;return d;}

  /* ---------- week bar ---------- */
  function weekBar(onnav,extra){
    const bar=el("div","weekbar");
    const prev=el("button","nav","‹");prev.onclick=()=>onnav(-7);
    const next=el("button","nav","›");next.onclick=()=>onnav(7);
    const lbl=el("div","wk-lbl");lbl.id="wklbl";
    bar.appendChild(prev);bar.appendChild(lbl);bar.appendChild(next);
    if(extra){extra.style.marginLeft="auto";bar.appendChild(extra);}
    return bar;
  }
  function setWkLabel(range,thisWeek,wk){
    const a=new Date(range[0]*1000),bd=new Date((range[1]-1)*1000);
    const r=a.toLocaleDateString(undefined,{month:"short",day:"numeric"})+" – "+bd.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
    $("#wklbl").innerHTML=r+"<small>"+(thisWeek?"This week":"Week of "+wk)+" · Mon–Sun</small>";
  }

  /* ---------- report ---------- */
  async function renderReport(b){
    loadingInto(b);
    const d=await api("/api/admin/report"+(S.week?"?week="+S.week:""));
    S.week=d.week; b.innerHTML="";
    const dlwrap=el("div");dlwrap.style.display="flex";dlwrap.style.gap="8px";dlwrap.style.flexWrap="wrap";
    const dl=el("button","btn sm","Download CSV");
    dl.onclick=()=>{ fetch("/api/admin/report.csv?week="+S.week,{headers:{"Authorization":"Bearer "+token()}})
      .then(r=>r.blob()).then(bl=>{const u=URL.createObjectURL(bl);const a=document.createElement("a");a.href=u;a.download="hours_"+S.week+".csv";a.click();URL.revokeObjectURL(u);}); };
    const plbtn=el("button","btn sm primary","Download payroll sheet");
    plbtn.onclick=()=>{plbtn.disabled=true;plbtn.textContent="Building…";
      fetch("/api/admin/payroll.xlsx?week="+S.week,{headers:{"Authorization":"Bearer "+token()}})
      .then(async r=>{if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.error||"Failed");}return r.blob();})
      .then(bl=>{const u=URL.createObjectURL(bl);const a=document.createElement("a");a.href=u;a.download="payroll_"+S.week+".xlsx";a.click();URL.revokeObjectURL(u);plbtn.disabled=false;plbtn.textContent="Download payroll sheet";})
      .catch(e=>{plbtn.disabled=false;plbtn.textContent="Download payroll sheet";toast(e.message||"Failed");}); };
    dlwrap.appendChild(dl);dlwrap.appendChild(plbtn);
    b.appendChild(weekBar(nav,dlwrap)); setWkLabel(d.range,d.this_week,d.week);
    if(d.wages_placeholder)b.appendChild(banner("Pay below uses <b>placeholder</b> rates — set real wages in Team."));
    const wrap=el("div","tablewrap");const tbl=el("table");
    tbl.innerHTML='<thead><tr><th>Employee</th><th class="num">Reg</th><th class="num">OT</th><th class="num">Total</th><th class="num">Rate</th><th class="num">OT rate</th><th class="num">Gross pay</th></tr></thead>';
    const tb=el("tbody");
    d.rows.forEach(r=>{const tr=el("tr");
      tr.innerHTML='<td><b>'+r.name+'</b>'+(r.open_now?' <span class="pill in"><span class="pulse"></span>on now</span>':'')+'</td>'+
        '<td class="num">'+fmtHrs(r.reg)+'</td><td class="num">'+(r.ot>0?'<span class="pill ot">'+fmtHrs(r.ot)+'</span>':'0.00')+'</td>'+
        '<td class="num"><b>'+fmtHrs(r.hrs)+'</b></td><td class="num">'+money(r.rate)+'</td><td class="num">'+money(r.ot_rate)+'</td><td class="num"><b>'+money(r.pay)+'</b></td>';
      tb.appendChild(tr);});
    tbl.appendChild(tb);
    const t=d.totals;const tf=el("tfoot");
    tf.innerHTML='<tr><td>Total</td><td class="num">'+fmtHrs(t.reg)+'</td><td class="num">'+fmtHrs(t.ot)+'</td><td class="num">'+fmtHrs(t.hrs)+'</td><td></td><td></td><td class="num">'+money(t.pay)+'</td></tr>';
    tbl.appendChild(tf);wrap.appendChild(tbl);b.appendChild(wrap);
    const note=el("p","muted small mt");note.innerHTML="Overtime = hours past each person's threshold (40 by default) at their OT rate. This same report is emailed to you every Monday morning for the prior week.";
    b.appendChild(note);
  }
  function nav(days){ const [y,m,da]=S.week.split("-").map(Number);const d=new Date(y,m-1,da+days);
    S.week=d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); show(); }

  /* ---------- timesheet ---------- */
  async function renderTimesheet(b){
    loadingInto(b);
    const d=await api("/api/admin/timesheet"+(S.week?"?week="+S.week:""));
    S.week=d.week; b.innerHTML="";
    b.appendChild(weekBar(nav));
    const start=weekStartLocal(d.week);
    setWkLabel([Math.floor(start/1000),Math.floor(start/1000)+7*86400],d.this_week,d.week);
    if(!d.employees.some(e=>e.shifts.length)){const e=el("div","emptyroster");e.style.margin="16px 0";e.textContent="No punches recorded this week yet.";b.appendChild(e);}
    d.employees.forEach(emp=>{
      const det=el("details","tsemp");if(emp.shifts.length)det.open=d.this_week;
      const sum=el("summary");
      sum.innerHTML='<div class="av">'+(emp.name.split(" ").map(x=>x[0]).slice(0,2).join("").toUpperCase())+'</div><div><b>'+emp.name+'</b></div><div class="tot mono">'+fmtHrs(emp.hours)+' h</div>';
      det.appendChild(sum);
      const rows=el("div","tsrows");
      if(!emp.shifts.length){const n=el("div","muted small");n.style.padding="6px 2px";n.textContent="No punches this week.";rows.appendChild(n);}
      emp.shifts.forEach(sh=>rows.appendChild(tsRow(emp,sh)));
      const add=el("button","btn sm ghost mt","+ Add a shift");add.onclick=()=>addShift(emp);
      rows.appendChild(add); det.appendChild(rows); b.appendChild(det);
    });
    const note=el("p","muted small mt");note.innerHTML='Fix a missed or wrong punch, then Save. <span class="pill auto">auto</span> marks a shift the system closed because someone forgot to clock out — check it.';
    b.appendChild(note);
  }
  function tsRow(emp,sh){
    const row=el("div","tsrow");
    const dayStr=toDateInput(sh.clock_in);
    const inWrap=el("div");inWrap.innerHTML='<label>In · '+new Date(sh.clock_in*1000).toLocaleDateString(undefined,{weekday:"short"})+'</label>';
    const inT=el("input");inT.type="time";inT.value=toTimeInput(sh.clock_in);inWrap.appendChild(inT);
    const outWrap=el("div");outWrap.innerHTML='<label>Out'+(sh.auto_closed?' <span class="pill auto">auto</span>':'')+'</label>';
    const outT=el("input");outT.type="time";outT.value=sh.clock_out?toTimeInput(sh.clock_out):"";outWrap.appendChild(outT);
    const dur=el("div","dur");
    const setDur=()=>{if(!outT.value){dur.textContent="— open —";return;}let a=sh.clock_in,bo=fromDateTime(dayStr,outT.value);if(bo<a)bo+=86400;dur.textContent=fmtHrs((bo-a)/3600)+" h";};
    setDur();inT.oninput=setDur;outT.oninput=setDur;
    const act=el("div");act.style.display="flex";act.style.gap="6px";
    const save=el("button","btn sm primary","Save");
    save.onclick=async()=>{save.disabled=true;
      const ci=fromDateTime(dayStr,inT.value);let co=outT.value?fromDateTime(dayStr,outT.value):null;if(co!=null&&co<ci)co+=86400;
      const r=await api("/api/admin/punch",{method:"POST",body:JSON.stringify({id:sh.id,clock_in:ci,clock_out:co})});
      if(r.ok){toast("Shift updated");show();}else{save.disabled=false;toast(r.error||"Could not save");}};
    const del=el("button","icondel");del.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>';
    del.onclick=async()=>{if(del.dataset.a){await api("/api/admin/punch/"+sh.id,{method:"DELETE"});toast("Shift deleted");show();}else{del.dataset.a="1";del.style.background="var(--crit-dim)";del.title="Tap again to delete";setTimeout(()=>{del.dataset.a="";del.style.background="";},2500);}};
    act.appendChild(save);act.appendChild(del);
    row.appendChild(inWrap);row.appendChild(outWrap);row.appendChild(dur);row.appendChild(act);
    return row;
  }
  async function addShift(emp){
    const start=weekStartLocal(S.week)/1000; const ci=start+9*3600, co=ci+4*3600;
    const r=await api("/api/admin/punch",{method:"POST",body:JSON.stringify({emp_id:emp.emp_id,clock_in:ci,clock_out:co})});
    if(r.ok){toast("Shift added — set the times");show();}else toast(r.error||"Error");
  }

  /* ---------- team ---------- */
  async function renderTeam(b){
    loadingInto(b);
    const emps=await api("/api/admin/employees");
    b.innerHTML="";
    const top=el("div","weekbar");top.innerHTML='<div class="wk-lbl">Team<small>'+emps.length+' people</small></div>';
    const add=el("button","btn primary sm","+ Add employee");add.style.marginLeft="auto";add.onclick=async()=>{
      const r=await api("/api/admin/employees",{method:"POST",body:JSON.stringify({name:"New employee",pin:nextPin(emps),rate:0,ot_threshold:40})});
      if(r.ok){toast("Added — set name, PIN & wage");show();}else toast(r.error||"Error");};
    top.appendChild(add); b.appendChild(top);
    emps.forEach(e=>b.appendChild(teamRow(e)));
    const note=el("p","muted small mt");note.innerHTML="Keep PINs unique. OT rate blank = same as base (no premium). Deactivate instead of deleting so past hours stay intact.";
    b.appendChild(note);
  }
  function nextPin(emps){for(let n=1001;n<9999;n++){if(!emps.some(e=>String(e.pin)===String(n)))return String(n);}return "0000";}
  function teamRow(e){
    const row=el("div","teamrow"+(e.active?"":" inactive"));
    const f=(lab,node)=>{const d=el("div","f");d.innerHTML='<label>'+lab+'</label>';d.appendChild(node);return d;};
    const name=el("input");name.type="text";name.value=e.name||"";
    const pin=el("input");pin.type="text";pin.inputMode="numeric";pin.value=e.pin||"";pin.maxLength=6;
    const rate=el("input");rate.type="number";rate.step="0.01";rate.value=e.rate!=null?e.rate:"";
    const ot=el("input");ot.type="number";ot.step="0.01";ot.value=e.ot_rate!=null?e.ot_rate:"";ot.placeholder="base";
    const thr=el("input");thr.type="number";thr.value=e.ot_threshold!=null?e.ot_threshold:40;
    const email=el("input");email.type="email";email.value=e.email||"";email.placeholder="employee@email.com (for their weekly report)";
    const ptype=sel([["check","Check (Gusto)"],["cash","Cash"]],e.pay_type||"check");
    row.appendChild(f("Name",name));row.appendChild(f("PIN",pin));row.appendChild(f("Rate $/hr",rate));row.appendChild(f("OT rate",ot));row.appendChild(f("OT after",thr));
    const ptF=f("Pay type",ptype);row.appendChild(ptF);
    const emF=f("Email (their weekly report)",email);emF.style.gridColumn="1/-1";row.appendChild(emF);
    const actions=el("div","f");actions.innerHTML='<label>&nbsp;</label>';
    const box=el("div");box.style.display="flex";box.style.gap="6px";
    const save=el("button","btn sm primary","Save");
    save.onclick=async()=>{save.disabled=true;
      const r=await api("/api/admin/employees",{method:"POST",body:JSON.stringify({id:e.id,name:name.value.trim()||e.name,pin:pin.value.trim(),email:email.value.trim(),pay_type:ptype.value,rate:rate.value,ot_rate:ot.value===""?null:ot.value,ot_threshold:thr.value,active:e.active})});
      if(r.ok){toast("Saved");}else{save.disabled=false;toast(r.error||"Error");}};
    const act=el("button","btn sm",e.active?"Deactivate":"Reactivate");
    act.onclick=async()=>{await api("/api/admin/employees",{method:"POST",body:JSON.stringify({id:e.id,name:name.value,pin:pin.value,email:email.value.trim(),pay_type:ptype.value,rate:rate.value,ot_rate:ot.value===""?null:ot.value,ot_threshold:thr.value,active:e.active?false:true})});show();};
    box.appendChild(save);box.appendChild(act);actions.appendChild(box);row.appendChild(actions);
    return row;
  }

  /* ---------- photos ---------- */
  async function renderPhotos(b){
    loadingInto(b);
    const ph=await api("/api/admin/photos");
    b.innerHTML="";
    const note=el("p","muted small");note.textContent="Front-camera photo from each clock in/out, most recent first. Stored on the tablet only, auto-deleted after 60 days.";b.appendChild(note);
    if(!ph.length){const e=el("div","emptyroster");e.style.margin="16px 0";e.textContent="No punch photos yet. They appear here once people clock in with photos turned on (Settings → Store & wages).";b.appendChild(e);return;}
    const grid=el("div");grid.style.display="grid";grid.style.gridTemplateColumns="repeat(auto-fill,minmax(150px,1fr))";grid.style.gap="12px";grid.style.marginTop="14px";
    ph.forEach(p=>{
      const c=el("div");c.style.border="1px solid var(--line)";c.style.borderRadius="12px";c.style.overflow="hidden";c.style.background="var(--surface)";
      const img=el("img");img.src="/data/photos/"+encodeURIComponent(p.file);img.loading="lazy";img.alt="";
      img.style.width="100%";img.style.aspectRatio="4/3";img.style.objectFit="cover";img.style.display="block";img.style.background="var(--surface-2)";
      const cap=el("div");cap.style.padding="8px 10px";
      const when=new Date(p.ts*1000).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
      cap.innerHTML='<div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+p.name+'</div>'+
        '<div class="small" style="margin-top:3px">'+(p.dir==="in"?'<span class="pill in">IN</span>':'<span class="pill ot">OUT</span>')+' <span class="muted">'+when+'</span></div>';
      c.appendChild(img);c.appendChild(cap);grid.appendChild(c);
    });
    b.appendChild(grid);
  }

  /* ---------- audit ---------- */
  async function renderAudit(b){
    loadingInto(b);
    const rows=await api("/api/admin/audit");
    b.innerHTML="";
    const h=el("p","muted small");h.textContent="Every punch, edit and change is logged here (most recent 300).";b.appendChild(h);
    const wrap=el("div","setcard");wrap.style.maxWidth="100%";wrap.style.padding="0";
    rows.forEach(r=>{const row=el("div","auditrow");
      row.innerHTML='<div class="ts">'+new Date(r.ts*1000).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})+'</div><div class="act">'+r.actor+' · '+r.action+'</div><div class="muted">'+(r.detail||"")+'</div>';
      wrap.appendChild(row);});
    b.appendChild(wrap);
  }

  /* ---------- settings ---------- */
  async function renderSettings(b){
    loadingInto(b);
    const s=await api("/api/admin/settings");
    b.innerHTML="";

    // remote access
    const ca=card("Open from your laptop or phone","On the same Wi-Fi as the tablet, visit these addresses in any browser. The manager console still needs the PIN.");
    const url="http://"+(s.lan_ip||"localhost")+":"+(s.port||"8080");
    const mk=(label,u)=>{const d=el("div","kv");const sp=el("span",null,label);const code=el("b");code.style.fontFamily="var(--font-mono)";code.style.userSelect="all";code.textContent=u;const cp=el("button","btn sm","Copy");cp.style.marginLeft="8px";cp.onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(u).then(()=>toast("Copied")).catch(()=>toast(u));};const right=el("div");right.style.display="flex";right.style.alignItems="center";right.appendChild(code);right.appendChild(cp);d.appendChild(sp);d.appendChild(right);return d;};
    ca.appendChild(mk("Kiosk",url));
    ca.appendChild(mk("Manager",url+"/admin"));
    const tip=el("p","muted small mt");tip.innerHTML="Tip: bookmark the Manager address on your laptop. To reach it from <b>outside</b> the restaurant (home, on the road), ask to set up Tailscale — a free, secure remote link.";
    ca.appendChild(tip);
    b.appendChild(ca);

    // software updates
    const cu=card("Software updates","Pull the latest version from GitHub and restart. Your data is never touched, and a broken update rolls back on its own.");
    const vkv=el("div","kv");vkv.innerHTML='<span>Current version</span><b id="verline">checking…</b>';cu.appendChild(vkv);
    const ust=el("p","muted small");ust.id="ustatus";ust.style.margin="8px 0 12px";cu.appendChild(ust);
    const ubtn=el("button","btn primary","Update now");
    ubtn.onclick=async()=>{
      ubtn.disabled=true;ubtn.textContent="Checking…";$("#ustatus").textContent="";
      try{
        const r=await api("/api/admin/update",{method:"POST"});
        if(r.ok&&r.updated){ubtn.textContent="Updating…";$("#ustatus").textContent="New version installed — restarting the clock (about 10 seconds)…";waitForRestart();}
        else if(r.ok){ubtn.disabled=false;ubtn.textContent="Update now";$("#ustatus").textContent=r.msg||"Already up to date.";toast(r.msg||"Already up to date");}
        else{ubtn.disabled=false;ubtn.textContent="Update now";$("#ustatus").textContent=r.error||"Update failed.";toast("Update failed");}
      }catch(e){ubtn.disabled=false;ubtn.textContent="Update now";toast("Error reaching the clock");}
    };
    cu.appendChild(ubtn);b.appendChild(cu);
    api("/api/admin/version").then(v=>{const vl=$("#verline");if(!vl)return;
      if(v&&v.git){vl.textContent=v.commit+" · "+v.date;}else{vl.textContent="not a GitHub copy yet";
        const btn=$("#ustatus");if(btn)btn.textContent="This install updates by zip for now. Set it up from GitHub to enable one-click updates.";}}).catch(()=>{});

    // manager pin
    const c1=card("Manager PIN","Protects this console. Staff never see it.");
    const np=inp("text","4–6 digits");np.inputMode="numeric";np.maxLength=6;
    c1.appendChild(field("New manager PIN",np));
    c1.appendChild(saveBtn("Update manager PIN",async()=>{if(np.value.trim().length<4){toast("Use at least 4 digits");return;}
      await api("/api/admin/settings",{method:"POST",body:JSON.stringify({admin_pin:np.value.trim()})});np.value="";toast("Manager PIN updated");}));
    b.appendChild(c1);

    const DAYS=[["0","Monday"],["1","Tuesday"],["2","Wednesday"],["3","Thursday"],["4","Friday"],["5","Saturday"],["6","Sunday"]];
    const testBtn=(label,kind)=>{const t=el("button","btn sm",label);t.onclick=async()=>{t.disabled=true;const o=t.textContent;t.textContent="Sending…";
      const r=await api("/api/admin/send_test",{method:"POST",body:JSON.stringify({kind})});toast(r.msg||(r.ok?"Sent":"Failed"));t.disabled=false;t.textContent=o;};return t;};
    const timeRow=(dayS,hrS,mnS,withDay)=>{const g=el("div");g.style.display="grid";g.style.gridTemplateColumns=withDay?"1.2fr .6fr .6fr":"1fr 1fr";g.style.gap="10px";
      if(withDay)g.appendChild(field("Day",dayS));g.appendChild(field("Hour (0–23)",hrS));g.appendChild(field("Min",mnS));return g;};
    const chk=(labelTxt,on)=>{const l=el("label");l.style.display="flex";l.style.gap="8px";l.style.alignItems="center";l.style.fontSize="13px";l.style.cursor="pointer";l.style.marginBottom="12px";const c=el("input");c.type="checkbox";c.checked=on;c.style.width="auto";l.appendChild(c);l.appendChild(document.createTextNode(labelTxt));l._c=c;return l;};

    // email credentials
    const c2=card("Email setup","How the tablet sends your reports. Set this once.");
    const method=sel([["smtp","Gmail direct (app password)"],["gmail_api","Gmail API (your account, port 443)"],["brevo","Email service (Brevo)"]],s.email_method||"smtp");
    const su=inp("email","your.gmail@gmail.com");su.value=s.smtp_user||"";
    const sp=inp("password",s.smtp_pass_set==="1"?"•••••••• (saved — leave blank to keep)":"16-char app password");
    const bk=inp("password",s.brevo_key_set==="1"?"•••••••• (saved — leave blank to keep)":"paste your Brevo API key");
    const em=inp("email","owner@email.com");em.value=s.report_email||"";
    c2.appendChild(field("Sending method",method));
    const gmailF=field("Gmail App Password",sp);
    const brevoF=field("Email-service API key (Brevo)",bk);
    c2.appendChild(field("Sender email address",su));
    const apiNote=el("p","muted small");apiNote.innerHTML="Sends through your own Google account over port 443 — no Brevo, no app password. Credentials live in <b>data/credentials.json</b> on the tablet (set up once with get_gmail_token.py — see CREDENTIALS_SETUP.md).";
    c2.appendChild(gmailF); c2.appendChild(brevoF); c2.appendChild(apiNote);
    c2.appendChild(field("Owner — send my reports to",em));
    const syncMethod=()=>{const m=method.value;gmailF.style.display=m==="smtp"?"":"none";brevoF.style.display=m==="brevo"?"":"none";apiNote.style.display=m==="gmail_api"?"":"none";};
    method.onchange=syncMethod; syncMethod();
    c2.appendChild(saveBtn("Save email setup",async()=>{
      const body={smtp_user:su.value.trim(),report_email:em.value.trim(),email_method:method.value};
      if(sp.value.trim())body.smtp_pass=sp.value.trim();
      if(bk.value.trim())body.brevo_api_key=bk.value.trim();
      await api("/api/admin/settings",{method:"POST",body:JSON.stringify(body)});toast("Saved");}));
    const en=el("p","muted small mt");en.innerHTML="If Gmail direct won't send (some networks block it), switch to <b>Email service</b> — it sends over normal web traffic that works everywhere. Ask and I'll help you get a free key.";
    c2.appendChild(en);
    b.appendChild(c2);

    // owner — daily digest
    const cd=card("Daily digest (to you)","Every morning you get a short email of the previous day's hours per employee.");
    const dEnable=chk("Send the daily digest",s.daily_report==="1");cd.appendChild(dEnable);
    const dHr=inp("number","");dHr.value=s.daily_report_hour||"7";dHr.min=0;dHr.max=23;
    const dMn=inp("number","");dMn.value=s.daily_report_min||"40";dMn.min=0;dMn.max=59;
    cd.appendChild(timeRow(null,dHr,dMn,false));
    const cdRow=el("div");cdRow.style.display="flex";cdRow.style.gap="8px";cdRow.style.flexWrap="wrap";cdRow.style.marginTop="4px";
    cdRow.appendChild(saveBtn("Save",async()=>{await api("/api/admin/settings",{method:"POST",body:JSON.stringify({daily_report:dEnable._c.checked?"1":"0",daily_report_hour:dHr.value,daily_report_min:dMn.value})});toast("Saved");}));
    cdRow.appendChild(testBtn("Send test daily","daily"));
    cd.appendChild(cdRow);b.appendChild(cd);

    // owner — weekly team summary
    const cw=card("Weekly team summary (to you)","Your whole-team hours & pay for the week that just ended.");
    const wDay=sel(DAYS,s.report_day||"0");
    const wHr=inp("number","");wHr.value=s.report_hour||"7";wHr.min=0;wHr.max=23;
    const wMn=inp("number","");wMn.value=s.report_min||"50";wMn.min=0;wMn.max=59;
    cw.appendChild(timeRow(wDay,wHr,wMn,true));
    const cwRow=el("div");cwRow.style.display="flex";cwRow.style.gap="8px";cwRow.style.flexWrap="wrap";cwRow.style.marginTop="4px";
    cwRow.appendChild(saveBtn("Save",async()=>{await api("/api/admin/settings",{method:"POST",body:JSON.stringify({report_day:wDay.value,report_hour:wHr.value,report_min:wMn.value})});toast("Saved");}));
    cwRow.appendChild(testBtn("Send test weekly","weekly"));
    cw.appendChild(cwRow);b.appendChild(cw);

    // employees — weekly on payroll day
    const ce=card("Employee weekly pay stubs","On payroll day each employee who has an email gets their own hours & gross pay for the week that ended Sunday. Default: Wednesday.");
    const eEnable=chk("Email employees their weekly hours",s.employee_reports==="1");ce.appendChild(eEnable);
    const pDay=sel(DAYS,s.payroll_day||"2");
    const pHr=inp("number","");pHr.value=s.payroll_hour||"8";pHr.min=0;pHr.max=23;
    const pMn=inp("number","");pMn.value=s.payroll_min||"5";pMn.min=0;pMn.max=59;
    ce.appendChild(timeRow(pDay,pHr,pMn,true));
    const ceRow=el("div");ceRow.style.display="flex";ceRow.style.gap="8px";ceRow.style.flexWrap="wrap";ceRow.style.marginTop="4px";
    ceRow.appendChild(saveBtn("Save",async()=>{await api("/api/admin/settings",{method:"POST",body:JSON.stringify({employee_reports:eEnable._c.checked?"1":"0",payroll_day:pDay.value,payroll_hour:pHr.value,payroll_min:pMn.value})});toast("Saved");}));
    ceRow.appendChild(testBtn("Send test to me","employee"));
    ce.appendChild(ceRow);
    const eNote=el("p","muted small mt");eNote.innerHTML="Set each person's email in <b>Team</b>. The test sends one sample stub to your owner address.";
    ce.appendChild(eNote);b.appendChild(ce);

    // payroll & rounding
    const cpr=card("Payroll & rounding","Your payroll workbook attaches to the Monday email. Rounding applies ONLY to the emailed reports and payroll — the app always shows actual clock times.");
    const rnd=sel([["0","No rounding"],["5","Nearest 5 min"],["10","Nearest 10 min"],["15","Nearest 15 min"],["30","Nearest 30 min"]],s.round_minutes||"15");
    cpr.appendChild(field("Round punches to",rnd));
    const attach=chk("Attach the payroll workbook to the Monday email",s.attach_payroll!=="0");
    cpr.appendChild(attach);
    const gsync=chk("Gusto auto-fill: attach machine-readable hours so payroll pre-fills in Gusto",s.gusto_sync==="1");
    cpr.appendChild(gsync);
    const gurl=inp("url","https://app.gusto.com/payrolls");gurl.value=s.gusto_url||"https://app.gusto.com/payrolls";
    cpr.appendChild(field("Gusto payroll link (shown in the Monday email)",gurl));
    cpr.appendChild(saveBtn("Save",async()=>{await api("/api/admin/settings",{method:"POST",body:JSON.stringify({round_minutes:rnd.value,attach_payroll:attach._c.checked?"1":"0",gusto_sync:gsync._c.checked?"1":"0",gusto_url:gurl.value.trim()})});toast("Saved");}));
    b.appendChild(cpr);

    // operations
    const c3=card("Automation","Hands-off housekeeping that runs on the tablet.");
    c3.innerHTML+='<div class="kv"><span>Auto clock-out</span><b>Closes a forgotten punch after '+(s.auto_clockout_hours||14)+'h, flagged for review</b></div>'+
      '<div class="kv"><span>Nightly backup</span><b>Keeps the last 30 days of the database</b></div>'+
      '<div class="kv"><span>Week</span><b>Monday–Sunday · '+(s.store_name?"America/New_York":"local")+'</b></div>';
    const maxh=inp("number","");maxh.value=s.auto_clockout_hours||"14";maxh.min=4;maxh.max=24;maxh.style.maxWidth="120px";
    c3.appendChild(field("Auto clock-out after (hours)",maxh));
    const bkp=el("div");bkp.style.display="flex";bkp.style.gap="8px";
    bkp.appendChild(saveBtn("Save",async()=>{await api("/api/admin/settings",{method:"POST",body:JSON.stringify({auto_clockout_hours:maxh.value})});toast("Saved");}));
    const bb=el("button","btn","Back up now");bb.onclick=async()=>{const r=await api("/api/admin/backup",{method:"POST"});toast(r.ok?"Backup saved: "+r.path:"Error");};
    bkp.appendChild(bb);c3.appendChild(bkp);
    b.appendChild(c3);

    // wages flag + store
    const c4=card("Store & wages","");
    const sn=inp("text","Store name");sn.value=s.store_name||"";
    c4.appendChild(field("Store name",sn));
    const wp=el("label");wp.style.display="flex";wp.style.gap="8px";wp.style.alignItems="center";wp.style.fontSize="13px";wp.style.cursor="pointer";
    const wpc=el("input");wpc.type="checkbox";wpc.checked=s.wages_placeholder==="1";wpc.style.width="auto";
    wp.appendChild(wpc);wp.appendChild(document.createTextNode("Wages are still placeholders (show reminder banners)"));
    const po=el("label");po.style.display="flex";po.style.gap="8px";po.style.alignItems="center";po.style.fontSize="13px";po.style.cursor="pointer";po.style.marginTop="10px";
    const poc=el("input");poc.type="checkbox";poc.checked=s.photo_on_punch==="1";poc.style.width="auto";
    po.appendChild(poc);po.appendChild(document.createTextNode("Silently photograph each clock in & out (no shutter sound or preview) — anti buddy-punch"));
    c4.appendChild(wp);c4.appendChild(po);
    c4.appendChild(saveBtn("Save",async()=>{await api("/api/admin/settings",{method:"POST",body:JSON.stringify({store_name:sn.value.trim(),wages_placeholder:wpc.checked?"1":"0",photo_on_punch:poc.checked?"1":"0"})});toast("Saved");}));
    b.appendChild(c4);

    // lock
    const c5=card("Lock","");c5.style.borderColor="color-mix(in srgb,var(--crit) 35%,transparent)";
    const lk=el("button","btn","Lock manager console");lk.onclick=()=>{try{sessionStorage.removeItem("tc_tok");}catch(e){}renderLock();};
    c5.appendChild(lk);b.appendChild(c5);
  }
  /* ---------- inventory ---------- */
  function escH(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
  async function renderInventory(b){
    loadingInto(b);
    let s={},inv={items:[],vnames:{}},hist={counts:[]};
    try{ s=await api("/api/admin/settings"); inv=await api("/api/admin/inv/items"); hist=await api("/api/admin/inv/counts"); }
    catch(e){ return; }
    b.innerHTML="";
    const VN=inv.vnames||{shahs:"Shah's (IMS)",rd:"Restaurant Depot",pfg:"PFG",other:"Other"};

    // settings
    const c1=card("Inventory counter","The password staff type to open the Inventory screen, and where finished orders are emailed.");
    const pw=inp("text","a word only staff know");pw.value=s.inv_password||"";
    const dl=inp("text","e.g. Sunday 3pm");dl.value=s.inv_deadline||"Sunday";
    const to=inp("email","blank = your reports email");to.value=s.inv_order_to||"";
    c1.appendChild(field("Inventory password",pw));
    c1.appendChild(field("Order deadline (shown on the count screen)",dl));
    c1.appendChild(field("Email finished orders to",to));
    c1.appendChild(saveBtn("Save",async()=>{await api("/api/admin/settings",{method:"POST",body:JSON.stringify({inv_password:pw.value.trim()||"1234",inv_deadline:dl.value.trim()||"Sunday",inv_order_to:to.value.trim()})});toast("Saved");}));
    b.appendChild(c1);

    // history
    const c2=card("Recent counts","Every submitted count and the order it produced.");
    if(!hist.counts.length){const e=el("p","muted small");e.textContent="No counts yet — do one on the tablet's Inventory screen.";c2.appendChild(e);}
    else hist.counts.forEach(h=>{
      const r=el("div","setcard");r.style.cssText="margin-bottom:8px;padding:11px 13px";const t=h.totals||{};
      r.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>'+new Date(h.ts*1000).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})+'</b><span class="muted small">'+escH(h.counted_by||"—")+'</span></div><div class="muted small" style="margin-top:4px">Shah\'s '+(t.shahs||0)+' · RD '+(t.rd||0)+' · PFG '+(t.pfg||0)+(h.est?' · ~$'+Math.round(h.est):'')+'</div>';
      const vb=el("button","btn sm","View order");vb.style.marginTop="8px";
      const pre=el("pre");pre.style.cssText="display:none;white-space:pre-wrap;font:12px ui-monospace,monospace;background:#faf7f2;border:1px solid #e6ddd0;border-radius:8px;padding:10px;margin-top:8px;max-height:300px;overflow:auto;color:#2a2117";
      vb.onclick=async()=>{ if(pre.style.display==="none"){ if(!pre.textContent){const d=await api("/api/admin/inv/count/"+h.id);pre.textContent=d.order_text||"(no order)";} pre.style.display="block";vb.textContent="Hide order"; } else {pre.style.display="none";vb.textContent="View order";} };
      r.appendChild(vb);r.appendChild(pre);c2.appendChild(r);
    });
    b.appendChild(c2);

    // par / vendor editor
    const c3=card("Par levels & vendors","Par = how much to keep on hand; Order = Par − On hand. Set the vendor so each item routes to the right list — flip items you buy from PFG here.");
    const srch=inp("search","Filter items…");c3.appendChild(srch);
    const listWrap=el("div");listWrap.style.cssText="max-height:60vh;overflow:auto;margin-top:10px";c3.appendChild(listWrap);
    const edits={};
    function touch(i){edits[i.code]=edits[i.code]||{code:i.code,par:i.par,vendor:i.vendor,active:i.active};return edits[i.code];}
    function drawItems(){
      const q=(srch.value||"").toLowerCase();listWrap.innerHTML="";let cur=null;
      inv.items.filter(i=>!q||(i.name+" "+i.code+" "+(i.ims||"")).toLowerCase().includes(q)).forEach(i=>{
        if(i.cat!==cur){cur=i.cat;const h=el("div");h.textContent=cur;h.style.cssText="font:700 12px/1 Arial;letter-spacing:.08em;text-transform:uppercase;color:#b3a894;margin:14px 0 6px";listWrap.appendChild(h);}
        const row=el("div");row.style.cssText="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #eee5d8";
        const nm=el("div");nm.style.cssText="flex:1;min-width:0";nm.innerHTML='<div style="font-weight:600;font-size:14px">'+escH(i.name)+'</div><div class="muted small">'+(i.ims?escH(i.ims)+' · ':'')+escH(i.unit||'')+'</div>';
        const vs=sel([["shahs",VN.shahs],["rd",VN.rd],["pfg",VN.pfg],["other",VN.other]],i.vendor);vs.style.cssText="padding:7px;font-size:13px";
        const pi=inp("number","");pi.value=i.par;pi.min=0;pi.style.cssText="width:58px;text-align:center;font-weight:700";
        vs.onchange=()=>{touch(i).vendor=vs.value;};
        pi.oninput=()=>{touch(i).par=pi.value;};
        const pl=el("div");pl.style.cssText="text-align:center";pl.innerHTML='<div class="muted" style="font-size:9px;text-transform:uppercase;letter-spacing:.4px;font-weight:700">Par</div>';pl.appendChild(pi);
        row.appendChild(nm);row.appendChild(vs);row.appendChild(pl);listWrap.appendChild(row);
      });
    }
    srch.oninput=drawItems;drawItems();
    c3.appendChild(saveBtn("Save par & vendor changes",async()=>{
      const updates=Object.values(edits);if(!updates.length){toast("No changes to save");return;}
      await api("/api/admin/inv/items",{method:"POST",body:JSON.stringify({updates})});
      toast("Saved "+updates.length+" item(s)");for(const k in edits)delete edits[k];
    }));
    b.appendChild(c3);
  }

  function renderSettingsReload(){if(S.tab==="settings")show();}
  function card(title,desc){const c=el("div","setcard");c.innerHTML='<h3>'+title+'</h3>'+(desc?'<p>'+desc+'</p>':'');return c;}
  function field(lab,node){const f=el("div","field");const l=el("label",null,lab);f.appendChild(l);f.appendChild(node);return f;}
  function inp(type,ph){const i=el("input");i.type=type;if(ph)i.placeholder=ph;return i;}
  function sel(opts,val){const s=el("select");opts.forEach(([v,l])=>{const o=el("option",null,l);o.value=v;if(v===val)o.selected=true;s.appendChild(o);});return s;}
  function saveBtn(label,fn){const b=el("button","btn primary",label);b.onclick=async()=>{b.disabled=true;try{await fn();}finally{b.disabled=false;}};return b;}

  /* ---------- date helpers (local) ---------- */
  function toTimeInput(sec){const d=new Date(sec*1000);return pad2(d.getHours())+":"+pad2(d.getMinutes());}
  function toDateInput(sec){const d=new Date(sec*1000);return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());}
  function fromDateTime(dateStr,timeStr){const[y,m,d]=dateStr.split("-").map(Number);const[hh,mm]=timeStr.split(":").map(Number);return Math.floor(new Date(y,m-1,d,hh,mm,0,0).getTime()/1000);}
  function weekStartLocal(wk){const[y,m,d]=wk.split("-").map(Number);return new Date(y,m-1,d,0,0,0,0).getTime();}

  // Back arrow returns to the kiosk AND signs out of the manager console.
  const _bk=document.getElementById("backKiosk");
  if(_bk)_bk.addEventListener("click",()=>{try{sessionStorage.removeItem("tc_tok");}catch(e){}});

  boot();
})();
