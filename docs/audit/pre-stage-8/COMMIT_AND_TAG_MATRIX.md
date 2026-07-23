# Commit And Tag Matrix

| Stage | Branch | Implementation Commit | Seal Tag | Seal Tag Target | Parent | Remote Independently Reviewable |
| --- | --- | --- | --- | --- | --- | --- |
| 1 upstream baseline | `codex/stage-1-original-run` | `bc6355fa60d2fbff9b73a39d2f4cad77bc554277` | `stage-1-original-run` | `bc6355fa60d2fbff9b73a39d2f4cad77bc554277` | `1722fdb5cb65dd070c9944378e040e1d8300edec` | Yes |
| 2 local projects | `codex/stage-2-local-projects` | `040b11c7a360bf6211471fd4c823ca1234e2fb26` | `stage-2-local-projects` | `040b11c7a360bf6211471fd4c823ca1234e2fb26` | `bc6355fa60d2fbff9b73a39d2f4cad77bc554277` | Yes |
| 3 BYOK provider center | `codex/stage-3-provider-center` | `7a942cd9772489980d53c5be4400ced57e183ed5` | `stage-3-provider-center` | `7a942cd9772489980d53c5be4400ced57e183ed5` | `040b11c7a360bf6211471fd4c823ca1234e2fb26` | Yes |
| 4 product analysis | `codex/stage-4-product-analysis` | `7b18db62eae1b73973dd71f24af06d567bd7628b` | `stage-4-product-analysis` | `7b18db62eae1b73973dd71f24af06d567bd7628b` | `7a942cd9772489980d53c5be4400ced57e183ed5` | Yes |
| 5 image planning | `codex/stage-5-image-planning` | `61549a53291b31fac66165596497cc212daf13eb` | `stage-5-image-planning` | `61549a53291b31fac66165596497cc212daf13eb` | `7b18db62eae1b73973dd71f24af06d567bd7628b` | Yes |
| 6 image generation | `codex/stage-6-image-generation` | `ef818d0fd063c94d3c1cf251ef4481dd05daaf9c` | `stage-6-image-generation` | `ef818d0fd063c94d3c1cf251ef4481dd05daaf9c` | `61549a53291b31fac66165596497cc212daf13eb` | Yes |
| 6.1 hardening | `codex/stage-6-1-hardening` | `04bc277be6442578fd5d4c31e73349faecdb2c82` | `stage-6-1-hardening` | Remote: `3b1b119ff89dca74a68433fe85b9981745e5baa8` | `ef818d0fd063c94d3c1cf251ef4481dd05daaf9c` | Yes, with local/remote tag mismatch noted |
| 6.2 auth CI fix | `codex/stage-6-2-auth-ci-fix` | `c69a302bb6bd581e49c6f4e838fb81711e53943d` | `stage-6-2-auth-ci-fix` | `46026762c4364dc7af5fbd81637d9bce6c64e640` | `3b1b119ff89dca74a68433fe85b9981745e5baa8` | Yes |
| 7 result management | `codex/stage-7-result-management` | `0ff10b893309bffa6e3c3688838fb7bdf43f33d1` | `stage-7-result-management` | `87bcb319668c55bc8599c10a895e3c789afdc5cd` | `46026762c4364dc7af5fbd81637d9bce6c64e640` | Yes |
| 7.1 CN upload fix | `codex/stage-7-1-cn-upload-fix` | `1f5a79b2c3e06a0b624de0f61c4b62f8b0320678` | `stage-7-1-cn-upload-fix` | `1f5a79b2c3e06a0b624de0f61c4b62f8b0320678` | `87bcb319668c55bc8599c10a895e3c789afdc5cd` | Yes |

Stage 7.1 is the baseline for this audit by user instruction.
