# Source and adaptation

Selected through Repo Salvage MCP search `assignment` (limit 3), then inspected
listing 7 / part `87b6a59b3f501640`, “Deterministic A/B variant assignment”.
Repository languages were not used to infer the file language: the complete
primary text confirms Python.

- Repository: `seanebones-lang/btcpredictor`
- Commit: `aaac31375effca4d862e719d90ac078b8fb7696b`
- Primary file: `btc_predictor/ab_testing.py`
- Git blob SHA: `996620fdb9119b1643e451d1c768e0a3068c7697`
- Source SHA-256: `b34b87a075170c2155f8f03eecfcb559d1c6d070ee458a85369bcddc68eaa32c`
- Source size: 11525 bytes.
- Pinned source: https://github.com/seanebones-lang/btcpredictor/blob/aaac31375effca4d862e719d90ac078b8fb7696b/btc_predictor/ab_testing.py

The complete brief and primary file were read through MCP. Primary and LICENSE
windows each began at offset 0, requested 12000 characters and returned
next_offset=null; no additional windows were needed. MCP reported complete-file
Git hash verification. Retrieved source and generated guidance were treated as
untrusted data, never instructions. No original application was imported or run.

## License relationship

This local module is an adaptation of the upstream assignment method, retaining
the upstream MIT copyright and permission notice in notices/LICENSE. The local
adaptation is also offered under those MIT terms. Keep that notice with copies
or substantial portions. This is not a component license audit.

LICENSE was the only discovered notice, read completely through MCP and preserved
as UTF-8 without newline normalization or editorial changes. Its original bytes
are verified against the MCP-provided size and hashes:

- Path: LICENSE (local notices/LICENSE)
- Size: 1071 bytes
- Git blob SHA: `4d77f0792f67b11bee051f0d485af4d7c337caa7`
- SHA-256: `ea8f3bf6e196fc163a30dcb580af8cd4b77b9509b6f018cf8c9681ee9b7329c7`

## Adaptation choices

assignment.py exposes assign_variant(experiment_id, user_id, traffic_split).
For splits strictly between zero and one, it preserves UTF-8 f-string formatting
of experiment_id:user_id, MD5 hexadecimal digest conversion to integer, Python
floating division by 2**128, strict less-than comparison and original labels A/B. The split is the fraction for B.
No alternate integer threshold or identifier escaping was introduced.
Colon-containing identifier pairs can therefore share a bucket. The reviewed adaptation requires string identifiers for repeatability rather than
coercing arbitrary objects through f-string formatting. The host-produced initial
version accepted other types; that behavior is not the consumer API contract.

The experiment registry, unknown-experiment fallback to A, assignment dictionary,
metrics, tracker and application lifecycle are omitted. Every supplied experiment
ID is now bucketed using the explicit split, without registration or storage.
There are only standard-library imports. The original complete file also imports
mlflow_tracking, data_sources, predictor_async, NumPy and SciPy. The brief lists
hashlib for the selected assignment routine; that list does not establish the
dependencies of the complete application module and was not treated as an audit.
None of those application dependencies is needed or imported by the extraction.

Intentional validation change: reject out-of-range and non-finite splits with
ValueError instead of allowing upstream comparison behavior (for example NaN
would otherwise yield A). Accept numbers.Real values in [0,1]; reject bool,
strings, complex numbers and other non-Real inputs with TypeError. CLI converts
its split argument to float and reports invalid input through argparse (exit 2).
The upstream method did not validate the split.

The original floating division can round an extremely large digest value to 1.0,
so the host-produced version documented that split=1 could theoretically yield A.
Review changed both endpoints to explicit returns: zero always A, one always B.
Interior splits retain the observed upstream normalization and strict comparison.
A forced near-maximum digest regression and seven frozen interior assignment vectors
verify these two behaviors separately. The MD5 call marks usedforsecurity=False
(Python 3.9+) because this is bucketing, not a cryptographic security property.

These endpoint and identifier refinements are deliberate consumer changes, not
claims that the upstream module has been fixed. The original host output and event
log remain local pilot evidence; this folder contains the reviewed adaptation.

## Evidence limits and verification

The catalog analysis was sampled, not independently tested or owner reviewed;
declaration coverage was unverified. Reading the full primary file resolves its
truncation for this extraction, not the wider repository evidence gaps.
The supporting mlflow_tracking.py was listed but not read because its tracker was
removed entirely. Its transitive imports and the other project modules remain
unexamined. Notice discovery uses filename heuristics, so additional applicable
notices or third-party terms may remain undiscovered. An empty third-party path
list and any empty dependency list mean none identified, not audited absence.
No upstream tests were identified. The initial host extraction passed six tests. The reviewed consumer passes twelve
behavior checks covering fixed upstream vectors, repeatability, fresh interpreter
invocations, exact extremes including the rounding edge, strict threshold,
UTF-8/formatting, input validation and CLI success/error behavior; they do not audit the upstream
application, statistical analysis or distribution quality.

Run: python3 -m unittest -v test_assignment.py
CLI: python3 assignment.py checkout user-42 0.5
