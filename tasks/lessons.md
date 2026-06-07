# Lessons

- Drizzle timestamp columns should be compared/inserted with `Date` values, not ISO strings, unless the schema column itself is textual.
- This repo's TypeScript target does not support direct iteration over `Set`/`Map` iterators; use `Array.from(...)` before spreading or looping.
- Axios helpers should type the response body as `axios.get<T>(...)` and return `response.data`; avoid wrapping the generic as `{ data: T }` unless the API body really has a nested `data` field.
