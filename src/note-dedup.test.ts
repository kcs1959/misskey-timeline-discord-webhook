import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NoteDeduper } from './note-dedup.js';

describe('NoteDeduper', () => {
  it('allows a note through once and blocks after forwarding', () => {
    const deduper = new NoteDeduper();

    assert.equal(deduper.tryAcquire('note1'), true);
    assert.equal(deduper.tryAcquire('note1'), false);

    deduper.markForwarded('note1');
    assert.equal(deduper.tryAcquire('note1'), false);
  });

  it('allows retry after release', () => {
    const deduper = new NoteDeduper();

    assert.equal(deduper.tryAcquire('note1'), true);
    deduper.release('note1');
    assert.equal(deduper.tryAcquire('note1'), true);
  });

  it('blocks skipped notes from being processed again', () => {
    const deduper = new NoteDeduper();

    assert.equal(deduper.tryAcquire('note1'), true);
    deduper.markSkipped('note1');
    assert.equal(deduper.tryAcquire('note1'), false);
  });

  it('evicts the oldest processed note when max size is exceeded', () => {
    const deduper = new NoteDeduper(2);

    assert.equal(deduper.tryAcquire('note1'), true);
    deduper.markForwarded('note1');
    assert.equal(deduper.tryAcquire('note2'), true);
    deduper.markForwarded('note2');
    assert.equal(deduper.tryAcquire('note3'), true);
    deduper.markForwarded('note3');

    assert.equal(deduper.tryAcquire('note1'), true);
    assert.equal(deduper.tryAcquire('note2'), false);
  });
});
