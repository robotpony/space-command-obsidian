# Shared Utilities

Warped Command's own copy of a small set of shared Obsidian-plugin utilities, carried over from before this repo was flattened to a single plugin (see `package.json`'s description). No longer synced with any sibling plugin — this copy drifts independently.

## Modules

### Notice (`ui/Notice.ts`)

Styled notice display with plugin branding.

```ts
import { createNoticeFactory } from "../shared";

// Create a factory for your plugin
const showNotice = createNoticeFactory("␣⌘", "warped-todo-logo");

// Use it throughout your plugin
showNotice("Task completed");
showNotice("Error occurred", 5000); // with timeout
```

## Development

The `package.json` here is vestigial (kept for the description field's history note above) — this is plain TypeScript source compiled as part of the main plugin build, not a separate installable package. `main.ts` and `utils.ts` import from it directly:

```ts
import { createNoticeFactory } from "./shared";
```
