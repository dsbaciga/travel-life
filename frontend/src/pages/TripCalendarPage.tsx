import PageHeader from '../components/PageHeader';
import TripCalendarWidget from '../components/widgets/TripCalendarWidget';

/** Every trip laid out on a calendar. Reached from Library. */
export default function TripCalendarPage() {
  return (
    <div className="min-h-screen bg-cream dark:bg-navy-900">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
        <PageHeader
          title="Trip calendar"
          subtitle="When you have travelled and when you will"
          backLink={{ label: '← Library', href: '/library' }}
        />
        <TripCalendarWidget />
      </div>
    </div>
  );
}
