interface MenuItem {
  label: string;
  children?: readonly MenuItem[];
}
const labels: Record<string, string> = {
  "Find in thread": "Find in chat",
  "Pin thread": "Pin chat",
  "Unpin thread": "Unpin chat",
  "Un-settle thread": "Un-settle chat",
  "Settle thread": "Settle chat",
  "Wake thread": "Wake chat",
  "Rename thread": "Rename chat",
  "Archive thread": "Archive chat",
  "Delete thread": "Delete chat",
  "No project": "No domain",
  Thread: "Chat",
  "Thread ID": "Chat ID",
  "Project settings": "Domain settings",
  "Turn into project": "Turn into domain",
};
export function marketerLabel(label: string): string {
  return labels[label] ?? label.replace(/^New thread on /, "New chat on ");
}
export function marketerMenuItems<T extends MenuItem>(items: readonly T[], marketer = true): T[] {
  if (!marketer) return [...items];
  return items.map((item) => ({
    ...item,
    label: marketerLabel(item.label),
    ...(item.children ? { children: marketerMenuItems(item.children) } : {}),
  }));
}
