const fs=require('fs'),postcss=require('postcss'),sp=require('postcss-selector-parser');
const D=(p=>require('fs').existsSync(p+'/public/index.html')?p+'/public/':p+'/')(require('path').resolve(process.argv[2]||'.'));
const css=fs.readFileSync(D+'styles.css','utf8');
const html=fs.readFileSync(D+'index.html','utf8');
const js=fs.readFileSync(D+'app.js','utf8');
const root=postcss.parse(css);
const ctx=r=>{let p=r.parent,a=[];while(p&&p.type!=='root'){if(p.type==='atrule')a.push('@'+p.name+' '+p.params);p=p.parent;}return a.join(' ');};
const selMap={},blockMap={},classes=new Map(),ids=new Map(),propsBySel={};
let rules=0,dupDecl=[];
root.walkRules(r=>{ if(r.parent.type==='atrule'&&/keyframes/.test(r.parent.name))return; rules++;
  const c=ctx(r); const line=r.source.start.line;
  const seen={};
  r.walkDecls(d=>{ if(seen[d.prop]!==undefined && !d.value.includes('var(') && !/-webkit-|-moz-/.test(d.value)) dupDecl.push(`${line} ${r.selector.slice(0,60)} → ${d.prop} (${seen[d.prop]} then ${d.value})`); seen[d.prop]=d.value;});
  r.selectors.forEach(s=>{const k=c+'|'+s.replace(/\s+/g,' ').trim();(selMap[k]=selMap[k]||[]).push(line);
     r.walkDecls(d=>{const pk=k+'|'+d.prop;(propsBySel[pk]=propsBySel[pk]||[]).push(line+':'+d.value);});
     sp(sel=>{sel.walkClasses(n=>{if(!classes.has(n.value))classes.set(n.value,[]);classes.get(n.value).push(line)});sel.walkIds(n=>{if(!ids.has(n.value))ids.set(n.value,[]);ids.get(n.value).push(line)})}).processSync(s);});
  const body=r.nodes.filter(n=>n.type==='decl').map(d=>d.prop+':'+d.value).sort().join(';');
  if(r.nodes.length>=3){(blockMap[c+'|'+body]=blockMap[c+'|'+body]||[]).push(line+' '+r.selector.replace(/\s+/g,' ').slice(0,70));}
});
const out=[];const P=s=>out.push(s);
P('RULES '+rules+'  unique classes '+classes.size+'  ids '+ids.size);
const multi=Object.entries(selMap).filter(([k,v])=>v.length>1).sort((a,b)=>b[1].length-a[1].length);
P('\n## SELECTORS DEFINED MULTIPLE TIMES (same context): '+multi.length);multi.slice(0,80).forEach(([k,v])=>P(v.length+'x  '+k+'  @'+v.join(',')));
const over=Object.entries(propsBySel).filter(([k,v])=>v.length>1&&new Set(v.map(x=>x.split(':').slice(1).join(':'))).size>=1);
P('\n## PROPERTY OVERRIDDEN BY LATER RULE OF SAME SELECTOR: '+over.length);over.slice(0,120).forEach(([k,v])=>P(k+'  '+v.join(' | ')));
P('\n## DUPLICATE DECL IN SAME RULE: '+dupDecl.length);dupDecl.forEach(P);
const blocks=Object.entries(blockMap).filter(([k,v])=>v.length>1);
P('\n## IDENTICAL DECLARATION BLOCKS (>=3 decls): '+blocks.length);blocks.forEach(([k,v])=>P(' - '+v.join('  ||  ')));
// usage
const src=html+'\n'+js;
const tokens=new Set((src.match(/[A-Za-z_][\w-]*/g)||[]));
const unused=[...classes.keys()].filter(c=>!tokens.has(c));
// dynamic prefix check
const dyn=unused.filter(c=>{const m=c.match(/^(.*?[-_])[^-_]+$/);return m&&src.includes(m[1]+'${')||m&&new RegExp("['\"`]"+m[1].replace(/[-]/g,'\\-')+"['\"`]\\s*\\+").test(src)});
P('\n## CSS CLASSES WITH NO TOKEN MATCH IN HTML/JS: '+unused.length+' (possibly dynamic: '+dyn.length+')');
unused.forEach(c=>P(' .'+c+' @'+classes.get(c).slice(0,4).join(',')+(dyn.includes(c)?'  [maybe dynamic]':'')));
const unusedIds=[...ids.keys()].filter(c=>!tokens.has(c));P('\n## CSS IDS UNUSED: '+unusedIds.join(', '));
// vars
const defV={},useV={};root.walkDecls(d=>{if(d.prop.startsWith('--'))(defV[d.prop]=defV[d.prop]||[]).push(d.source.start.line);(d.value.match(/var\(\s*(--[\w-]+)/g)||[]).forEach(m=>{const n=m.replace(/var\(\s*/,'');useV[n]=(useV[n]||0)+1});});
(js+html).replace(/var\(\s*(--[\w-]+)/g,(m,n)=>{useV[n]=(useV[n]||0)+1});
P('\n## CUSTOM PROPS DEFINED NOT USED: '+Object.keys(defV).filter(v=>!useV[v]&&!js.includes(v)).join(', '));
P('## CUSTOM PROPS USED NOT DEFINED: '+Object.keys(useV).filter(v=>!defV[v]).map(v=>v+'('+useV[v]+')').join(', '));
P('## VAR USE COUNTS: '+Object.entries(useV).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+':'+v).join(' '));
// keyframes
const kf=[];root.walkAtRules('keyframes',a=>kf.push(a.params));P('\n## KEYFRAMES: '+kf.map(k=>k+(new RegExp('\\b'+k+'\\b').test(css.replace(/@keyframes\s+\w+/g,''))||js.includes(k)?'':'[UNUSED]')).join(', '));
// design tokens raw
const tally=(re,filter)=>{const m={};root.walkDecls(d=>{if(d.prop.startsWith('--'))return;if(filter&&!filter(d.prop))return;(d.value.match(re)||[]).forEach(v=>{v=v.toLowerCase().replace(/\s+/g,'');m[v]=(m[v]||0)+1})});return Object.entries(m).sort((a,b)=>b[1]-a[1]);};
const colors=tally(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g);
P('\n## HARDCODED COLORS outside :root vars: '+colors.length+' unique, '+colors.reduce((a,b)=>a+b[1],0)+' uses');P(colors.slice(0,70).map(([k,v])=>k+'×'+v).join('  '));
const fsz=tally(/^.*$/g,p=>p==='font-size');P('\n## FONT-SIZE VALUES: '+fsz.length);P(fsz.map(([k,v])=>k+'×'+v).join('  '));
const fw=tally(/^.*$/g,p=>p==='font-weight');P('\n## FONT-WEIGHT: '+fw.map(([k,v])=>k+'×'+v).join('  '));
const br=tally(/^.*$/g,p=>p==='border-radius');P('\n## BORDER-RADIUS: '+br.length);P(br.map(([k,v])=>k+'×'+v).join('  '));
const sh=tally(/^.*$/g,p=>p==='box-shadow');P('\n## BOX-SHADOW: '+sh.length+' unique');P(sh.slice(0,40).map(([k,v])=>k+'×'+v).join('\n  '));
const zi=tally(/^.*$/g,p=>p==='z-index');P('\n## Z-INDEX: '+zi.map(([k,v])=>k+'×'+v).join('  '));
const tr=tally(/\d*\.?\d+m?s/g,p=>/transition|animation/.test(p));P('\n## DURATIONS: '+tr.map(([k,v])=>k+'×'+v).join('  '));
const pad=tally(/-?\d*\.?\d+(px|rem|em)/g,p=>/^(padding|margin|gap|row-gap|column-gap)/.test(p));P('\n## SPACING VALUES: '+pad.length+' unique');P(pad.map(([k,v])=>k+'×'+v).join('  '));
const ff=tally(/^.*$/g,p=>p==='font-family');P('\n## FONT-FAMILY: '+ff.map(([k,v])=>k+'×'+v).join('  '));
const lh=tally(/^.*$/g,p=>p==='line-height');P('\n## LINE-HEIGHT: '+lh.map(([k,v])=>k+'×'+v).join('  '));
const imp=[];root.walkDecls(d=>{if(d.important)imp.push(d.source.start.line+' '+d.parent.selector?.slice(0,50)+' '+d.prop)});P('\n## !important: '+imp.length);imp.forEach(x=>P(' '+x));
const mq={};root.walkAtRules('media',a=>{mq[a.params]=(mq[a.params]||[]);mq[a.params].push(a.source.start.line)});P('\n## MEDIA: '+Object.entries(mq).map(([k,v])=>k+' @'+v.join(',')).join('\n  '));
const pre=[];root.walkDecls(d=>{if(/^-(webkit|moz|ms)-/.test(d.prop)||/-(webkit|moz)-/.test(d.value))pre.push(d.source.start.line+' '+d.prop+':'+d.value.slice(0,40))});P('\n## VENDOR PREFIXES: '+pre.length);pre.forEach(x=>P(' '+x));
const cm=[];root.walkComments(c=>{if(/[{};]\s*$|:\s*[^ ]+;/.test(c.text)&&c.text.length>20)cm.push(c.source.start.line+' '+c.text.slice(0,80).replace(/\n/g,' '))});P('\n## COMMENTED-OUT CSS: '+cm.length);cm.forEach(x=>P(' '+x));
const sections=[];root.walkComments(c=>{if(c.parent.type==='root')sections.push(c.source.start.line+' '+c.text.slice(0,70).replace(/\n/g,' '))});P('\n## TOP-LEVEL COMMENTS (section map):');sections.forEach(x=>P(' '+x));
fs.writeFileSync('css-report.txt',out.join('\n'));
console.log(out.length);
