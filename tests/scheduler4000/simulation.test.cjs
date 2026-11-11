'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const template = fs.readFileSync(path.resolve(__dirname,
  '../../EPF/scheduler4000/Templates/МакетHTML/Ext/Template.txt'), 'utf8');
const context = vm.createContext({});
vm.runInContext(template.match(/<script id="scheduler4000-core">([\s\S]*?)<\/script>/)[1], context);
const core = context.Scheduler4000;
const oracles = JSON.parse(fs.readFileSync(path.join(__dirname,
  'fixtures/schedule-oracles-8.3.27.2074.json'), 'utf8'));
const config = {simulationDate: '2026-11-10', collectedAt: '2026-11-10T00:00:00',
  durationMode: 'Med', maxThreadsThreshold: 8, resolutionSeconds: 60};
const begin = core.parseMoment(config.simulationDate);
function schedule(name) { return structuredClone(oracles.find(item => item.name === name).schedule); }
function job(name, extra = {}) {
  return {id: 'test', enabled: true, schedule: schedule(name), durationMed: 20, durationP95: 40,
    lastStart: '2026-11-09T12:00:00', lastEnd: '2026-11-09T12:00:20', ...extra};
}
function moments(result) { return Array.from(result.intervals, item => core.formatMoment(item.start)); }

for (const oracle of oracles) {
  test('Нативные эталоны: ' + oracle.name, () => {
    assert.equal(oracle.roundTrip, true);
    for (const point of oracle.checks) {
      assert.equal(core.executionRequired(oracle.schedule, point.at, point.lastStart, point.lastEnd),
        point.expected, JSON.stringify(point));
    }
  });
}

test('Период 0 с паузой не включает повтор, вариант 1+60 дает интервал 80 секунд', () => {
  const once = core.simulateJob(job('repeat-pause'), config);
  assert.equal(once.intervals.length, 1);
  const pause = core.simulateJob(job('minimal-period-with-pause'), config);
  assert.equal(pause.intervals[1].start - pause.intervals[0].start, 80);
});

test('Длительность больше периода, дробные секунды и нулевая длительность', () => {
  const long = core.simulateJob(job('repeat-period', {durationMed: 90}), config);
  assert.equal(long.intervals[1].start - long.intervals[0].start, 90);
  const fractional = core.simulateJob(job('repeat-period', {durationMed: 60.1}), config);
  assert.equal(fractional.intervals[1].start - fractional.intervals[0].start, 61);
  const zero = core.simulateJob(job('repeat-period', {durationMed: 0}), config);
  assert.equal(zero.intervals[1].start - zero.intervals[0].start, 60);
  assert.equal(zero.intervals[0].start, zero.intervals[0].end);
  const load = core.analyzeConcurrency(zero.intervals, begin, begin + 86400, 8, 60);
  assert.equal(load.peak, 0);
});

test('Конец окна ограничивает старт, принудительное завершение обрезает выполнение', () => {
  const forced = core.simulateJob(job('forced-finish', {durationMed: 1200}), config).intervals[0];
  assert.equal(core.formatMoment(forced.start), '2026-11-10T22:55:00');
  assert.equal(core.formatMoment(forced.end), '2026-11-10T23:00:00');
  assert.equal(forced.forced, true);
  const boundedJob = job('time-window', {durationMed: 7200});
  const bounded = core.simulateJob(boundedJob, config).intervals[0];
  assert.equal(core.formatMoment(bounded.end), '2026-11-10T10:00:00');
  assert.equal(bounded.forced, false);
  boundedJob.schedule.completionInterval = 30;
  const interval = core.simulateJob(boundedJob, config).intervals[0];
  assert.equal(interval.end - interval.start, 30);
  assert.equal(interval.forced, true);
});

test('Граница завершения допускает точечный прерванный запуск', () => {
  const value = job('completion-boundary', {durationMed: 60});
  value.schedule.startTime = '23:00:00';
  const result = core.simulateJob(value, config);
  assert.equal(result.intervals.length, 1);
  assert.equal(result.intervals[0].end, result.intervals[0].start);
  assert.equal(result.intervals[0].forced, true);
});

test('Детальные окна разделяют одно состояние задания и не создают параллельные экземпляры', () => {
  const result = core.simulateJob(job('detailed-overlap', {durationMed: 900}), config);
  assert.equal(result.intervals[0].windowId, 'daily:0');
  for (let index = 1; index < result.intervals.length; index++) {
    assert.ok(result.intervals[index].start >= result.intervals[index - 1].end);
  }
  assert.equal(result.intervals.some(item => item.windowId === 'root'), false);
  const once = core.simulateJob(job('detailed-once'), config);
  assert.deepEqual(moments(once), ['2026-11-10T08:00:00', '2026-11-10T14:00:00']);
  const equal = job('detailed-once');
  equal.schedule.dailySchedules[1].startTime = '08:00:00';
  assert.equal(core.simulateJob(equal, config).intervals.length, 1);
});

test('Ночной интервал получает завершение на следующих сутках, отображение обрезается', () => {
  const value = job('night-completion', {durationMed: 14400});
  const result = core.simulateJob(value, config);
  const late = result.intervals.find(item => core.formatMoment(item.start) === '2026-11-10T22:00:00');
  assert.ok(late);
  assert.equal(core.formatMoment(late.end), '2026-11-11T01:00:00');
  assert.equal(late.displayEnd, begin + 86400);
  assert.equal(late.forced, true);
});

test('Будущие сутки учитывают моделирование после снимка и переходящую занятость', () => {
  const value = job('daily', {durationMed: 90,
    lastStart: '2026-11-09T23:58:00', lastEnd: '2026-11-09T23:58:30'});
  value.schedule.repeatPeriod = 60;
  const future = {...config, collectedAt: '2026-11-09T23:59:30'};
  const result = core.simulateJob(value, future);
  const first = result.intervals[0];
  assert.equal(core.formatMoment(first.start), '2026-11-09T23:59:30');
  assert.equal(core.formatMoment(first.end), '2026-11-10T00:01:00');
  assert.equal(first.displayStart, begin);
  assert.equal(first.carryIn, true);
  assert.equal(result.intervals[1].start, first.end);
});

test('Дневной и недельный повтор продвигается по известному состоянию', () => {
  const value = job('every-two-days');
  const result = core.simulateJob(value, {...config, simulationDate: '2026-11-13'});
  assert.equal(result.intervals.length, 1);
  assert.equal(core.formatMoment(result.intervals[0].start), '2026-11-13T00:00:00');
  const day = core.simulateJob(value, {...config, simulationDate: '2026-11-12'});
  assert.equal(day.intervals.length, 0);
});

test('Неизвестное состояние не подменяется известным отсутствием запусков', () => {
  const unknown = job('default-once', {lastStart: null, lastEnd: null});
  assert.equal(core.simulateJob(unknown, config).status, 'unknown-history');
  const never = {...unknown, historyState: 'never'};
  assert.equal(core.simulateJob(never, config).intervals.length, 1);
  const futureFact = job('daily', {lastStart: '2026-11-11T00:00:00', lastEnd: '2026-11-11T00:01:00'});
  assert.equal(core.simulateJob(futureFact, config).status, 'unknown-history');
  const active = job('daily', {lastEnd: null});
  assert.equal(core.simulateJob(active, config).status, 'estimated');
});

test('Выполняющееся задание 26 секунд при периоде 15 получает непрерывный условный прогноз',()=>{
  const value=job('repeat-period',{durationMed:26,durationP95:26,lastStart:'2026-11-09T23:59:55',lastEnd:null});
  value.schedule.startTime='00:00:00';value.schedule.repeatPeriod=15;value.schedule.endTimeSet=false;
  const saved=JSON.stringify(value),result=core.simulateJob(value,config);
  assert.equal(result.status,'estimated');assert.equal(result.estimateKind,'active');
  assert.equal(result.assumedEnd,'2026-11-10T00:00:21');assert.equal(result.intervals[0].carryIn,true);
  assert.equal(result.intervals[0].displayStart,begin);
  assert.ok(result.intervals.length>3000);
  result.intervals.slice(1).forEach((entry,index)=>assert.equal(entry.start,result.intervals[index].end));
  const marks=core.visibleRunMarks(result.intervals,begin+35*60,begin+45*60,1200);
  assert.equal(marks.length,1);assert.equal(marks[0].x,0);assert.equal(marks[0].right,1200);
  assert.equal(JSON.stringify(value),saved,'Оценка окончания не подменяет факт');
});

test('Просроченная оценка входящего запуска переносится за границу исходного состояния',()=>{
  const value=job('repeat-period',{lastStart:'2026-11-09T20:00:00',lastEnd:null});
  const result=core.simulateJob(value,config);
  assert.equal(result.assumedEnd,'2026-11-10T00:00:20');assert.match(result.reason,/Условный прогноз/);
  assert.equal(core.simulateJob({...value,durationMed:0},config).status,'unknown-active');
});

test('Видимые участки нагрузки выбираются без полного обхода большого массива',()=>{
  const rows=Array.from({length:100000},(_,index)=>({start:index,end:index+1,load:1}));
  let reads=0;const proxy=new Proxy(rows,{get(target,key){if(/^\d+$/.test(String(key))) reads++;return target[key];}});
  const selected=core.visibleTimeRange(proxy,50000,50010);
  assert.equal(selected.length,10);assert.equal(selected[0].start,50000);assert.ok(reads<60,reads);
});

test('Отсутствие длительности использует настройку в Med и P95, реальные нули сохраняются',()=>{
  const missing=job('repeat-period',{durationMed:null,durationP95:null});
  for(const mode of ['Med','P95']) {
    assert.equal(core.durationFor(missing,{...config,durationMode:mode,fixedDurationSeconds:45}),45);
    assert.equal(core.durationFor({...missing,durationMed:0,durationP95:0},{...config,durationMode:mode,fixedDurationSeconds:45}),0);
  }
  assert.equal(core.durationFor(job('repeat-period'),{...config,fixedDurationSeconds:45}),20);
  assert.equal(core.durationFor(missing,{...config,fixedDurationSeconds:0}),null);
});

test('Без истории строится явно условный сценарий с начала дня, без выдуманного прошлого',()=>{
  const missing=job('repeat-period',{durationMed:null,durationP95:null,lastStart:null,lastEnd:null});
  const result=core.simulateJob(missing,{...config,collectedAt:'2026-11-09T12:00:00',fixedDurationSeconds:45});
  assert.equal(result.status,'estimated');assert.match(result.reason,/Условный прогноз без истории/);
  assert.ok(result.intervals.length>0);assert.equal(result.intervals[0].start,begin+core.timeSeconds(missing.schedule.startTime));
  assert.ok(result.intervals.every(interval=>interval.start>=begin));
  assert.equal(result.intervals[0].end-result.intervals[0].start,45);
  assert.equal(missing.lastStart,null);assert.equal(missing.lastEnd,null);
  const fixed=core.simulateJob(missing,{...config,durationMode:'Fixed',fixedDurationSeconds:75});
  assert.equal(fixed.status,'estimated');assert.equal(fixed.intervals[0].end-fixed.intervals[0].start,75);
  const disabled=core.simulateJob({...missing,enabled:false},{...config,fixedDurationSeconds:45});
  assert.equal(disabled.status,'disabled');assert.equal(disabled.intervals.length,0);
});

test('Длительность без истории не скрывает известный незавершенный запуск и календарные ограничения',()=>{
  const missing=job('daily',{durationMed:null,durationP95:null,lastEnd:null});
  assert.equal(core.simulateJob(missing,{...config,fixedDurationSeconds:45}).status,'unknown-active');
  const calendar=job('repeat-period',{durationMed:null,durationP95:null,lastStart:null,lastEnd:null});
  calendar.schedule.daysOfWeek=[1];
  assert.equal(core.simulateJob(calendar,{...config,fixedDurationSeconds:45}).intervals.length,0,'Вторник не превращается в разрешенный понедельник');
});

test('Факт не добавляется в прогнозную нагрузку, отключенные задания остаются без прогнозов', () => {
  const value = job('repeat-period');
  value.factIntervals = [{start: '2026-11-09T00:00:00', end: '2026-11-10T00:00:00'}];
  const result = core.simulatePacket({config, jobs: [value, {...value, id: 'disabled', enabled: false}]});
  assert.equal(result.load.peak, 1);
  assert.equal(result.jobs[1].status, 'disabled');
  assert.equal(result.jobs[1].intervals.length, 0);
});

test('Без истории: 600 секунд работы при периоде 60 дают непрерывную полосу',()=>{
  const value=job('daily',{durationMed:null,durationP95:null,lastStart:null,lastEnd:null});
  value.schedule.repeatPeriod=60;value.schedule.startTime='00:00:00';value.schedule.startTimeSet=true;
  const result=core.simulateJob(value,{...config,fixedDurationSeconds:600});
  assert.equal(result.status,'estimated');assert.ok(result.intervals.length>1);
  assert.equal(result.intervals[0].end-result.intervals[0].start,600);
  assert.equal(result.intervals[1].start,result.intervals[0].end);
  const marks=core.visibleRunMarks(result.intervals,begin,begin+300,1000);
  assert.equal(marks.length,1);assert.equal(marks[0].x,0);assert.equal(marks[0].right,1000);
  assert.equal(marks[0].zero,false);
});

test('Часовой пояс компьютера не участвует в разборе, календарные ошибки отклоняются', () => {
  assert.equal(core.formatMoment(core.parseMoment('2026-11-10T08:00:00')), '2026-11-10T08:00:00');
  assert.throws(() => core.parseMoment('2026-02-30'));
  assert.throws(() => core.parseMoment('2026-11-10T08:00:00Z'));
});

test('JSON отчета сохраняет специальные символы и не закрывает тег script', () => {
  const value = {name: '</script><script>alert("тест")</script>', value: '<>&\u2028\u2029Кавычки "'};
  const encoded = core.safeJSON(value);
  assert.doesNotMatch(encoded, /[<>&\u2028\u2029]/);
  assert.deepEqual(JSON.parse(encoded), value);
});
