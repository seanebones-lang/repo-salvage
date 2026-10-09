// Hidden from the first proposal; independent full-matrix Unicode oracle.
mod consumer;
use consumer::edit_distance;
fn reference(a: &str,b: &str)->usize {
 let a:Vec<char>=a.chars().collect(); let b:Vec<char>=b.chars().collect();
 let mut m=vec![vec![0;b.len()+1];a.len()+1];
 for i in 0..=a.len(){m[i][0]=i;} for j in 0..=b.len(){m[0][j]=j;}
 for i in 1..=a.len(){for j in 1..=b.len(){m[i][j]=(m[i-1][j]+1).min(m[i][j-1]+1).min(m[i-1][j-1]+usize::from(a[i-1]!=b[j-1]));}}
 m[a.len()][b.len()]
}
#[test] fn published_examples_and_empty(){
 for (a,b,d) in [("","",0),("","😀é",2),("kitten","sitting",3),("Saturday","Sunday",3),("ab","ba",2),("😀","😎",1),("e\u{301}","é",2),("\r\n","\n",1)]{assert_eq!(edit_distance(a,b),d);assert_eq!(edit_distance(b,a),d);}
}
#[test] fn exhaustive_small_unicode_against_full_matrix(){
 let mut values=vec![String::new()];let alphabet=['a','b','é','😀'];
 for length in 1..=3 {for n in 0..4usize.pow(length){let mut n=n;let mut s=String::new();for _ in 0..length{s.push(alphabet[n%4]);n/=4;}values.push(s);}}
 for a in &values {for b in &values{let d=edit_distance(a,b);assert_eq!(d,reference(a,b),"{a:?} {b:?}");assert!(d>=a.chars().count().abs_diff(b.chars().count()));assert!(d<=a.chars().count().max(b.chars().count()));}}
}
#[test] fn long_asymmetric_inputs(){assert_eq!(edit_distance(&"😀".repeat(4096),"😀"),4095);assert_eq!(edit_distance("x",&"x".repeat(4096)),4095);}
