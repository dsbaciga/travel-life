# Frontend — Environment Variables

`.env` file in `frontend/`:

```bash
VITE_API_URL=http://localhost:5000/api
VITE_UPLOAD_URL=http://localhost:5000/uploads
```

Optional (build-time; Vite inlines them, so a rebuild is needed after changing):

- `VITE_CARTO_API_KEY` - CARTO basemaps API key appended to the light/dark map tile URLs
  (`lib/tileUtils.ts`); omitted from the URLs when unset
- `VITE_DEBUG` - Set to `true` to enable `utils/debugLogger` output in production builds
  (always on in `vite dev`)
