const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseFrontmatter, stripFrontmatter } = require('../.lore/lib/frontmatter');

test('parseFrontmatter: basic key-value pairs', () => {
  const content = '---\ntitle: My Doc\nstatus: active\n---\n\nBody text.';
  const { attrs, body } = parseFrontmatter(content);
  assert.equal(attrs.title, 'My Doc');
  assert.equal(attrs.status, 'active');
  assert.equal(body, '\nBody text.');
});

test('parseFrontmatter: handles CRLF line endings', () => {
  const content = '---\r\ntitle: My Doc\r\nstatus: active\r\n---\r\n\r\nBody.';
  const { attrs, body } = parseFrontmatter(content);
  assert.equal(attrs.title, 'My Doc');
  assert.equal(attrs.status, 'active');
  assert.ok(body.includes('Body.'));
});

test('parseFrontmatter: strips double-quoted values', () => {
  const content = '---\ntitle: "Quoted Title"\n---\n';
  const { attrs } = parseFrontmatter(content);
  assert.equal(attrs.title, 'Quoted Title');
});

test('parseFrontmatter: strips single-quoted values', () => {
  const content = "---\ntitle: 'Single Quoted'\n---\n";
  const { attrs } = parseFrontmatter(content);
  assert.equal(attrs.title, 'Single Quoted');
});

test('parseFrontmatter: strips inline comments', () => {
  const content = '---\nstatus: active # this is active\n---\n';
  const { attrs } = parseFrontmatter(content);
  assert.equal(attrs.status, 'active');
});

test('parseFrontmatter: preserves hash inside quotes', () => {
  const content = '---\ntitle: "Has # hash"\n---\n';
  const { attrs } = parseFrontmatter(content);
  assert.equal(attrs.title, 'Has # hash');
});

test('parseFrontmatter: handles hyphenated keys', () => {
  const content = '---\nclaude-model: sonnet\n---\n';
  const { attrs } = parseFrontmatter(content);
  assert.equal(attrs['claude-model'], 'sonnet');
});

test('parseFrontmatter: returns empty attrs when no frontmatter', () => {
  const content = 'Just some text.';
  const { attrs, body } = parseFrontmatter(content);
  assert.deepStrictEqual(attrs, {});
  assert.equal(body, 'Just some text.');
});

test('parseFrontmatter: returns empty on non-string input', () => {
  assert.deepStrictEqual(parseFrontmatter(null), { attrs: {}, body: '' });
  assert.deepStrictEqual(parseFrontmatter(undefined), { attrs: {}, body: '' });
  assert.deepStrictEqual(parseFrontmatter(42), { attrs: {}, body: '' });
});

test('parseFrontmatter: handles empty frontmatter block', () => {
  const content = '---\n---\nBody only.';
  const { attrs, body } = parseFrontmatter(content);
  assert.deepStrictEqual(attrs, {});
  assert.equal(body, 'Body only.');
});

test('parseFrontmatter: handles empty values', () => {
  const content = '---\ntitle:\nstatus: active\n---\n';
  const { attrs } = parseFrontmatter(content);
  assert.equal(attrs.title, '');
  assert.equal(attrs.status, 'active');
});

test('stripFrontmatter: returns body without frontmatter', () => {
  const content = '---\ntitle: Test\n---\n\n# Heading\n\nBody.';
  const body = stripFrontmatter(content);
  assert.equal(body, '\n# Heading\n\nBody.');
});

test('stripFrontmatter: returns full content when no frontmatter', () => {
  const content = '# Heading\n\nBody.';
  assert.equal(stripFrontmatter(content), content);
});
