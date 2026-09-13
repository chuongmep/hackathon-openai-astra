import zipfile,xml.etree.ElementTree as E
src='/Users/me/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-simple-dark-mode/assets/reference.pptx'
z=zipfile.ZipFile(src);p=E.fromstring(z.read('ppt/presentation.xml'));ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main'};lst=p.find('p:sldIdLst',ns);old=list(lst)
for x in old:lst.remove(x)
for n in [1,5,8,13,6,3,7,26]:lst.append(old[n-1])
with zipfile.ZipFile('subset.pptx','w',zipfile.ZIP_DEFLATED) as out:
 for n in z.namelist():
  data=E.tostring(p) if n=='ppt/presentation.xml' else z.read(n)
  if n=='ppt/slides/slide3.xml':
   for a,b in zip(['Agenda item one','Agenda item two','Agenda item three','Agenda item four','Agenda item five','Agenda item six'],['Open the sample IFC model','Select an object and inspect properties','Ask about the selected element','Isolate it and inspect the 3D view','Draft and save a review issue','Filter the sheet and export Excel']):data=data.replace(a.encode(),b.encode())
  out.writestr(n,data)
