export function sanitizeArticleHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/<(iframe|object|embed|form|input|button|textarea|select)[\s\S]*?>/gi, "")
    .replace(/<\/(iframe|object|embed|form|input|button|textarea|select)>/gi, "");
}
