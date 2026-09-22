const fs=require('fs'),acorn=require('acorn'),walk=require('acorn-walk');
const D=(p=>require('fs').existsSync(p+'/public/index.html')?p+'/public/':p+'/')(require('path').resolve(process.argv[2]||'.'));const js=fs.readFileSync(D+'app.js','utf8');const html=fs.readFileSync(D+'index.html','utf8');
const ast=acorn.parse(js,{ecmaVersion:'latest',sourceType:'module',locations:true});
const classes=[];walk.full(ast,n=>{if(n.type==='ClassDeclaration'||n.type==='ClassExpression')classes.push({name:n.id&&n.id.name,line:n.loc.start.line,end:n.loc.end.line,methods:n.body.body.filter(m=>m.type==='MethodDefinition'||m.type==='PropertyDefinition').map(m=>({k:m.key.name||m.key.value,l:m.loc.start.line,e:m.loc.end.line,kind:m.kind}))})});
const refs=Object.create(null);walk.full(ast,n=>{if(n.type==='MemberExpression'&&!n.computed&&n.property.name)refs[n.property.name]=(refs[n.property.name]||0)+1;});
const strs=js.match(/['"`][A-Za-z_]\w*['"`]/g)||[];const S=new Set(strs.map(s=>s.slice(1,-1)));
classes.forEach(c=>{console.log('CLASS',c.name,c.line+'-'+c.end,'methods',c.methods.length);
 const dup=Object.create(null);c.methods.forEach(m=>{const key=m.k+(m.kind==='get'||m.kind==='set'?':'+m.kind:'');(dup[key]=dup[key]||[]).push(m.l)});
 const d=Object.entries(dup).filter(([k,v])=>v.length>1);if(d.length)console.log('  DUP METHODS:',d.map(([k,v])=>k+'@'+v.join(',')).join(' '));
 const dead=c.methods.filter(m=>m.k!=='constructor'&&!refs[m.k]&&!S.has(m.k)&&!html.includes(m.k));console.log('  UNREFERENCED:',dead.map(m=>m.k+'@'+m.l+' ('+(m.e-m.l+1)+'L)').join('  '));
 const big=c.methods.map(m=>[m.k,m.e-m.l+1,m.l]).sort((a,b)=>b[1]-a[1]).slice(0,15);console.log('  LARGEST:',big.map(x=>x[0]+'@'+x[2]+':'+x[1]).join('  '));
});
// near-duplicate method bodies: normalize
const bodies=Object.create(null);classes.forEach(c=>{});
walk.full(ast,n=>{if(n.type==='MethodDefinition'){const src=js.slice(n.value.body.start,n.value.body.end).replace(/\s+/g,' ');if(src.length>200)(bodies[src]=bodies[src]||[]).push((n.key.name)+'@'+n.loc.start.line)}});
console.log('IDENTICAL METHOD BODIES:',Object.values(bodies).filter(v=>v.length>1).map(v=>v.join('=')).join('  '));
