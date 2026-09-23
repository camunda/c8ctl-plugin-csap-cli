import assert from 'node:assert';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function assertNoLeftoverPlaceholders(content, label) {
  const matches = content.match(/<[a-z-]+>/g);
  assert.strictEqual(matches, null, `${label}: leftover placeholder(s) found: ${matches}`);
}

function assertNoSpacesInField(content, label, regex) {
  for (const m of content.matchAll(regex)) {
    const value = m[1].trim();
    assert.ok(!/\s/.test(value), `${label}: field value contains a space: "${value}" (line: "${m[0].trim()}")`);
  }
}

export function assertNoSpacesInVersionNameOrImageTag(content, label) {
  assertNoSpacesInField(content, label, /^\s*version:\s*"?([^"\n]*?)"?\s*$/gm);
  assertNoSpacesInField(content, label, /^\s*-?\s*name:\s*(.+)$/gm);
  assertNoSpacesInField(content, label, /^\s*image:\s*(.+)$/gm);
}

export function extractVersion(content) {
  const m = /^\s*version:\s*"?([^"\n]*?)"?\s*$/m.exec(content);
  assert.ok(m, 'no top-level "version:" field found');
  return m[1].trim();
}

export function assertVersionIsSemver(content, label) {
  const version = extractVersion(content);
  assert.match(version, /^\d+\.\d+\.\d+$/, `${label}: "version:" is not a clean semver: "${version}"`);
}

export function assertAllPathsResolve(content, mtadYamlPath, label) {
  const dir = dirname(mtadYamlPath);
  for (const m of content.matchAll(/^\s*path:\s*(\S+)\s*$/gm)) {
    const relPath = m[1];
    const resolved = join(dir, relPath);
    assert.ok(existsSync(resolved), `${label}: "path: ${relPath}" does not resolve to a file on disk (${resolved})`);
  }
}

export function extractNames(content) {
  return new Set([...content.matchAll(/^\s*-?\s*name:\s*(.+)$/gm)].map((m) => m[1].trim()));
}

export function assertNoOverlappingNames(contentA, labelA, contentB, labelB) {
  const namesA = extractNames(contentA);
  const namesB = extractNames(contentB);
  const overlap = [...namesA].filter((n) => namesB.has(n));
  assert.deepStrictEqual(overlap, [], `${labelA} and ${labelB} share resource/module name(s): ${overlap.join(', ')}`);
}
