declare namespace Cloudflare {
  interface Env {
    BUCKET?: R2Bucket;
    ADMIN_AUTH_SECRET?: string;
    ADMIN_BOOTSTRAP_ACCOUNT?: string;
    INTEGRATION_ENCRYPTION_KEY?: string;
    CLOUDINARY_CLOUD_NAME?: string;
    CLOUDINARY_API_KEY?: string;
    CLOUDINARY_API_SECRET?: string;
    DREAMCARS_REQUIRE_DURABLE_STORAGE?: string;
    S3_ENDPOINT?: string;
    S3_REGION?: string;
    S3_BUCKET?: string;
    S3_ACCESS_KEY_ID?: string;
    S3_SECRET_ACCESS_KEY?: string;
  }
}
