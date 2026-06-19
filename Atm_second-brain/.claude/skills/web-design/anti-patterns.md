# Anti-patterns — web design

- **Bootstrap-default look.** Symptom: uniform padding, generic blue, no
  hierarchy. *Fix:* build a spacing/type scale and one intentional accent.
- **Everything-is-important.** Symptom: five competing CTAs, bold everywhere.
  *Fix:* one primary action; demote the rest.
- **Border soup.** Symptom: boxes inside boxes to separate content. *Fix:*
  separate with space and weight instead.
- **Tiny line-height / full-width text.** Symptom: text lines >90ch, cramped
  leading. *Fix:* 45–75ch measure, ~1.5 line-height.
- **Decorative motion.** Symptom: animations that delay interaction. *Fix:*
  motion only to explain; keep it 150–300ms and skippable.
- **Desktop-only thinking.** Symptom: a desktop layout that merely shrinks. *Fix:*
  design mobile and desktop as distinct compositions.
- **Contrast failures.** Symptom: light-gray text on white. *Fix:* meet AA; test.
- **Ignoring states.** Symptom: no focus ring, no empty/error/loading states.
  *Fix:* design every state, keyboard included.
