"""Authored scalar XXH64 oracle using arbitrary precision integers and explicit masks.
Specification: https://github.com/Cyan4973/xxHash/blob/v0.8.3/doc/xxhash_spec.md
No captured target module is loaded or executed. Expected vectors are frozen before proposals.
"""
import json
from pathlib import Path
MASK=(1<<64)-1
P=[11400714785074694791,14029467366897019727,1609587929392839161,9650029242287828579,2870177450012600261]
def rotate(x,n):
    x &= MASK
    return ((x<<n)|(x>>(64-n)))&MASK
def round64(a,w):return (rotate(a+w*P[1],31)*P[0])&MASK
def xxh64(data,seed):
    n=len(data);offset=0
    if n>=32:
        lanes=[(seed+P[0]+P[1])&MASK,(seed+P[1])&MASK,seed,(seed-P[0])&MASK]
        while offset+32<=n:
            for lane in range(4):lanes[lane]=round64(lanes[lane],int.from_bytes(data[offset+lane*8:offset+lane*8+8],'little'))
            offset+=32
        h=sum(rotate(a,r) for a,r in zip(lanes,[1,7,12,18]))&MASK
        for a in lanes:h=((h^round64(0,a))*P[0]+P[3])&MASK
    else:h=(seed+P[4])&MASK
    h=(h+n)&MASK
    while offset+8<=n:
        h=(rotate(h^round64(0,int.from_bytes(data[offset:offset+8],'little')),27)*P[0]+P[3])&MASK;offset+=8
    if offset+4<=n:
        h=(rotate(h^(int.from_bytes(data[offset:offset+4],'little')*P[0]&MASK),23)*P[1]+P[2])&MASK;offset+=4
    for b in data[offset:]:h=rotate(h^(b*P[4]&MASK),11)*P[0]&MASK
    h^=h>>33;h=h*P[1]&MASK;h^=h>>29;h=h*P[2]&MASK;h^=h>>32
    return h
OFFICIAL=[(0,0,'ef46db3751d8e999'),(0,2654435761,'ac75fda2929b17ef'),(1,0,'e934a84adb052768'),(1,2654435761,'5014607643a9b4c3'),(4,0,'9136a0dca57457ee'),(14,0,'8282dcc4994e35c8'),(14,2654435761,'c3bd6bf63deb6df0'),(222,0,'b641ae8cb691c174'),(222,2654435761,'20cb8ab7ae10c14a')]
def official_input(n):
    s=2654435761;out=[]
    for _ in range(n):out.append(s>>56);s=s*11400714785074694797&MASK
    return bytes(out)
def vectors():
    v=[]
    for n,s,h in OFFICIAL:
        assert xxh64(official_input(n),s)==int(h,16), 'Oracle disagrees with official numeric vector'
        v.append(dict(length=n,pattern=-1,seed=str(s),hash=h))
    for pattern in range(3):
        for n in list(range(130))+[222,255,256,257,511,512,513,1024,4097]:
            data=bytes((i*131+n*17+pattern*i*i)&255 for i in range(n))
            for seed in [0,1,2654435761,1<<63,MASK]:v.append(dict(length=n,pattern=pattern,seed=str(seed),hash=f'{xxh64(data,seed):016x}'))
    return v
if __name__=='__main__':
    expected=json.dumps(vectors(),indent=2)+'\n';dest=Path(__file__).parent/'go/vectors.json'
    if dest.exists():assert dest.read_text()==expected,'Frozen vectors changed'
    else:dest.write_text(expected)
    print(f'{len(vectors())} frozen vectors; 9 official XXH64 numeric sanity vectors agree')
