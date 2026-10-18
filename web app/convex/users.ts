import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v } from "convex/values";

type UserResponseSource = Pick<
  Doc<"users">,
  "_id" | "userId" | "email" | "name" | "profileImage"
>;

function buildUserResponse(user: UserResponseSource) {
  const resolvedId = user.userId || user._id;
  return {
    id: resolvedId,
    userId: resolvedId,
    email: user.email,
    name: user.name || "",
    profileImage: user.profileImage || "",
  };
}

function generateUserId(email: string) {
  const emailPrefix = email.split("@")[0] || "user";
  const sanitized = emailPrefix.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const randomDigits = Math.floor(1000 + Math.random() * 9000);
  return `${sanitized}_${randomDigits}`;
}

function resolveScanOwnerId(user: { userId?: string; _id: string }) {
  return user.userId || user._id;
}

function scheduleMarkUserScansDeleted(ctx: MutationCtx, scanOwnerId: string) {
  void ctx.scheduler.runAfter(0, internal.users.markUserScansDeleted, { userId: scanOwnerId });
}

export const createUser = mutation({
  args: {
    userId: v.optional(v.string()),
    email: v.string(),
    name: v.optional(v.string()),
    password: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.password && args.password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existing) {
      const now = Date.now();
      const expiredDeletion = !!existing.deletionScheduledAt && now >= existing.deletionScheduledAt;

      if (existing.isPermanentlyDeleted || expiredDeletion) {
        const scanOwnerId = resolveScanOwnerId(existing as any);
        scheduleMarkUserScansDeleted(ctx, scanOwnerId);

        const identity = await ctx.auth.getUserIdentity();
        const tokenIdentifier = identity?.tokenIdentifier || `legacy:${args.email.toLowerCase()}`;

        const patch: any = {
          tokenIdentifier,
          deletionScheduledAt: undefined,
          isPermanentlyDeleted: undefined,
        };

        if (args.name !== undefined) patch.name = args.name;
        if (args.password !== undefined) patch.password = args.password;

        await ctx.db.patch(existing._id, patch);

        return buildUserResponse({
          ...existing,
          ...patch,
        });
      }

      throw new Error("User already exists with this email.");
    }

    const identity = await ctx.auth.getUserIdentity();
    const tokenIdentifier = identity?.tokenIdentifier || `legacy:${args.email.toLowerCase()}`;
    const resolvedUserId = args.userId || generateUserId(args.email);

    const insertedId = await ctx.db.insert("users", {
      tokenIdentifier,
      userId: resolvedUserId,
      email: args.email,
      name: args.name,
      password: args.password,
    });

    return buildUserResponse({
      _id: insertedId,
      userId: resolvedUserId,
      email: args.email,
      name: args.name,
    });
  },
});

export const syncUser = mutation({
  args: {
    clerkId: v.optional(v.string()),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const tokenIdentifier = identity.tokenIdentifier;
    const existing = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();

    if (existing) {
      let patchUpdates: any = {};
      if (existing.deletionScheduledAt) {
        const now = Date.now();
        if (now >= existing.deletionScheduledAt) {
          const scanOwnerId = resolveScanOwnerId(existing as any);
          scheduleMarkUserScansDeleted(ctx, scanOwnerId);
          patchUpdates.deletionScheduledAt = undefined;
          patchUpdates.isPermanentlyDeleted = undefined;
        } else {
          patchUpdates.deletionScheduledAt = undefined;
        }
      }

      if (existing.isPermanentlyDeleted) {
        const scanOwnerId = resolveScanOwnerId(existing as any);
        scheduleMarkUserScansDeleted(ctx, scanOwnerId);
        patchUpdates.isPermanentlyDeleted = undefined;
      }

      const nextName = identity.name || args.name || existing.name;
      const nextEmail = identity.email || args.email || existing.email;

      if (nextName !== existing.name || nextEmail !== existing.email) {
        patchUpdates.name = nextName;
        patchUpdates.email = nextEmail;
      }

      if (Object.keys(patchUpdates).length > 0) {
        await ctx.db.patch(existing._id, patchUpdates);
      }

      return buildUserResponse({
        ...existing,
        name: nextName,
        email: nextEmail,
      });
    }

    const email = identity.email || args.email;
    if (!email) {
      throw new Error("Authenticated user email not found");
    }

    const emailMatch = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (emailMatch) {
      const now = Date.now();
      const expiredDeletion = !!emailMatch.deletionScheduledAt && now >= emailMatch.deletionScheduledAt;
      const scanOwnerId = resolveScanOwnerId(emailMatch as any);

      const patchUpdates: any = {};

      if (emailMatch.isPermanentlyDeleted || expiredDeletion) {
        scheduleMarkUserScansDeleted(ctx, scanOwnerId);
        patchUpdates.isPermanentlyDeleted = undefined;
        patchUpdates.deletionScheduledAt = undefined;
      } else if (emailMatch.deletionScheduledAt) {
        patchUpdates.deletionScheduledAt = undefined;
      }

      if (emailMatch.tokenIdentifier !== tokenIdentifier) {
        patchUpdates.tokenIdentifier = tokenIdentifier;
      }

      const nextName = identity.name || args.name || emailMatch.name;
      if (nextName !== emailMatch.name) patchUpdates.name = nextName;
      if (email !== emailMatch.email) patchUpdates.email = email;

      if (Object.keys(patchUpdates).length > 0) {
        await ctx.db.patch(emailMatch._id, patchUpdates);
      }

      return buildUserResponse({
        ...emailMatch,
        ...patchUpdates,
        name: patchUpdates.name ?? nextName,
        email,
      });
    }

    const name = identity.name || args.name || "Clerk User";
    const generatedUserId = generateUserId(email);
    const insertedId = await ctx.db.insert("users", {
      tokenIdentifier,
      userId: generatedUserId,
      email,
      name,
    });

    return buildUserResponse({
      _id: insertedId,
      userId: generatedUserId,
      email,
      name,
    });
  },
});

export const updateAccount = mutation({
  args: {
    currentUserId: v.optional(v.string()),
    currentEmail: v.optional(v.string()),
    newEmail: v.optional(v.string()),
    currentPassword: v.optional(v.string()),
    newPassword: v.optional(v.string()),
    profileImage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.currentUserId && !args.currentEmail) {
      throw new Error("Missing account reference.");
    }

    let user =
      args.currentUserId
        ? await ctx.db
            .query("users")
            .withIndex("by_userId", (q) => q.eq("userId", args.currentUserId))
            .first()
        : null;

    const currentEmail = args.currentEmail;
    if (!user && currentEmail) {
      user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", currentEmail))
        .first();
    }

    if (!user) {
      throw new Error("Account not found.");
    }

    const wantsEmailChange = !!args.newEmail && args.newEmail !== user.email;
    const wantsPasswordChange = !!args.newPassword;
    const wantsImageUpdate = args.profileImage !== undefined;

    if (!wantsEmailChange && !wantsPasswordChange && !wantsImageUpdate) {
      return buildUserResponse(user);
    }

    if (!user.password && (wantsEmailChange || wantsPasswordChange)) {
      throw new Error("Google/Clerk accounts should update email or password from the auth provider.");
    }

    if ((wantsEmailChange || wantsPasswordChange) && user.password !== args.currentPassword) {
      throw new Error("Current password is incorrect.");
    }

    if (args.newPassword && args.newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters.");
    }

    if (wantsEmailChange) {
      const emailInUse = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.newEmail!))
        .first();
      if (emailInUse && emailInUse._id !== user._id) {
        throw new Error("This email is already in use.");
      }
    }

    const patch: {
      email?: string;
      password?: string;
      profileImage?: string;
    } = {};

    if (wantsEmailChange) patch.email = args.newEmail;
    if (wantsPasswordChange) patch.password = args.newPassword;
    if (wantsImageUpdate) patch.profileImage = args.profileImage;

    await ctx.db.patch(user._id, patch);

    return buildUserResponse({
      ...user,
      ...patch,
    });
  },
});

export const loginUser = mutation({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!user) {
      throw new Error("Account not found. Please create your account first.");
    }

    if (user.password !== args.password) {
      throw new Error("Incorrect email or password.");
    }

    // Check if account was scheduled for deletion
    if (user.deletionScheduledAt) {
      const now = Date.now();
      if (now >= user.deletionScheduledAt) {
        const scanOwnerId = resolveScanOwnerId(user as any);
        scheduleMarkUserScansDeleted(ctx, scanOwnerId);
        await ctx.db.patch(user._id, {
          deletionScheduledAt: undefined,
          isPermanentlyDeleted: undefined,
        });
      } else {
        // Cancel deletion since user logged in within 30 days
        await ctx.db.patch(user._id, {
          deletionScheduledAt: undefined,
        });
      }
    }

    return buildUserResponse(user);
  },
});

export const scheduleAccountDeletion = mutation({
  args: { userId: v.optional(v.string()), email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!args.userId && !args.email) {
      throw new Error("Missing account reference.");
    }

    let user =
      args.userId
        ? await ctx.db
            .query("users")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId!))
            .first()
        : null;

    if (!user && args.email) {
      user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email!))
        .first();
    }

    if (!user && args.userId && args.userId.includes("@")) {
      user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.userId!))
        .first();
    }

    if (!user) {
      throw new Error("Account not found.");
    }

    const deletionTime = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days from now
    
    await ctx.db.patch(user._id, {
      deletionScheduledAt: deletionTime,
    });

    return { success: true, deletionScheduledAt: deletionTime };
  },
});

export const markUserScansDeleted = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const scans = await ctx.db
      .query("scans")
      .withIndex("by_user_and_isDeleted", (q) =>
        q.eq("userId", args.userId).eq("isDeleted", undefined)
      )
      .take(100);

    for (const scan of scans) {
      await ctx.db.patch(scan._id, { isDeleted: true });
    }

    if (scans.length === 100) {
      await ctx.scheduler.runAfter(0, internal.users.markUserScansDeleted, { userId: args.userId });
    }

    return { processed: scans.length };
  },
});
