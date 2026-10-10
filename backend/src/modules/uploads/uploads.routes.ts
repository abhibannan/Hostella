import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { storage, db } from "../../config/firebase.js";

const router = Router();

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/jpg",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype.toLowerCase())) {
      callback(
        new Error(
          "Only JPG, PNG, WebP, and HEIC images are allowed",
        ),
      );
      return;
    }

    callback(null, true);
  },
});

const uploadMiddleware = (req: any, res: any, next: any) => {
  if (req.is("application/json")) {
    return next();
  }
  upload.single("file")(req, res, next);
};

/* ---------------------------------------------------------
   UPLOAD FILE (Multipart or JSON Base64)
--------------------------------------------------------- */
router.post(
  "/",
  requireAuth,
  uploadMiddleware,
  async (req, res, next) => {
    try {
      if (!req.authUser) {
        res.status(401).json({
          message: "Hostella user profile required",
        });
        return;
      }

      let buffer: Buffer;
      let originalname: string;
      let mimetype: string;
      let size: number;

      if (req.file) {
        buffer = req.file.buffer;
        originalname = req.file.originalname || `upload-${Date.now()}.jpg`;
        mimetype = req.file.mimetype || "image/jpeg";
        size = req.file.size;
      } else if (req.body && (req.body.base64 || req.body.fileBase64)) {
        let rawBase64 = String(req.body.base64 || req.body.fileBase64);
        if (rawBase64.includes(",")) {
          rawBase64 = rawBase64.split(",")[1] ?? rawBase64;
        }
        buffer = Buffer.from(rawBase64, "base64");
        originalname = String(req.body.originalName || req.body.name || `proof-${Date.now()}.jpg`);
        mimetype = String(req.body.contentType || req.body.type || "image/jpeg");
        size = buffer.length;
      } else {
        res.status(400).json({
          message: "No file uploaded (multipart 'file' or JSON 'base64' required)",
        });
        return;
      }

      if (size > MAX_FILE_SIZE) {
        res.status(400).json({
          message: "File exceeds 15 MB limit",
        });
        return;
      }

      const fileId = randomUUID();
      const extension = path.extname(originalname).toLowerCase() || ".jpg";
      const localFilename = `${fileId}${extension}`;
      const localFilePath = path.join(UPLOADS_DIR, localFilename);

      // 1. Always save locally to disk so file is never lost even if GCP bucket is unavailable
      try {
        fs.writeFileSync(localFilePath, buffer);
      } catch (fsErr) {
        console.error("Local disk save error:", fsErr);
      }

      // 2. Attempt Firebase Storage upload gracefully
      const storagePath = `uploads/${req.authUser.id}/${fileId}${extension}`;
      try {
        const file = storage.file(storagePath);
        await file.save(buffer, {
          metadata: {
            contentType: mimetype,
            metadata: {
              uploadedBy: req.authUser.id,
              originalName: originalname,
            },
          },
        });
      } catch (fbErr: any) {
        console.warn(
          `[Firebase Storage Warning] Bucket upload skipped/failed (${fbErr?.message || fbErr}). Stored locally on disk at ${localFilename}.`
        );
      }

      // 3. Store record in Firestore
      const uploadRecord = {
        id: fileId,
        userId: req.authUser.id,
        storagePath,
        localFilename,
        originalName: originalname,
        contentType: mimetype,
        size,
        createdAt: FieldValue.serverTimestamp(),
      };

      await db
        .collection("uploads")
        .doc(fileId)
        .set(uploadRecord);

      res.status(201).json({
        message: "File uploaded successfully",
        file: {
          id: fileId,
          storagePath,
          localFilename,
          originalName: originalname,
          contentType: mimetype,
          size,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/* ---------------------------------------------------------
   GET FILE STREAM (For proof and image viewing)
--------------------------------------------------------- */
router.get("/:id/file", async (req, res, next) => {
  try {
    const fileId = req.params.id;
    const doc = await db.collection("uploads").doc(fileId).get();
    if (!doc.exists) {
      res.status(404).json({ message: "File not found" });
      return;
    }
    const data = doc.data();
    const contentType = data?.contentType || "image/jpeg";
    res.setHeader("Content-Type", contentType);

    // 1. Check local disk
    const localFile = data?.localFilename
      ? path.join(UPLOADS_DIR, data.localFilename)
      : path.join(UPLOADS_DIR, `${fileId}${path.extname(data?.originalName || "") || ".jpg"}`);
    if (fs.existsSync(localFile)) {
      res.sendFile(path.resolve(localFile));
      return;
    }

    // 2. Check Firebase Storage
    if (data?.storagePath) {
      try {
        const file = storage.file(data.storagePath);
        const [exists] = await file.exists();
        if (exists) {
          file.createReadStream().pipe(res);
          return;
        }
      } catch {
        // Continue to 404
      }
    }

    res.status(404).json({ message: "File content not found on server" });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------
   GET FILE METADATA
--------------------------------------------------------- */
router.get("/:id", async (req, res, next) => {
  try {
    const fileId = req.params.id;
    const doc = await db.collection("uploads").doc(fileId).get();
    if (!doc.exists) {
      res.status(404).json({ message: "Upload record not found" });
      return;
    }
    res.json({ file: doc.data() });
  } catch (err) {
    next(err);
  }
});

export default router;
