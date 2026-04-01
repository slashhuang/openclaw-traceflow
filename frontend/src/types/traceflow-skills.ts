export type TraceflowBundledSkillFile = { path: string; content: string };

export type TraceflowBundledSkill = {
  id: string;
  files: TraceflowBundledSkillFile[];
};

export type TraceflowSkillsApiResponse =
  | { success: true; skills: TraceflowBundledSkill[] }
  | { success: false; error: string };
