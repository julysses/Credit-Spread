# Lessons

- Drizzle timestamp columns should be compared/inserted with `Date` values, not ISO strings, unless the schema column itself is textual.
- This repo's TypeScript target does not support direct iteration over `Set`/`Map` iterators; use `Array.from(...)` before spreading or looping.
- Axios helpers should type the response body as `axios.get<T>(...)` and return `response.data`; avoid wrapping the generic as `{ data: T }` unless the API body really has a nested `data` field.
- The Growth dossier UI must tolerate both flat database records and layered intelligence dossier records; otherwise cards render `--` even though the API is returning data.
- gstack `/browse` is documented as required globally, but this machine currently lacks the browse binary; direct HTTP checks are the fallback until gstack browse is installed.
- For stock-card accuracy, verify the deployed `/api/growth/screener` payload directly; stale NVDA/CRWD prices can come from production `_mock` responses even when local UI formatting looks correct.
