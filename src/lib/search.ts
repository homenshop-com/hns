import { MeiliSearch } from "meilisearch";

// Lazy init to avoid build-time crashes
let client: MeiliSearch | null = null;
function getClient(): MeiliSearch {
  if (!client) {
    client = new MeiliSearch({
      host: process.env.MEILISEARCH_HOST || "http://127.0.0.1:7700",
      apiKey: process.env.MEILISEARCH_API_KEY || "",
    });
  }
  return client;
}

// Index names
const PRODUCTS_INDEX = "products";
const POSTS_INDEX = "posts";

// Product document type
interface ProductDocument {
  id: string;
  name: string;
  description: string;
  price: number;
  salePrice: number | null;
  category: string;
  status: string;
  siteId: string;
  siteName: string;
  createdAt: string;
}

// Post document type
interface PostDocument {
  id: string;
  title: string;
  content: string;
  author: string;
  boardId: string;
  boardTitle: string;
  siteId: string;
  siteName: string;
  views: number;
  createdAt: string;
}

// Setup indexes with searchable/filterable attributes
export async function setupIndexes() {
  const client = getClient();

  // Products index
  const productsIndex = client.index(PRODUCTS_INDEX);
  await productsIndex.updateSettings({
    searchableAttributes: ["name", "description", "category"],
    filterableAttributes: ["siteId", "status", "category"],
    sortableAttributes: ["price", "createdAt"],
    displayedAttributes: [
      "id",
      "name",
      "description",
      "price",
      "salePrice",
      "category",
      "status",
      "siteId",
      "siteName",
      "createdAt",
    ],
  });

  // Posts index
  const postsIndex = client.index(POSTS_INDEX);
  await postsIndex.updateSettings({
    searchableAttributes: ["title", "content", "author"],
    filterableAttributes: ["siteId", "boardId"],
    sortableAttributes: ["views", "createdAt"],
    displayedAttributes: [
      "id",
      "title",
      "content",
      "author",
      "boardId",
      "boardTitle",
      "siteId",
      "siteName",
      "views",
      "createdAt",
    ],
  });
}

// Index a single product
export async function indexProduct(product: ProductDocument) {
  const client = getClient();
  await client.index(PRODUCTS_INDEX).addDocuments([product]);
}

// Index a single post
export async function indexPost(post: PostDocument) {
  const client = getClient();
  await client.index(POSTS_INDEX).addDocuments([post]);
}

// Remove a product from index
export async function removeProduct(id: string) {
  const client = getClient();
  await client.index(PRODUCTS_INDEX).deleteDocument(id);
}

// Remove a post from index
export async function removePost(id: string) {
  const client = getClient();
  await client.index(POSTS_INDEX).deleteDocument(id);
}

// Search products
export async function searchProducts(
  query: string,
  options?: {
    siteId?: string;
    category?: string;
    limit?: number;
    offset?: number;
  }
) {
  const client = getClient();
  const filters: string[] = [];
  if (options?.siteId) filters.push(`siteId = "${options.siteId}"`);
  if (options?.category) filters.push(`category = "${options.category}"`);

  return client.index(PRODUCTS_INDEX).search(query, {
    filter: filters.length > 0 ? filters.join(" AND ") : undefined,
    limit: options?.limit || 20,
    offset: options?.offset || 0,
    attributesToHighlight: ["name", "description"],
  });
}

// Search posts
export async function searchPosts(
  query: string,
  options?: {
    siteId?: string;
    boardId?: string;
    limit?: number;
    offset?: number;
  }
) {
  const client = getClient();
  const filters: string[] = [];
  if (options?.siteId) filters.push(`siteId = "${options.siteId}"`);
  if (options?.boardId) filters.push(`boardId = "${options.boardId}"`);

  return client.index(POSTS_INDEX).search(query, {
    filter: filters.length > 0 ? filters.join(" AND ") : undefined,
    limit: options?.limit || 20,
    offset: options?.offset || 0,
    attributesToHighlight: ["title", "content"],
  });
}

// Bulk index all products from database
export async function reindexAllProducts(products: ProductDocument[]) {
  const client = getClient();
  if (products.length === 0) return;
  await client.index(PRODUCTS_INDEX).addDocuments(products);
}

// Bulk index all posts from database
export async function reindexAllPosts(posts: PostDocument[]) {
  const client = getClient();
  if (posts.length === 0) return;
  await client.index(POSTS_INDEX).addDocuments(posts);
}

export type { ProductDocument, PostDocument };
