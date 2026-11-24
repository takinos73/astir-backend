(() => {
  'use strict';
  const el=id=>document.getElementById(id);
  let token=sessionStorage.getItem('astirMobilePilotToken')||'',assets=[],items=[],selected=null,busy=false,files=[],draftRequest=null;
  const status=text=>{el('pilotStatus').textContent=text;};
  const localNow=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
  const date=value=>value?new Date(value).toLocaleString('en-GB',{timeZone:'Europe/Athens'}):'—';
  const code=item=>(item.breakdown_id||item.scheduled_maintenance_id)?item.kind+'-'+String(item.breakdown_id||item.scheduled_maintenance_id).padStart(5,'0'):item.kind+' (removed)';
  function show(id){for(const name of ['pilotLogin','pilotHome','pilotCreate','pilotDetail'])el(name).hidden=name!==id;window.scrollTo(0,0);}
  async function api(path,options={}){
    const headers={'X-Mobile-Pilot-Token':token,...options.headers};
    if(options.body&&!(options.body instanceof FormData))headers['Content-Type']='application/json';
    const response=await fetch(path,{...options,headers,cache:'no-store'});
    const data=await response.json().catch(()=>({error:'Unexpected server response.'}));
    if(!response.ok){const error=new Error(data.error||'Request failed.');error.status=response.status;if(response.status===401){token='';sessionStorage.removeItem('astirMobilePilotToken');show('pilotLogin');el('pilotLogout').hidden=true;}throw error;}
    return data;
  }
  function button(text,handler){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=handler;return b;}
  function clearFiles(){files.forEach(x=>URL.revokeObjectURL(x.url));files=[];el('pilotDraftPhotos').replaceChildren();}
  function renderFiles(){el('pilotDraftPhotos').replaceChildren();for(const entry of files){const box=document.createElement('div');box.className='photo';const img=document.createElement('img');img.src=entry.url;img.alt=entry.file.name;box.append(img,button('Remove',()=>{URL.revokeObjectURL(entry.url);files=files.filter(x=>x!==entry);renderFiles();}));el('pilotDraftPhotos').appendChild(box);}}
  function addFiles(input){const additions=Array.from(input.files||[]);input.value='';const merged=[...files];for(const file of additions){if(merged.some(x=>x.file.name===file.name&&x.file.size===file.size&&x.file.lastModified===file.lastModified))continue;merged.push({file});}if(merged.length>5||merged.reduce((n,x)=>n+x.file.size,0)>8*1024*1024)return status('Select up to 5 photos, 8 MB total.');if(merged.some(x=>!['image/jpeg','image/png','image/webp'].includes(x.file.type)))return status('Use JPG, PNG or WebP images.');files=merged.map(x=>x.url?x:{...x,url:URL.createObjectURL(x.file)});renderFiles();}
  function renderAssets(){const chosen=el('pilotAsset').value,q=el('pilotAssetSearch').value.trim().toLowerCase();el('pilotAsset').replaceChildren(new Option('Select asset…',''));for(const a of assets){const label=[a.model,'SN '+a.serial_number,a.line].filter(Boolean).join(' · ');if(!q||label.toLowerCase().includes(q)||String(a.id)===chosen)el('pilotAsset').add(new Option(label,a.id));}el('pilotAsset').value=chosen;}
  function saveFormDraft(){if(draftRequest)return;sessionStorage.setItem('astirMobilePilotForm',JSON.stringify({asset:el('pilotAsset').value,kind:document.querySelector('[name="pilotKind"]:checked').value,title:el('pilotTitle').value,at:el('pilotAt').value,description:el('pilotDescription').value}));}
  function restoreFormDraft(){try{const d=JSON.parse(sessionStorage.getItem('astirMobilePilotForm')||'null');if(!d)return;el('pilotAsset').value=d.asset;el('pilotTitle').value=d.title||'';el('pilotAt').value=d.at||localNow();el('pilotDescription').value=d.description||'';document.querySelector('[name="pilotKind"][value="'+(d.kind==='SM'?'SM':'BD')+'"]').checked=true;}catch{}}
  async function refresh(){const data=await api('/mobile-pilot-api/incidents');items=data.incidents;renderItems();}
  function renderItems(){const list=el('pilotItems');list.replaceChildren();if(!items.length){list.textContent='No pilot incidents yet.';return;}for(const item of items){const card=document.createElement('article');card.className='item';const badge=document.createElement('span');badge.className='badge '+(item.kind==='BD'?'bd':'sm');badge.textContent=code(item);const h=document.createElement('h3');h.textContent=item.title||'Incident unavailable';const meta=document.createElement('small');meta.textContent=[item.model,item.line,item.work_completed_at||item.task_status==='Done'?'Work completed':item.work_id?'Work in progress':item.incident_status].filter(Boolean).join(' · ');card.append(badge,h,meta,button(item.work_id?'Continue / View':'View / Start work',()=>openItem(item.id)));list.appendChild(card);}}
  async function bootstrap(){const data=await api('/mobile-pilot-api/bootstrap');assets=data.assets;el('pilotUser').textContent=data.user.name+' · Admin pilot';el('pilotLogout').hidden=false;await refresh();renderAssets();show('pilotHome');}
  el('pilotLoginForm').onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;const submit=event.submitter;submit.disabled=true;status('Signing in…');try{const data=await api('/mobile-pilot-api/login',{method:'POST',body:JSON.stringify({access_key:el('pilotKey').value})});token=data.token;sessionStorage.setItem('astirMobilePilotToken',token);el('pilotKey').value='';await bootstrap();status('');}catch(error){status(error.message);}finally{busy=false;submit.disabled=false;}};
  el('pilotLogout').onclick=async()=>{if(busy)return;try{await api('/mobile-pilot-api/logout',{method:'POST'});}catch{}token='';sessionStorage.removeItem('astirMobilePilotToken');for(const k of Object.keys(sessionStorage))if(k.startsWith('astirMobilePilot'))sessionStorage.removeItem(k);items=[];assets=[];selected=null;draftRequest=null;clearFiles();el('pilotNotes').value='';el('pilotCreateForm').reset();el('pilotItems').replaceChildren();el('pilotDetailHeading').replaceChildren();el('pilotDetailFacts').replaceChildren();el('pilotSavedPhotos').replaceChildren();el('pilotLogout').hidden=true;el('pilotUser').textContent='Admin mobile pilot';status('Signed out.');show('pilotLogin');};
  el('pilotNew').onclick=()=>{if(busy)return;status('');if(!draftRequest){el('pilotCreateForm').reset();el('pilotAt').value=localNow();el('pilotAssetSearch').value='';el('pilotDraftFields').disabled=false;renderAssets();restoreFormDraft();}else{el('pilotAssetSearch').value='';renderAssets();el('pilotAsset').value=draftRequest.asset_id;el('pilotTitle').value=draftRequest.title;el('pilotDescription').value=draftRequest.description;const d=new Date(draftRequest.incident_at);el('pilotAt').value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);document.querySelector('[name="pilotKind"][value="'+draftRequest.kind+'"]').checked=true;el('pilotDraftFields').disabled=true;status('Retrying the previously submitted draft safely.');}el('pilotAtLabel').textContent=document.querySelector('[name="pilotKind"]:checked').value==='SM'?'Scheduled start *':'Incident started *';show('pilotCreate');};
  el('pilotCreateForm').addEventListener('input',saveFormDraft);el('pilotCreateForm').addEventListener('change',saveFormDraft);
  el('pilotAssetSearch').oninput=renderAssets;
  document.querySelectorAll('[name="pilotKind"]').forEach(radio=>radio.onchange=()=>el('pilotAtLabel').textContent=radio.checked&&radio.value==='SM'?'Scheduled start *':'Incident started *');
  el('pilotTakePhoto').onclick=()=>el('pilotCamera').click();el('pilotChoosePhoto').onclick=()=>el('pilotFiles').click();el('pilotCamera').onchange=()=>addFiles(el('pilotCamera'));el('pilotFiles').onchange=()=>addFiles(el('pilotFiles'));
  el('pilotCreateBack').onclick=async()=>{if(busy)return;try{await refresh();show('pilotHome');status(draftRequest?'A submission may be pending. Check the list before retrying the same draft.':'');}catch(error){status(error.message);}};
  async function upload(id,selectedFiles){if(!selectedFiles.length)return;const data=new FormData();for(const file of selectedFiles)data.append('files',file);await api('/mobile-pilot-api/incidents/'+id+'/photos',{method:'POST',body:data});}
  el('pilotCreateForm').onsubmit=async event=>{
    event.preventDefault();if(busy)return;
    if(!draftRequest){if(!el('pilotCreateForm').reportValidity())return;const at=new Date(el('pilotAt').value);if(Number.isNaN(at.getTime()))return status('Check the date/time.');draftRequest={request_id:crypto.randomUUID(),asset_id:Number(el('pilotAsset').value),kind:document.querySelector('[name="pilotKind"]:checked').value,title:el('pilotTitle').value.trim(),description:el('pilotDescription').value.trim(),incident_at:at.toISOString(),start_work:event.submitter?.dataset.start==='true'};sessionStorage.setItem('astirMobilePilotDraft',JSON.stringify(draftRequest));}
    busy=true;let savedId=null;el('pilotDraftFields').disabled=true;el('pilotSaveOnly').disabled=true;el('pilotSaveStart').disabled=true;status('Saving incident…');
    try{
      const result=await api('/mobile-pilot-api/incidents',{method:'POST',body:JSON.stringify(draftRequest)});const id=result.incident.id;savedId=id;
      draftRequest=null;sessionStorage.removeItem('astirMobilePilotDraft');sessionStorage.removeItem('astirMobilePilotForm');
      let photoMessage='';try{await upload(id,files.map(x=>x.file));}catch(error){photoMessage='Incident saved. Photos were not confirmed: '+error.message+' Check the Photos list before retrying.';}
      clearFiles();await refresh();await openItem(id);status(photoMessage||'Incident saved.');
    }catch(error){if(savedId){show(error.status===401?'pilotLogin':'pilotHome');status('Incident saved successfully. Sign in / refresh My work to continue. Do not create it again.');}else if(error.status&&error.status<500){draftRequest=null;sessionStorage.removeItem('astirMobilePilotDraft');el('pilotDraftFields').disabled=false;status(error.message);}else status(error.message+' Retry to submit the SAME draft safely, or check My work.');}
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
  async function openItem(id){selected=items.find(x=>x.id===id);if(!selected)return;const item=selected;show('pilotDetail');const heading=el('pilotDetailHeading');heading.replaceChildren();const badge=document.createElement('span');badge.className='badge '+(item.kind==='BD'?'bd':'sm');badge.textContent=code(item);const h=document.createElement('h1');h.textContent=item.title||'Incident unavailable';heading.append(badge,h);const facts=el('pilotDetailFacts');facts.replaceChildren();for(const [label,value]of [['Asset',[item.model,'SN '+item.serial_number,item.line].join(' · ')],['Incident status',item.incident_status],[item.kind==='BD'?'Incident started':'Scheduled start',date(item.kind==='BD'?item.incident_started_at:item.scheduled_start_at)],['Your work started',date(item.work_started_at)],['Work completed',item.work_completed_at?date(item.work_completed_at):item.task_status==='Done'?'Completed from CMMS':'—']]){const row=document.createElement('div');row.className='fact';const name=document.createElement('span'),val=document.createElement('strong');name.textContent=label;val.textContent=value;row.append(name,val);facts.appendChild(row);}const complete=!!item.work_completed_at||item.task_status==='Done';el('pilotWorkControls').hidden=!item.work_id||!item.task_id||complete;el('pilotComplete').hidden=!item.work_id||!item.task_id||complete;el('pilotStart').hidden=!!item.work_id||!item.incident_status||item.incident_status==='CLOSED';el('pilotNotes').value=sessionStorage.getItem('astirMobilePilotNotes:'+item.work_id)??item.notes??'';el('pilotDuration').value='';el('pilotMorePhotos').value='';await loadPhotos(item);}
  el('pilotNotes').oninput=()=>{if(selected?.work_id)sessionStorage.setItem('astirMobilePilotNotes:'+selected.work_id,el('pilotNotes').value);};
  el('pilotDetailBack').onclick=async()=>{if(busy)return;try{await refresh();show('pilotHome');status('');}catch(error){status(error.message);}};
  el('pilotRefresh').onclick=async()=>{if(busy)return;try{await refresh();status('Updated.');}catch(error){status(error.message);}};
  async function run(button,operation){if(busy||!selected)return;busy=true;button.disabled=true;status('Saving…');try{await operation();await refresh();await openItem(selected.id);status('Saved.');}catch(error){status(error.message);}finally{busy=false;button.disabled=false;}}
  el('pilotStart').onclick=()=>run(el('pilotStart'),()=>api('/mobile-pilot-api/incidents/'+selected.id+'/start-work',{method:'POST'}));
  el('pilotSaveNotes').onclick=()=>run(el('pilotSaveNotes'),()=>api('/mobile-pilot-api/work/'+selected.work_id+'/notes',{method:'PATCH',body:JSON.stringify({notes:el('pilotNotes').value})}));
  el('pilotComplete').onclick=()=>{if(!el('pilotDuration').checkValidity())return el('pilotDuration').reportValidity();if(!confirm('Complete your work? This records an execution but does not close the BD/SM.'))return;const duration=el('pilotDuration').value;const body={notes:el('pilotNotes').value};if(duration!=='')body.actual_duration_min=Number(duration);return run(el('pilotComplete'),async()=>{await api('/mobile-pilot-api/work/'+selected.work_id+'/complete',{method:'POST',body:JSON.stringify(body)});sessionStorage.removeItem('astirMobilePilotNotes:'+selected.work_id);});};
  el('pilotUploadPhotos').onclick=()=>{const selectedFiles=Array.from(el('pilotMorePhotos').files||[]);if(!selectedFiles.length)return status('Select a photo first.');if(selectedFiles.length>5||selectedFiles.reduce((n,f)=>n+f.size,0)>8*1024*1024)return status('Up to 5 photos, 8 MB total.');return run(el('pilotUploadPhotos'),()=>upload(selected.id,selectedFiles));};
  window.addEventListener('beforeunload',event=>{if(busy||files.length){event.preventDefault();event.returnValue='';}});
  try{draftRequest=JSON.parse(sessionStorage.getItem('astirMobilePilotDraft')||'null');}catch{}
  if(token)bootstrap().catch(error=>{status(error.message);show('pilotLogin');});else show('pilotLogin');
})();
