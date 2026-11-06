"use strict";
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const el=(t,c,txt)=>{const e=document.createElement(t);if(c)e.className=c;if(txt!=null)e.textContent=txt;return e;};
  const pad2=n=>String(n).padStart(2,"0");
  function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("show"),2600);}
  function hhmm(sec){return new Date(sec*1000).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});}
  function durClock(ms){const t=Math.max(0,Math.floor(ms/1000));const h=Math.floor(t/3600),m=Math.floor(t%3600/60);return h+"h "+pad2(m)+"m";}
  function initials(n){return (n||"?").split(" ").map(x=>x[0]).slice(0,2).join("").toUpperCase();}

  const S={state:null,pin:"",mode:"pad",emp:null,photoOn:false};

  async function api(path,opts){const r=await fetch(path,opts);return r.json();}

  async function load(){
    try{ S.state=await api("/api/state"); S.photoOn=!!S.state.photo_on_punch;
      $("#storeName").textContent=(S.state.store||"Shah's Halal").split("—")[0].trim();
      if(S.mode==="pad")renderPad(); renderRoster();
      if(S.photoOn)initCam();
    }catch(e){ $("#padCard").innerHTML='<div class="loading"><div style="font-size:30px">📡</div><div>Can\'t reach the time clock service. Make sure the app is running on this tablet.</div></div>'; }
  }

  /* ---- PIN pad ---- */
  function renderPad(){
    S.mode="pad"; const c=$("#padCard"); c.innerHTML="";
    const head=el("div","pad-head"); head.innerHTML='<h2>Enter your PIN</h2><span class="hint">Clock in &amp; out</span>'; c.appendChild(head);
    const disp=el("div","pindisp"); disp.id="pindisp";
    for(let i=0;i<4;i++){const d=el("div","pindot");if(i<S.pin.length)d.classList.add("on");disp.appendChild(d);}
    c.appendChild(disp);
    const msg=el("div","padmsg");msg.id="padmsg";c.appendChild(msg);
    const keys=el("div","keys");
    ["1","2","3","4","5","6","7","8","9","clear","0","go"].forEach(k=>{
      let b;
      if(k==="clear"){b=el("button","key alt","Clear");b.onclick=()=>{S.pin="";renderPad();};}
      else if(k==="go"){b=el("button","key go","Enter");b.onclick=submit;b.disabled=S.pin.length<3;}
      else{b=el("button","key",k);b.onclick=()=>{if(S.pin.length<6){S.pin+=k;renderPad();if(S.pin.length>=4)submit();}};}
      keys.appendChild(b);
    });
    c.appendChild(keys);
  }

  async function submit(){
    if(S.pin.length<3)return;
    let photo=null;
    if(S.photoOn)photo=grab();
    const res=await api("/api/punch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pin:S.pin,photo})});
    if(!res.ok){
      const d=$("#pindisp"); if(d){d.classList.add("err");setTimeout(()=>d.classList.remove("err"),400);}
      const m=$("#padmsg"); if(m)m.textContent=res.error||"Not recognized — try again or see the manager.";
      S.pin=""; setTimeout(()=>{if(S.mode==="pad")renderPad();},500); return;
    }
    S.pin=""; showDone(res.name,res.action==="in");
    load();
  }

  function showDone(name,wasIn){
    S.mode="done"; const c=$("#padCard"); c.innerHTML="";
    const d=el("div","done "+(wasIn?"in":"out"));
    d.innerHTML='<div class="ring">'+(wasIn
      ?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>'
      :'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>')
      +'</div><h2>'+(wasIn?"Clocked in":"Clocked out")+'</h2><p>'+name+" · "+hhmm(Date.now()/1000)+"</p>";
    c.appendChild(d);
    clearTimeout(S._t); S._t=setTimeout(()=>{S.mode="pad";renderPad();},3000);
  }

  function renderRoster(){
    const list=$("#onList"),cnt=$("#onCount");const on=(S.state&&S.state.roster)||[];
    cnt.textContent=on.length; list.innerHTML="";
    if(!on.length){list.innerHTML='<div class="emptyroster">No one is clocked in right now.</div>';return;}
    on.forEach(p=>{
      const r=el("div","onrow");
      // Who's clocked in only — no elapsed time shown on the kiosk.
      r.innerHTML='<div class="av">'+initials(p.name)+'</div><div class="nm">'+p.name+'</div><div class="dot-in" title="Clocked in"></div>';
      list.appendChild(r);
    });
  }

  function tick(){
    const n=new Date();
    $("#liveTime").textContent=n.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});
    $("#liveDate").textContent=n.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
    document.querySelectorAll("[data-since]").forEach(x=>{x.textContent=durClock(Date.now()-Number(x.dataset.since)*1000);});
  }

  /* ---- optional photo on punch ---- */
  let camStream=null;
  async function initCam(){
    try{ camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"}}); $("#cam").srcObject=camStream; }
    catch(e){ S.photoOn=false; }
  }
  function grab(){
    try{ const v=$("#cam"),cv=$("#canvas"); if(!v.videoWidth)return null;
      cv.width=320; cv.height=Math.round(320*v.videoHeight/v.videoWidth);
      cv.getContext("2d").drawImage(v,0,0,cv.width,cv.height); return cv.toDataURL("image/jpeg",0.6);
    }catch(e){return null;}
  }

  /* ---- keep screen awake (belt-and-suspenders with the kiosk app) ---- */
  async function keepAwake(){
    try{ if("wakeLock" in navigator){ const wl=await navigator.wakeLock.request("screen");
      document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")navigator.wakeLock.request("screen").catch(()=>{});});
    }}catch(e){}
  }

  tick(); setInterval(tick,1000);
  setInterval(renderRoster,30000);     // refresh elapsed/roster
  setInterval(load,60000);             // re-sync from server each minute
  keepAwake(); load();
})();
