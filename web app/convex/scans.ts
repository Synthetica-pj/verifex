import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const generateUploadUrl = mutation(async (ctx) => {
  return await ctx.storage.generateUploadUrl();
});

export const createScan = mutation({
  args: {
    userId: v.string(),
    scanId: v.string(),
    image: v.optional(v.union(v.string(), v.null())),
    originalImage: v.optional(v.union(v.string(), v.null())),
    imageStorageId: v.optional(v.id("_storage")),
    originalImageStorageId: v.optional(v.id("_storage")),
    heatmapStorageId: v.optional(v.id("_storage")),
    prediction: v.string(),
    confidence: v.number(),
    details: v.any(),
    timestamp: v.string(),
    auditLog: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("scans", args);
  },
});

export const getHistory = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const scans = await ctx.db
      .query("scans")
      .withIndex("by_user_and_isDeleted", (q) => 
        q.eq("userId", args.userId).eq("isDeleted", undefined)
      )
      .order("desc")
      .take(10);
    
    return await Promise.all(
      scans.map(async (scan) => {
        const imageUrl = scan.imageStorageId 
          ? await ctx.storage.getUrl(scan.imageStorageId) 
          : scan.image;
        const originalImageUrl = scan.originalImageStorageId 
          ? await ctx.storage.getUrl(scan.originalImageStorageId) 
          : scan.originalImage;
        const heatmapUrl = scan.heatmapStorageId 
          ? await ctx.storage.getUrl(scan.heatmapStorageId) 
          : (scan.details?.heatmap ? `data:image/jpeg;base64,${scan.details.heatmap}` : null);
          
        return {
          ...scan,
          image: imageUrl,
          originalImage: originalImageUrl,
          heatmap: heatmapUrl,
        };
      })
    );
  },
});

export const deleteHistory = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const scans = await ctx.db
      .query("scans")
      .withIndex("by_user_and_isDeleted", (q) => 
        q.eq("userId", args.userId).eq("isDeleted", undefined)
      )
      .collect();
    
    let deletedCount = 0;
    for (const scan of scans) {
      await ctx.db.patch(scan._id, { isDeleted: true });
      deletedCount++;
    }
    
    return { success: true, deleted: deletedCount };
  },
});

export const deleteScans = mutation({
  args: {
    userId: v.string(),
    scanIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const scanIdSet = new Set(args.scanIds);
    const scans = await ctx.db
      .query("scans")
      .withIndex("by_user_and_isDeleted", (q) => 
        q.eq("userId", args.userId).eq("isDeleted", undefined)
      )
      .collect();
    
    let deletedCount = 0;
    for (const scan of scans) {
      if (scanIdSet.has(scan.scanId)) {
        await ctx.db.patch(scan._id, { isDeleted: true });
        deletedCount++;
      }
    }
    
    return { success: true, deleted: deletedCount };
  },
});

export const cleanupOldFields = mutation({
  args: {},
  handler: async (ctx) => {
    const scans = await ctx.db.query("scans").collect();
    let updatedCount = 0;
    for (const scan of scans) {
      await ctx.db.patch(scan._id, {
        // @ts-ignore
        forensic_summary: undefined,
        // @ts-ignore
        raw_scan_data: undefined,
        // @ts-ignore
        provider_payload: undefined,
        // @ts-ignore
        isHidden: undefined,
      });
      updatedCount++;
    }
    return { success: true, updated: updatedCount };
  },
});

export const backfillAuditLog = mutation({
  args: {},
  handler: async (ctx) => {
    const scans = await ctx.db.query("scans").collect();
    let updatedCount = 0;
    for (const scan of scans) {
      // @ts-ignore
      const details = scan.details;
      if (details) {
        const auditLogLines = details.details?.audit_log || "";
        const forensicProfiles = details.forensic_profiles || {};
        const extraDetails = {
          face_detected: details.details?.face_detected,
          frequency_suspicious: details.details?.frequency_suspicious,
          num_faces: details.details?.num_faces,
        };
        const variances = details.visual_data?.variances || {};

        const fullLog = [
          "=== SYSTEM AUDIT LOG ===",
          auditLogLines,
          "",
          `forensic_profiles: ${JSON.stringify({ ...forensicProfiles, ...extraDetails }, null, 2)}`,
          "",
          `variances: ${JSON.stringify(variances, null, 2)}`,
        ].join("\n");

        await ctx.db.patch(scan._id, {
          auditLog: fullLog,
        });
        updatedCount++;
      }
    }
    return { success: true, updated: updatedCount };
  },
});


