package rendezvous
import("testing";"fmt";"hash/fnv")
func hash(s string) uint64 {h:=fnv.New64a(); h.Write([]byte(s));return h.Sum64()}
func score(h uint64)uint64 {h^=h<<13;h^=h>>7;h^=h<<17;return h*2685821657736338717}
func oracle(nodes []string,key string)string {best:="";var max uint64;for i,n:=range nodes{s:=score(hash(key)^hash(n));if i==0||s>max{max=s;best=n}};return best}
func TestValidationAndHashCalls(t *testing.T){
 calls:=0;h:=func(s string)uint64{calls++;return 0}
 if _,e:=New(nil,nil);e==nil{t.Fatal("nil hasher")};for _,nodes:=range [][]string{{""},{"a","a"},{"a",""}}{if _,e:=New(nodes,h);e==nil{t.Fatal("bad nodes accepted")}};if calls!=0{t.Fatal("invalid construction hashed")}
 r,e:=New(nil,h);if e!=nil{t.Fatal(e)};if n,ok:=r.Lookup("empty");ok||n!=""||calls!=0{t.Fatal("empty lookup")}
 if e=r.Add("a");e!=nil{t.Fatal(e)};if calls!=1{t.Fatal(calls)};if r.Add("a")==nil||r.Add("")==nil||calls!=1{t.Fatal("invalid Add mutated/hashed")};if r.Remove("missing"){t.Fatal("absent removal")};if n,ok:=r.Lookup("key");!ok||n!="a"||calls!=2{t.Fatal("zero hash node")};if !r.Remove("a")||r.Remove("a"){t.Fatal("last removal")};if _,ok:=r.Lookup("empty");ok||calls!=2{t.Fatal("removed last")}
}
func TestTieOrderAndSwapRepair(t *testing.T){
 r,e:=New([]string{"a","b","c"},func(string)uint64{return 0});if e!=nil{t.Fatal(e)};if n,_:=r.Lookup("k");n!="a"{t.Fatal(n)};if !r.Remove("a"){t.Fatal("remove")};if n,_:=r.Lookup("k");n!="c"{t.Fatal(n)};if !r.Remove("c"){t.Fatal("moved index")};if n,_:=r.Lookup("k");n!="b"{t.Fatal(n)};if r.Add("a")!=nil||r.Add("c")!=nil{t.Fatal("readd")};if !r.Remove("a")||!r.Remove("c")||!r.Remove("b"){t.Fatal("indices")}
}
func TestDeterministicMutationOracle(t *testing.T){
 nodes:=[]string{"alpha","β","😀","delta"};r,e:=New(nodes,hash);if e!=nil{t.Fatal(e)}
 state:=uint32(12345);random:=func()uint32{state=state*1664525+1013904223;return state}
 for step:=0;step<1000;step++{
  n:=fmt.Sprintf("node-%d",random()%19);idx:=-1;for i,s:=range nodes{if s==n{idx=i;break}}
  if random()%2==0 {err:=r.Add(n);if idx<0{if err!=nil{t.Fatal(err)};nodes=append(nodes,n)}else if err==nil{t.Fatal("duplicate")}}else{removed:=r.Remove(n);if removed!=(idx>=0){t.Fatal("remove result")};if idx>=0{nodes[idx]=nodes[len(nodes)-1];nodes=nodes[:len(nodes)-1]}}
  for j:=0;j<5;j++{k:=fmt.Sprintf("key-%d-☃",random());got,ok:=r.Lookup(k);if ok!=(len(nodes)>0)||got!=oracle(nodes,k){t.Fatalf("step %d got %q expected %q",step,got,oracle(nodes,k))}}
 }
}
