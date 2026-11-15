#!/usr/bin/env python3
"""Generate the low-poly 3D models used in Photoreal 3D and Inspect.

Builds each model (airliner, regional jet, wide-body, turboprop, helicopter with animated rotor, cargo ship,
tanker, cruise ship, tug, satellite, car, truck, bus) from simple geometry with NumPy, writes it as a
binary glTF (.glb), and writes models.js: a `var MDL={...}` table of base64 data URIs that the app embeds
so the models load offline and without a CDN.

Usage::

    python3 make_models.py      # writes *.glb and models.js in the current directory

Requires NumPy.
"""
import numpy as np, json, struct, base64, math
class Mesh:
    def __init__(s): s.P=[];s.C=[]
    def tri(s,a,b,c,col): s.P+= [a,b,c]; s.C+=[col]*3
    def quad(s,a,b,c,d,col): s.tri(a,b,c,col); s.tri(a,c,d,col)
    def loft(s,rings,col,cap=True,cols=None):
        for i in range(len(rings)-1):
            A,B=rings[i],rings[i+1];n=len(A);c=cols[i] if cols else col
            for j in range(n): s.quad(A[j],A[(j+1)%n],B[(j+1)%n],B[j],c)
        if cap:
            for R,c in ((rings[0],cols[0] if cols else col),(rings[-1],cols[-1] if cols else col)):
                m=tuple(np.mean(R,axis=0))
                for j in range(len(R)): s.tri(m,R[j],R[(j+1)%len(R)],c)
    def box(s,x0,x1,y0,y1,z0,z1,col):
        s.loft([[(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0)],[(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]],col)
    def glb(s,path,rough=0.55,metal=0.15):
        P=np.array(s.P,dtype=np.float32);C=np.array(s.C,dtype=np.float32)
        T=P.reshape(-1,3,3);N=np.cross(T[:,1]-T[:,0],T[:,2]-T[:,0]);L=np.linalg.norm(N,axis=1,keepdims=True);L[L==0]=1;N=N/L
        ctr=T.mean(axis=1)-P.mean(axis=0);flip=(np.sum(N*ctr,axis=1)<0)  # crude outward orientation is unreliable for concave shapes; material is double sided
        N=np.repeat(N,3,axis=0).astype(np.float32)
        C8=np.concatenate([np.clip(C*255,0,255),np.full((len(C),1),255)],axis=1).astype(np.uint8)
        b=P.tobytes()+N.tobytes()+C8.tobytes();pad=(-len(b))%4;b+=b'\0'*pad;n=len(P)
        g={"asset":{"version":"2.0","generator":"ojos-de-dios"},"scene":0,"scenes":[{"nodes":[0]}],"nodes":[{"mesh":0}],
           "materials":[{"pbrMetallicRoughness":{"baseColorFactor":[1,1,1,1],"metallicFactor":metal,"roughnessFactor":rough},"doubleSided":True}],
           "meshes":[{"primitives":[{"attributes":{"POSITION":0,"NORMAL":1,"COLOR_0":2},"material":0,"mode":4}]}],
           "buffers":[{"byteLength":len(b)}],
           "bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":n*12,"target":34962},{"buffer":0,"byteOffset":n*12,"byteLength":n*12,"target":34962},{"buffer":0,"byteOffset":n*24,"byteLength":n*4,"target":34962}],
           "accessors":[{"bufferView":0,"componentType":5126,"count":n,"type":"VEC3","min":P.min(axis=0).tolist(),"max":P.max(axis=0).tolist()},{"bufferView":1,"componentType":5126,"count":n,"type":"VEC3"},{"bufferView":2,"componentType":5121,"normalized":True,"count":n,"type":"VEC4"}]}
        j=json.dumps(g,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
        out=struct.pack('<4sII',b'glTF',2,12+8+len(j)+8+len(b))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(b),b'BIN\0')+b
        open(path,'wb').write(out);return len(out),n//3
def ring(cx,cy,z,rx,ry,n=16): return [(cx+rx*math.cos(2*math.pi*k/n),cy+ry*math.sin(2*math.pi*k/n),z) for k in range(n)]
def hexc(h): return tuple(int(h[i:i+2],16)/255 for i in (1,3,5))
W,G,DG,T,BL,GL=hexc('#f4f6f9'),hexc('#c3ccd6'),hexc('#3a4350'),hexc('#3fe0d0'),hexc('#1b2b44'),hexc('#16202c')
# ---- airliner: nose +Z, up +Y, about 38 m long ----
m=Mesh();R=1.95
prof=[(19.0,0.05,-0.45),(18.3,0.55,-0.35),(17.2,1.1,-0.2),(15.6,1.6,-0.05),(13.5,1.9,0),(10,R,0),(-6,R,0),(-10,1.75,0.15),(-13.5,1.3,0.5),(-16.5,0.75,0.95),(-18.6,0.3,1.3),(-19.2,0.08,1.4)]
rings=[ring(0,cy,z,r,r) for z,r,cy in prof];m.loft(rings,W)
for sx in (-1,1):                       # cockpit glass and a window stripe
    m.quad((sx*0.25,0.75,16.9),(sx*1.2,0.55,16.2),(sx*1.25,1.05,15.4),(sx*0.3,1.35,15.9),GL)
    m.box(sx*(R+0.01),sx*(R+0.03),0.25,0.6,-9,13,BL) if sx>0 else m.box(sx*(R+0.03),sx*(R+0.01),0.25,0.6,-9,13,BL)
def wing(m,sx,root,tip,col,tipcol=None):
    # root/tip: (x, y, z_leading, z_trailing, thickness)
    def sec(x,y,zl,zt,t): zm=zl-(zl-zt)*0.3;return [(sx*x,y,zl),(sx*x,y+t/2,zm),(sx*x,y+t*0.15,zt),(sx*x,y-t/2,zm)]
    m.loft([sec(*root),sec(*tip)],col)
for sx in (-1,1):
    wing(m,sx,(1.4,-0.9,4.5,-3.2,0.9),(17.2,0.35,-5.6,-7.4,0.22),G)
    m.loft([[(sx*17.2,0.35,-5.7),(sx*17.25,0.35,-7.3),(sx*17.6,2.0,-7.7),(sx*17.55,2.0,-6.9)],[(sx*17.35,0.35,-5.7),(sx*17.4,0.35,-7.3),(sx*17.75,2.0,-7.7),(sx*17.7,2.0,-6.9)]],T)   # winglet
    wing(m,sx,(0.8,0.75,-14.6,-17.6,0.35),(6.6,1.15,-17.4,-18.9,0.12),G)                              # stabiliser
    ex=sx*5.9;er=[ring(ex,-1.75,z,r,r,12) for z,r in ((3.6,0.95),(3.2,1.08),(0.4,1.0),(-0.6,0.62))];m.loft(er,DG,cols=[T,DG,DG,DG]);m.box(ex-0.12,ex+0.12,-1.0,-0.55,-0.6,2.6,G)
m.loft([[(-0.18,1.7,-13.2),(0.18,1.7,-13.2),(0.18,1.9,-18.6),(-0.18,1.9,-18.6)],[(-0.07,7.4,-17.4),(0.07,7.4,-17.4),(0.07,7.4,-19.6),(-0.07,7.4,-19.6)]],T)   # fin
print('plane',m.glb('plane.glb'))
# ---- container ship: bow +Z, up +Y, about 210 m long, waterline at y=0 ----
s=Mesh();HU,RD,DK=hexc('#27384f'),hexc('#8f2f2a'),hexc('#55606c')
def hull(z,hw,keel):
    return [(-hw,9,z),(-hw*0.96,0,z),(-hw*0.7,-keel,z),(hw*0.7,-keel,z),(hw*0.96,0,z),(hw,9,z)]
sec=[(-105,13,5),(-100,15.5,7),(-60,16,8),(60,16,8),(82,13,7.5),(96,7,6),(103,2.5,3),(106,0.3,0.5)]
hr=[hull(*x) for x in sec];s.loft(hr,HU)
for i in range(len(hr)-1):
    A,B=hr[i],hr[i+1];s.quad(A[1],A[2],B[2],B[1],RD);s.quad(A[2],A[3],B[3],B[2],RD);s.quad(A[3],A[4],B[4],B[3],RD);s.quad(A[0],A[5],B[5],B[0],DK)
s.box(-13,13,9,30,-98,-80,W);s.box(-15,15,30,33,-99,-79,W);s.box(-14.5,14.5,30.6,32,-79.2,-78.9,GL);s.box(-4,4,33,43,-96,-88,T);s.box(-0.4,0.4,33,47,-84,-83.2,DG)
cc=[hexc(c) for c in ('#b8452f','#2f6fb8','#3d9a5b','#d9a233','#8a8f96','#c9cdd2','#7a3fa0','#2aa7a0')];rs=np.random.RandomState(5)
z=-74
while z<86:
    hw=16 if z<56 else max(3,16-(z-56)*0.33);nx=int((hw*2-2)//2.6);x0=-nx*1.3
    for k in range(nx):
        h=int(rs.randint(2,7));
        s.box(x0+k*2.6+0.08,x0+(k+1)*2.6-0.08,9,9+h*2.7,z,z+12.4,cc[rs.randint(0,len(cc))])
    z+=13.6
print('ship',s.glb('ship.glb',0.75,0.05))
# ---- satellite: body with gold foil, two solar wings, dish ----
t=Mesh();GO,PB,PF=hexc('#c9a24a'),hexc('#1c3f8f'),hexc('#aeb6c0')
t.box(-1,1,-1,1,-1.4,1.4,GO);t.box(-0.7,0.7,-0.7,0.7,1.4,1.9,PF)
for sx in (-1,1):
    t.box(min(sx*1,sx*1.8),max(sx*1,sx*1.8),-0.08,0.08,-0.08,0.08,PF)
    for k in range(4):
        x0=sx*(1.8+k*1.85);x1=sx*(1.8+k*1.85+1.75);t.box(min(x0,x1),max(x0,x1),-0.04,0.04,-1.3,1.3,PB if k%2==0 else hexc('#24509f'))
dr=[ring(0,1.05,0,0.15,0.15,14)];dr=[[(x,1.05,z) for x,_,z in [(0.15*math.cos(2*math.pi*k/14),0,0.15*math.sin(2*math.pi*k/14)) for k in range(14)]],[(1.1*math.cos(2*math.pi*k/14),1.75,1.1*math.sin(2*math.pi*k/14)) for k in range(14)]]
t.loft(dr,W,cap=False);t.box(-0.05,0.05,1.0,2.2,-0.05,0.05,PF)
print('sat',t.glb('sat.glb',0.35,0.6))
# ---- generic road vehicles: nose +Z, up +Y, wheels on y=0 ----
def wheels(m,xs,zs,r,w):
    for z in zs:
        for sx in (-1,1):
            m.loft([[(sx*xs+dx,r+r*math.sin(2*math.pi*k/10),z+r*math.cos(2*math.pi*k/10)) for k in range(10)] for dx in (-w/2,w/2)],DG)
CW=hexc('#dfe4ea')
c=Mesh();sec=lambda z,y0,y1,hw:[(-hw,y0,z),(hw,y0,z),(hw*0.94,y1,z),(-hw*0.94,y1,z)]
c.loft([sec(-2.2,.3,.82,.86),sec(-2.05,.28,.95,.9),sec(1.7,.28,.9,.9),sec(2.2,.32,.7,.84)],CW)
c.loft([sec(-1.55,.92,.95,.78),sec(-1.1,.92,1.42,.72),sec(.35,.92,1.42,.72),sec(1.05,.9,.93,.78)],GL);c.box(-.7,.7,1.42,1.45,-1.1,.35,CW)
wheels(c,.86,(-1.4,1.35),.33,.22);print('car',c.glb('car.glb'))
k=Mesh();k.box(-1.2,1.2,.9,3.1,3.6,5.6,CW);k.box(-1.15,1.15,2.0,2.9,5.6,5.63,GL);k.box(-1.25,1.25,1.0,4.0,-7.2,3.3,G);k.box(-1.1,1.1,.6,1.0,-7.0,5.4,DG)
wheels(k,1.12,(4.7,2.2,-5.0,-6.2),.5,.32);print('truck',k.glb('truck.glb'))
u=Mesh();u.box(-1.27,1.27,.4,3.1,-6,6,CW);u.box(-1.29,1.29,1.5,2.5,-5.6,5.4,GL);u.box(-1.2,1.2,1.4,2.7,6,6.03,GL);u.box(-1.28,1.28,.4,.75,-6,6,T)
wheels(u,1.15,(3.9,-3.6),.5,.3);print('bus',u.glb('bus.glb'))
# ---- more types: wide-body, light prop plane, helicopter, tanker, cruise ship, tug ----
def glb_parts(path,body,rotor=None,pivot=(0,0,0),axis=(0,0,1),period=0.5,rough=0.55,metal=0.15):
    def pack(m):
        P=np.array(m.P,dtype=np.float32);C=np.array(m.C,dtype=np.float32);T=P.reshape(-1,3,3)
        N=np.cross(T[:,1]-T[:,0],T[:,2]-T[:,0]);L=np.linalg.norm(N,axis=1,keepdims=True);L[L==0]=1;N=np.repeat(N/L,3,axis=0).astype(np.float32)
        C8=np.concatenate([np.clip(C*255,0,255),np.full((len(C),1),255)],axis=1).astype(np.uint8);return P,N,C8
    buf=b'';views=[];accs=[];meshes=[];nodes=[]
    def add(data,target=None):
        nonlocal buf
        off=len(buf);buf+=data;buf+=b'\0'*((-len(buf))%4);v={"buffer":0,"byteOffset":off,"byteLength":len(data)}
        if target:v["target"]=target
        views.append(v);return len(views)-1
    for m,node in ((body,{}),)+(((rotor,{"translation":list(pivot)}),) if rotor else ()):
        P,N,C8=pack(m);n=len(P);i=len(accs)
        accs+= [{"bufferView":add(P.tobytes(),34962),"componentType":5126,"count":n,"type":"VEC3","min":P.min(axis=0).tolist(),"max":P.max(axis=0).tolist()},
                {"bufferView":add(N.tobytes(),34962),"componentType":5126,"count":n,"type":"VEC3"},
                {"bufferView":add(C8.tobytes(),34962),"componentType":5121,"normalized":True,"count":n,"type":"VEC4"}]
        meshes.append({"primitives":[{"attributes":{"POSITION":i,"NORMAL":i+1,"COLOR_0":i+2},"material":0,"mode":4}]});node=dict(node);node["mesh"]=len(meshes)-1;nodes.append(node)
    g={"asset":{"version":"2.0","generator":"ojos-de-dios"},"scene":0,"scenes":[{"nodes":list(range(len(nodes)))}],"nodes":nodes,"meshes":meshes,
       "materials":[{"pbrMetallicRoughness":{"baseColorFactor":[1,1,1,1],"metallicFactor":metal,"roughnessFactor":rough},"doubleSided":True}]}
    if rotor:
        t=np.array([0,.25,.5,.75,1.0],dtype=np.float32)*period;ax=np.array(axis,dtype=np.float32);ax/=np.linalg.norm(ax)
        q=np.array([list(ax*math.sin(a/2))+[math.cos(a/2)] for a in np.array([0,.5,1,1.5,2])*math.pi],dtype=np.float32);i=len(accs)
        accs+=[{"bufferView":add(t.tobytes()),"componentType":5126,"count":5,"type":"SCALAR","min":[0.0],"max":[float(period)]},{"bufferView":add(q.tobytes()),"componentType":5126,"count":5,"type":"VEC4"}]
        g["animations"]=[{"name":"spin","channels":[{"sampler":0,"target":{"node":1,"path":"rotation"}}],"samplers":[{"input":i,"output":i+1,"interpolation":"LINEAR"}]}]
    g["buffers"]=[{"byteLength":len(buf)}];g["bufferViews"]=views;g["accessors"]=accs
    j=json.dumps(g,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
    open(path,'wb').write(struct.pack('<4sII',b'glTF',2,12+8+len(j)+8+len(buf))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(buf),b'BIN\0')+buf)
    return len(buf),sum(len(x.P) for x in (body,)+((rotor,) if rotor else ()))//3
def blades(m,n,r0,r1,chord,th,plane='xz',col=DG):
    # n blades radiating from the origin in the given plane, thin
    for k in range(n):
        a=2*math.pi*k/n;c,s_=math.cos(a),math.sin(a)
        def pt(r,w,h):
            x,y=r*c-w*s_,r*s_+w*c
            return (x,h,y) if plane=='xz' else (x,y,h)
        m.loft([[pt(r0,-chord/2,-th),pt(r0,chord/2,-th),pt(r0,chord/2,th),pt(r0,-chord/2,th)],[pt(r1,-chord*.35,-th*.6),pt(r1,chord*.35,-th*.6),pt(r1,chord*.35,th*.6),pt(r1,-chord*.35,th*.6)]],col)
# wide-body: the airliner scaled up, with four engines
w=Mesh();w.P=[tuple(v*1.75 for v in p) for p in m.P];w.C=list(m.C)
for sx in (-1,1):
    ex=sx*11.6*1.75;er=[ring(ex,-1.35*1.75,z*1.75,r*1.75,r*1.75,12) for z,r in ((0.6,0.8),(0.3,0.9),(-2.0,0.84),(-2.8,0.5))];w.loft(er,DG,cols=[T,DG,DG,DG]);w.box(ex-.2,ex+.2,-1.2,-.6,-4.6,-.6,G)
print('wide',glb_parts('wide.glb',w))
# light propeller plane: high wing, fixed gear, nose propeller that turns
p=Mesh();prof2=[(3.6,.12,0),(3.3,.45,0),(2.4,.62,.05),(1.2,.68,.15),(-.2,.62,.12),(-2.2,.36,.2),(-4.0,.14,.3)]
p.loft([ring(0,cy,z,r*.92,r,12) for z,r,cy in prof2],CW)
p.loft([[(-.55,.62,2.0),(.55,.62,2.0),(.5,.98,1.3),(-.5,.98,1.3)],[(-.55,.62,.2),(.55,.62,.2),(.5,.98,.5),(-.5,.98,.5)]],GL)
for sx in (-1,1):
    p.loft([[(sx*.1,.95,1.5),(sx*.1,1.07,1.2),(sx*.1,.98,.1),(sx*.1,.9,1.1)],[(sx*5.5,1.0,1.25),(sx*5.5,1.06,1.05),(sx*5.5,1.0,.35),(sx*5.5,.97,1.0)]],T)
    p.loft([[(sx*.1,.45,-3.3),(sx*.1,.5,-3.5),(sx*.1,.46,-4.1),(sx*.1,.42,-3.5)],[(sx*1.8,.47,-3.6),(sx*1.8,.5,-3.7),(sx*1.8,.47,-4.1),(sx*1.8,.45,-3.7)]],T)
    p.box(sx*1.0-.04,sx*1.0+.04,-.75,.3,.9,1.0,G);wheels(p,1.0,(.95,),.22,.14)
p.P=[(x,y+.97,z) for x,y,z in p.P]
p.loft([[(-.05,1.5,-3.2),(.05,1.5,-3.2),(.05,1.6,-4.1),(-.05,1.6,-4.1)],[(-.03,2.7,-3.8),(.03,2.7,-3.8),(.03,2.7,-4.2),(-.03,2.7,-4.2)]],T)
pr=Mesh();blades(pr,2,.08,.95,.2,.02,'xy');pr.loft([ring(0,0,-.05,.14,.14,8),ring(0,0,.22,.02,.02,8)],G)
print('prop',glb_parts('prop.glb',p,pr,(0,.97,3.62),(0,0,1),0.16))
# helicopter: main rotor turns
h=Mesh();h.loft([ring(0,cy,z,rx,ry,12) for z,rx,ry,cy in ((2.6,.15,.15,1.2),(2.2,.6,.6,1.25),(1.2,.95,1.0,1.4),(-.4,.95,1.05,1.5),(-1.6,.6,.7,1.6),(-2.4,.25,.3,1.75),(-6.6,.1,.12,1.95))],CW)
h.loft([[(-.6,1.5,2.35),(.6,1.5,2.35),(.75,2.2,1.5),(-.75,2.2,1.5)],[(-.8,1.3,1.3),(.8,1.3,1.3),(.8,2.25,.7),(-.8,2.25,.7)]],GL)
h.loft([[(-.04,1.95,-5.9),(.04,1.95,-5.9),(.04,2.0,-6.7),(-.04,2.0,-6.7)],[(-.03,3.0,-6.5),(.03,3.0,-6.5),(.03,3.0,-6.9),(-.03,3.0,-6.9)]],T)
h.box(-.12,.12,2.4,2.85,-.3,.3,G)
for sx in (-1,1):
    h.box(sx*1.05-.05,sx*1.05+.05,0,.1,-1.6,1.9,DG);h.box(sx*1.0-.03,sx*1.0+.03,.1,.7,1.0,1.06,DG);h.box(sx*1.0-.03,sx*1.0+.03,.1,.7,-1.0,-.94,DG)
hr=Mesh();blades(hr,4,.15,5.4,.34,.03,'xz');hr.loft([ring(0,0,-.1,.2,.2,8),ring(0,0,.1,.2,.2,8)],G)
hr.P=[(x,y,z) for x,y,z in hr.P]
print('heli',glb_parts('heli.glb',h,hr,(0,2.92,0),(0,1,0),0.22))
# ships
def hullmesh(mm,L,B,D,keel,col,deck,red=hexc('#8f2f2a')):
    sec=[(-.5,.82,.6),(-.47,.97,.85),(-.28,1,1),(.28,1,1),(.39,.82,.94),(.455,.44,.75),(.49,.16,.4),(.505,.02,.06)]
    hr=[[(-B*b,D,L*z),(-B*b*.96,0,L*z),(-B*b*.7,-keel*kk,L*z),(B*b*.7,-keel*kk,L*z),(B*b*.96,0,L*z),(B*b,D,L*z)] for z,b,kk in sec]
    mm.loft(hr,col)
    for i in range(len(hr)-1):
        A,Bq=hr[i],hr[i+1];mm.quad(A[1],A[2],Bq[2],Bq[1],red);mm.quad(A[2],A[3],Bq[3],Bq[2],red);mm.quad(A[3],A[4],Bq[4],Bq[3],red);mm.quad(A[0],A[5],Bq[5],Bq[0],deck)
tk=Mesh();hullmesh(tk,240,21,7,10,hexc('#3a2a26'),hexc('#7a3a30'))
tk.box(-14,14,7,26,-112,-92,W);tk.box(-17,17,26,29,-113,-91,W);tk.box(-16.5,16.5,26.6,28,-91.2,-90.9,GL);tk.box(-4,4,29,40,-109,-101,hexc('#c9a24a'))
for x in (-2.2,0,2.2): tk.loft([ring(x,8.4,-85,.7,.7,8),ring(x,8.4,96,.7,.7,8)],G)
for z in range(-70,95,26):
    tk.box(-16,16,7,9.6,z,z+1.2,G);tk.loft([[(-9+2.6*math.cos(2*math.pi*k/10),y,z+11+2.6*math.sin(2*math.pi*k/10)) for k in range(10)] for y in (7,8.3)],DG);tk.loft([[(9+2.6*math.cos(2*math.pi*k/10),y,z+11+2.6*math.sin(2*math.pi*k/10)) for k in range(10)] for y in (7,8.3)],DG)
tk.box(-1,1,7,22,10,12,G);tk.box(-1,1,7,22,-30,-28,G)
print('tanker',glb_parts('tanker.glb',tk,rough=0.75,metal=0.05))
cr=Mesh();hullmesh(cr,300,19,12,8,W,hexc('#c9d2dc'),hexc('#1b3f7a'))
for i,(z0,z1,hw) in enumerate(((-128,112,18),(-124,104,18),(-120,96,17.5),(-114,86,17),(-108,74,16.5),(-100,58,15.5),(-60,40,13))):
    y=12+i*3.4;cr.box(-hw,hw,y,y+3.2,z0,z1,W);cr.box(-hw-.05,hw+.05,y+1.0,y+2.3,z0+3,z1-3,GL)
cr.box(-5,5,35.8,47,-58,-40,hexc('#1b3f7a'));cr.box(-4,4,35.8,39,10,26,T)
print('cruise',glb_parts('cruise.glb',cr,rough=0.6,metal=0.05))
tg=Mesh();hullmesh(tg,30,5,2.6,2.4,hexc('#1f2f44'),hexc('#55606c'))
tg.box(-3.2,3.2,2.6,5.6,-3,6,W);tg.box(-2.6,2.6,5.6,8,0,5,W);tg.box(-2.65,2.65,6.3,7.4,4.9,5.05,GL);tg.box(-.8,.8,5.6,9.6,-2.4,-.9,hexc('#b8452f'));tg.box(-4.4,4.4,2.6,3.2,-14,-13.4,DG)
print('tug',glb_parts('tug.glb',tg,rough=0.75,metal=0.05))
b64=lambda f:base64.b64encode(open(f,'rb').read()).decode()
js='var MDL={plane:"data:model/gltf-binary;base64,%s",ship:"data:model/gltf-binary;base64,%s",sat:"data:model/gltf-binary;base64,%s",car:"data:model/gltf-binary;base64,%s",truck:"data:model/gltf-binary;base64,%s",bus:"data:model/gltf-binary;base64,%s",wide:"data:model/gltf-binary;base64,%s",prop:"data:model/gltf-binary;base64,%s",heli:"data:model/gltf-binary;base64,%s",tanker:"data:model/gltf-binary;base64,%s",cruise:"data:model/gltf-binary;base64,%s",tug:"data:model/gltf-binary;base64,%s"};\n'%tuple(b64(n+'.glb') for n in ('plane','ship','sat','car','truck','bus','wide','prop','heli','tanker','cruise','tug'))
open('models.js','w').write(js);print(len(js))
