import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from './parse.js';

// The competition mounts these directories in each fresh execution.
const documents = JSON.parse(readFileSync('/input/cases.json', 'utf8'));
const rendered = new Array(documents.length);
for (let index = 0; index < documents.length; index++) {
  rendered[index] = parse(documents[index].markdown);
}
writeFileSync('/output/html.json', JSON.stringify(rendered), 'utf8');
