declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ADMIN_SETUP_TOKEN?: string;
    ADMIN_AUTH_SECRET?: string;
    ADMIN_BOOTSTRAP_ACCOUNT?: string;
    INTEGRATION_ENCRYPTION_KEY?: string;
    CLOUDINARY_CLOUD_NAME?: string;
    CLOUDINARY_API_KEY?: string;
    CLOUDINARY_API_SECRET?: string;
  }
}
