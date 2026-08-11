// 图片上传端点(M3:识图)。
//
// POST /api/upload 接收 multipart/form-data,字段名 "file"。
// 把文件写入 public/uploads/<filename>,返回 { url }。
//
// 设计要点:
// - 仅允许图片类型(image/*)且单张 ≤ 5MB。
// - 文件名加随机前缀,避免冲突与路径穿越。
// - 路由运行时 Nodejs,因为需要写文件系统。
//
// 返回格式(供 useChat 的 experimental_attachments 直接消费):
//   { url: "/uploads/abc-123.jpg", contentType: "image/jpeg", name: "photo.jpg" }

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads");
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

// 允许的 mime → 后缀映射(MIME 头与扩展名未必一致,优先用浏览器给的 filename 扩展名)。
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function safeName(original: string): string {
  // 去掉路径分隔符、控制字符、过长;仅保留字母数字与少数符号。
  const base = original
    .replace(/[\\/]/g, "_")
    .replace(/[^\w.\-]/g, "_")
    .slice(0, 60);
  return base || "image";
}

function genFilename(original: string): string {
  const rand = randomBytes(8).toString("hex");
  const ext = extname(original).toLowerCase() || "";
  return `${rand}-${safeName(original)}${ext}`;
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `File too large; max ${MAX_SIZE / 1024 / 1024} MB` },
      { status: 413 },
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported type: ${file.type}` },
      { status: 415 },
    );
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = genFilename(file.name);
  const buf = Buffer.from(await file.arrayBuffer());
  const filepath = join(UPLOAD_DIR, filename);
  await writeFile(filepath, buf);

  return NextResponse.json({
    url: `/uploads/${filename}`,
    contentType: file.type,
    name: file.name,
    size: file.size,
  });
}