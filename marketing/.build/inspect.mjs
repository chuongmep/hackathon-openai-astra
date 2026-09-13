import fs from 'node:fs/promises';
import {PresentationFile,FileBlob} from '@oai/artifact-tool';
const p=await PresentationFile.importPptx(await FileBlob.load('/Users/me/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-simple-dark-mode/assets/reference.pptx'));
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(p.slides)));
let rows=[];for(let i=0;i<p.slides.items.length;i++){let s=p.slides.items[i];rows.push({slide:i+1,shapes:s.shapes.items.map(x=>({id:x.id,text:x.text.toString(),pos:x.position})),images:s.images.items.map(x=>({id:x.id,frame:x.frame}))});}
await fs.writeFile('inspect.json',JSON.stringify(rows,null,2));
await fs.writeFile('template.webp',new Uint8Array(await (await p.export({format:'webp',montage:true,scale:.4})).arrayBuffer()));
