// Synchronous Markdown rendering; document-local references and delimiter state.
const escapes={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const htmlAny=/[&<>"']/;
const htmlLiteral=/[<>"']|&(?!(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|\w+);)/;
function html(s,all=false){
  if(!(all?htmlAny:htmlLiteral).test(s))return s;
  return s.replace(all?/[&<>"']/g:/[<>"']|&(?!(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|\w+);)/g,c=>escapes[c]);
}
function numeric(s){
  if(!/&#(?:\d{1,7}|[xX][\da-fA-F]{1,6});/.test(s))return s;
  return s.replace(/&#(\d{1,7}|[xX][\da-fA-F]{1,6});|&(?!(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|\w+);)/g,(_,v)=>{
    if(!v)return '&amp;';const n=/^[xX]/.test(v)?parseInt(v.slice(1),16):+v;
    return !n||n>0x10ffff||n>=0xd800&&n<=0xdfff?'\ufffd':n===38?'&amp;':String.fromCodePoint(n);
  });
}
function uri(s){try{return encodeURI(s).replace(/%25/g,'%');}catch{return null;}}
const label=s=>s.trim().replace(/\s+/g,' ').toLowerCase().toUpperCase().toLowerCase();
const unquote=s=>s.replace(/\\([\p{P}\p{S}])/gu,'$1');
function strip(s,c){let i=s.length;while(i&&s[i-1]===c)i--;return s.slice(0,i);}
function blankTrim(s){const a=s.split('\n');let i=a.length-1;while(i>=0&&/^[ \t]*$/.test(a[i]))i--;return a.length-i>2?a.slice(0,i+1).join('\n'):s;}
function tabs(s,col=0){let out='';for(const c of s){if(c==='\t'){const k=4-col%4;out+=' '.repeat(k);col+=k;}else{out+=c;col++;}}return out;}
function leading(s,col=0){let i=0;while(s[i]===' '||s[i]==='\t')i++;return s.slice(0,i).includes('\t')?tabs(s.slice(0,i),col)+s.slice(i):s;}
function indent(s,tab=0){let n=0;for(let i=0;i<s.length;i++){if(s[i]===' ')n++;else if(s[i]==='\t'&&tab)n+=tab;else return n;}return -1;}
function balance(s){let n=0;for(let i=0;i<s.length;i++){if(s[i]==='\\')i++;else if(s[i]==='(')n++;else if(s[i]===')'&&--n<0)return i;}return n>0?-2:-1;}
function cells(s,width){
  const a=[];let start=0,slashes=0;
  for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);if(c===124&&!(slashes%2)){a.push(s.slice(start,i));start=i+1;}slashes=c===92?slashes+1:0;}
  a.push(s.slice(start));if(!a[0].trim())a.shift();if(a.length&&!a.at(-1).trim())a.pop();
  if(width){a.length=Math.min(a.length,width);while(a.length<width)a.push('');}return a.map(v=>v.trim().replace(/\\\|/g,'|'));
}
function rule(source,subs={},flags=''){
  let s=source instanceof RegExp?source.source:source;
  const keys=Object.keys(subs).sort((a,b)=>b.length-a.length);
  if(keys.length)s=s.replace(new RegExp(keys.join('|'),'g'),k=>{const v=subs[k];return(v instanceof RegExp?v.source:v).replace(/(^|[^\[])\^/g,'$1');});
  return new RegExp(s,flags);
}
const tags='address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';
const bullet=' {0,3}(?:[*+-]|\\d{1,9}[.)])';
const comment='<!--(?:-?>|[\\s\\S]*?(?:-->|$))';
const refLabel='(?!\\s*\\])(?:\\\\[\\s\\S]|[^\\[\\]\\\\\\n]|\\n(?![ \\t]*\\n))+';
const hr=/^ {0,3}(?:(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
const fence=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}(?:(?=`)\1`*|(?=~)\1~*) *(?=\n|$)|$)/;
const heading=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
const htmlStart=` {0,3}(?:</?(?:${tags})(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)`;
const rawBlock=rule('^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n*|$)|COMMENT[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)|</?(TAGS)(?:[ \\t]+|\\n|/?>|$)[\\s\\S]*?(?:(?:\\n[ \\t]*)+\\n|$)|<(?!(?:script|pre|style|textarea)(?![a-z0-9-]))([a-z][a-z0-9-]*)(?:ATTR)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \\t]*)+\\n|$)|</[a-z][a-z0-9-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \\t]*)+\\n|$))',{COMMENT:comment,TAGS:tags,ATTR:/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/},'i');
const definition=rule(/^ {0,3}\[(LABEL)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(TITLE))? *(?:\n+|$)/,{LABEL:refLabel,TITLE:/(?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\\n]|\n(?!\n))*'|\((?:\\[\s\S]|[^()\\])*\))/});
const listStart=new RegExp(`^(${bullet})([ \\t][^\\n]*?)?(?:\\n|$)`);
const tableRule=rule('^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|HR|HEAD|QUOTE|CODE|FENCE|LIST|HTML).*(?:\\n|$))*)\\n*|$)',{HR:hr,HEAD:' {0,3}#{1,6}(?:\\s|$)',QUOTE:' {0,3}>',CODE:'(?: {4}| {0,3}\\t)[^\\n]',FENCE:' {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)',LIST:' {0,3}(?:[*+-]|1[.)])[ \\t]',HTML:htmlStart});
const setext=rule(/^(?!BULLET |CODE|FENCE|QUOTE|HEAD|HTML|TABLE)((?:.|\n(?!\s*?\n|BULLET |FENCE|QUOTE|HEAD|HR|HTML|TABLE))+?)\n {0,3}(=+|-+)[ \t]*(?:\n+|$)/,{BULLET:bullet,CODE:'(?: {4}| {0,3}\\t)',FENCE:' {0,3}(?:`{3,}|~{3,})',QUOTE:' {0,3}>',HEAD:' {0,3}#{1,6}(?:\\s|$)',HTML:' {0,3}<[^\\n>]+>\\n',TABLE:' {0,3}\\|?(?:[:\\- ]*\\|)+[:\\- ]*\\n',HR:hr});
function paragraphRule(quote){return rule('^([^\\n]+(?:\\n(?!HR|HEAD|QUOTE|FENCE|LIST|HTML'+(quote?'':'|TABLE')+'|[ \\t]+\\n)[^\\n]+)*)',{HR:hr,HEAD:' {0,3}#{1,6}(?:\\s|$)',QUOTE:' {0,3}>',FENCE:' {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)',LIST:quote?' {0,3}(?:[*+-]|\\d{1,9}[.)])(?:[ \\t]|\\n|$)':' {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]',HTML:htmlStart,TABLE:tableRule});}
const paragraph=paragraphRule(false);
const quoteRule=rule(/^( {0,3}> ?(?:(?![ \t]*(?:\n|$))(PARA)|[^\n]*)(?:\n|$))+/, {PARA:paragraphRule(true)});
const codeBlock=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
const whitespace=/^(?:[ \t]*(?:\n|$))+/;
const record=(kind,raw,text=raw)=>({kind,raw,text});
function endsBlank(s){let p=s.length;while(p&&(s.charCodeAt(p-1)===32||s.charCodeAt(p-1)===9))p--;if(!p||s.charCodeAt(--p)!==10)return false;while(p&&(s.charCodeAt(p-1)===32||s.charCodeAt(p-1)===9))p--;return p>0&&s.charCodeAt(p-1)===10;}
const listRules=[],itemRules=new Map();
function rulesAt(n){
  const k=Math.max(0,Math.min(3,n-1));if(listRules[k])return listRules[k];const p=`^ {0,${k}}`;
  return listRules[k]={next:new RegExp(p+'(?:[*+-]|\\d{1,9}[.)])((?:[ \\t][^\\n]*)?(?:\\n|$))'),hr:new RegExp(p+'(?:(?:-[ \\t]*){3,}|(?:_[ \\t]*){3,}|(?:\\*[ \\t]*){3,})(?:\\n+|$)'),fence:new RegExp(p+'(?:```|~~~)'),head:new RegExp(p+'#{1,6}(?:\\s|$)'),html:new RegExp(p+`(?:</?(?:${tags})(?: +|$|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)`,'i'),quote:new RegExp(p+'>')};
}
function interrupts(s,r,cur=false){
  let i=0;while(s.charCodeAt(i)===32)i++;const c=s.charCodeAt(i);
  if(c===96||c===126)return r.fence.test(s);if(c===35)return r.head.test(s);if(c===60)return r.html.test(s);
  if(c===42||c===45||c===95)return r.hr.test(s)||(!cur&&c!==95&&r.next.test(s));
  return !cur&&(c===62?r.quote.test(s):c===43||c>=48&&c<=57?r.next.test(s):false);
}
function readList(source,ctx){
  const first=listStart.exec(source);if(!first)return null;
  const marker=first[1].trim(),ordered=marker.length>1;
  const key=ordered?marker.at(-1):marker;
  let itemRule=itemRules.get(key);
  if(!itemRule){itemRule=new RegExp(`^( {0,3}${ordered?'\\d{1,9}\\'+marker.at(-1):'\\'+marker})((?:[ \\t][^\\n]*)?(?:\\n|$))`);itemRules.set(key,itemRule);}
  const node={kind:'list',raw:'',ordered,start:ordered?+marker.slice(0,-1):1,loose:false,items:[]};let pos=0,pending=false;
  while(pos<source.length){
    const tail=source.slice(pos),m=itemRule.exec(tail);if(!m||hr.test(tail))break;
    const start=pos;pos+=m[0].length;const nl=m[2].indexOf('\n');
    let text=leading(nl<0?m[2]:m[2].slice(0,nl),m[1].length),current=text,empty=!text.trim(),width;
    if(empty)width=m[1].length+1;else{width=indent(text);if(width>4)width=1;text=text.slice(width);current=text;width+=m[1].length;}
    let e=source.indexOf('\n',pos),line=source.slice(pos,e<0?source.length:e);
    if(empty&&/^[ \t]*$/.test(line))pos+=line.length+1;
    else{
      const r=rulesAt(width),parts=[text];
      while(pos<source.length){
        e=source.indexOf('\n',pos);line=source.slice(pos,e<0?source.length:e);const expanded=leading(line);
        if(interrupts(line,r))break;
        if(indent(expanded)>=width||!line.trim())parts.push(expanded.slice(width));
        else{if(empty||indent(current,4)>=4||interrupts(current,r,true))break;parts.push(/^ {0,3}(?:=+|-+) *$/.test(line)&&setext.test(current+'\n'+line)?'    '+expanded.replace(/^ {0,3}/,''):line);}
        empty=!line.trim();pos=e<0?source.length:e+1;current=expanded.slice(width);
      }
      text=parts.join('\n');
    }
    const raw=source.slice(start,pos);if(!node.loose){if(pending)node.loose=true;else if(endsBlank(raw))pending=true;}
    node.items.push({raw,text,task:/^\[[ xX]\][ \t]+\S/.test(text),nodes:[]});
  }
  if(!node.items.length)return null;const last=node.items.at(-1);last.raw=last.raw.trimEnd();last.text=last.text.trimEnd();node.raw=source.slice(0,pos).trimEnd();
  for(const item of node.items){ctx.top=false;blocks(item.text,ctx,item.nodes,false);if(!node.loose&&item.nodes.some(n=>n.kind==='space'&&/\n.*\n/.test(n.raw)))node.loose=true;}
  for(const item of node.items){
    const first=item.nodes[0];if(item.task&&(first?.kind==='text'||first?.kind==='paragraph')){
      item.text=item.text.replace(/^\[[ xX]\][ \t]+/,'');first.raw=first.raw.replace(/^\[[ xX]\][ \t]+/,'');first.text=first.text.replace(/^\[[ xX]\][ \t]+/,'');item.checked=item.raw.match(/\[[ xX]\]/)?.[0]!=='[ ]';
    }else item.task=false;
    if(node.loose)for(const n of item.nodes)if(n.kind==='text')n.kind='paragraph';
  }return node;
}
function readQuote(source,ctx){
  const m=quoteRule.exec(source);if(!m)return null;
  let lines=strip(m[0],'\n').split('\n'),raw='',text='';const nodes=[];
  while(lines.length){
    let found=false,p=0;for(;p<lines.length;p++){if(/^ {0,3}>/.test(lines[p]))found=true;else if(found)break;}
    const joined=lines.slice(0,p).join('\n');lines=lines.slice(p);
    const stripped=joined.replace(/^( {0,3}>)([ \t]+)/gm,(_,a,b)=>a+tabs(b,a.length)).replace(/\n {0,3}((?:=+|-+)[ \t]*)(?=\n|$)/g,'\n    $1').replace(/^ {0,3}>[ \t]?/gm,'');
    raw+=(raw?'\n':'')+joined;text+=(text?'\n':'')+stripped;const save=ctx.top;ctx.top=true;blocks(stripped,ctx,nodes,true);ctx.top=save;
    if(!lines.length)break;const last=nodes.at(-1);if(!last||['code','heading','hr','html','table'].includes(last.kind))break;
    if(last.kind==='blockquote'){
      const merged=last.raw+'\n'+lines.join('\n').replace(/^ {0,3}>[ \t]?/gm,''),again=readQuote(merged,ctx);nodes[nodes.length-1]=again;
      const rest=merged.slice(again.raw.length).replace(/^\n/,''),remain=rest?rest.split('\n').length:0,kept=remain?lines.slice(0,-remain):lines;
      if(kept.length)raw+='\n'+kept.join('\n');text=text.slice(0,text.length-last.text.length)+again.text;lines=lines.slice(kept.length);
      if(lines.length&&/^ {0,3}>/.test(lines[0]))continue;break;
    }
    if(last.kind==='list'){
      const merged=last.raw+'\n'+lines.join('\n'),again=readList(merged,ctx);nodes[nodes.length-1]=again;
      const used=again.raw.length>last.raw.length?merged.slice(last.raw.length+1,again.raw.length).split('\n').length:0;
      if(used){const extra=lines.slice(0,used).join('\n');raw+='\n'+extra;text+='\n'+extra;}lines=lines.slice(used);continue;
    }
  }return {kind:'blockquote',raw,text,nodes};
}
function readTable(source){
  const a=source.indexOf('\n');if(a<0)return null;const b=source.indexOf('\n',a+1),d=source.indexOf('-',a+1);if(d<0||b>=0&&d>b)return null;
  const m=tableRule.exec(source);if(!m||!/[:|]/.test(m[2]))return null;
  const headers=cells(m[1]),columns=m[2].replace(/^\||\| *$/g,'').split('|');if(headers.length!==columns.length)return null;
  const align=columns.map(s=>/^ *-+: *$/.test(s)?'right':/^ *:-+: *$/.test(s)?'center':/^ *:-+ *$/.test(s)?'left':'');const rows=[];
  if(m[3]?.trim())for(const line of m[3].replace(/\n[ \t]*$/,'').split('\n'))rows.push(cells(line,headers.length));
  return {kind:'table',raw:strip(m[0],'\n'),headers,align,rows};
}
function readSetext(source){
  let p=0;while(p<source.length){let e=source.indexOf('\n',p);if(e<0)e=source.length;let i=p;while(source.charCodeAt(i)===32)i++;if(i>=e)return null;
    if((source[i]==='='||source[i]==='-')&&i-p<=3){let ok=true;for(let j=i;j<e;j++)if(!'= -\t'.includes(source[j])){ok=false;break;}
      if(ok){const m=setext.exec(source);return m?{kind:'heading',raw:strip(m[0],'\n'),text:m[1].trim(),level:m[2][0]==='='?1:2}:null;}}
    p=e+1;
  }return null;
}
function blocks(source,ctx,out=[],nested=false){
  while(source.length){
    let m,n,merge=false;
    let first=0;while(source.charCodeAt(first)===32)first++;
    const ch=source.charCodeAt(first),margin=first<=3;
    if((m=whitespace.exec(source))&&m[0].length){source=source.slice(m[0].length);if(m[0].length===1&&out.length)out.at(-1).raw+='\n';else out.push(record('space',m[0]));continue;}
    if((first>=4||ch===9)&&(m=codeBlock.exec(source))){const raw=blankTrim(m[0]);n=record('code',raw,raw.replace(/^(?: {0,3}\t| {1,4})/gm,''));merge=true;}
    else if(margin&&(ch===96||ch===126)&&(m=fence.exec(source))){let text=m[3]||'';const pad=/^(\s+)(?:```)/.exec(m[0]);if(pad)text=text.split('\n').map(line=>line.slice(Math.min(/^\s+/.exec(line)?.[0].length||0,pad[1].length))).join('\n');n={kind:'code',raw:m[0],text,lang:unquote((m[2]||'').trim())};}
    else if(margin&&ch===35&&(m=heading.exec(source))){let text=m[2].trim();if(text.endsWith('#')){const stripped=strip(text,'#');if(!stripped||/[ \t]$/.test(stripped))text=stripped.trim();}n={kind:'heading',raw:strip(m[0],'\n'),text,level:m[1].length};}
    else if(margin&&(ch===42||ch===45||ch===95)&&(m=hr.exec(source)))n=record('hr',strip(m[0],'\n'));
    else if(margin&&ch===62&&(n=readQuote(source,ctx))){}
    else if(margin&&(ch===42||ch===43||ch===45||ch>=48&&ch<=57)&&(n=readList(source,ctx))){}
    else if(margin&&ch===60&&(m=rawBlock.exec(source)))n=record('html',blankTrim(m[0]));
    else if(margin&&ch===91&&(m=definition.exec(source))&&(m[2][0]==='<'||balance(m[2])===-1)){n={kind:'def',raw:strip(m[0],'\n'),name:label(m[1]),href:unquote(m[2].replace(/^<(.*)>$/,'$1')),title:m[3]?unquote(m[3].slice(1,-1)):m[3]};merge=true;}
    else if((n=readTable(source))){}
    else if((n=readSetext(source))){}
    else if(ctx.top&&(m=paragraph.exec(source)))n=record('paragraph',m[0],m[1].endsWith('\n')?m[1].slice(0,-1):m[1]);
    else{m=/^[^\n]+/.exec(source);if(!m)throw Error('Unconsumed block');n=record('text',m[0]);}
    const prev=out.at(-1);source=source.slice(n.raw.length);
    if(merge&&(prev?.kind==='paragraph'||prev?.kind==='text')){prev.raw+=(prev.raw.endsWith('\n')?'':'\n')+n.raw;prev.text+='\n'+(n.kind==='def'?n.raw:n.text);}
    else if(n.kind==='def'){if(!ctx.refs[n.name])ctx.refs[n.name]={href:n.href,title:n.title};out.push(n);}
    else if(prev&&(n.kind==='text'&&prev.kind==='text'||nested&&n.kind==='paragraph'&&prev.kind==='paragraph')){prev.raw+=(prev.raw.endsWith('\n')?'':'\n')+n.raw;prev.text+='\n'+n.text;}
    else out.push(n);
  }ctx.top=true;return out;
}

// Inline grammar. Masking keeps code, tags and destinations out of delimiter searches.
const punctuation=/[\p{P}\p{S}]/u;
const punctSpace=/[\s\p{P}\p{S}]/u;
const ordinary=/[^\s\p{P}\p{S}]/u;
const codeSpan=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
const lineBreak=/^( {2,}|\\)\n(?!\s*$)[ \t]*/;
const angleLink=rule(/^<(SCHEME:[^\s\x00-\x1f<>]*|EMAIL)>/,{SCHEME:/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/,EMAIL:/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/});
const inlineTag=rule('^COMMENT|^</[a-zA-Z][a-zA-Z0-9-]*\\s*>|^<[a-zA-Z][a-zA-Z0-9-]*(?:ATTR)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>',{COMMENT:comment.replace('(?:-->|$)','-->'),ATTR:/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/});
const bracket=/\[(?:\\[\s\S]|[^\[\]\\])*\]/;
const innerLabel=rule(/(?:\[(?:BRACKET|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/,{BRACKET:bracket});
const directLink=rule(/^!?\[(LABEL)\]\([ \t\n]*(HREF)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(TITLE))?[ \t\n]*\)/,{LABEL:innerLabel,HREF:/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/,TITLE:/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\((?:\\[\s\S]|[^)\\])*\)/});
const referenceLink=rule(/^!?\[(LABEL)\]\[(REF)\]/,{LABEL:innerLabel,REF:refLabel});
const shortLink=rule(/^!?\[(REF)\](?:\[\])?/,{REF:refLabel});
const longLabel=rule(/(?:[^\[\]\\`]*(?:\[(?:BRACKET|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\]))){0,999}?[^\[\]\\`]*?/,{BRACKET:bracket});
const searchReferences=rule('DIRECT|SHORT(?!\\()',{DIRECT:rule(/^!?\[(LABEL)\]\[(REF)\]/,{LABEL:longLabel,REF:/(?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999}/}),SHORT:rule(/^!?\[(REF)\](?:\[\])?/,{REF:/(?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999}/})},'g');
const skipped=rule(/LINK|(?<!`)()CODE|HTML/,{LINK:/\[(?:[^\[\]`]|(?<q>`+)[^`]+\k<q>(?!`))*?\]\((?:\\[\s\S]|[^\\()]|\((?:\\[\s\S]|[^\\()])*\))*\)/,CODE:/(?<r>`+)[^`]+\k<r>(?!`)/,HTML:/<(?! )[^<>]*?>/},'g');
const escapedPunct=/(`+)(?:[^`]|[^`][\s\S]*?[^`])\1(?!`)|`+|\\([\p{P}\p{S}])/gu;
const openEm=rule(/^(?:\*+(?:((?!\*)PUNCT)|([^\s*]))?)|^_+(?:((?!_)PUNCT)|([^\s_]))?/,{PUNCT:/(?!~)[\p{P}\p{S}]/u},'u');
const prevPunct=rule(/^((?![*_])PS)/,{PS:punctSpace},'u');
const closeStar=rule('^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)P(\\*+)(?=[\\s]|$)|N(\\*+)(?!\\*)(?=S|$)|(?!\\*)S(\\*+)(?=N)|[\\s](\\*+)(?!\\*)(?=P)|(?!\\*)P(\\*+)(?!\\*)(?=P)|N(\\*+)(?=N)',{N:/(?:[^\s\p{P}\p{S}]|~)/u,S:/(?!~)[\s\p{P}\p{S}]/u,P:/(?!~)[\p{P}\p{S}]/u},'gu');
const closeUnder=rule('^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)P(_+)(?=[\\s]|$)|N(_+)(?!_)(?=S|$)|(?!_)S(_+)(?=N)|[\\s](_+)(?!_)(?=P)|(?!_)P(_+)(?!_)(?=P)',{N:ordinary,S:punctSpace,P:punctuation},'gu');
const openDel=rule(/^~~?(?:((?!~)P)|[^\s~])/,{P:punctuation},'u');
const closeDel=rule('^[^~]+(?=[^~])|(?!~)P(~~?)(?=[\\s]|$)|N(~~?)(?!~)(?=S|$)|(?!~)S(~~?)(?=N)|[\\s](~~?)(?!~)(?=P)|(?!~)P(~~?)(?!~)(?=P)|N(~~?)(?=N)',{N:ordinary,S:punctSpace,P:punctuation},'gu');
const bareEmail=/[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/;
const emailProtocol=rule(/(?:mailto:EMAIL|xmpp:EMAIL(?:\/[A-Za-z0-9@.]+)?)/,{EMAIL:bareEmail});
const url=rule(/^PROTO|^((?:SCHEME):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^EMAIL/,{PROTO:emailProtocol,SCHEME:/[hH][tT][tT][pP][sS]?|[fF][tT][pP]/,EMAIL:/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/});
const urlTail=/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/;
const localChars=new Uint8Array(128);
for(const c of "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.!#$%&'*+/=?_`{|}~-")localChars[c.charCodeAt(0)]=1;
const nextText=/[`~\\<\[!*_]|www\.|:\/\/|@|  \n/g;
function textLength(s){
  const n=s.length,c=s.charCodeAt(0);if(!n)return 0;
  if(!(c>=48&&c<=57||c>=65&&c<=90||c>=97&&c<=122)&&(s.startsWith('mailto:',1)||s.startsWith('xmpp:',1)))return 1;
  let start=1;if(c===96||c===126)while(s.charCodeAt(start)===c)start++;
  nextText.lastIndex=start;let m;
  while((m=nextText.exec(s))){
    let p=m.index;const mark=m[0];
    if(mark==='www.'){if(!p||/[\s*~(\[]/.test(s[p-1]))return Math.max(start,p);}
    else if(mark==='://'){const head=s.slice(Math.max(0,p-5),p).toLowerCase();let k=head.endsWith('https')?5:head.endsWith('http')?4:head.endsWith('ftp')?3:0;if(k)return Math.max(start,p-k);}
    else if(mark==='@'){while(p&&s.charCodeAt(p-1)<128&&localChars[s.charCodeAt(p-1)])p--;if(p<m.index)return Math.max(start,p);}
    else if(mark==='  \n'){while(p&&s.charCodeAt(p-1)===32)p--;return Math.max(start,p);}
    else return Math.max(start,p);
  }return n;
}
function containsLink(s,ctx){
  if(!s.includes('['))return false;
  for(const m of s.matchAll(skipped))if(directLink.test(m[0])&&s[m.index-1]!=='!')return true;
  for(const m of s.matchAll(searchReferences)){
    const a=m[0],p=a.lastIndexOf('[');
    if(a[0]!=='!'&&Object.hasOwn(ctx.refs,label(a.slice(p+1,-1)))&&!(p>1&&containsLink(a.slice(1,p-1),ctx)))return true;
  }return false;
}
function masked(s,ctx){
  if(!/[\[`\\<]/.test(s))return s;let result=s;
  if(s.includes('[')){
    const replace=a=>{const p=a.lastIndexOf('[');if(!Object.hasOwn(ctx.refs,label(a.slice(p+1,-1))))return a;
      if(p>1&&a[0]!=='!'){const inner=a.slice(1,p-1);if(containsLink(inner,ctx))return '['+inner.replace(searchReferences,replace)+']['+'a'.repeat(a.length-p-2)+']';}
      return '['+'a'.repeat(a.length-2)+']';};
    result=result.replace(searchReferences,replace);
  }
  result=result.replace(escapedPunct,(a,tick,escape)=>escape?'+'.repeat(a.length):tick?tick+a.slice(tick.length,-tick.length).replace(/`/g,'+')+tick:a);
  return result.replace(skipped,(a,unused,tick)=>{const k=tick?tick.length:0;return a.slice(0,k)+'['+'a'.repeat(a.length-k-2)+']';});
}
function crossingTag(source,text,offset){
  if(!text.includes('<'))return false;
  for(let i=0;i<text.length;i++){
    if(text[i]==='\\'){i++;continue;}
    if(text[i]==='`'){const m=codeSpan.exec(text.slice(i));if(m){i+=m[0].length-1;continue;}}
    if(text[i]!=='<')continue;
    const tail=source.slice(offset+i),m=inlineTag.exec(tail)||angleLink.exec(tail);
    if(m){if(m[0].length>text.length-i)return true;i+=m[0].length-1;}
  }return false;
}
function makeAnchor(m,target,ctx,plain){
  const image=m[0][0]==='!',text=m[1].replace(/\\([\[\]])/g,'$1');
  const saved=[ctx.inLink,ctx.emitted,ctx.raw];ctx.inLink=true;ctx.emitted=false;
  const content=inline(text,ctx,image||plain),nested=ctx.emitted;ctx.inLink=saved[0];ctx.emitted=saved[1];
  if(!image&&nested){ctx.raw=saved[2];return null;}
  if(!image)ctx.emitted=true;
  if(plain)return content;
  const dest=uri(target.href);if(dest===null)return image?html(content):content;
  const title=target.title?` title="${html(target.title)}"`:'';
  return image?`<img src="${html(dest)}" alt="${html(content)}"${title}>`:`<a href="${html(dest)}"${title}>${content}</a>`;
}
function readLink(s,ctx,plain){
  if(!ctx.parens)return null;const m=directLink.exec(s);if(!m||crossingTag(s,m[1],m[0][0]==='!'?2:1))return null;
  let href=m[2].trim();
  if(href[0]==='<'){
    if(!href.endsWith('>')||(href.length-strip(href.slice(0,-1),'\\').length)%2===0)return null;
  }else{
    const end=balance(m[2]);if(end===-2)return null;
    if(end>=0){const length=(m[0][0]==='!'?5:4)+m[1].length+end;m[2]=m[2].slice(0,end);m[0]=m[0].slice(0,length).trim();m[3]='';}
  }
  if((m[0].length-strip(m[0].slice(0,-1),'\\').length)%2===0)return null;
  href=m[2].trim();if(href[0]==='<')href=href.slice(1,-1);
  const result=makeAnchor(m,{href:unquote(href),title:m[3]?unquote(m[3].slice(1,-1)):''},ctx,plain);
  return result===null?null:{length:m[0].length,result};
}
function readReference(s,ctx,plain){
  const m=referenceLink.exec(s)||shortLink.exec(s);if(!m||crossingTag(s,m[1],m[0][0]==='!'?2:1))return null;
  const target=ctx.refs[label(m[2]||m[1])];if(!target)return {length:1,literal:s[0]};
  const result=makeAnchor(m,target,ctx,plain);return result===null?null:{length:m[0].length,result};
}
function previousPoint(s,p){if(!p)return '';const c=s.charCodeAt(p-1);return c>=0xdc00&&c<=0xdfff&&p>1?s.slice(p-2,p):s[p-1];}
// A delimiter frame is stacked per recursive inline region. Closer bounds are lazy.
function closer(frame,c){
  if(!frame.ends){const end={'*':-1,'_':-1,'~':-1},s=frame.source;
    for(let i=0;i<s.length;i++){const d=s[i];if(d!=='*'&&d!=='_'&&d!=='~')continue;let j=i+1;while(s[j]===d)j++;if(i&&!/[ \t\n\r\f]/.test(s[i-1]))end[d]=i;i=j-1;}frame.ends=end;
  }return frame.ends[c];
}
function emphasis(s,frame,prev,ctx,plain){
  if(frame.source===null)frame.source=masked(frame.original,ctx);
  const simple=/^(\*{1,2}|_{1,2})([A-Za-z0-9](?:[^*_`[\]\\~<\n]*?[A-Za-z0-9])?)\1(?=$|[\s.,:;!?()])/.exec(s);
  if(simple&&(s[0]==='*'||!/[\p{L}\p{N}]/u.test(prev))&&frame.source.slice(frame.source.length-s.length,frame.source.length-s.length+simple[0].length)===simple[0]){
    const content=inline(simple[2],ctx,plain),tag=simple[1].length===2?'strong':'em';
    return {length:simple[0].length,result:plain?content:`<${tag}>${content}</${tag}>`};
  }
  let m=openEm.exec(s);if(!m||!(m[1]||m[2]||m[3]||m[4]))return null;
  if(frame.source===null)frame.source=masked(frame.original,ctx);
  const d=s[0],same=prev===d,offset=frame.source.length-s.length;
  let begin=offset;while(begin&&frame.source[begin-1]===d)begin--;
  const before=previousPoint(frame.source,begin),punct=before==='*'||before==='_'||prevPunct.test(before);
  const preceding=begin<offset?before:prev,isPunct=begin<offset?punct:prevPunct.test(prev);
  if(m[4]&&/[\p{L}\p{N}]/u.test(preceding))return null;
  const openingPunct=m[1]||m[3]||'';if(openingPunct&&preceding&&!isPunct)return null;
  const tail=m[1]||m[2]||m[3]||m[4];
  const count=m[0].length-tail.length,total=offset-begin+count,both=!!before.trim()&&(!!openingPunct||d==='*'&&!punct);
  const boundary=offset+count,last=closer(frame,d);if(last<boundary)return null;
  const search=frame.source.slice(boundary),re=d==='*'?closeStar:closeUnder;
  let needed=count,ignored=0;re.lastIndex=0;
  while((m=re.exec(search))&&m.index<=last-boundary){
    const run=m[1]||m[2]||m[3]||m[4]||m[5]||m[6];if(!run)continue;let n=run.length;
    if(m[3]||m[4]){needed+=n;continue;}
    if(m[5]||m[6]||both){if(same&&(m[5]||m[6]))break;if(total%3&&(total+n)%3===0){ignored+=n;continue;}}
    needed-=n;if(needed>0)continue;n=Math.min(n,n+needed+ignored);
    const length=count+m.index+(m[0].codePointAt(0)>65535?2:1)+n,raw=s.slice(0,length),width=Math.min(count,n)%2?1:2;
    const inside=inline(raw.slice(width,-width),ctx,plain),tag=width===1?'em':'strong';
    return {length:raw.length,result:plain?inside:`<${tag}>${inside}</${tag}>`};
  }return null;
}
function deletion(s,frame,prev,ctx,plain){
  let m=openDel.exec(s);if(!m||m[1]&&prev&&!prevPunct.test(prev))return null;
  if(frame.source===null)frame.source=masked(frame.original,ctx);
  const width=s[1]==='~'?2:1,offset=frame.source.length-s.length+width,last=closer(frame,'~');if(last<offset)return null;
  const search=frame.source.slice(offset);let needed=width;closeDel.lastIndex=0;
  while((m=closeDel.exec(search))&&m.index<=last-offset){
    const run=m[1]||m[2]||m[3]||m[4]||m[5]||m[6];if(!run||run.length!==width)continue;let n=run.length;
    if(m[3]||m[4]){needed+=n;continue;}needed-=n;if(needed>0)continue;n=Math.min(n,n+needed);
    const raw=s.slice(0,width+m.index+(m[0].codePointAt(0)>65535?2:1)+n),inside=inline(raw.slice(width,-width),ctx,plain);
    return {length:raw.length,result:plain?inside:`<del>${inside}</del>`};
  }return null;
}
function possibleUrl(s){
  const c=s.charCodeAt(0);if(!(c>=48&&c<=57||c>=65&&c<=90||c>=97&&c<=122||c===46||c===95||c===43||c===45))return false;
  if(/^(?:www\.|https?|ftp|mailto:|xmpp:)/i.test(s))return true;
  for(let i=1;i<Math.min(s.length,64);i++){if(s[i]==='@')return true;if(s[i]===' '||s[i]==='<'||s[i]==='\n')return false;}return false;
}
function autolink(m,plain,bare){
  let text,href;
  if(m[2]==='@'){text=bare?m[0]:m[1];href='mailto:'+text;}
  else if(bare){let prev;do{prev=m[0];m[0]=urlTail.exec(m[0])?.[0]||'';}while(prev!==m[0]);text=m[0];href=m[1]==='www.'?'http://'+text:text;}
  else{text=m[1];href=text;}
  const enc=plain?null:uri(href);return {length:m[0].length,result:plain?text:enc===null?html(text,true):`<a href="${html(enc,true)}">${html(text,true)}</a>`};
}
const triggers=/[*_`[\]!<&\\~]/;
function inline(source,ctx,plain=false){
  if(!triggers.test(source)&&!source.includes('www.')&&!source.includes('://')&&!source.includes('@')&&!/ {2,}\n[ \t]*\S/.test(source))return plain||ctx.raw?source:html(source);
  const saved=ctx.parens;ctx.parens=saved&&source.includes(')');
  const frame={source:null,original:source,ends:null};ctx.delimiters.push(frame);
  let s=source,out='',buffer='',bufferRaw=false,previous='',wasText=false;
  const flush=()=>{if(buffer){out+=plain||bufferRaw?buffer:html(buffer);buffer='';}};
  try{
    while(s.length){
      if(!wasText)previous='';wasText=false;const c=s.charCodeAt(0);let token=null,m;
      if(c===92){
        if((m=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/.exec(s)))token={length:m[0].length,result:plain?m[1]:html(m[1])};
        else if((m=lineBreak.exec(s)))token={length:m[0].length,result:plain?'':'<br>'};
      }else if(c===60){
        if((m=inlineTag.exec(s))){
          const tag=m[0];if(!ctx.inLink&&/^<a /i.test(tag))ctx.inLink=true;else if(ctx.inLink&&/^<\/a>/i.test(tag))ctx.inLink=false;
          if(!ctx.raw&&/^<(pre|code|kbd|script)(\s|>)/i.test(tag))ctx.raw=true;else if(ctx.raw&&/^<\/(pre|code|kbd|script)(\s|>)/i.test(tag))ctx.raw=false;
          token={length:tag.length,result:tag};
        }else if((m=angleLink.exec(s)))token=autolink(m,plain,false);
      }else if(c===91||c===33)token=readLink(s,ctx,plain)||readReference(s,ctx,plain);
      else if(c===42||c===95)token=emphasis(s,frame,previous,ctx,plain);
      else if(c===126)token=deletion(s,frame,previous,ctx,plain);
      else if(c===96&&(m=codeSpan.exec(s))){let text=m[2].replace(/\n/g,' ');if(/[^ ]/.test(text)&&text.startsWith(' ')&&text.endsWith(' '))text=text.slice(1,-1);token={length:m[0].length,result:plain?text:`<code>${html(text,true)}</code>`};}
      else if(c===32&&(m=lineBreak.exec(s)))token={length:m[0].length,result:plain?'':'<br>'};
      else if(!ctx.inLink&&possibleUrl(s)&&(m=url.exec(s)))token=autolink(m,plain,true);
      if(token){
        s=s.slice(token.length);
        if(token.literal!==undefined){if(buffer&&bufferRaw!==ctx.raw)flush();buffer+=token.literal;bufferRaw=ctx.raw;}
        else{flush();out+=token.result;}continue;
      }
      const length=textLength(s);if(!length)throw Error('Unconsumed inline');const raw=s.slice(0,length),text=ctx.raw?raw:numeric(raw);s=s.slice(length);
      if(text.at(-1)!=='_')previous=text.at(-1);wasText=true;if(buffer&&bufferRaw!==ctx.raw)flush();buffer+=text;bufferRaw=ctx.raw;
    }
    flush();return out;
  }finally{ctx.parens=saved;ctx.delimiters.pop();}
}
function topInline(text,ctx){ctx.raw=false;return inline(text,ctx);}
function render(nodes,ctx){let out='';for(const node of nodes)out+=renderNode(node,ctx);return out;}
function renderNode(n,ctx){
  switch(n.kind){
    case 'space':case 'def':return '';
    case 'html':return n.text;
    case 'hr':return '<hr>\n';
    case 'text':return topInline(n.text,ctx);
    case 'paragraph':return `<p>${topInline(n.text,ctx)}</p>\n`;
    case 'heading':return `<h${n.level}>${topInline(n.text,ctx)}</h${n.level}>\n`;
    case 'code':{const lang=/^\S*/.exec(n.lang||'')[0],text=n.text?n.text.replace(/\n$/,'')+'\n':'';return '<pre><code'+(lang?` class="language-${html(lang)}"`:'')+'>'+html(text,true)+'</code></pre>\n';}
    case 'blockquote':return '<blockquote>\n'+render(n.nodes,ctx)+'</blockquote>\n';
    case 'list':{
      const tag=n.ordered?'ol':'ul';let out=`<${tag}${n.ordered&&n.start!==1?` start="${n.start}"`:''}>\n`;
      for(const item of n.items){out+='<li>';const checkbox=item.task?'<input '+(item.checked?'checked="" ':'')+'disabled="" type="checkbox"> ':'';
        for(let i=0;i<item.nodes.length;i++){const child=item.nodes[i];
          if(!i&&item.task&&(child.kind==='text'||child.kind==='paragraph'))out+=child.kind==='text'?checkbox+inline(child.text,ctx):'<p>'+checkbox+inline(child.text,ctx)+'</p>\n';
          else out+=renderNode(child,ctx);
        }out+='</li>\n';
      }return out+`</${tag}>\n`;
    }
    case 'table':{
      const row=(values,tag)=>values.map((text,i)=>`<${tag}${n.align[i]?` align="${n.align[i]}"`:''}>${topInline(text,ctx)}</${tag}>\n`).join('');
      let out='<table>\n<thead>\n<tr>\n'+row(n.headers,'th')+'</tr>\n</thead>\n';
      if(n.rows.length){out+='<tbody>';for(const values of n.rows)out+='<tr>\n'+row(values,'td')+'</tr>\n';out+='</tbody>';}
      return out+'</table>\n';
    }
  }return '';
}
export function parse(markdown){
  const source=markdown.includes('\r')?markdown.replace(/\r\n|\r/g,'\n'):markdown;
  // A complete fenced document needs neither reference storage nor block records.
  if(source.length<4096&&/^ {0,3}(?:`{3}|~{3})/.test(source)){
    const match=fence.exec(source);
    if(match&&/^[ \t\n]*$/.test(source.slice(match[0].length))){
      let text=match[3]||'';
      const pad=/^(\s+)```/.exec(match[0]);
      if(pad)text=text.split('\n').map(line=>line.slice(Math.min(/^\s+/.exec(line)?.[0].length||0,pad[1].length))).join('\n');
      return renderNode({kind:'code',text,lang:unquote(match[2].trim())},null);
    }
  }
  const ctx={refs:Object.create(null),top:true,inLink:false,emitted:false,raw:false,parens:true,delimiters:[]};
  return render(blocks(source,ctx),ctx);
}
