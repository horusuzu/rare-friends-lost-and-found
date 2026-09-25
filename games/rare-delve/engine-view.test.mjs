import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_VIEW, MAX_ROWS, PHONE_COLS, PHONE_MAX_WIDTH, VIEW_H, viewFor } from './render.ts';

test('wide boxes and anything wider than a phone keep the reference 15 x 11 view', () => {
  assert.deepEqual(viewFor(355, 263), BASE_VIEW);
  assert.deepEqual(viewFor(700, 760), BASE_VIEW, 'a tall desktop stage is not a phone');
  assert.deepEqual(viewFor(PHONE_MAX_WIDTH + 1, 900), BASE_VIEW);
  assert.deepEqual(viewFor(360, 300), BASE_VIEW, 'aspect 1.2 is wide');
});

test('a phone portrait box gets bigger tiles and whole rows that fill its height', () => {
  assert.deepEqual(viewFor(370, 380), { cols: PHONE_COLS, rows: 13 });
  assert.deepEqual(viewFor(410, 445), { cols: PHONE_COLS, rows: 14 });
  const v = viewFor(340, 340);
  assert.equal(v.cols, PHONE_COLS);
  assert.ok(340 / v.cols > 340 / BASE_VIEW.cols, 'tiles are larger than the reference view');
  for (const [w, h] of [[300, 260], [340, 340], [370, 380], [410, 445], [390, 700], [320, 900]]) {
    const { cols, rows } = viewFor(w, h);
    assert.ok(rows >= VIEW_H && rows <= MAX_ROWS, `rows ${rows} in range`);
    if (cols === PHONE_COLS) assert.ok(rows * w / cols <= h + 1e-9 || rows === VIEW_H, `the ${cols}x${rows} view fits a ${w}x${h} box`);
  }
  assert.equal(viewFor(320, 900).rows, MAX_ROWS, 'rows are capped');
});

test('empty or invalid boxes fall back to the reference view', () => {
  for (const [w, h] of [[0, 0], [NaN, 400], [300, 0], [-5, 10]]) assert.deepEqual(viewFor(w, h), BASE_VIEW);
});
