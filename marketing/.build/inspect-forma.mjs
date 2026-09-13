import fs from 'node:fs/promises';import {PresentationFile,FileBlob} from '@oai/artifact-tool';
let p=await PresentationFile.importPptx(await FileBlob.load('../../assets/Astra-IFC-Complience-Comparison.pptx'));console.log(JSON.stringify(p.slides.items.map((s,i)=>({i,shapes:s.shapes.items.map(x=>({id:x.id,t:x.text.toString(),pos:x.position})),images:s.images.items.map(x=>x.id)}))));
