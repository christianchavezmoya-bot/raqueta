import ClubPublicPageClient from './ClubPublicPageClient';

export default async function ClubPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ClubPublicPageClient slug={slug} />;
}
