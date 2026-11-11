'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const template = fs.readFileSync(path.resolve(__dirname,
  '../../EPF/scheduler4000/Templates/МакетHTML/Ext/Template.txt'), 'utf8');
const match = template.match(/<script id="scheduler4000-core">([\s\S]*?)<\/script>/);
assert.ok(match, 'В макете отсутствует расчетное ядро');
const context = vm.createContext({});
vm.runInContext(match[1], context);
const analyze = context.Scheduler4000.analyzeConcurrency;

test('Полосы перегрузки используют точные границы и объединяют соседние превышения', () => {
  const load=analyze([{start:0,end:10},{start:1,end:7},{start:3,end:5},{start:8,end:9}],0,20,1,10);
  const ranges=JSON.parse(JSON.stringify(context.Scheduler4000.collisionRanges(load,1)));
  assert.deepEqual(ranges,[{start:1,end:7},{start:8,end:9}]);
  assert.equal(ranges.reduce((sum,range)=>sum+range.end-range.start,0),load.overloadSeconds);
  assert.equal(context.Scheduler4000.collisionRanges(load,3).length,0);
});

test('Стык и последовательные работы внутри минуты не создают ложный пик', () => {
  const result = analyze([{start: 0, end: 10}, {start: 10, end: 20}], 0, 60, 1, 60);
  assert.equal(result.peak, 1);
  assert.equal(result.objective, 20);
  assert.equal(result.overloadSeconds, 0);
  assert.equal(result.samples[0].load, 1);
  assert.equal(result.samples[0].collision, false);
});

test('Одновременные окончания и старты учитываются как полуоткрытые интервалы', () => {
  const result = analyze([{start: -5, end: 10}, {start: 0, end: 10},
    {start: 10, end: 30}, {start: 10, end: 30}], 0, 60, 1, 10);
  assert.equal(result.peak, 2);
  assert.equal(result.objective, 120);
  assert.equal(result.overloadSeconds, 30);
});

test('Нагрузка обрезается по суткам, точечные и внешние интервалы ее не увеличивают', () => {
  const result = analyze([{start: -20, end: 10}, {start: 50, end: 80},
    {start: 20, end: 20}, {start: -30, end: 0}, {start: 60, end: 90}], 0, 60, 1, 60);
  assert.equal(result.peak, 1);
  assert.equal(result.objective, 20);
  assert.equal(result.overloadSeconds, 0);
});

test('Порог превышается строго, краткий пик не теряется при минутном шаге', () => {
  const intervals = Array.from({length: 8}, () => ({start: 0, end: 60}));
  assert.equal(analyze(intervals, 0, 60, 8, 60).samples[0].collision, false);
  intervals.push({start: 5, end: 6});
  const result = analyze(intervals, 0, 60, 8, 60);
  assert.equal(result.peak, 9);
  assert.equal(result.objective, 3857);
  assert.equal(result.overloadSeconds, 1);
  assert.equal(result.samples[0].collision, true);
});

test('Пик и цель независимы от шага графика 60/10', () => {
  const intervals = [{start: 5, end: 9}, {start: 7, end: 12}, {start: 61, end: 65}];
  const minute = analyze(intervals, 0, 86400, 1, 60);
  const seconds = analyze(intervals, 0, 86400, 1, 10);
  assert.equal(minute.samples.length, 1440);
  assert.equal(seconds.samples.length, 8640);
  for (const key of ['peak', 'objective', 'overloadSeconds']) {
    assert.equal(minute[key], seconds[key]);
  }
  assert.equal(minute.objective, 17);
});

test('Пустая нагрузка и дробные границы', () => {
  const empty = analyze([], 0, 60, 1, 60);
  assert.equal(empty.objective, 0);
  assert.equal(empty.samples[0].load, 0);
  const result = analyze([{start: 0.25, end: 0.75}], 0, 60, 1, 10);
  assert.equal(result.objective, 0.5);
  assert.equal(result.peak, 1);
});

test('Событийный алгоритм совпадает с независимым мелким обходом на фиксированной выборке', () => {
  let seed = 4000;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed; };
  const intervals = Array.from({length: 2000}, () => {
    const start = (random() % 600) / 4 - 20;
    return {start, end: start + (random() % 80) / 4};
  });
  let peak = 0, objective = 0, overloadSeconds = 0;
  const samples = Array(12).fill(0);
  for (let time = 0; time < 120; time += 0.25) {
    const load = intervals.filter(item => item.start <= time && item.end > time).length;
    peak = Math.max(peak, load);
    objective += load * load * 0.25;
    if (load > 100) { overloadSeconds += 0.25; }
    samples[Math.floor(time / 10)] = Math.max(samples[Math.floor(time / 10)], load);
  }
  const result = analyze(intervals, 0, 120, 100, 10);
  assert.equal(result.peak, peak);
  assert.equal(result.objective, objective);
  assert.equal(result.overloadSeconds, overloadSeconds);
  assert.deepEqual(Array.from(result.samples, item => item.load), samples);
});

test('Некорректные исходные значения отклоняются явно', () => {
  assert.throws(() => analyze([{start: 20, end: 10}], 0, 60, 1, 60));
  assert.throws(() => analyze([{start: 0, end: null}], 0, 60, 1, 60));
  assert.throws(() => analyze([], 0, 60, 0, 60));
  assert.throws(() => analyze([], 0, 60, 1, 5));
});
