# Source and adaptation record

- Repository: `seanebones-lang/personal-RAG`
- Commit: `7d979a2cecdc3e588a7d3e8b65cd2ef7664fec66`
- Primary file: `src/ingest/chunking/strategies.py`
- Pinned source: [strategies.py](https://github.com/seanebones-lang/personal-RAG/blob/7d979a2cecdc3e588a7d3e8b65cd2ef7664fec66/src/ingest/chunking/strategies.py)
- Git blob: `2a27480beea0df02b1da0045eacb900e765b04d9`
- Complete source SHA-256: `1b70342c320d2bb048f27be7e20036fe8ccdb5cf32333dbe9729c9e5f1f96d02`
- Adaptation SHA-256: `bbc07842e3bd2bfdc2da24f9dad083caf86d6983bdd192109d8f52b7e4ca89ae`
- Retained notice SHA-256: `ea8f3bf6e196fc163a30dcb580af8cd4b77b9509b6f018cf8c9681ee9b7329c7`

The fresh native host discovered the source, inspected the part, and read the
complete primary file and LICENSE through MCP. The source reader verified complete
Git blob bytes before returning text. The original MIT notice is preserved in
`notices/LICENSE`; its copyright and permission terms also appear in the adaptation.
This does not establish a component or dependency license audit.

The model proposed standalone Python code using the paragraph/recursive splitting
idea, removing application settings, models, numpy and local imports. It retained
original characters and separators, reset overflow buffers, validated the maximum
and added a terminal slice fallback. It used no filesystem editing or execution
tools. The operator reviewed the pure `re`/`typing` code before copying it into
this example and executing the separately sealed consumer tests.

The consumer code is unchanged from the archived model answer. The upstream source
and its catalog brief were not modified or re-analyzed. Recorded selection/source
evidence, proposed code and test execution remain separate in the
[adaptation results](../discovery-evaluation/adaptation-results.json). The reviewing
operator and implementing agent are the same; this is not independent certification.
