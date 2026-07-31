# Lumen motion system

Lumen uses motion to preserve spatial continuity and confirm actions. It does not animate for decoration. Native window geometry changes only when the product crosses a mode boundary (`collapsed`, `expanded`, `onboarding`, `settings`, or `gallery`); continuous interaction stays inside the already-sized window.

## Timing tokens

| Token | Duration | Use |
| --- | ---: | --- |
| Hover | 90 ms | Color, border, and quiet luminosity response |
| Press | 72 ms | Tactile control and result-open confirmation |
| Selection | 120 ms | Non-spring selection color changes |
| Launcher open | 160 ms | Internal opacity and slight upward settle |
| Launcher close | 120 ms | Internal exit opacity |
| Launcher expansion | 190 ms | Internal region reveal after the native resize request |
| Preview | 160 ms | Preview content replacement and details entry |
| Page | 210 ms | Onboarding and management-page movement |

The standard easing curve is `cubic-bezier(0.2, 0.8, 0.2, 1)`. Exits use `cubic-bezier(0.4, 0, 1, 1)`. Moving selection and scope geometry uses one shared spring:

```text
type: spring
stiffness: 520
damping: 44
mass: 0.72
```

## Spatial rules

- The search input remains anchored while the workspace appears beneath it.
- The active scope indicator uses the shared `lumen-scope-indicator` layout identity.
- The result capsule uses the shared `lumen-result-selection` layout identity and measures only the selected mounted row.
- Preview changes use short opacity and horizontal transforms; stale preview requests are aborted and cannot animate back into view.
- Opening a file briefly confirms the selected row before the window is hidden.
- Large lists use compositor transforms from TanStack Virtual. React state is never updated per animation frame.

## Reduced motion

Windows and application preferences resolve into one motion setting. Reduced motion makes layout movement immediate and retains at most an 80 ms opacity transition so state changes remain legible. Persistent loading shimmer is disabled. The same geometry, focus order, announcements, and action timing remain available.

## Performance constraints

Only `opacity` and `transform` are used for continuous visual movement. Blur and noise are static material properties, pointer movement is not bound to React renders, and no idle animation loop is allowed. Performance reports must name the tested hardware, display refresh rate, and measurement method; Lumen does not claim a fixed 240 FPS result without measurement.
