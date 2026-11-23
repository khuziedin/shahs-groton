// Shift scheduler + Kitchen/Front staffing-level coverage. Owner only.
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var root = $("#root"), ov = $("#ov");
  var AREA_COLORS = ["#f0a35e", "#58c27d", "#6aa6e0", "#c98ad0", "#e0c56a", "#e07a7a"];
  var DATA = null, WEEK = null;

  function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c];});}
  function toast(m){var t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove("show");},2200);}
  function hhmmToMin(s){try{var p=String(s).split(":");return (+p[0])*60+(+p[1]);}catch(e){return null;}}
  function minToHHMM(m){m=Math.round(m);return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");}
  function t12(min){var h=Math.floor(min/60),m=min%60;if(h>=24)h-=24;var ap=h<12?"a":"p",hh=(h%12)||12;return hh+(m?":"+String(m).padStart(2,"0"):"")+ap;}
  function hexA(hex,a){var h=hex.replace("#","");return "rgba("+parseInt(h.substr(0,2),16)+","+parseInt(h.substr(2,2),16)+","+parseInt(h.substr(4,2),16)+","+a+")";}
  function parseD(k){var p=k.split("-");return new Date(+p[0],+p[1]-1,+p[2]);}
  function keyOf(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
  function addDays(k,n){var d=parseD(k);d.setDate(d.getDate()+n);return keyOf(d);}
  function todayKey(){return keyOf(new Date());}
  var DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function dayShort(k){var d=parseD(k);return DOW[d.getDay()]+" · "+MON[d.getMonth()]+" "+d.getDate();}
  function dayLong(k){var d=parseD(k);return DOW[d.getDay()]+", "+MON[d.getMonth()]+" "+d.getDate();}

  function levelSegs(ivs, open, close){
    var pset={}; pset[open]=1; pset[close]=1;
    ivs.forEach(function(iv){var a=Math.max(iv[0],open),b=Math.min(iv[1],close);if(b>a){pset[a]=1;pset[b]=1;}});
    var xs=Object.keys(pset).map(Number).sort(function(a,b){return a-b;});
    var segs=[];
    for(var i=0;i<xs.length-1;i++){var s=xs[i],e=xs[i+1];if(e<=s)continue;
      var c=0; ivs.forEach(function(iv){if(iv[0]<=s&&iv[1]>=e)c++;});
      segs.push([s,e,c]);
    }
    return segs;
  }

  async function load(wk, keep){
    var y = keep ? window.scrollY : 0;
    if(!keep) root.innerHTML='<div class="loading">Loading…</div>';
    var r;
    try{ r=await fetch("/api/sched?week="+encodeURIComponent(wk),{credentials:"same-origin"}); }
    catch(e){ root.innerHTML='<div class="loading">Network error.</div>'; return; }
    if(r.status===401){ location.href="/owner/login"; return; }
    if(!r.ok){ root.innerHTML='<div class="loading">Couldn\'t load.</div>'; return; }
    DATA=await r.json(); WEEK=DATA.week;
    render();
    if(keep) requestAnimationFrame(function(){ window.scrollTo(0,y); });
  }

  function render(){
    try{ $("#store").textContent=DATA.store||"Shah's Halal — Groton"; }catch(e){}
    var days=DATA.days;
    $("#range").textContent=MON[parseD(days[0]).getMonth()]+" "+parseD(days[0]).getDate()+" – "+MON[parseD(days[6]).getMonth()]+" "+parseD(days[6]).getDate();
    var open=hhmmToMin(DATA.open), closeWk=hhmmToMin(DATA.close), closeWe=hhmmToMin(DATA.close_wknd||"24:00");
    var areas=DATA.areas, rate={}, nameOf={};
    DATA.employees.forEach(function(e){rate[e.id]=e.rate||0;});
    var byDay={}; days.forEach(function(d){byDay[d]=[];});
    DATA.shifts.forEach(function(s){ if(byDay[s.day]) byDay[s.day].push(s); nameOf[s.emp_id]=s.name; });

    var html='<div class="topacts">'+
      '<button class="btn" id="copywk">⧉ Copy last week</button>'+
      '<button class="btn" id="emailwk">✉ Email week to staff</button></div>';

    days.forEach(function(day){
      var dd=parseD(day), wknd=(dd.getDay()===5||dd.getDay()===6), oClose=wknd?closeWe:closeWk;
      var ds=byDay[day].slice().sort(function(a,b){return a.start_min-b.start_min;});
      var totMin=0, labor=0, maxEnd=oClose;
      ds.forEach(function(s){totMin+=(s.end_min-s.start_min);labor+=(s.end_min-s.start_min)/60*(rate[s.emp_id]||0);if(s.end_min>maxEnd)maxEnd=s.end_min;});
      var dispClose=maxEnd, span=Math.max(1,dispClose-open);
      var isToday=day===todayKey();
      html+='<div class="day'+(isToday?' today':'')+'">';
      html+='<div class="dhead"><div class="d">'+esc(dayShort(day))+(isToday?' · today':'')+'</div>'+
            '<div class="tot">'+ds.length+(ds.length===1?' shift':' shifts')+' · '+(totMin/60).toFixed(1)+'h'+(labor>0?' · $'+Math.round(labor):'')+'</div></div>';

      html+='<div class="cov">';
      areas.forEach(function(area,ai){
        var col=AREA_COLORS[ai%AREA_COLORS.length];
        var ivs=ds.filter(function(s){return s.area===area;}).map(function(s){return [s.start_min,s.end_min];});
        var dispSegs=levelSegs(ivs,open,dispClose), peak=0, bars="";
        dispSegs.forEach(function(sg){
          if(sg[2]>peak)peak=sg[2];
          if(sg[2]<=0) return;
          var l=(sg[0]-open)/span*100, w=(sg[1]-sg[0])/span*100;
          var op=Math.min(1,0.42+0.22*(sg[2]-1));
          var lbl=w>6?'<span class="cnt">'+sg[2]+'</span>':'';
          bars+='<div class="seg" style="left:'+l.toFixed(2)+'%;width:'+w.toFixed(2)+'%;background:'+hexA(col,op)+'">'+lbl+'</div>';
        });
        // operating-close marker (shows where "close" is vs cleanup time)
        if(dispClose>oClose){ bars+='<div class="closemark" style="left:'+((oClose-open)/span*100).toFixed(2)+'%"></div>'; }
        html+='<div class="covrow"><div class="lbl" style="color:'+col+'">'+esc(area)+'</div><div class="track">'+bars+'</div></div>';
        var gapSegs=levelSegs(ivs,open,oClose).filter(function(s){return s[2]<=0;});
        if(!ivs.length) html+='<div class="gaptxt" style="color:#8a8072">No one scheduled</div>';
        else if(gapSegs.length) html+='<div class="gaptxt">Gap '+gapSegs.map(function(g){return t12(g[0])+"–"+t12(g[1]);}).join(", ")+' · peak '+peak+'</div>';
        else html+='<div class="oktxt">Covered '+t12(open)+"–"+t12(oClose)+' · up to '+peak+'</div>';
      });
      html+='<div class="ticks"><span>'+t12(open)+'</span><span>'+t12(open+Math.round(span/2))+'</span><span>'+t12(dispClose)+'</span></div>';
      html+='</div>';

      if(!ds.length) html+='<div class="none">No shifts yet.</div>';
      else ds.forEach(function(s){
        var ai=areas.indexOf(s.area); var col=AREA_COLORS[(ai<0?0:ai)%AREA_COLORS.length];
        html+='<div class="shift" data-id="'+s.id+'" data-day="'+day+'">'+
          '<span class="dot" style="background:'+col+'"></span>'+
          '<span class="nm">'+esc(s.name)+'</span>'+
          '<span class="ar" style="color:'+col+'">'+esc(s.area)+'</span>'+
          '<span class="tm">'+t12(s.start_min)+"–"+t12(s.end_min)+'</span></div>';
      });
      html+='<div class="dayacts"><button class="addbtn" data-add="'+day+'">+ Add shift</button>'+
            '<button class="cpbtn" data-cpday="'+day+'" title="Copy previous day">⧉ Yesterday</button></div>';
      html+='</div>';
    });

    // ---- week totals ----
    var perEmp={}, perArea={}, grandMin=0, grandLabor=0;
    DATA.shifts.forEach(function(s){
      var mins=s.end_min-s.start_min;
      perEmp[s.emp_id]=(perEmp[s.emp_id]||0)+mins;
      perArea[s.area]=(perArea[s.area]||0)+mins;
      grandMin+=mins; grandLabor+=mins/60*(rate[s.emp_id]||0);
    });
    var sumRows=Object.keys(perEmp).map(function(id){return {id:id,name:nameOf[id]||"—",mins:perEmp[id]};}).sort(function(a,b){return b.mins-a.mins;});
    html+='<div class="day summary"><div class="dhead"><div class="d">Week totals</div>'+
          '<div class="tot">'+(grandMin/60).toFixed(1)+'h'+(grandLabor>0?' · $'+Math.round(grandLabor):'')+'</div></div>';
    if(!sumRows.length) html+='<div class="none">No shifts scheduled this week.</div>';
    else sumRows.forEach(function(r){
      html+='<div class="sumrow"><div class="nm">'+esc(r.name)+'</div><div class="mt">'+(r.mins/60).toFixed(1)+'h'+
            (rate[r.id]?' · $'+Math.round(r.mins/60*rate[r.id]):'')+'</div></div>';
    });
    html+='<div class="arealine">'+areas.map(function(a,ai){return '<span style="color:'+AREA_COLORS[ai%AREA_COLORS.length]+'">'+esc(a)+' '+((perArea[a]||0)/60).toFixed(1)+'h</span>';}).join('')+'</div>';
    html+='</div>';

    root.innerHTML=html;

    $("#copywk").onclick=copyWeek; $("#emailwk").onclick=emailWeek;
    Array.prototype.forEach.call(root.querySelectorAll(".shift"),function(el){
      el.onclick=function(){var id=+el.getAttribute("data-id");var s=DATA.shifts.filter(function(x){return x.id===id;})[0];if(s)sheet(el.getAttribute("data-day"),s);};});
    Array.prototype.forEach.call(root.querySelectorAll(".addbtn"),function(el){
      el.onclick=function(){sheet(el.getAttribute("data-add"),null);};});
    Array.prototype.forEach.call(root.querySelectorAll(".cpbtn"),function(el){
      el.onclick=function(){copyDay(el.getAttribute("data-cpday"));};});
  }

  function fld(label,inner){return '<div class="fld"><label>'+label+'</label>'+inner+'</div>';}
  function sel(id,opts,val){var o=opts.map(function(p){return '<option value="'+esc(p[0])+'"'+(String(p[0])===String(val)?' selected':'')+'>'+esc(p[1])+'</option>';}).join("");return '<select id="'+id+'">'+o+'</select>';}

  function sheet(day, s){
    var isEdit=!!s, emps=DATA.employees, areas=DATA.areas;
    var cur=s||{emp_id:emps[0]&&emps[0].id,area:areas[0]||"Kitchen",start_min:hhmmToMin(DATA.open),end_min:hhmmToMin(DATA.close),note:""};
    var endInput = cur.end_min>=1440 ? minToHHMM(cur.end_min-1440) : minToHHMM(cur.end_min);
    var h='<div class="sheet"><h3>'+(isEdit?"Edit shift":"Add shift")+' · '+esc(dayLong(day))+'</h3>';
    h+=fld("Person", sel("emp", emps.map(function(e){return [e.id,e.name];}), cur.emp_id));
    h+=fld("Area", sel("area", areas.map(function(a){return [a,a];}), cur.area));
    h+='<div class="two">'+fld("Start",'<input id="st" type="time" value="'+minToHHMM(cur.start_min)+'" step="900">')+
         fld("End",'<input id="en" type="time" value="'+endInput+'" step="900">')+'</div>';
    h+='<div class="hint">Past midnight is fine — e.g. 5:00 PM start, 12:30 AM end counts as a close. Include cleanup time in the end time.</div>';
    h+=fld("Note (optional)",'<input id="note" type="text" maxlength="120" placeholder="e.g. prep, close" value="'+esc(cur.note||"")+'">');
    h+='<div class="srow">'+(isEdit?'<button class="btn del" id="del">Delete</button>':'')+'<button class="btn primary" id="save">Save</button></div></div>';
    ov.innerHTML=h; ov.classList.add("show");
    ov.onclick=function(e){ if(e.target===ov) close(); };
    $("#save").onclick=async function(){
      var body={id:isEdit?s.id:undefined,day:day,emp_id:+$("#emp").value,area:$("#area").value,start:$("#st").value,end:$("#en").value,note:$("#note").value};
      var r=await fetch("/api/sched/shift",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify(body)});
      var j=await r.json().catch(function(){return{};});
      if(r.ok&&j.ok){ close(); toast(isEdit?"Shift updated":"Shift added"); load(WEEK,true); }
      else toast(j.error||"Couldn't save");
    };
    if(isEdit) $("#del").onclick=async function(){
      var r=await fetch("/api/sched/shift/"+s.id,{method:"DELETE",credentials:"same-origin"});
      if(r.ok){ close(); toast("Shift removed"); load(WEEK,true); } else toast("Couldn't delete");
    };
  }
  function close(){ ov.classList.remove("show"); ov.innerHTML=""; }

  async function copyWeek(){
    if(!confirm("Copy last week's schedule onto this week? Replaces this week's shifts."))return;
    var r=await fetch("/api/sched/copy",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({week:WEEK})});
    var j=await r.json().catch(function(){return{};});
    if(r.ok&&j.ok){ toast("Copied "+j.copied+" shifts from last week"); load(WEEK,false); } else toast("Couldn't copy");
  }
  async function copyDay(day){
    if(!confirm("Copy the previous day's shifts onto "+dayLong(day)+"? Replaces that day."))return;
    var r=await fetch("/api/sched/copyday",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({day:day})});
    var j=await r.json().catch(function(){return{};});
    if(r.ok&&j.ok){ toast(j.copied?("Copied "+j.copied+" shifts"):"Previous day was empty"); load(WEEK,true); } else toast("Couldn't copy");
  }
  async function emailWeek(){
    if(!confirm("Email each person their shifts + hours for this week? (Only people with an email on file.)"))return;
    toast("Sending…");
    var r=await fetch("/api/sched/email",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({week:WEEK})});
    var j=await r.json().catch(function(){return{};});
    if(r.ok&&j.ok){ toast("Emailed "+j.sent+(j.skipped&&j.skipped.length?(" · "+j.skipped.length+" had no email"):"")); }
    else toast(j.error||"Couldn't send");
  }

  $("#prev").onclick=function(){ load(addDays(WEEK,-7),false); };
  $("#next").onclick=function(){ load(addDays(WEEK,7),false); };

  function todayMonday(){ var d=new Date(); var wd=(d.getDay()+6)%7; d.setDate(d.getDate()-wd); return keyOf(d); }
  load(todayMonday(),false);
})();
