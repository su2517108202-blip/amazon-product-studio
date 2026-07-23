import assert from "node:assert/strict";
import { sanitizeImagePlans } from "../src/lib/image-planning.js";
import { sanitizeProductIdentity } from "../src/lib/product-identity.js";

const englishPlans = Array.from({ length: 5 }, (_, index) => ({
  index: index + 1,
  taskType: ["hero", "structure", "function", "scenario", "detail"][index],
  coreSellingPoint: "Premium portable coffee mug with elegant lifestyle appeal",
  scene: "A bright kitchen counter with modern morning routine props",
  composition: "Large centered product with clean negative space and soft shadows",
  mainTitle: "Portable Mug",
  subTitle: "Clean daily coffee companion",
  keyNotes: ["Clear hero product", "Modern light background", "Readable ecommerce layout"],
  mustKeep: ["Keep product shape", "Keep metallic color", "Keep lid structure"],
  avoid: ["Do not change color", "Do not add accessories", "Do not create collage"],
  finalPrompt: "Create a premium ecommerce product image with a centered portable mug, soft light, and clean layout.",
}));

assert.throws(
  () => sanitizeImagePlans(englishPlans),
  /简体中文/,
  "whole-English image planning output must be rejected",
);

assert.doesNotThrow(() =>
  sanitizeImagePlans(
    englishPlans.map((plan, index) => ({
      ...plan,
      coreSellingPoint: "突出便携保温杯的简洁外观和日常使用价值",
      scene: index === 0 ? "干净的浅色电商背景" : "真实家庭或办公使用场景",
      composition: "商品居中放大，保留清晰留白，标题位于上方",
      mainTitle: `主图${index + 1}标题`,
      subTitle: "清晰展示核心卖点",
      keyNotes: ["商品主体清晰", "中文标题易读", "背景干净"],
      mustKeep: ["保持银色外观", "保持杯盖结构", "保持杯身比例"],
      avoid: ["不要改变颜色", "不要添加不存在配件", "不要做拼图"],
      finalPrompt: "生成一张简体中文电商主图，商品居中放大，保持银色杯身和杯盖结构，背景干净，不做拼图。",
    })),
  ),
);

assert.throws(
  () =>
    sanitizeProductIdentity({
      productName: "Portable coffee mug",
      category: "Drinkware",
      color: "Silver",
      material: "Metal appearance",
      structure: "Cylinder body with lid and smooth side wall",
      visibleFunctions: ["Portable drinking", "Lid opening", "Desktop use"],
      sellingPoints: ["Clean minimalist look", "Daily coffee use"],
      targetUsers: ["Office workers", "Students"],
      usageScenarios: ["Morning coffee", "Office desk"],
      mustKeep: ["Keep the lid", "Keep silver body"],
      avoidChanges: ["Do not change color", "Do not add accessories"],
      primaryReferenceDescription: "A silver portable coffee mug.",
    }),
  /简体中文/,
  "whole-English product identity output must be rejected",
);

assert.doesNotThrow(() =>
  sanitizeProductIdentity({
    productName: "便携咖啡杯",
    category: "饮水杯",
    color: "银色",
    material: "金属质感外观",
    structure: "圆柱形杯身，顶部有杯盖，侧面线条简洁",
    visibleFunctions: ["便携饮用", "杯盖开合", "桌面放置"],
    sellingPoints: ["外观简洁", "适合日常咖啡使用"],
    targetUsers: ["办公室人群", "学生"],
    usageScenarios: ["早晨咖啡", "办公桌使用"],
    mustKeep: ["保持杯盖", "保持银色杯身"],
    avoidChanges: ["不要改变颜色", "不要添加不存在配件"],
    primaryReferenceDescription: "一只银色便携咖啡杯。",
  }),
);

console.log(JSON.stringify({
  englishImagePlanningRejected: true,
  chineseImagePlanningAccepted: true,
  englishProductIdentityRejected: true,
  chineseProductIdentityAccepted: true,
}, null, 2));
