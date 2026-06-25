import ClubPublicPageClient from './ClubPublicPageClient';

export default function ClubPublicPage({ params }: { params: { slug: string } }) {
  return <ClubPublicPageClient slug={params.slug} />;
}