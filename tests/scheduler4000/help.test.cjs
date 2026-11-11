const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname,
  '../../EPF/scheduler4000/Templates/МакетСправка/Ext/Template.txt'), 'utf8');

test('help navigation scrolls to each existing section without native navigation', () => {
  const sectionIds = [...html.matchAll(/<section id="([^"]+)"/g)].map(match => match[1]);
  const links = [...html.matchAll(/<a href="#([^"]+)"/g)].map(match => ({
    target: match[1], getAttribute(name) { assert.equal(name, 'href'); return '#' + this.target; }
  }));
  const visited = [];
  const document = {
    querySelectorAll(selector) { assert.equal(selector, 'nav a'); return links; },
    getElementById(id) {
      assert.ok(sectionIds.includes(id), `Missing section: ${id}`);
      return { scrollIntoView(top) { assert.equal(top, true); visited.push(id); } };
    }
  };
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, { document });
  assert.equal(links.length, 6);
  for (const link of links) {
    let prevented = false;
    assert.equal(link.onclick({ preventDefault() { prevented = true; } }), false);
    assert.equal(prevented, true);
  }
  assert.deepEqual(visited, sectionIds);
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']https?:/i);
});
