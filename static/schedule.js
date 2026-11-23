// Shift scheduler + Kitchen/Front coverage. Owner/manager use.
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var root = $("#root"), ov = $("#ov");
  var AREA_COLORS = ["#f0a35e", "#58c27d", "#6aa6e0", "#c98ad0", "#e0c56a", "#e07a7a"];
  var DATA = null, WEEK = null;

  function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c];});}
  function toast(m){var t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove("show");},2000);}
  function hhmmToMin(s){try{var p=String(s).split(":");return (+p[0])*60+(+p[1]);}catch(e){return null;}}
  function minToHHMM(m){m=Math.round(m);return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");}
  function t12(min){var h=Math.floor(min/60),m=min%60,ap=h<12?"a":"p",hh=(h%12)||12;return hh+(m?":"+String(m).padStart(2,"0"):"")+ap;}
  function parseD(k){var p=k.split("-");return new Date(+p[0],+p[1]-1,+p[2]);}
  function keyOf(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
  function addDays(k,n){var d=parseD(k);d.setDate(d.getDate()+n);return keyOf(d);}
  function todayKey(){return keyOf(new Date());}
  var DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function dayShort(k){var d=parseD(k);return DOW[d.getDay()]+" · "+MON[d.getMonth()]+" "+d.getDate();}
  function dayLong(k){var d=parseD(k);return DOW[d.getDay()]+", "+MON[d.getMonth()]+" "+d.getDate();}

  function mergeIv(list){
    if(!list.length)return[];
    list=list.slice().sort(function(a,b){return a[0]-b[0];});
    var out=[list[0].slice()];
    for(var i=1;i<list.length;i++){var c=list[i],l=out[out.length-1];if(c[0]<=l[1])l[1]=Math.max(l[1],c[1]);else out.push(c.slice());}
    return out;
  }
  function gaps(merged,open,close){
    var g=[],cur=open;
    merged.forEach(function(s){var a=Math.max(s[0],open),b=Math.min(s[1],close);if(b<=open||a>=close)return;if(a>cur)g.push([cur,a]);cur=Math.max(cur,b);});
    if(cur<close)g.push([cur,close]);
    return g;
  }

  async function load(wk){
    root.innerHTML='<div class="loading">Loading…</div>';
    var r;
    try{ r=await fetch("/api/sched?week="+encodeURIComponent(wk),{credentials:"same-origin"}); }
    catch(e){ root.innerHTML='<div class="loading">Network error.</div>'; return; }
    if(r.status===401){ location.href="/owner/login"; return; }
    if(!r.ok){ root.innerHTML='<div class="loading">Couldn\'t load.</div>'; return; }
    DATA=await r.json(); WEEK=DATA.week;
    render();
  }

  function render(){
    try{ $("#store").textContent=DATA.store||"Shah's Halal — Groton"; }catch(e){}
    var days=DATA.days;
    $("#range").textContent=dayShort(days[0]).split(" · ")[1]+" – "+dayShort(days[6]).split(" · ")[1];
    var open=hhmmToMin(DATA.open), close=hhmmToMin(DATA.close), span=Math.max(1,close-open);
    var areas=DATA.areas, rate={}; DATA.employees.forEach(function(e){rate[e.id]=e.rate||0;});
    var byDay={}; days.forEach(function(d){byDay[d]=[];});
    DATA.shifts.forEach(function(s){ if(byDay[s.day]) byDay[s.day].push(s); });

    var html="";
    days.forEach(function(day){
      var ds=byDay[day].slice().sort(function(a,b){return a.start_min-b.start_min;});
      var totMin=0, labor=0;
      ds.forEach(function(s){var h=(s.end_min-s.start_min);totMin+=h;labor+=h/60*(rate[s.emp_id]||0);});
      var isToday=day===todayKey();
      html+='<div class="day'+(isToday?' today':'')+'">';
      html+='<div class="dhead"><div class="d">'+esc(dayShort(day))+(isToday?' · today':'')+'</div>'+
            '<div class="tot">'+(totMin/60).toFixed(1)+'h'+(labor>0?' · $'+Math.round(labor):'')+'</div></div>';

      // coverage per area
      html+='<div class="cov">';
      areas.forEach(function(area,ai){
        var col=AREA_COLORS[ai%AREA_COLORS.length];
        var ivs=ds.filter(function(s){return s.area===area;}).map(function(s){return [s.start_min,s.end_min];});
        var merged=mergeIv(ivs);
        var segs="";
        merged.forEach(function(sg){
          var a=Math.max(sg[0],open),b=Math.min(sg[1],close); if(b<=a)return;
          var l=(a-open)/span*100, w=(b-a)/span*100;
          segs+='<div class="seg" style="left:'+l.toFixed(2)+'%;width:'+w.toFixed(2)+'%;background:'+col+'"></div>';
        });
        html+='<div class="covrow"><div class="lbl" style="color:'+col+'">'+esc(area)+'</div><div class="track">'+segs+'</div></div>';
        var gp=gaps(merged,open,close);
        if(!ivs.length) html+='<div class="gaptxt" style="color:#8a8072">No one scheduled</div>';
        else if(gp.length) html+='<div class="gaptxt">Gap '+gp.map(function(g){return t12(g[0])+"–"+t12(g[1]);}).join(", ")+'</div>';
        else html+='<div class="oktxt">Covered '+t12(open)+"–"+t12(close)+'</div>';
      });
      html+='<div class="ticks"><span>'+t12(open)+'</span><span>'+t12(open+Math.round(span/2))+'</span><span>'+t12(close)+'</span></div>';
      html+='</div>';

      // shifts
      if(!ds.length) html+='<div class="none">No shifts yet.</div>';
      else ds.forEach(function(s){
        var ai=areas.indexOf(s.area); var col=AREA_COLORS[(ai<0?0:ai)%AREA_COLORS.length];
        html+='<div class="shift" data-id="'+s.id+'" data-day="'+day+'">'+
          '<span class="dot" style="background:'+col+'"></span>'+
          '<span class="nm">'+esc(s.name)+'</span>'+
          '<span class="ar" style="color:'+col+'">'+esc(s.area)+'</span>'+
          '<span class="tm">'+t12(s.start_min)+"–"+t12(s.end_min)+'</span></div>';
      });
      html+='<button class="addbtn" data-add="'+day+'">+ Add shift</button>';
      html+='</div>';
    });
    root.innerHTML=html;

    // wire
    Array.prototype.forEach.call(root.querySelectorAll(".shift"),function(el){
      el.onclick=function(){ var id=+el.getAttribute("data-id");
        var s=DATA.shifts.filter(function(x){return x.id===id;})[0];
        if(s) sheet(el.getAttribute("data-day"), s); };
    });
    Array.prototype.forEach.call(root.querySelectorAll(".addbtn"),function(el){
      el.onclick=function(){ sheet(el.getAttribute("data-add"), null); };
    });
  }

  function fld(label,inner){return '<div class="fld"><label>'+label+'</label>'+inner+'</div>';}
  function sel(id,opts,val){var o=opts.map(function(p){return '<option value="'+esc(p[0])+'"'+(String(p[0])===String(val)?' selected':'')+'>'+esc(p[1])+'</option>';}).join("");return '<select id="'+id+'">'+o+'</select>';}

  function sheet(day, s){
    var isEdit=!!s, emps=DATA.employees, areas=DATA.areas;
    var cur=s||{emp_id:emps[0]&&emps[0].id,area:areas[0]||"Kitchen",start_min:hhmmToMin(DATA.open),end_min:hhmmToMin(DATA.close),note:""};
    var h='<div class="sheet"><h3>'+(isEdit?"Edit shift":"Add shift")+' · '+esc(dayLong(day))+'</h3>';
    h+=fld("Person", sel("emp", emps.map(function(e){return [e.id,e.name];}), cur.emp_id));
    h+=fld("Area", sel("area", areas.map(function(a){return [a,a];}), cur.area));
    h+='<div class="two">'+fld("Start",'<input id="st" type="time" value="'+minToHHMM(cur.start_min)+'" step="900">')+
         fld("End",'<input id="en" type="time" value="'+minToHHMM(cur.end_min)+'" step="900">')+'</div>';
    h+=fld("Note (optional)",'<input id="note" type="text" maxlength="120" placeholder="e.g. prep, close" value="'+esc(cur.note||"")+'">');
    h+='<div class="srow">'+(isEdit?'<button class="btn del" id="del">Delete</button>':'')+'<button class="btn primary" id="save">Save</button></div></div>';
    ov.innerHTML=h; ov.classList.add("show");
    ov.onclick=function(e){ if(e.target===ov) close(); };
    $("#save").onclick=async function(){
      var body={id:isEdit?s.id:undefined,day:day,emp_id:+$("#emp").value,area:$("#area").value,
                start:$("#st").value,end:$("#en").value,note:$("#note").value};
      var r=await fetch("/api/sched/shift",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify(body)});
      var j=await r.json().catch(function(){return{};});
      if(r.ok&&j.ok){ close(); toast(isEdit?"Shift updated":"Shift added"); load(WEEK); }
      else toast(j.error||"Couldn't save");
    };
    if(isEdit) $("#del").onclick=async function(){
      var r=await fetch("/api/sched/shift/"+s.id,{method:"DELETE",credentials:"same-origin"});
      if(r.ok){ close(); toast("Shift removed"); load(WEEK); } else toast("Couldn't delete");
    };
  }
  function close(){ ov.classList.remove("show"); ov.innerHTML=""; }

  async function copyWeek(){
    if(!confirm("Copy last week's schedule onto this week? This replaces the current week's shifts."))return;
    var r=await fetch("/api/sched/copy",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({week:WEEK})});
    var j=await r.json().catch(function(){return{};});
    if(r.ok&&j.ok){ toast("Copied "+j.copied+" shifts"); load(WEEK); } else toast("Couldn't copy");
  }

  $("#prev").onclick=function(){ load(addDays(WEEK,-7)); };
  $("#next").onclick=function(){ load(addDays(WEEK,7)); };

  // inject a "copy last week" action under the header once data loads (stable element)
  var actions=document.createElement("div");
  // mount actions row at top of wrap after first render via delegation is overkill; add a floating action instead:
  var copyBtn=document.createElement("button");
  copyBtn.className="btn"; copyBtn.textContent="⧉ Copy last week";
  copyBtn.style.cssText="position:fixed;right:14px;bottom:88px;z-index:70;box-shadow:0 4px 14px rgba(0,0,0,.4)";
  copyBtn.onclick=copyWeek; document.body.appendChild(copyBtn);

  load(todayMonday());
  function todayMonday(){ var d=new Date(); var wd=(d.getDay()+6)%7; d.setDate(d.getDate()-wd); return keyOf(d); }
})();
