import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/worker/app";
import type { AppBindings } from "../../src/worker/lib/types";
import { permissiveRateLimit, randomIp } from "./support/api";

type StoredObject = {
  body: ArrayBuffer;
  contentType?: string;
  cacheControl?: string;
};

const createMockBucket = () => {
  const objects = new Map<string, StoredObject>();

  return {
    async put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }) {
      objects.set(key, {
        body: value,
        contentType: options?.httpMetadata?.contentType,
        cacheControl: options?.httpMetadata?.cacheControl,
      });
    },
    async get(key: string) {
      const object = objects.get(key);
      if (!object) {
        return null;
      }

      return {
        body: object.body,
        httpEtag: `etag-${key}`,
        writeHttpMetadata(headers: Headers) {
          if (object.contentType) {
            headers.set("content-type", object.contentType);
          }
          if (object.cacheControl) {
            headers.set("cache-control", object.cacheControl);
          }
        },
      };
    },
    async delete(key: string) {
      objects.delete(key);
    },
  } as unknown as R2Bucket;
};

describe("app", () => {
  const app = createApp();
  const testEnv: AppBindings = {
    DB: env.DB,
    RATE_LIMIT: permissiveRateLimit,
    PROFILE_IMAGES: createMockBucket(),
    AUTH_SECRET: "4d9ae7e8767de815a6754b18b6fc8c6127ec4ceb3d8f4d64a577f1e3cf6b4ef2",
    APP_URL: "http://localhost:8787",
    APP_NAME: "Snarvei",
  };

  const request = (input: string | Request, init?: RequestInit) => app.request(input, init, testEnv);

  const signUp = async () => {
    const suffix = crypto.randomUUID();
    const response = await request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": randomIp() },
      body: JSON.stringify({
        name: `User ${suffix}`,
        email: `user-${suffix}@example.com`,
        password: "Password123!",
      }),
    });
    expect(response.status).toBeLessThan(400);
    const match = response.headers.get("set-cookie")?.match(/better-auth\.session_token=[^;]+/);
    if (!match) {
      throw new Error("Missing Better Auth session cookie");
    }
    const cookie = match[0];
    const me = (await (await request("http://localhost/api/me", { headers: { cookie } })).json()) as {
      user: { id: string };
    };
    return { cookie, userId: me.user.id };
  };

  const pngFile = () => new File([new Uint8Array([137, 80, 78, 71])], "avatar.png", { type: "image/png" });

  const uploadProfileImage = async (cookie: string) => {
    const formData = new FormData();
    formData.append("file", pngFile());
    const ctx = createExecutionContext();
    const response = await app.request(
      new Request("http://localhost/api/me/profile-image", { method: "POST", body: formData, headers: { cookie } }),
      undefined,
      testEnv,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
  };

  const currentImage = async (cookie: string) => {
    const me = (await (await request("http://localhost/api/me", { headers: { cookie } })).json()) as {
      user: { image: string | null };
    };
    return me.user.image;
  };

  it("uploads a profile image for an authenticated user and serves it", async () => {
    const { cookie, userId } = await signUp();

    const uploadResponse = await uploadProfileImage(cookie);
    expect(uploadResponse.status).toBe(200);
    const { imageUrl } = (await uploadResponse.json()) as { imageUrl: string };
    expect(imageUrl).toContain(`/images/profile/${userId}/`);

    expect(await currentImage(cookie)).toBe(imageUrl);

    const imageResponse = await request(imageUrl);
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get("content-type")).toBe("image/png");
  });

  it("replaces the previous profile image object on re-upload", async () => {
    const { cookie } = await signUp();
    const first = (await (await uploadProfileImage(cookie)).json()) as { imageUrl: string };
    const second = (await (await uploadProfileImage(cookie)).json()) as { imageUrl: string };
    expect(second.imageUrl).not.toBe(first.imageUrl);

    expect((await request(first.imageUrl)).status).toBe(404);
    expect((await request(second.imageUrl)).status).toBe(200);
  });

  it("removes the profile image for an authenticated user", async () => {
    const { cookie } = await signUp();
    const { imageUrl } = (await (await uploadProfileImage(cookie)).json()) as { imageUrl: string };

    const ctx = createExecutionContext();
    const deleteResponse = await app.request(
      new Request("http://localhost/api/me/profile-image", { method: "DELETE", headers: { cookie } }),
      undefined,
      testEnv,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(deleteResponse.status).toBe(200);
    expect(await currentImage(cookie)).toBeNull();
    expect((await request(imageUrl)).status).toBe(404);
  });

  it("never deletes another user's image, even if the image URL is forged", async () => {
    const victimKey = `images/profile/victim-${crypto.randomUUID()}/${crypto.randomUUID()}`;
    await testEnv.PROFILE_IMAGES.put(victimKey, new Uint8Array([137, 80, 78, 71]).buffer, {
      httpMetadata: { contentType: "image/png" },
    });

    const { cookie } = await signUp();
    // Better Auth lets a user set an arbitrary image URL on their own profile.
    const forge = await request("http://localhost/api/auth/update-user", {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: "http://localhost", "cf-connecting-ip": randomIp() },
      body: JSON.stringify({ image: `http://localhost/${victimKey}` }),
    });
    expect(forge.status, await forge.text()).toBe(200);

    const ctx = createExecutionContext();
    await app.request(
      new Request("http://localhost/api/me/profile-image", { method: "DELETE", headers: { cookie } }),
      undefined,
      testEnv,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect((await request(`http://localhost/${victimKey}`)).status).toBe(200);
  });

  it("rejects profile image upload without a session", async () => {
    const formData = new FormData();
    formData.append("file", new File([new Uint8Array([137, 80, 78, 71])], "avatar.png", { type: "image/png" }));

    const uploadResponse = await request(
      new Request("http://localhost/api/me/profile-image", {
        method: "POST",
        body: formData,
      }),
    );

    expect(uploadResponse.status).toBe(401);
  });

  it("serves a stored private profile image from the worker route", async () => {
    const key = `images/profile/test-user/${crypto.randomUUID()}`;
    await testEnv.PROFILE_IMAGES.put(key, new Uint8Array([137, 80, 78, 71]).buffer, {
      httpMetadata: {
        contentType: "image/png",
      },
    });

    const imageResponse = await request(`http://localhost/${key}`);
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get("content-type")).toBe("image/png");
  });

  it("serves a health endpoint", async () => {
    const response = await request("http://localhost/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, service: "snarvei", checks: { database: "ok" } });
  });

  it("serves scalar docs page", async () => {
    const response = await request("http://localhost/scalar");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Snarvei API Reference");
    expect(html).toContain("/openapi.json");
  });

  it("returns 404 for an unknown slug", async () => {
    const response = await request("http://localhost/l/does-not-exist");
    expect(response.status).toBe(404);
  });
});
