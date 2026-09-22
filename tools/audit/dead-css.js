const fs=require('fs'),postcss=require('postcss'),sp=require('postcss-selector-parser');const D=(p=>require('fs').existsSync(p+'/public/index.html')?p+'/public/':p+'/')(require('path').resolve(process.argv[2]||'.'));
const css=fs.readFileSync(D+'styles.css','utf8');const src=['app.js','index.html','i18n.js','seed-data.js'].map(f=>fs.readFileSync(D+f,'utf8')).join('\n');
const tok=new Set(src.match(/[A-Za-z_][\w-]*/g));tok.add('label-hour');tok.add('label-next-day');tok.add('label-next-week');
let dl=0,dr=0,partial=[];postcss.parse(css).walkRules(r=>{if(r.parent.type==='atrule'&&/keyframes/.test(r.parent.name))return;
 const dead=r.selectors.map(s=>{let d=false;try{sp(x=>x.walkClasses(n=>{if(!tok.has(n.value))d=true})).processSync(s)}catch{};return d});
 if(dead.every(Boolean)){dr++;dl+=r.source.end.line-r.source.start.line+1}else if(dead.some(Boolean))partial.push(r.source.start.line)});
console.log('fully-dead rules',dr,'lines',dl,'rules with some dead selectors',partial.length, partial.join(','));
