import json,sys
d=json.load(open('/home/user/Claude/radar-domaine/data/iso.json'))
polys={int(f['properties']['contour']):f['geometry']['coordinates'][0] for f in d['features']}
def inside(lon,lat,poly):
    c=False;n=len(poly);j=n-1
    for i in range(n):
        xi,yi=poly[i];xj,yj=poly[j]
        if (yi>lat)!=(yj>lat) and lon<(xj-xi)*(lat-yi)/(yj-yi+1e-15)+xi: c=not c
        j=i
    return c
if __name__=='__main__':
    for k,p in polys.items():
        xs=[a for a,b in p];ys=[b for a,b in p];print(k,min(xs),max(xs),min(ys),max(ys))
    towns={'Amboise':(0.982,47.413),'Chinon':(0.242,47.167),'Loches':(0.995,47.128),'Blois':(1.335,47.586),'Saumur':(-0.077,47.26),'Chenonceaux':(1.070,47.33),'Montrichard':(1.186,47.343),'Vendome':(1.066,47.793),'Azay':(0.465,47.26),'Bourgueil':(0.168,47.283),'ChateauRenault':(0.912,47.594),'SteMaure':(0.613,47.111),'Richelieu':(0.324,47.015),'Ligueil':(0.815,47.043),'Montbazon':(0.713,47.284),'Langeais':(0.405,47.325),'Chateau-du-Loir':(0.418,47.695)}
    for t,(x,y) in towns.items(): print(t,inside(x,y,polys[45]),inside(x,y,polys[55]))
