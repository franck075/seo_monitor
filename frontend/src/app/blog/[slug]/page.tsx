import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart2 } from "lucide-react";
import type { Metadata } from "next";

interface BlogPost {
  id: number;
  slug: string;
  title: string;
  excerpt?: string;
  content: string;
  cover_image?: string;
  meta_title?: string;
  meta_description?: string;
  canonical_url?: string;
  structured_data?: Record<string, unknown>;
  tags?: string[];
  author?: string;
  published_at?: string;
}

async function getPost(slug: string): Promise<BlogPost | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const res = await fetch(`${baseUrl}/api/v1/blog/${slug}`, { next: { revalidate: 60 } });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPost(params.slug);
  if (!post) return { title: "Article non trouvé" };
  return {
    title: post.meta_title || post.title,
    description: post.meta_description || post.excerpt,
    alternates: post.canonical_url ? { canonical: post.canonical_url } : undefined,
    openGraph: {
      title: post.meta_title || post.title,
      description: post.meta_description || post.excerpt,
      images: post.cover_image ? [post.cover_image] : undefined,
      type: "article",
      publishedTime: post.published_at,
    },
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  if (!post) notFound();

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* JSON-LD structured data */}
      {post.structured_data && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(post.structured_data) }}
        />
      )}

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-violet-600 rounded-lg flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-lg">SEO Alert Scan</span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm text-gray-500 font-medium">
            <Link href="/#features" className="hover:text-gray-900 transition-colors">Fonctionnalités</Link>
            <Link href="/#pricing" className="hover:text-gray-900 transition-colors">Tarifs</Link>
            <Link href="/blog" className="hover:text-gray-900 transition-colors">Blog</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/connexion" className="text-sm text-gray-600 hover:text-gray-900 font-medium px-4 py-2 hidden sm:block">
              Connexion
            </Link>
            <Link href="/inscription" className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
              Essai gratuit
            </Link>
          </div>
        </div>
      </nav>

      {/* Article */}
      <article className="pt-24 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {post.tags.map(tag => (
                <Link key={tag} href={`/blog?tag=${encodeURIComponent(tag)}`}
                  className="text-xs bg-blue-50 text-blue-600 font-medium px-3 py-1 rounded-full hover:bg-blue-100 transition-colors">
                  {tag}
                </Link>
              ))}
            </div>
          )}

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 leading-tight tracking-tight">
            {post.title}
          </h1>

          {/* Meta */}
          <div className="flex items-center gap-4 text-sm text-gray-400 mb-8 pb-8 border-b border-gray-100">
            {post.author && <span>Par <strong className="text-gray-600">{post.author}</strong></span>}
            {post.published_at && (
              <span>
                {new Date(post.published_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            )}
          </div>

          {/* Cover image */}
          {post.cover_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.cover_image} alt={post.title}
              className="w-full rounded-2xl mb-8 shadow-sm object-cover max-h-96" />
          )}

          {/* Excerpt */}
          {post.excerpt && (
            <p className="text-lg text-gray-500 leading-relaxed mb-8 font-medium border-l-4 border-blue-200 pl-4">
              {post.excerpt}
            </p>
          )}

          {/* Content */}
          <div
            className="prose prose-gray max-w-none prose-headings:font-bold prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />

          {/* Back link */}
          <div className="mt-12 pt-8 border-t border-gray-100">
            <Link href="/blog" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              ← Retour au blog
            </Link>
          </div>
        </div>
      </article>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-gray-100">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-violet-600 rounded-lg flex items-center justify-center">
              <BarChart2 className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-700">SEO Alert Scan</span>
          </div>
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} SEO Alert Scan. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
