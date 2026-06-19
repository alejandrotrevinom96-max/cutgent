# Anti-patterns — image & video

Detectable failure modes. If you spot one, name it and apply the fix.

- **Re-rolling instead of editing.** Symptom: regenerating from scratch to fix a
  small flaw, losing the good parts. *Fix:* use the targeted op (upscale,
  outpaint, reframe, remove_background, motion_control).
- **Prompt soup.** Symptom: 40 adjectives, contradictory styles, "8k ultra
  hyper". *Fix:* one subject, one style anchor, one light intent; let the model
  breathe.
- **Aspect-ratio afterthought.** Symptom: generating 1:1 then cropping to 9:16
  and losing the subject. *Fix:* set the destination aspect at generation time.
- **Resolution theater.** Symptom: claiming "4K" on an upscaled blurry source.
  *Fix:* upscale from the cleanest available source; verify real detail.
- **Uncanny anatomy shipped.** Symptom: extra fingers, melted text, drifting
  identity across video frames. *Fix:* inpaint/regenerate the region or use
  identity-preserving controls; never ship it hoping no one notices.
- **Flicker and feet-slide in video.** Symptom: per-frame instability. *Fix:*
  motion control / interpolation; reduce per-frame randomness.
- **Hook buried.** Symptom: 3-second logo intro before anything happens. *Fix:*
  lead with stakes/payoff; cut the intro.
- **No provenance.** Symptom: a great asset you can't reproduce. *Fix:* record
  prompt, model, and seed in the note's `sources[]` at save time.
- **Likeness/IP misuse.** Symptom: generating a real person or trademarked work
  without basis. *Fix:* stop and confirm rights/consent.
