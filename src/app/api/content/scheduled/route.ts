import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contentApiAuthorized } from "@/lib/content-api";

/** Outbound automation hook. Requires CONTENT_API_TOKEN as Bearer or x-content-api-token. */
export async function GET(req: NextRequest) {
  if (!contentApiAuthorized(req.headers)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date(); const until = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const posts = await prisma.contentPost.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: until } }, include: { account: true, piece: true }, orderBy: { scheduledAt: "asc" } });
  return NextResponse.json({ now: now.toISOString(), posts: posts.map((post) => ({ id: post.id, scheduledAt: post.scheduledAt, caption: post.caption || post.piece.caption, account: { platform: post.account.platform, handle: post.account.handle, profileUrl: post.account.profileUrl }, piece: { id: post.piece.id, title: post.piece.title, mediaLinks: post.piece.mediaLinks, hashtags: post.piece.hashtags } })) });
}
