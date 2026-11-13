import { Link } from 'react-router';
import { stripMarkdown } from '../utils/stripMarkdown';

interface AlbumInfo {
  id: number;
  name: string;
  description: string | null;
  _count?: {
    photoAssignments: number;
  };
}

interface AssociatedAlbumsProps {
  albums?: AlbumInfo[];
  tripId: number;
  title?: string;
}

export default function AssociatedAlbums({ albums, tripId, title = 'Associated Albums' }: AssociatedAlbumsProps) {
  if (!albums || albums.length === 0) {
    return null;
  }

  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-dusk-300 mb-2">
        {title}
      </h4>
      <div className="space-y-2">
        {albums.map((album) => (
          <Link
            key={album.id}
            to={`/trips/${tripId}/albums/${album.id}`}
            className="block p-3 bg-white dark:bg-dusk-800 hover:bg-gray-100 dark:hover:bg-dusk-600 rounded-lg transition-colors border border-gray-200 dark:border-dusk-600"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 dark:text-white truncate">
                  {album.name}
                </div>
                {album.description && (
                  <div className="text-sm text-gray-600 dark:text-dusk-400 truncate">
                    {stripMarkdown(album.description)}
                  </div>
                )}
              </div>
              <div className="ml-3 text-sm text-gray-500 dark:text-dusk-400">
                {album._count?.photoAssignments || 0} photos
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
