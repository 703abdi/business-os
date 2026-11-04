import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contentApiAuthorized } from "@/lib/content-api";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) { if (!contentApiAuthorized(req.headers)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { id } = await params; const body = await req.json().catch(() => ({})); const post = await prisma.contentPost.update({ where: { id }, data: { status: "POSTED", postedAt: new Date(), postedUrl: typeof body.postedUrl === "string" ? body.postedUrl.slice(0, 2000) : "" } }); await prisma.contentPiece.update({ where: { id: post.pieceId }, data: { status: "POSTED" } }); return NextResponse.json({ ok: true, id: post.id }); }
