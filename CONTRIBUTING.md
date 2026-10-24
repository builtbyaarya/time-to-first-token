# Contributing

Two things help most.

**A better number.** If a value in `data/pack.json` is stale or wrong, open an issue with the public source (URL, publisher, date). A change needs a source; nothing goes into the pack from memory. Edit `scripts/build_pack.py` (not `pack.json` by hand), bump `VERSION`, run `python3 scripts/build_pack.py && python3 scripts/build_sources.py`, and run the tests.

**A missing piece of the build.** The task list in `docs/methodology.md` is where to argue about what gates what. If your experience of a real build differs, say which task, which predecessor, and why.

Keep the page one accent colour, system fonts, no framework. No em dashes in prose. Keep the light where it is.
