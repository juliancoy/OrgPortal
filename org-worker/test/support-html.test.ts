import assert from 'node:assert/strict';
import test from 'node:test';
import {sanitizeSupportHtml} from '../src/supportHtml';
test('email brand formatting, tables and safe links remain readable',()=>{
 const html=sanitizeSupportHtml('<table width="600" style="width:100%;max-width:600px"><tr><td style="background:#155e59;padding:28px 32px"><h1 style="color:#fff;font-size:29px">Join Anchor</h1><a href="https://lifetech.fyi/events/demo" style="display:inline-block;color:#fff;padding:14px 24px">Review invitation</a></td></tr></table>')!;
 assert.match(html,/background:#155e59/);assert.match(html,/<table/);assert.match(html,/padding:28px 32px/);assert.match(html,/font-size:29px/);assert.match(html,/target="_blank"/);assert.match(html,/noopener noreferrer/);
});
test('untrusted email cannot preserve executable markup, unsafe links or network CSS',()=>{
 const html=sanitizeSupportHtml('<script>alert(1)</script><style>@import "https://tracker.invalid/x"</style><iframe src="https://bad.invalid"></iframe><form action="https://bad.invalid"><input></form><img src="https://bad.invalid/pixel" onerror="alert(1)"><a href="javascript:alert(1)" onclick="alert(2)">link</a><div style="background:url(https://tracker.invalid);position:fixed;color:#123">safe</div>')!;
 assert.doesNotMatch(html,/<script|<style|<iframe|<form|<input|onerror|onclick|javascript:|url\(|position:fixed/i);assert.match(html,/color:#123/);
});
test('missing content is absent and oversized input is bounded',()=>{
 assert.equal(sanitizeSupportHtml(undefined),null);assert.equal(sanitizeSupportHtml('<script>bad()</script>'),null);assert.ok(sanitizeSupportHtml('<p>'+('a'.repeat(300000))+'</p>')!.length<200001);
});
