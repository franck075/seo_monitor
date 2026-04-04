import Link from "next/link";
import { BarChart2 } from "lucide-react";

interface BlogPost {
  slug: string;
  title: string;
  excerpt?: string;
  cover_image?: string;
  published_at?: string;
  tags?: string[];
  author?: string;
}

async function getPosts(): Promise<BlogPost[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const res = await fetch(`${baseUrl}/api/v1/blog`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export const metadata = {
  title: "Blog — SEO Alert Scan",
  description: "Conseils, actualités et ressources SEO pour protéger et faire croître votre trafic organique.",
};

export default async function BlogListPage() {
  const posts = await getPosts();

  return (
    <div className="min-h-screen bg-white font-sans">
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
            <Link href="/blog" className="text-gray-900 font-semibold">Blog</Link>
            <Link href="/#faq" className="hover:text-gray-900 transition-colors">FAQ</Link>
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

      {/* Hero */}
      <section className="pt-32 pb-12 px-6 bg-gradient-to-b from-blue-50/50 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">
            Blog SEO
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Conseils, stratégies et actualités pour maîtriser votre référencement naturel.
          </p>
        </div>
      </section>

      {/* Posts grid */}
      <section className="py-12 px-6">
        <div className="max-w-5xl mx-auto">
          {!posts.length ? (
            <div className="text-center py-24">
              <p className="text-gray-400 text-lg">Aucun article publié pour l&apos;instant.</p>
              <p className="text-gray-300 text-sm mt-2">Revenez bientôt !</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post) => (
                <Link key={post.slug} href={`/blog/${post.slug}`}
                  className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
                  {post.cover_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.cover_image} alt={post.title}
                      className="w-full h-48 object-cover" />
                  ) : (
                    <div className="w-full h-48 bg-gradient-to-br from-blue-50 to-violet-50 flex items-center justify-center">
                      <BarChart2 className="w-10 h-10 text-blue-200" />
                    </div>
                  )}
                  <div className="p-5 flex-1 flex flex-col">
                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {post.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="text-xs bg-blue-50 text-blue-600 font-medium px-2 py-0.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                    )}
                    <h2 className="font-bold text-gray-900 text-base mb-2 group-hover:text-blue-600 transition-colors leading-snug">
                      {post.title}
                    </h2>
                    {post.excerpt && (
                      <p className="text-sm text-gray-500 leading-relaxed flex-1 line-clamp-3">{post.excerpt}</p>
                    )}
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-50">
                      {post.author && <span className="text-xs text-gray-400">{post.author}</span>}
                      {post.published_at && (
                        <span className="text-xs text-gray-400 ml-auto">
                          {new Date(post.published_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-gray-100 mt-12">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-violet-600 rounded-lg flex items-center justify-center">
              <BarChart2 className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-700">SEO Alert Scan</span>
          </div>
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} SEO Alert Scan. Tous droits réservés.</p>
          <div className="flex gap-6 text-xs text-gray-400">
            <Link href="/#features" className="hover:text-gray-600">Fonctionnalités</Link>
            <Link href="/#pricing" className="hover:text-gray-600">Tarifs</Link>
            <Link href="/blog" className="hover:text-gray-600">Blog</Link>
            <Link href="/connexion" className="hover:text-gray-600">Connexion</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
