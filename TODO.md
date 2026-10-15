# TODO

Follow-ups queued from the 0.54.2 documentation review.

- [ ] Remove the dead custom-dropdown state in `SidebarView.ts` (`openDropdown`, `openDropdownTrigger`, `closeDropdown()`); nothing assigns it since menus moved to Obsidian's `Menu` #todo #cleanup
- [ ] Rename existing commands to sentence case ("Toggle TODO Sidebar" → "Toggle TODO sidebar", etc.) per plugin-conventions.md; command ids stay unchanged so hotkeys survive #todo #cleanup
- [ ] Decide whether to keep inferring a tag from the filename (`inferredFileTag` in `TodoScanner.ts`); it conflicts with the explicit-tags-over-convention rule. Remove it, or document it as a deliberate exception #todo #decision
- [ ] Split DESIGN.md into current design and a decision log; the Projects sections bury current behaviour under how it was arrived at #todo #docs
- [ ] Archive CHANGELOG.md entries older than ~0.30 into a separate file (it's 4,000+ lines) #todo #docs #p4
