import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from './parse.js';

const cases = JSON.parse(readFileSync('/input/cases.json', 'utf8'));
// Mapping in input order keeps each rendered string aligned with its case.
const renderedCases = cases.map((entry: { markdown: string }) => parse(entry.markdown));
writeFileSync('/output/html.json', JSON.stringify(renderedCases), 'utf8');
