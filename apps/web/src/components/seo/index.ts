export { JsonLd, type JsonLdProps } from './JsonLd';
// NOTE: buildOgImage is intentionally NOT re-exported here. It reads font bytes via
// node:fs at module load, so it must stay out of any client-reachable barrel (this
// index is pulled into client bundles). The server-only `opengraph-image.tsx`
// routes import it directly from `./og-image`.
export {
  organizationSchema,
  webSiteSchema,
  softwareApplicationSchema,
  faqPageSchema,
  breadcrumbSchema,
  profilePageSchema,
  articleSchema,
  blogSchema,
  itemListSchema,
  webPageSchema,
  type ProfileSchemaInput,
  type FaqSchemaEntry,
  type ArticleSchemaInput,
  type BlogPostRef,
} from './schemas';
