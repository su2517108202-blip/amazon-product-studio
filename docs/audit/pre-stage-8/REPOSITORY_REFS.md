# Repository Refs

## Repository

- Repository: `su2517108202-blip/amazon-product-studio`
- Origin: `https://github.com/su2517108202-blip/amazon-product-studio.git`
- Upstream: `https://github.com/SamurAIGPT/amazon-product-studio.git`
- Audit branch: `codex/pre-stage-8-full-audit`
- Audit baseline tag: `stage-7-1-cn-upload-fix`
- Audit baseline commit: `1f5a79b2c3e06a0b624de0f61c4b62f8b0320678`

Remote URLs were reviewed and contained no token in the visible URL.

## Local Git Health

- `git status --short --branch`: clean at audit branch creation.
- `git fsck --full`: passed with no output.
- `git log --graph --decorate --oneline --all`: stage history is linear from stage 1 through stage 7.1, with a documented stage 6.1 metadata correction path.

## Remote Branches Verified Or Pushed

The following missing stage branches were pushed during the audit so the remote repository can be independently inspected:

- `codex/stage-1-original-run`
- `codex/stage-2-local-projects`
- `codex/stage-3-provider-center`
- `codex/stage-4-product-analysis`
- `codex/stage-5-image-planning`

The following stage branches were already present remotely:

- `codex/stage-6-image-generation`
- `codex/stage-6-1-hardening`
- `codex/stage-6-2-auth-ci-fix`
- `codex/stage-7-result-management`
- `codex/stage-7-1-cn-upload-fix`

## Tags

Remote tags verified:

- `stage-1-original-run`
- `stage-2-local-projects`
- `stage-3-provider-center`
- `stage-4-product-analysis`
- `stage-5-image-planning`
- `stage-6-image-generation`
- `stage-6-1-hardening`
- `stage-6-2-auth-ci-fix`
- `stage-7-result-management`
- `stage-7-1-cn-upload-fix`

Important note: local `stage-6-1-hardening` tag still points to `04bc277be6442578fd5d4c31e73349faecdb2c82`, while the remote tag points to `3b1b119ff89dca74a68433fe85b9981745e5baa8`. The audit did not move or rewrite any old tag.
