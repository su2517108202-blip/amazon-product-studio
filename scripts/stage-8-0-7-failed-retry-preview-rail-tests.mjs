import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = {
  project: path.join(root, "src/app/projects/[projectId]/ProjectStudioClient.js"),
  generation: path.join(root, "src/lib/image-generation.js"),
  generationRoute: path.join(root, "src/app/api/projects/[projectId]/image-plans/[planId]/generations/route.js"),
  summaryRoute: path.join(root, "src/app/api/projects/[projectId]/generation-summary/route.js"),
  packageJson: path.join(root, "package.json"),
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]),
);

let assertionCount = 0;
function check(name, patterns) {
  for (const pattern of patterns) {
    assert.match(source[pattern.file], pattern.match, name);
    assertionCount += 1;
  }
}

check("failed slot can be retried individually", [
  { file: "project", match: /async function retrySingleGenerationPlan\(plan\)/ },
  { file: "project", match: /targetPlans: \[plan\]/ },
  { file: "project", match: /data-testid="retry-plan-button"/ },
  { file: "project", match: /重新生成此图/ },
]);

check("retry failed only excludes successful slots", [
  { file: "project", match: /async function retryFailedGenerationPlans\(\)/ },
  { file: "project", match: /latestRun\?\.status === "failed" && Number\(item\.candidateCount \|\| 0\) === 0/ },
  { file: "project", match: /data-testid="retry-failed-only-button"/ },
  { file: "project", match: /data-testid="regenerate-full-set-button"/ },
  { file: "project", match: /成功图片不会重新生成/ },
]);

check("duplicate browser submissions are blocked", [
  { file: "project", match: /generationRequestKeysRef = useRef\(new Set\(\)\)/ },
  { file: "project", match: /function buildClientGenerationKey\(/ },
  { file: "project", match: /generationRequestKeysRef\.current\.has\(requestKey\)/ },
  { file: "project", match: /clientRequestId: createClientRequestId\(\)/ },
]);

check("billing state distinguishes network unknown from known failures and success", [
  { file: "generation", match: /billingStatus: "unknown"/ },
  { file: "generation", match: /NETWORK_ERROR/ },
  { file: "generation", match: /terminated/ },
  { file: "generation", match: /billingStatus: "not_billed"/ },
  { file: "generation", match: /billingStatus: "billed_or_usage_recorded"/ },
  { file: "project", match: /计费状态：\{formatBillingStatus\(status\)\}/ },
  { file: "project", match: /请求可能已到达服务商，重新生成可能再次产生费用/ },
]);

check("generation APIs return diagnostic billing fields without migrations", [
  { file: "generationRoute", match: /requestStartedAt/ },
  { file: "generationRoute", match: /requestSentToProvider/ },
  { file: "generationRoute", match: /upstreamHttpStatus/ },
  { file: "summaryRoute", match: /imageGenerationRunToResponse/ },
  { file: "summaryRoute", match: /errorMessage: true/ },
]);

check("right preview rail replaces large middle result preview", [
  { file: "project", match: /function GenerationPreviewRail\(/ },
  { file: "project", match: /data-testid="generation-preview-rail"/ },
  { file: "project", match: /sticky top-4/ },
  { file: "project", match: /生成结果 \{successCount\}\/5/ },
  { file: "project", match: /data-testid="generation-preview-thumbnail"/ },
  { file: "project", match: /data-testid="download-preview-image-button"/ },
]);

check("thumbnail lightbox supports preview navigation and download", [
  { file: "project", match: /function PreviewLightbox\(/ },
  { file: "project", match: /data-testid="lightbox-modal"/ },
  { file: "project", match: /data-testid="lightbox-prev"/ },
  { file: "project", match: /data-testid="lightbox-next"/ },
  { file: "project", match: /onDownloadCandidate\(current\.candidate\)/ },
]);

check("history remains folded below the generation controls", [
  { file: "project", match: /data-testid="generation-history-details"/ },
  { file: "project", match: /查看历史候选/ },
  { file: "project", match: /function GenerationResultsByPlan\(/ },
]);

assert(!fs.existsSync(path.join(root, "prisma/migrations/stage-8-0-7")), "Stage 8.0.7 must not add a migration");
assert(source.packageJson.includes('"test:stage-8-0-7"'));
assertionCount += 2;

console.log(`stage-8-0-7 failed retry and preview rail checks passed (${assertionCount} assertions)`);
