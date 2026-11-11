'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const template = fs.readFileSync(path.resolve(__dirname,
  '../../EPF/scheduler4000/Templates/МакетHTML/Ext/Template.txt'), 'utf8');
const context = vm.createContext({setTimeout});
vm.runInContext(template.match(/<script id="scheduler4000-core">([\s\S]*?)<\/script>/)[1], context);
const core = context.Scheduler4000;
const oracles = JSON.parse(fs.readFileSync(path.join(__dirname,
  'fixtures/schedule-oracles-8.3.27.2074.json'), 'utf8'));
const config = {simulationDate: '2026-11-10', collectedAt: '2026-11-10T00:00:00',
  durationMode: 'Med', maxThreadsThreshold: 2, resolutionSeconds: 60};
function job(id, options = {}) {
  const schedule = structuredClone(oracles.find(item => item.name === 'repeat-period').schedule);
  schedule.endTime = '08:04:59'; schedule.endTimeSet = true;
  return {id, name: id, enabled: true, pinned: false, durationMed: 20, durationP95: 40,
    lastStart: '2026-11-09T08:00:00', lastEnd: '2026-11-09T08:00:20', schedule, ...options};
}
function packet(jobs) { return {config, jobs}; }
function plain(value) { return JSON.parse(JSON.stringify(value)); }

test('Условный прогноз без истории участвует в нагрузке, но не сдвигается оптимизатором',async()=>{
  const missing=job('missing',{durationMed:null,durationP95:null,lastStart:null,lastEnd:null});
  const input={config:{...config,fixedDurationSeconds:45},jobs:[missing,job('measured')]};
  const result=await core.optimizePacket(input);
  assert.ok(result.before.peak>=2);assert.deepEqual(plain(result.packet.jobs[0]),missing);
  assert.ok(result.excluded.some(entry=>entry.jobId==='missing'&&/Условный прогноз/.test(entry.reason)));
  assert.equal(core.pauseProposals(input,true).some(entry=>entry.jobId==='missing'),false);
});

test('Фазы детерминированы, цель улучшается и сохраняется число запусков', async () => {
  const input = packet([job('b'), job('a')]);
  const saved = JSON.stringify(input);
  const result = await core.optimizePacket(input);
  assert.equal(result.cancelled, false);
  assert.ok(result.after.objective < result.before.objective);
  assert.equal(result.packet.jobs.find(item => item.id === 'a').schedule.startTime, '08:00:20');
  assert.equal(result.packet.jobs.find(item => item.id === 'b').schedule.startTime, '08:00:00');
  assert.equal(JSON.stringify(input), saved);
  for (const source of input.jobs) {
    const changed = result.packet.jobs.find(item => item.id === source.id);
    assert.equal(core.preservesWork(core.simulateJob(source, config), core.simulateJob(changed, config)), true);
  }
  const repeated = await core.optimizePacket(input);
  assert.deepEqual(plain(result.packet), plain(repeated.packet));
});

test('После ручного переноса поиск идет от текущего времени, сохраняя три запуска', async () => {
  const baseline = packet([job('a'), job('b')]), draft = structuredClone(baseline);
  draft.jobs.forEach(value => { value.schedule.startTime = '08:02:00'; });
  const savedBaseline = JSON.stringify(baseline), savedDraft = JSON.stringify(draft);
  const result = await core.optimizePacket(draft, baseline);
  assert.equal(result.before.peak, 2);
  assert.equal(result.after.peak, 1);
  assert.equal(result.packet.jobs[0].schedule.startTime, '08:02:20');
  result.packet.jobs.forEach((value, index) => {
    const before = core.simulateJob(draft.jobs[index], config), after = core.simulateJob(value, config);
    assert.equal(before.intervals.length, 3);
    assert.equal(after.intervals.length, 3);
    assert.equal(core.preservesWork(before, after), true);
  });
  assert.equal(JSON.stringify(baseline), savedBaseline);
  assert.equal(JSON.stringify(draft), savedDraft);
});

test('Известный последний запуск без измеренной длительности не разрешает автоматический сдвиг', async () => {
  for (const durationMode of ['Med', 'P95', 'Fixed']) {
    const missing = job('missing', {durationMed:null, durationP95:null});
    const input = {config:{...config, durationMode, fixedDurationSeconds:20}, jobs:[missing]};
    const result = await core.optimizePacket(input);
    assert.equal(result.evaluated, 0);
    assert.deepEqual(plain(result.packet.jobs[0]), missing);
    assert.match(result.excluded[0].reason, /подтвержденной длительности/);
    assert.equal(core.pauseProposals(input, true).length, 0);
  }
});

test('Закрепленные задания участвуют в нагрузке, период меньше 60 не сдвигается', async () => {
  const pinned = job('pinned', {pinned: true});
  const frequent = job('frequent'); frequent.schedule.repeatPeriod = 59;
  const input = packet([pinned, frequent, job('move')]);
  const result = await core.optimizePacket(input);
  assert.deepEqual(plain(result.packet.jobs[0]), pinned);
  assert.deepEqual(plain(result.packet.jobs[1]), frequent);
  assert.ok(result.excluded.some(item => item.jobId === 'pinned'));
  assert.ok(result.excluded.some(item => item.jobId === 'frequent'));
  assert.ok(result.before.peak >= 2);
});

test('Исходная фаза вне сетки остается кандидатом при равенстве цели', async () => {
  const value = job('single'); value.schedule.startTime = '08:00:03';
  const result = await core.optimizePacket(packet([value]));
  assert.equal(result.packet.jobs[0].schedule.startTime, '08:00:03');
  assert.equal(result.changedJobIds.length, 0);
  assert.equal(result.after.objective, result.before.objective);
});

test('Потеря последнего запуска не считается улучшением', async () => {
  const first = job('a'), second = job('b');
  first.schedule.endTime = second.schedule.endTime = '08:02:00';
  const result = await core.optimizePacket(packet([first, second]));
  assert.equal(result.changedJobIds.length, 0);
  assert.equal(result.after.objective, result.before.objective);
});

test('Дополнительная обрезка на границе суток не считается улучшением', async () => {
  const value = job('late'); value.schedule.startTime = '23:59:00'; value.schedule.endTime = '23:59:59';
  const result = await core.optimizePacket(packet([value]));
  assert.equal(result.changedJobIds.length, 0);
  assert.equal(result.packet.jobs[0].schedule.startTime, '23:59:00');
});

test('Уменьшение J честно допускает сохранение прежнего пика', async () => {
  const pinnedA = job('pinned-a', {pinned: true, durationMed: 10});
  pinnedA.schedule.startTime = '00:00:00'; pinnedA.schedule.endTime = '00:00:59';
  const pinnedB = structuredClone(pinnedA); pinnedB.id = 'pinned-b';
  const movableA = job('a', {durationMed: 2}), movableB = job('b', {durationMed: 2});
  movableA.schedule.endTime = movableB.schedule.endTime = '08:00:59';
  const result = await core.optimizePacket(packet([pinnedA, pinnedB, movableA, movableB]));
  assert.equal(result.before.peak, 2);
  assert.equal(result.after.peak, 2);
  assert.ok(result.after.objective < result.before.objective);
});

test('Отмена после расчета кандидата не публикует частичный черновик', async () => {
  const input = packet([job('a'), job('b')]), saved = JSON.stringify(input);
  const control = {sliceMilliseconds: 0, onProgress(progress) {
    if (progress.evaluated > 0) { control.cancelled = true; }
  }};
  const result = await core.optimizePacket(input, input, control);
  assert.equal(result.cancelled, true);
  assert.equal(result.packet, undefined);
  assert.equal(JSON.stringify(input), saved);
});

test('Предложение паузы отдельно показывает период 1, частоту и число запусков', () => {
  const value = job('frequent'), input = packet([value]);
  const saved = JSON.stringify(input);
  assert.equal(core.pauseProposals(input, false).length, 0);
  const proposal = core.pauseProposals(input, true)[0];
  assert.equal(proposal.newRepeatPeriod, 1);
  assert.equal(proposal.newRepeatPause, 60);
  assert.equal(proposal.nominalIntervalBefore, 60);
  assert.equal(proposal.nominalIntervalAfter, 80);
  assert.equal(proposal.beforeCount, 5);
  assert.equal(proposal.afterCount, 4);
  assert.equal(JSON.stringify(input), saved);
  value.pinned = true;
  assert.equal(core.pauseProposals(input, true).length, 0);
});

test('Неизвестная история исключает задание из оптимизации', async () => {
  const value = job('unknown', {lastStart: null, lastEnd: null});
  const result = await core.optimizePacket(packet([value]));
  assert.equal(result.evaluated, 0);
  assert.equal(result.changedJobIds.length, 0);
  assert.match(result.excluded[0].reason, /неизвестен/);
});

test('Условный прогноз активного запуска с измеренной историей не распределяется и не получает паузу',async()=>{
  const value=job('active',{lastEnd:null}),input=packet([value]);
  const result=await core.optimizePacket(input);
  assert.equal(result.evaluated,0);assert.match(result.excluded[0].reason,/выполнение не завершено/);
  assert.deepEqual(plain(result.packet.jobs[0]),value);assert.equal(core.pauseProposals(input,true).length,0);
});

test('Результат объясняет отсутствие участников и отдельно исключает нулевую длительность', async () => {
  const missing=job('missing',{durationMed:null,durationP95:null,lastStart:null,lastEnd:null});
  const input={config:{...config,fixedDurationSeconds:30},jobs:[missing,job('zero',{durationMed:0}),
    job('pinned',{pinned:true}),job('disabled',{enabled:false})]};
  const result=await core.optimizePacket(input);
  assert.equal(result.eligibleWindows,0);
  assert.equal(result.evaluated,0);
  const text=core.optimizationSummary(result);
  assert.match(text,/Нет заданий для автоматического распределения/);
  assert.match(text,/история не позволяет точный расчет: 1/);
  assert.match(text,/длительность 0 секунд: 1/);
  assert.match(text,/закреплены: 1/);
  assert.doesNotMatch(text,/disabled/);
});

test('Результат отличает отсутствие улучшения от отсутствия участников', async () => {
  const first=job('a'),second=job('b');
  first.schedule.endTime=second.schedule.endTime='08:02:00';
  const result=await core.optimizePacket(packet([first,second]));
  assert.equal(result.eligibleWindows,2);
  assert.match(core.optimizationSummary(result),/нет улучшения без потери запусков/);
  assert.match(core.optimizationSummary(result),/не изменены/);
  assert.doesNotMatch(core.optimizationSummary(result),/сохранены/);
  assert.match(core.optimizationSummary({cancelled:true}),/отменен/);
});
