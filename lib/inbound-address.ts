export const RESEND_INBOUND_DOMAIN = "rinurexaun.resend.app";

export function workspaceInboundAddress(slug: string) {
  return `${slug}@${RESEND_INBOUND_DOMAIN}`;
}
