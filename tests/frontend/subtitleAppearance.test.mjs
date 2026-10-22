import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SUBTITLE_APPEARANCE, SUBTITLE_APPEARANCE_KEY, loadSubtitleAppearance, saveSubtitleAppearance } from '../../frontend/src/utils/subtitleAppearance.mjs';

test('subtitle appearance persists and ignores invalid or injected stored preferences', () => {
    const storage = new Map();
    globalThis.window = { localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } };
    assert.deepEqual(loadSubtitleAppearance(), DEFAULT_SUBTITLE_APPEARANCE);
    saveSubtitleAppearance({ font: 'serif', size: 'huge', bottom: 2 });
    assert.deepEqual(loadSubtitleAppearance(), { font: 'serif', size: 'huge', bottom: 2 });
    storage.set(SUBTITLE_APPEARANCE_KEY, JSON.stringify({ font: '</style><script>', size: '999', bottom: -5 }));
    assert.deepEqual(loadSubtitleAppearance(), DEFAULT_SUBTITLE_APPEARANCE);
    storage.set(SUBTITLE_APPEARANCE_KEY, '{broken');
    assert.deepEqual(loadSubtitleAppearance(), DEFAULT_SUBTITLE_APPEARANCE);
});

test('subtitle preferences remain usable when browser storage is blocked', () => {
    globalThis.window = { localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } };
    assert.deepEqual(loadSubtitleAppearance(), DEFAULT_SUBTITLE_APPEARANCE);
    assert.doesNotThrow(() => saveSubtitleAppearance({ font: 'mono', size: 'large', bottom: 6 }));
});
