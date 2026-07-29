import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { authedQuery, createRouter, publicQuery } from "./middleware";
import type { User } from "../db/schema";

const securityTestRouter = createRouter({
  health: publicQuery.query(() => ({ ok: true })),
  workspace: authedQuery.query(() => ({ secret: "protected" })),
});

function createCaller(role?: User["role"]) {
  return securityTestRouter.createCaller({
    req: new Request("https://maya.test/api/trpc"),
    resHeaders: new Headers(),
    user: role ? {
      id: 1,
      unionId: "test-user",
      googleId: null,
      name: "Test User",
      email: "test@example.invalid",
      avatar: null,
      role,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      lastSignInAt: new Date(0),
    } : undefined,
  });
}

describe("authorization boundary", () => {
  it("allows explicitly public health procedures", async () => {
    await expect(createCaller().health()).resolves.toEqual({ ok: true });
  });

  it("rejects anonymous access before protected resolver execution", async () => {
    await expect(createCaller().workspace()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects authenticated non-owner users", async () => {
    await expect(createCaller("user").workspace()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("allows the admin owner", async () => {
    await expect(createCaller("admin").workspace()).resolves.toEqual({ secret: "protected" });
  });

  it("keeps every business router authenticated by default", () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const routersDir = path.join(currentDir, "routers");
    const routerFiles = readdirSync(routersDir).filter((name) => name.endsWith("-router.ts"));

    expect(routerFiles.length).toBeGreaterThan(0);
    for (const file of routerFiles) {
      const source = readFileSync(path.join(routersDir, file), "utf8");
      expect(source, `${file} must not expose public tRPC procedures`).not.toContain("publicQuery");
    }
  });
});
