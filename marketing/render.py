#!/usr/bin/env python3
"""Deterministic, offline marketing film: Pillow motion graphics + macOS say + FFmpeg."""
import argparse, json, math, os, shutil, subprocess, textwrap
from pathlib import Path
from functools import lru_cache
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
W, H = 1280, 720
BG, WHITE, MUTED, TEAL = '#08151c', '#eef5f4', '#8babb8', '#74f5cf'

def run(args):
    subprocess.run([str(a) for a in args], check=True)

def duration(path):
    return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(path)]))

@lru_cache(None)
def font(size, bold=False):
    override = os.environ.get('MARKETING_FONT_BOLD' if bold else 'MARKETING_FONT')
    candidates = [override, '/System/Library/Fonts/Supplemental/Arial'+(' Bold' if bold else '')+'.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold' if bold else '')+'.ttf']
    for p in candidates:
        if p and Path(p).exists(): return ImageFont.truetype(p,size)
    raise RuntimeError('Set MARKETING_FONT and MARKETING_FONT_BOLD to TrueType font paths.')

def label(d, xy, s, size=20, color=WHITE, bold=False):
    for line_number, line in enumerate(s.split('\n')):
        d.text((xy[0], xy[1] + line_number * (size + 9)), line, font=font(size,bold), fill=color)

def card(d, box, fill='#102630', outline='#25424c', radius=18):
    d.rounded_rectangle(box, radius, fill=fill, outline=outline, width=1)

def model(d, t, isolated=False, center=(925,350), scale=1):
    angle = -.55 + .16*math.sin(t*.7)
    def point(x,y,z):
        a=x*math.cos(angle)-z*math.sin(angle)
        b=x*math.sin(angle)+z*math.cos(angle)
        return (center[0]+a*scale,center[1]+(b*.40-y)*scale)
    for v in range(-4,5):
        d.line([point(v*50,-58,-200),point(v*50,-58,200)],fill='#183641',width=1)
        d.line([point(-200,-58,v*50),point(200,-58,v*50)],fill='#183641',width=1)
    for floor in range(4):
        for col in range(5):
            focus = floor==2 and col==3
            if isolated and not focus: continue
            x,z,y = (col-2)*66,-48,floor*49-30
            vertices=[point(x+dx,y+dy,z+dz) for dx,dy,dz in [(0,0,0),(58,0,0),(58,0,94),(0,0,94),(0,42,0),(58,42,0),(58,42,94),(0,42,94)]]
            for face in [(0,1,5,4),(1,2,6,5),(4,5,6,7)]:
                d.polygon([vertices[i] for i in face], fill=('#255d59' if focus else '#16303c'),outline=(TEAL if focus else '#527986'),width=2)
    if isolated:
        label(d,(790,470),'SELECTED / IFC ELEMENT',15,TEAL,True)

def frame(scene, index, t, length, subtitle, project):
    im=Image.new('RGB',(W,H),BG); d=ImageDraw.Draw(im)
    d.ellipse((820,-350,1530,360),fill='#0b232c')
    label(d,(54,30),project,19,WHITE,True)
    label(d,(1055,32),'PRODUCT FILM',13,MUTED)
    d.line((54,72,1226,72),fill='#25424c')
    label(d,(54,113),scene['eyebrow'],15,TEAL,True)
    # Titles are manually broken to preserve editorial rhythm.
    label(d,(52,164),scene['title'],45,WHITE,True)
    for n,line in enumerate(textwrap.wrap(scene['detail'],43)):
        label(d,(54,292+n*27),line,19,MUTED)
    sid=scene['id']
    card(d,(660,110,1226,558))
    label(d,(684,132),'ASTRA / MODEL WORKSPACE',13,MUTED,True)
    if sid in ('intro','explore','isolate','outro'):
        model(d,t, sid=='isolate',scale=(1.20 if sid=='isolate' else 1))
        card(d,(685,493,1200,535),fill='#0a1e26')
        label(d,(704,505),'IFC MODEL     /     ZOOM +  −     /     ISOLATE',14,TEAL)
    elif sid=='mapping':
        for n,(a,b) in enumerate([('Selected object','Exterior wall'),('Standard reference','UniFormat'),('Suggested mapping','B2010 · Exterior Walls'),('Review status','Awaiting human review')]):
            y=183+n*74; label(d,(687,y),a,14,MUTED); label(d,(687,y+24),b,23,TEAL if n==2 else WHITE,True)
    elif sid=='conversation':
        card(d,(683,182,1202,253),fill='#23443f')
        label(d,(702,202),'Which objects need compliance review?',20,WHITE)
        for n,s in enumerate(['Inspect the selected object’s properties.','Compare against the applicable standard.','Review the evidence before deciding.']):
            label(d,(704,297+n*42),s,19,WHITE)
        label(d,(704,462),'MODEL CONTEXT  →  REVIEW ACTION',15,TEAL,True)
    elif sid=='verify':
        for n,txt in enumerate(['01   Inspect object properties','02   Capture a review issue','03   Export a spreadsheet']):
            y=193+n*94; card(d,(684,y,1201,y+68)); label(d,(707,y+22),txt,23,TEAL if n==int(t/length*3) else WHITE,True)
    elif sid=='astra':
        for n,(a,b) in enumerate([('GPT-Live-1','Natural conversation'),('Visual Understanding','Understand model context'),('Agents API','Connect context to actions')]):
            y=183+n*111; label(d,(690,y),a,27,TEAL,True); label(d,(690,y+39),b,20,MUTED)
    label(d,(54,435),f'{index+1:02d} / 08',17,TEAL,True)
    label(d,(54,479),'ILLUSTRATIVE PRODUCT DEMO',12,MUTED,True)
    if sid in ('mapping','conversation','astra'):
        label(d,(54,502),'AI integration vision · not a live AI recording',14,MUTED)
    else:
        label(d,(54,502),'Animated workflow · representative model geometry',14,MUTED)
    d.line((54,585,1226,585),fill='#25424c')
    for n,line in enumerate(textwrap.wrap(subtitle,99)):
        tw=d.textlength(line,font=font(21)); label(d,((W-tw)/2,613+29*n),line,21)
    d.rectangle((54,697,54+1172*(index+t/length)/8,700),fill=TEAL)
    # Short fades only on visuals; narration remains fully audible.
    opacity=min(1,t/.25,(length-t)/.25)
    return Image.blend(Image.new('RGB',(W,H),BG),im,max(0,opacity))

def timestamp(sec):
    ms=round(sec*1000); h,ms=divmod(ms,3600000); m,ms=divmod(ms,60000); s,ms=divmod(ms,1000)
    return f'{h:02}:{m:02}:{s:02},{ms:03}'

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--storyboard',type=Path,default=ROOT/'storyboard.json')
    ap.add_argument('--output',type=Path,default=ROOT/'output')
    ap.add_argument('--voice',help='Installed macOS English voice (default: storyboard voice)')
    ap.add_argument('--audio-dir',type=Path,help='Use <scene-id>.wav for every scene instead of macOS say')
    ap.add_argument('--fps',type=int,default=24,choices=[12,24,30])
    args=ap.parse_args()
    for tool in ['ffmpeg','ffprobe']:
        if not shutil.which(tool): ap.error(f'{tool} is required')
    if not args.audio_dir and not shutil.which('say'): ap.error('Use --audio-dir with narrated WAV files, or render on macOS with say.')
    story=json.loads(args.storyboard.read_text()); out=args.output.resolve(); out.mkdir(parents=True,exist_ok=True)
    prepared=[]
    for scene in story['scenes']:
        sid=scene['id']; audio=out/f'{sid}.aiff'
        if args.audio_dir: audio=args.audio_dir.resolve()/f'{sid}.wav'
        else:
            script=out/f'{sid}.txt'; script.write_text(scene['narration'])
            run(['say','-v',args.voice or story['voice'],'-r',story['rate'],'-f',script,'-o',audio])
        secs=math.ceil((duration(audio)+.7)*args.fps)/args.fps
        prepared.append((scene,audio,secs))
    total=sum(x[2] for x in prepared)
    if total>120: raise SystemExit(f'Narration requires {total:.1f}s. Shorten storyboard or increase speech rate; maximum is 120s.')
    srt=[]; offset=0; manifest=[]
    for i,(scene,audio,secs) in enumerate(prepared):
        print(f'Rendering {i+1}/{len(prepared)}: {scene["id"]} ({secs:.1f}s)',flush=True)
        words=scene['narration'].split(); chunks=[' '.join(words[n:n+12]) for n in range(0,len(words),12)]
        speech=duration(audio); timings=[]; elapsed=0
        for chunk in chunks:
            end=elapsed+speech*len(chunk.split())/len(words); timings.append((elapsed,end,chunk)); elapsed=end
            srt.append(f'{len(srt)+1}\n{timestamp(offset+timings[-1][0])} --> {timestamp(offset+end)}\n{chunk}\n')
        dest=out/f'{i:02}-{scene["id"]}.mp4'
        command=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(args.fps),'-i','pipe:0','-i',str(audio),'-af','apad,loudnorm=I=-16:TP=-1.5:LRA=9','-t',str(secs),'-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','-b:a','192k',str(dest)]
        proc=subprocess.Popen(command,stdin=subprocess.PIPE)
        try:
            for n in range(round(secs*args.fps)):
                t=n/args.fps; sub=next((c for start,end,c in timings if start<=t<end),'')
                im=frame(scene,i,t,secs,sub,story['project'])
                if n==args.fps*2: im.save(out/f'preview-{scene["id"]}.jpg',quality=92)
                proc.stdin.write(im.tobytes())
        finally: proc.stdin.close()
        if proc.wait(): raise RuntimeError(f'FFmpeg failed on {scene["id"]}')
        manifest.append({'scene':scene['id'],'start':offset,'duration':secs}); offset+=secs
    (out/'captions.srt').write_text('\n'.join(srt))
    (out/'timeline.json').write_text(json.dumps(manifest,indent=2))
    # Fixed generated filenames avoid concat escaping issues.
    (out/'concat.txt').write_text('\n'.join(f"file '{i:02}-{scene['id']}.mp4'" for i,(scene,_,_) in enumerate(prepared)))
    final=out/'Astra-IFC-Complience-demo.mp4'
    run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',out/'concat.txt','-c','copy','-movflags','+faststart',final])
    actual=duration(final)
    if actual>120: raise RuntimeError(f'Output exceeds 120 seconds: {actual}')
    print(f'Done: {final} ({actual:.2f}s)',flush=True)

if __name__=='__main__': main()
