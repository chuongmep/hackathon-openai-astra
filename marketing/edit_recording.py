#!/usr/bin/env python3
"""Cut a screen recording, apply exact 1.2x playback, and add silent description cards."""
import argparse,json,subprocess
from pathlib import Path
from PIL import Image,ImageDraw
from render import font,duration
ROOT=Path(__file__).resolve().parent

def run(command): subprocess.run([str(x) for x in command],check=True)

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('input',type=Path)
 p.add_argument('--edit',type=Path,default=ROOT/'recording-edit.json')
 p.add_argument('--output',type=Path,default=ROOT/'output/recording-short.mp4')
 a=p.parse_args(); source=a.input.resolve(); final=a.output.resolve()
 edit=json.loads(a.edit.read_text()); speed=edit['speed']; segments=edit['segments']
 total=sum((s['end']-s['start'])/speed for s in segments)
 if speed<=0 or not 0<total<=120: p.error('Edit must have positive speed and duration no longer than 120 seconds.')
 source_length=duration(source)
 for s in segments:
  if not 0<=s['start']<s['end']<=source_length: p.error('Segment is outside the source recording.')
 work=final.parent/'recording-edit'; work.mkdir(parents=True,exist_ok=True)
 timeline=[]; position=0
 for i,s in enumerate(segments):
  card=Image.new('RGBA',(1920,1080),(0,0,0,0)); d=ImageDraw.Draw(card)
  d.rectangle((0,944,1920,1080),fill='#08151c')
  d.rectangle((80,963,85,1057),fill='#74f5cf')
  d.text((108,963),s['title'],font=font(32,True),fill='#eef5f4')
  d.text((108,1012),s['description'],font=font(24),fill='#adc4cc')
  d.text((1740,977),f'{i+1:02d} / {len(segments):02d}',font=font(24,True),fill='#74f5cf')
  png=work/f'card-{i:02}.png'; card.save(png)
  secs=(s['end']-s['start'])/speed
  print(f'Rendering scene {i+1}/{len(segments)} ({secs:.2f}s)',flush=True)
  run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',s['start'],'-t',s['end']-s['start'],'-i',source,'-loop','1','-i',png,'-filter_complex',f'[0:v]setpts=(PTS-STARTPTS)/{speed},scale=1760:944:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:0:color=0x08151c,setsar=1[screen];[screen][1:v]overlay=0:0:shortest=1[v]','-map','[v]','-an','-t',secs,'-r','30','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',work/f'clip-{i:02}.mp4'])
  timeline.append({**s,'output_start':position,'output_duration':secs}); position+=secs
 (work/'concat.txt').write_text('\n'.join(f"file 'clip-{i:02}.mp4'" for i in range(len(segments))))
 run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',work/'concat.txt','-map','0:v','-an','-c','copy','-movflags','+faststart',final])
 (work/'timeline.json').write_text(json.dumps(timeline,indent=2))
 actual=duration(final)
 if actual>120: raise RuntimeError('Rendered video exceeds 120 seconds')
 print(f'Finished: {final} ({actual:.2f}s; {speed}x; no audio)',flush=True)

if __name__=='__main__': main()
