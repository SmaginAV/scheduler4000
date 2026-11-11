const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '../../EPF/scheduler4000/Templates/МакетHTML/Ext/Template.txt'), 'utf8');

function openSimulator(settings={}) {
  const nodes = {}, timers = [], frames = [], datasets = [], windowEvents = {}, messages=[];
  function node(id) {
    const assigned=Object.values(nodes).find(item=>item.id===id);if(assigned) {return assigned;}
    if (!nodes[id]) {
      nodes[id] = {id, style:{}, children:[], listeners:{}, hidden:true, checked:false, value:'', clientWidth:720,clientHeight:160, scrollLeft:0,
        addEventListener(event, action) { this.listeners[event] = action; },
        appendChild(child) { this.children.push(child);child.parentNode=this; },
        insertBefore(child,before) { this.children.splice(this.children.indexOf(before),0,child);child.parentNode=this; },
        removeChild(child) { this.children.splice(this.children.indexOf(child),1); },
        setAttribute(key,value) { this[key] = value; }, getAttribute(key) { return this[key]; }, removeAttribute() {},
        click() { if(this.id==='v8bridge') { messages.push(JSON.parse(this['data-payload'])); } },
        querySelector() { return {getBoundingClientRect:() => ({left:240,right:960,top:46,bottom:160})}; },
        querySelectorAll() { return this.children.flatMap(child=>[child,...child.querySelectorAll()]); },
        getBoundingClientRect:() => ({left:0,right:960,top:0,bottom:160,height:160}),
        getContext() { if(!this.context) { this.context={rectangles:[],texts:[],setTransform(){},clearRect(){this.rectangles=[];this.texts=[];},
          save(){this.savedClip=this.clipping;},restore(){this.clipping=this.savedClip;},beginPath(){},rect(x,y,width,height){this.clipRect={x,y,width,height};},clip(){this.clipping=this.clipRect;},
          fillText(value,x,y){this.texts.push({value,x,y,align:this.textAlign});},fillRect(x,y,width,height){if(this.clipping){const clip=this.clipping,right=Math.min(x+width,clip.x+clip.width),bottom=Math.min(y+height,clip.y+clip.height);
            x=Math.max(x,clip.x);y=Math.max(y,clip.y);width=right-x;height=bottom-y;if(width<=0||height<=0)return;}
            this.rectangles.push({x,y,width,height,color:this.fillStyle});}}; } return this.context; },
        get firstChild() { return this.children[0]; },
        get scrollWidth() { return parseInt(node('timeScrollTrack').style.width,10) || this.clientWidth; }};
    }
    return nodes[id];
  }
  node('enabledOnly').checked = true;
  node('scheduleEditor').appendChild(node('editorWindows'));
  node('grouping').value = 'none';
  node('timeScroll').previousElementSibling = node('scrollLabel');
  node('chartCollisions').clientWidth=960; node('ganttCollisions').clientWidth=960;
  class DataSet {
    constructor() { this.rows = new Map(); this.writes = 0; datasets.push(this); }
    get length() { return this.rows.size; }
    clear() { this.rows.clear(); this.writes++; }
    add(rows) { rows.forEach(row => this.rows.set(row.id,row)); this.writes++; }
    update(row) { (Array.isArray(row) ? row : [row]).forEach(item => this.rows.set(item.id,{...this.rows.get(item.id),...item})); this.writes++; }
    remove(ids) { ids.forEach(id => this.rows.delete(id)); this.writes++; }
    get(query) { return typeof query === 'string' ? this.rows.get(query) : [...this.rows.values()].filter(query?.filter || (() => true)); }
  }
  class DataView {
    constructor(source, options) { this.source=source; this.options=options; open.view=this; }
    refresh() { this.visible=this.source.get().filter(this.options.filter); }
    dispose() {}
  }
  const open = {node, datasets, calculations:[]};
  const chart = {options:{}, actions:[], updates:[], handlers:{}, setOption(options) { this.updates.push(options);Object.assign(this.options,options);
    if(options.dataZoom) this.actions.push({type:'dataZoom',...options.dataZoom[0]}); },
    dispatchAction(action) { this.actions.push(action); this.handlers.datazoom?.(); },
    getOption() { return this.options; }, on(event,handler) { this.handlers[event]=handler; }, resize() {}, dispose() {}};
  class Timeline {
    constructor(element, items, groups, options) { this.options=options; this.handlers={}; open.timeline=this; }
    setWindow(start,end) { this.start=start; this.end=end; this.handlers.rangechange?.({start:new Date(start),end:new Date(end)}); }
    on(event,handler) { this.handlers[event]=handler; }
    setOptions(options) { Object.assign(this.options,options); }
    redraw() {} destroy() {}
  }
  const context = {window:{}, document:{getElementById:node,createElement:() => node('element'+Math.random()),readyState:'loading',addEventListener() {}},
    vis:{DataSet,DataView,Timeline}, echarts:{init:() => chart},
    setTimeout:action => {timers.push(action);return timers.length;}, clearTimeout() {},
    requestAnimationFrame:action => {frames.push(action);return frames.length;}, console};
  context.window.addEventListener = (event,handler) => { windowEvents[event]=handler; };
  context.window.removeEventListener = (event,handler) => { if(windowEvents[event]===handler) { delete windowEvents[event]; } };
  vm.createContext(context);
  for (const id of ['scheduler4000-core','scheduler4000-ui']) {
    vm.runInContext(html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)</script>'))[1],context);
  }
  const packet = {protocolVersion:1,revision:1,config:{simulationDate:'2026-11-10',durationMode:'Med',fixedDurationSeconds:settings.fallbackDuration||60,
    maxThreadsThreshold:settings.limit||8,resolutionSeconds:60,nativeJobEditor:!!settings.nativeEditor,offlineReport:settings.offline!==false,collectedAt:'2026-11-09T12:00:00',factDate:'2026-11-08'},
    jobs:[true,!!settings.bothEnabled].map((enabled,index) => ({id:String(index),name:index ? 'Отключенное' : 'Активное',methodName:'Тест.Выполнить',
      subsystem:'Тест',subsystems:['Тест'],enabled,pinned:false,durationMed:60,durationP95:90,historyState:'never',
      sampleCount:1,historyQuality:'Тест',factIntervals:[],schedule:{startTime:'00:00:00',endTime:'23:59:59',
        repeatPeriod:3600,repeatPause:0,daysOfWeek:[],months:[],dailySchedules:[]}}))};
  if(settings.preferences) packet.preferences=settings.preferences;
  if(settings.factIntervals) packet.jobs[0].factIntervals=settings.factIntervals;
  if(settings.unmappedIntervals) packet.unmappedIntervals=settings.unmappedIntervals;
  if(settings.dailySchedules) packet.jobs[0].schedule.dailySchedules=settings.dailySchedules;
  if(settings.pinned) packet.jobs[0].pinned=true;
  if(settings.frequent) packet.jobs[0].schedule.repeatPeriod=60;
  if(settings.zeroDuration) packet.jobs[0].durationMed=0;
  if(settings.withoutHistory) {packet.jobs[1].durationMed=null;packet.jobs[1].durationP95=null;
    packet.jobs[1].historyState='unknown';packet.jobs[1].lastStart=null;packet.jobs[1].lastEnd=null;}
  const originalSimulate=context.window.Scheduler4000.simulateJob;
  context.window.Scheduler4000.simulateJob=(...args)=>{const result=originalSimulate(...args);open.calculations.push(result);return result;};
  context.window.initSimulator(JSON.stringify(packet));
  open.flush = () => { for(let count=0; (frames.length || timers.length) && count<100; count++) { (frames.shift() || timers.shift())(); } };
  open.flush();
  open.core=context.window.Scheduler4000; open.api=context.window; open.chart=chart; open.windowEvents=windowEvents; open.messages=messages;
  open.packet=packet;
  return open;
}

test('Распределение показывает результат на основном экране и сбрасывает его после правки',async()=>{
  const ui=openSimulator({bothEnabled:true,withoutHistory:true});
  ui.api.requestSimulatorAction('optimize');ui.flush();
  await Promise.resolve();ui.flush();
  assert.equal(ui.node('optimizationNotice').hidden,false);
  assert.match(ui.node('optimizationNotice').textContent,/Максимум одновременно/);
  assert.match(ui.node('optimizationResult').textContent,/Отключенное/);
  ui.api.updateSimulatorSettings(JSON.stringify({durationMode:'P95'}));ui.flush();
  assert.equal(ui.node('optimizationNotice').hidden,true);
  ui.node('optimizationNotice').hidden=false;ui.node('optimizationResult').textContent='Старый результат';
  ui.api.initSimulator(JSON.stringify(ui.packet));ui.flush();
  assert.equal(ui.node('optimizationNotice').hidden,true);
  assert.equal(ui.node('optimizationResult').textContent,'');
});

test('Поиск и фильтр активных не пересчитывают прогноз и не заменяют интервалы', () => {
  const ui = openSimulator(), writes=ui.datasets[0].writes;
  ui.core.simulatePacket = () => { throw new Error('Фильтр запустил расчет'); };
  assert.deepEqual(ui.view.visible.map(row => row.id),['0']);
  ui.node('enabledOnly').checked=false; ui.node('enabledOnly').listeners.change();
  assert.deepEqual(ui.view.visible.map(row => row.id),['0','1']);
  ui.node('filter').value='отключ'; ui.node('filter').listeners.input(); ui.flush();
  assert.deepEqual(ui.view.visible.map(row => row.id),['1']);
  assert.equal(ui.datasets[0].writes,writes);
});

test('Строка явно показывает измеренную длительность, ручное значение и размер выборки',()=>{
  const ui=openSimulator();
  const text=()=>ui.datasets[1].get('0').content.children[3].textContent;
  assert.match(text(),/По истории: 60 с/);assert.match(text(),/1 запуск/);
  ui.api.updateSimulatorSettings(JSON.stringify({durationMode:'P95',fixedDurationSeconds:600}));ui.flush();
  assert.match(text(),/С запасом: 90 с/,'Оценка без истории не заменяет известные 90 секунд');
  ui.api.updateSimulatorSettings(JSON.stringify({durationMode:'Fixed',fixedDurationSeconds:600}));ui.flush();
  assert.match(text(),/Вручную: 600 с/);
});

test('Полоса времени двигает оба графика без расчета или замены интервалов', () => {
  const ui=openSimulator(), writes=ui.datasets[0].writes, begin=Date.UTC(2026,10,10);
  ui.core.simulatePacket=() => { throw new Error('Прокрутка запустила расчет'); };
  const scroll=ui.node('timeScroll');
  scroll.scrollLeft=(scroll.scrollWidth-scroll.clientWidth)/2; scroll.listeners.scroll(); ui.flush();
  assert.equal(ui.timeline.start,begin+9*3600000);
  assert.equal(ui.timeline.end,begin+15*3600000);
  assert.equal(ui.chart.actions.at(-1).startValue,ui.timeline.start);
  assert.equal(ui.node('rangeLabel').textContent,'09:00 - 15:00');
  assert.equal(ui.datasets[0].writes,writes);
  const actionCount=ui.chart.actions.length;
  scroll.listeners.scroll(); ui.flush();
  assert.equal(ui.chart.actions.length,actionCount,'Синхронизация не должна зацикливаться');
});

test('Правый клик ставит общую черную пунктирную метку и повторный клик на любом графике убирает ее',()=>{
  const ui=openSimulator(),guide=ui.node('timeGuide'),calculations=ui.calculations.length;
  const writes=ui.datasets.map(dataset=>dataset.writes),messages=ui.messages.length;
  ui.node('heatmap').getBoundingClientRect=()=>({left:40,right:1000,top:100,bottom:255});
  ui.node('timeline').getBoundingClientRect=()=>({left:40,right:1000,top:300,bottom:700});
  let prevented=0,stopped=0;
  const click=(id,x=639.5,y=150)=>ui.node(id).listeners.contextmenu({clientX:x,clientY:y,
    preventDefault(){prevented++;},stopPropagation(){stopped++;}});
  assert.equal(guide.hidden,true);
  click('timeline');assert.equal(guide.hidden,true,'Нижний график сам не ставит метку');
  click('heatmap');assert.equal(guide.hidden,false);
  assert.equal(guide.style.left,'640px');assert.equal(guide.style.top,'116px');assert.equal(guide.style.height,'584px');
  click('heatmap',900);assert.equal(guide.hidden,true,'Повторный клик не переносит метку');
  click('heatmap');click('timeline',300,650);assert.equal(guide.hidden,true);
  assert.equal(prevented,4);assert.equal(stopped,4);
  assert.equal(ui.calculations.length,calculations);assert.deepEqual(ui.datasets.map(dataset=>dataset.writes),writes);
  assert.equal(ui.messages.length,messages,'Метка не меняет черновик и настройки');
  assert.match(html,/#timeGuide\{[^}]*border-left:1px dashed #000;[^}]*pointer-events:none/);
});

test('Метка держится за выбранное время при прокрутке, масштабе, изменении размеров и новом снимке',()=>{
  const ui=openSimulator(),guide=ui.node('timeGuide'),calculations=ui.calculations.length,begin=Date.UTC(2026,10,10);
  let left=0,right=960,bottom=700;
  ui.node('heatmap').getBoundingClientRect=()=>({left,right,top:100,bottom:255});
  ui.node('timeline').getBoundingClientRect=()=>({left,right,top:300,bottom});
  ui.node('timeline').querySelector=()=>({getBoundingClientRect:()=>({left:left+240,right,top:346,bottom})});
  ui.node('heatmap').listeners.contextmenu({clientX:599.5,clientY:150,preventDefault(){},stopPropagation(){}});
  assert.equal(guide.style.left,'600px');
  ui.node('zoomIn').listeners.click();ui.flush();assert.equal(guide.style.left,'600px');
  ui.timeline.handlers.rangechange({start:new Date(begin),end:new Date(begin+3*3600000)});ui.flush();
  assert.equal(guide.style.left,'959px','Метка соответствует 03:00, а не прежнему пикселю');
  ui.timeline.handlers.rangechange({start:new Date(begin+4*3600000),end:new Date(begin+7*3600000)});ui.flush();
  assert.equal(guide.hidden,true,'Вне диапазона линия скрыта');
  ui.node('showDay').listeners.click();ui.flush();assert.equal(guide.hidden,false);assert.equal(guide.style.left,'330px');
  left=40;right=1200;bottom=850;
  ui.windowEvents.resize();ui.flush();assert.equal(guide.style.top,'116px');assert.equal(guide.style.height,'734px');
  assert.equal(guide.style.left,'395px','После изменения размера используется новая ширина обеих шкал');
  assert.equal(ui.calculations.length,calculations);
  ui.api.updateSimulatorSettings(JSON.stringify({...ui.packet.config,simulationDate:'2026-11-11'}));ui.flush();
  assert.equal(guide.hidden,true,'Смена даты сбрасывает метку предыдущих суток');
  ui.node('heatmap').listeners.contextmenu({clientX:600,clientY:150,preventDefault(){},stopPropagation(){}});
  assert.equal(guide.hidden,false,'Первый клик на новой дате сразу ставит метку');
  ui.api.initSimulator(JSON.stringify(ui.packet));ui.flush();assert.equal(guide.hidden,true,'Новый снимок сбрасывает временную метку');
});

test('Метка ставится только внутри области верхнего графика',()=>{
  const ui=openSimulator(),guide=ui.node('timeGuide');
  for(const [x,y] of [[100,50],[960,50],[500,5],[500,150]]){
    ui.node('heatmap').listeners.contextmenu({clientX:x,clientY:y,preventDefault(){},stopPropagation(){}});
    assert.equal(guide.hidden,true);
  }
});

test('Сто горизонтальных событий объединяются в один кадр и одно обновление точного графика',()=>{
  const ui=openSimulator(),scroll=ui.node('timeScroll');
  for(let index=0;index<3;index++) {ui.node('zoomIn').listeners.click();ui.flush();}
  const updates=ui.chart.updates.length,actions=ui.chart.actions.length,writes=ui.datasets[0].writes;
  ui.core.simulatePacket=()=>{throw new Error('Горизонтальная прокрутка запустила расчет');};
  ui.core.simulateJob=()=>{throw new Error('Горизонтальная прокрутка запустила расчет задания');};
  for(let pixel=1;pixel<=100;pixel++) {scroll.scrollLeft=pixel;scroll.listeners.scroll();}
  ui.flush();
  assert.equal(ui.chart.updates.length-updates,1,'Данные и границы графика обновляются вместе');
  assert.equal(ui.chart.actions.length-actions,1,'Дополнительного dispatchAction нет');
  const option=ui.chart.updates.at(-1);
  assert.equal(option.dataZoom[0].startValue,ui.timeline.start);
  assert.ok(option.series[0].data.length<100,'Передается только видимый участок');
  assert.equal(ui.datasets[0].writes,writes);
  const count=ui.chart.updates.length;
  ui.timeline.handlers.rangechange({start:new Date(ui.timeline.start),end:new Date(ui.timeline.end)});ui.flush();
  assert.equal(ui.chart.updates.length,count,'Повтор тех же границ не перерисовывается');
});

test('Стрелки, масштаб и полный день сохраняют границы суток и положение полосы', () => {
  const ui=openSimulator(), begin=Date.UTC(2026,10,10), scroll=ui.node('timeScroll');
  ui.node('panRight').listeners.click();
  ui.flush();
  assert.equal(ui.timeline.start,begin+3*3600000);
  assert.equal(ui.chart.actions.at(-1).startValue,ui.timeline.start);
  assert.equal(ui.chart.actions.at(-1).endValue,ui.timeline.end);
  assert.ok(scroll.scrollLeft>0);
  ui.node('showDay').listeners.click();
  ui.flush();
  assert.equal(ui.timeline.start,begin); assert.equal(ui.timeline.end,begin+86400000);
  assert.equal(scroll.scrollLeft,0); assert.equal(ui.node('panRight').disabled,true);
  ui.node('zoomIn').listeners.click();
  ui.flush();
  assert.equal(ui.timeline.end-ui.timeline.start,12*3600000);
  assert.equal(ui.chart.actions.at(-1).startValue,ui.timeline.start);
  assert.equal(ui.chart.actions.at(-1).endValue,ui.timeline.end);
  assert.equal(ui.timeline.options.zoomKey,'ctrlKey');
  assert.equal(ui.timeline.options.verticalScroll,true);
});

test('Изменение лимита сохраняет интервалы и выбранный участок времени', () => {
  const ui=openSimulator(), writes=ui.datasets[0].writes;
  ui.node('panRight').listeners.click(); ui.flush(); const start=ui.timeline.start;
  ui.core.simulatePacket=() => { throw new Error('Изменение лимита запустило прогноз заново'); };
  ui.api.updateSimulatorSettings(JSON.stringify({simulationDate:'2026-11-10',durationMode:'Med',fixedDurationSeconds:60,
    maxThreadsThreshold:1,resolutionSeconds:10,offerPause:false}));
  assert.equal(ui.timeline.start,start); assert.equal(ui.datasets[0].writes,writes);
});

test('Во время переноса меняется только метка, единственный пересчет выполняется после отпускания', () => {
  const ui=openSimulator(), items=ui.datasets[0], handle=items.get({filter:row => row.first})[0], writes=items.writes;
  const calculateJob=ui.core.simulateJob; let calculations=0, accepted=0;
  ui.core.simulateJob=(job,config) => { calculations++; return calculateJob(job,config); };
  ui.core.simulatePacket=() => { throw new Error('Перенос запустил общий расчет'); };
  let moving;
  for(let seconds=1;seconds<=10;seconds++) {
    moving={...handle,start:new Date(Number(handle.start)+seconds*1000)};
    ui.timeline.options.onMoving(moving,result => { assert.ok(result); accepted++; });
  }
  assert.equal(accepted,10); assert.equal(calculations,0);
  assert.equal(ui.node('dragTime').textContent,'00:00:10');
  assert.equal(ui.node('dragMarker').hidden,false);
  ui.flush(); assert.equal(calculations,0,'Даже после ожидания мышь не должна запускать расчет');
  assert.equal(items.writes,writes,'До отпускания мыши интервалы не изменяются');
  ui.timeline.options.onMove(moving,() => {});
  assert.equal(calculations,1); assert.equal(ui.node('dragMarker').hidden,true);
  assert.equal(Number(items.get(handle.id).start),Number(handle.start)+10000);
  assert.equal(ui.node('changed').textContent,1);
});

test('Ручной ввод времени и частоты, однократный запуск и отмена', () => {
  const ui=openSimulator(), items=ui.datasets[0];
  function edit() { ui.view.visible.find(row=>row.id==='0').content.children[1].listeners.click(); return ui.node('editorWindows').children[0]; }
  let section=edit();
  section.children[1].children[1].value='08:12:34';
  section.children[2].children[1].value='period';
  section.children[3].children[1].value='5'; section.children[3].children[2].value='60';
  ui.node('saveEditor').listeners.click();
  let intervals=ui.calculations.at(-1).intervals;
  assert.equal(new Date(Number(intervals[0].start)*1000).toISOString(),'2026-11-10T08:12:34.000Z');
  assert.equal(intervals[1].start-intervals[0].start,300);
  section=edit(); section.children[2].children[1].value='once'; ui.node('saveEditor').listeners.click();
  intervals=ui.calculations.at(-1).intervals; assert.equal(intervals.length,1);
  section=edit(); section.children[1].children[1].value='99:00:00'; ui.node('saveEditor').listeners.click();
  assert.match(ui.node('editorError').textContent,/Время начала/); assert.equal(ui.node('scheduleEditor').hidden,false);
  ui.node('cancelEditor').listeners.click(); assert.equal(ui.node('scheduleEditor').hidden,true);
  assert.equal(ui.calculations.at(-1).intervals.length,1);
});

test('Метка захватывается одним нажатием и освобождает обработчики после отпускания мыши', () => {
  const ui=openSimulator(), items=ui.datasets[0], handle=items.get({filter:row=>row.first})[0];
  const pointer=x => ({button:0,clientX:x,preventDefault(){},stopPropagation(){}});
  const start=pointer(100); start.target={className:'vis-item start-handle',querySelector:()=>handle.content};
  ui.node('timeline').listeners.mousedown(start);
  assert.equal(typeof ui.windowEvents.mousemove,'function');
  ui.windowEvents.mousemove(pointer(120));
  assert.equal(ui.node('dragTime').textContent,'00:10:00');
  ui.windowEvents.mouseup(pointer(120));
  assert.equal(Number(items.get(handle.id).start)-Number(handle.start),600000);
  assert.equal(ui.windowEvents.mousemove,undefined); assert.equal(ui.windowEvents.mouseup,undefined);
  assert.equal(ui.node('dragMarker').hidden,true);
});

test('Факт сохраняет исходные дату и статус, остается фоном и не увеличивает прогноз',()=>{
  const ui=openSimulator({factIntervals:[{start:'2026-11-08T01:02:03',end:'2026-11-08T01:02:23',state:'completed',name:'<Проба>'}]}),
    colors=()=>{
      ui.view.visible.forEach(row=>{row.content.getBoundingClientRect=()=>({top:50,bottom:100,height:50});});
      ui.timeline.handlers.changed();ui.flush();return ui.node('ganttRuns').context.rectangles.map(rect=>rect.color);
    };
  assert.equal(ui.datasets[0].get('fact:0:0'),undefined,'Факт не создает отдельный DOM-элемент Vis');
  assert.equal(ui.node('peak').textContent,'1 задание');
  const before=colors();assert.ok(before.length>0);
  const background=ui.node('ganttRuns').context.rectangles.find(rect=>rect.color==='#708090');
  assert.ok(background);assert.ok(background.width>0);
  ui.node('timeline').listeners.mousemove({clientX:background.x+background.width/2,clientY:80});
  assert.match(ui.node('ganttTooltip').textContent,/08\.11\.2026, 01:02:03/);
  assert.match(ui.node('ganttTooltip').textContent,/успешно завершено/);
  assert.match(ui.node('ganttTooltip').textContent,/<Проба>/);
  ui.node('grouping').value='subsystem';ui.node('grouping').listeners.change();ui.flush();
  assert.deepEqual(colors(),before,'Цвет подсистемы сохраняется после группировки');
  ui.api.updateSimulatorSettings(JSON.stringify({durationMode:'P95'}));ui.flush();
  assert.ok(colors().every(color=>before.includes(color)),'Пересчет не меняет палитру');
  let accepted='not-called';ui.timeline.options.onMoving({id:'fact:0:0',start:new Date()},value=>{accepted=value;});
  assert.equal(accepted,null);assert.equal(ui.node('changed').textContent,0);
});

test('Большая история рисуется без элементов Vis и не размножается при копировании черновика',()=>{
  const facts=Array.from({length:100000},(_,index)=>{
    const seconds=index%86400,time=new Date(Date.UTC(2026,10,8)+seconds*1000).toISOString().slice(0,19);
    return {start:time,end:time,state:'completed',name:'Массовая история'};
  });
  const ui=openSimulator({factIntervals:facts,unmappedIntervals:facts});
  ui.view.visible.forEach(row=>{row.content.getBoundingClientRect=()=>({top:50,bottom:100,height:50});});
  ui.timeline.handlers.changed();ui.flush();
  assert.ok(ui.datasets[0].rows.size<100,'Количество элементов диаграммы не зависит от числа фактических запусков');
  assert.ok(ui.node('ganttRuns').context.rectangles.length<10000,'Короткие факты агрегируются по видимому масштабу');
  const packet={jobs:[{enabled:true,schedule:{startTime:'00:00:00'},factIntervals:facts}],unmappedIntervals:facts};
  const copied=ui.api.Scheduler4000.copyWithSharedHistory(packet);
  assert.equal(copied.jobs[0].factIntervals,facts);assert.equal(copied.unmappedIntervals,facts);
  copied.jobs[0].enabled=false;copied.jobs[0].schedule.startTime='12:00:00';
  assert.equal(packet.jobs[0].enabled,true);assert.equal(packet.jobs[0].schedule.startTime,'00:00:00');
});

test('Индикатор загрузки показывает этап, время и снимается без пересчета диаграммы',()=>{
  const ui=openSimulator(),writes=ui.datasets[0].writes;
  assert.equal(ui.api.showCollectionProgress('Читаем журнал...'),'JS_OK');
  assert.equal(ui.node('collectionProgress').hidden,false);assert.match(ui.node('collectionElapsed').textContent,/Прошло:/);
  ui.api.showCollectionProgress('Сопоставляем запуски...');assert.equal(ui.node('collectionStage').textContent,'Сопоставляем запуски...');
  ui.api.showCollectionProgress('');assert.equal(ui.node('collectionProgress').hidden,true);
  assert.equal(ui.datasets[0].writes,writes);
});

test('Длинный факт не теряется при поиске видимого участка после коротких перекрытий',()=>{
  const ui=openSimulator(),core=ui.api.Scheduler4000;
  const rows=[{start:0,end:18000,displayStart:0,displayEnd:18000,searchEnd:18000,fact:true},
    {start:3600,end:3660,displayStart:3600,displayEnd:3660,searchEnd:18000,fact:true},
    {start:7200,end:7260,displayStart:7200,displayEnd:7260,searchEnd:18000,fact:true}];
  const marks=core.visibleRunMarks(rows,10800,11100,600);
  assert.equal(marks.length,1);assert.equal(marks[0].x,0);assert.equal(marks[0].right,600);
  assert.equal(marks[0].run,rows[0]);
});

test('При смене даты прогноза факт переносится на новую шкалу с прежней исходной датой',()=>{
  const ui=openSimulator({factIntervals:[{start:'2026-11-08T01:02:03',end:'2026-11-08T01:03:04',state:'failed',name:'Контроль даты'}]});
  function paint() {
    ui.view.visible.forEach(row=>{row.content.getBoundingClientRect=()=>({top:50,bottom:100,height:50});});
    ui.timeline.handlers.changed();ui.flush();
    return ui.node('ganttRuns').context.rectangles.find(rect=>rect.color==='#708090');
  }
  const before=paint();assert.ok(before);
  ui.api.updateSimulatorSettings(JSON.stringify({simulationDate:'2026-11-12',durationMode:'Med',fixedDurationSeconds:30}));
  const after=paint();assert.ok(after,'Факт остается на шкале после изменения дня');
  assert.equal(after.x,before.x);assert.equal(after.width,before.width);
  ui.node('timeline').listeners.mousemove({clientX:after.x+after.width/2,clientY:80});
  assert.match(ui.node('ganttTooltip').textContent,/08\.11\.2026/);
});

test('Подсказка объединенной фактической полосы выбирает запуск под указателем',()=>{
  const ui=openSimulator({factIntervals:[
    {start:'2026-11-08T01:00:00',end:'2026-11-08T02:00:00',state:'completed',name:'Первый запуск'},
    {start:'2026-11-08T02:00:00',end:'2026-11-08T03:00:00',state:'failed',name:'Второй запуск'}]});
  ui.view.visible.forEach(row=>{row.content.getBoundingClientRect=()=>({top:50,bottom:100,height:50});});
  ui.timeline.handlers.changed();ui.flush();
  const band=ui.node('ganttRuns').context.rectangles.find(rect=>rect.color==='#708090');assert.ok(band);
  ui.node('timeline').listeners.mousemove({clientX:band.x+band.width*.75,clientY:80});
  assert.match(ui.node('ganttTooltip').textContent,/Второй запуск/);
  assert.match(ui.node('ganttTooltip').textContent,/завершено с ошибкой/);
  assert.match(ui.node('ganttTooltip').textContent,/08\.11\.2026, 02:00:00/);
});

test('Наведение на фон факта показывает исходную дату и статус без подсказки Vis',()=>{
  const ui=openSimulator({factIntervals:[{start:'2026-11-08T01:02:03',end:'2026-11-08T01:03:04',state:'failed',name:'<Ошибка>'}]}),
    label=ui.view.visible.find(row=>row.id==='0').content, tooltip=ui.node('ganttTooltip'),
    pointer={clientX:240+3750/21600*479,clientY:80};
  label.getBoundingClientRect=()=>({top:50,bottom:100,height:50});ui.timeline.handlers.changed();ui.flush();
  ui.core.simulatePacket=()=>{throw new Error('Наведение не должно пересчитывать прогноз');};
  ui.node('timeline').listeners.mousemove(pointer);
  assert.equal(tooltip.hidden,false);assert.match(tooltip.textContent,/Факт: <Ошибка>/);
  assert.match(tooltip.textContent,/08\.11\.2026, 01:02:03/);assert.match(tooltip.textContent,/завершено с ошибкой/);
  assert.equal(ui.node('peak').textContent,'1 задание');assert.equal(ui.node('changed').textContent,0);
  ui.node('timeline').listeners.mousemove({...pointer,clientY:30});assert.equal(tooltip.hidden,true,'Шкала не относится к строке факта');
  ui.node('filter').value='другое';ui.node('filter').listeners.input();ui.flush();
  ui.node('timeline').listeners.mousemove(pointer);assert.equal(tooltip.hidden,true,'Скрытая строка не оставляет подсказку');
});

test('Подсказка несопоставленного активного факта показывает неизвестное окончание',()=>{
  const ui=openSimulator({unmappedIntervals:[{start:'2026-11-08T01:02:03',end:null,state:'active',name:'Фоновая работа'}]}),
    label=ui.view.visible.find(row=>row.id==='unmapped').content;
  label.getBoundingClientRect=()=>({top:110,bottom:160,height:50});ui.timeline.handlers.changed();ui.flush();
  ui.node('timeline').listeners.mousemove({clientX:400,clientY:140});
  assert.equal(ui.node('ganttTooltip').hidden,false);
  assert.match(ui.node('ganttTooltip').textContent,/Факт: Фоновая работа/);
  assert.match(ui.node('ganttTooltip').textContent,/окончание неизвестно/);
  assert.match(ui.node('ganttTooltip').textContent,/еще выполняется/);
});

test('Перенос закрепленного задания меняет только выбранное дневное окно',()=>{
  const windows=[{windowId:'early',startTime:'08:00:00',endTime:'09:00:00',startTimeSet:true,endTimeSet:true,repeatPeriod:600,repeatPause:0},
    {windowId:'late',startTime:'12:00:00',endTime:'13:00:00',startTimeSet:true,endTimeSet:true,repeatPeriod:600,repeatPause:0}];
  const ui=openSimulator({offline:false,pinned:true,dailySchedules:windows}),items=ui.datasets[0],
    handle=items.get({filter:row=>row.jobId==='0'&&row.windowId==='early'})[0],
    late=items.get({filter:row=>row.jobId==='0'&&row.windowId==='late'})[0];
  assert.ok(handle);assert.ok(late);
  assert.equal(handle.end,undefined,'Метка не предоставляет изменяемую правую границу');
  assert.equal(ui.timeline.options.editable.updateGroup,false);
  ui.timeline.options.onMove({...handle,start:new Date(Number(handle.start)+120000)},()=>{});ui.flush();
  const change=ui.messages.filter(message=>message.event==='draftChanged').at(-1).modifiedJobs[0];
  assert.equal(change.windowChanges.length,1);assert.equal(change.windowChanges[0].windowId,'early');
  assert.equal(change.windowChanges[0].newStartTime,'08:02:00');
  assert.equal(Number(items.get(late.id).start),Number(late.start));
  assert.equal(ui.messages.some(message=>message.event==='applySchedules'),false);
  assert.equal(ui.node('changed').textContent,1);
});

test('Выход переноса за окно и смена строки отклоняются без изменения модели',()=>{
  const ui=openSimulator({offline:false}),items=ui.datasets[0],handle=items.get({filter:row=>row.first})[0],
    original=Number(handle.start),calculations=ui.calculations.length;
  for(const candidate of [{...handle,start:new Date(Date.UTC(2026,10,9,23,59,59))},{...handle,group:'чужая строка'}]){
    let accepted='not-called';ui.timeline.options.onMoving(candidate,value=>{accepted=value;});assert.equal(accepted,null);
    ui.timeline.options.onMove(candidate,()=>{});ui.flush();
    assert.equal(Number(items.get(handle.id).start),original);assert.equal(ui.node('changed').textContent,0);
  }
  assert.equal(ui.calculations.length,calculations);assert.equal(ui.messages.some(message=>message.event==='applySchedules'),false);
});

test('Мелкие движения полосы объединяются в один кадр без пропуска одного пикселя', () => {
  const ui=openSimulator(), scroll=ui.node('timeScroll'), before=ui.chart.actions.length;
  for(let pixel=1;pixel<=3;pixel++) { scroll.scrollLeft=pixel; scroll.listeners.scroll(); }
  assert.equal(ui.chart.actions.length,before);
  ui.flush(); assert.equal(ui.chart.actions.length,before+1);
  assert.equal(ui.timeline.start,Date.UTC(2026,10,10)+90000);
  assert.equal(scroll.scrollLeft,3);
  scroll.listeners.scroll(); ui.flush(); assert.equal(ui.chart.actions.length,before+1);
});

test('Перемещение верхнего графика использует событие без чтения всего getOption', () => {
  const ui=openSimulator(), before=ui.chart.actions.length;
  ui.chart.getOption=()=>{throw new Error('Лишнее копирование настроек графика');};
  ui.chart.handlers.datazoom({batch:[{start:25,end:50}]}); ui.flush();
  assert.equal(ui.timeline.start,Date.UTC(2026,10,10,6));
  assert.equal(ui.timeline.end,Date.UTC(2026,10,10,12));
  assert.equal(ui.chart.actions.length,before,'Обратное событие не отправляется источнику');
});

test('После смены даты верхний график двигает текущие сутки', () => {
  const ui=openSimulator();
  ui.api.updateSimulatorSettings(JSON.stringify({simulationDate:'2026-11-11',durationMode:'Med',fixedDurationSeconds:60,
    maxThreadsThreshold:8,resolutionSeconds:60,offerPause:false})); ui.flush();
  ui.chart.handlers.datazoom({start:50,end:75}); ui.flush();
  assert.equal(ui.timeline.start,Date.UTC(2026,10,11,12));
  assert.equal(ui.timeline.end,Date.UTC(2026,10,11,18));
});

test('Красные полосы совпадают на обеих панелях и исчезают при равенстве лимиту', () => {
  const ui=openSimulator({bothEnabled:true,limit:1});
  const top=ui.node('chartCollisions'), bottom=ui.node('ganttCollisions');
  assert.equal(top.context.rectangles.length,6);
  assert.deepEqual(top.context.rectangles.map(rect=>[rect.x,rect.width]),bottom.context.rectangles.map(rect=>[rect.x,rect.width]));
  assert.ok(top.context.rectangles.every(rect=>rect.color==='rgba(215,45,55,0.16)'));
  assert.ok(top.context.rectangles[0].height<bottom.context.rectangles[0].height);
  ui.node('filter').value='нет такого задания'; ui.node('filter').listeners.input(); ui.flush();
  assert.equal(bottom.context.rectangles.length,6,'Фильтр строк не меняет общую нагрузку');
  ui.api.updateSimulatorSettings(JSON.stringify({simulationDate:'2026-11-10',durationMode:'Med',fixedDurationSeconds:60,
    maxThreadsThreshold:2,resolutionSeconds:60,offerPause:false}));
  assert.equal(top.context.rectangles.length,0); assert.equal(bottom.context.rectangles.length,0);
});

test('Отключенное задание настраивается, включение попадает в черновик и отменяется без применения', () => {
  const ui=openSimulator({offline:false});
  ui.node('enabledOnly').checked=false; ui.node('enabledOnly').listeners.change();
  function open(id) { ui.view.visible.find(row=>row.id===id).content.children[1].listeners.click(); }
  open('1'); assert.equal(ui.node('editorEnabled').checked,false);
  ui.node('editorEnabled').checked=true; ui.node('cancelEditor').listeners.click();
  assert.equal(ui.node('changed').textContent,0);
  open('1'); assert.equal(ui.node('editorEnabled').checked,false);
  ui.node('editorEnabled').checked=true;
  ui.node('editorWindows').children[0].children[1].children[1].value='08:11:12';
  ui.node('saveEditor').listeners.click(); ui.flush();
  const change=ui.messages.filter(message=>message.event==='draftChanged').at(-1).modifiedJobs[0];
  assert.equal(change.id,'1'); assert.equal(change.newEnabled,true);
  assert.equal(change.windowChanges[0].newStartTime,'08:11:12');
  assert.equal(ui.messages.some(message=>message.event==='applySchedules'),false);
  ui.api.requestSimulatorAction('rollback'); ui.flush();
  assert.equal(ui.node('changed').textContent,0);
  assert.equal(ui.messages.filter(message=>message.event==='draftChanged').at(-1).modifiedJobs.length,0);
  ui.node('enabledOnly').checked=true; ui.node('enabledOnly').listeners.change();
  open('0'); ui.node('editorEnabled').checked=false; ui.node('saveEditor').listeners.click(); ui.flush();
  assert.deepEqual(ui.view.visible.map(row=>row.id),[]);
  const disable=ui.messages.filter(message=>message.event==='draftChanged').at(-1).modifiedJobs[0];
  assert.equal(disable.newEnabled,false); assert.equal(disable.windowChanges.length,0);
});

test('Включенное задание без истории появляется в Ганте и нагрузке с длительностью из настроек',()=>{
  const ui=openSimulator({offline:false,withoutHistory:true,fallbackDuration:45});
  ui.api.acceptDetailedSchedule(JSON.stringify({id:'1',schedule:ui.packet.jobs[1].schedule,scheduleToken:'prepared-enable',enabled:true}));ui.flush();
  assert.deepEqual(ui.view.visible.map(row=>row.id),['0','1'],'Активный фильтр сразу пропускает включенное задание');
  const forecast=ui.calculations.at(-1);assert.equal(forecast.jobId,'1');assert.equal(forecast.status,'estimated');
  assert.equal(forecast.intervals[0].end-forecast.intervals[0].start,45);
  assert.ok(ui.datasets[0].get({filter:item=>item.first&&item.jobId==='1'}).length>0,'В Ганте есть метка начала');
  assert.equal(ui.node('peak').textContent,'2 задания');assert.match(ui.node('quality').textContent,/Без истории: 1.*45 с/);
  assert.match(ui.view.visible.find(row=>row.id==='1').content.children[3].textContent,/Без истории · 45 с/);
  const message=ui.messages.filter(item=>item.event==='draftChanged').at(-1);
  assert.equal(message.modifiedJobs[0].newEnabled,true);assert.equal(ui.messages.some(item=>item.event==='applySchedules'),false);
  let recalculated;const simulate=ui.core.simulatePacket;
  ui.core.simulatePacket=packet=>(recalculated=simulate(packet));
  ui.api.updateSimulatorSettings(JSON.stringify({simulationDate:'2026-11-10',durationMode:'Med',fixedDurationSeconds:75,
    maxThreadsThreshold:8,resolutionSeconds:60,offerPause:false}));ui.flush();
  assert.equal(recalculated.jobs[1].intervals[0].end-recalculated.jobs[1].intervals[0].start,75);
  assert.equal(recalculated.jobs[0].intervals[0].end-recalculated.jobs[0].intervals[0].start,60,'Измеренная длительность другого задания сохранена');
  ui.api.requestSimulatorAction('rollback');ui.flush();assert.deepEqual(ui.view.visible.map(row=>row.id),['0']);
});

test('Короткие запуски агрегируются для рисунка без потери количества, приближение возвращает интервалы',()=>{
  const {core}=openSimulator(), runs=Array.from({length:1000},(_,i)=>({displayStart:i*10,displayEnd:i*10+1,start:i*10,end:i*10+1}));
  const coarse=core.visibleRunMarks(runs,0,10000,500);
  assert.equal(coarse.length,1);assert.equal(coarse[0].count,1000);assert.equal(runs.length,1000);
  const fine=core.visibleRunMarks(runs,0,60,600);
  assert.equal(fine.length,6);assert.ok(fine.every(mark=>!mark.tiny&&mark.count===1));
  const hidden=core.visibleRunMarks(runs,500,600,600);
  assert.equal(hidden[0].first,500);assert.equal(hidden.length,10);
});

test('Количество сгруппированных запусков стоит справа и не скрывается меткой начала',()=>{
  const ui=openSimulator({zeroDuration:true,frequent:true}),label=ui.view.visible.find(row=>row.id==='0').content;
  label.getBoundingClientRect=()=>({top:50,bottom:100,height:50});
  ui.node('showDay').listeners.click();ui.flush();ui.timeline.handlers.changed();ui.flush();
  const context=ui.node('ganttRuns').context,text=context.texts.find(value=>value.value==='1440 запусков · 0 с');
  assert.ok(text);assert.equal(text.align,'right');assert.ok(text.x>ui.node('ganttRuns').clientWidth-50);
  assert.equal(context.textAlign,'left');assert.equal(ui.node('peak').textContent,'0 заданий');
});

test('Нулевая длительность явно подписана и не увеличивает параллельную нагрузку',()=>{
  const ui=openSimulator({zeroDuration:true,bothEnabled:true});
  assert.equal(ui.node('peak').textContent,'1 задание');
  assert.match(ui.node('quality').textContent,/0 с/);
  assert.match(ui.datasets[0].get({filter:row=>row.first&&row.jobId==='0'})[0].content.textContent,/0 с/);
});

test('Обзорная подсказка показывает максимум за интервал, приближение использует точные границы',()=>{
  const ui=openSimulator(), begin=Date.UTC(2026,10,10);
  assert.match(ui.chart.options.tooltip.formatter([{value:[begin,1,begin+60000,false]}]),/Максимум за интервал.*00:00:00 — 00:01:00/);
  ui.chart.handlers.datazoom({startValue:begin,endValue:begin+300000});ui.flush();
  const data=ui.chart.options.series[0].data;
  assert.ok(data.slice(0,-1).every(row=>row[3]===true));
  assert.equal(data[0][2],begin+60000);
  assert.match(ui.chart.options.tooltip.formatter([{value:data[0]}]),/^Одновременно: 1/);
});

test('Представление восстанавливается и сохраняется без изменения расписаний',()=>{
  const settings={enabledOnly:false,grouping:'none',query:'отключ',technicalNames:true,pinnedJobIds:['1'],rangeStartSeconds:3600,rangeSpanSeconds:7200};
  const ui=openSimulator({offline:false,preferences:settings}), begin=Date.UTC(2026,10,10);
  assert.equal(ui.node('filter').value,'отключ');assert.equal(ui.node('enabledOnly').checked,false);
  assert.equal(ui.node('rangeLabel').textContent,'01:00 - 03:00');assert.equal(ui.node('technicalNames').checked,true);
  assert.deepEqual(ui.view.visible.map(row=>row.id),['1']);
  ui.node('filter').value='';ui.node('filter').listeners.input();ui.flush();
  const saved=ui.messages.filter(message=>message.event==='preferencesChanged').at(-1);
  assert.equal(saved.preferences.query,'');assert.equal(saved.preferences.rangeStartSeconds,3600);
  assert.equal(saved.preferences.rangeSpanSeconds,7200);assert.equal(saved.revision,1);
  assert.equal(ui.messages.filter(message=>message.event==='applySchedules').length,0);
  assert.ok(ui.chart.options.series[0].data[0][0]>=begin);
});

test('Прокрученная строка обрезается границей шкалы, отметки не заходят на даты',()=>{
  const ui=openSimulator(), label=ui.view.visible.find(row=>row.id==='0').content;
  label.getBoundingClientRect=()=>({top:40,bottom:70,height:30});
  ui.timeline.handlers.changed();ui.flush();
  const canvas=ui.node('ganttRuns');assert.ok(canvas.context.rectangles.length>0);
  assert.ok(canvas.context.rectangles.every(rect=>rect.y>=46&&rect.y+rect.height<=160));
  label.getBoundingClientRect=()=>({top:10,bottom:40,height:30});ui.timeline.handlers.scroll();ui.flush();
  assert.equal(canvas.context.rectangles.length,0);
});

test('Прокрутка встроенной Vis обновляет новые строки и повторно использует агрегацию видимых',()=>{
  const ui=openSimulator({bothEnabled:true});const first=ui.view.visible.find(row=>row.id==='0').content,
    second=ui.view.visible.find(row=>row.id==='1').content;
  first.getBoundingClientRect=()=>({top:60,bottom:100,height:40});
  second.getBoundingClientRect=()=>({top:180,bottom:220,height:40});
  ui.timeline.handlers.changed();ui.flush();
  let aggregations=0;const aggregate=ui.core.visibleRunMarks;
  ui.core.visibleRunMarks=(...args)=>{aggregations++;return aggregate(...args);};
  ui.core.simulatePacket=()=>{throw new Error('Прокрутка запустила расчет');};
  for(let index=0;index<20;index++) ui.timeline.handlers.scroll();ui.flush();
  assert.equal(aggregations,0);
  first.getBoundingClientRect=()=>({top:-20,bottom:20,height:40});
  second.getBoundingClientRect=()=>({top:60,bottom:100,height:40});
  ui.timeline.handlers.verticalDrag();ui.flush();assert.equal(aggregations,1);
  assert.ok(ui.node('ganttRuns').context.rectangles.length>0);
});

test('Подробности строки скрыты по умолчанию, раскрываются без расчета и сохраняются при обновлении строки',()=>{
  const ui=openSimulator(),label=ui.view.visible.find(row=>row.id==='0').content;
  assert.equal(label.children[2].textContent,'Подробнее');assert.equal(label.children[3].hidden,true);
  assert.match(label.children[3].textContent,/По истории: 60 с/);
  assert.ok(!label.children[3].textContent.includes(ui.packet.jobs[0].historyQuality),'Общее пояснение истории не дублируется под названием');
  ui.core.simulatePacket=()=>{throw new Error('Подробнее запустило расчет');};
  label.children[2].listeners.click();ui.flush();assert.equal(label.children[3].hidden,false);
  assert.equal(label.children[2].textContent,'Свернуть');
  label.children[2].listeners.click();ui.flush();assert.equal(label.children[3].hidden,true);
});

test('В 1С редактор открывается отдельной формой, основной HTML не показывает и не скрывает карточку',()=>{
  const ui=openSimulator({offline:false,nativeEditor:true});
  ui.api.openSimulatorJobEditor('0');ui.flush();
  assert.equal(ui.messages.filter(message=>message.event==='editSchedule').at(-1).jobId,'0');
  assert.equal(ui.node('scheduleEditor').hidden,true);assert.equal(ui.node('editorWindows').children.length,0);
  const schedule=structuredClone(ui.packet.jobs[0].schedule);schedule.startTime='08:01:02';
  ui.api.acceptDetailedSchedule(JSON.stringify({id:'0',schedule,scheduleToken:'prepared-test',enabled:false}));ui.flush();
  const change=ui.messages.filter(message=>message.event==='draftChanged').at(-1).modifiedJobs[0];
  assert.equal(change.newEnabled,false);assert.equal(change.scheduleToken,'prepared-test');
  assert.equal(ui.messages.filter(message=>message.event==='applySchedules').length,0);
});

test('Отдельный HTML-редактор возвращает правки или отмену без изменения основного прогноза',()=>{
  const ui=openSimulator({offline:false}), calculations=ui.calculations.length;
  ui.api.initJobEditor(JSON.stringify(ui.packet.jobs[0]));
  const section=ui.node('editorWindows').children[0],mode=section.children[2].children[1];
  section.children[1].children[1].value='08:12:34';mode.children[2].listeners.click();
  section.children[4].children[1].value='60';section.children[4].children[2].choose('1');
  ui.node('saveEditor').listeners.click();
  const result=ui.messages.at(-1);assert.equal(result.event,'editorAccept');assert.equal(result.enabled,true);
  assert.equal(result.windowChanges[0].newStartTime,'08:12:34');
  assert.equal(result.windowChanges[0].newRepeatPeriod,1);assert.equal(result.windowChanges[0].newRepeatPause,60);
  assert.equal(ui.calculations.length,calculations);assert.equal(ui.node('scheduleEditor').hidden,false,'Закрытие выполняет форма 1С');
  ui.node('cancelEditor').listeners.click();assert.deepEqual(ui.messages.at(-1),{event:'editorCancel'});
});

test('Маска времени расставляет двоеточия, дополняет секунды и отклоняет время вне суток',()=>{
  const ui=openSimulator({offline:false});ui.api.initJobEditor(JSON.stringify(ui.packet.jobs[0]));
  const input=ui.node('editorWindows').children[0].children[1].children[1];
  input.setSelectionRange=function(start,end){this.selectionStart=start;this.selectionEnd=end;};
  for(const [typed,masked,complete] of [['1132','11:32','11:32:00'],['081234','08:12:34','08:12:34'],['8:12','08:12','08:12:00']]){
    input.value=typed;input.setSelectionRange(typed.length,typed.length);input.listeners.input();
    assert.equal(input.value,masked);assert.equal(input.selectionStart,masked.length);
    input.listeners.blur();assert.equal(input.value,complete);assert.equal(ui.node('editorError').textContent,'');
  }
  input.value='24:00:00';input.listeners.blur();assert.match(ui.node('editorError').textContent,/23:59:59/);
  const before=ui.messages.length;ui.node('saveEditor').listeners.click();assert.equal(ui.messages.length,before);
  input.value='1132';ui.node('saveEditor').listeners.click();
  assert.equal(ui.messages.at(-1).windowChanges[0].newStartTime,'11:32:00','Подтверждение нормализует и без события blur');
});

test('Редактирование полной маски заменяет цифры и пропускает разделители при удалении',()=>{
  const ui=openSimulator({offline:false});ui.api.initJobEditor(JSON.stringify(ui.packet.jobs[0]));
  const input=ui.node('editorWindows').children[0].children[1].children[1];
  input.setSelectionRange=function(start,end){this.selectionStart=start;this.selectionEnd=end;};
  input.value='08:12:34';input.setSelectionRange(3,3);let prevented=false;
  input.listeners.keydown({key:'4',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(input.value,'08:42:34');assert.equal(input.selectionStart,4);
  input.setSelectionRange(3,3);input.listeners.keydown({key:'Backspace'});assert.equal(input.selectionStart,2);
  input.setSelectionRange(2,2);input.listeners.keydown({key:'Delete'});assert.equal(input.selectionStart,3);
  input.setSelectionRange(6,6);input.listeners.keydown({keyCode:101,preventDefault(){}});
  assert.equal(input.value,'08:42:54','Цифровая клавиатура работает и без event.key');
});

test('HTML-карточка повторно использует поля и передает подробные правки только своей форме',()=>{
  const ui=openSimulator({offline:false});ui.api.initJobEditor(JSON.stringify(ui.packet.jobs[0]));
  const section=ui.node('editorWindows').children[0],mode=section.children[2].children[1];
  mode.children[2].listeners.click();assert.equal(section.children[3].children[1].disabled,true);
  assert.equal(section.children[4].children[1].disabled,false);assert.equal(mode.children[2].className,'selected');
  assert.equal(mode.children[2]['aria-pressed'],undefined,'Роль кнопки WebKit не меняется при выборе режима');
  assert.equal(ui.node('scheduleEditor').hidden,false);
  ui.api.initJobEditor(JSON.stringify(ui.packet.jobs[0]));
  assert.equal(ui.node('editorWindows').children[0],section);assert.equal(section.children[2].children[1],mode);
  ui.node('detailedSchedule').listeners.click();ui.flush();
  assert.equal(ui.messages.at(-1).event,'editorDetailed');
  assert.equal(ui.node('scheduleEditor').hidden,false,'HTML-документ остается открытым до решения пользователя');
  assert.equal(ui.messages.filter(message=>message.event==='applySchedules').length,0);
  ui.node('cancelEditor').listeners.click();assert.equal(ui.messages.at(-1).event,'editorCancel');
  assert.equal(ui.messages.filter(message=>message.event==='draftChanged').length,0,'До закрытия нет публикации правок основной форме');
});

test('Новое отключенное задание видно при фильтрах, сохраняет старые правки и удаляется отменой',()=>{
  const ui=openSimulator({offline:false,nativeEditor:true});
  ui.api.acceptDetailedSchedule(JSON.stringify({id:'0',enabled:false,schedule:ui.packet.jobs[0].schedule}));
  const job=JSON.parse(JSON.stringify(ui.packet.jobs[1]));job.id='new';job.isNew=true;
  job.durationMed=null;job.durationP95=null;job.sampleCount=0;
  ui.node('filter').value='нет совпадений';
  ui.api.acceptNewSimulatorJob(JSON.stringify(job));ui.flush();
  assert.deepEqual(ui.view.visible.map(row=>row.id),['new']);
  const changes=ui.messages.filter(item=>item.event==='draftChanged').at(-1).modifiedJobs;
  assert.equal(changes.length,2);assert.ok(changes.some(item=>item.id==='0'&&item.newEnabled===false));
  assert.ok(changes.some(item=>item.id==='new'&&item.windowChanges.length===0));
  assert.throws(()=>ui.api.acceptNewSimulatorJob(JSON.stringify(job)),/повторное/);
  ui.api.acceptDetailedSchedule(JSON.stringify({id:'new',enabled:true,schedule:job.schedule}));ui.flush();
  assert.ok(ui.calculations.at(-1).intervals.length>0);
  assert.equal(ui.calculations.at(-1).intervals[0].end-ui.calculations.at(-1).intervals[0].start,60);
  ui.api.requestSimulatorAction('rollback');ui.flush();
  assert.equal(ui.datasets[1].get('new'),undefined);
  assert.equal(ui.messages.filter(item=>item.event==='draftChanged').at(-1).modifiedJobs.length,0);
});

test('Добавление запрещено в автономном отчете',()=>{
  const ui=openSimulator();assert.throws(()=>ui.api.acceptNewSimulatorJob('{}'),/недоступно/);
});

test('Отмена в отчете сохраняет новое задание, вошедшее в экспортированный снимок',()=>{
  const ui=openSimulator();ui.packet.jobs[1].isNew=true;
  ui.api.initSimulator(JSON.stringify(ui.packet));ui.flush();
  ui.api.requestSimulatorAction('rollback');ui.flush();
  assert.ok(ui.view.visible.some(row=>row.id==='1'));
});

test('Карточка добавления передает тип, название, ключ и источник параметров после подробного диалога',()=>{
  const ui=openSimulator({offline:false}),job=JSON.parse(JSON.stringify(ui.packet.jobs[0]));
  job.enabled=false;job.creationTypes=[{id:'TypeA',name:'Тип А',key:'',parameterSources:[{id:'source',name:'Источник'}]}];
  ui.api.initJobEditor(JSON.stringify(job));
  // У DOM-макета нет автоматического выбора первого option.
  ui.node('creationType').value='TypeA';ui.node('creationType').listeners.change();
  ui.node('creationName').value='Новый экземпляр';ui.node('creationKey').value='мой ключ';ui.node('creationSource').value='source';
  ui.node('detailedSchedule').listeners.click();ui.flush();
  const message=ui.messages.at(-1);assert.equal(message.event,'editorDetailed');
  assert.deepEqual(message.creation,{metadataName:'TypeA',name:'Новый экземпляр',key:'мой ключ',parameterSourceId:'source'});
  job.creation=message.creation;ui.api.initJobEditor(JSON.stringify(job));
  assert.equal(ui.node('creationName').value,'Новый экземпляр');assert.equal(ui.node('creationSource').value,'source');
  ui.node('saveEditor').listeners.click();assert.equal(ui.messages.at(-1).event,'editorAccept');
  assert.equal(ui.node('saveEditor').textContent,'Добавить в прогноз');
});
