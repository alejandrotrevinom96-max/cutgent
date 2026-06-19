# public/ — static assets served to the renderer

Drop your avatar here as **`avatar.vrm`**:

```
public/avatar.vrm
```

- Format: **VRM 1.0** (stylized, not photoreal — see ADR D4 for why). Convert your
  existing model with the free **VRM Add-on for Blender**: map the humanoid bones,
  define the 5 VRM visemes (`aa/ih/ou/ee/oh`) and `blink`, set first-person + spring
  bones, export `.vrm`.
- If `avatar.vrm` is **absent**, the stage renders a stylized placeholder head that
  still lip-syncs — so the app runs before your model is ready.

`avatar.vrm` is gitignored (it can be large and it's yours). Everything else here
is committed.
