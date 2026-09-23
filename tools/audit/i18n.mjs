import fs from 'fs';
import path from 'path';const R0=path.resolve(process.argv[2]||'.');const D=(await import('fs')).existsSync(R0+'/public/index.html')?R0+'/public/':R0+'/';
import {createRequire} from 'module';const SF=createRequire(import.meta.url)('./src-files.cjs');const {TRANSLATIONS}=await import((await import('url')).pathToFileURL(SF.i18nPath(D)).href);
const js=SF.readApp(D),html=fs.readFileSync(D+'index.html','utf8');
const ro=Object.keys(TRANSLATIONS.ro),en=Object.keys(TRANSLATIONS.en);
console.log('ro',ro.length,'en',en.length);
console.log('in ro not en:',ro.filter(k=>!en.includes(k)).join(' '));
console.log('in en not ro:',en.filter(k=>!ro.includes(k)).join(' '));
const src=js+html;
// Keys built at runtime: role_${role}, post_status_${status}, plural forms <key>_one (see tn()).
const DYNAMIC=[/^role_/,/^post_status_/,/_one$/];
const unused=ro.filter(k=>!DYNAMIC.some(re=>re.test(k))&&!new RegExp('[\'"`.]'+k+'\\b').test(src)&&!src.includes(k));
console.log('UNUSED KEYS ('+unused.length+'):',unused.join(' '));
// dynamic prefixes
console.log('dynamic t( calls:',(js.match(/t\(\s*`[^`]*\$\{[^`]*`/g)||[]).slice(0,20).join(' | '));
console.log('t() refs to undefined keys:',[...new Set((js.match(/\bt\(\s*["']([\w]+)["']/g)||[]).map(m=>m.match(/["'](\w+)/)[1]))].filter(k=>!ro.includes(k)).join(' '));
const same=ro.filter(k=>TRANSLATIONS.ro[k]===TRANSLATIONS.en[k]&&TRANSLATIONS.ro[k]&&/[a-z]{4}/i.test(TRANSLATIONS.ro[k]));console.log('RO==EN (untranslated?) '+same.length+':',same.slice(0,40).map(k=>k+'="'+String(TRANSLATIONS.ro[k]).slice(0,30)+'"').join(' ; '));
const vals={};ro.forEach(k=>{const v=TRANSLATIONS.ro[k];(vals[v]=vals[v]||[]).push(k)});console.log('DUPLICATE RO VALUES:',Object.entries(vals).filter(([v,k])=>k.length>2).map(([v,k])=>'"'+v.slice(0,25)+'"×'+k.length).join(' ; '));
// duplicate keys inside one language block (the last one silently wins)
const src18=fs.readFileSync(SF.i18nPath(D),'utf8');const enAt=src18.indexOf('\n  en: {');
for(const [lang,seg] of [['ro',src18.slice(0,enAt)],['en',src18.slice(enAt)]]){const c={};for(const m of seg.matchAll(/^\s{4}([a-z0-9_]+):/gm))c[m[1]]=(c[m[1]]||0)+1;console.log('DUPLICATE KEYS ('+lang+'):',Object.keys(c).filter(k=>c[k]>1).join(' ')||'none');}
