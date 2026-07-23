export function sanitizeReferenceImage(image) {
  return {
    id: image.id,
    projectId: image.projectId,
    url: image.url,
    storageKey: image.storageKey,
    fileName: image.fileName,
    mimeType: image.mimeType,
    sortOrder: image.sortOrder,
    isPrimary: image.isPrimary,
    includeInAnalysis: image.includeInAnalysis,
    imageRole: image.imageRole,
    createdAt: image.createdAt,
  };
}

export function sanitizeProject(project) {
  const imagePlans = project.imagePlans || [];
  const planCount = project._count?.imagePlans ?? imagePlans.length ?? 0;
  return {
    ...project,
    referenceImages: project.referenceImages?.map(sanitizeReferenceImage) || [],
    imagePlans: undefined,
    imagePlanSummary: {
      count: planCount,
      isComplete: planCount === 5,
      isStale: imagePlans.some((plan) => plan.isStale),
    },
  };
}
