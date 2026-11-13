import { useEffect, useState } from "react";
import { LIBRARY_BACK_LINK } from "../components/LibraryBackLink";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import foodLogService from "../services/foodLog.service";
import { FOOD_RATINGS } from "../types/foodLog";
import { ratingStars } from "../utils/foodLog";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import FoodLogPhotoStrip from "../components/FoodLogPhotoStrip";
import { ListItemSkeleton } from "../components/SkeletonLoader";

const SEARCH_DEBOUNCE_MS = 300;

/** Best meals across all trips: filter by minimum rating, order-again and text. */
export default function FoodLogPage() {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [orderAgainOnly, setOrderAgainOnly] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(text), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["food-log", "search", { q, minRating, orderAgainOnly }],
    queryFn: () =>
      foodLogService.search({
        q,
        minRating: minRating || undefined,
        orderAgain: orderAgainOnly ? true : undefined,
      }),
  });

  return (
    <div className="min-h-screen bg-cream dark:bg-navy-900">
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
      <PageHeader
        title="Best Meals"
        subtitle="Every dish you have rated across your trips"
        backLink={LIBRARY_BACK_LINK}
      />

      <div className="card mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-3">
          <label className="label" htmlFor="food-search">Search</label>
          <input
            id="food-search"
            className="input w-full"
            placeholder="Dish, restaurant or note"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="food-min-rating">Minimum rating</label>
          <select
            id="food-min-rating"
            className="input w-full"
            value={minRating}
            onChange={(e) => setMinRating(Number(e.target.value))}
          >
            <option value={0}>Any</option>
            {FOOD_RATINGS.map((r) => (
              <option key={r} value={r}>{r}+ {ratingStars(r)}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium sm:mt-7">
          <input
            type="checkbox"
            checked={orderAgainOnly}
            onChange={(e) => setOrderAgainOnly(e.target.checked)}
          />
          Order again only
        </label>
      </div>

      {isLoading ? (
        <ListItemSkeleton />
      ) : entries.length === 0 ? (
        <EmptyState
          icon="🍽️"
          message="No meals found"
          subMessage="Log dishes from the Food Log tab of a trip"
        />
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="card">
              <p className="font-semibold text-gray-900 dark:text-white">
                {entry.dish}
                {entry.orderAgain && (
                  <span className="ml-2 text-xs text-green-600 dark:text-green-400">Order again</span>
                )}
              </p>
              <p className="text-amber-500" aria-label={`${entry.rating} out of 5`}>
                {ratingStars(entry.rating)}
              </p>
              <p className="text-sm text-gray-600 dark:text-dusk-400">
                {entry.restaurantName} ·{" "}
                <Link
                  to={`/trips/${entry.trip.id}?tab=food-log`}
                  className="text-primary-600 dark:text-gold hover:underline"
                >
                  {entry.trip.title}
                </Link>
              </p>
              {entry.notes && (
                <p className="text-sm text-gray-500 dark:text-dusk-400">{entry.notes}</p>
              )}
              <FoodLogPhotoStrip photos={entry.photos} label={entry.dish} />
            </li>
          ))}
        </ul>
      )}
    </div>
    </div>
  );
}
