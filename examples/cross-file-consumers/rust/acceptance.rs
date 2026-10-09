#[path = "consumer.rs"] mod consumer;
const D: u128 = 10_000_000_000_000_000;
fn check(n: u128) {
    let (q,r) = consumer::split_decimal_1e16(n);
    assert_eq!((q,r), (n/D, (n%D) as u64), "n={n}");
    assert!((r as u128) < D);
    assert_eq!(q.checked_mul(D).unwrap().checked_add(r as u128).unwrap(), n);
}
#[test] fn boundaries() {
    for n in [0,1,9,D-1,D,D+1,u64::MAX as u128,(u64::MAX as u128)+1,u128::MAX-1,u128::MAX] {check(n);}
    for bit in 0..128 {let n=1u128<<bit; check(n);check(n-1);check(n.saturating_add(1));}
    let maxq=u128::MAX/D;
    for q in [0,1,2,9999,1<<32,1<<64,maxq-1,maxq] {
        for r in [0,1,9, D/2, D-2,D-1] {if let Some(n)=q.checked_mul(D).and_then(|v|v.checked_add(r)){check(n);}}
    }
}
#[test] fn exhaustive_small() {for n in 0..65_536 {check(n);}}
#[test] fn deterministic_full_width() {
    let mut n = 0x9e3779b97f4a7c15d1b54a32d192ed03u128;
    for _ in 0..65_536 {n^=n<<23;n^=n>>17;n^=n<<26;check(n);check(u128::MAX-n);}
}
