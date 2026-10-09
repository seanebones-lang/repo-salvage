package consumer
import ("testing"; "encoding/json"; "os"; "strconv"; "bytes")
type vector struct { Length int `json:"length"`; Pattern int `json:"pattern"`; Seed string `json:"seed"`; Hash string `json:"hash"` }
func input(v vector) []byte {
    b:=make([]byte,v.Length)
    if v.Pattern == -1 {s:=uint64(2654435761); for i:=range b {b[i]=byte(s>>56);s*=11400714785074694797}} else {
        for i:=range b {b[i]=byte(i*131+v.Length*17+v.Pattern*i*i)}
    };return b
}
func vectors(t *testing.T) []vector {t.Helper(); b,e:=os.ReadFile("vectors.json");if e!=nil{t.Fatal(e)};var v []vector;if e=json.Unmarshal(b,&v);e!=nil{t.Fatal(e)};return v}
func parameters(t *testing.T,v vector)(uint64,uint64){t.Helper();s,e:=strconv.ParseUint(v.Seed,10,64);if e!=nil{t.Fatal(e)};h,e:=strconv.ParseUint(v.Hash,16,64);if e!=nil{t.Fatal(e)};return s,h}
func TestIndependentVectors(t *testing.T) {for _,v:=range vectors(t){s,h:=parameters(t,v);b:=input(v);original:=append([]byte(nil),b...);if got:=Sum64(b,s);got!=h{t.Fatalf("one shot len=%d seed=%d got=%x want=%x",len(b),s,got,h)};if !bytes.Equal(b,original){t.Fatal("input mutated")};d:=New(s);n,e:=d.Write(b);if n!=len(b)||e!=nil{t.Fatal("Write contract")};if d.Sum64()!=h||d.Sum64()!=h{t.Fatal("digest or repeated sum")}}}
func TestChunkBoundariesAndOwnership(t *testing.T) {
 for _,v:=range vectors(t){s,h:=parameters(t,v);b:=input(v)
  for _,width:=range []int{1,3,7,8,15,16,31,32,33,63,64,127}{d:=New(s);if n,e:=d.Write(nil);n!=0||e!=nil{t.Fatal("empty write")}
   for start:=0;start<len(b);start+=width {end:=start+width;if end>len(b){end=len(b)};owned:=append([]byte(nil),b[start:end]...);n,e:=d.Write(owned);if n!=len(owned)||e!=nil{t.Fatal("Write contract")};for i:=range owned{owned[i]^=255};_ = d.Sum64()}
   if got:=d.Sum64();got!=h{t.Fatalf("len=%d seed=%d width=%d got=%x want=%x",len(b),s,width,got,h)}
  }
 }
}
func TestResetAndContinue(t *testing.T){for _,v:=range vectors(t){s,h:=parameters(t,v);b:=input(v);d:=New(s^0xffff);_,_=d.Write([]byte("previous stream"));d.Reset(s);cut:=len(b)/2;_,_=d.Write(b[:cut]);_ = d.Sum64();_ = d.Sum64();_,_=d.Write(b[cut:]);if got:=d.Sum64();got!=h{t.Fatalf("reset/continue len=%d seed=%d",len(b),s)};d.Reset(s);if d.Sum64()!=Sum64(nil,s){t.Fatal("reset empty")}}}
