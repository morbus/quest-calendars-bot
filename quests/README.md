# Quests

Each Quest is a directory here, loaded when the bot starts (`docs/adr/0001-pages-are-declarative-typescript.md`).
The bot won't start while any Quest is invalid, and its error names the file at fault.

```
quests/
  clockwork-tower/
    quest.ts            export default quest({ ... })
    characters/
      tinker.ts         export default character({ ... })
      warden.ts
```

`quest()` and `character()` come from `src/builder.ts`, whose types list every field.
`npm run typecheck` checks each field's type. Startup checks the rest: ids, Rule Modules, the meter, dice, and whole numbers.
