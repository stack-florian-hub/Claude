import json,math
def dp(pts,tol):
    if len(pts)<3: return pts
    a,b=pts[0],pts[-1];dmax=0;idx=0
    ax,ay=a;bx,by=b;dx,dy=bx-ax,by-ay;L=math.hypot(dx,dy) or 1e-12
    for i in range(1,len(pts)-1):
        px,py=pts[i]
        d=abs(dy*px-dx*py+bx*ay-by*ax)/L if (dx or dy) else math.hypot(px-ax,py-ay)
        if d>dmax: dmax=d;idx=i
    if dmax>tol:
        return dp(pts[:idx+1],tol)[:-1]+dp(pts[idx:],tol)
    return [a,b]
BB=(-0.20,1.70,46.68,48.06)
coms=[];cent={}
for d in ['37','41','72','49','36','86']:
    for f in json.load(open(f'com_{d}.json'))['features']:
        g=f['geometry'];polys=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
        ring=max((p[0] for p in polys),key=len)
        xs=[p[0] for p in ring];ys=[p[1] for p in ring]
        cx=sum(xs)/len(xs);cy=sum(ys)/len(ys)
        if not(BB[0]<cx<BB[1] and BB[2]<cy<BB[3]): continue
        s=dp(ring,0.0025)
        if len(s)<4: s=ring[::max(1,len(ring)//6)]
        coms.append({'n':f['properties']['nom'],'c':f['properties']['code'],'p':f['properties'].get('population'),'r':[[round(x,3),round(y,3)] for x,y in s]})
        cent[f['properties']['code']]=[f['properties']['nom'],round(cx,4),round(cy,4)]
iso=json.load(open('iso.json'))
isos={}
for f in iso['features']:
    isos[str(int(f['properties']['contour']))]=[[round(x,4),round(y,4)] for x,y in dp(f['geometry']['coordinates'][0],0.002)]
out={'gare':{'nom':'Gare de Saint-Pierre-des-Corps','lat':47.38575,'lon':0.72330},
     'isochrones':isos,'isochrone_meta':{'moteur':'Valhalla (valhalla1.openstreetmap.de, données OSM)','depart':'samedi 2026-10-10 10:00','calcule_le':'2026-10-04'},
     'communes':coms}
json.dump(out,open('geo.json','w'),separators=(',',':'))
json.dump(cent,open('centroides.json','w'),separators=(',',':'),ensure_ascii=False)
print(len(coms),{k:len(v) for k,v in isos.items()})
