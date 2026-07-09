// BLW-07: route-chunk prefetching for React.lazy pages.
//
// App.jsx registers each high-traffic route's dynamic import against its path
// prefix. preloadRoute(path) kicks off the chunk download ahead of navigation
// (e.g. on sidebar hover), and preloadOnIdle() warms the most likely next
// pages once the browser is idle after first paint.

const registry = new Map()

export function registerRoutePreload(pathPrefix, importFn) {
  registry.set(pathPrefix, importFn)
}

export function preloadRoute(path) {
  if (!path) return
  for (const [prefix, importFn] of registry) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      registry.delete(prefix) // fire once; the module cache holds the chunk
      importFn().catch(() => {
        // Preload is best-effort — a failed fetch here must not surface;
        // navigation will retry the import through React.lazy.
      })
      return
    }
  }
}

export function preloadOnIdle(paths) {
  const run = () => paths.forEach(preloadRoute)
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 3000 })
  } else {
    setTimeout(run, 1500)
  }
}
