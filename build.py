# Builds index.html (the single file the app loads) from the src-* files.
# Usage: python3 build.py        -> rebuild index.html
#        python3 build.py --check -> verify index.html matches the sources (used by CI)
import json,re
import glob,sys
t=open('src-template.html').read()
app=''.join(open(f).read() for f in sorted(glob.glob('src-[0-9][0-9]-*.js')))
t=re.sub(r'<script src="https://c[^"]*"></script>\n','',t)
t=t.replace('<div class="stage">\n    <div id="map"></div>','<div class="stage" id="stage">\n    <canvas id="gl"></canvas><canvas id="map"></canvas><div id="gtip"></div><div id="real"><div id="czmap"></div><div id="t4bar"><button data-t4="in" aria-label="Closer">+</button><button data-t4="out" aria-label="Farther">−</button><button data-t4="up" aria-label="Look up">▲</button><button data-t4="dn" aria-label="Look down">▼</button><button data-t4="l" aria-label="Turn left">⟲</button><button data-t4="r" aria-label="Turn right">⟳</button><button data-insp="auto" aria-label="Inspect" style="width:auto;padding:0 9px;font-size:10px;letter-spacing:.08em">INSPECT</button><button data-t4="x" aria-label="Back to globe">✕</button></div></div><div id="tilt"><div id="t3map"></div><div id="t3bar"><button data-t3="up" aria-label="Tilt more">Tilt+</button><button data-t3="dn" aria-label="Tilt less">Tilt−</button><button data-t3="l" aria-label="Rotate left">⟲</button><button data-t3="r" aria-label="Rotate right">⟳</button><button data-t3="n" aria-label="Top-down, north up">N</button><button data-t3="terr" class="on" aria-label="Terrain">⛰</button><button data-t3="dark" class="on" aria-label="Dark map">◐</button><button data-t3="x" aria-label="Back to globe">✕</button></div></div><div id="ftiles"></div><div id="brandov"><svg class="omark" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linejoin="miter"><path d="M32 3 61 32 32 61 3 32Z" stroke-width="3.2"/><path d="M32 14 50 32 32 50 14 32Z" stroke-width="2.6" opacity=".8"/><path d="M32 24 40 32 32 40 24 32Z" stroke-width="2.2" opacity=".6"/></g><circle cx="32" cy="32" r="3.6" fill="currentColor"/></svg><span><b>OJOS DE DIOS</b><em>Eyes open. Always.</em></span></div><div id="lfrail"></div><div id="drvhud"></div><div id="dotsleg"></div><div id="attr">Imagery © Esri, Maxar, Earthstar Geographics</div>')
t=t.replace('#map{position:absolute;inset:0}','#map{position:absolute;inset:0;touch-action:none;cursor:grab}\n#gtip{position:absolute;display:none;pointer-events:none;background:#08111aee;border:1px solid #15263a;border-radius:6px;padding:6px 9px;font-size:12px;z-index:6;max-width:220px}#gtip span{color:#6a7f95}')
t=t.replace('<script id="cam-data"','<script id="gaz" type="application/json">'+open('src-data-places.json').read().replace('\n','')+'</script>\n<script id="cam-data"')
t=t.replace('__DATA__',json.dumps(json.load(open('src-data-portals.json')),ensure_ascii=False).replace('<','\\u003c'))
i=t.index('<script>\n(function(){');j=t.index('</script>',i)
t=t[:i]+'<script id="land-dots" type="application/json">'+open('src-data-land.json').read()+'</script>\n<script>\n'+app+'</script>'+t[j+9:]
p=t.replace('<title>','<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#03060a">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<link rel="apple-touch-icon" href="apple-touch-icon.png">\n<link rel="icon" href="icon-192.png">\n<title>',1)
p=p.replace('</body>','<script>if("serviceWorker" in navigator&&location.protocol==="https:"){navigator.serviceWorker.register("sw.js").catch(function(){})}</script>\n</body>')
open('bundle-check.js','w').write(app)
if '--check' in sys.argv:
    same=open('index.html').read()==p
    print('index.html matches the sources' if same else 'index.html is OUT OF DATE: run python3 build.py')
    sys.exit(0 if same else 1)
open('index.html','w').write(p)
print('built index.html (%d bytes) from %d source files'%(len(p),len(glob.glob('src-*'))))
