export class Modal {} export const Platform = { isDesktopApp: true };
export const normalizePath = (p) => p; export class TFile {} export class TFolder {}
export async function requestUrl({ url }) { const r = await fetch(url, { redirect: "follow" }); return { status: r.status, arrayBuffer: await r.arrayBuffer() }; }
