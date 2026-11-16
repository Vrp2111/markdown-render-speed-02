import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parse } from './parse.js';

export function renderCases(cases: readonly { markdown: string }[]): string[] {
  const html: string[] = [];
  for (const { markdown } of cases) {
    html.push(parse(markdown));
  }
  return html;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cases: { markdown: string }[] = JSON.parse(readFileSync('/input/cases.json', 'utf8'));
  writeFileSync('/output/html.json', JSON.stringify(renderCases(cases)), 'utf8');
}
