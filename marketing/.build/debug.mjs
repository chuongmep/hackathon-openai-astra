import fs from 'node:fs/promises';
import {PresentationFile,FileBlob} from '@oai/artifact-tool';
import {finalizePresentation} from '/Users/me/.codex/plugins/cache/openai-primary-runtime/presentations/26.909.12148/skills/presentations/container_tools/artifact_tool_utils.mjs';
const root='/Users/me/Downloads/repos/hackathon-openai-astra/marketing';
const p=await PresentationFile.importPptx(await FileBlob.load(root+'/output/Astra-IFC-Complience-Team.pptx'));
console.log(p.slides.insert.toString());
