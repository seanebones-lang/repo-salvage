package consumer
import ("testing";"encoding/json";"os";"strconv")
func TestIndependentVectors(t *testing.T) {b,e:=os.ReadFile("vectors.json");if e!=nil{t.Fatal(e)};var vectors []struct{Input string `json:"input"`;Expected string `json:"expected"`};if e=json.Unmarshal(b,&vectors);e!=nil{t.Fatal(e)};for _,v:=range vectors{x,e:=strconv.ParseUint(v.Input,10,64);if e!=nil{t.Fatal(e)};want,e:=strconv.ParseUint(v.Expected,10,64);if e!=nil{t.Fatal(e)};if got:=Recover(x);got!=want{t.Fatalf("input=%d got=%d want=%d",x,got,want)}}}
