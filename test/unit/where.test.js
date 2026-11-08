// sessions.where: finds programs along PATH by looking at the folders itself,
// the way Windows' `where` would list them, without starting where.exe.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { scratch } = require('./setup');
const { where } = require('../../src/main/sessions');

test('where: PATH order, then PATHEXT order, spelled as on disk, never the current folder or a relative entry', () => {
  const a = scratch('where-a');
  const b = scratch('where-b');
  const here = scratch('where-here');
  fs.writeFileSync(path.join(a, 'Tool.cmd'), '');
  fs.writeFileSync(path.join(b, 'tool.exe'), '');
  fs.writeFileSync(path.join(b, 'tool.cmd'), '');
  fs.writeFileSync(path.join(here, 'tool.exe'), '');
  fs.mkdirSync(path.join(a, 'folder.exe'), { recursive: true }); // a folder named like a program doesn't count
  const saved = { PATH: process.env.PATH, PATHEXT: process.env.PATHEXT, cwd: process.cwd() };
  try {
    process.chdir(here);
    process.env.PATHEXT = '.EXE;.CMD';
    process.env.PATH = [here, `"${a}"`, 'relative\\bin', '', b, 'C:\\no\\such\\folder'].join(path.delimiter);
    assert.deepEqual(where('tool'), [path.join(a, 'Tool.cmd'), path.join(b, 'tool.exe'), path.join(b, 'tool.cmd')]);
    assert.deepEqual(where('tool.cmd'), [path.join(a, 'Tool.cmd'), path.join(b, 'tool.cmd')]);
    assert.deepEqual(where('folder'), []);
    assert.deepEqual(where('missing'), []);
    assert.deepEqual(where('C:\\full\\path.exe'), []);
    assert.deepEqual(where(''), []);
  } finally {
    process.chdir(saved.cwd);
    process.env.PATH = saved.PATH;
    process.env.PATHEXT = saved.PATHEXT;
  }
});
