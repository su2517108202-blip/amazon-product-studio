import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectStudioPath = path.join(root, "src", "app", "projects", "[projectId]", "ProjectStudioClient.js");
const source = await fs.readFile(projectStudioPath, "utf8");

const checks = [
  [
    "left step navigation is a sticky side rail",
    /function StageProgress\(\{ steps, activeStepIndex, summaries, onSelectStep \}\)/,
    /min-\[1100px\]:grid-cols-\[250px_minmax\(0,1fr\)\]/,
    /min-\[1440px\]:grid-cols-\[280px_minmax\(0,1fr\)\]/,
    /min-\[1100px\]:sticky min-\[1100px\]:top-5/,
    /data-testid=\{`workflow-step-\$\{step\.index\}-toggle`\}/,
  ],
  [
    "right workspace only opens the selected step",
    /function StepPanel\(\{ step, active, summary, children \}\)/,
    /data-open=\{active \? "true" : "false"\}/,
    /\$\{active \? "" : "hidden"\}/,
  ],
  [
    "generation modes include one two three and full set",
    /const \[generationMode, setGenerationMode\] = useState\(1\)/,
    /data-testid=\{`generation-mode-\$\{mode\}`\}/,
    /\[1, "当前 1 张"\]/,
    /\[2, "当前 2 张"\]/,
    /\[3, "当前 3 张"\]/,
    /\[5, "整套 5 张"\]/,
  ],
  [
    "batch generation iterates real plan ids through the existing generation endpoint",
    /function getGenerationTargetPlans\(\{ plans, selectedPlan, activePlanIndex, generationMode \}\)/,
    /for \(const plan of targetPlans\)/,
    /\/api\/projects\/\$\{projectId\}\/image-plans\/\$\{plan\.id\}\/generations/,
    /referenceImageIds/,
    /resolution: generationResolution/,
  ],
  [
    "batch state records per-plan progress",
    /const \[batchGeneration, setBatchGeneration\] = useState\(null\)/,
    /function BatchGenerationStatus\(\{ batch \}\)/,
    /formatBatchStatus\(item\.status\)/,
    /成功 \{batch\.successCount \|\| 0\} · 失败 \{batch\.failureCount \|\| 0\}/,
  ],
  [
    "generation results are grouped by plan slot",
    /const \[candidateMap, setCandidateMap\] = useState\(\{\}\)/,
    /function GenerationResultsByPlan\(/,
    /data-testid="generation-result-plan-group"/,
    /planLabel\(plan\.planIndex, plan\.taskType\)/,
    /view-candidate-button/,
  ],
];

let assertionCount = 0;
for (const [name, ...patterns] of checks) {
  for (const pattern of patterns) {
    assert.match(source, pattern, name);
    assertionCount += 1;
  }
}

const forbiddenFiles = [
  "scripts/windows/Start-Lingtu-Amazon-Studio.ps1",
  "src/app/page.js",
];

for (const forbiddenFile of forbiddenFiles) {
  const relative = forbiddenFile.replaceAll("/", "\\\\");
  assert(
    !source.includes(relative),
    `stage 8.0.6 project studio work should not reference forbidden file ${forbiddenFile}`,
  );
  assertionCount += 1;
}

console.log(`stage-8-0-6 layout and batch generation checks passed (${assertionCount} assertions)`);
