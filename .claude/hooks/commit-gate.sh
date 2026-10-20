#!/bin/sh
# PreToolUse hook (Bash): refuses the git commands that break commit
# discipline in a checkout shared by several Claude sessions. Agents commit
# and push on their own when a task is done (CLAUDE.md, Commit conventions);
# this gate keeps that safe rather than prompting on every commit:
#
#   - broad staging: `git add -A`, `--all`, `.` (sweeps in other sessions'
#     uncommitted edits); stage explicit paths instead
#   - `git commit -a`/`--all` (same problem, at commit time)
#   - force-push (`--force`, `-f`, `--force-with-lease`); settings.json
#     denies these too
#
# Blocks rather than asks: the command is refused with a reason, so Claude
# corrects it and runs it again.
#
# Reads the PreToolUse hook JSON on stdin: { tool_input: { command }, ... }

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')

# `git <sub>` also as `git -C dir <sub>` or after global flags, at the start
# of the command or after a separator, not a mere mention in text.
GIT='(^|[;&|( ]|\$\()git( +-[Cc] +[^ ]+| +--?[a-zA-Z-]+(=[^ ]+)?)* +'

deny() {
    jq -n --arg r "$1" '{
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: $r
        }
    }'
    exit 0
}

if printf '%s' "$CMD" | grep -qE "${GIT}add( +[^;&|]*)? +(-A|--all|\.)( |$|[;&|)])"; then
    deny "Refused: broad staging (git add -A/--all/.) can sweep in another session's uncommitted edits. Stage the files this task touched by explicit path (CLAUDE.md, Commit conventions)."
fi

if printf '%s' "$CMD" | grep -qE "${GIT}commit( +[^;&|]*)? +(-[a-zA-Z]*a[a-zA-Z]*|--all)( |$|[;&|)])"; then
    deny "Refused: git commit -a/--all commits every modified file, including other sessions' edits. Stage explicit paths with git add, then commit (CLAUDE.md, Commit conventions)."
fi

if printf '%s' "$CMD" | grep -qE "${GIT}push( +[^;&|]*)? +(-f|--force|--force-with-lease)([ =]|$|[;&|)])"; then
    deny "Refused: force-push is never allowed in this repo (CLAUDE.md, Commit conventions)."
fi

if printf '%s' "$CMD" | grep -qE "${GIT}push"; then
    if printf '%s' "$CMD" | grep -qE "${GIT}push( +[^;&|]*)? +([^ ;&|]*:)?main( |$|[;&|)])" \
        || [ "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" = "main" ]; then
        deny "Refused: agents don't push main. Work and push on the space-command branch; main moves only when Bruce merges it (CLAUDE.md, Commit conventions)."
    fi
fi

exit 0
