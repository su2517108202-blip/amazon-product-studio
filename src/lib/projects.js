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
  return {
    ...project,
    referenceImages: project.referenceImages?.map(sanitizeReferenceImage) || [],
  };
}
