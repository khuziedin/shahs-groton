(function () {
  var root = document.getElementById('root');

  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c];});}
  function r2(n){return Math.round((n||0)*100)/100;}
  function money(n){return '$'+(Math.round((n||0)*100)/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
  function money0(n){return '$'+Math.round(n||0).toLocaleString();}
  function clock(sec){return new Date(sec*1000).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}
  function ago(sec){var s=Math.max(0,Math.floor(Date.now()/1000)-sec),h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?(h+'h '+m+'m'):(m+'m');}

  function initials(name){
    var p=String(name||'').trim().split(/\s+/);
    return ((p[0]||'')[0]||'').toUpperCase()+((p[1]||'')[0]||'').toUpperCase();
  }
  var AVC=['#8a5a2b','#2f6d4f','#6d4a8a','#8a2f4a','#2f5d8a','#8a7a2f','#4a6d2f'];
  function avatar(ev,size){
    var cls='av'; var st=size?('style="width:'+size+'px;height:'+size+'px;font-size:'+Math.round(size*0.38)+'px"'):'';
    if(ev.photo) return '<img class="'+cls+'" '+st+' src="/data/photos/'+encodeURIComponent(ev.photo)+'" alt="">';
    var c=AVC[(String(ev.name||'').length)%AVC.length];
    return '<div class="'+cls+'" '+st+' style="'+(size?('width:'+size+'px;height:'+size+'px;font-size:'+Math.round(size*0.38)+'px;'):'')+'background:'+c+'">'+esc(initials(ev.name))+'</div>';
  }

  function greeting(){
    var h=new Date().getHours();
    return h<12?'Good morning':h<17?'Good afternoon':h<21?'Good evening':'Working late';
  }

  async function load(){
    var r, sres=null;
    try{ r=await fetch('/api/admin/dashboard',{credentials:'same-origin'}); }
    catch(e){ root.innerHTML='<div class="loading">Network error. <a style="color:#b06d10" href="/owner">Retry</a></div>'; return; }
    if(r.status===401){ location.href='/owner/login'; return; }
    if(!r.ok){ root.innerHTML='<div class="loading">Couldn\'t load ('+r.status+').</div>'; return; }
    try{ sres=await fetch('/api/sales/live',{credentials:'same-origin'}); }catch(e){}
    var sales=(sres&&sres.ok)? await sres.json().catch(function(){return null;}) : null;
    render(await r.json(), sales);
  }

  function salesCard(s){
    if(!s || !s.enabled) return '';
    var any = (s.channels||[]).some(function(c){return c.net!=null;});
    var h='<div class="card"><h2><span class="live"></span>Today’s sales'+(any?' · '+money0(s.total_net):'')+'</h2>';
    if(!any){
      h+='<div class="empty">Live feed isn’t connected yet. Keep your POS + DoorDash + Uber Eats + Grubhub dashboards open on the laptop and run the one-time feeder setup.</div></div>';
      return h;
    }
    (s.channels||[]).forEach(function(c){
      var val = c.net!=null ? money(c.net) : '<span style="color:#8a8072">—</span>';
      var sub = c.net!=null ? ('updated '+ago(c.updated)+(c.orders?(' · '+c.orders+' orders'):'')) : 'waiting…';
      h+='<div class="row"><div class="nm">'+esc(c.label)+'</div>'+
         '<div class="meta"><b style="color:#f4efe7">'+val+'</b><br><span style="font-size:11px">'+sub+'</span></div></div>';
    });
    h+='<div class="row" style="border-top:1px solid #2a241d;margin-top:4px;padding-top:10px">'+
       '<div class="nm"><b>Total net today</b></div>'+
       '<div class="meta"><b style="color:#58c27d;font-size:18px">'+money(s.total_net)+'</b>'+
       (s.total_gross?('<br><span style="font-size:11px">on '+money0(s.total_gross)+' gross</span>'):'')+'</div></div></div>';
    return h;
  }

  function render(d, sales){
    document.getElementById('greet').textContent=greeting();
    try{ document.getElementById('store').textContent=d.store||"Shah's Halal — Groton"; }catch(e){}

    var on=d.on_now||[], rows=d.rows||[], tot=d.totals||{}, warn=d.ot_warnings||[], recent=d.recent||[];
    var html='';
    html+=salesCard(sales);

    html+='<div class="card hero"><h2><span class="live"></span>On the clock · '+on.length+'</h2>';
    if(!on.length) html+='<div class="empty">Nobody is clocked in right now.</div>';
    else on.forEach(function(p){
      html+='<div class="person">'+avatar(p)+
        '<div class="nm">'+esc(p.name)+'</div>'+
        '<div class="meta"><b style="color:#f4efe7">'+ago(p.since)+'</b><br>since '+clock(p.since)+'</div></div>';
    });
    html+='</div>';

    html+='<div class="tiles">'+
      tile(r2(d.today_hours)+'h','Hours today')+
      tile(money0(d.today_labor),'Labor today','green')+
      tile(r2(tot.hrs)+'h','Hours this week')+
      tile(money0(tot.pay),'Labor this week','green')+
      '</div>';
    if(d.wages_placeholder) html+='<div class="note">Labor $ are estimates — set real wages in Manager → Team for exact numbers.</div>';

    if(d.compare){
      html+='<div class="card"><h2>Pace vs last week</h2>';
      html+=paceRow('This week so far', d.compare.wtd, 'at this point last week');
      html+=paceRow('Today so far', d.compare.today, 'same day last week');
      html+='</div>';
    }

    if(warn.length){
      html+='<div class="card"><h2>Overtime watch</h2>';
      warn.forEach(function(w){
        html+='<div class="row"><div class="nm">'+esc(w.name)+'</div><div class="meta">'+r2(w.hrs)+'h'+
          (w.ot>0?'<span class="chip ot">'+r2(w.ot)+'h OT</span>':'<span class="chip ot">near 40</span>')+'</div></div>';
      });
      html+='</div>';
    }

    html+='<div class="card"><h2>This week · '+esc(d.week)+'</h2>';
    var worked=rows.filter(function(r){return r.hrs>0||r.open_now;}).sort(function(a,b){return b.hrs-a.hrs;});
    if(!worked.length) html+='<div class="empty">No hours recorded yet this week.</div>';
    else worked.forEach(function(r){
      html+='<div class="row"><div class="nm">'+esc(r.name)+
        (r.open_now?'<span class="chip on">on now</span>':'')+
        (r.ot>0?'<span class="chip ot">'+r2(r.ot)+'h OT</span>':'')+
        '</div><div class="meta">'+r2(r.hrs)+'h · '+money(r.pay)+'</div></div>';
    });
    html+='</div>';

    if(recent.length){
      html+='<div class="card"><h2>Recent activity</h2>';
      recent.forEach(function(ev){
        html+='<div class="feed">'+avatar(ev,34)+
          '<div class="t">'+esc(ev.name)+' <span class="chip '+(ev.action==='in'?'in">clocked in':'out">clocked out')+'</span></div>'+
          '<div class="tm">'+clock(ev.ts)+'</div></div>';
      });
      html+='</div>';
    }

    html+='<div class="card"><h2>Open</h2><div class="links">'+
      '<a href="/schedule">Schedule</a>'+
      '<a href="/kiosk">Clock in / out</a>'+
      '<a href="/admin">Manager console</a>'+
      '<a href="/inventory">Inventory</a>'+
      '<a href="/admin#reports">Reports &amp; payroll</a>'+
      '<a href="/admin#photos">All photos</a>'+
      '</div></div>';

    html+='<div class="foot">Updated '+clock(Math.floor(Date.now()/1000))+' · auto-refreshes</div>';
    root.innerHTML=html;
  }

  function tile(n,l,cls){return '<div class="tile'+(cls?(' '+cls):'')+'"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>';}

  function delta(cur,prev){
    if(!prev||prev<=0) return (cur>0?'<span class="chip up">new</span>':'');
    var pct=Math.round((cur-prev)/prev*100);
    if(pct===0) return '<span class="chip flat">even</span>';
    var up=pct>0;
    return '<span class="chip '+(up?'up':'down')+'">'+(up?'▲':'▼')+' '+Math.abs(pct)+'%</span>';
  }
  function paceRow(label,c,sub){
    return '<div class="row">'+
      '<div><div class="nm">'+label+'</div>'+
        '<div class="meta" style="text-align:left;margin-top:2px">'+r2(c.hours)+'h · '+sub+' '+money0(c.prev_labor)+'</div></div>'+
      '<div style="text-align:right;white-space:nowrap"><b style="font-size:17px">'+money0(c.labor)+'</b><br>'+delta(c.labor,c.prev_labor)+'</div>'+
    '</div>';
  }

  document.getElementById('refresh').addEventListener('click',function(){root.innerHTML='<div class="loading">Loading…</div>';load();});
  document.getElementById('logout').addEventListener('click',function(){location.href='/owner/logout';});
  load();
  setInterval(load,30000);
})();
