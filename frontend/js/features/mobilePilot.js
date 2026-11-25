(() => {
  'use strict';
  const el=id=>document.getElementById(id);
  let token=sessionStorage.getItem('astirMobilePilotToken')||'',assets=[],structure=[],items=[],selected=null,busy=false,files=[],draftRequest=null;
  const status=text=>{el('pilotStatus').textContent=text;};
  const localNow=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
  const date=value=>value?new Date(value).toLocaleString('en-GB',{timeZone:'Europe/Athens'}):'—';
  const code=item=>item.kind==='TASK'?'TASK #'+(item.maintenance_task_id||'removed'):(item.breakdown_id||item.scheduled_maintenance_id)?item.kind+'-'+String(item.breakdown_id||item.scheduled_maintenance_id).padStart(5,'0'):item.kind+' (removed)';
  const athensFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function workLocal(value){const parts=Object.fromEntries(athensFormatter.formatToParts(new Date(value)).map(p=>[p.type,p.value]));return parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute;}
  function workInstant(value,reference){
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('Enter Work Start and Work End.');
    const candidates=['+02:00','+03:00'].map(offset=>new Date(value+offset)).filter(date=>Number.isFinite(date.getTime())&&workLocal(date)===value);
    if(!candidates.length)throw Error('Check the date/time in Greece.');
    if(candidates.length>1){const same=reference&&candidates.find(date=>Math.abs(date-new Date(reference))<60000);if(same)return same;throw Error('This time occurs twice at the clock change. Choose an unambiguous Start / End.');}
    return candidates[0];
  }
  let workEndReference=null;
  function readWorkTimes(){const start=workInstant(el('pilotWorkStart').value,selected?.work_started_at),end=workInstant(el('pilotWorkEnd').value,workEndReference);if(end<start)throw Error('Work End must be at or after Work Start.');if(end>Date.now())throw Error('Work End cannot be in the future.');return{start,end,minutes:Math.round((end-start)/60000)};}
  function showServiceTime(){try{const t=readWorkTimes();el('pilotServiceTime').textContent=t.minutes+' min';}catch(error){el('pilotServiceTime').textContent=error.message;}}
  function saveWorkTimes(){if(selected?.work_id)sessionStorage.setItem('astirMobilePilotTimes:'+selected.work_id,JSON.stringify({start:el('pilotWorkStart').value,end:el('pilotWorkEnd').value}));showServiceTime();}
  function show(id){for(const name of ['pilotLogin','pilotHome','pilotCreate','pilotDetail','pilotTaskQueue','pilotExistingDetail'])el(name).hidden=name!==id;window.scrollTo(0,0);}
  async function api(path,options={}){
    const headers={'X-Mobile-Pilot-Token':token,...options.headers};
    if(options.body&&!(options.body instanceof FormData))headers['Content-Type']='application/json';
    const response=await fetch(path,{...options,headers,cache:'no-store'});
    const data=await response.json().catch(()=>({error:'Unexpected server response.'}));
    if(!response.ok){const error=new Error(data.error||'Request failed.');error.status=response.status;error.field=data.field;if(response.status===401){token='';sessionStorage.removeItem('astirMobilePilotToken');show('pilotLogin');el('pilotLogout').hidden=true;}throw error;}
    return data;
  }
  function button(text,handler){
    const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=handler;return b;}

  function clearFiles(){
    files.forEach(x=>URL.revokeObjectURL(x.url));files=[];el('pilotDraftPhotos').replaceChildren();}

  function renderFiles(){
    el('pilotDraftPhotos').replaceChildren();for(const entry of files){const box=document.createElement('div');box.className='photo';const img=document.createElement('img');img.src=entry.url;img.alt=entry.file.name;box.append(img,button('Remove',()=>{URL.revokeObjectURL(entry.url);files=files.filter(x=>x!==entry);renderFiles();}));el('pilotDraftPhotos').appendChild(box);}}
  
  function addFiles(input){
    const additions=Array.from(input.files||[]);input.value='';const merged=[...files];for(const file of additions){if(merged.some(x=>x.file.name===file.name&&x.file.size===file.size&&x.file.lastModified===file.lastModified))continue;merged.push({file});}if(merged.length>5||merged.reduce((n,x)=>n+x.file.size,0)>8*1024*1024)return status('Select up to 5 photos, 8 MB total.');if(merged.some(x=>!['image/jpeg','image/png','image/webp'].includes(x.file.type)))return status('Use JPG, PNG or WebP images.');files=merged.map(x=>x.url?x:{...x,url:URL.createObjectURL(x.file)});renderFiles();}
  
  function renderAssets(){
    const chosen=el('pilotAsset').value,q=el('pilotAssetSearch').value.trim().toLowerCase();el('pilotAsset').replaceChildren(new Option('Select asset…',''));for(const a of assets){const label=[a.model,'SN '+a.serial_number,a.line].filter(Boolean).join(' · ');if(!q||label.toLowerCase().includes(q)||String(a.id)===chosen)el('pilotAsset').add(new Option(label,a.id));}el('pilotAsset').value=chosen;}
  
  function populateStructure(section='',unit=''){
    const asset=Number(el('pilotAsset').value),rows=structure.filter(x=>Number(x.asset_id)===asset);
    const sections=[...new Set(rows.map(x=>x.section).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'el'));
    el('pilotSection').replaceChildren(new Option(sections.length?'Select section…':'No sections — use full CMMS',''));
    for(const value of sections)el('pilotSection').add(new Option(value,value));
    el('pilotSection').value=sections.includes(section)?section:'';
    populateUnits(unit);
  }
  function populateUnits(unit=''){
    const units=[...new Set(structure.filter(x=>Number(x.asset_id)===Number(el('pilotAsset').value)&&x.section===el('pilotSection').value).map(x=>x.unit).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'el'));
    el('pilotUnit').replaceChildren(new Option('Select unit…',''));
    for(const value of units)el('pilotUnit').add(new Option(value,value));
    const hasSection=!!el('pilotSection').value;
    if(hasSection)el('pilotUnit').add(new Option('＋ New unit','__new__'));
    el('pilotUnit').value=units.includes(unit)?unit:hasSection&&(unit||!units.length)?'__new__':'';
    el('pilotNewUnit').value=units.includes(unit)?'':hasSection?unit:'';
    updateUnitMode();
  }
  function currentUnit(){return el('pilotUnit').value==='__new__'?el('pilotNewUnit').value.trim():el('pilotUnit').value;}
  function updateUnitMode(){const active=document.querySelector('[name="pilotKind"]:checked').value==='TASK'&&!!el('pilotSection').value&&el('pilotUnit').value==='__new__';el('pilotNewUnitGroup').hidden=!active;el('pilotNewUnit').disabled=!active;el('pilotNewUnit').required=active;}
  function updateKind(){const simple=document.querySelector('[name="pilotKind"]:checked').value==='TASK';el('pilotStructure').hidden=!simple;for(const id of ['pilotSection','pilotUnit']){el(id).required=simple;el(id).disabled=!simple;}updateUnitMode();el('pilotAt').required=!simple;el('pilotTiming').hidden=simple;el('pilotDescriptionGroup').hidden=simple;el('pilotAtLabel').textContent=document.querySelector('[name="pilotKind"]:checked').value==='SM'?'Scheduled start *':'Incident started *';}
  function saveFormDraft(){
    if(draftRequest)return;sessionStorage.setItem('astirMobilePilotForm',JSON.stringify({asset:el('pilotAsset').value,section:el('pilotSection').value,unit:currentUnit(),kind:document.querySelector('[name="pilotKind"]:checked').value,title:el('pilotTitle').value,at:el('pilotAt').value,description:el('pilotDescription').value}));}
  
  function restoreFormDraft(){
    try{const d=JSON.parse(sessionStorage.getItem('astirMobilePilotForm')||'null');if(!d)return;el('pilotAsset').value=d.asset;populateStructure(d.section,d.unit);el('pilotTitle').value=d.title||'';el('pilotAt').value=d.at||localNow();el('pilotDescription').value=d.description||'';document.querySelector('[name="pilotKind"][value="'+(['SM','TASK'].includes(d.kind)?d.kind:'BD')+'"]').checked=true;}catch{}}
  
  async function refresh(){
    const data=await api('/mobile-pilot-api/incidents');items=data.incidents;renderItems();}
  
  function renderItems(){
    const list=el('pilotItems');list.replaceChildren();if(!items.length){list.textContent='No pilot incidents yet.';return;}for(const item of items){const card=document.createElement('article');card.className='item';const badge=document.createElement('span');badge.className='badge '+(item.kind==='BD'?'bd':item.kind==='TASK'?'task':'sm');badge.textContent=code(item);const h=document.createElement('h3');h.textContent=item.title||'Incident unavailable';const meta=document.createElement('small');meta.textContent=[item.model,item.line,'Work: '+(item.work_completed_at||item.task_status==='Done'?'Done':item.work_id?'In progress':'Not started'),item.kind==='TASK'?null:item.kind+': '+item.incident_status].filter(Boolean).join(' · ');card.append(badge,h,meta,button(item.work_id?'Continue / View':'View / Start work',()=>openItem(item.id)));list.appendChild(card);}}
  async function bootstrap(){
    const data=await api('/mobile-pilot-api/bootstrap');assets=data.assets;structure=data.structure||[];el('pilotUser').textContent=data.user.name+' · Admin pilot';el('pilotLogout').hidden=false;await refresh();renderAssets();show('pilotHome');api('/mobile-pilot-api/existing-tasks?bucket=today').then(data=>existingCounts(data.counts)).catch(()=>{});}
  el('pilotLoginForm').onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;const submit=event.submitter;submit.disabled=true;status('Signing in…');try{const data=await api('/mobile-pilot-api/login',{method:'POST',body:JSON.stringify({access_key:el('pilotKey').value,remember:el('pilotRemember').checked})});token=data.token||'';if(token)sessionStorage.setItem('astirMobilePilotToken',token);else sessionStorage.removeItem('astirMobilePilotToken');el('pilotKey').value='';await bootstrap();status('');}catch(error){status(error.message);}finally{busy=false;submit.disabled=false;}};
  el('pilotLogout').onclick=async()=>{if(busy)return;try{await api('/mobile-pilot-api/logout',{method:'POST'});}catch(error){status(error.message);return;}token='';sessionStorage.removeItem('astirMobilePilotToken');for(const k of Object.keys(sessionStorage))if(k.startsWith('astirMobilePilot'))sessionStorage.removeItem(k);items=[];assets=[];selected=null;draftRequest=null;clearFiles();el('pilotNotes').value='';el('pilotCreateForm').reset();el('pilotItems').replaceChildren();el('pilotDetailHeading').replaceChildren();el('pilotDetailFacts').replaceChildren();el('pilotSavedPhotos').replaceChildren();el('pilotLogout').hidden=true;el('pilotUser').textContent='Admin mobile pilot';clearExistingUI();status('Signed out.');show('pilotLogin');};
  el('pilotNew').onclick=()=>{if(busy)return;status('');if(!draftRequest){el('pilotCreateForm').reset();el('pilotAt').value=localNow();el('pilotAssetSearch').value='';el('pilotDraftFields').disabled=false;renderAssets();populateStructure();restoreFormDraft();}else{el('pilotAssetSearch').value='';renderAssets();el('pilotAsset').value=draftRequest.asset_id;populateStructure(draftRequest.section,draftRequest.unit);el('pilotTitle').value=draftRequest.title;el('pilotDescription').value=draftRequest.description;const d=new Date(draftRequest.incident_at);el('pilotAt').value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);document.querySelector('[name="pilotKind"][value="'+draftRequest.kind+'"]').checked=true;el('pilotDraftFields').disabled=true;status('Retrying the previously submitted draft safely.');}updateKind();show('pilotCreate');};
  el('pilotCreateForm').addEventListener('input',saveFormDraft);el('pilotCreateForm').addEventListener('change',saveFormDraft);
  el('pilotAssetSearch').oninput=renderAssets;
  el('pilotAsset').onchange=()=>{populateStructure();saveFormDraft();};el('pilotSection').onchange=()=>{populateUnits();saveFormDraft();};el('pilotUnit').onchange=()=>{el('pilotNewUnit').value='';updateUnitMode();saveFormDraft();};
  document.querySelectorAll('[name="pilotKind"]').forEach(radio=>radio.onchange=updateKind);
  el('pilotTakePhoto').onclick=()=>el('pilotCamera').click();el('pilotChoosePhoto').onclick=()=>el('pilotFiles').click();el('pilotCamera').onchange=()=>addFiles(el('pilotCamera'));el('pilotFiles').onchange=()=>addFiles(el('pilotFiles'));
  el('pilotCreateBack').onclick=async()=>{if(busy)return;try{await refresh();show('pilotHome');status(draftRequest?'A submission may be pending. Check the list before retrying the same draft.':'');}catch(error){status(error.message);}};
  async function upload(id,selectedFiles){if(!selectedFiles.length)return;const data=new FormData();for(const file of selectedFiles)data.append('files',file);await api('/mobile-pilot-api/incidents/'+id+'/photos',{method:'POST',body:data});}
  el('pilotCreateForm').onsubmit=async event=>{
    event.preventDefault();if(busy)return;
    if(!draftRequest){if(!el('pilotCreateForm').reportValidity())return;const at=new Date(document.querySelector('[name="pilotKind"]:checked').value==='TASK'?Date.now():el('pilotAt').value);if(Number.isNaN(at.getTime()))return status('Check the date/time.');draftRequest={request_id:crypto.randomUUID(),asset_id:Number(el('pilotAsset').value),kind:document.querySelector('[name="pilotKind"]:checked').value,title:el('pilotTitle').value.trim(),description:document.querySelector('[name="pilotKind"]:checked').value==='TASK'?'':el('pilotDescription').value.trim(),incident_at:at.toISOString(),start_work:event.submitter?.dataset.start==='true',...(document.querySelector('[name="pilotKind"]:checked').value==='TASK'?{section:el('pilotSection').value,unit:currentUnit(),...(el('pilotUnit').value==='__new__'?{new_unit:true}:{})}:{})};sessionStorage.setItem('astirMobilePilotDraft',JSON.stringify(draftRequest));}
    busy=true;let savedId=null;el('pilotDraftFields').disabled=true;el('pilotSaveOnly').disabled=true;el('pilotSaveStart').disabled=true;status('Saving incident…');
    try{
      const result=await api('/mobile-pilot-api/incidents',{method:'POST',body:JSON.stringify(draftRequest)});const id=result.incident.id;savedId=id;
      if(draftRequest.kind==='TASK'&&!structure.some(x=>Number(x.asset_id)===draftRequest.asset_id&&x.section===draftRequest.section&&x.unit===draftRequest.unit))structure.push({asset_id:draftRequest.asset_id,section:draftRequest.section,unit:draftRequest.unit});
      draftRequest=null;sessionStorage.removeItem('astirMobilePilotDraft');sessionStorage.removeItem('astirMobilePilotForm');
      let photoMessage='';try{await upload(id,files.map(x=>x.file));}catch(error){photoMessage='Incident saved. Photos were not confirmed: '+error.message+' Check the Photos list before retrying.';}
      clearFiles();await refresh();await openItem(id);status(photoMessage||'Incident saved.');
    }catch(error){if(savedId){show(error.status===401?'pilotLogin':'pilotHome');status('Incident saved successfully. Sign in / refresh My work to continue. Do not create it again.');}else if(error.status&&error.status<500){draftRequest=null;sessionStorage.removeItem('astirMobilePilotDraft');el('pilotDraftFields').disabled=false;status(error.message);if(error.field==='section')el('pilotSection').focus();if(error.field==='unit')(el('pilotUnit').value==='__new__'?el('pilotNewUnit'):el('pilotUnit')).focus();}else status(error.message+' Retry to submit the SAME draft safely, or check My work.');}
    finally{busy=false;el('pilotSaveOnly').disabled=false;el('pilotSaveStart').disabled=false;}
  };
  async function loadPhotos(item){
    const list=el('pilotSavedPhotos');list.replaceChildren();
    try{
      const data=await api('/mobile-pilot-api/incidents/'+item.id+'/photos');
      if(selected?.id!==item.id)return;
      if(!data.attachments.length)list.textContent='No photos or attachments yet.';
      for(const file of data.attachments){
        const box=document.createElement('div');box.className='photo';
        try{
          const opened=await api('/attachments/'+file.id+'/open');
          if(selected?.id!==item.id)return;
          const link=document.createElement('a');link.href=opened.url;link.target='_blank';link.rel='noopener';
          if(file.mime_type?.startsWith('image/')){const img=document.createElement('img');img.src=opened.url;img.alt=file.file_name;link.appendChild(img);}else link.textContent=file.file_name;
          const name=document.createElement('small');name.textContent=file.file_name;box.append(link,name);
        }catch{const note=document.createElement('small');note.textContent=file.file_name+' — preview unavailable';box.appendChild(note);}
        if(selected?.id!==item.id)return;
        list.appendChild(box);
      }
    }catch(error){if(selected?.id===item.id)list.textContent=error.message;}
  }
  async function openItem(id){selected=items.find(x=>x.id===id);if(!selected)return;const item=selected;show('pilotDetail');const heading=el('pilotDetailHeading');heading.replaceChildren();const badge=document.createElement('span');badge.className='badge '+(item.kind==='BD'?'bd':item.kind==='TASK'?'task':'sm');badge.textContent=code(item);const h=document.createElement('h1');h.textContent=item.title||'Incident unavailable';heading.append(badge,h);const facts=el('pilotDetailFacts');facts.replaceChildren();for(const [label,value]of [['Asset',[item.model,'SN '+item.serial_number,item.line].join(' · ')],[item.kind==='TASK'?'Task status':'Incident status',item.incident_status],[item.kind==='BD'?'Incident started':'Scheduled start',date(item.kind==='BD'?item.incident_started_at:item.scheduled_start_at)],...(['TASK','BD'].includes(item.kind)?[['Section',item.section||'—'],['Unit',item.unit||'—']]:[]),...(item.kind==='BD'?[['BD restored at',date(item.incident_closed_at)]]:[]),['Your work started',date(item.work_started_at)],['Work completed',item.work_completed_at?date(item.work_completed_at):item.task_status==='Done'?'Completed from CMMS':'—']]){const row=document.createElement('div');row.className='fact';const name=document.createElement('span'),val=document.createElement('strong');name.textContent=label;val.textContent=value;row.append(name,val);facts.appendChild(row);}fillBDLocation(item);const complete=!!item.work_completed_at||item.task_status==='Done';el('pilotRestoreSection').hidden=!(item.kind==='BD'&&item.work_completed_at&&item.task_status==='Done'&&['OPEN','IN_PROGRESS'].includes(item.incident_status));el('pilotRestoredAt').value=workLocal(item.work_completed_at||item.task_completed_at||new Date());el('pilotRestoredConfirm').checked=false;el('pilotDownPreview').textContent=item.work_completed_at&&item.work_started_at?'Downtime on close: '+Math.round((new Date(item.work_completed_at)-new Date(item.work_started_at))/60000)+' min (same as service time).':'';el('pilotWorkControls').hidden=!item.work_id||!item.task_id||complete;el('pilotComplete').hidden=!item.work_id||!item.task_id||complete;el('pilotStart').hidden=!!item.work_id||!item.incident_status||['CLOSED','Done','Cancelled'].includes(item.incident_status);el('pilotNotes').value=sessionStorage.getItem('astirMobilePilotNotes:'+item.work_id)??item.notes??'';workEndReference=item.work_completed_at||new Date().toISOString();el('pilotWorkStart').value=item.work_started_at?workLocal(item.work_started_at):'';el('pilotWorkEnd').value=workLocal(workEndReference);
    if(!complete&&item.work_id){try{const saved=JSON.parse(sessionStorage.getItem('astirMobilePilotTimes:'+item.work_id)||'null');if(saved){el('pilotWorkStart').value=saved.start;el('pilotWorkEnd').value=saved.end;}}catch{}}
    showServiceTime();el('pilotMorePhotos').value='';await loadPhotos(item);}
  el('pilotNotes').oninput=()=>{if(selected?.work_id)sessionStorage.setItem('astirMobilePilotNotes:'+selected.work_id,el('pilotNotes').value);};
  el('pilotDetailBack').onclick=async()=>{if(busy)return;try{await refresh();show('pilotHome');status('');}catch(error){status(error.message);}};
  el('pilotRefresh').onclick=async()=>{if(busy)return;try{await refresh();status('Updated.');}catch(error){status(error.message);}};
  async function run(button,operation){if(busy||!selected)return;busy=true;button.disabled=true;status('Saving…');try{await operation();await refresh();await openItem(selected.id);status('Saved.');}catch(error){status(error.message);}finally{busy=false;button.disabled=false;}}
  el('pilotStart').onclick=()=>run(el('pilotStart'),()=>api('/mobile-pilot-api/incidents/'+selected.id+'/start-work',{method:'POST'}));
  el('pilotSaveNotes').onclick=()=>run(el('pilotSaveNotes'),()=>api('/mobile-pilot-api/work/'+selected.work_id+'/notes',{method:'PATCH',body:JSON.stringify({notes:el('pilotNotes').value})}));
  el('pilotWorkStart').oninput=saveWorkTimes;el('pilotWorkEnd').oninput=saveWorkTimes;
  function fillBDLocation(item){
    el('pilotBDLocation').hidden=item.kind!=='BD';let saved;try{saved=JSON.parse(sessionStorage.getItem('astirMobilePilotBDLocation:'+item.id)||'null');}catch{}
    const section=saved?.section||item.section||'',unit=saved?.unit||item.unit||'';
    const sections=[...new Set(structure.filter(x=>Number(x.asset_id)===Number(item.asset_id)).map(x=>x.section).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'el'));
    el('pilotBDSection').replaceChildren(new Option('Select section…',''));for(const value of sections)el('pilotBDSection').add(new Option(value,value));el('pilotBDSection').value=sections.includes(section)?section:'';fillBDUnits(unit);
  }
  function fillBDUnits(unit=''){
    const section=el('pilotBDSection').value,units=[...new Set(structure.filter(x=>Number(x.asset_id)===Number(selected?.asset_id)&&x.section===section).map(x=>x.unit).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'el'));
    el('pilotBDUnit').replaceChildren(new Option('Select unit…',''));for(const value of units)el('pilotBDUnit').add(new Option(value,value));if(section)el('pilotBDUnit').add(new Option('＋ New unit','__new__'));el('pilotBDUnit').value=units.includes(unit)?unit:section&&(unit||!units.length)?'__new__':'';el('pilotBDNewUnit').value=units.includes(unit)?'':section?unit:'';el('pilotBDNewUnitGroup').hidden=el('pilotBDUnit').value!=='__new__';
  }
  function bdLocation(){return{section:el('pilotBDSection').value,unit:el('pilotBDUnit').value==='__new__'?el('pilotBDNewUnit').value.trim():el('pilotBDUnit').value,new_unit:el('pilotBDUnit').value==='__new__'};}
  function saveBDLocation(){if(selected?.kind==='BD')sessionStorage.setItem('astirMobilePilotBDLocation:'+selected.id,JSON.stringify(bdLocation()));}
  el('pilotBDSection').onchange=()=>{fillBDUnits();saveBDLocation();};el('pilotBDUnit').onchange=()=>{el('pilotBDNewUnit').value='';el('pilotBDNewUnitGroup').hidden=el('pilotBDUnit').value!=='__new__';saveBDLocation();};el('pilotBDNewUnit').oninput=saveBDLocation;
  el('pilotComplete').onclick=()=>{
    let times;try{times=readWorkTimes();}catch(error){status(error.message);return;}
    const location=selected?.kind==='BD'?bdLocation():null;if(location&&(!location.section||!location.unit))return status('Select Section and Unit for this work.');
    const body={notes:el('pilotNotes').value,work_started_at:times.start.toISOString(),work_ended_at:times.end.toISOString(),...(location||{})};
    return run(el('pilotComplete'),async()=>{await api('/mobile-pilot-api/work/'+selected.work_id+'/complete',{method:'POST',body:JSON.stringify(body)});sessionStorage.removeItem('astirMobilePilotNotes:'+selected.work_id);sessionStorage.removeItem('astirMobilePilotTimes:'+selected.work_id);sessionStorage.removeItem('astirMobilePilotBDLocation:'+selected.id);if(location&&!structure.some(x=>Number(x.asset_id)===Number(selected.asset_id)&&x.section===location.section&&x.unit===location.unit))structure.push({asset_id:selected.asset_id,section:location.section,unit:location.unit});});
  };
  el('pilotRestore').onclick=()=>{
    if(!selected||selected.kind!=='BD')return;
    if(!el('pilotRestoredConfirm').checked)return status('Confirm that the asset is restored.');
    let at;try{at=workInstant(el('pilotRestoredAt').value,selected.work_completed_at||selected.task_completed_at);if(at>Date.now())throw Error('Restored At cannot be in the future.');}catch(error){status(error.message);return;}
    return run(el('pilotRestore'),()=>api('/mobile-pilot-api/incidents/'+selected.id+'/restore',{method:'POST',body:JSON.stringify({closed_at:at.toISOString(),restored:true})}));
  };
  el('pilotUploadPhotos').onclick=()=>{const selectedFiles=Array.from(el('pilotMorePhotos').files||[]);if(!selectedFiles.length)return status('Select a photo first.');if(selectedFiles.length>5||selectedFiles.reduce((n,f)=>n+f.size,0)>8*1024*1024)return status('Up to 5 photos, 8 MB total.');return run(el('pilotUploadPhotos'),()=>upload(selected.id,selectedFiles));};
  window.addEventListener('beforeunload',event=>{if(busy||files.length){event.preventDefault();event.returnValue='';}});
  try{draftRequest=JSON.parse(sessionStorage.getItem('astirMobilePilotDraft')||'null');}catch{}
  /* Existing CMMS tasks: separate from creation / BD / SM pilot work. */
  let existingBucket='today',existingAsset=null,existingTask=null,existingEndReference=null;
  const existingKey=(name,id)=>'astirMobilePilotExisting:'+name+':'+id;
  function existingCounts(counts){for(const key of ['today','overdue','in_progress'])el('pilotQueueCount_'+key).textContent=String(counts?.[key]??0);}
  async function loadExistingQueue(bucket=existingBucket,assetId=null){
    const data=await api('/mobile-pilot-api/existing-tasks?bucket='+encodeURIComponent(bucket)+(assetId?'&asset_id='+Number(assetId):''));
    existingBucket=bucket;existingAsset=assetId;existingTask=null;for(const key of ['today','overdue','in_progress'])el('pilotQueueTab_'+key).setAttribute('aria-pressed',String(key===bucket));existingCounts(data.counts);show('pilotTaskQueue');
    el('pilotQueueHeading').textContent=bucket==='in_progress'?'In Progress':bucket==='overdue'?'Overdue work':'Today’s work';
    el('pilotQueueAssetsBack').hidden=!assetId;const list=el('pilotQueueItems');list.replaceChildren();
    const records=data.assets||data.tasks||[];
    if(!records.length){list.textContent='No '+(bucket==='in_progress'?'active work sessions':'matching tasks')+'.';return;}
    for(const record of records){const card=document.createElement('article');card.className='item';const h=document.createElement('h3'),meta=document.createElement('small');
      if(data.assets){h.textContent=record.model;meta.textContent=['SN '+record.serial_number,record.line,record.task_count+' tasks'].filter(Boolean).join(' · ');card.append(h,meta,button('View tasks',()=>existingAction(()=>loadExistingQueue(bucket,record.asset_id))));}
      else{h.textContent='Task #'+record.id+' · '+record.task;meta.textContent=[record.model,record.serial_number,record.line,[record.section,record.unit].filter(Boolean).join(' / '),'Due: '+date(record.due_date)].filter(Boolean).join(' · ');card.append(h,meta);
        if(record.available===false){const warning=document.createElement('p');warning.className='hint';warning.textContent='Changed or completed in CMMS. This session cannot create another execution.';card.append(warning,button('Dismiss changed session',()=>existingAction(async()=>{await api('/mobile-pilot-api/existing-work/'+record.work_id+'/dismiss',{method:'POST'});await loadExistingQueue();})));}
        else card.append(button(record.work_id?'Resume work':'View task',()=>existingAction(()=>openExistingTask(record.id))));
      }list.append(card);
    }
  }
  async function existingAction(operation){if(busy)return;busy=true;const controls=[...document.querySelectorAll('#pilotTaskQueue button,#pilotExistingDetail button,#pilotExistingDetail input,#pilotExistingDetail textarea')].map(control=>[control,control.disabled]);for(const [control]of controls)control.disabled=true;status('Loading…');try{await operation();}catch(error){status(error.message);}finally{for(const [control,disabled]of controls)control.disabled=disabled;busy=false;if(el('pilotStatus').textContent==='Loading…')status('');}}
  for(const bucket of ['today','overdue','in_progress']){
    el('pilotQueueOpen_'+bucket).onclick=()=>existingAction(()=>loadExistingQueue(bucket));
    el('pilotQueueTab_'+bucket).onclick=()=>existingAction(()=>loadExistingQueue(bucket));
  }
  el('pilotQueueBack').onclick=()=>{if(!busy){existingTask=null;show('pilotHome');status('');}};
  el('pilotQueueAssetsBack').onclick=()=>existingAction(()=>loadExistingQueue(existingBucket));
  el('pilotQueueRefresh').onclick=()=>existingAction(()=>loadExistingQueue(existingBucket,existingAsset));
  el('pilotExistingBack').onclick=()=>existingAction(()=>loadExistingQueue(existingBucket,existingAsset));
  function clearExistingUI(){existingTask=null;el('pilotExistingFacts').replaceChildren();el('pilotExistingAttachments').replaceChildren();el('pilotQueueItems').replaceChildren();el('pilotExistingNotes').value='';}
  async function openExistingTask(id){
    const data=await api('/mobile-pilot-api/existing-tasks/'+Number(id));existingTask=data.task;const task=existingTask;
    el('pilotExistingTitle').textContent='Task #'+task.id+' · '+task.task;
    const facts=el('pilotExistingFacts');facts.replaceChildren();
    for(const [label,value]of [['Asset',[task.model,'SN '+task.serial_number,task.line].filter(Boolean).join(' · ')],['Section / Unit',[task.section,task.unit].filter(Boolean).join(' / ')||'—'],['Type',Number(task.frequency_hours)>0?'Preventive':'Planned'],['Due',date(task.due_date)],['Instructions / current notes',task.notes||'—']]){const row=document.createElement('div');row.className='fact';const name=document.createElement('span'),text=document.createElement('strong');name.textContent=label;text.textContent=value;row.append(name,text);facts.append(row);}
    const active=!!task.work_id,available=task.work_available!==false;
    el('pilotExistingStart').hidden=active;el('pilotExistingControls').hidden=!active||!available;el('pilotExistingComplete').hidden=!active||!available;el('pilotExistingDismiss').hidden=!active||available;
    el('pilotExistingWarning').textContent=available?'':'This task changed after Start. Dismiss this session and review the current task.';
    existingEndReference=new Date().toISOString();el('pilotExistingWorkStart').value=active?workLocal(task.work_started_at):'';el('pilotExistingWorkEnd').value=workLocal(existingEndReference);el('pilotExistingNotes').value=active?(sessionStorage.getItem(existingKey('notes',task.work_id))??task.work_notes??''):'';
    if(active){try{const saved=JSON.parse(sessionStorage.getItem(existingKey('times',task.work_id))||'null');if(saved){el('pilotExistingWorkStart').value=saved.start;el('pilotExistingWorkEnd').value=saved.end;}}catch{}}
    existingDuration();el('pilotExistingFiles').value='';show('pilotExistingDetail');await existingAttachments(task.id);
  }
  function existingTimes(){const start=workInstant(el('pilotExistingWorkStart').value,existingTask?.work_started_at),end=workInstant(el('pilotExistingWorkEnd').value,existingEndReference);if(end<start)throw Error('Work End must be at or after Work Start.');if(end>Date.now())throw Error('Work End cannot be in the future.');return{start,end,minutes:Math.round((end-start)/60000)};}
  function existingDuration(){try{el('pilotExistingServiceTime').textContent=existingTimes().minutes+' min';}catch{el('pilotExistingServiceTime').textContent='—';}}
  function existingSaveTimes(){if(existingTask?.work_id)sessionStorage.setItem(existingKey('times',existingTask.work_id),JSON.stringify({start:el('pilotExistingWorkStart').value,end:el('pilotExistingWorkEnd').value}));existingDuration();}
  el('pilotExistingWorkStart').oninput=existingSaveTimes;el('pilotExistingWorkEnd').oninput=existingSaveTimes;
  el('pilotExistingNotes').oninput=()=>{if(existingTask?.work_id)sessionStorage.setItem(existingKey('notes',existingTask.work_id),el('pilotExistingNotes').value);};
  el('pilotExistingSaveNotes').onclick=()=>existingAction(async()=>{if(!existingTask?.work_id)return;await api('/mobile-pilot-api/existing-work/'+existingTask.work_id+'/notes',{method:'PATCH',body:JSON.stringify({notes:el('pilotExistingNotes').value})});status('Notes saved.');});
  el('pilotExistingStart').onclick=()=>existingAction(async()=>{
    const task=existingTask;if(!task)return;const key=existingKey('start',task.id);let request;try{request=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}
    if(!request||JSON.stringify(request.task_snapshot)!==JSON.stringify(task.task_snapshot)||String(request.last_execution_id)!==String(task.last_execution_id))request={request_id:crypto.randomUUID(),task_snapshot:task.task_snapshot,last_execution_id:task.last_execution_id};
    sessionStorage.setItem(key,JSON.stringify(request));const saved=await api('/mobile-pilot-api/existing-tasks/'+task.id+'/start',{method:'POST',body:JSON.stringify(request)});
    if(saved.work?.invalidated_at){sessionStorage.removeItem(key);throw Error('The old session was dismissed. Refresh the task and Start again.');}
    sessionStorage.removeItem(key);await openExistingTask(task.id);
  });
  el('pilotExistingComplete').onclick=()=>{
    let times;try{times=existingTimes();}catch(error){status(error.message);return;}
    const task=existingTask;if(!task?.work_id)return;const body={notes:el('pilotExistingNotes').value,work_started_at:times.start.toISOString(),work_ended_at:times.end.toISOString()};
    return existingAction(async()=>{await api('/mobile-pilot-api/existing-work/'+task.work_id+'/complete',{method:'POST',body:JSON.stringify(body)});sessionStorage.removeItem(existingKey('times',task.work_id));sessionStorage.removeItem(existingKey('notes',task.work_id));
      await loadExistingQueue(existingBucket,existingAsset);status('Work completed. The existing CMMS task and History were updated.');});
  };
  el('pilotExistingDismiss').onclick=()=>existingAction(async()=>{const task=existingTask;await api('/mobile-pilot-api/existing-work/'+task.work_id+'/dismiss',{method:'POST'});await openExistingTask(task.id);});
  async function existingAttachments(id){
    const list=el('pilotExistingAttachments');list.replaceChildren();try{
      const [generic,preventive]=await Promise.all([api('/attachments/task/'+id),api('/preventive-attachments/task/'+id)]);
      const files=[...(Array.isArray(generic)?generic:generic.attachments||[]).map(file=>({...file,source:'generic'})),...(preventive.attachments||[]).map(file=>({...file,source:'preventive'}))];
      if(existingTask?.id!==id)return;if(!files.length){list.textContent='No attachments.';return;}
      for(const file of files){const opened=await api((file.source==='generic'?'/attachments/':'/preventive-attachments/')+file.id+'/open');if(existingTask?.id!==id)return;const link=document.createElement('a');link.href=opened.url;link.target='_blank';link.rel='noopener';const name=file.file_name||file.fileName||file.original_name||'Attachment';if(String(file.mime_type||file.mimeType||'').startsWith('image/')){const image=document.createElement('img');image.src=opened.url;image.alt=name;link.append(image);}else link.textContent=name;const box=document.createElement('div');box.className='photo';box.append(link);list.append(box);}
    }catch(error){if(existingTask?.id===id)list.textContent='Attachments unavailable: '+error.message;}
  }
  el('pilotExistingUpload').onclick=()=>existingAction(async()=>{const id=existingTask?.id,files=Array.from(el('pilotExistingFiles').files||[]);if(!id||!files.length)throw Error('Choose a photo first.');if(files.length>5||files.reduce((n,file)=>n+file.size,0)>8*1024*1024||files.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type)))throw Error('Up to 5 photos, 8 MB total. JPG, PNG or WebP.');const body=new FormData();for(const file of files)body.append('files',file);await api('/mobile-pilot-api/existing-tasks/'+id+'/photos',{method:'POST',body});el('pilotExistingFiles').value='';await existingAttachments(id);});

  bootstrap().catch(error=>{status(error.message);show('pilotLogin');});
})();
