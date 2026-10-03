from pathlib import Path
import re, math

css=Path(__file__).resolve().parents[1].joinpath('css/themes.css').read_text()

def rgb(h):
    h=h.lstrip('#');return [int(h[i:i+2],16)/255 for i in (0,2,4)]
def lum(h):
    vals=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb(h)]
    return .2126*vals[0]+.7152*vals[1]+.0722*vals[2]
def contrast(a,b):
    x,y=lum(a),lum(b);return (max(x,y)+.05)/(min(x,y)+.05)

themes={}
for name,body in re.findall(r'body\[data-theme="([^"]+)"\]\{([^}]+)\}',css):
    vals=dict(re.findall(r'(--[\w-]+):\s*(#[0-9a-fA-F]{6})',body))
    if vals:themes[name]=vals
assert len(themes)>=7,themes.keys()
results={}
for name,v in themes.items():
    pairs=[('text/bg','--text','--bg'),('muted/panel2','--muted','--panel2'),('accent/panel2','--accent','--panel2')]
    ratios={label:round(contrast(v[a],v[b]),2) for label,a,b in pairs}
    assert ratios['text/bg']>=4.5,(name,ratios)
    assert ratios['muted/panel2']>=4.5,(name,ratios)
    assert ratios['accent/panel2']>=4.5,(name,ratios)
    results[name]=ratios
print('PASS contrast',results)
