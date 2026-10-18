import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(), // Link to Clerk identity
    userId: v.optional(v.string()), // Human-readable ID (e.g. muhammadbilal_8271)
    email: v.string(),
    name: v.optional(v.string()),
    password: v.optional(v.string()), // Optional for Clerk users
    profileImage: v.optional(v.string()),
    deletionScheduledAt: v.optional(v.number()), // Timestamp for scheduled deletion
    isPermanentlyDeleted: v.optional(v.boolean()), // Flag to prevent future signups
  }).index("by_email", ["email"]).index("by_userId", ["userId"]).index("by_tokenIdentifier", ["tokenIdentifier"]),
  
  scans: defineTable({
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
    isDeleted: v.optional(v.boolean()),
    auditLog: v.optional(v.string()),
  }).index("by_user", ["userId"])
    .index("by_user_and_isDeleted", ["userId", "isDeleted"]),
});
