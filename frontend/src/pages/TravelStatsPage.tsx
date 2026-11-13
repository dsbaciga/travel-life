import PageHeader from '../components/PageHeader';
import TravelStatsWidget from '../components/widgets/TravelStatsWidget';

/** Lifetime travel statistics. Reached from Library. */
export default function TravelStatsPage() {
  return (
    <div className="min-h-screen bg-cream dark:bg-navy-900">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
        <PageHeader
          title="Travel stats"
          subtitle="Totals across all of your trips"
          backLink={{ label: '← Library', href: '/library' }}
        />
        <TravelStatsWidget />
      </div>
    </div>
  );
}
