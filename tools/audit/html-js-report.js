const fs=require('fs'),acorn=require('acorn'),walk=require('acorn-walk'),postcss=require('postcss'),sp=require('postcss-selector-parser');
const D=(p=>require('fs').existsSync(p+'/public/index.html')?p+'/public/':p+'/')(require('path').resolve(process.argv[2]||'.'));const R=f=>fs.readFileSync(D+f,'utf8');
const html=R('index.html'),js=require('./src-files.cjs').readApp(D),i18n=fs.readFileSync(require('./src-files.cjs').i18nPath(D),'utf8'),seed=fs.readFileSync(require('./src-files.cjs').seedPath(D),'utf8'),css=R('styles.css');
const out=[];const P=s=>out.push(s);
// CSS class set
const cssC=new Set();postcss.parse(css).walkRules(r=>{try{sp(s=>s.walkClasses(n=>cssC.add(n.value))).processSync(r.selector)}catch{}});
// classes in HTML
const htmlC={};(html.match(/class="([^"]*)"/g)||[]).forEach(m=>m.slice(7,-1).split(/\s+/).filter(Boolean).forEach(c=>htmlC[c]=(htmlC[c]||0)+1));
// classes in JS: class="..." in templates, classList.add/remove/toggle/contains, className =
const jsC={};const add=c=>{if(c&&!c.includes('$')&&/^[a-z][\w-]*$/i.test(c))jsC[c]=(jsC[c]||0)+1};
(js.match(/class(Name)?\s*=\s*\\?["'`][^"'`]*/g)||[]).forEach(m=>m.replace(/^class(Name)?\s*=\s*\\?["'`]/,'').split(/\s+/).forEach(add));
(js.match(/classList\.(add|remove|toggle|contains|replace)\(([^)]*)\)/g)||[]).forEach(m=>(m.match(/['"]([\w-]+)['"]/g)||[]).forEach(x=>add(x.slice(1,-1))));
const allUsed=new Set([...Object.keys(htmlC),...Object.keys(jsC)]);
const undef=[...allUsed].filter(c=>!cssC.has(c)).sort();
P('## CLASSES USED IN HTML/JS BUT NOT STYLED: '+undef.length);P(undef.join('  '));
const cssText=js+html+i18n+seed;const tok=new Set(cssText.match(/[A-Za-z_][\w-]*/g));
P('\n## CSS CLASSES NOT FOUND IN ANY FILE (incl i18n/seed): '+[...cssC].filter(c=>!tok.has(c)).length);
// HTML
const idsH=(html.match(/\sid="([^"]+)"/g)||[]).map(m=>m.slice(5,-1));const idCount={};idsH.forEach(i=>idCount[i]=(idCount[i]||0)+1);
P('\n## HTML: ids '+idsH.length+', duplicate ids: '+Object.entries(idCount).filter(([k,v])=>v>1).map(([k,v])=>k+'×'+v).join(', '));
const inl=(html.match(/style="[^"]*"/g)||[]);P('## HTML inline style attrs: '+inl.length);
const inlT={};inl.forEach(s=>inlT[s]=(inlT[s]||0)+1);P(Object.entries(inlT).sort((a,b)=>b[1]-a[1]).slice(0,40).map(([k,v])=>v+'× '+k).join('\n'));
P('## HTML on* handlers: '+(html.match(/\son[a-z]+="/g)||[]).length);
const jsIdRefs=new Set();(js.match(/getElementById\(\s*['"`]([^'"`]+)['"`]/g)||[]).forEach(m=>jsIdRefs.add(m.match(/['"`]([^'"`]+)['"`]/)[1]));
(js.match(/querySelector(All)?\(\s*['"`]#([\w-]+)/g)||[]).forEach(m=>jsIdRefs.add(m.match(/#([\w-]+)/)[1]));
const jsCreatedIds=new Set((js.match(/id=\\?["']([\w-]+)/g)||[]).map(m=>m.replace(/id=\\?["']/,'')).concat((js.match(/\.id\s*=\s*['"`]([\w-]+)/g)||[]).map(m=>m.match(/['"`]([\w-]+)/)[1])));
const missing=[...jsIdRefs].filter(i=>!idsH.includes(i)&&!jsCreatedIds.has(i));
P('\n## JS getElementById/# refs with NO matching id in HTML or JS templates: '+missing.length);P(missing.join('  '));
const unrefIds=idsH.filter(i=>!js.includes(i)&&!css.includes('#'+i)&&!html.includes('#'+i)&&!html.includes('for="'+i+'"')&&!html.includes('"'+i+'"'.repeat(0)+'aria-'));
const unref2=idsH.filter(i=>{const re=new RegExp("['\"`#]"+i.replace(/-/g,'\\-')+"['\"`\\s\\)]");return !re.test(js)&&!css.includes('#'+i)&&!(html.match(new RegExp('(for|aria-[a-z]+|href|list|form)="#?'+i+'"'))) && !js.includes(i)});
P('\n## HTML ids never referenced by JS/CSS/labels: '+unref2.length);P(unref2.join('  '));
// JS AST
const ast=acorn.parse(js,{ecmaVersion:'latest',sourceType:'module',locations:true});
const decls={};const calls={};
walk.full(ast,n=>{
 if(n.type==='FunctionDeclaration'&&n.id)(decls[n.id.name]=decls[n.id.name]||[]).push(n.loc.start.line);
 if(n.type==='VariableDeclarator'&&n.id.type==='Identifier'&&n.init&&/Function/.test(n.init.type))(decls[n.id.name]=decls[n.id.name]||[]).push(n.loc.start.line);
});
const idents={};walk.full(ast,n=>{if(n.type==='Identifier')idents[n.name]=(idents[n.name]||0)+1;});
P('\n## JS functions: '+Object.keys(decls).length);
P('## Functions declared more than once: '+Object.entries(decls).filter(([k,v])=>v.length>1).map(([k,v])=>k+'@'+v.join(',')).join('  '));
const deadF=Object.entries(decls).filter(([k,v])=>(idents[k]||0)<=v.length && !html.includes(k)).map(([k,v])=>k+'@'+v[0]);
P('## Functions never referenced (only their declaration): '+deadF.length);P(deadF.join('  '));
// top-level vars/consts unused
const top=[];ast.body.forEach(s=>{if(s.type==='VariableDeclaration')s.declarations.forEach(d=>{if(d.id.type==='Identifier'&&(idents[d.id.name]||0)<=1)top.push(d.id.name+'@'+d.loc.start.line)})});
P('## Top-level vars never referenced: '+top.join('  '));
// imports
P('## Imports: '+ast.body.filter(s=>s.type==='ImportDeclaration').map(s=>s.specifiers.map(x=>x.local.name+((idents[x.local.name]||0)<=1?'[UNUSED]':'')).join(',')+' from '+s.source.value).join(' ; '));
// misc
const lines=js.split('\n');
const cnt=(re)=>lines.map((l,i)=>re.test(l)?i+1:0).filter(Boolean);
P('\n## console.* lines: '+cnt(/console\.(log|debug|warn|info)/).length+' → '+cnt(/console\.(log|debug|info)/).slice(0,40).join(','));
P('## TODO/FIXME/HACK/legacy/deprecated/old/v1 mentions: ');lines.forEach((l,i)=>{if(/TODO|FIXME|HACK|XXX|legacy|deprecated|backward|migrat|old\s|_v\d|v\d_|obsolete|no longer|unused|kept for/i.test(l))P('  '+(i+1)+': '+l.trim().slice(0,140))});
P('## .style.* assignments in JS: '+cnt(/\.style\.[a-zA-Z]+\s*=/).length+'  cssText: '+cnt(/style\.cssText/).length+'  style="..." in templates: '+(js.match(/style=\\?"/g)||[]).length);
const st={};(js.match(/style=\\?"[^"\\]*/g)||[]).forEach(s=>st[s]=(st[s]||0)+1);P(Object.entries(st).sort((a,b)=>b[1]-a[1]).slice(0,30).map(([k,v])=>v+'× '+k).join('\n'));
const hex={};(js.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g)||[]).forEach(c=>hex[c.toLowerCase()]=(hex[c.toLowerCase()]||0)+1);P('## Hardcoded colors in JS: '+Object.keys(hex).length+' unique '+Object.values(hex).reduce((a,b)=>a+b,0)+' uses: '+Object.entries(hex).sort((a,b)=>b[1]-a[1]).slice(0,40).map(([k,v])=>k+'×'+v).join(' '));
P('## localStorage keys: '+[...new Set(js.match(/['"`][\w-]*_v\d+['"`]|localStorage\.(get|set|remove)Item\(\s*['"`][^'"`]+/g)||[])].join('  '));
P('## Commented-out code lines (// followed by code-ish): '+cnt(/^\s*\/\/.*(;\s*$|\)\s*\{|=\s*[^=]|\breturn\b)/).length+' → '+cnt(/^\s*\/\/.*(;\s*$|\)\s*\{|\breturn\b)/).slice(0,40).join(','));
fs.writeFileSync('hj-report.txt',out.join('\n'));console.log('ok');
