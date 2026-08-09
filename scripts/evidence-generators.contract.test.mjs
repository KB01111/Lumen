import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const captureGallery = await readFile(new URL('./capture-gallery.mjs', import.meta.url), 'utf8');
const recordInteractions = await readFile(new URL('./record-interactions.mjs', import.meta.url), 'utf8');

test('gallery capture consumes registry categories exposed by scenario options', () => {
  assert.match(captureGallery, /category:\s*option\.dataset\.category/);
  assert.match(captureGallery, /category:\s*scenario\.category/);
  assert.doesNotMatch(captureGallery, /function categoryFor/);
});

test('approval recording clicks and asserts both deterministic decisions', () => {
  assert.match(recordInteractions, /getByRole\('button', \{name: 'Approve once'\}\)\.click\(\)/);
  assert.match(recordInteractions, /getByRole\('status', \{name: 'Working'\}\)/);
  assert.match(recordInteractions, /getByRole\('button', \{name: 'Deny and stop'\}\)\.click\(\)/);
  assert.match(recordInteractions, /getByRole\('status', \{name: 'Stopped'\}\)/);
});
