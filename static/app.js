(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('map'), ctx = canvas.getContext('2d');
  let selectedFile = null, graph = null, nodes = new Map(), coords = new Map(), adj = new Map();
  let results = [], lat = 0.5, lon = 0.5, rad = 0.15, selectedId = null, route = [];
  let centerX = 49.5, centerY = 49.5, zoom = 1, drag = null, hasSearched = false;
  const minZoom = 0.8, maxZoom = 16;
  const fmt = n => Number(n).toFixed(6);
  const readError = async r => { const j = await r.json().catch(() => null); return j?.detail || `HTTP ${r.status}`; };
  const showError = message => { $('error').hidden = false; $('error').textContent = String(message); };
  const clearError = () => { $('error').hidden = true; };
  const setFile = f => { selectedFile = f; $('file-name').textContent = f?.name || 'Select link.txt'; $('file-hint').textContent = f ? `${(f.size / 1024).toFixed(1)} KB · Ready to search` : 'Required • Coordinate-pair connections'; };
  $('link').addEventListener('change', e => setFile(e.target.files[0] || null));
  // The sample link is provided by /IP/sample-link/ (not via static directory traversal).
  $('sample').onclick = async () => {
    clearError();
    try { const r = await fetch('/IP/sample-link/'); if (!r.ok) throw Error(await readError(r)); setFile(new File([await r.blob()], 'link.txt', {type:'text/plain'})); }
    catch (err) { showError(err.message); }
  };
  $('rad').addEventListener('input', () => { rad = Number($('rad').value); $('radius-label').textContent = rad.toFixed(3); $('stat-radius').textContent = rad.toFixed(3); draw(); });
  $('lat').addEventListener('input', () => { lat = Number($('lat').value); draw(); });
  $('long').addEventListener('input', () => { lon = Number($('long').value); draw(); });
  async function getGraph(file) {
    const form = new FormData(); form.append('link', file);
    const response = await fetch('/IP/map/', {method:'POST', body:form});
    if (!response.ok) throw Error(await readError(response));
    graph = await response.json();
    nodes = new Map(graph.nodes.map(n => [n[0], {id:n[0], y:n[1], x:n[2]}]));
    coords = new Map(graph.nodes.map(n => [`${n[1]},${n[2]}`, n[0]]));
    adj = new Map(graph.nodes.map(n => [n[0], []]));
    for (const [a,b] of graph.edges) { adj.get(a).push(b); adj.get(b).push(a); }
    $('stat-locations').textContent = graph.nodes.length.toLocaleString();
    $('stat-roads').textContent = graph.roads.toLocaleString();
  }
  function nearestNode() {
    let best = null, min = Infinity;
    for (const n of nodes.values()) { const d = Math.hypot(n.y / 99 - lat, n.x / 99 - lon); if (d < min || (d === min && n.id < best)) { min = d; best = n.id; } }
    return best;
  }
  function routeTo(target) {
    const source = nearestNode(); if (source == null || !adj.has(target)) return [];
    const queue=[source], prev=new Map([[source,null]]); let pos=0;
    while(pos<queue.length && !prev.has(target)) { const u=queue[pos++]; for(const v of adj.get(u)) if (!prev.has(v)) {prev.set(v,u);queue.push(v);} }
    if(!prev.has(target)) return [];
    const path=[]; for(let u=target; u!=null; u=prev.get(u)) path.push(u); return path.reverse();
  }
  const esc = x => String(x).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function renderResults() {
    $('stat-results').textContent = hasSearched ? results.length : '—';
    $('result-caption').textContent = hasSearched ? `${results.length} valid matches · Ranked by shortest road-path distance` : 'Submit a search to see the ranked locations.';
    $('export').disabled = !results.length;
    $('results-body').innerHTML = results.length ? results.map((r,i) => `<tr data-id="${r.id}" class="${r.id===selectedId?'selected':''}"><td><span class="rank-pill">#${i+1}</span></td><td><span class="location-id">${r.id}</span></td><td><span class="steps">${r.grid_distance} steps</span></td><td>${fmt(r.circular_distance)}</td><td><span class="trace">${r.id===selectedId?'● Showing route':'View route ↗'}</span></td></tr>`).join('') : `<tr><td class="empty" colspan="5">${hasSearched?'No matching reachable locations found.':'No search results yet. Choose a road network and run a search.'}</td></tr>`;
    $('results-body').querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => { selectedId=Number(tr.dataset.id); route=routeTo(selectedId); const dest=nodes.get(selectedId); if(dest){ centerX=dest.x;centerY=dest.y;zoom=Math.max(zoom,3.8); } renderResults(); draw(); }));
  }
  $('search-form').addEventListener('submit', async e => {
    e.preventDefault(); clearError();
    if (!selectedFile) {showError('Choose a road network text file, or click Use sample network.');return;}
    lat=Number($('lat').value);lon=Number($('long').value);rad=Number($('rad').value);
    $('submit').disabled=true;$('submit-label').textContent='Searching…';
    try {
      const form = new FormData(); form.append('lat',lat);form.append('long',lon);form.append('cat',$('cat').value);form.append('rad',rad);form.append('link',selectedFile);
      const response = await fetch('/IP/search/',{method:'POST',body:form}); if(!response.ok) throw Error(await readError(response));
      const json=await response.json();
      await getGraph(selectedFile);
      results=json.results || []; hasSearched=true;selectedId=null;route=[];centerX=lon*99;centerY=lat*99;zoom=2.9;
      $('map-state').textContent=`${graph.roads.toLocaleString()} roads · ${results.length} matches`;
      renderResults();draw();
    } catch(err) {showError(err.message);} finally{$('submit').disabled=false;$('submit-label').textContent='Find nearest 10';}
  });
  $('export').addEventListener('click',()=>{
    const text=['rank,id,road_steps,circular_distance',...results.map((r,i)=>`${i+1},${r.id},${r.grid_distance},${r.circular_distance}`)].join('\n');
    const url=URL.createObjectURL(new Blob([text],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download='nearest_locations.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  function viewport() { const w=canvas.clientWidth,h=canvas.clientHeight,s=Math.min(w,h)/106*zoom;return {w,h,s, project(x,y){return [w/2+(x-centerX)*s,h/2+(centerY-y)*s]}, unproject(x,y){return [centerX+(x-w/2)/s,centerY-(y-h/2)/s]}}; }
  function draw() {
    const {w,h,s,project,unproject}=viewport(); if(w<=0||h<=0)return;
    const dpr=Math.min(devicePixelRatio||1,2); if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#081522';ctx.fillRect(0,0,w,h);
    const [x0,y1]=unproject(-10,-10), [x1,y0]=unproject(w+10,h+10);
    const left=Math.max(0,Math.floor(x0)),right=Math.min(99,Math.ceil(x1)),bottom=Math.max(0,Math.floor(y0)),top=Math.min(99,Math.ceil(y1));
    if(s>=4){ctx.beginPath();ctx.strokeStyle='rgba(74,105,123,.11)';ctx.lineWidth=.7;for(let x=left;x<=right;x++){const [px]=project(x,0);ctx.moveTo(px,0);ctx.lineTo(px,h);}for(let y=bottom;y<=top;y++){const [,py]=project(0,y);ctx.moveTo(0,py);ctx.lineTo(w,py);}ctx.stroke();}
    const [cx,cy]=project(lon*99,lat*99);ctx.beginPath();ctx.arc(cx,cy,rad*99*s,0,Math.PI*2);ctx.fillStyle='rgba(62,209,176,.055)';ctx.fill();ctx.strokeStyle='rgba(82,219,188,.65)';ctx.setLineDash([6,6]);ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);
    if(graph){
      const edges=new Set();ctx.beginPath();ctx.strokeStyle='rgba(105,149,163,.43)';ctx.lineWidth=Math.max(.7,Math.min(1.5,s*.11));
      for(const [a,b] of graph.edges){const na=nodes.get(a),nb=nodes.get(b);if(!na||!nb)continue;if(Math.max(na.x,nb.x)<left||Math.min(na.x,nb.x)>right||Math.max(na.y,nb.y)<bottom||Math.min(na.y,nb.y)>top)continue;const [ax,ay]=project(na.x,na.y),[bx,by]=project(nb.x,nb.y);ctx.moveTo(ax,ay);ctx.lineTo(bx,by);if(s>=9)edges.add(a<b?`${a},${b}`:`${b},${a}`);}ctx.stroke();
      // Missing roads are neighbor pairs absent from the uploaded graph.
      if(s>=9){ctx.beginPath();ctx.strokeStyle='rgba(231,103,120,.42)';ctx.lineWidth=1.3;ctx.setLineDash([3,5]);for(let y=bottom;y<=top;y++)for(let x=left;x<=right;x++){const a=coords.get(`${y},${x}`);if(!a)continue;for(const [dx,dy] of [[1,0],[0,1]]){if(x+dx>99||y+dy>99)continue;const b=coords.get(`${y+dy},${x+dx}`);if(!b||edges.has(a<b?`${a},${b}`:`${b},${a}`))continue;const [ax,ay]=project(x,y),[bx,by]=project(x+dx,y+dy);ctx.moveTo(ax,ay);ctx.lineTo(bx,by);}}ctx.stroke();ctx.setLineDash([]);}
      if(s>=6){ctx.fillStyle='rgba(125,171,178,.6)';for(const n of nodes.values()){if(n.x<left||n.x>right||n.y<bottom||n.y>top)continue;const [px,py]=project(n.x,n.y);ctx.beginPath();ctx.arc(px,py,Math.min(1.85,s*.15),0,Math.PI*2);ctx.fill();}}
      if(route.length>1){ctx.beginPath();ctx.strokeStyle='#f7c978';ctx.lineWidth=3.5;ctx.lineJoin='round';ctx.lineCap='round';route.forEach((id,i)=>{const n=nodes.get(id);const [px,py]=project(n.x,n.y);if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);});ctx.stroke();}
      for(let i=0;i<results.length;i++){const n=nodes.get(results[i].id);if(!n)continue;const [px,py]=project(n.x,n.y);if(px<-20||px>w+20||py<-20||py>h+20)continue;ctx.beginPath();ctx.arc(px,py,results[i].id===selectedId?9:6,0,Math.PI*2);ctx.fillStyle=results[i].id===selectedId?'#ffd37b':'#52e6ae';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#092326';ctx.stroke();ctx.fillStyle='#06211d';ctx.font='bold 9px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(i+1,px,py);}
    }
    ctx.beginPath();ctx.arc(cx,cy,10,0,2*Math.PI);ctx.fillStyle='rgba(72,162,255,.25)';ctx.fill();ctx.beginPath();ctx.arc(cx,cy,5,0,2*Math.PI);ctx.fillStyle='#60b4ff';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#e6f6ff';ctx.stroke();
    $('zoom-label').textContent=`ZOOM ${zoom.toFixed(1)}×`;
  }
  function setZoom(z,anchorX=canvas.clientWidth/2,anchorY=canvas.clientHeight/2){const old=viewport().unproject(anchorX,anchorY);zoom=Math.max(minZoom,Math.min(maxZoom,z));const now=viewport().unproject(anchorX,anchorY);centerX+=old[0]-now[0];centerY+=old[1]-now[1];draw();}
  $('zoom-in').onclick=()=>setZoom(zoom*1.4);$('zoom-out').onclick=()=>setZoom(zoom/1.4);$('reset-view').onclick=()=>{centerX=49.5;centerY=49.5;zoom=1;draw();};
  canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();setZoom(zoom*(e.deltaY<0?1.18:1/1.18),e.clientX-r.left,e.clientY-r.top);},{passive:false});
  canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,cx:centerX,cy:centerY};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!drag)return;const s=viewport().s;centerX=drag.cx-(e.clientX-drag.x)/s;centerY=drag.cy+(e.clientY-drag.y)/s;draw();});
  canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
  window.addEventListener('resize',draw);draw();
  fetch('/health').then(r=>r.json()).then(d=>{$('api-state').textContent=`API online · ${Number(d.locations).toLocaleString()} locations`;}).catch(()=>{$('api-state').textContent='API unavailable';});
})();
