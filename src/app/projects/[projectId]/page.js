import ProjectStudioClient from "./ProjectStudioClient";

export default async function ProjectPage({ params }) {
  const { projectId } = await params;
  return <ProjectStudioClient projectId={projectId} />;
}
