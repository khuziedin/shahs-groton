"use strict";
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const el=(t,c,txt)=>{const e=document.createElement(t);if(c)e.className=c;if(txt!=null)e.textContent=txt;return e;};
  const APP=$("#app");
  function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("show"),2200);}
  function todayISO(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}

  const S={pw:"",items:[],byId:{},cats:[],vnames:{},deadline:"Sunday",
           counts:{},overrides:{},countedBy:"",comment:"",date:todayISO(),
           cat:"All",q:"",showAll:false};

  const VNAME=(v)=>S.vnames[v]||v;
  function effPar(i){return Number(i.par)||0;}
  function onHand(id){const v=S.counts[id];return (v===""||v==null)?null:Number(v);}
  function suggest(i){const oh=onHand(i.code);if(oh==null)return null;return Math.max(0,Math.ceil(effPar(i)-oh));}
  function orderQty(i){if(S.overrides[i.code]!=null)return S.overrides[i.code];const s=suggest(i);return s==null?0:s;}
  function statusOf(i){const oh=onHand(i.code);if(oh==null)return "none";if(oh===0&&effPar(i)>0)return "out";return orderQty(i)>0?"order":"ok";}

  async function api(path,body){const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});return {status:r.status,json:await r.json().catch(()=>({}))};}

  /* ---------- gate ---------- */
  function renderGate(err){
    APP.innerHTML="";
    const g=el("div","gate");
    g.innerHTML='<div class="lock">🔒</div><h2>Inventory</h2><p>Enter the inventory password to start a count.</p>';
    const inp=el("input");inp.type="password";inp.inputMode="text";inp.placeholder="Password";inp.autocomplete="off";
    g.appendChild(inp);
    const msg=el("div","msg",err||"");g.appendChild(msg);
    const b=el("button","btn block","Unlock");
    const go=async()=>{b.disabled=true;
      const r=await api("/api/inv/unlock",{password:inp.value});
      b.disabled=false;
      if(r.status!==200||!r.json.ok){msg.textContent=(r.json&&r.json.error)||"Wrong password";inp.value="";inp.focus();return;}
      S.pw=inp.value; const j=r.json;
      S.items=j.items;S.byId={};j.items.forEach(i=>S.byId[i.code]=i);
      S.cats=j.cats;S.vnames=j.vnames;S.deadline=j.deadline||"Sunday";
      if(j.store){$("#storeSub").textContent=String(j.store).split("—")[0].trim();}
      renderCount();
    };
    b.onclick=go; inp.onkeydown=e=>{if(e.key==="Enter")go();};
    g.appendChild(b); APP.appendChild(g); setTimeout(()=>inp.focus(),80);
  }

  /* ---------- count ---------- */
  function visibleItems(){
    return S.items.filter(i=>{
      if(S.cat!=="All"&&i.cat!==S.cat)return false;
      if(!S.showAll){if(effPar(i)<=0&&onHand(i.code)==null)return false;}
      if(!i.active&&onHand(i.code)==null&&!S.showAll)return false;
      if(S.q){const s=(i.name+" "+i.code+" "+(i.ims||"")).toLowerCase();if(!s.includes(S.q))return false;}
      return true;
    });
  }
  function renderCount(){
    APP.innerHTML="";
    const w=el("div","wrap");
    // meta
    const meta=el("div","meta");
    const nf=el("div","fld name");nf.innerHTML='<label>Counted by</label>';
    const nameI=el("input");nameI.placeholder="Your name";nameI.value=S.countedBy;nameI.oninput=()=>S.countedBy=nameI.value;nf.appendChild(nameI);
    const df=el("div","fld");df.innerHTML='<label>Date</label>';
    const dI=el("input");dI.type="date";dI.value=S.date;dI.oninput=()=>S.date=dI.value;df.appendChild(dI);
    const dl=el("div","deadline","⏰ Deadline: "+S.deadline);
    meta.appendChild(nf);meta.appendChild(df);meta.appendChild(dl);w.appendChild(meta);
    // search + chips
    const sI=el("input","search");sI.placeholder="Search item or code…";sI.value=S.q;
    sI.oninput=()=>{S.q=sI.value.toLowerCase().trim();refreshList();};w.appendChild(sI);
    const chips=el("div","chips");["All",...S.cats].forEach(c=>{
      const b=el("button","chip"+(c===S.cat?" on":""),c);b.onclick=()=>{S.cat=c;renderCount();};chips.appendChild(b);
    });w.appendChild(chips);
    const tg=el("label","toggle");const cb=el("input");cb.type="checkbox";cb.checked=S.showAll;
    cb.onchange=()=>{S.showAll=cb.checked;refreshList();};tg.appendChild(cb);tg.appendChild(document.createTextNode(" Show all items (incl. par 0 / specialty)"));w.appendChild(tg);
    const prog=el("div","prog");prog.id="prog";w.appendChild(prog);
    const list=el("div");list.id="list";w.appendChild(list);
    APP.appendChild(w);
    // bottom bar
    const bar=el("div","bar");bar.innerHTML='<div class="counts" id="barCounts"></div>';
    const rev=el("button","btn","Review");rev.id="toReview";rev.onclick=()=>renderReview();bar.appendChild(rev);
    APP.appendChild(bar);
    refreshList();
  }
  function refreshList(){
    const items=visibleItems();const list=$("#list");let html="",cur=null,counted=0;
    items.forEach(i=>{
      if(i.cat!==cur){cur=i.cat;html+='<div class="cathead">'+cur+'</div>';}
      const oh=onHand(i.code),st=statusOf(i),s=suggest(i);if(oh!=null)counted++;
      let val;
      if(s==null)val='<span class="val none">—</span>';
      else if(st==="out")val='<span class="val out">OUT</span>';
      else val='<span class="val '+st+'">'+orderQty(i)+'</span>';
      html+='<div class="item s-'+st+'" data-id="'+i.code+'">'
        +'<div class="imain"><div class="inm">'+esc(i.name)+'</div><div class="isub">'
        +'<span class="vtag '+i.vendor+'">'+esc(VNAME(i.vendor))+'</span>'
        +(i.ims?'<span class="code">'+esc(i.ims)+'</span>':'')
        +'<span class="u">'+esc(i.unit||"")+'</span></div></div>'
        +'<div class="iright"><div class="sugg"><div class="lab">Order</div>'+val+'<div class="pn">par '+effPar(i)+'</div></div>'
        +'<div class="step"><button data-s="-1">−</button>'
        +'<input type="number" inputmode="numeric" class="'+(oh==null?'empty':'')+'" value="'+(oh==null?'':oh)+'" placeholder="?"><button data-s="1">+</button></div></div></div>';
    });
    if(!items.length)html='<div class="empty">No items match. Try another category or “Show all”.</div>';
    list.innerHTML=html;
    $("#prog").textContent=counted+" of "+items.length+" counted";
    list.querySelectorAll(".item").forEach(row=>{
      const id=row.dataset.id,inp=row.querySelector("input");
      inp.oninput=()=>{const v=inp.value.trim();S.counts[id]=v===""?"":Math.max(0,Number(v)||0);delete S.overrides[id];rowUpd(row,id);bar();};
      row.querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>{let c=onHand(id);c=c==null?0:c;c=Math.max(0,c+Number(b.dataset.s));S.counts[id]=c;inp.value=c;inp.classList.remove("empty");delete S.overrides[id];rowUpd(row,id);bar();});
    });
    bar();
  }
  function rowUpd(row,id){const i=S.byId[id],st=statusOf(i),s=suggest(i);row.className="item s-"+st;
    const sg=row.querySelector(".sugg");let val;
    if(s==null)val='<span class="val none">—</span>';else if(st==="out")val='<span class="val out">OUT</span>';else val='<span class="val '+st+'">'+orderQty(i)+'</span>';
    sg.innerHTML='<div class="lab">Order</div>'+val+'<div class="pn">par '+effPar(i)+'</div>';
    // update progress
    const items=visibleItems();let c=0;items.forEach(x=>{if(onHand(x.code)!=null)c++;});$("#prog").textContent=c+" of "+items.length+" counted";
  }
  function vendorTotals(){const t={shahs:0,rd:0,pfg:0,other:0};S.items.forEach(i=>{if(orderQty(i)>0)t[i.vendor]=(t[i.vendor]||0)+1;});return t;}
  function bar(){const t=vendorTotals();
    $("#barCounts").innerHTML='<div class="cnt shahs"><span class="n tnum">'+t.shahs+'</span><span class="l">Shah\'s</span></div>'
      +'<div class="cnt rd"><span class="n tnum">'+t.rd+'</span><span class="l">Rest. Depot</span></div>'
      +'<div class="cnt pfg"><span class="n tnum">'+t.pfg+'</span><span class="l">PFG</span></div>';
    const total=t.shahs+t.rd+t.pfg+t.other;const b=$("#toReview");b.disabled=total===0;b.textContent=total?"Review ("+total+")":"Nothing yet";
  }

  /* ---------- review ---------- */
  function renderReview(){
    APP.innerHTML="";const w=el("div","wrap");
    const back=el("button","btn ghost","← Back to count");back.style.marginBottom="12px";back.onclick=renderCount;w.appendChild(back);
    w.appendChild(Object.assign(el("div","sec-title","Order to place"),{}));
    const anyOut=S.items.some(i=>orderQty(i)>0&&onHand(i.code)===0);
    w.appendChild(el("div","sec-desc",anyOut?"⚠ Items marked Out are at zero — prioritize those.":"Check quantities, then submit. It emails the owner and saves to history."));
    const body=el("div");body.id="revBody";w.appendChild(body);
    const cmt=el("textarea","commentbox");cmt.placeholder="Order note (optional)…";cmt.value=S.comment;cmt.oninput=()=>S.comment=cmt.value;w.appendChild(cmt);
    const sub=el("button","btn block","Submit order");sub.onclick=()=>doSubmit(sub);w.appendChild(sub);
    APP.appendChild(w);
    drawReview();
  }
  function drawReview(){
    const body=$("#revBody");body.innerHTML="";
    const vends=["shahs","rd","pfg","other"];let any=false;
    vends.forEach(v=>{
      const items=S.items.filter(i=>i.vendor===v&&orderQty(i)>0)
        .sort((a,b)=>v==="shahs"?imsRank(a.ims)-imsRank(b.ims):(a.cat||"").localeCompare(b.cat||"")||a.name.localeCompare(b.name));
      if(!items.length)return;any=true;let est=0,rows="";
      items.forEach(i=>{const qty=orderQty(i),oh=onHand(i.code);const sub=(i.price!=null)?i.price*qty:null;if(sub!=null)est+=sub;
        const out=(oh===0);
        rows+='<div class="rl" data-id="'+i.code+'"><div class="rn"><div class="nm">'+esc(i.name)+(out?' <span class="badge out">Out</span>':'')+'</div>'
          +'<div class="mt">'+(i.ims?'<span class="code">'+esc(i.ims)+'</span>':(i.rd?'#'+esc(i.rd):''))+'<span>'+esc(i.unit||"")+'</span><span>on hand '+(oh==null?'?':oh)+' · par '+effPar(i)+'</span>'+(sub!=null?'<span>~$'+sub.toFixed(0)+'</span>':'')+'</div></div>'
          +'<div class="rq"><button data-r="-1">−</button><input type="number" inputmode="numeric" value="'+qty+'"><button data-r="1">+</button></div></div>';
      });
      const cz=v==="shahs"?"Type into ims.shahshalalfood.com":v==="rd"?"Buy at Restaurant Depot":v==="pfg"?"Send to PFG":"Other suppliers";
      const est_t=est>0?" · ~$"+est.toFixed(0):"";
      body.insertAdjacentHTML("beforeend",'<div class="vb"><div class="vh '+v+'"><div><h3>'+esc(VNAME(v))+'</h3><span class="cz">'+cz+'</span></div><div class="est">'+items.length+' items'+est_t+'</div></div>'+rows+'</div>');
    });
    if(!any)body.innerHTML='<div class="empty">Nothing to order. Go back and enter what\'s on hand.</div>';
    body.querySelectorAll(".rl").forEach(row=>{
      const id=row.dataset.id,inp=row.querySelector("input");
      const set=v=>{S.overrides[id]=Math.max(0,v);if(S.overrides[id]===0)delete S.overrides[id];drawReview();};
      inp.oninput=()=>{S.overrides[id]=Math.max(0,Number(inp.value)||0);};
      inp.onblur=()=>{if((Number(inp.value)||0)===0){delete S.overrides[id];drawReview();}};
      row.querySelector("[data-r='-1']").onclick=()=>set(orderQty(S.byId[id])-1);
      row.querySelector("[data-r='1']").onclick=()=>set(orderQty(S.byId[id])+1);
    });
  }
  function imsRank(c){return _rank(c);}
  const _rankCache={};
  function _rank(c){if(c in _rankCache)return _rankCache[c];const idx=IMS_ORDER.indexOf(c);return _rankCache[c]=(idx<0?9999:idx);}
  const IMS_ORDER=["S4","B5","Philly4","PhillyC","HW","SN","SSN","SSBCF","KK","SBCF","ShahsFF","SPPF","SHR","SHB","SH6","SHUM","Fish","Chu M","WSP","SHS","SGS","SFAL","SC","SO","L","TO","CU","RO","GP","SB5","SAT","WS","SSWS","PANINI","BBQ","ShahsR","RM","MAYOH4","ChickP","BB","Fry","Oil","K","PCK","PCBC","T","MG4","PK","WATER","SGO","SHAHSP","SHAHSL","F","N","MF","LF","1","1LID","GB46","WP","SWP","LWP","CW","BBB","CBB","FFC","SHFL","SNB","AHALF","ALID","SHAHSPB","SP","KN","Straw","FS","TRP","SLB","STGB","NMB","NSB","SFS","SBLG","BMG","SBXLG","SBC","GS","969","Bleach","SLC","MOPS","SWMC","FLP","WPP","ST","PICKLES","TP","SLG","SBBB","SFALP","TS","LJ","SALTG","CA","CS","SPW","GPS","SRCS","CHBBQ","KBWS","LPS","SFB","SPOP","SFSB","PM"];

  async function doSubmit(btn){
    const counts={};Object.keys(S.counts).forEach(k=>{if(S.counts[k]!==""&&S.counts[k]!=null)counts[k]=S.counts[k];});
    if(!Object.keys(counts).length){toast("Count at least one item first");return;}
    btn.disabled=true;btn.textContent="Submitting…";
    const r=await api("/api/inv/submit",{password:S.pw,counted_by:S.countedBy,comment:S.comment,counts,orders:S.overrides});
    btn.disabled=false;btn.textContent="Submit order";
    if(r.status!==200||!r.json.ok){toast((r.json&&r.json.error)||"Submit failed");return;}
    renderDone(r.json);
  }

  /* ---------- done ---------- */
  function renderDone(j){
    APP.innerHTML="";const w=el("div","done");
    const emailed=j.emailed;
    w.innerHTML='<div class="big">'+(emailed?"✅":"📋")+'</div><h2>Order submitted</h2>'
      +'<p>'+j.items+' item(s) to order'+(emailed?' — emailed to the owner.':'. (Saved; owner email not sent — check email setup.)')+'</p>';
    const pre=el("pre","out",j.order_text||"");w.appendChild(pre);
    const row=el("div");row.style.cssText="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px";
    const cp=el("button","btn ghost","Copy order");cp.onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(j.order_text).then(()=>toast("Copied")).catch(()=>toast("Select the text to copy"));};
    const nw=el("button","btn","New count");nw.onclick=()=>{S.counts={};S.overrides={};S.comment="";renderCount();};
    row.appendChild(cp);row.appendChild(nw);w.appendChild(row);
    APP.appendChild(w);
  }

  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

  renderGate();
})();
