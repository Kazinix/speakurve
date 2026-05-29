const FREQUENCIES = [20,25,31.5,40,50,63,80,100,125,160,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000,10000,12500,16000,20000];
const STORAGE_KEY = 'speakurve_tests';
const COLORS = ['#00d4ff','#ff6b6b','#ffd93d','#6bcb77','#a66cff','#ff8a5c','#00cec9','#e17055','#fd79a8','#55efc4'];
const DB_OFFSET = 80;

const state = {
  isRunning: false,
  stopRequested: false,
  results: [],
  savedTests: [],
  chart: null,
  audioCtx: null,
  analyser: null,
  micStream: null,
  freqData: null,
  testTotalCount: 0,
  rangeStartIdx: 0,
  rangeEndIdx: FREQUENCIES.length-1
};

function $(id){return document.getElementById(id)}

function toast(msg,ok){
  const el=$('toast');
  el.textContent=msg;
  el.style.background=ok?'#2ecc71':'#e74c3c';
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),2500);
}

function delay(ms){return new Promise(r=>setTimeout(r,ms))}

function formatFreq(f){
  if(f>=1000)return (f/1000).toFixed(f%1000===0?0:1)+' kHz';
  return (Number.isInteger(f)?f.toFixed(0):f.toFixed(1))+' Hz';
}

function getTestFrequencies(){
  return FREQUENCIES.slice(state.rangeStartIdx,state.rangeEndIdx+1)
}

function findPeakBin(data,freq,sampleRate,fftSize){
  const centerBin=Math.round(freq*fftSize/sampleRate);
  const range=3;
  let maxVal=-Infinity,maxBin=centerBin;
  const start=Math.max(0,centerBin-range),end=Math.min(data.length-1,centerBin+range);
  for(let b=start;b<=end;b++){if(data[b]>maxVal){maxVal=data[b];maxBin=b}}
  return maxBin;
}

// Audio
async function setupAudio(){
  state.audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  state.micStream=await navigator.mediaDevices.getUserMedia({
    audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}
  });
  const src=state.audioCtx.createMediaStreamSource(state.micStream);
  state.analyser=state.audioCtx.createAnalyser();
  state.analyser.fftSize=16384;
  const bufLen=state.analyser.frequencyBinCount;
  state.freqData=new Float32Array(bufLen);
  src.connect(state.analyser);
}

function cleanupAudio(){
  if(state.micStream){state.micStream.getTracks().forEach(t=>t.stop());state.micStream=null}
  if(state.audioCtx){state.audioCtx.close().catch(()=>{});state.audioCtx=null}
  state.analyser=null;
  state.freqData=null;
}

// Range selects
function initSelects(){
  const selS=$('rangeStart');
  const selE=$('rangeEnd');
  FREQUENCIES.forEach((f,i)=>{
    const o=document.createElement('option');
    o.value=i;o.textContent=formatFreq(f);
    selS.appendChild(o);
    selE.appendChild(o.cloneNode(true));
  });
  selS.value=0;
  selE.value=FREQUENCIES.length-1;
  selS.addEventListener('change',()=>{
    state.rangeStartIdx=+selS.value;
    if(state.rangeStartIdx>state.rangeEndIdx){
      state.rangeEndIdx=state.rangeStartIdx;
      selE.value=state.rangeEndIdx;
    }
  });
  selE.addEventListener('change',()=>{
    state.rangeEndIdx=+selE.value;
    if(state.rangeEndIdx<state.rangeStartIdx){
      state.rangeStartIdx=state.rangeEndIdx;
      selS.value=state.rangeStartIdx;
    }
  });
  state.rangeStartIdx=0;
  state.rangeEndIdx=FREQUENCIES.length-1;
}

// Test runner
async function startTest(){
  if(state.isRunning)return;
  state.isRunning=true;
  state.stopRequested=false;
  state.results=[];
  $('btnStart').classList.add('hidden');
  $('btnStop').classList.remove('hidden');
  updateButtons();
  updateChart();
  updateTable();
  try{
    await setupAudio();
    const sr=state.audioCtx.sampleRate;
    const fftSize=state.analyser.fftSize;
    const bufLen=state.analyser.frequencyBinCount;
    const testFreqs=getTestFrequencies();
    state.testTotalCount=testFreqs.length;
    for(let i=0;i<testFreqs.length;i++){
      if(state.stopRequested)break;
      const freq=testFreqs[i];
      updateStatus(`Testing ${formatFreq(freq)}`);
      const osc=state.audioCtx.createOscillator();
      osc.type='sine';
      osc.frequency.value=freq;
      const gain=state.audioCtx.createGain();
      gain.gain.value=0.4;
      osc.connect(gain).connect(state.audioCtx.destination);
      osc.start();
      await delay(500);
      const readings=[];
      for(let r=0;r<10;r++){
        if(state.stopRequested)break;
        state.analyser.getFloatFrequencyData(state.freqData);
        const bin=findPeakBin(state.freqData,freq,sr,fftSize);
        if(bin>=0&&bin<bufLen){
          const dB=state.freqData[bin];
          readings.push(dB);
          updateMeter(dB);
        }
        await delay(100);
      }
      osc.stop();
      osc.disconnect();
      if(readings.length>0){
        const avg=readings.reduce((a,b)=>a+b,0)/readings.length;
        state.results.push({freq,dB:Math.round(avg*10)/10});
      }
      updateChart();
      updateTable();
      await delay(150);
    }
    if(state.stopRequested){
      updateStatus('Stopped');
    }else{
      updateStatus('Complete!');
    }
  }catch(err){
    console.error(err);
    toast('Error: '+err.message,false);
    updateStatus('Error');
  }finally{
    cleanupAudio();
    state.isRunning=false;
    $('btnStart').classList.remove('hidden');
    $('btnStop').classList.add('hidden');
    updateButtons();
    updateMeter(null);
  }
}

function updateButtons(){
  const hasData=state.results.length>0;
  $('btnSave').disabled=state.isRunning||!hasData;
  $('btnClear').disabled=state.isRunning||!hasData;
  $('btnExport').disabled=state.isRunning||!hasData;
  $('rangeStart').disabled=state.isRunning;
  $('rangeEnd').disabled=state.isRunning;
}

// Save / Load
function saveCurrentTest(){
  if(state.results.length===0)return;
  const defaultName='Test '+new Date().toLocaleString().replace(/:\d+ /,' ');
  const input=prompt('Save test as:',defaultName);
  if(input===null)return;
  let name=input.trim()||defaultName;
  if(state.testTotalCount>0&&state.results.length<state.testTotalCount){
    name+=` (${state.results.length}/${state.testTotalCount})`;
  }
  const existing=state.savedTests.find(t=>t.name===name);
  if(existing){
    if(!confirm(`Test "${name}" already exists. Overwrite?`))return;
    existing.results=state.results.map(r=>({...r}));
    existing.timestamp=new Date().toISOString();
  }else{
    state.savedTests.push({
      id:Date.now().toString(36),
      name,
      timestamp:new Date().toISOString(),
      results:state.results.map(r=>({...r}))
    });
  }
  saveToDisk();
  renderSavedTests();
  toast('Test saved!',true);
}

function saveToDisk(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state.savedTests))}catch(e){}
}

function loadFromDisk(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    state.savedTests=raw?JSON.parse(raw):[];
    state.savedTests.forEach(t=>{if(t._selected===undefined)t._selected=false});
  }catch(e){state.savedTests=[]}
}

function deleteTest(id){
  if(!confirm('Delete this test?'))return;
  state.savedTests=state.savedTests.filter(t=>t.id!==id);
  saveToDisk();
  renderSavedTests();
  updateChart();
}

function toggleTest(id){
  const test=state.savedTests.find(t=>t.id===id);
  if(test){test._selected=!test._selected;saveToDisk();updateChart()}
}

function renderSavedTests(){
  const el=$('savedTestsList');
  if(state.savedTests.length===0){
    el.innerHTML='<div class="empty-state">No saved tests yet. Run a test and it\'ll appear here.</div>';
    return;
  }
  el.innerHTML=state.savedTests.map(t=>`
    <div class="saved-item">
      <input type="checkbox" ${t._selected?'checked':''} onchange="toggleTest('${t.id}')">
      <span class="test-name">${escHtml(t.name)}</span>
      <span class="test-date">${new Date(t.timestamp).toLocaleString()}</span>
      <div class="saved-actions">
        <button class="btn btn-secondary btn-small" onclick="renameTest('${t.id}')">Rename</button>
        <button class="btn btn-danger btn-small" onclick="deleteTest('${t.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function escHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

function renameTest(id){
  const test=state.savedTests.find(t=>t.id===id);
  if(!test)return;
  const name=prompt('New name:',test.name);
  if(name&&name.trim()){test.name=name.trim();saveToDisk();renderSavedTests();updateChart()}
}

// Export / Import
function exportJSON(){
  if(state.savedTests.length===0){toast('No tests to export.',false);return}
  const blob=new Blob([JSON.stringify(state.savedTests,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`speakurve_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Exported!',true);
}

function importJSON(file){
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(!Array.isArray(data))throw new Error('Invalid format');
      data.forEach(t=>{if(typeof t.id!=='string'||!Array.isArray(t.results))throw new Error('Invalid entry')});
      const countBefore=state.savedTests.length;
      data.forEach(imp=>{
        const existing=state.savedTests.find(t=>t.id===imp.id);
        if(existing){
          Object.assign(existing,imp);
        }else{
          imp._selected=false;
          state.savedTests.push(imp);
        }
      });
      saveToDisk();
      renderSavedTests();
      updateChart();
      toast(`Imported ${state.savedTests.length-countBefore} test(s).`,true);
    }catch(err){
      toast('Invalid file: '+err.message,false);
    }
  };
  reader.readAsText(file);
}

function getDisplayData(results){
  return results.map(r=>({freq:r.freq,dB:Math.round((r.dB+DB_OFFSET)*10)/10}));
}

function getTestDisplayData(test){
  return test.results.map(r=>({freq:r.freq,dB:Math.round((r.dB+DB_OFFSET)*10)/10}));
}

// Chart
function initChart(){
  const ctx=$('chart').getContext('2d');
  state.chart=new Chart(ctx,{
    type:'scatter',
    data:{datasets:[]},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:{duration:300},
      scales:{
        x:{
          type:'logarithmic',
          title:{display:true,text:'Frequency (Hz)',color:'#999'},
          min:15,max:22000,
          grid:{color:'#222'},
          ticks:{
            color:'#666',
            callback:v=>{
              if([20,50,100,200,500,1000,2000,5000,10000,20000].includes(v))
                return v>=1000?(v/1000)+'k':v+'';
              return ''
            }
          }
        },
        y:{
          title:{display:true,text:'Relative Level (dB)',color:'#999'},
          min:0,max:80,
          grid:{color:'#222'},
          ticks:{color:'#666'}
        }
      },
      elements:{point:{radius:4},line:{borderWidth:2}},
      plugins:{
        legend:{
          labels:{color:'#999',usePointStyle:true,pointStyle:'line'},
          onClick:(e,legendItem,legend)=>{
            const idx=legendItem.datasetIndex;
            const ds=legend.chart.data.datasets[idx];
            if(ds._fixed)return;
            ds.hidden=!ds.hidden;
            legend.chart.update()
          }
        },
        tooltip:{
          callbacks:{
            label:ctx=>`${ctx.parsed.x.toFixed(1)} Hz: ${ctx.parsed.y.toFixed(1)} dB`
          }
        }
      }
    }
  });
}

function updateChart(){
  const currentData=getDisplayData(state.results).map(r=>({x:r.freq,y:r.dB}));
  const datasets=[];
  if(currentData.length>0){
    datasets.push({
      label:'Current Test',
      data:currentData,
      showLine:true,
      borderColor:COLORS[0],
      backgroundColor:COLORS[0]+'22',
      pointBackgroundColor:COLORS[0],
      borderWidth:2.5,
      tension:.15,
      _fixed:true
    });
  }
  let colorIdx=1;
  state.savedTests.forEach(t=>{
    if(t._selected&&t.results.length>0){
      const td=getTestDisplayData(t).map(r=>({x:r.freq,y:r.dB}));
      datasets.push({
        label:t.name,
        data:td,
        showLine:true,
        borderColor:COLORS[colorIdx%COLORS.length],
        backgroundColor:'transparent',
        pointBackgroundColor:COLORS[colorIdx%COLORS.length],
        borderWidth:1.5,
        borderDash:[5,4],
        tension:.15,
        pointRadius:2.5
      });
      colorIdx++;
    }
  });
  state.chart.data.datasets=datasets;
  state.chart.update('none');
}

// UI updates
function updateStatus(text){
  $('freqCurrent').textContent=text;
}

function updateMeter(dB){
  const el=$('bigDb');
  if(dB===null||dB===undefined){
    el.textContent='-- dB';
    return;
  }
  const displayed=dB+DB_OFFSET;
  el.textContent=displayed.toFixed(1)+' dB';
}

function updateTable(){
  const tbody=$('resultsBody');
  if(state.results.length===0){
    tbody.innerHTML='<tr><td colspan="3" style="text-align:center;color:#555;padding:20px">No results yet.</td></tr>';
    return;
  }
  const data=getDisplayData(state.results);
  tbody.innerHTML=data.map(r=>`
    <tr>
      <td>${r.freq>=1000?(r.freq/1000).toFixed(r.freq%1000===0?0:1)+' kHz':r.freq.toFixed(Number.isInteger(r.freq)?0:1)+' Hz'}</td>
      <td>${r.dB.toFixed(1)}</td>
      <td><span class="status-dot done"></span></td>
    </tr>
  `).join('');
}

function clearResults(){
  if(state.isRunning||state.results.length===0)return;
  state.results=[];
  updateButtons();
  updateChart();
  updateTable();
  updateStatus('Ready');
  updateMeter(null);
}

// Tabs
function initTabs(){
  document.querySelectorAll('.tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      $(tab.dataset.tab==='chart'?'tabChart':'tabTable').classList.add('active');
      if(tab.dataset.tab==='table')updateTable();
    });
  });
}

// Event binding
$('btnStart').addEventListener('click',startTest);
$('btnStop').addEventListener('click',()=>{state.stopRequested=true;toast('Stopping...',false)});
$('btnClear').addEventListener('click',clearResults);
$('btnSave').addEventListener('click',saveCurrentTest);
$('btnExport').addEventListener('click',exportJSON);
$('btnImport').addEventListener('click',()=>$('fileInput').click());
$('fileInput').addEventListener('change',e=>{if(e.target.files[0]){importJSON(e.target.files[0]);e.target.value=''}});

// Init
loadFromDisk();
initChart();
initSelects();
initTabs();
renderSavedTests();
updateButtons();
updateStatus('Ready');

// Service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
