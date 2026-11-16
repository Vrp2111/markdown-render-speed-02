// Markdown renderer: block collection followed by document-local inline rendering.
const entityMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const entityPattern = /&(?!(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|\w+);)|[<>"']/g;
const literalPattern = /[&<>"']/g;
const htmlCandidate = /[&<>"']/;
function escapeHtml(value, literal = false) {
  if (!htmlCandidate.test(value)) return value;
  const pattern = literal ? literalPattern : entityPattern;
  pattern.lastIndex = 0;
  return value.replace(pattern, ch => entityMap[ch]);
}
function decodeNumbers(value) {
  if (value.indexOf('&#') < 0 || !/&#(?:\d{1,7}|[xX][\da-fA-F]{1,6});/.test(value)) return value;
  return value.replace(/&#(\d{1,7}|[xX][\da-fA-F]{1,6});|&(?!(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|\w+);)/g, (whole, digits) => {
    if (!digits) return '&amp;';
    const point = digits[0] === 'x' || digits[0] === 'X' ? parseInt(digits.slice(1), 16) : Number(digits);
    if (!point || point > 0x10ffff || point >= 0xd800 && point <= 0xdfff) return '\ufffd';
    return point === 38 ? '&amp;' : String.fromCodePoint(point);
  });
}
const unsafeUri = /[^A-Za-z0-9;/?:@&=+$,\-_.!~*'()#%]/;
function encodeDestination(value) {
  if (!unsafeUri.test(value)) return value;
  try { return encodeURI(value).replace(/%25/g, '%'); } catch { return null; }
}
function referenceKey(value) {
  if (!/[\s\u0080-\uffff]/.test(value)) return value.toLowerCase();
  return value.trim().replace(/\s+/g, ' ').toLowerCase().toUpperCase().toLowerCase();
}
function unescapePunctuation(value) { return value.indexOf('\\') < 0 ? value : value.replace(/\\([\p{P}\p{S}])/gu, '$1'); }
function withoutTrailing(value, character) {
  let end = value.length;
  while (end && value[end - 1] === character) --end;
  return end === value.length ? value : value.slice(0, end);
}
function trimBlankTail(value) {
  let end = value.length, lines = 0;
  while (end >= 0) {
    const start = value.lastIndexOf('\n', end - 1) + 1;
    if (!/^[ \t]*$/.test(value.slice(start, end))) break;
    ++lines;
    end = start - 1;
  }
  return lines > 1 ? value.slice(0, Math.max(end, 0)) : value;
}
function expandTabs(value, column = 0) {
  let result = '';
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) === 9) {
      const spaces = 4 - column % 4;
      result += ' '.repeat(spaces); column += spaces;
    } else { result += value[i]; ++column; }
  }
  return result;
}
function expandIndent(value, column = 0) {
  let end = 0, tab = false;
  while (value[end] === ' ' || value[end] === '\t') { tab ||= value[end] === '\t'; ++end; }
  return tab ? expandTabs(value.slice(0, end), column) + value.slice(end) : value;
}
function indentation(value, tabWidth = 0) {
  let width = 0;
  for (let i = 0; i < value.length; ++i) {
    if (value[i] === ' ') ++width;
    else if (tabWidth && value[i] === '\t') width += tabWidth;
    else return width;
  }
  return -1;
}
function unmatchedParen(value) {
  let depth = 0;
  for (let i = 0; i < value.length; ++i) {
    if (value[i] === '\\') ++i;
    else if (value[i] === '(') ++depth;
    else if (value[i] === ')' && --depth < 0) return i;
  }
  return depth ? -2 : -1;
}
function splitCells(line, width) {
  const result = [];
  let start = 0, backslashes = 0;
  for (let p = 0; p < line.length; ++p) {
    const c = line.charCodeAt(p);
    if (c === 124 && !(backslashes & 1)) { result.push(line.slice(start, p)); start = p + 1; }
    backslashes = c === 92 ? backslashes + 1 : 0;
  }
  result.push(line.slice(start));
  if (!result[0].trim()) result.shift();
  if (result.length && !result[result.length - 1].trim()) result.pop();
  if (width) { result.length = Math.min(result.length, width); while (result.length < width) result.push(''); }
  for (let p = 0; p < result.length; ++p) result[p] = result[p].trim().replace(/\\\|/g, '|');
  return result;
}
function grammar(template, replacements = {}, flags = '') {
  let expression = template instanceof RegExp ? template.source : template;
  const names = Object.keys(replacements).sort((a, b) => b.length - a.length);
  if (names.length) expression = expression.replace(new RegExp(names.join('|'), 'g'), name => {
    const replacement = replacements[name];
    return (replacement instanceof RegExp ? replacement.source : replacement).replace(/(^|[^\[])\^/g, '$1');
  });
  return new RegExp(expression, flags);
}
const blockTags = 'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';
const listMarker = ' {0,3}(?:[*+-]|\\d{1,9}[.)])';
const htmlComment = '<!--(?:-?>|[\\s\\S]*?(?:-->|$))';
const labelBody = '(?!\\s*\\])(?:\\\\[\\s\\S]|[^\\[\\]\\\\\\n]|\\n(?![ \\t]*\\n))+';
const horizontalRule = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
const fencedCode = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}(?:(?=`)\1`*|(?=~)\1~*) *(?=\n|$)|$)/;
const atxHeading = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
const htmlInterrupt = ` {0,3}(?:</?(?:${blockTags})(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)`;
const htmlBlock = grammar('^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n*|$)|COMMENT[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)|</?(TAGS)(?:[ \\t]+|\\n|/?>|$)[\\s\\S]*?(?:(?:\\n[ \\t]*)+\\n|$)|<(?!(?:script|pre|style|textarea)(?![a-z0-9-]))([a-z][a-z0-9-]*)(?:ATTR)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \\t]*)+\\n|$)|</[a-z][a-z0-9-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \\t]*)+\\n|$))', { COMMENT: htmlComment, TAGS: blockTags, ATTR: / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/ }, 'i');
const linkDefinition = grammar(/^ {0,3}\[(LABEL)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(TITLE))? *(?:\n+|$)/, { LABEL: labelBody, TITLE: /(?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\\n]|\n(?!\n))*'|\((?:\\[\s\S]|[^()\\])*\))/ });
const listOpening = new RegExp(`^(${listMarker})([ \\t][^\\n]*?)?(?:\\n|$)`);
const tableBlock = grammar('^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|HR|HEAD|QUOTE|CODE|FENCE|LIST|HTML).*(?:\\n|$))*)\\n*|$)', { HR: horizontalRule, HEAD: ' {0,3}#{1,6}(?:\\s|$)', QUOTE: ' {0,3}>', CODE: '(?: {4}| {0,3}\\t)[^\\n]', FENCE: ' {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)', LIST: ' {0,3}(?:[*+-]|1[.)])[ \\t]', HTML: htmlInterrupt });
const underlineHeading = grammar(/^(?!BULLET |CODE|FENCE|QUOTE|HEAD|HTML|TABLE)((?:.|\n(?!\s*?\n|BULLET |FENCE|QUOTE|HEAD|HR|HTML|TABLE))+?)\n {0,3}(=+|-+)[ \t]*(?:\n+|$)/, { BULLET: listMarker, CODE: '(?: {4}| {0,3}\\t)', FENCE: ' {0,3}(?:`{3,}|~{3,})', QUOTE: ' {0,3}>', HEAD: ' {0,3}#{1,6}(?:\\s|$)', HTML: ' {0,3}<[^\\n>]+>\\n', TABLE: ' {0,3}\\|?(?:[:\\- ]*\\|)+[:\\- ]*\\n', HR: horizontalRule });
function paragraphGrammar(inQuote) {
  return grammar('^([^\\n]+(?:\\n(?!HR|HEAD|QUOTE|FENCE|LIST|HTML' + (inQuote ? '' : '|TABLE') + '|[ \\t]+\\n)[^\\n]+)*)', { HR: horizontalRule, HEAD: ' {0,3}#{1,6}(?:\\s|$)', QUOTE: ' {0,3}>', FENCE: ' {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)', LIST: inQuote ? ' {0,3}(?:[*+-]|\\d{1,9}[.)])(?:[ \\t]|\\n|$)' : ' {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]', HTML: htmlInterrupt, TABLE: tableBlock });
}
const paragraphBlock = paragraphGrammar(false);
const quoteBlock = grammar(/^( {0,3}> ?(?:(?![ \t]*(?:\n|$))(PARA)|[^\n]*)(?:\n|$))+/, { PARA: paragraphGrammar(true) });
const indentedCode = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
const blankBlock = /^(?:[ \t]*(?:\n|$))+/;
function blockNode(type, raw, text = raw) { return { type, raw, text }; }
function hasBlankEnding(value) {
  let p = value.length;
  while (p && (value[p - 1] === ' ' || value[p - 1] === '\t')) --p;
  if (!p || value[--p] !== '\n') return false;
  while (p && (value[p - 1] === ' ' || value[p - 1] === '\t')) --p;
  return p > 0 && value[p - 1] === '\n';
}
const listContinuations = [], itemPatterns = new Map();
function continuationGrammar(width) {
  const margin = Math.max(0, Math.min(3, width - 1));
  if (listContinuations[margin]) return listContinuations[margin];
  const prefix = `^ {0,${margin}}`;
  return listContinuations[margin] = {
    item: new RegExp(prefix + '(?:[*+-]|\\d{1,9}[.)])((?:[ \\t][^\\n]*)?(?:\\n|$))'),
    rule: new RegExp(prefix + '(?:(?:-[ \\t]*){3,}|(?:_[ \\t]*){3,}|(?:\\*[ \\t]*){3,})(?:\\n+|$)'),
    fence: new RegExp(prefix + '(?:```|~~~)'),
    heading: new RegExp(prefix + '#{1,6}(?:\\s|$)'),
    quote: new RegExp(prefix + '>'),
    html: new RegExp(prefix + `(?:</?(?:${blockTags})(?: +|$|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)`, 'i')
  };
}
function listInterrupt(line, rules, current = false) {
  let p = 0;
  while (line.charCodeAt(p) === 32) ++p;
  switch (line.charCodeAt(p)) {
    case 96: case 126: return rules.fence.test(line);
    case 35: return rules.heading.test(line);
    case 60: return rules.html.test(line);
    case 42: case 45: return rules.rule.test(line) || !current && rules.item.test(line);
    case 95: return rules.rule.test(line);
    case 62: return !current && rules.quote.test(line);
    default: {
      const code = line.charCodeAt(p);
      return !current && (code === 43 || code >= 48 && code <= 57) && rules.item.test(line);
    }
  }
}
function collectList(input, state) {
  const head = listOpening.exec(input);
  if (head === null) return null;
  const bullet = head[1].trim();
  const ordered = bullet.length > 1;
  const ending = bullet[bullet.length - 1];
  let pattern = itemPatterns.get(ending);
  if (pattern === undefined) {
    const bulletSource = ordered ? '\\d{1,9}\\' + ending : '\\' + ending;
    pattern = new RegExp('( {0,3}' + bulletSource + ')((?:[ \\t][^\\n]*)?(?:\\n|$))', 'y');
    itemPatterns.set(ending, pattern);
  }
  const list = { type: 'list', raw: '', ordered, start: ordered ? Number(bullet.slice(0, -1)) : 1, loose: false, items: [] };
  let position = 0, blankAfterItem = false;
  while (position < input.length) {
    pattern.lastIndex = position;
    const itemHead = pattern.exec(input);
    if (itemHead === null || horizontalRule.test(itemHead[0])) break;
    const itemStart = position;
    position += itemHead[0].length;
    const headEnd = itemHead[2].indexOf('\n');
    let body = expandIndent(headEnd === -1 ? itemHead[2] : itemHead[2].slice(0, headEnd), itemHead[1].length);
    let preceding = body;
    let wasBlank = !body.trim();
    let margin = itemHead[1].length + 1;
    if (!wasBlank) {
      let padding = indentation(body);
      if (padding > 4) padding = 1;
      body = body.slice(padding);
      preceding = body;
      margin = itemHead[1].length + padding;
    }
    let lineEnd = input.indexOf('\n', position);
    let line = input.slice(position, lineEnd < 0 ? input.length : lineEnd);
    if (wasBlank && /^[ \t]*$/.test(line)) {
      position += line.length + 1;
    } else {
      const rules = continuationGrammar(margin);
      const parts = [body];
      while (position < input.length) {
        const expanded = expandIndent(line);
        const indent = indentation(expanded);
        // An interrupt must start before the item's content column.
        if (indent < margin && listInterrupt(line, rules)) break;
        const contentCode = expanded.charCodeAt(indent);
        const blank = indent < 0 || (contentCode <= 32 || contentCode > 126) && !line.trim();
        const continuation = expanded.slice(margin);
        if (indent >= margin || blank) {
          parts.push(continuation);
        } else {
          if (wasBlank || indentation(preceding, 4) >= 4 || listInterrupt(preceding, rules, true)) break;
          const underline = /^ {0,3}(?:=+|-+) *$/.test(line) && underlineHeading.test(preceding + '\n' + line);
          parts.push(underline ? '    ' + expanded.replace(/^ {0,3}/, '') : line);
        }
        wasBlank = blank;
        preceding = continuation;
        position = lineEnd < 0 ? input.length : lineEnd + 1;
        if (position >= input.length) break;
        lineEnd = input.indexOf('\n', position);
        line = input.slice(position, lineEnd < 0 ? input.length : lineEnd);
      }
      body = parts.join('\n');
    }
    const raw = input.slice(itemStart, position);
    if (!list.loose) {
      if (blankAfterItem) list.loose = true;
      else blankAfterItem = hasBlankEnding(raw);
    }
    list.items.push({ raw, text: body, task: /^\[[ xX]\][ \t]+\S/.test(body), children: [] });
  }
  const count = list.items.length;
  if (count === 0) return null;
  list.items[count - 1].raw = list.items[count - 1].raw.trimEnd();
  list.items[count - 1].text = list.items[count - 1].text.trimEnd();
  list.raw = input.slice(0, position).trimEnd();
  for (const item of list.items) {
    state.top = false;
    collectBlocks(item.text, state, item.children);
    if (!list.loose) {
      for (const child of item.children) {
        if (child.type === 'space' && /\n.*\n/.test(child.raw)) {
          list.loose = true;
          break;
        }
      }
    }
  }
  for (const item of list.items) {
    const first = item.children[0];
    if (item.task && (first?.type === 'text' || first?.type === 'paragraph')) {
      item.text = item.text.replace(/^\[[ xX]\][ \t]+/, '');
      first.raw = first.raw.replace(/^\[[ xX]\][ \t]+/, '');
      first.text = first.text.replace(/^\[[ xX]\][ \t]+/, '');
      item.checked = item.raw.match(/\[[ xX]\]/)?.[0] !== '[ ]';
    } else item.task = false;
    if (list.loose) {
      for (const child of item.children) if (child.type === 'text') child.type = 'paragraph';
    }
  }
  return list;
}
function collectQuote(input, state) {
  const match = quoteBlock.exec(input);
  if (!match) return null;
  let lines = withoutTrailing(match[0], '\n').split('\n'), raw = '', text = '';
  const children = [];
  while (lines.length) {
    let marked = false, end = 0;
    while (end < lines.length) { if (/^ {0,3}>/.test(lines[end])) marked = true; else if (marked) break; ++end; }
    const chunk = lines.slice(0, end).join('\n'); lines = lines.slice(end);
    const body = chunk.replace(/^( {0,3}>)([ \t]+)/gm, (all, prefix, spaces) => prefix + expandTabs(spaces, prefix.length))
      .replace(/\n {0,3}((?:=+|-+)[ \t]*)(?=\n|$)/g, '\n    $1').replace(/^ {0,3}>[ \t]?/gm, '');
    raw += (raw ? '\n' : '') + chunk; text += (text ? '\n' : '') + body;
    const top = state.top; state.top = true; collectBlocks(body, state, children, true); state.top = top;
    if (!lines.length) break;
    const tail = children[children.length - 1];
    if (!tail || ['code', 'heading', 'hr', 'html', 'table'].includes(tail.type)) break;
    if (tail.type === 'blockquote') {
      const combined = tail.raw + '\n' + lines.join('\n').replace(/^ {0,3}>[ \t]?/gm, '');
      const next = collectQuote(combined, state); children[children.length - 1] = next;
      const rest = combined.slice(next.raw.length).replace(/^\n/, '');
      const remaining = rest ? rest.split('\n').length : 0;
      const consumed = remaining ? lines.slice(0, -remaining) : lines;
      if (consumed.length) raw += '\n' + consumed.join('\n');
      text = text.slice(0, text.length - tail.text.length) + next.text; lines = lines.slice(consumed.length);
      if (lines.length && /^ {0,3}>/.test(lines[0])) continue;
      break;
    }
    if (tail.type === 'list') {
      const combined = tail.raw + '\n' + lines.join('\n'), next = collectList(combined, state);
      children[children.length - 1] = next;
      const count = next.raw.length > tail.raw.length ? combined.slice(tail.raw.length + 1, next.raw.length).split('\n').length : 0;
      if (count) { const extra = lines.slice(0, count).join('\n'); raw += '\n' + extra; text += '\n' + extra; }
      lines = lines.slice(count);
    }
  }
  return { type: 'blockquote', raw, text, children };
}
function collectTable(input) {
  const firstEnd = input.indexOf('\n');
  if (firstEnd < 0) return null;
  const secondEnd = input.indexOf('\n', firstEnd + 1), dash = input.indexOf('-', firstEnd + 1);
  if (dash < 0 || secondEnd >= 0 && dash > secondEnd) return null;
  const match = tableBlock.exec(input);
  if (!match || !/[:|]/.test(match[2])) return null;
  const headers = splitCells(match[1]), separators = match[2].replace(/^\||\| *$/g, '').split('|');
  if (headers.length !== separators.length) return null;
  const align = separators.map(cell => /^ *-+: *$/.test(cell) ? 'right' : /^ *:-+: *$/.test(cell) ? 'center' : /^ *:-+ *$/.test(cell) ? 'left' : '');
  const rows = [];
  if (match[3]?.trim()) for (const row of match[3].replace(/\n[ \t]*$/, '').split('\n')) rows.push(splitCells(row, headers.length));
  return { type: 'table', raw: withoutTrailing(match[0], '\n'), headers, align, rows };
}
function collectUnderlineHeading(input) {
  let cursor = 0;
  while (cursor < input.length) {
    let end = input.indexOf('\n', cursor); if (end < 0) end = input.length;
    let first = cursor; while (input.charCodeAt(first) === 32) ++first;
    if (first >= end) return null;
    if (first - cursor <= 3 && (input[first] === '=' || input[first] === '-')) {
      let valid = true;
      for (let p = first; p < end; ++p) if (!'= -\t'.includes(input[p])) { valid = false; break; }
      if (valid) {
        const match = underlineHeading.exec(input);
        return match ? { type: 'heading', raw: withoutTrailing(match[0], '\n'), text: match[1].trim(), level: match[2][0] === '=' ? 1 : 2 } : null;
      }
    }
    cursor = end + 1;
  }
  return null;
}
function fencedText(match) {
  const text = match[3] || '', prefix = /^(\s+)```/.exec(match[0]);
  if (!prefix) return text;
  return text.split('\n').map(line => line.slice(Math.min(/^\s+/.exec(line)?.[0].length || 0, prefix[1].length))).join('\n');
}
function collectBlocks(input, state, output = [], nested = false) {
  while (input.length) {
    let match, node, canMerge = false, first = 0;
    while (input.charCodeAt(first) === 32) ++first;
    const code = input.charCodeAt(first), smallIndent = first <= 3;
    match = code === 10 || code === 9 || first === input.length ? blankBlock.exec(input) : null;
    if (match?.[0].length) {
      input = input.slice(match[0].length);
      if (match[0].length === 1 && output.length) output[output.length - 1].raw += '\n';
      else output.push(blockNode('space', match[0]));
      continue;
    }
    if ((first >= 4 || code === 9) && (match = indentedCode.exec(input))) {
      const raw = trimBlankTail(match[0]); node = blockNode('code', raw, raw.replace(/^(?: {0,3}\t| {1,4})/gm, '')); canMerge = true;
    } else if (smallIndent && (code === 96 || code === 126) && (match = fencedCode.exec(input))) {
      node = { type: 'code', raw: match[0], text: fencedText(match), language: unescapePunctuation(match[2].trim()) };
    } else if (smallIndent && code === 35 && (match = atxHeading.exec(input))) {
      let text = match[2].trim();
      if (text.endsWith('#')) { const stripped = withoutTrailing(text, '#'); if (!stripped || /[ \t]$/.test(stripped)) text = stripped.trim(); }
      node = { type: 'heading', raw: withoutTrailing(match[0], '\n'), text, level: match[1].length };
    } else if (smallIndent && (code === 42 || code === 45 || code === 95) && (match = horizontalRule.exec(input))) node = blockNode('hr', withoutTrailing(match[0], '\n'));
    else if (smallIndent && code === 62 && (node = collectQuote(input, state))) { /* quote */ }
    else if (smallIndent && (code === 42 || code === 43 || code === 45 || code >= 48 && code <= 57) && (node = collectList(input, state))) { /* list */ }
    else if (smallIndent && code === 60 && (match = htmlBlock.exec(input))) node = blockNode('html', trimBlankTail(match[0]));
    else if (smallIndent && code === 91 && (match = linkDefinition.exec(input)) && (match[2][0] === '<' || unmatchedParen(match[2]) === -1)) {
      node = { type: 'definition', raw: withoutTrailing(match[0], '\n'), key: referenceKey(match[1]), href: unescapePunctuation(match[2].replace(/^<(.*)>$/, '$1')), title: match[3] ? unescapePunctuation(match[3].slice(1, -1)) : match[3] }; canMerge = true;
    } else if ((node = collectTable(input))) { /* table */ }
    else if ((node = collectUnderlineHeading(input))) { /* setext */ }
    else if (state.top && (match = paragraphBlock.exec(input))) node = blockNode('paragraph', match[0], match[1].endsWith('\n') ? match[1].slice(0, -1) : match[1]);
    else { match = /^[^\n]+/.exec(input); if (!match) throw new Error('Block scanner did not advance'); node = blockNode('text', match[0]); }
    input = input.slice(node.raw.length);
    const previous = output[output.length - 1];
    if (canMerge && (previous?.type === 'paragraph' || previous?.type === 'text')) {
      previous.raw += (previous.raw.endsWith('\n') ? '' : '\n') + node.raw;
      previous.text += '\n' + (node.type === 'definition' ? node.raw : node.text);
    } else if (node.type === 'definition') {
      if (!state.references[node.key]) state.references[node.key] = { href: node.href, title: node.title };
      output.push(node);
    } else if (previous && (node.type === 'text' && previous.type === 'text' || nested && node.type === 'paragraph' && previous.type === 'paragraph')) {
      previous.raw += (previous.raw.endsWith('\n') ? '' : '\n') + node.raw; previous.text += '\n' + node.text;
    } else output.push(node);
  }
  state.top = true;
  return output;
}
// Delimiter searches use a masked view, preserving offsets into the original text.
const unicodePunctuation = /[\p{P}\p{S}]/u;
const unicodeSeparator = /[\s\p{P}\p{S}]/u;
const unicodeWord = /[^\s\p{P}\p{S}]/u;
const backtickSpan = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
const hardBreak = /^( {2,}|\\)\n(?!\s*$)[ \t]*/;
const angleAutolink = grammar(/^<(SCHEME:[^\s\x00-\x1f<>]*|EMAIL)>/, { SCHEME: /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/, EMAIL: /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/ });
const tagInline = grammar('^COMMENT|^</[a-zA-Z][a-zA-Z0-9-]*\\s*>|^<[a-zA-Z][a-zA-Z0-9-]*(?:ATTR)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>', { COMMENT: htmlComment.replace('(?:-->|$)', '-->'), ATTR: /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/ });
const nestedBracket = /\[(?:\\[\s\S]|[^\[\]\\])*\]/;
const inlineLabel = grammar(/(?:\[(?:BRACKET|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/, { BRACKET: nestedBracket });
const linkInline = grammar(/^!?\[(LABEL)\]\([ \t\n]*(HREF)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(TITLE))?[ \t\n]*\)/, { LABEL: inlineLabel, HREF: /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/, TITLE: /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\((?:\\[\s\S]|[^)\\])*\)/ });
const linkReference = grammar(/^!?\[(LABEL)\]\[(REF)\]/, { LABEL: inlineLabel, REF: labelBody });
const linkShortcut = grammar(/^!?\[(REF)\](?:\[\])?/, { REF: labelBody });
const scanningLabel = grammar(/(?:[^\[\]\\`]*(?:\[(?:BRACKET|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\]))){0,999}?[^\[\]\\`]*?/, { BRACKET: nestedBracket });
const referenceScan = grammar('DIRECT|SHORT(?!\\()', {
  DIRECT: grammar(/^!?\[(LABEL)\]\[(REF)\]/, { LABEL: scanningLabel, REF: /(?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999}/ }),
  SHORT: grammar(/^!?\[(REF)\](?:\[\])?/, { REF: /(?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999}/ })
}, 'g');
const opaqueScan = grammar(/LINK|(?<!`)CODE|HTML/, {
  LINK: /\[(?:[^\[\]`]|(`+)[^`]+\1(?!`))*?\]\((?:\\[\s\S]|[^\\()]|\((?:\\[\s\S]|[^\\()])*\))*\)/,
  CODE: /(`+)[^`]+\2(?!`)/,
  HTML: /<(?! )[^<>]*?>/
}, 'g');
const punctuationEscapeScan = /(`+)(?:[^`]|[^`][\s\S]*?[^`])\1(?!`)|`+|\\([\p{P}\p{S}])/gu;
const emphasisOpen = grammar(/^(?:\*+(?:((?!\*)PUNCT)|([^\s*]))?)|^_+(?:((?!_)PUNCT)|([^\s_]))?/, { PUNCT: /(?!~)[\p{P}\p{S}]/u }, 'u');
const punctuationBefore = grammar(/^((?![*_])PS)/, { PS: unicodeSeparator }, 'u');
const starCloser = grammar('^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)P(\\*+)(?=[\\s]|$)|N(\\*+)(?!\\*)(?=S|$)|(?!\\*)S(\\*+)(?=N)|[\\s](\\*+)(?!\\*)(?=P)|(?!\\*)P(\\*+)(?!\\*)(?=P)|N(\\*+)(?=N)', { N: /(?:[^\s\p{P}\p{S}]|~)/u, S: /(?!~)[\s\p{P}\p{S}]/u, P: /(?!~)[\p{P}\p{S}]/u }, 'gu');
const underscoreCloser = grammar('^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)P(_+)(?=[\\s]|$)|N(_+)(?!_)(?=S|$)|(?!_)S(_+)(?=N)|[\\s](_+)(?!_)(?=P)|(?!_)P(_+)(?!_)(?=P)', { N: unicodeWord, S: unicodeSeparator, P: unicodePunctuation }, 'gu');
const deletionOpen = grammar(/^~~?(?:((?!~)P)|[^\s~])/, { P: unicodePunctuation }, 'u');
const deletionCloser = grammar('^[^~]+(?=[^~])|(?!~)P(~~?)(?=[\\s]|$)|N(~~?)(?!~)(?=S|$)|(?!~)S(~~?)(?=N)|[\\s](~~?)(?!~)(?=P)|(?!~)P(~~?)(?!~)(?=P)|N(~~?)(?=N)', { N: unicodeWord, S: unicodeSeparator, P: unicodePunctuation }, 'gu');
const emailBare = /[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/;
const emailScheme = grammar(/(?:mailto:EMAIL|xmpp:EMAIL(?:\/[A-Za-z0-9@.]+)?)/, { EMAIL: emailBare });
const bareAutolink = grammar(/^PROTO|^((?:SCHEME):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^EMAIL/, { PROTO: emailScheme, SCHEME: /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/, EMAIL: /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/ });
const autolinkTail = /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/;
const emailLocal = new Uint8Array(128);
for (const letter of "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.!#$%&'*+/=?_`{|}~-") emailLocal[letter.charCodeAt(0)] = 1;
const inlineBoundary = /[`~\\<\[!*_]|www\.|:\/\/|@|  \n/g;
function plainRunLength(text, offset = 0) {
  const size = text.length, initial = text.charCodeAt(offset);
  if (offset === size) return 0;
  const alphaNumeric = initial >= 48 && initial <= 57 || initial >= 65 && initial <= 90 || initial >= 97 && initial <= 122;
  if (!alphaNumeric && (text.startsWith('mailto:', offset + 1) || text.startsWith('xmpp:', offset + 1))) return 1;
  let start = offset + 1;
  if (initial === 96 || initial === 126) while (text.charCodeAt(start) === initial) ++start;
  inlineBoundary.lastIndex = start;
  let match;
  while ((match = inlineBoundary.exec(text))) {
    let position = match.index;
    switch (match[0]) {
      case 'www.':
        if (position === offset || /[\s*~(\[]/.test(text[position - 1])) return Math.max(start, position) - offset;
        break;
      case '://': {
        const before = text.slice(Math.max(offset, position - 5), position).toLowerCase();
        const width = before.endsWith('https') ? 5 : before.endsWith('http') ? 4 : before.endsWith('ftp') ? 3 : 0;
        if (width) return Math.max(start, position - width) - offset;
        break;
      }
      case '@':
        while (position > offset && text.charCodeAt(position - 1) < 128 && emailLocal[text.charCodeAt(position - 1)]) --position;
        if (position !== match.index) return Math.max(start, position) - offset;
        break;
      case '  \n':
        while (position > offset && text.charCodeAt(position - 1) === 32) --position;
        return Math.max(start, position) - offset;
      default: return Math.max(start, position) - offset;
    }
  }
  return size - offset;
}
function labelContainsLink(text, state) {
  if (text.indexOf('[') < 0) return false;
  for (const match of text.matchAll(opaqueScan)) if (linkInline.test(match[0]) && text[match.index - 1] !== '!') return true;
  for (const match of text.matchAll(referenceScan)) {
    const value = match[0], opening = value.lastIndexOf('[');
    if (value[0] !== '!' && Object.hasOwn(state.references, referenceKey(value.slice(opening + 1, -1))) && !(opening > 1 && labelContainsLink(value.slice(1, opening - 1), state))) return true;
  }
  return false;
}
function maskDelimiters(text, state) {
  const bracket = text.includes('[');
  const tick = text.includes('`');
  const slash = text.includes('\\');
  const angle = text.includes('<');
  if (!(bracket || tick || slash || angle)) return text;
  let masked = text;
  if (bracket && state.referenceCount) {
    const hideReference = value => {
      const opening = value.lastIndexOf('[');
      const key = referenceKey(value.slice(opening + 1, -1));
      if (!Object.hasOwn(state.references, key)) return value;
      if (opening > 1 && value[0] !== '!') {
        const inner = value.slice(1, opening - 1);
        if (labelContainsLink(inner, state)) {
          const label = inner.replace(referenceScan, hideReference);
          return '[' + label + '][' + 'a'.repeat(value.length - opening - 2) + ']';
        }
      }
      return '[' + 'a'.repeat(value.length - 2) + ']';
    };
    masked = masked.replace(referenceScan, hideReference);
  }
  if (slash || tick && text.includes('``')) {
    masked = masked.replace(punctuationEscapeScan, (value, fence, escaped) => {
      if (escaped) return '+'.repeat(value.length);
      if (!fence) return value;
      const inner = value.indexOf('`', fence.length);
      if (inner >= value.length - fence.length) return value;
      const body = value.slice(fence.length, -fence.length).replace(/`/g, '+');
      return fence + body + fence;
    });
  }
  if (!(tick || angle || bracket && text.includes(']('))) return masked;
  return masked.replace(opaqueScan, value => {
    if (!/[*_~]/.test(value)) return value;
    return '[' + 'a'.repeat(value.length - 2) + ']';
  });
}
function tagCrossesLabel(input, label, offset) {
  if (label.indexOf('<') < 0) return false;
  for (let p = 0; p < label.length; ++p) {
    if (label[p] === '\\') { ++p; continue; }
    if (label[p] === '`') {
      const match = backtickSpan.exec(label.slice(p));
      if (match) { p += match[0].length - 1; continue; }
    }
    if (label[p] !== '<') continue;
    const remaining = input.slice(offset + p), match = tagInline.exec(remaining) || angleAutolink.exec(remaining);
    if (match) { if (match[0].length > label.length - p) return true; p += match[0].length - 1; }
  }
  return false;
}
function renderLink(match, destination, state, plain) {
  const image = match[0][0] === '!';
  const label = match[1].indexOf('\\') < 0 ? match[1] : match[1].replace(/\\([\[\]])/g, '$1');
  const oldLink = state.inLink, oldEmitted = state.emitted, oldRaw = state.raw;
  state.inLink = true; state.emitted = false;
  const content = renderInline(label, state, image || plain), nested = state.emitted;
  state.inLink = oldLink; state.emitted = oldEmitted;
  if (!image && nested) { state.raw = oldRaw; return null; }
  if (!image) state.emitted = true;
  if (plain) return content;
  const href = encodeDestination(destination.href);
  if (href === null) return image ? escapeHtml(content) : content;
  const title = destination.title ? ' title="' + escapeHtml(destination.title) + '"' : '';
  return image ? '<img src="' + escapeHtml(href) + '" alt="' + escapeHtml(content) + '"' + title + '>' : '<a href="' + escapeHtml(href) + '"' + title + '>' + content + '</a>';
}
function consumeInlineLink(input, state, plain) {
  if (!state.parens) return null;
  const match = linkInline.exec(input);
  if (!match || tagCrossesLabel(input, match[1], match[0][0] === '!' ? 2 : 1)) return null;
  let destination = match[2].trim();
  if (destination[0] === '<') {
    if (!destination.endsWith('>') || (destination.length - withoutTrailing(destination.slice(0, -1), '\\').length) % 2 === 0) return null;
  } else {
    const end = unmatchedParen(match[2]);
    if (end === -2) return null;
    if (end >= 0) {
      const length = (match[0][0] === '!' ? 5 : 4) + match[1].length + end;
      match[2] = match[2].slice(0, end); match[0] = match[0].slice(0, length).trim(); match[3] = '';
    }
  }
  if ((match[0].length - withoutTrailing(match[0].slice(0, -1), '\\').length) % 2 === 0) return null;
  destination = match[2].trim(); if (destination[0] === '<') destination = destination.slice(1, -1);
  const html = renderLink(match, { href: unescapePunctuation(destination), title: match[3] ? unescapePunctuation(match[3].slice(1, -1)) : '' }, state, plain);
  return html === null ? null : { size: match[0].length, html };
}
function consumeReference(input, state, plain) {
  const match = linkReference.exec(input) || linkShortcut.exec(input);
  if (!match || tagCrossesLabel(input, match[1], match[0][0] === '!' ? 2 : 1)) return null;
  const destination = state.references[referenceKey(match[2] || match[1])];
  if (!destination) return { size: 1, literal: input[0] };
  const html = renderLink(match, destination, state, plain);
  return html === null ? null : { size: match[0].length, html };
}
function codePointBefore(text, offset) {
  if (!offset) return '';
  const low = text.charCodeAt(offset - 1);
  return low >= 0xdc00 && low <= 0xdfff && offset > 1 ? text.slice(offset - 2, offset) : text[offset - 1];
}
function lastCloser(frame, character) {
  if (!frame.last) {
    const positions = { '*': -1, '_': -1, '~': -1 };
    closerRuns.lastIndex = 0;
    let match;
    while ((match = closerRuns.exec(frame.mask))) {
      if (match.index && !closerWhitespace.test(frame.mask[match.index - 1])) {
        positions[match[0][0]] = match.index;
      }
    }
    frame.last = positions;
  }
  return frame.last[character];
}
const closerRuns = /\*+|_+|~+/g;
const closerWhitespace = /[ \t\n\r\f]/;
const easyEmphasis = /^(\*{1,2}|_{1,2})([A-Za-z0-9](?:[^*_`[\]\\~<\n]*?[A-Za-z0-9])?)\1(?=$|[\s.,:;!?()])/;
function renderSimpleContent(text, state, plain) {
  if (text.includes('www.') || text.includes('://') || text.includes('@')) return renderInline(text, state, plain);
  const content = state.raw ? text : decodeNumbers(text);
  return plain || state.raw ? content : escapeHtml(content);
}
function consumeEmphasis(input, frame, previous, state, plain) {
  let match = easyEmphasis.exec(input);
  const offset = frame.text.length - input.length;
  if (match && (input[0] === '*' || !/[\p{L}\p{N}]/u.test(previous))) {
    if (frame.opaque === undefined) {
      const first = frame.text.search(/[\[`\\<]/);
      frame.opaque = first < 0 ? frame.text.length : first;
    }
    if (offset + match[0].length > frame.opaque && frame.mask === null) frame.mask = maskDelimiters(frame.text, state);
    if (offset + match[0].length <= frame.opaque || frame.mask.slice(offset, offset + match[0].length) === match[0]) {
    const inside = renderSimpleContent(match[2], state, plain), tag = match[1].length === 1 ? 'em' : 'strong';
    frame.html = plain ? inside : '<' + tag + '>' + inside + '</' + tag + '>';
    return match[0].length;
    }
  }
  match = emphasisOpen.exec(input);
  if (!match || !(match[1] || match[2] || match[3] || match[4])) return null;
  if (frame.mask === null) frame.mask = maskDelimiters(frame.text, state);
  const character = input[0], sameCharacter = previous === character;
  let runStart = offset;
  while (runStart && frame.mask[runStart - 1] === character) --runStart;
  const before = codePointBefore(frame.mask, runStart);
  const beforePunct = before === '*' || before === '_' || punctuationBefore.test(before);
  const effectiveBefore = runStart < offset ? before : previous;
  const effectivePunct = runStart < offset ? beforePunct : punctuationBefore.test(previous);
  if (match[4] && /[\p{L}\p{N}]/u.test(effectiveBefore)) return null;
  const firstPunctuation = match[1] || match[3] || '';
  if (firstPunctuation && effectiveBefore && !effectivePunct) return null;
  const lastCharacter = match[1] || match[2] || match[3] || match[4];
  const count = match[0].length - lastCharacter.length, totalRun = offset - runStart + count;
  const both = !!before.trim() && (!!firstPunctuation || character === '*' && !beforePunct);
  const boundary = offset + count, limit = lastCloser(frame, character);
  if (limit < boundary) return null;
  const remaining = frame.mask.slice(boundary), pattern = character === '*' ? starCloser : underscoreCloser;
  let needed = count, ignored = 0;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(remaining)) && match.index <= limit - boundary) {
    const run = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
    if (!run) continue;
    let width = run.length;
    if (match[3] || match[4]) { needed += width; continue; }
    if (match[5] || match[6] || both) {
      if (sameCharacter && (match[5] || match[6])) break;
      if (totalRun % 3 && (totalRun + width) % 3 === 0) { ignored += width; continue; }
    }
    needed -= width;
    if (needed > 0) continue;
    width = Math.min(width, width + needed + ignored);
    const length = count + match.index + (match[0].codePointAt(0) > 65535 ? 2 : 1) + width;
    const wrapping = Math.min(count, width) % 2 ? 1 : 2;
    const inside = renderInline(input.slice(wrapping, length - wrapping), state, plain), tag = wrapping === 1 ? 'em' : 'strong';
    frame.html = plain ? inside : '<' + tag + '>' + inside + '</' + tag + '>';
    return length;
  }
  return null;
}
function consumeDeletion(input, frame, previous, state, plain) {
  let match = deletionOpen.exec(input);
  if (!match || match[1] && previous && !punctuationBefore.test(previous)) return null;
  if (frame.mask === null) frame.mask = maskDelimiters(frame.text, state);
  const width = input[1] === '~' ? 2 : 1;
  const offset = frame.mask.length - input.length + width, limit = lastCloser(frame, '~');
  if (limit < offset) return null;
  const remaining = frame.mask.slice(offset);
  let needed = width; deletionCloser.lastIndex = 0;
  while ((match = deletionCloser.exec(remaining)) && match.index <= limit - offset) {
    const run = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
    if (!run || run.length !== width) continue;
    let closing = run.length;
    if (match[3] || match[4]) { needed += closing; continue; }
    needed -= closing; if (needed > 0) continue;
    closing = Math.min(closing, closing + needed);
    const length = width + match.index + (match[0].codePointAt(0) > 65535 ? 2 : 1) + closing;
    const inside = renderInline(input.slice(width, length - width), state, plain);
    return { size: length, html: plain ? inside : '<del>' + inside + '</del>' };
  }
  return null;
}
function couldAutolink(text, offset) {
  const first = text.charCodeAt(offset);
  if (!(first >= 48 && first <= 57 || first >= 65 && first <= 90 || first >= 97 && first <= 122 || first === 46 || first === 95 || first === 43 || first === 45)) return false;
  if ((first === 119 || first === 87 || first === 104 || first === 72 || first === 102 || first === 70 || first === 109 || first === 77 || first === 120 || first === 88) && /^(?:www\.|https?|ftp|mailto:|xmpp:)/i.test(text.slice(offset))) return true;
  const limit = Math.min(offset + 64, text.length);
  for (let p = offset + 1; p < limit; ++p) {
    if (text[p] === '@') return true;
    if (text[p] === ' ' || text[p] === '\n' || text[p] === '<') return false;
  }
  return false;
}
function renderAutolink(match, plain, bare) {
  let label, destination;
  if (match[2] === '@') { label = bare ? match[0] : match[1]; destination = 'mailto:' + label; }
  else if (bare) {
    let previous;
    do { previous = match[0]; match[0] = autolinkTail.exec(match[0])?.[0] || ''; } while (match[0] !== previous);
    label = match[0]; destination = match[1] === 'www.' ? 'http://' + label : label;
  } else label = destination = match[1];
  const encoded = plain ? null : encodeDestination(destination);
  return { size: match[0].length, html: plain ? label : encoded === null ? escapeHtml(label, true) : '<a href="' + escapeHtml(encoded, true) + '">' + escapeHtml(label, true) + '</a>' };
}
const specialInline = /[*_`[\]<\\~]/;
const asciiEscape = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
function atCursor(pattern) {
  return new RegExp(pattern.source.replace(/(^|\|)\^/g, '$1'), pattern.flags + 'y');
}
const cursorEscape = atCursor(asciiEscape), cursorBreak = atCursor(hardBreak);
const cursorTag = atCursor(tagInline), cursorAngle = atCursor(angleAutolink);
const cursorCode = atCursor(backtickSpan), cursorBare = atCursor(bareAutolink);
function renderInline(text, state, plain = false) {
  if (!specialInline.test(text) && !text.includes('www.') && !text.includes('://') && !text.includes('@') && !/ {2,}\n[ \t]*\S/.test(text)) {
    const content = state.raw ? text : decodeNumbers(text);
    return plain || state.raw ? content : escapeHtml(content);
  }
  const savedParens = state.parens;
  state.parens = savedParens && text.includes(')');
  const delimiters = { text, mask: null, last: null, html: '' };
  let position = 0;
  let output = '', literal = '', literalRaw = false;
  let previous = '', wasLiteral = false;
  try {
    while (position < text.length) {
      if (!wasLiteral) previous = '';
      wasLiteral = false;
      const character = text.charCodeAt(position);
      let consumed = 0, rendered = '', token, match;
      switch (character) {
        case 92:
          cursorEscape.lastIndex = position;
          if ((match = cursorEscape.exec(text))) {
            consumed = match[0].length;
            rendered = plain ? match[1] : escapeHtml(match[1]);
          } else {
            cursorBreak.lastIndex = position;
            if ((match = cursorBreak.exec(text))) {
              consumed = match[0].length;
              rendered = plain ? '' : '<br>';
            }
          }
          break;
        case 60:
          cursorTag.lastIndex = position;
          if ((match = cursorTag.exec(text))) {
            const tag = match[0];
            if (!state.inLink && /^<a /i.test(tag)) state.inLink = true;
            else if (state.inLink && /^<\/a>/i.test(tag)) state.inLink = false;
            if (!state.raw && /^<(pre|code|kbd|script)(\s|>)/i.test(tag)) state.raw = true;
            else if (state.raw && /^<\/(pre|code|kbd|script)(\s|>)/i.test(tag)) state.raw = false;
            consumed = tag.length;
            rendered = tag;
          } else {
            cursorAngle.lastIndex = position;
            if ((match = cursorAngle.exec(text))) token = renderAutolink(match, plain, false);
          }
          break;
        case 91: case 33: {
          if (character === 91 || text.charCodeAt(position + 1) === 91) {
            const remaining = text.slice(position);
            token = consumeInlineLink(remaining, state, plain) || consumeReference(remaining, state, plain);
          }
          break;
        }
        case 42: case 95:
          consumed = consumeEmphasis(text.slice(position), delimiters, previous, state, plain) || 0;
          rendered = delimiters.html;
          break;
        case 126:
          token = consumeDeletion(text.slice(position), delimiters, previous, state, plain);
          break;
        case 96:
          cursorCode.lastIndex = position;
          if ((match = cursorCode.exec(text))) {
            let content = match[2].replace(/\n/g, ' ');
            if (/[^ ]/.test(content) && content[0] === ' ' && content.endsWith(' ')) content = content.slice(1, -1);
            consumed = match[0].length;
            rendered = plain ? content : '<code>' + escapeHtml(content, true) + '</code>';
          }
          break;
        case 32:
          cursorBreak.lastIndex = position;
          if ((match = cursorBreak.exec(text))) {
            consumed = match[0].length;
            rendered = plain ? '' : '<br>';
          }
          break;
        default:
          if (!state.inLink && couldAutolink(text, position)) {
            cursorBare.lastIndex = position;
            if ((match = cursorBare.exec(text))) token = renderAutolink(match, plain, true);
          }
      }
      if (token) {
        if (token.literal !== undefined) {
          position += token.size;
          if (literal && literalRaw !== state.raw) {
            output += plain || literalRaw ? literal : escapeHtml(literal);
            literal = '';
          }
          literal += token.literal;
          literalRaw = state.raw;
          continue;
        }
        consumed = token.size;
        rendered = token.html;
      }
      if (consumed) {
        position += consumed;
        if (literal) {
          output += plain || literalRaw ? literal : escapeHtml(literal);
          literal = '';
        }
        output += rendered;
        continue;
      }
      const count = plainRunLength(text, position);
      if (!count) throw new Error('Inline scanner did not advance');
      const raw = text.slice(position, position + count);
      const decoded = state.raw ? raw : decodeNumbers(raw);
      position += count;
      if (decoded[decoded.length - 1] !== '_') previous = decoded[decoded.length - 1];
      wasLiteral = true;
      if (literal && literalRaw !== state.raw) {
        output += plain || literalRaw ? literal : escapeHtml(literal);
        literal = '';
      }
      literal += decoded;
      literalRaw = state.raw;
    }
    if (literal) output += plain || literalRaw ? literal : escapeHtml(literal);
    return output;
  } finally {
    state.parens = savedParens;
  }
}
function inlineBlock(text, state) { state.raw = false; return renderInline(text, state); }
function renderBlocks(nodes, state) {
  let result = '';
  for (const node of nodes) result += renderBlock(node, state);
  return result;
}
function renderBlock(node, state) {
  switch (node.type) {
    case 'space': case 'definition': return '';
    case 'html': return node.text;
    case 'hr': return '<hr>\n';
    case 'text': return inlineBlock(node.text, state);
    case 'paragraph': return '<p>' + inlineBlock(node.text, state) + '</p>\n';
    case 'heading': return '<h' + node.level + '>' + inlineBlock(node.text, state) + '</h' + node.level + '>\n';
    case 'code': {
      const language = /^\S*/.exec(node.language || '')[0];
      const content = node.text ? node.text.replace(/\n$/, '') + '\n' : '';
      return '<pre><code' + (language ? ' class="language-' + escapeHtml(language) + '"' : '') + '>' + escapeHtml(content, true) + '</code></pre>\n';
    }
    case 'blockquote': return '<blockquote>\n' + renderBlocks(node.children, state) + '</blockquote>\n';
    case 'list': {
      const tag = node.ordered ? 'ol' : 'ul';
      let result = '<' + tag + (node.ordered && node.start !== 1 ? ' start="' + node.start + '"' : '') + '>\n';
      for (const item of node.items) {
        result += '<li>';
        const checkbox = item.task ? '<input ' + (item.checked ? 'checked="" ' : '') + 'disabled="" type="checkbox"> ' : '';
        for (let p = 0; p < item.children.length; ++p) {
          const child = item.children[p];
          if (!p && item.task && (child.type === 'text' || child.type === 'paragraph')) {
            const content = checkbox + renderInline(child.text, state);
            result += child.type === 'text' ? content : '<p>' + content + '</p>\n';
          } else result += renderBlock(child, state);
        }
        result += '</li>\n';
      }
      return result + '</' + tag + '>\n';
    }
    case 'table': {
      function row(values, tag) {
        let result = '';
        for (let p = 0; p < values.length; ++p) result += '<' + tag + (node.align[p] ? ' align="' + node.align[p] + '"' : '') + '>' + inlineBlock(values[p], state) + '</' + tag + '>\n';
        return result;
      }
      let result = '<table>\n<thead>\n<tr>\n' + row(node.headers, 'th') + '</tr>\n</thead>\n';
      if (node.rows.length) {
        result += '<tbody>';
        for (const cells of node.rows) result += '<tr>\n' + row(cells, 'td') + '</tr>\n';
        result += '</tbody>';
      }
      return result + '</table>\n';
    }
    default: return '';
  }
}
export function parse(markdown) {
  const text = markdown.includes('\r') ? markdown.replace(/\r\n|\r/g, '\n') : markdown;
  if (text.length < 4096 && /^ {0,3}(?:`{3}|~{3})/.test(text)) {
    const match = fencedCode.exec(text);
    if (match && /^[ \t\n]*$/.test(text.slice(match[0].length))) return renderBlock({ type: 'code', text: fencedText(match), language: unescapePunctuation(match[2].trim()) }, null);
  }
  const state = { references: Object.create(null), referenceCount: 0, top: true, inLink: false, emitted: false, raw: false, parens: true };
  const nodes = collectBlocks(text, state);
  state.referenceCount = Object.keys(state.references).length;
  return renderBlocks(nodes, state);
}
