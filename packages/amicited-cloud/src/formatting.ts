export function formatPlanLabel(access: string | undefined, plan?: string) {
  return access === "full" ? (plan && plan !== "Plan not confirmed" ? plan : "Paid") : "Free";
}
export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
