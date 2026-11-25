const names = [
  "nextjs-icon",
  "nextjs",
  "fastapi-icon",
  "postgresql",
  "python",
  "microsoft",
  "microsoft-icon",
  "microsoft-azure",
  "azure",
  "typescript-icon",
  "drizzle-orm-icon",
  "drizzle",
  "neon-icon",
  "neon",
  "vitest",
  "html-5",
  "css-3",
  "javascript",
  "github-icon",
  "cloudflare-workers",
  "sqlite",
  "react",
  "tailwindcss-icon",
  "qwen-icon",
  "hugging-face",
  "openai",
  "pydantic-icon",
  "cloudinary-icon",
  "swr",
  "aws-dynamodb",
  "aws-s3",
  "aws-athena",
  "aws-eventbridge",
  "aws-lambda",
  "aws-api-gateway",
  "aws-elastic-beanstalk",
  "aws-cloudformation",
];
for (const n of names) {
  try {
    const m = await import(`@iconify-icons/logos/${n}`);
    const d = m.default;
    console.log(n, d.width ?? "(default)", d.height ?? "(default)");
  } catch {
    console.log(n, "missing");
  }
}
