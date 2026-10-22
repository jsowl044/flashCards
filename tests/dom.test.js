import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../js/dom.js';

describe('escapeHtml', ()=>{
  test('escapes the characters that matter in HTML text and attributes', ()=>{
    assert.equal(escapeHtml(`<b>"Tom" & 'Jerry'</b>`), '&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;');
  });

  test('neutralises an attribute-breaking payload', ()=>{
    const escaped = escapeHtml('x" onmouseover="alert(1)');
    assert.ok(!escaped.includes('"'));
  });

  test('turns empty values into an empty string and numbers into text', ()=>{
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(''), '');
    assert.equal(escapeHtml(0), '');
    assert.equal(escapeHtml(42), '42');
  });

  test('leaves ordinary text, accents and emoji untouched', ()=>{
    assert.equal(escapeHtml('¿cómo estás? ✏️'), '¿cómo estás? ✏️');
  });
});
